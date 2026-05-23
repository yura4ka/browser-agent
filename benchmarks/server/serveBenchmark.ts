import { formatMissingArgsError, missingRequiredArgs } from "../cli";

const requiredArgs = ["site", "difficulty", "port"];
const missing = missingRequiredArgs(Bun.argv.slice(2), requiredArgs);

if (missing.length > 0) {
  console.error(
    formatMissingArgsError(
      "bench:serve",
      missing,
      "bun run bench:serve --site information-retrieval --difficulty easy --seed 0 --port 3012",
    ),
  );
  process.exit(1);
}

console.error(
  "bench:serve is scaffolded. Implement Phase 2 to serve benchmark scenarios.",
);
process.exit(1);
