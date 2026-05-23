import {
  button,
  link,
  type RenderContext,
  validationMessage,
} from "../server/renderKit";
import type { ScenarioSite } from "../server/types";
import { contextFromCase, htmlResponse, notFoundResponse } from "./shared";

function renderEntry(ctx: RenderContext): string {
  const routeLabel =
    ctx.difficulty === "easy" ? "Project index" : "Operations notes";

  return `<main class="stack">
  <h1>Benchmark Preview</h1>
  <p>Goal: find and report the release code for Project Heron.</p>
  <nav class="stack">
    ${link(ctx, { href: "/projects", label: routeLabel, id: "project-link" })}
    ${link(ctx, { href: "/archive", label: "Archive distractors", id: "archive-link" })}
  </nav>
  <div data-delay-reveal hidden class="interaction-row"><span class="spinner" aria-hidden="true"></span><span>Index loaded</span></div>
</main>`;
}

function renderProjects(ctx: RenderContext): string {
  const detailsLink = link(ctx, {
    href: "/projects/heron",
    label: "Project Heron details",
    id: "heron-details-link",
  });
  const distractors =
    ctx.difficulty === "easy"
      ? ""
      : "<li>Project Ibis: IBIS-219</li><li>Project Kite: KITE-771</li>";

  return `<main class="stack">
  <h1>Projects</h1>
  <ul>
    <li>${detailsLink}</li>
    ${distractors}
  </ul>
  ${validationMessage({ id: "hint", message: "Use the project detail page for the release code.", hidden: ctx.difficulty === "hard" })}
</main>`;
}

function renderHeron(ctx: RenderContext): string {
  const codeLabel =
    ctx.difficulty === "hard" ? "Deployment reference" : "Release code";

  return `<main class="stack">
  <h1>Project Heron</h1>
  <p>${codeLabel}: <strong>HERON-042</strong></p>
  <form method="post" action="/capture" class="stack">
    <input type="hidden" name="releaseCode" value="HERON-042">
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

    if (path === "/projects/heron") {
      return htmlResponse("Project Heron", renderHeron(ctx), ctx);
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
