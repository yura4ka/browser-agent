import { link, type RenderContext } from "../server/renderKit";
import type { ScenarioSite } from "../server/types";
import { contextFromCase, htmlResponse, notFoundResponse } from "./shared";

const fillerSections = Array.from({ length: 18 }, (_, index) => {
  const section = index + 1;
  return `<section><h2>Maintenance note ${section}</h2><p>Routine berth, radio, manifest, and weather updates for district ${section}. The values in this paragraph are operational distractors and do not answer the benchmark questions.</p></section>`;
}).join("");

function renderEntry(ctx: RenderContext): string {
  const label =
    ctx.difficulty === "easy"
      ? "Open operations brief"
      : "Review district packet";

  return `<main class="stack">
  <h1>Operations Brief Questions</h1>
  <p>Answer three facts: harbor inspection window, sensor threshold, and backup operator.</p>
  ${link(ctx, { href: "/brief", label, id: "brief-link" })}
</main>`;
}

function renderBrief(ctx: RenderContext): string {
  const hardIntro =
    ctx.difficulty === "hard"
      ? "<p>Several obsolete values appear below; use only the active incident appendix.</p>"
      : "";
  const distractors =
    ctx.difficulty === "easy"
      ? ""
      : "<p>Archived sensor threshold: 12.2 psi. Retired backup operator: Lena Ort.</p>";

  return `<main class="stack">
  <h1>District Operations Brief</h1>
  ${hardIntro}
  ${fillerSections}
  <section id="active-incident">
    <h2>Active Incident Appendix</h2>
    <p>The harbor inspection window is <strong>Tuesday 09:30 UTC</strong>.</p>
    <p>The active sensor threshold is <strong>18.7 psi</strong>.</p>
    <p>The assigned backup operator is <strong>Mira Sol</strong>.</p>
  </section>
  ${distractors}
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
