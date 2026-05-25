import {
  getInvoiceActionOptions,
  getInvoiceQueueOptions,
  getInvoiceReasonOptions,
  getInvoiceReconciliationVariant,
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

function portalNavigation(ctx: RenderContext, backHref: string): string {
  return `<nav class="stack">
    ${link(ctx, { href: backHref, label: "Back" })}
    ${link(ctx, { href: "/", label: "Portal home" })}
  </nav>`;
}

function renderEntry(ctx: RenderContext): string {
  const variant = getInvoiceReconciliationVariant(ctx.seed);
  const workbenchLabel =
    ctx.difficulty === "easy" ? "Open invoice workbench" : "Open AP queue";

  return `<main class="stack">
  <h1>Invoice Reconciliation Portal</h1>
  <section>
    <h2>Assigned work item</h2>
    <p>Reconcile invoice <strong>${escapeHtml(variant.invoiceNumber)}</strong> from ${escapeHtml(variant.vendorName)} for purchase order ${escapeHtml(variant.poNumber)}.</p>
    <p>Use current policy ${escapeHtml(variant.policyVersion)} and the active vendor profile. Archive notes and duplicate-looking invoice numbers are distractors.</p>
  </section>
  <section>
    <h2>Dashboard notices</h2>
    <p>Quarter-end accrual banner: do not approve invoices from inactive vendors.</p>
    <p>Search suggestions may show retired approvers and superseded reason codes.</p>
  </section>
  <nav class="stack">
    ${link(ctx, { href: "/workbench", label: workbenchLabel, id: "workbench-link" })}
    ${link(ctx, { href: "/policy", label: "Current AP policy", id: "policy-link" })}
    ${link(ctx, { href: "/archive", label: "Archive search", id: "archive-link" })}
  </nav>
  <div data-delay-reveal hidden class="interaction-row"><span class="spinner" aria-hidden="true"></span><span>Portal queues synchronized</span></div>
</main>`;
}

function renderWorkbench(ctx: RenderContext): string {
  const variant = getInvoiceReconciliationVariant(ctx.seed);
  const rows = [
    {
      href: "/invoices/summary",
      invoice: "INV-2026-104B",
      vendor: "North Star Freight",
      po: variant.poNumber,
      amount: "$18,420.50",
      status: "archived duplicate",
    },
    {
      href: "/invoices/target",
      invoice: variant.invoiceNumber,
      vendor: variant.vendorName,
      po: variant.poNumber,
      amount: variant.amount,
      status: "active reconciliation",
    },
    {
      href: "/vendors/distractor",
      invoice: "INV-2026-221I",
      vendor: "Blue Finch Supply Co.",
      po: "PO-512O",
      amount: "$7,905.00",
      status: "vendor exception",
    },
    {
      href: "/policy",
      invoice: "INV-2026-309A",
      vendor: "Canal Gate Electrical",
      po: "PO-739B",
      amount: "$12,660.75",
      status: "policy review",
    },
    {
      href: "/archive",
      invoice: variant.duplicateInvoice,
      vendor: variant.vendorName,
      po: variant.poNumber,
      amount: variant.amount,
      status: "voided archive copy",
    },
  ];

  return `<main class="stack">
  <h1>AP Workbench</h1>
  <p>Open the active invoice row. Similar invoice numbers, vendor aliases, and archive copies are shown in the same queue.</p>
  <form class="stack">
    ${textInput(ctx, { name: "search", label: "Filter invoices", value: variant.invoiceNumber })}
  </form>
  <table>
    <caption>Invoices requiring reconciliation</caption>
    <thead><tr><th>Invoice</th><th>Vendor</th><th>PO</th><th>Amount</th><th>Status</th></tr></thead>
    <tbody>
      ${rows
        .map(
          (row, index) => `<tr>
        <td>${link(ctx, { href: row.href, label: row.invoice, id: `invoice-row-${index}` })}</td>
        <td>${escapeHtml(row.vendor)}</td>
        <td>${escapeHtml(row.po)}</td>
        <td>${escapeHtml(row.amount)}</td>
        <td>${escapeHtml(row.status)}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>
  ${portalNavigation(ctx, "/")}
</main>`;
}

function renderPolicy(ctx: RenderContext): string {
  const variant = getInvoiceReconciliationVariant(ctx.seed);

  return `<main class="stack">
  <h1>Accounts Payable Policy</h1>
  <section>
    <h2>Current policy ${escapeHtml(variant.policyVersion)}</h2>
    <p>For invoices with <strong>three-way match complete</strong>, approve for payment with reason code <strong>matched-current-policy</strong> and route to Standard AP.</p>
    <p>For invoices with <strong>receiving report missing</strong>, place on hold with reason code <strong>awaiting-receipt</strong> and route to Exception AP.</p>
    <p>For invoices where the <strong>amount exceeds purchase order tolerance</strong>, place on hold with reason code <strong>amount-tolerance-review</strong> and route to Exception AP.</p>
  </section>
  <section>
    <h2>Superseded policy AP-2025.9</h2>
    <p>Old queue mapping suggested reason code ${escapeHtml(variant.obsoleteReasonCode)} and approver ${escapeHtml(variant.staleApprover)}. This section is retained for audit history only.</p>
  </section>
  <section>
    <h2>Reason code index</h2>
    <ul>
      <li>matched-current-policy: matched invoice ready for approval.</li>
      <li>awaiting-receipt: hold until receiving evidence arrives.</li>
      <li>amount-tolerance-review: hold until purchase order tolerance is reviewed.</li>
      <li>manual-review-required: retired fallback code.</li>
    </ul>
  </section>
  ${portalNavigation(ctx, "/workbench")}
</main>`;
}

function renderVendorProfile(ctx: RenderContext): string {
  const variant = getInvoiceReconciliationVariant(ctx.seed);

  return `<main class="stack">
  <h1>Vendor Profile: ${escapeHtml(variant.vendorName)}</h1>
  <dl>
    <dt>Active vendor id</dt><dd>${escapeHtml(variant.vendorId)}</dd>
    <dt>Payment status</dt><dd>Active and eligible</dd>
    <dt>Default department</dt><dd>${escapeHtml(variant.department)}</dd>
    <dt>Current approver</dt><dd>${escapeHtml(variant.approver)}</dd>
  </dl>
  <p>Duplicate monitor: ${escapeHtml(variant.duplicateInvoice)} is voided and must not be reconciled.</p>
  ${portalNavigation(ctx, "/invoices/target")}
</main>`;
}

function renderDistractorVendor(ctx: RenderContext): string {
  return `<main class="stack">
  <h1>Vendor Profile: Blue Finch Supply Co.</h1>
  <p>This profile is attached to a similarly named queue item, not the assigned invoice.</p>
  <dl><dt>Vendor id</dt><dd>VEN-7703</dd><dt>Current approver</dt><dd>Riley Chen</dd></dl>
  ${portalNavigation(ctx, "/workbench")}
</main>`;
}

function renderInvoiceDetail(ctx: RenderContext): string {
  const variant = getInvoiceReconciliationVariant(ctx.seed);
  const actionLabel = ctx.difficulty === "hard" ? "Disposition" : "Action";
  const reasonLabel = ctx.difficulty === "hard" ? "Route code" : "Reason code";
  const vendorLabel = ctx.difficulty === "hard" ? "Supplier key" : "Vendor id";

  return `<main class="stack">
  <h1>Invoice Detail ${escapeHtml(variant.invoiceNumber)}</h1>
  <section>
    <h2>Invoice evidence</h2>
    <dl>
      <dt>Invoice number</dt><dd>${escapeHtml(variant.invoiceNumber)}</dd>
      <dt>Vendor</dt><dd>${escapeHtml(variant.vendorName)}</dd>
      <dt>Purchase order</dt><dd>${escapeHtml(variant.poNumber)}</dd>
      <dt>Amount</dt><dd>${escapeHtml(variant.amount)}</dd>
      <dt>Due date</dt><dd>${escapeHtml(variant.dueDate)}</dd>
      <dt>Exception status</dt><dd>${escapeHtml(variant.exception)}</dd>
    </dl>
    <p>${link(ctx, { href: "/vendors/target", label: "Open active vendor profile", id: "vendor-profile-link" })}</p>
    <p>${link(ctx, { href: "/policy", label: "Review current AP policy", id: "detail-policy-link" })}</p>
  </section>
  <section>
    <h2>Reconciliation submission</h2>
    <p>Fill this form from the active invoice, vendor profile, and current policy. Do not copy values from archive search results.</p>
    <form method="post" action="/review" class="stack">
      ${textInput(ctx, { name: "invoiceNumber", label: "Invoice number", required: true })}
      ${textInput(ctx, { name: "vendorId", label: vendorLabel, required: true })}
      ${textInput(ctx, { name: "poNumber", label: "Purchase order", required: true })}
      ${select(ctx, { name: "action", label: actionLabel, values: getInvoiceActionOptions(ctx.seed) })}
      ${select(ctx, { name: "reasonCode", label: reasonLabel, values: getInvoiceReasonOptions(ctx.seed) })}
      ${select(ctx, { name: "paymentQueue", label: "Payment queue", values: getInvoiceQueueOptions(ctx.seed) })}
      ${textInput(ctx, { name: "approver", label: "Approver", required: true })}
      ${checkbox(ctx, { name: "confirmDuplicateReview", label: "Duplicate and archive review completed" })}
      ${checkbox(ctx, { name: "confirmPolicy", label: `Current policy ${variant.policyVersion} applied` })}
      ${validationMessage({ id: "invoice-error", message: "All reconciliation evidence and confirmations are required.", hidden: ctx.difficulty === "easy" })}
      ${button(ctx, { label: "Continue to reconciliation review", type: "submit", id: "continue-review" })}
    </form>
  </section>
  ${portalNavigation(ctx, "/workbench")}
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
    ["Invoice number", "invoiceNumber"],
    ["Vendor id", "vendorId"],
    ["Purchase order", "poNumber"],
    ["Action", "action"],
    ["Reason code", "reasonCode"],
    ["Payment queue", "paymentQueue"],
    ["Approver", "approver"],
    ["Duplicate review", "confirmDuplicateReview"],
    ["Policy confirmation", "confirmPolicy"],
  ];

  return `<main class="stack">
  <h1>Review Reconciliation</h1>
  <p>Submit this review to record the invoice decision for scoring.</p>
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
    ${checkbox(ctx, { name: "finalConfirm", label: "Final reconciliation review confirmed" })}
    ${validationMessage({ id: "review-error", message: "Final confirmation is required before submission.", hidden: ctx.difficulty !== "hard" })}
    ${button(ctx, { label: "Submit invoice reconciliation", type: "submit", id: "submit-reconciliation" })}
  </form>
  <p>${link(ctx, { href: "/invoices/target", label: "Return to invoice detail" })}</p>
</main>`;
}

