import {
  getIncidentActionOptions,
  getIncidentImpactOptions,
  getIncidentRcaVariant,
  getIncidentRootCauseOptions,
  getIncidentServiceOptions,
  getIncidentSeverityOptions,
} from "../scenarios/variants";
import {
  button,
  checkbox,
  escapeHtml,
  link,
  type RenderContext,
  select,
  textInput,
  validationMessage,
} from "../server/renderKit";
import type { CapturedInteraction, ScenarioSite } from "../server/types";
import { contextFromCase, htmlResponse, notFoundResponse } from "./shared";

type CapturedFields = Record<string, string | string[]>;

const services = [
  "Checkout API",
  "Search Indexer",
  "Billing API",
  "Identity Gateway",
  "Notification Worker",
  "Object Store Proxy",
];

function incidentNavigation(ctx: RenderContext, backHref: string): string {
  return `<nav class="stack">
    ${link(ctx, { href: backHref, label: "Back" })}
    ${link(ctx, { href: "/", label: "Incident home" })}
  </nav>`;
}

function renderEntry(ctx: RenderContext): string {
  const variant = getIncidentRcaVariant(ctx.seed);
  const workspaceLabel =
    ctx.difficulty === "easy" ? "Open incident workspace" : "Open command room";

  return `<main class="stack">
  <h1>Enterprise Support Incident RCA</h1>
  <section>
    <h2>Assignment</h2>
    <p>Complete the root-cause analysis for <strong>${escapeHtml(variant.incidentId)}</strong>, reported by ${escapeHtml(variant.customerName)}.</p>
    <p>The answer requires the final diagnosis, customer ticket impact, deployment notes, and the current incident runbook. Early hypotheses and stale owner notes are distractors.</p>
  </section>
  <nav class="stack">
    ${link(ctx, { href: "/workspace", label: workspaceLabel, id: "workspace-link" })}
    ${link(ctx, { href: "/runbook", label: "Incident runbook", id: "runbook-link" })}
    ${link(ctx, { href: "/archive", label: "Prior incident archive", id: "archive-link" })}
  </nav>
  <div data-delay-reveal hidden class="interaction-row"><span class="spinner" aria-hidden="true"></span><span>Incident records indexed</span></div>
</main>`;
}

function renderWorkspace(ctx: RenderContext): string {
  const variant = getIncidentRcaVariant(ctx.seed);

  return `<main class="stack">
  <h1>Incident Command Workspace</h1>
  <p>Incident ${escapeHtml(variant.incidentId)} has a long event history. Use the final diagnosis checkpoint rather than early hypotheses.</p>
  <section>
    <h2>Workspace panes</h2>
    <ul>
      <li>${link(ctx, { href: "/timeline", label: "Timeline and diagnosis", id: "timeline-link" })}</li>
      <li>${link(ctx, { href: "/tickets", label: "Customer ticket excerpts", id: "tickets-link" })}</li>
      <li>${link(ctx, { href: "/deployments", label: "Deployment and service evidence", id: "deployments-link" })}</li>
      <li>${link(ctx, { href: "/runbook", label: "Current incident runbook", id: "workspace-runbook-link" })}</li>
      <li>${link(ctx, { href: "/postmortem", label: "Open RCA submission form", id: "postmortem-link" })}</li>
    </ul>
  </section>
  <section>
    <h2>Current status</h2>
    <p>Mitigation is complete. The postmortem still needs exact timestamps, affected service, root cause code, severity, impact category, owner, and corrective action.</p>
  </section>
  ${incidentNavigation(ctx, "/")}
</main>`;
}

function renderTimelineNoise(ctx: RenderContext): string {
  const variant = getIncidentRcaVariant(ctx.seed);

  return Array.from({ length: 72 }, (_, index) => {
    const entry = index + 1;
    const service = services[(index + ctx.seed) % services.length];
    const minute = String((entry * 7) % 60).padStart(2, "0");
    const falseLead =
      index % 9 === 0
        ? ` Early hypothesis mentioned ${variant.falseLead}, but later diagnostics did not confirm it.`
        : "";
    const staleOwner =
      index % 17 === 0
        ? ` A stale handoff note listed ${variant.staleOwner}; this was replaced by the final owner checkpoint.`
        : "";

    return `<section>
      <h2>Timeline entry ${entry}: ${escapeHtml(service)} observation</h2>
      <p>Time marker 2026-05-${String(10 + (index % 12)).padStart(2, "0")} ${String(8 + (index % 10)).padStart(2, "0")}:${minute} UTC. Routine metric, paging, customer support, and deployment observations were copied into this incident stream.</p>
      <p>Most entries are context for triage and do not define the final RCA fields.${escapeHtml(falseLead)}${escapeHtml(staleOwner)}</p>
      <p>Checklist reference ${entry}-A covered dashboards, ${entry}-B covered support tags, and ${entry}-C covered rollback readiness.</p>
    </section>`;
  }).join("");
}

