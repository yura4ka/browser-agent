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

function pageNavigation(ctx: RenderContext, backHref: string): string {
  return `<nav class="stack">
    ${link(ctx, { href: backHref, label: "Go back" })}
    ${link(ctx, { href: "/", label: "Back to Home" })}
  </nav>`;
}

function renderEntry(ctx: RenderContext): string {
  const variant = getInformationRetrievalVariant(ctx.seed);
  const routeLabel =
    ctx.difficulty === "easy" ? "Project directory" : "Operations workspace";

  return `<main class="stack">
  <h1>Benchmark Preview</h1>
  <p>Goal: find and report the release code for Project ${escapeHtml(variant.project)}.</p>
  <p>The correct code is listed in the active release packet, not in archived notes or status summaries.</p>
  <nav class="stack">
    ${link(ctx, { href: "/workspace", label: routeLabel, id: "workspace-link" })}
    ${link(ctx, { href: "/archive", label: "Archive index", id: "archive-link" })}
    ${link(ctx, { href: "/status", label: "Status board", id: "status-link" })}
  </nav>
  ${pageNavigation(ctx, "/")}
  <div data-delay-reveal hidden class="interaction-row"><span class="spinner" aria-hidden="true"></span><span>Index loaded</span></div>
</main>`;
}

function renderWorkspace(ctx: RenderContext): string {
  const variant = getInformationRetrievalVariant(ctx.seed);
  const distractors = getProjectDistractors(ctx.seed);
  const rows = [
    ...distractors.slice(0, 4).map((project, index) => ({
      href: index % 2 === 0 ? "/archive" : "/status",
      label: `${project.division}: Project ${project.project}`,
    })),
    {
      href: "/divisions/active",
      label: `${variant.division}: active release queue`,
    },
    ...distractors.slice(4).map((project) => ({
      href: "/projects/summary",
      label: `${project.division}: Project ${project.project} summary`,
    })),
  ];

  return `<main class="stack">
  <h1>Operations Workspace</h1>
  <p>Choose the division queue that owns Project ${escapeHtml(variant.project)}.</p>
  <ul>
    ${rows
      .map(
        (row, index) =>
          `<li>${link(ctx, { href: row.href, label: row.label, id: `workspace-link-${index}` })}</li>`,
      )
      .join("")}
  </ul>
  ${validationMessage({ id: "workspace-hint", message: `Project ${variant.project} belongs to ${variant.division}.`, hidden: ctx.difficulty !== "easy" })}
  ${pageNavigation(ctx, "/")}
</main>`;
}

function renderActiveDivision(ctx: RenderContext): string {
  const variant = getInformationRetrievalVariant(ctx.seed);
  const distractors = getProjectDistractors(ctx.seed);
  const projectRows = [
    ...distractors.slice(0, 3).map((project) => ({
      href: "/projects/summary",
      label: `Project ${project.project} - latest status note`,
    })),
    {
      href: "/projects/target/releases",
      label: `Project ${variant.project} - release packets`,
    },
    ...distractors.slice(3, 6).map((project) => ({
      href: "/archive",
      label: `Project ${project.project} - archived packet`,
    })),
  ];

  return `<main class="stack">
  <h1>${escapeHtml(variant.division)} Queue</h1>
  <p>Release codes are stored in project release packets. Status notes contain stale or partial references.</p>
  <ul>
    ${projectRows
      .map(
        (row, index) =>
          `<li>${link(ctx, { href: row.href, label: row.label, id: `project-row-${index}` })}</li>`,
      )
      .join("")}
  </ul>
  ${pageNavigation(ctx, "/workspace")}
</main>`;
}

function renderReleasePackets(ctx: RenderContext): string {
  const variant = getInformationRetrievalVariant(ctx.seed);
  const distractors = getProjectDistractors(ctx.seed);
  const rows = [
    {
      href: "/projects/target/releases/retired",
      label: `${variant.releaseTrain} retired note`,
      text: `Legacy candidate ${distractors[0]?.code ?? "LEGACY-000"}`,
    },
    {
      href: "/projects/target/releases/current",
      label: `${variant.releaseTrain} active packet`,
      text: "Current release packet",
    },
    {
      href: "/projects/summary",
      label: "Cross-project status digest",
      text: `Digest mentions ${distractors[1]?.code ?? "DIGEST-000"}`,
    },
  ];

  return `<main class="stack">
  <h1>Release Packets for Project ${escapeHtml(variant.project)}</h1>
  <p>Use the active packet for the final answer.</p>
  <ul>
    ${rows
      .map(
        (row, index) =>
          `<li>${link(ctx, { href: row.href, label: row.label, id: `packet-${index}` })}<p>${escapeHtml(row.text)}</p></li>`,
      )
      .join("")}
  </ul>
  ${pageNavigation(ctx, "/divisions/active")}
</main>`;
}

