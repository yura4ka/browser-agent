# Browser Benchmark Suite

This directory contains the in-repository benchmark suite for evaluating browser agents on information retrieval, long context, and complex form tasks.

## Current Status

Phase 1 provides the foundation: directory structure, Zod schemas, package scripts, and local usage documentation. Scenario serving and runner execution are scaffolded and will be implemented in later phases.

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

Once Phase 2 is implemented, serve one scenario variant with:

```sh
bun run bench:serve --site information-retrieval --difficulty easy --seed 0 --port 3012
```

Then open `http://localhost:3012/` manually. Manual preview must not run the agent, create sessions, or write benchmark result artifacts.

## Single Run

Once Phase 4 is implemented, execute exactly one benchmark run with:

```sh
bun run bench:run --provider openrouter --model <model-id> --site information-retrieval --difficulty easy --seed 0 --port 3012
```

The runner should write one isolated run directory under `data/benchmark-runs/`. Larger matrices and repeated experiments should invoke the single-run command repeatedly from external orchestration.

## Output Files

Planned run artifacts include:

| File | Purpose |
| --- | --- |
| `events.jsonl` | Timestamped agent and runner events for one run. |
| `summary.json` | Run status, identifiers, elapsed time, and aggregate metrics. |
| `score.json` | Total score, max score, pass/fail, and per-check results. |
| `sessions/` | Isolated benchmark session storage for the run. |

## Development Checks

Run the repository checks before finishing benchmark work:

```sh
bunx tsc --noEmit
bun run check:write
bun run check
```