function renderTimeline(ctx: RenderContext): string {
  const variant = getIncidentRcaVariant(ctx.seed);
  const easyGuide =
    ctx.difficulty === "easy"
      ? `<aside><h2>Reading guide</h2><p>Use the section titled Final RCA checkpoint for timestamps, service, root cause, and owner. Use tickets for impact and runbook for severity and corrective action.</p></aside>`
      : "";

  return `<main class="stack">
  <h1>Incident Timeline and Diagnosis</h1>
  <p>Incident under review: <strong>${escapeHtml(variant.incidentId)}</strong>.</p>
  ${easyGuide}
  <section>
    <h2>Initial hypothesis board</h2>
    <p>Early responders suspected ${escapeHtml(variant.falseLead)}. This hypothesis remained in the timeline but was later rejected.</p>
  </section>
  ${renderTimelineNoise(ctx)}
  <section id="final-rca-checkpoint">
    <h2>Final RCA checkpoint</h2>
    <p>Incident id: <strong>${escapeHtml(variant.incidentId)}</strong>.</p>
    <p>Incident start time: <strong>${escapeHtml(variant.startTime)}</strong>.</p>
    <p>Mitigation completed: <strong>${escapeHtml(variant.mitigationTime)}</strong>.</p>
    <p>Affected service: <strong>${escapeHtml(variant.affectedServiceLabel)}</strong>.</p>
    <p>Validated root cause: <strong>${escapeHtml(variant.rootCauseLabel)}</strong> (${escapeHtml(variant.rootCauseCode)}).</p>
    <p>Follow-up owner: <strong>${escapeHtml(variant.followUpOwner)}</strong>.</p>
    <p>The final diagnosis supersedes notes that mention ${escapeHtml(variant.falseLead)} or owner ${escapeHtml(variant.staleOwner)}.</p>
  </section>
  <section>
    <h2>Post-diagnosis chatter</h2>
    <p>Later channel messages repeated early theories for searchability. They are intentionally placed after the final checkpoint as retention distractors.</p>
  </section>
  ${incidentNavigation(ctx, "/workspace")}
</main>`;
}

function renderTickets(ctx: RenderContext): string {
  const variant = getIncidentRcaVariant(ctx.seed);
  const ticketNoise = Array.from({ length: 28 }, (_, index) => {
    const ticketId = 6400 + index + ctx.seed * 100;
    const service = services[(index + 2) % services.length];

    return `<article>
      <h2>Support ticket SUP-${ticketId}</h2>
      <p>Customer reported intermittent behavior in ${escapeHtml(service)}. This ticket was tagged during broad incident intake and is not the target customer impact summary.</p>
      <p>Suggested queue: ${index % 3 === 0 ? "platform-watch" : "support-triage"}. Suggested severity from this ticket alone is not authoritative.</p>
    </article>`;
  }).join("");

  return `<main class="stack">
  <h1>Customer Ticket Excerpts</h1>
  <p>Review the target customer section for the impact category.</p>
  ${ticketNoise}
  <section id="target-customer-impact">
    <h2>Target customer impact: ${escapeHtml(variant.customerName)}</h2>
    <p>Customer-facing impact category: <strong>${escapeHtml(variant.customerImpactLabel)}</strong>.</p>
    <p>Impact value for the RCA form: <strong>${escapeHtml(variant.customerImpact)}</strong>.</p>
    <p>The impact was tied to ${escapeHtml(variant.affectedServiceLabel)} during the incident window.</p>
  </section>
  ${incidentNavigation(ctx, "/workspace")}
</main>`;
}

