import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readOption } from "../cli";
import { type RunSummary, RunSummarySchema } from "../schemas";

type Group = {
  key: string;
  runs: RunSummary[];
};

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
    const [site, difficulty, seed] = summary.caseId
      .split("-")
      .slice(0, -1)
      .join("-")
      .match(/^(.*)-(easy|medium|hard)$/)
      ?.slice(1) ?? [summary.caseId, "unknown"];
    const normalizedSeed = summary.caseId.split("-").at(-1) ?? "unknown";
    const key = `${summary.providerId}\t${summary.modelId}\t${site}\t${difficulty}\t${seed ?? normalizedSeed}`;
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

if (import.meta.main) {
  const rootDir = readOption(Bun.argv.slice(2), "dir") ?? "data/benchmark-runs";
  const summaries = await readSummaries(rootDir);
  printAggregate(groupSummaries(summaries));
}
