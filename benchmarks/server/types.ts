import type { BenchmarkCase } from "../schemas";

export type CapturedInteraction = {
  timestamp: string;
  route: string;
  method: string;
  fields: Record<string, string | string[]>;
};

export type CaptureStore = {
  add(interaction: CapturedInteraction): void;
  list(): CapturedInteraction[];
  reset(): void;
};

export type ScenarioRenderContext = {
  case: BenchmarkCase;
  url: URL;
  capture: CaptureStore;
};

export type ScenarioResponse = {
  status?: number;
  headers?: Record<string, string>;
  body: string | object;
};

export type ScenarioSite = {
  site: BenchmarkCase["site"];
  render(
    context: ScenarioRenderContext,
  ): Promise<ScenarioResponse> | ScenarioResponse;
};