function renderDeployments(ctx: RenderContext): string {
  const variant = getIncidentRcaVariant(ctx.seed);
  const rows = [
    {
      deploymentId: "DEP-1048",
      service: "Checkout API",
      result: "rolled out after mitigation; not causal",
      rootCause: "cache warming delay",
    },
    {
      deploymentId: variant.deploymentId,
      service: variant.affectedServiceLabel,
      result: `introduced ${variant.rootCauseLabel.toLowerCase()} during the incident window`,
      rootCause: variant.rootCauseCode,
    },
    {
      deploymentId: "DEP-221I",
      service: "Search Indexer",
      result: `investigated as ${variant.falseLead}; rejected by final diagnosis`,
      rootCause: "not-causal",
    },
    {
      deploymentId: "DEP-309A",
      service: "Notification Worker",
      result: "maintenance-only change from prior incident",
      rootCause: "not-causal",
    },
  ];

  return `<main class="stack">
  <h1>Deployment and Service Evidence</h1>
  <p>The causal deployment row should match the final diagnosis checkpoint.</p>
  <table>
    <caption>Deployment candidates</caption>
    <thead><tr><th>Deployment</th><th>Service</th><th>Finding</th><th>RCA code</th></tr></thead>
    <tbody>
      ${rows
        .map(
          (row) =>
            `<tr><td>${escapeHtml(row.deploymentId)}</td><td>${escapeHtml(row.service)}</td><td>${escapeHtml(row.result)}</td><td>${escapeHtml(row.rootCause)}</td></tr>`,
        )
        .join("")}
    </tbody>
  </table>
  ${incidentNavigation(ctx, "/workspace")}
</main>`;
}

function renderRunbook(ctx: RenderContext): string {
  const variant = getIncidentRcaVariant(ctx.seed);

  return `<main class="stack">
  <h1>Current Incident Runbook</h1>
  <section>
    <h2>RCA mapping table</h2>
    <p>Use this current runbook, not prior incident archive notes, for severity and corrective action.</p>
    <table>
      <caption>Root cause to response mapping</caption>
      <thead><tr><th>Root cause code</th><th>Severity</th><th>Corrective action</th></tr></thead>
      <tbody>
        <tr><td>cache-key-regression</td><td>SEV-2</td><td>rollback-and-cache-test</td></tr>
        <tr><td>replica-lag-alert-gap</td><td>SEV-3</td><td>add-replica-lag-slo</td></tr>
        <tr><td>pool-exhaustion</td><td>SEV-2</td><td>raise-pool-cap-and-load-test</td></tr>
      </tbody>
    </table>
  </section>
  <section>
    <h2>Current mapping for ${escapeHtml(variant.rootCauseCode)}</h2>
    <p>Severity: <strong>${escapeHtml(variant.severityLabel)}</strong> (${escapeHtml(variant.severity)}).</p>
    <p>Corrective action: <strong>${escapeHtml(variant.correctiveActionLabel)}</strong> (${escapeHtml(variant.correctiveAction)}).</p>
  </section>
  <section>
    <h2>Superseded owner appendix</h2>
    <p>Archive appendix lists ${escapeHtml(variant.staleOwner)} for an older event. Do not use that owner for this incident.</p>
  </section>
  ${incidentNavigation(ctx, "/workspace")}
</main>`;
}

function fieldValue(fields: CapturedFields, name: string): string {
  const value = fields[name];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function latestFields(interactions: CapturedInteraction[]): CapturedFields {
  return interactions.at(-1)?.fields ?? {};
}

function hiddenField(fields: CapturedFields, name: string): string {
  return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(fieldValue(fields, name))}">`;
}

function renderPostmortem(ctx: RenderContext): string {
  const incidentLabel = ctx.difficulty === "hard" ? "Case key" : "Incident id";
  const rootCauseLabel =
    ctx.difficulty === "hard" ? "Causal code" : "Root cause code";

  return `<main class="stack">
  <h1>RCA Submission Form</h1>
  <p>Submit exact values from the incident timeline, tickets, deployments, and runbook.</p>
  <form method="post" action="/review" class="stack">
    ${textInput(ctx, { name: "incidentId", label: incidentLabel, required: true })}
    ${select(ctx, { name: "affectedService", label: "Affected service", values: getIncidentServiceOptions(ctx.seed) })}
    ${select(ctx, { name: "rootCauseCode", label: rootCauseLabel, values: getIncidentRootCauseOptions(ctx.seed) })}
    ${textInput(ctx, { name: "startTime", label: "Incident start time", required: true })}
    ${textInput(ctx, { name: "mitigationTime", label: "Mitigation completed", required: true })}
    ${select(ctx, { name: "severity", label: "Severity", values: getIncidentSeverityOptions(ctx.seed) })}
    ${select(ctx, { name: "customerImpact", label: "Customer impact", values: getIncidentImpactOptions(ctx.seed) })}
    ${textInput(ctx, { name: "followUpOwner", label: "Follow-up owner", required: true })}
    ${select(ctx, { name: "correctiveAction", label: "Corrective action", values: getIncidentActionOptions(ctx.seed) })}
    ${validationMessage({ id: "rca-error", message: "All RCA fields are required before review.", hidden: ctx.difficulty === "easy" })}
    ${button(ctx, { label: "Continue to RCA review", type: "submit", id: "continue-review" })}
  </form>
  ${incidentNavigation(ctx, "/workspace")}
</main>`;
}

