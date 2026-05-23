import {
  formatMissingArgsError,
  missingRequiredArgs,
  readNumberOption,
  readOption,
} from "../cli";
import { selectBenchmarkCase } from "../scenarios/manifest";
import type { BenchmarkCase } from "../schemas";
import { getScenarioSite } from "../sites";
import { createCaptureStore } from "./captureStore";
import type { CaptureStore } from "./types";

export type BenchmarkServerHandle = {
  server: ReturnType<typeof Bun.serve>;
  benchmarkCase: BenchmarkCase;
  capture: CaptureStore;
  entryUrl: string;
  stop(): void;
};

export function startBenchmarkServer(options: {
  benchmarkCase: BenchmarkCase;
  port: number;
}): BenchmarkServerHandle {
  const scenarioSite = getScenarioSite(options.benchmarkCase.site);

  if (scenarioSite === undefined) {
    throw new Error(
      `No benchmark site implementation found for ${options.benchmarkCase.site}.`,
    );
  }

  const capture = createCaptureStore();
  capture.reset();

  const server = Bun.serve({
    port: options.port,
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
        case: options.benchmarkCase,
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

  return {
    server,
    benchmarkCase: options.benchmarkCase,
    capture,
    entryUrl: `http://localhost:${server.port}/`,
    stop() {
      server.stop(true);
    },
  };
}

function parseCliCase(args: string[]): {
  benchmarkCase: BenchmarkCase;
  port: number;
} {
  const requiredArgs = ["site", "difficulty", "port"];
  const missing = missingRequiredArgs(args, requiredArgs);

  if (missing.length > 0) {
    throw new Error(
      formatMissingArgsError(
        "bench:serve",
        missing,
        "bun run bench:serve --site information-retrieval --difficulty easy --seed 0 --port 3012",
      ),
    );
  }

  const site = readOption(args, "site");
  const difficulty = readOption(args, "difficulty");
  const seed = readNumberOption(args, "seed");
  const caseId = readOption(args, "case-id") ?? readOption(args, "caseId");
  const port = readNumberOption(args, "port");

  if (site === undefined || difficulty === undefined || port === undefined) {
    throw new Error("Invalid site, difficulty, or port argument.");
  }

  if (caseId === undefined && seed === undefined) {
    throw new Error("bench:serve requires either --seed or --case-id.");
  }

  const benchmarkCase = selectBenchmarkCase({ site, difficulty, seed, caseId });

  if (benchmarkCase === undefined) {
    throw new Error(
      `No benchmark case found for site=${site}, difficulty=${difficulty}, seed=${seed ?? "n/a"}, caseId=${caseId ?? "n/a"}.`,
    );
  }

  return { benchmarkCase, port };
}

if (import.meta.main) {
  try {
    const { benchmarkCase, port } = parseCliCase(Bun.argv.slice(2));
    const handle = startBenchmarkServer({ benchmarkCase, port });

    console.log(`Serving ${benchmarkCase.id} at ${handle.entryUrl}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
