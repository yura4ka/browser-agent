import {
  getInformationRetrievalVariant,
  getProjectDistractors,
} from "../scenarios/variants";
import {
  button,
  escapeHtml,
  link,
  type RenderContext,
  validationMessage,
} from "../server/renderKit";
import type { ScenarioSite } from "../server/types";
import { contextFromCase, htmlResponse, notFoundResponse } from "./shared";

function renderEntry(ctx: RenderContext): string {
  const variant = getInformationRetrievalVariant(ctx.seed);
  const routeLabel =
    ctx.difficulty === "easy" ? "Project index" : "Operations notes";

  return `<main class="stack">
  <h1>Benchmark Preview</h1>
  <p>Goal: find and report the release code for Project ${escapeHtml(variant.project)}.</p>
  <nav class="stack">
    ${link(ctx, { href: "/projects", label: routeLabel, id: "project-link" })}
    ${link(ctx, { href: "/archive", label: "Archive distractors", id: "archive-link" })}
  </nav>
  <div data-delay-reveal hidden class="interaction-row"><span class="spinner" aria-hidden="true"></span><span>Index loaded</span></div>
</main>`;
}

function renderProjects(ctx: RenderContext): string {
  const variant = getInformationRetrievalVariant(ctx.seed);
  const detailsLink = link(ctx, {
    href: "/projects/target",
    label: `Project ${variant.project} details`,
    id: "target-details-link",
  });
  const distractorCodes = getProjectDistractors(ctx.seed);
  const distractors =
    ctx.difficulty === "easy"
      ? ""
      : distractorCodes
          .slice(0, 2)
          .map(
            (code, index) =>
              `<li>Project ${index + 1} archive: ${escapeHtml(code)}</li>`,
          )
          .join("");

  return `<main class="stack">
  <h1>Projects</h1>
  <ul>
    <li>${detailsLink}</li>
    ${distractors}
  </ul>
  ${validationMessage({ id: "hint", message: "Use the project detail page for the release code.", hidden: ctx.difficulty === "hard" })}
</main>`;
}

function renderTargetProject(ctx: RenderContext): string {
  const variant = getInformationRetrievalVariant(ctx.seed);
  const codeLabel =
    ctx.difficulty === "hard" ? "Deployment reference" : "Release code";

  return `<main class="stack">
  <h1>Project ${escapeHtml(variant.project)}</h1>
  <p>${codeLabel}: <strong>${escapeHtml(variant.code)}</strong></p>
  <form method="post" action="/capture" class="stack">
    <input type="hidden" name="releaseCode" value="${escapeHtml(variant.code)}">
    ${button(ctx, { label: "Record viewed code", type: "submit", id: "record-code" })}
  </form>
</main>`;
}

function renderArchive(): string {
  return `<main class="stack">
  <h1>Archive</h1>
  <p>Distractor release code: ARCHIVE-000</p>
  <a href="/">Back to entry</a>
</main>`;
}

export const informationRetrievalSite: ScenarioSite = {
  site: "information-retrieval",
  async render(context) {
    const ctx = contextFromCase(context.case);
    const path = context.url.pathname;

    if (
      context.url.pathname === "/capture" &&
      context.url.searchParams.get("format") === "json"
    ) {
      return {
        headers: { "content-type": "application/json" },
        body: { interactions: context.capture.list() },
      };
    }

    if (path === "/capture") {
      return htmlResponse(
        "Captured",
        '<main><p>Interaction captured.</p><a href="/">Back to entry</a></main>',
        ctx,
      );
    }

    if (path === "/projects") {
      return htmlResponse("Projects", renderProjects(ctx), ctx);
    }

    if (path === "/projects/target") {
      return htmlResponse("Project Details", renderTargetProject(ctx), ctx);
    }

    if (path === "/archive") {
      return htmlResponse("Archive", renderArchive(), ctx);
    }

    if (path === "/") {
      return htmlResponse(context.case.title, renderEntry(ctx), ctx);
    }

    return notFoundResponse();
  },
};
