import type { BenchmarkCase } from "../schemas";
import { deterministicClientScript } from "../server/deterministicClient";
import { functionalCss } from "../server/functionalCss";
import { pageShell, type RenderContext } from "../server/renderKit";
import type { ScenarioResponse } from "../server/types";

export function contextFromCase(benchmarkCase: BenchmarkCase): RenderContext {
  return {
    difficulty: benchmarkCase.difficulty,
    seed: benchmarkCase.seed,
  };
}

export function htmlResponse(
  title: string,
  body: string,
  ctx: RenderContext,
): ScenarioResponse {
  return {
    headers: { "content-type": "text/html; charset=utf-8" },
    body: pageShell({
      title,
      body,
      css: functionalCss,
      script: deterministicClientScript(ctx.seed),
    }),
  };
}

export function notFoundResponse(): ScenarioResponse {
  return {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: pageShell({
      title: "Not Found",
      body: "<main><h1>Not Found</h1></main>",
      css: functionalCss,
    }),
  };
}
