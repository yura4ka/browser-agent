import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentEvent } from "@/agent/types";
import { AppController } from "@/app/AppController";
import { Result } from "@/core/Result";
import type { AgentSession } from "@/core/session";
import { JsonSessionStore } from "@/storage/JsonSessionStore";
import {
  formatMissingArgsError,
  missingRequiredArgs,
  readNumberOption,
  readOption,
} from "../cli";
import { selectBenchmarkCase } from "../scenarios/manifest";
import { RunnerConfigSchema, RunSummarySchema } from "../schemas";
import { startBenchmarkServer } from "../server/serveBenchmark";
import { BenchmarkConfigService } from "./BenchmarkConfigService";
import { extractFinalAssistantText, summarizeMetrics } from "./metrics";
import { type RunStatus, scoreBenchmarkCase } from "./scoring";

type ParsedCli = {
  providerId: string;
  modelId: string;
  site: string;
  difficulty: string;
  seed?: number;
  caseId?: string;
  port: number;
  timeoutMs: number;
  maxIterations?: number;
  outputDir: string;
};

type BenchmarkApp = Pick<AppController, "chat" | "init" | "selectModel">;

export type RunBenchmarkDeps = {
  createApp?: (options: {
    entryUrl: string;
    sessionStore: JsonSessionStore;
  }) => BenchmarkApp;
};

export type RunBenchmarkResult = {
  runDir: string;
  status: RunStatus;
};

function parseCli(args: string[]): ParsedCli {
  const requiredArgs = ["provider", "model", "site", "difficulty", "port"];
  const missing = missingRequiredArgs(args, requiredArgs);

  if (missing.length > 0) {
    throw new Error(
      formatMissingArgsError(
        "bench:run",
        missing,
        "bun run bench:run --provider openrouter --model example/model --site information-retrieval --difficulty easy --seed 0 --port 3012",
      ),
    );
  }

  const providerId = readOption(args, "provider");
  const modelId = readOption(args, "model");
  const site = readOption(args, "site");
  const difficulty = readOption(args, "difficulty");
  const seed = readNumberOption(args, "seed");
  const caseId = readOption(args, "case-id") ?? readOption(args, "caseId");
  const port = readNumberOption(args, "port");
  const timeoutMs = readNumberOption(args, "timeout-ms") ?? 120_000;
  const maxIterations = readNumberOption(args, "max-iterations");
  const outputDir = readOption(args, "output-dir") ?? "data/benchmark-runs";

  if (
    providerId === undefined ||
    modelId === undefined ||
    site === undefined ||
    difficulty === undefined ||
    port === undefined
  ) {
    throw new Error(
      "Invalid provider, model, site, difficulty, or port argument.",
    );
  }

  for (const value of [providerId, modelId, site, difficulty]) {
    if (value.includes(",")) {
      throw new Error(
        "bench:run executes exactly one run; matrix arguments are not supported.",
      );
    }
  }

  if (caseId === undefined && seed === undefined) {
    throw new Error("bench:run requires either --seed or --case-id.");
  }

  return {
    providerId,
    modelId,
    site,
    difficulty,
    seed,
    caseId,
    port,
    timeoutMs,
    maxIterations,
    outputDir,
  };
}

function createPrompt(entryUrl: string, goal: string): string {
  return `Open exactly this benchmark entry URL: ${entryUrl}

Do not directly open any other URL. Navigate only by interacting with the page.

Benchmark goal: ${goal}

When finished, answer with only the final result value.
Do not include prose, labels, markdown, code fences, punctuation, prefixes or explanation. Only the final result value.`;
}

function serializeEvent(options: {
  sequence: number;
  runId: string;
  caseId: string;
  providerId: string;
  modelId: string;
  event: AgentEvent;
}): string {
  return `${JSON.stringify({
    sequence: options.sequence,
    timestamp: new Date().toISOString(),
    runId: options.runId,
    caseId: options.caseId,
    providerId: options.providerId,
    modelId: options.modelId,
    type: options.event.type,
    payload: options.event,
  })}\n`;
}