function renderSuccess(): string {
  return `<main class="stack">
  <h1>Invoice Reconciliation Submitted</h1>
  <p>Submission captured for scoring.</p>
  <section role="dialog" aria-modal="true"><h2>Confirmation</h2><p>Final invoice decision recorded.</p></section>
  <a href="/capture?format=json">View captured payload</a>
</main>`;
}

function renderArchive(ctx: RenderContext): string {
  const variant = getInvoiceReconciliationVariant(ctx.seed);

  return `<main class="stack">
  <h1>Archive Search</h1>
  <p>Archived rows are retained for audit only and should not be submitted as active reconciliation evidence.</p>
  <ul>
    <li>${escapeHtml(variant.duplicateInvoice)}: voided duplicate for ${escapeHtml(variant.vendorName)} with stale reason ${escapeHtml(variant.obsoleteReasonCode)}.</li>
    <li>INV-2025-8841: prior-year accrual using approver ${escapeHtml(variant.staleApprover)}.</li>
    <li>PO-${escapeHtml(variant.poNumber.slice(-4))}-CLOSE: closed purchase order reference.</li>
  </ul>
  ${portalNavigation(ctx, "/workbench")}
</main>`;
}

function renderSummary(ctx: RenderContext): string {
  const variant = getInvoiceReconciliationVariant(ctx.seed);

  return `<main class="stack">
  <h1>Invoice Summary</h1>
  <p>This summary aggregates near matches and intentionally omits the active vendor id.</p>
  <p>Do not submit duplicate ${escapeHtml(variant.duplicateInvoice)} or reason ${escapeHtml(variant.obsoleteReasonCode)}.</p>
  ${portalNavigation(ctx, "/workbench")}
</main>`;
}

