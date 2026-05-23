import type { BenchmarkCategory } from "../schemas";
import type { ScenarioSite } from "../server/types";
import { informationRetrievalSite } from "./informationRetrieval";

const sites = new Map<BenchmarkCategory, ScenarioSite>([
  [informationRetrievalSite.site, informationRetrievalSite],
]);

export function getScenarioSite(
  site: BenchmarkCategory,
): ScenarioSite | undefined {
  return sites.get(site);
}