export async function runBenchmark(
  args: string[],
  deps: RunBenchmarkDeps = {},
): Promise<RunBenchmarkResult> {
  const cli = parseCli(args);
  const config = RunnerConfigSchema.parse({
    providerId: cli.providerId,
    modelId: cli.modelId,
    site: cli.site,
    difficulty: cli.difficulty,
    seed: cli.seed,
    caseId: cli.caseId,
    port: cli.port,
    timeoutMs: cli.timeoutMs,
    outputDir: cli.outputDir,
  });
  const benchmarkCase = selectBenchmarkCase({
    site: config.site,
    difficulty: config.difficulty,
    seed: config.seed,
    caseId: config.caseId,
  });

  if (benchmarkCase === undefined) {
    throw new Error("No benchmark case matches the requested run.");
  }

  const runId =
    `${benchmarkCase.id}-${config.providerId}-${Date.now()}`.replaceAll(
      "/",
      "_",
    );
  const runDir = join(config.outputDir, runId);
  const sessionsDir = join(runDir, "sessions");
  const eventsPath = join(runDir, "events.jsonl");
  const scorePath = join(runDir, "score.json");
  const summaryPath = join(runDir, "summary.json");
  const startedAt = new Date();
  let status: RunStatus = "failed";
  let sequence = 0;
  const events: AgentEvent[] = [];
  const eventLogLines: string[] = [];
  const sessionStore = new JsonSessionStore(sessionsDir);
  let handle: ReturnType<typeof startBenchmarkServer> | null = null;
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), config.timeoutMs);

  await mkdir(sessionsDir, { recursive: true });

  try {
    handle = startBenchmarkServer({ benchmarkCase, port: config.port });
    await fetch(handle.entryUrl);

    const app = deps.createApp
      ? deps.createApp({ entryUrl: handle.entryUrl, sessionStore })
      : new AppController({
          config: new BenchmarkConfigService(handle.entryUrl),
          sessions: sessionStore,
        });
    await app.init();

    const selectResult = app.selectModel(config.providerId, config.modelId);
    if (Result.isErr(selectResult)) {
      throw new Error(selectResult.error.message);
    }

    const prompt = createPrompt(handle.entryUrl, benchmarkCase.goal);

    for await (const event of app.chat(prompt, abortController.signal, {
      maxIterations: cli.maxIterations,
    })) {
      events.push(event);
      eventLogLines.push(
        serializeEvent({
          sequence,
          runId,
          caseId: benchmarkCase.id,
          providerId: config.providerId,
          modelId: config.modelId,
          event,
        }),
      );
      sequence += 1;

      if (event.type === "error") {
        status = abortController.signal.aborted ? "timeout" : "failed";
      }

      if (event.type === "done") {
        status = "completed";
      }
    }

    if (abortController.signal.aborted && status !== "completed") {
      status = "timeout";
    }
  } finally {
    clearTimeout(timeout);
    handle?.stop();
    await Bun.write(eventsPath, eventLogLines.join(""));

    const sessions = await loadSessions(sessionStore);
    const score = scoreBenchmarkCase({
      runId,
      status,
      benchmarkCase,
      finalAnswer: extractFinalAssistantText(events),
      interactions: handle?.capture.list() ?? [],
    });
    await Bun.write(scorePath, `${JSON.stringify(score, null, 2)}\n`);

    const finishedAt = new Date();
    const summary = RunSummarySchema.parse({
      runId,
      caseId: benchmarkCase.id,
      providerId: config.providerId,
      modelId: config.modelId,
      status,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      elapsedMs: finishedAt.getTime() - startedAt.getTime(),
      score,
      metrics: summarizeMetrics(events, sessions),
    });

    await Bun.write(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  }

  return { runDir, status };
}

async function loadSessions(
  sessionStore: JsonSessionStore,
): Promise<AgentSession[]> {
  const summariesResult = await sessionStore.listSessions();
  if (Result.isErr(summariesResult)) return [];

  const sessions: AgentSession[] = [];
  for (const summary of summariesResult.value) {
    const sessionResult = await sessionStore.getSession(summary.id);
    if (Result.isOk(sessionResult) && sessionResult.value) {
      sessions.push(sessionResult.value);
    }
  }

  return sessions;
}

if (import.meta.main) {
  try {
    const result = await runBenchmark(Bun.argv.slice(2));
    console.log(`Benchmark run ${result.status}: ${result.runDir}`);
    if (result.status !== "completed") {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
