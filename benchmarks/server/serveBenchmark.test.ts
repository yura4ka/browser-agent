import { afterEach, describe, expect, test } from "bun:test";
import { selectBenchmarkCase } from "../scenarios/manifest";
import type { BenchmarkCase, BenchmarkCategory, Difficulty } from "../schemas";
import {
  type BenchmarkServerHandle,
  startBenchmarkServer,
} from "./serveBenchmark";

const handles: BenchmarkServerHandle[] = [];

function getCase(options: {
  site: BenchmarkCategory;
  difficulty: Difficulty;
  seed: number;
}): BenchmarkCase {
  const benchmarkCase = selectBenchmarkCase(options);

  if (benchmarkCase === undefined) {
    throw new Error(`Missing benchmark case for ${JSON.stringify(options)}.`);
  }

  return benchmarkCase;
}

async function startCaseServer(
  benchmarkCase: BenchmarkCase,
): Promise<BenchmarkServerHandle> {
  const handle = startBenchmarkServer({ benchmarkCase, port: 0 });
  handles.push(handle);

  return handle;
}

afterEach(() => {
  for (const handle of handles.splice(0)) {
    handle.stop();
  }
});

describe("startBenchmarkServer", () => {
  test.each([
    {
      site: "information-retrieval" as const,
      route: "/workspace",
      entryText: "Project directory",
      routeText: "Operations Workspace",
    },
    {
      site: "long-context" as const,
      route: "/brief",
      entryText: "Open operations brief",
      routeText: "Active Incident Appendix",
    },
    {
      site: "complex-form" as const,
      route: "/intake",
      entryText: "Start dispatch intake",
      routeText: "Dispatch Intake",
    },
  ])("renders entry and linked route for $site", async (scenario) => {
    const benchmarkCase = getCase({
      site: scenario.site,
      difficulty: "easy",
      seed: 0,
    });
    const handle = await startCaseServer(benchmarkCase);

    const entryResponse = await fetch(handle.entryUrl);
    expect(entryResponse.status).toBe(200);
    expect(entryResponse.headers.get("content-type")).toContain("text/html");
    expect(await entryResponse.text()).toContain(scenario.entryText);

    const routeResponse = await fetch(new URL(scenario.route, handle.entryUrl));
    expect(routeResponse.status).toBe(200);
    expect(routeResponse.headers.get("content-type")).toContain("text/html");
    expect(await routeResponse.text()).toContain(scenario.routeText);
  });

  test("returns a clear 404 page for unknown routes", async () => {
    const benchmarkCase = getCase({
      site: "information-retrieval",
      difficulty: "easy",
      seed: 0,
    });
    const handle = await startCaseServer(benchmarkCase);

    const response = await fetch(new URL("/missing", handle.entryUrl));

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Not Found");
  });
});