function renderReview(
  ctx: RenderContext,
  interactions: CapturedInteraction[],
): string {
  const fields = latestFields(interactions);
  const reviewRows = [
    ["Incident id", "incidentId"],
    ["Affected service", "affectedService"],
    ["Root cause", "rootCauseCode"],
    ["Start time", "startTime"],
    ["Mitigation time", "mitigationTime"],
    ["Severity", "severity"],
    ["Customer impact", "customerImpact"],
    ["Follow-up owner", "followUpOwner"],
    ["Corrective action", "correctiveAction"],
  ];

  return `<main class="stack">
  <h1>Review RCA Submission</h1>
  <p>Submit this review to capture the RCA payload for scoring.</p>
  <dl>
    ${reviewRows
      .map(
        ([label, name]) =>
          `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(fieldValue(fields, name) || "missing")}</dd>`,
      )
      .join("")}
  </dl>
  <form method="post" action="/submit" class="stack">
    ${reviewRows.map(([, name]) => hiddenField(fields, name)).join("")}
    ${checkbox(ctx, { name: "finalConfirm", label: "Final RCA review confirmed" })}
    ${validationMessage({ id: "review-error", message: "Final RCA confirmation is required.", hidden: ctx.difficulty !== "hard" })}
    ${button(ctx, { label: "Submit RCA", type: "submit", id: "submit-rca" })}
  </form>
  <p>${link(ctx, { href: "/postmortem", label: "Return to RCA form" })}</p>
</main>`;
}

function renderSuccess(): string {
  return `<main class="stack">
  <h1>Incident RCA Submitted</h1>
  <p>Submission captured for scoring.</p>
  <section role="dialog" aria-modal="true"><h2>Confirmation</h2><p>Final RCA payload recorded.</p></section>
  <a href="/capture?format=json">View captured payload</a>
</main>`;
}

function renderArchive(ctx: RenderContext): string {
  const variant = getIncidentRcaVariant(ctx.seed);

  return `<main class="stack">
  <h1>Prior Incident Archive</h1>
  <p>Archive records are realistic distractors and should not be used for the active RCA.</p>
  <ul>
    <li>INC-2025-1842: older ${escapeHtml(variant.falseLead)} incident owned by ${escapeHtml(variant.staleOwner)}.</li>
    <li>INC-2025-7316: similar customer escalation with different service and mitigation window.</li>
    <li>INC-2024-5120: training incident with obsolete severity mapping.</li>
  </ul>
  ${incidentNavigation(ctx, "/")}
</main>`;
}

export const incidentRcaSite: ScenarioSite = {
  site: "incident-rca",
  render(context) {
    const ctx = contextFromCase(context.case);

    if (
      context.url.pathname === "/capture" &&
      context.url.searchParams.get("format") === "json"
    ) {
      return {
        headers: { "content-type": "application/json" },
        body: { interactions: context.capture.list() },
      };
    }

    if (context.url.pathname === "/submit") {
      return htmlResponse("Submitted", renderSuccess(), ctx);
    }

    if (context.url.pathname === "/review") {
      return htmlResponse(
        "Review RCA Submission",
        renderReview(ctx, context.capture.list()),
        ctx,
      );
    }

    if (context.url.pathname === "/workspace") {
      return htmlResponse(
        "Incident Command Workspace",
        renderWorkspace(ctx),
        ctx,
      );
    }

    if (context.url.pathname === "/timeline") {
      return htmlResponse("Incident Timeline", renderTimeline(ctx), ctx);
    }

    if (context.url.pathname === "/tickets") {
      return htmlResponse("Customer Tickets", renderTickets(ctx), ctx);
    }

    if (context.url.pathname === "/deployments") {
      return htmlResponse("Deployment Evidence", renderDeployments(ctx), ctx);
    }

    if (context.url.pathname === "/runbook") {
      return htmlResponse("Incident Runbook", renderRunbook(ctx), ctx);
    }

    if (context.url.pathname === "/postmortem") {
      return htmlResponse("RCA Submission Form", renderPostmortem(ctx), ctx);
    }

    if (context.url.pathname === "/archive") {
      return htmlResponse("Prior Incident Archive", renderArchive(ctx), ctx);
    }

    if (context.url.pathname === "/") {
      return htmlResponse(context.case.title, renderEntry(ctx), ctx);
    }

    return notFoundResponse();
  },
};
