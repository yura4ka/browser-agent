import type { BenchmarkCategory } from "../schemas";
import type { ScenarioSite } from "../server/types";
import { complexFormSite } from "./complexForm";
import { incidentRcaSite } from "./incidentRca";
import { informationRetrievalSite } from "./informationRetrieval";
import { invoiceReconciliationSite } from "./invoiceReconciliation";
import { longContextSite } from "./longContext";

const sites = new Map<BenchmarkCategory, ScenarioSite>([
  [informationRetrievalSite.site, informationRetrievalSite],
  [longContextSite.site, longContextSite],
  [complexFormSite.site, complexFormSite],
  [invoiceReconciliationSite.site, invoiceReconciliationSite],
  [incidentRcaSite.site, incidentRcaSite],
]);

export function getScenarioSite(
  site: BenchmarkCategory,
): ScenarioSite | undefined {
  return sites.get(site);
}
