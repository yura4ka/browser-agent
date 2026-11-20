import {
  getComplexFormVariant,
  getIncidentTypeOptions,
  getRegionOptions,
  getResponseWindowOptions,
} from "../scenarios/variants";
import {
  button,
  checkbox,
  escapeHtml,
  link,
  type RenderContext,
  radioGroup,
  select,
  textInput,
  validationMessage,
} from "../server/renderKit";
import type { CapturedInteraction, ScenarioSite } from "../server/types";
import { contextFromCase, htmlResponse, notFoundResponse } from "./shared";

type CapturedFields = Record<string, string | string[]>;

function renderEntry(ctx: RenderContext): string {
  const variant = getComplexFormVariant(ctx.seed);
  const intro =
    ctx.difficulty === "easy"
      ? "Use the labels beside each field and review before final submission."
      : "Complete the dispatch request through the intake and review steps using the target values below.";

  return `<main class="stack">
  <h1>Dispatch Request</h1>
  <p>${intro}</p>
  <section>
    <h2>Target dispatch values</h2>
    <ul>
      <li>Contact: ${escapeHtml(variant.contactName)}</li>
      <li>Email: ${escapeHtml(variant.contactEmail)}</li>
      <li>Incident type: ${escapeHtml(variant.incidentType)}</li>
      <li>Priority: ${escapeHtml(variant.priority)}</li>
      <li>Region: ${escapeHtml(variant.regionLabel)}</li>
      <li>Response window: ${escapeHtml(variant.responseWindow)}</li>
      <li>Notify by: ${escapeHtml(variant.notifyBy)}</li>
      <li>Access code: ${escapeHtml(variant.accessCode)}</li>
      <li>Confirm checklist and acknowledge service level.</li>
    </ul>
  </section>
  ${link(ctx, { href: "/intake", label: "Start dispatch intake", id: "start-intake" })}
</main>`;
}

function renderIntake(ctx: RenderContext): string {
  const variant = getComplexFormVariant(ctx.seed);

  return `<main class="stack">
  <h1>Dispatch Intake</h1>
  <p>Fill every required value, then continue to review. The review step is required before final submission.</p>
  <form method="post" action="/review" class="stack">
    <section class="stack">
      <h2>Contact</h2>
      ${textInput(ctx, { name: "contactName", label: "Contact name", required: true })}
      ${textInput(ctx, { name: "contactEmail", label: "Contact email", required: true })}
      ${textInput(ctx, { name: "accessCode", label: ctx.difficulty === "hard" ? "Gate token" : "Access code", required: true })}
    </section>
    <section class="stack">
      <h2>Incident</h2>
      ${select(ctx, {
        name: "incidentType",
        label: ctx.difficulty === "hard" ? "Work class" : "Incident type",
        values: getIncidentTypeOptions(ctx.seed),
      })}
      ${radioGroup(ctx, {
        name: "priority",
        legend: "Priority",
        values: [
          { value: "routine", label: "Routine" },
          { value: "urgent", label: "Urgent" },
        ],
      })}
      ${select(ctx, {
        name: "region",
        label: ctx.difficulty === "hard" ? "Zone" : "Region",
        values: getRegionOptions(ctx.seed),
      })}
      ${select(ctx, {
        name: "responseWindow",
        label: "Response window",
        values: getResponseWindowOptions(ctx.seed),
      })}
    </section>
    <section class="stack">
      <h2>Notifications and checks</h2>
      ${radioGroup(ctx, {
        name: "notifyBy",
        legend: "Notify by",
        values: [
          { value: "radio", label: "Radio" },
          { value: "email", label: "Email" },
          { value: "sms", label: "SMS" },
        ],
      })}
      ${checkbox(ctx, { name: "confirmChecklist", label: "Checklist confirmed" })}
      ${checkbox(ctx, { name: "acknowledgeSla", label: "Service level acknowledged" })}
    </section>
    ${validationMessage({ id: "form-error", message: "All target fields are required before review.", hidden: ctx.difficulty === "easy" })}
    <div data-delay-reveal hidden class="interaction-row"><span class="spinner" aria-hidden="true"></span><span>Validation ready for ${escapeHtml(variant.regionLabel)}</span></div>
    ${button(ctx, { label: "Continue to review", type: "submit", id: "continue-review" })}
  </form>
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

function renderReview(
  ctx: RenderContext,
  interactions: CapturedInteraction[],
): string {
  const fields = latestFields(interactions);
  const reviewRows = [
    ["Contact name", "contactName"],
    ["Contact email", "contactEmail"],
    ["Access code", "accessCode"],
    ["Incident type", "incidentType"],
    ["Priority", "priority"],
    ["Region", "region"],
    ["Response window", "responseWindow"],
    ["Notify by", "notifyBy"],
    ["Checklist", "confirmChecklist"],
    ["Service level", "acknowledgeSla"],
  ];

  return `<main class="stack">
  <h1>Review Dispatch Request</h1>
  <p>Review the captured intake values. Submit from this screen to complete the benchmark task.</p>
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
    ${checkbox(ctx, { name: "finalConfirm", label: "Final review confirmed" })}
    ${validationMessage({ id: "review-error", message: "Final review confirmation is required.", hidden: ctx.difficulty !== "hard" })}
    ${button(ctx, { label: "Submit final dispatch request", type: "submit", id: "submit-dispatch" })}
  </form>
  <p>${link(ctx, { href: "/intake", label: "Return to intake" })}</p>
</main>`;
}

function renderSuccess(): string {
  return `<main class="stack">
  <h1>Dispatch Request Submitted</h1>
  <p>Submission captured for scoring.</p>
  <section role="dialog" aria-modal="true"><h2>Confirmation</h2><p>Final success state reached after intake and review.</p></section>
  <a href="/capture?format=json">View captured payload</a>
</main>`;
}

export const complexFormSite: ScenarioSite = {
  site: "complex-form",
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
        "Review Dispatch Request",
        renderReview(ctx, context.capture.list()),
        ctx,
      );
    }

    if (context.url.pathname === "/intake") {
      return htmlResponse("Dispatch Intake", renderIntake(ctx), ctx);
    }

    if (context.url.pathname === "/") {
      return htmlResponse(context.case.title, renderEntry(ctx), ctx);
    }

    return notFoundResponse();
  },
};
