# Benchmark Analysis

This directory contains lightweight tools for analyzing browser benchmark run artifacts. The core runner still executes one case per command; analysis tools operate on existing run directories under `data/benchmark-runs` or another directory passed with `--dir`.

## Run Artifacts

Each benchmark run writes one directory:

```text
data/benchmark-runs/<run-id>/
  events.jsonl
  score.json
  summary.json
  sessions/
```

Important files:

| File | Purpose |
| --- | --- |
| `summary.json` | Primary analysis input. Includes run identifiers, status, elapsed time, score, and aggregate metrics. |
| `score.json` | Scoring details, final answer when available, pass/fail, and per-check reasons. |
| `events.jsonl` | Timestamped agent events for low-level debugging and strategy analysis. |
| `sessions/` | Isolated session JSON for inspecting full turns, messages, model usage, and saved state. |

`summary.json` is usually enough for model comparisons. It includes:

| Field | Meaning |
| --- | --- |
| `runId`, `caseId`, `providerId`, `modelId` | Run and model identifiers. |
| `status` | `completed`, `failed`, `timeout`, or `aborted`. |
| `elapsedMs` | Wall-clock run duration. |
| `score.totalScore`, `score.maxScore`, `score.passed` | Score and pass/fail outcome. |
| `metrics.toolCallCount` | Total browser/tool calls. |
| `metrics.toolCallCountsByName` | Tool usage by tool name. |
| `metrics.failedToolCallCount` | Failed tool calls. |
| `metrics.navigationAttemptCount` | Navigation attempts. |
| `metrics.screenshotCount`, `metrics.htmlReadCount`, `metrics.ariaSnapshotCount` | Browser observation strategy signals. |
| `metrics.inputTokens`, `metrics.outputTokens`, `metrics.costUsd` | Usage and cost when available from sessions. |

## Common Questions

Use grouped summaries to compare:

| Question | Useful metrics |
| --- | --- |
| Which model solves the most tasks? | Success rate and mean normalized score by model. |
| Which categories are hardest? | Success rate by site and difficulty. |
| Which model is most efficient? | Median latency, total tokens, and total cost. |
| Which model uses the browser effectively? | Tool-call mix, failed tool calls, HTML/ARIA/screenshot usage. |
| How noisy are results? | Score standard deviation across repetitions and seeds. |

## TSV Aggregation

Print grouped TSV from existing runs:

```sh
bun run bench:aggregate --dir data/benchmark-runs
```

The default grouping is provider, model, site, difficulty, and seed. The report includes run count, success rate, mean normalized score, score standard deviation, median latency, token totals, and cost totals.

## JSONL Export

Write one flattened JSON row per run for Pandas or notebook workflows:

```sh
bun run bench:aggregate --dir data/benchmark-runs --jsonl data/benchmark-runs/runs.jsonl
```

Each row includes identifiers, parsed site/difficulty/seed, status, pass/fail, score fields, latency, token usage, cost, and tool-count metrics.

## Python Starter

Run the dependency-free Python starter:

```sh
python3 benchmarks/analysis/analyze.py --dir data/benchmark-runs
```

It reads `summary.json` files and prints a grouped TSV report. Use `--jsonl <path>` to also export flattened rows:

```sh
python3 benchmarks/analysis/analyze.py --dir data/benchmark-runs --jsonl /tmp/benchmark-runs.jsonl
```

The script intentionally uses only the Python standard library. For richer analysis, load the JSONL output in Pandas and compute confidence intervals or plots externally.

## Repetition Examples

Run each seed for one model and one scenario:

```sh
for seed in 0 1 2; do
  bun run bench:run \
    --provider openrouter \
    --model <model-id> \
    --site information-retrieval \
    --difficulty medium \
    --seed "$seed" \
    --port 3012
done
```

Compare two models across all difficulties for one site:

```sh
for model in <model-a> <model-b>; do
  for difficulty in easy medium hard; do
    for seed in 0 1 2; do
      bun run bench:run \
        --provider openrouter \
        --model "$model" \
        --site long-context \
        --difficulty "$difficulty" \
        --seed "$seed" \
        --port 3012
    done
  done
done
```

Keep orchestration outside `bench:run` so each run remains isolated, retryable, and easy to inspect.