function renderTargetProject(ctx: RenderContext): string {
  const variant = getInformationRetrievalVariant(ctx.seed);
  const distractors = getProjectDistractors(ctx.seed);
  const codeLabel =
    ctx.difficulty === "hard" ? "Deployment reference" : "Release code";

  return `<main class="stack">
  <h1>Active Packet: Project ${escapeHtml(variant.project)}</h1>
  <p>Release train: ${escapeHtml(variant.releaseTrain)}</p>
  <p>Do not use retired packet references such as ${escapeHtml(distractors[0]?.code ?? "RETired-000")}.</p>
  <p>${codeLabel}: <strong>${escapeHtml(variant.code)}</strong></p>
  <form method="post" action="/capture" class="stack">
    <input type="hidden" name="releaseCode" value="${escapeHtml(variant.code)}">
    ${button(ctx, { label: "Record viewed code", type: "submit", id: "record-code" })}
  </form>
  ${pageNavigation(ctx, "/projects/target/releases")}
</main>`;
}

function renderRetiredPacket(ctx: RenderContext): string {
  const distractor = getProjectDistractors(ctx.seed)[0];

  return `<main class="stack">
  <h1>Retired Packet</h1>
  <p>This page is retained for audit history only.</p>
  <p>Retired reference: <strong>${escapeHtml(distractor?.code ?? "RETIRED-000")}</strong></p>
  <p>${link(ctx, { href: "/projects/target/releases", label: "Back to release packets" })}</p>
  ${pageNavigation(ctx, "/projects/target/releases")}
</main>`;
}

function renderProjectSummary(ctx: RenderContext): string {
  const distractors = getProjectDistractors(ctx.seed);

  return `<main class="stack">
  <h1>Cross-Project Status Digest</h1>
  <p>Status digests mention codes from unrelated projects and are not release packets.</p>
  <ul>
    ${distractors
      .map(
        (project) =>
          `<li>${escapeHtml(project.project)} status marker: ${escapeHtml(project.code)}</li>`,
      )
      .join("")}
  </ul>
  <p>${link(ctx, { href: "/workspace", label: "Back to workspace" })}</p>
  ${pageNavigation(ctx, "/workspace")}
</main>`;
}

function renderArchive(ctx: RenderContext): string {
  const distractors = getProjectDistractors(ctx.seed);

  return `<main class="stack">
  <h1>Archive</h1>
  <p>Archived release codes are plausible distractors and should not be used for the active project answer.</p>
  <ul>
    ${distractors
      .map(
        (project) =>
          `<li>${escapeHtml(project.division)} archive: Project ${escapeHtml(project.project)} used ${escapeHtml(project.code)}</li>`,
      )
      .join("")}
  </ul>
  <a href="/">Back to entry</a>
  ${pageNavigation(ctx, "/")}
</main>`;
}

function renderStatus(ctx: RenderContext): string {
  const variant = getInformationRetrievalVariant(ctx.seed);
  const distractors = getProjectDistractors(ctx.seed);

  return `<main class="stack">
  <h1>Status Board</h1>
  <p>Project ${escapeHtml(variant.project)} is active in ${escapeHtml(variant.division)}, but the status board intentionally omits the final release code.</p>
  <p>Nearby status references: ${distractors
    .slice(0, 3)
    .map((project) => escapeHtml(project.code))
    .join(", ")}.</p>
  <p>${link(ctx, { href: "/workspace", label: "Open workspace" })}</p>
  ${pageNavigation(ctx, "/")}
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
        `<main><p>Interaction captured.</p>${pageNavigation(ctx, "/projects/target/releases/current")}</main>`,
        ctx,
      );
    }

    if (path === "/workspace") {
      return htmlResponse("Workspace", renderWorkspace(ctx), ctx);
    }

    if (path === "/divisions/active") {
      return htmlResponse("Active Division", renderActiveDivision(ctx), ctx);
    }

    if (path === "/projects/target/releases") {
      return htmlResponse("Release Packets", renderReleasePackets(ctx), ctx);
    }

    if (path === "/projects/target/releases/current") {
      return htmlResponse(
        "Current Release Packet",
        renderTargetProject(ctx),
        ctx,
      );
    }

    if (path === "/projects/target/releases/retired") {
      return htmlResponse(
        "Retired Release Packet",
        renderRetiredPacket(ctx),
        ctx,
      );
    }

    if (path === "/projects/summary") {
      return htmlResponse("Project Summary", renderProjectSummary(ctx), ctx);
    }

    if (path === "/archive") {
      return htmlResponse("Archive", renderArchive(ctx), ctx);
    }

    if (path === "/status") {
      return htmlResponse("Status", renderStatus(ctx), ctx);
    }

    if (path === "/") {
      return htmlResponse(context.case.title, renderEntry(ctx), ctx);
    }

    return notFoundResponse();
  },
};
