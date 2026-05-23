import { formatMissingArgsError, missingRequiredArgs } from "../cli";

const requiredArgs = ["provider", "model", "site", "difficulty", "port"];
const missing = missingRequiredArgs(Bun.argv.slice(2), requiredArgs);

if (missing.length > 0) {
  console.error(
    formatMissingArgsError(
      "bench:run",
      missing,
      "bun run bench:run --provider openrouter --model example/model --site information-retrieval --difficulty easy --seed 0 --port 3012",
    ),
  );
  process.exit(1);
}

console.error(
  "bench:run is scaffolded. Implement Phase 4 to execute benchmark runs.",
);
process.exit(1);
