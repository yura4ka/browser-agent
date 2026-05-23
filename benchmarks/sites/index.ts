import type { BenchmarkCategory } from "../schemas";
import type { ScenarioSite } from "../server/types";
import { complexFormSite } from "./complexForm";
import { informationRetrievalSite } from "./informationRetrieval";
import { longContextSite } from "./longContext";

const sites = new Map<BenchmarkCategory, ScenarioSite>([
  [informationRetrievalSite.site, informationRetrievalSite],
  [longContextSite.site, longContextSite],
  [complexFormSite.site, complexFormSite],
]);

export function getScenarioSite(
  site: BenchmarkCategory,
): ScenarioSite | undefined {
  return sites.get(site);
}