export const invoiceReconciliationSite: ScenarioSite = {
  site: "invoice-reconciliation",
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
        "Review Reconciliation",
        renderReview(ctx, context.capture.list()),
        ctx,
      );
    }

    if (context.url.pathname === "/workbench") {
      return htmlResponse("AP Workbench", renderWorkbench(ctx), ctx);
    }

    if (context.url.pathname === "/policy") {
      return htmlResponse("Accounts Payable Policy", renderPolicy(ctx), ctx);
    }

    if (context.url.pathname === "/vendors/target") {
      return htmlResponse("Vendor Profile", renderVendorProfile(ctx), ctx);
    }

    if (context.url.pathname === "/vendors/distractor") {
      return htmlResponse("Vendor Profile", renderDistractorVendor(ctx), ctx);
    }

    if (context.url.pathname === "/invoices/target") {
      return htmlResponse("Invoice Detail", renderInvoiceDetail(ctx), ctx);
    }

    if (context.url.pathname === "/invoices/summary") {
      return htmlResponse("Invoice Summary", renderSummary(ctx), ctx);
    }

    if (context.url.pathname === "/archive") {
      return htmlResponse("Archive Search", renderArchive(ctx), ctx);
    }

    if (context.url.pathname === "/") {
      return htmlResponse(context.case.title, renderEntry(ctx), ctx);
    }

    return notFoundResponse();
  },
};
