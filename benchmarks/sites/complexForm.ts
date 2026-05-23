import {
  button,
  checkbox,
  type RenderContext,
  radioGroup,
  select,
  textInput,
  validationMessage,
} from "../server/renderKit";
import type { ScenarioSite } from "../server/types";
import { contextFromCase, htmlResponse, notFoundResponse } from "./shared";

function renderEntry(ctx: RenderContext): string {
  const intro =
    ctx.difficulty === "easy"
      ? "Use the labels beside each field."
      : "Complete the dispatch request using the target values in the instructions.";

  return `<main class="stack">
  <h1>Dispatch Request</h1>
  <p>${intro}</p>
  <p>Target values: contact Avery Stone, urgent priority, north harbor region, and confirmed checklist.</p>
  <form method="post" action="/submit" class="stack">
    ${textInput(ctx, { name: "contactName", label: "Contact name", required: true })}
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
      values: [
        { value: "south-yard", label: "South Yard" },
        { value: "north-harbor", label: "North Harbor" },
      ],
    })}
    ${checkbox(ctx, { name: "confirmChecklist", label: "Checklist confirmed" })}
    ${validationMessage({ id: "form-error", message: "All target fields are required.", hidden: ctx.difficulty === "easy" })}
    <div data-delay-reveal hidden class="interaction-row"><span class="spinner" aria-hidden="true"></span><span>Validation ready</span></div>
    ${button(ctx, { label: "Submit dispatch request", type: "submit", id: "submit-dispatch" })}
  </form>
</main>`;
}

function renderSuccess(): string {
  return `<main class="stack">
  <h1>Dispatch Request Submitted</h1>
  <p>Submission captured for scoring.</p>
  <section role="dialog" aria-modal="true"><h2>Confirmation</h2><p>Final success state reached.</p></section>
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

    if (context.url.pathname === "/") {
      return htmlResponse(context.case.title, renderEntry(ctx), ctx);
    }

    return notFoundResponse();
  },
};
