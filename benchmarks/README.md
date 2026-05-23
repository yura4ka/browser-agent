# Browser Benchmark Suite

This directory contains the in-repository benchmark suite for evaluating browser agents on information retrieval, long context, and complex form tasks.

## Current Status

Phase 1 provides the foundation: directory structure, Zod schemas, package scripts, and local usage documentation. Phase 2 adds deterministic scenario serving, plain TypeScript rendering helpers, functional CSS helpers, and in-memory interaction capture. Runner execution will be implemented in a later phase.

## Categories

| Category | Goal |
| --- | --- |
| `information-retrieval` | Navigate a small site and return a specific fact. |
| `long-context` | Read longer page content and answer factual questions. |
| `complex-form` | Complete a multi-control form with validation and dynamic state. |

## Difficulties

| Difficulty | Accessibility Shape |
| --- | --- |
| `easy` | Clear labels, semantic controls, direct navigation, minimal distractors. |
| `medium` | More content, mild indirection, modals or delayed validation, moderate distractors. |
| `hard` | Degraded but fair accessibility, custom controls, less direct navigation, more distractors. |

## Rendering Policy

Benchmark pages should be generated with plain TypeScript server-side render helpers. Do not add React, JSX, hydration, or a frontend build step for initial scenarios.

CSS must be functional only. Use CSS for hide/show behavior, loading spinners, disabled/selected/error states, required interaction layout, and task-required animations. Avoid decorative styling, themes, and visual polish that could become an accidental benchmark variable.

## Manual Preview

Serve one scenario variant with:

```sh
bun run bench:serve --site information-retrieval --difficulty easy --seed 0 --port 3012
```

Then open `http://localhost:3012/` manually. Manual preview must not run the agent, create sessions, or write benchmark result artifacts.

The initial previewable cases are all combinations below with seed `0`:

| Site | Difficulty | Seed |
| --- | --- | --- |
| `information-retrieval` | `easy` | `0` |
| `information-retrieval` | `medium` | `0` |
| `information-retrieval` | `hard` | `0` |
| `long-context` | `easy` | `0` |
| `long-context` | `medium` | `0` |
| `long-context` | `hard` | `0` |
| `complex-form` | `easy` | `0` |
| `complex-form` | `medium` | `0` |
| `complex-form` | `hard` | `0` |

Captured form interactions for the active preview are available at `http://localhost:3012/capture?format=json`.

## Single Run

Execute exactly one benchmark run with:

```sh
bun run bench:run --provider openrouter --model <model-id> --site information-retrieval --difficulty easy --seed 0 --port 3012
```

The runner should write one isolated run directory under `data/benchmark-runs/`. Larger matrices and repeated experiments should invoke the single-run command repeatedly from external orchestration.

Useful optional arguments:

| Argument | Default | Purpose |
| --- | --- | --- |
| `--timeout-ms` | `120000` | Wall-clock timeout for the agent run. |
| `--max-iterations` | agent default | Optional agent iteration cap. |
| `--output-dir` | `data/benchmark-runs` | Parent directory for isolated run artifacts. |

The runner injects a benchmark-only config where `allowedUrls` contains exactly the selected entry URL, starts the selected site in-process, and stores sessions under `<run-dir>/sessions` instead of normal `data/sessions`.

## Output Files

Planned run artifacts include:

| File | Purpose |
| --- | --- |
| `events.jsonl` | Timestamped agent and runner events for one run. |
| `summary.json` | Run status, identifiers, elapsed time, and aggregate metrics. |
| `score.json` | Total score, max score, pass/fail, and per-check results. |
| `sessions/` | Isolated benchmark session storage for the run. |

`score.json` is produced for completed and failed runs. Failed, timed-out, or aborted answer-based runs record missing final answers explicitly instead of omitting score data.

Supported scoring strategies are exact normalized match, contains-all, regex, composite, and form-submission payload matching.

`summary.json` includes event counts, tool call counts by tool name, failed tool call count, navigation attempts, screenshot usage, HTML/ARIA usage, token usage, and cost when session usage is available.

## Development Checks

Run the repository checks before finishing benchmark work:

```sh
bunx tsc --noEmit
bun run check:write
bun run check
```
