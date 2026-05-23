import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "@/agent/types";
import { Result } from "@/core/Result";
import { selectBenchmarkCase } from "../scenarios/manifest";
import { RunSummarySchema, ScoreOutputSchema } from "../schemas";
import { runBenchmark } from "./runBenchmark";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "browser-benchmark-run-"));
  tempDirs.push(dir);

  return dir;
}

function getExpectedAnswer(): string {
  const benchmarkCase = selectBenchmarkCase({
    site: "information-retrieval",
    difficulty: "easy",
    seed: 0,
  });
  const score = benchmarkCase?.scoring[0];

  if (score?.type !== "exact") {
    throw new Error(
      "Expected information retrieval case to use exact scoring.",
    );
  }

  return score.expected;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("runBenchmark", () => {
  test("writes completed artifacts with an injected app", async () => {
    const outputDir = await createTempDir();
    const finalAnswer = getExpectedAnswer();
    const result = await runBenchmark(
      [
        "--provider",
        "mock-provider",
        "--model",
        "mock-model",
        "--site",
        "information-retrieval",
        "--difficulty",
        "easy",
        "--seed",
        "0",
        "--port",
        "0",
        "--output-dir",
        outputDir,
      ],
      {
        createApp: () => ({
          init: async () => undefined,
          selectModel: () => Result.Ok(undefined),
          chat: async function* (): AsyncGenerator<AgentEvent> {
            yield { type: "assistant-text", text: finalAnswer };
            yield { type: "done" };
          },
        }),
      },
    );

    expect(result.status).toBe("completed");

    const score = ScoreOutputSchema.parse(
      JSON.parse(await readFile(join(result.runDir, "score.json"), "utf-8")),
    );
    const summary = RunSummarySchema.parse(
      JSON.parse(await readFile(join(result.runDir, "summary.json"), "utf-8")),
    );
    const events = await readFile(join(result.runDir, "events.jsonl"), "utf-8");

    expect(score.passed).toBe(true);
    expect(summary.status).toBe("completed");
    expect(summary.score?.passed).toBe(true);
    expect(events).toContain('"type":"assistant-text"');
    expect(events).toContain('"type":"done"');
  });
});
