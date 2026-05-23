import { getLongContextVariant } from "../scenarios/variants";
import { escapeHtml, link, type RenderContext } from "../server/renderKit";
import type { ScenarioSite } from "../server/types";
import { contextFromCase, htmlResponse, notFoundResponse } from "./shared";

const districts = [
  "north pier",
  "south yard",
  "west dock",
  "canal gate",
  "fuel berth",
  "signal shed",
  "customs lane",
  "dry stores",
];

const fillerSections = Array.from({ length: 52 }, (_, index) => {
  const section = index + 1;
  const district = districts[index % districts.length];
  const pressure = (12 + (index % 13) * 0.7).toFixed(1);
  const operator = ["Vale", "Ort", "Kim", "Patel", "Reed", "Sol"][index % 6];

  return `<section>
    <h2>Maintenance note ${section}: ${district}</h2>
    <p>Routine berth, radio, manifest, weather, and shift handoff updates for ${district}. These notes are retained for continuity and contain local measurements that do not answer the benchmark questions.</p>
    <p>Reference pressure reading ${pressure} psi was logged for calibration lane ${section}. The shift observer was ${operator}, but this paragraph is not part of the active incident appendix.</p>
    <p>Checklist tags: mooring review ${section}-A, lantern inspection ${section}-B, and spare sensor inventory ${section}-C. Treat all checklist tags in maintenance notes as distractors.</p>
  </section>`;
}).join("");

function renderEntry(ctx: RenderContext): string {
  const label =
    ctx.difficulty === "easy"
      ? "Open operations brief"
      : "Review district packet";

  return `<main class="stack">
  <h1>Operations Brief Questions</h1>
  <p>Answer three facts from the active incident appendix: harbor inspection window, sensor threshold, and backup operator.</p>
  <p>The packet is long and includes obsolete values, maintenance logs, and archive notes.</p>
  ${link(ctx, { href: "/brief", label, id: "brief-link" })}
</main>`;
}

function renderBrief(ctx: RenderContext): string {
  const variant = getLongContextVariant(ctx.seed);
  const hardIntro =
    ctx.difficulty === "hard"
      ? "<p>Several obsolete values appear before and after the active appendix; use only the appendix marked active for the incident id in the prompt area.</p>"
      : "";
  const easyGuide =
    ctx.difficulty === "easy"
      ? `<aside><h2>Reading guide</h2><p>Skip maintenance notes and use ${escapeHtml(variant.activeAppendix)} for incident ${escapeHtml(variant.incidentId)}.</p></aside>`
      : "";
  const distractors =
    ctx.difficulty === "easy"
      ? ""
      : `<section>
    <h2>Archive correction queue</h2>
    <p>Archived harbor inspection window: ${escapeHtml(variant.obsoleteWindow)}.</p>
    <p>Archived sensor threshold: ${escapeHtml(variant.obsoleteThreshold)}.</p>
    <p>Retired backup operator: ${escapeHtml(variant.obsoleteOperator)}.</p>
    <p>These archive values are retained to test version control; they are not active.</p>
  </section>`;

  return `<main class="stack">
  <h1>District Operations Brief</h1>
  <p>Incident id under review: <strong>${escapeHtml(variant.incidentId)}</strong>.</p>
  ${hardIntro}
  ${easyGuide}
  <section>
    <h2>Superseded planning note</h2>
    <p>Earlier plan for ${escapeHtml(variant.incidentId)} used ${escapeHtml(variant.obsoleteWindow)}, ${escapeHtml(variant.obsoleteThreshold)}, and ${escapeHtml(variant.obsoleteOperator)}. This plan was replaced.</p>
  </section>
  ${fillerSections}
  <section id="active-incident">
    <h2>Active Incident Appendix - ${escapeHtml(variant.activeAppendix)}</h2>
    <p>Status: active for incident ${escapeHtml(variant.incidentId)}.</p>
    <p>The harbor inspection window is <strong>${escapeHtml(variant.harborWindow)}</strong>.</p>
    <p>The active sensor threshold is <strong>${escapeHtml(variant.sensorThreshold)}</strong>.</p>
    <p>The assigned backup operator is <strong>${escapeHtml(variant.backupOperator)}</strong>.</p>
    <p>Only these three active appendix values should be returned.</p>
  </section>
  ${distractors}
  <section>
    <h2>Postscript routing log</h2>
    <p>Routing logs repeat old values while describing who received the packet. They are intentionally placed after the appendix so the active facts must be retained rather than overwritten by later distractors.</p>
    <p>Do not answer with ${escapeHtml(variant.obsoleteWindow)}, ${escapeHtml(variant.obsoleteThreshold)}, or ${escapeHtml(variant.obsoleteOperator)}.</p>
  </section>
</main>`;
}

export const longContextSite: ScenarioSite = {
  site: "long-context",
  render(context) {
    const ctx = contextFromCase(context.case);

    if (context.url.pathname === "/brief") {
      return htmlResponse("Operations Brief", renderBrief(ctx), ctx);
    }

    if (context.url.pathname === "/") {
      return htmlResponse(context.case.title, renderEntry(ctx), ctx);
    }

    return notFoundResponse();
  },
};
