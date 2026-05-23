import {
  formatMissingArgsError,
  missingRequiredArgs,
  readNumberOption,
  readOption,
} from "../cli";
import { selectBenchmarkCase } from "../scenarios/manifest";
import { getScenarioSite } from "../sites";
import { createCaptureStore } from "./captureStore";

const requiredArgs = ["site", "difficulty", "port"];
const args = Bun.argv.slice(2);
const missing = missingRequiredArgs(args, requiredArgs);

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

const site = readOption(args, "site");
const difficulty = readOption(args, "difficulty");
const seed = readNumberOption(args, "seed");
const caseId = readOption(args, "case-id") ?? readOption(args, "caseId");
const port = readNumberOption(args, "port");

if (site === undefined || difficulty === undefined || port === undefined) {
  console.error("Invalid site, difficulty, or port argument.");
  process.exit(1);
}

if (caseId === undefined && seed === undefined) {
  console.error("bench:serve requires either --seed or --case-id.");
  process.exit(1);
}

const benchmarkCase = selectBenchmarkCase({ site, difficulty, seed, caseId });

if (benchmarkCase === undefined) {
  console.error(
    `No benchmark case found for site=${site}, difficulty=${difficulty}, seed=${seed ?? "n/a"}, caseId=${caseId ?? "n/a"}.`,
  );
  process.exit(1);
}

const scenarioSite = getScenarioSite(benchmarkCase.site);

if (scenarioSite === undefined) {
  console.error(
    `No benchmark site implementation found for ${benchmarkCase.site}.`,
  );
  process.exit(1);
}

const capture = createCaptureStore();
capture.reset();

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "POST") {
      const form = await request.formData();
      const fields: Record<string, string | string[]> = {};

      for (const key of new Set([...form.keys()])) {
        const values = form.getAll(key).map(String);
        fields[key] = values.length === 1 ? values[0] : values;
      }

      capture.add({
        timestamp: new Date().toISOString(),
        route: url.pathname,
        method: request.method,
        fields,
      });
    }

    const response = await scenarioSite.render({
      case: benchmarkCase,
      url,
      capture,
    });

    return new Response(
      typeof response.body === "string"
        ? response.body
        : JSON.stringify(response.body),
      {
        status: response.status ?? 200,
        headers: response.headers,
      },
    );
  },
});

console.log(`Serving ${benchmarkCase.id} at http://localhost:${server.port}/`);
