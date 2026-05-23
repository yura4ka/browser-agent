import { mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readOption } from "../cli";
import { type RunSummary, RunSummarySchema } from "../schemas";

type Group = {
  key: string;
  runs: RunSummary[];
};

type CaseParts = {
  site: string;
  difficulty: string;
  seed: string;
};

function parseCaseId(caseId: string): CaseParts {
  const match = caseId.match(/^(.*)-(easy|medium|hard)-(\d+)$/);

  if (match === null) {
    return { site: caseId, difficulty: "unknown", seed: "unknown" };
  }

  const [, site, difficulty, seed] = match;

  return {
    site: site ?? caseId,
    difficulty: difficulty ?? "unknown",
    seed: seed ?? "unknown",
  };
}

async function readSummaries(rootDir: string): Promise<RunSummary[]> {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(
    () => [],
  );
  const summaries: RunSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const file = Bun.file(join(rootDir, entry.name, "summary.json"));
    if (!(await file.exists())) continue;

    const parsed = RunSummarySchema.safeParse(await file.json());
    if (parsed.success) summaries.push(parsed.data);
  }

  return summaries;
}

function groupSummaries(summaries: RunSummary[]): Group[] {
  const groups = new Map<string, RunSummary[]>();

  for (const summary of summaries) {
    const { site, difficulty, seed } = parseCaseId(summary.caseId);
    const key = `${summary.providerId}\t${summary.modelId}\t${site}\t${difficulty}\t${seed}`;
    const values = groups.get(key) ?? [];
    values.push(summary);
    groups.set(key, values);
  }

  return Array.from(groups.entries()).map(([key, runs]) => ({ key, runs }));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function stddev(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);

  return Math.sqrt(variance);
}

function printAggregate(groups: Group[]): void {
  console.log(
    [
      "provider",
      "model",
      "site",
      "difficulty",
      "seed",
      "runs",
      "successRate",
      "meanScore",
      "scoreStddev",
      "medianLatencyMs",
      "inputTokens",
      "outputTokens",
      "costUsd",
    ].join("\t"),
  );

  for (const group of groups) {
    const [provider, model, site, difficulty, seed] = group.key.split("\t");
    const scores = group.runs.map((run) =>
      run.score ? run.score.totalScore / run.score.maxScore : 0,
    );
    const successRate =
      group.runs.filter((run) => run.score?.passed).length / group.runs.length;

    console.log(
      [
        provider,
        model,
        site,
        difficulty,
        seed,
        group.runs.length,
        successRate.toFixed(3),
        (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(
          3,
        ),
        stddev(scores).toFixed(3),
        median(group.runs.map((run) => run.elapsedMs)).toFixed(0),
        group.runs.reduce(
          (sum, run) => sum + (run.metrics.inputTokens ?? 0),
          0,
        ),
        group.runs.reduce(
          (sum, run) => sum + (run.metrics.outputTokens ?? 0),
          0,
        ),
        group.runs
          .reduce((sum, run) => sum + (run.metrics.costUsd ?? 0), 0)
          .toFixed(6),
      ].join("\t"),
    );
  }
}

function toJsonlRow(summary: RunSummary): Record<string, unknown> {
  const { site, difficulty, seed } = parseCaseId(summary.caseId);
  const normalizedScore = summary.score
    ? summary.score.totalScore / summary.score.maxScore
    : 0;

  return {
    runId: summary.runId,
    caseId: summary.caseId,
    site,
    difficulty,
    seed: seed === "unknown" ? seed : Number(seed),
    providerId: summary.providerId,
    modelId: summary.modelId,
    status: summary.status,
    passed: summary.score?.passed ?? false,
    totalScore: summary.score?.totalScore ?? 0,
    maxScore: summary.score?.maxScore ?? 0,
    normalizedScore,
    elapsedMs: summary.elapsedMs,
    toolCallCount: summary.metrics.toolCallCount,
    failedToolCallCount: summary.metrics.failedToolCallCount,
    navigationAttemptCount: summary.metrics.navigationAttemptCount,
    screenshotCount: summary.metrics.screenshotCount,
    htmlReadCount: summary.metrics.htmlReadCount,
    ariaSnapshotCount: summary.metrics.ariaSnapshotCount,
    inputTokens: summary.metrics.inputTokens ?? 0,
    outputTokens: summary.metrics.outputTokens ?? 0,
    costUsd: summary.metrics.costUsd ?? 0,
    toolCallCountsByName: summary.metrics.toolCallCountsByName,
  };
}

async function writeJsonlExport(
  summaries: RunSummary[],
  outputPath: string,
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  const lines = summaries.map((summary) => JSON.stringify(toJsonlRow(summary)));
  await Bun.write(
    outputPath,
    `${lines.join("\n")}${lines.length > 0 ? "\n" : ""}`,
  );
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const rootDir = readOption(args, "dir") ?? "data/benchmark-runs";
  const jsonlPath = readOption(args, "jsonl");
  const summaries = await readSummaries(rootDir);

  if (jsonlPath !== undefined) {
    await writeJsonlExport(summaries, jsonlPath);
  }

  printAggregate(groupSummaries(summaries));
}
