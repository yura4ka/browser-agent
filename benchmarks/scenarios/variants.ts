import { seededShuffle } from "./seed";

export const supportedSeeds = [0, 1, 2] as const;
export const difficulties = ["easy", "medium", "hard"] as const;

const informationRetrievalVariants = [
  {
    project: "Heron",
    division: "Coastal Systems",
    releaseTrain: "Tidewatch Q3",
    code: "HERON-042",
    distractors: [
      { project: "Ibis", division: "Coastal Systems", code: "IBIS-219" },
      { project: "Kite", division: "Signal Lab", code: "KITE-771" },
      { project: "Loon", division: "Archive Desk", code: "LOON-184" },
      { project: "Tern", division: "Coastal Systems", code: "TERN-406" },
      { project: "Wren", division: "Field Support", code: "WREN-512" },
      { project: "Archive", division: "Records", code: "ARCHIVE-000" },
    ],
  },
  {
    project: "Orchid",
    division: "Botany Ops",
    releaseTrain: "Greenhouse Delta",
    code: "ORCHID-317",
    distractors: [
      { project: "Fern", division: "Botany Ops", code: "FERN-884" },
      { project: "Moss", division: "Canopy Lab", code: "MOSS-205" },
      { project: "Cedar", division: "Archive Desk", code: "CEDAR-706" },
      { project: "Lily", division: "Botany Ops", code: "LILY-443" },
      { project: "Violet", division: "Field Support", code: "VIOLET-092" },
      { project: "Archive", division: "Records", code: "ARCHIVE-111" },
    ],
  },
  {
    project: "Nimbus",
    division: "Atmospheric Lab",
    releaseTrain: "Circulation Seven",
    code: "NIMBUS-608",
    distractors: [
      { project: "Cirrus", division: "Atmospheric Lab", code: "CIRRUS-144" },
      { project: "Stratus", division: "Cloud Archive", code: "STRATUS-502" },
      { project: "Cumulus", division: "Archive Desk", code: "CUMULUS-839" },
      { project: "Aurora", division: "Atmospheric Lab", code: "AURORA-481" },
      { project: "Gale", division: "Field Support", code: "GALE-730" },
      { project: "Archive", division: "Records", code: "ARCHIVE-222" },
    ],
  },
];

const longContextVariants = [
  {
    harborWindow: "Tuesday 09:30 UTC",
    sensorThreshold: "18.7 psi",
    backupOperator: "Mira Sol",
    incidentId: "CW-1842",
    activeAppendix: "Appendix K-7",
    obsoleteWindow: "Tuesday 08:10 UTC",
    obsoleteThreshold: "17.1 psi",
    obsoleteOperator: "Nora Pell",
  },
  {
    harborWindow: "Thursday 14:15 UTC",
    sensorThreshold: "21.4 psi",
    backupOperator: "Noah Vale",
    incidentId: "SY-2209",
    activeAppendix: "Appendix R-3",
    obsoleteWindow: "Thursday 13:05 UTC",
    obsoleteThreshold: "20.2 psi",
    obsoleteOperator: "Lena Ort",
  },
  {
    harborWindow: "Monday 06:45 UTC",
    sensorThreshold: "16.2 psi",
    backupOperator: "Iris Chen",
    incidentId: "WD-7316",
    activeAppendix: "Appendix M-9",
    obsoleteWindow: "Monday 07:30 UTC",
    obsoleteThreshold: "15.8 psi",
    obsoleteOperator: "Theo Park",
  },
];

const formVariants = [
  {
    contactName: "Avery Stone",
    contactEmail: "avery.stone@example.test",
    incidentType: "equipment-failure",
    priority: "urgent",
    region: "north-harbor",
    regionLabel: "North Harbor",
    responseWindow: "same-shift",
    notifyBy: "radio",
    accessCode: "NH-771",
  },
  {
    contactName: "Riley Chen",
    contactEmail: "riley.chen@example.test",
    incidentType: "inventory-audit",
    priority: "routine",
    region: "south-yard",
    regionLabel: "South Yard",
    responseWindow: "next-day",
    notifyBy: "email",
    accessCode: "SY-204",
  },
  {
    contactName: "Morgan Lee",
    contactEmail: "morgan.lee@example.test",
    incidentType: "safety-review",
    priority: "urgent",
    region: "west-dock",
    regionLabel: "West Dock",
    responseWindow: "same-shift",
    notifyBy: "sms",
    accessCode: "WD-608",
  },
];

const invoiceVariants = [
  {
    invoiceNumber: "INV-2026-1048",
    vendorName: "Northstar Logistics",
    vendorId: "VEN-4182",
    poNumber: "PO-8841",
    amount: "$18,420.50",
    dueDate: "2026-06-12",
    department: "Harbor Operations",
    paymentQueue: "standard-ap",
    approver: "Dana Ruiz",
    exception: "three-way match complete",
    action: "approve",
    reasonCode: "matched-current-policy",
    policyVersion: "AP-2026.4",
    duplicateInvoice: "INV-2026-104B",
    obsoleteReasonCode: "manual-review-required",
    staleApprover: "Galen Moss",
  },
  {
    invoiceNumber: "INV-2026-2217",
    vendorName: "Blue Finch Supply",
    vendorId: "VEN-7730",
    poNumber: "PO-5120",
    amount: "$7,905.00",
    dueDate: "2026-06-18",
    department: "Field Maintenance",
    paymentQueue: "exception-ap",
    approver: "Mira Sol",
    exception: "receiving report missing",
    action: "hold",
    reasonCode: "awaiting-receipt",
    policyVersion: "AP-2026.4",
    duplicateInvoice: "INV-2026-221I",
    obsoleteReasonCode: "matched-current-policy",
    staleApprover: "Noah Vale",
  },
  {
    invoiceNumber: "INV-2026-3094",
    vendorName: "Canal Gate Electric",
    vendorId: "VEN-0956",
    poNumber: "PO-7398",
    amount: "$12,660.75",
    dueDate: "2026-06-24",
    department: "Facilities Renewal",
    paymentQueue: "exception-ap",
    approver: "Iris Chen",
    exception: "amount exceeds purchase order tolerance",
    action: "hold",
    reasonCode: "amount-tolerance-review",
    policyVersion: "AP-2026.4",
    duplicateInvoice: "INV-2026-309A",
    obsoleteReasonCode: "awaiting-receipt",
    staleApprover: "Theo Park",
  },
];

const incidentRcaVariants = [
  {
    incidentId: "INC-2026-1842",
    customerName: "Aster Freight",
    affectedService: "checkout-api",
    affectedServiceLabel: "Checkout API",
    rootCauseCode: "cache-key-regression",
    rootCauseLabel: "Cache key regression",
    startTime: "2026-05-17 09:12 UTC",
    mitigationTime: "2026-05-17 10:04 UTC",
    severity: "sev-2",
    severityLabel: "SEV-2",
    customerImpact: "checkout-errors-enterprise",
    customerImpactLabel: "Checkout errors for enterprise tenants",
    followUpOwner: "Mira Sol",
    correctiveAction: "rollback-and-cache-test",
    correctiveActionLabel: "Rollback and add cache-key regression test",
    deploymentId: "DEP-8841",
    falseLead: "payment gateway timeout",
    staleOwner: "Galen Moss",
  },
  {
    incidentId: "INC-2026-2209",
    customerName: "Blue Finch Retail",
    affectedService: "search-indexer",
    affectedServiceLabel: "Search Indexer",
    rootCauseCode: "replica-lag-alert-gap",
    rootCauseLabel: "Replica lag alert gap",
    startTime: "2026-05-18 13:20 UTC",
    mitigationTime: "2026-05-18 15:05 UTC",
    severity: "sev-3",
    severityLabel: "SEV-3",
    customerImpact: "delayed-search-results",
    customerImpactLabel: "Delayed search results for catalog updates",
    followUpOwner: "Noah Vale",
    correctiveAction: "add-replica-lag-slo",
    correctiveActionLabel: "Add replica-lag SLO and alert",
    deploymentId: "DEP-5120",
    falseLead: "cdn purge delay",
    staleOwner: "Lena Ort",
  },
  {
    incidentId: "INC-2026-7316",
    customerName: "Canal Gate Finance",
    affectedService: "billing-api",
    affectedServiceLabel: "Billing API",
    rootCauseCode: "pool-exhaustion",
    rootCauseLabel: "Connection pool exhaustion",
    startTime: "2026-05-19 14:05 UTC",
    mitigationTime: "2026-05-19 14:52 UTC",
    severity: "sev-2",
    severityLabel: "SEV-2",
    customerImpact: "invoice-download-failures",
    customerImpactLabel: "Invoice download failures for enterprise tenants",
    followUpOwner: "Iris Chen",
    correctiveAction: "raise-pool-cap-and-load-test",
    correctiveActionLabel: "Raise pool cap and add load test",
    deploymentId: "DEP-7398",
    falseLead: "object storage throttling",
    staleOwner: "Theo Park",
  },
];

export function getInformationRetrievalVariant(seed: number) {
  return informationRetrievalVariants[
    seed % informationRetrievalVariants.length
  ];
}

export function getLongContextVariant(seed: number) {
  return longContextVariants[seed % longContextVariants.length];
}

export function getComplexFormVariant(seed: number) {
  return formVariants[seed % formVariants.length];
}

export function getInvoiceReconciliationVariant(seed: number) {
  return invoiceVariants[seed % invoiceVariants.length];
}

export function getIncidentRcaVariant(seed: number) {
  return incidentRcaVariants[seed % incidentRcaVariants.length];
}

export function getProjectDistractors(seed: number) {
  return seededShuffle(getInformationRetrievalVariant(seed).distractors, seed);
}

export function getRegionOptions(seed: number) {
  const target = getComplexFormVariant(seed);
  return seededShuffle(
    [
      { value: "north-harbor", label: "North Harbor" },
      { value: "south-yard", label: "South Yard" },
      { value: "west-dock", label: "West Dock" },
    ],
    seed,
  ).map((option) =>
    option.value === target.region
      ? { ...option, label: target.regionLabel }
      : option,
  );
}

export function getIncidentTypeOptions(seed: number) {
  const target = getComplexFormVariant(seed);
  return seededShuffle(
    [
      { value: "equipment-failure", label: "Equipment failure" },
      { value: "inventory-audit", label: "Inventory audit" },
      { value: "safety-review", label: "Safety review" },
    ],
    seed + 11,
  ).map((option) =>
    option.value === target.incidentType ? { ...option } : option,
  );
}

export function getResponseWindowOptions(seed: number) {
  return seededShuffle(
    [
      { value: "same-shift", label: "Same shift" },
      { value: "next-day", label: "Next day" },
      { value: "end-of-week", label: "End of week" },
    ],
    seed + 17,
  );
}

export function getInvoiceActionOptions(seed: number) {
  return seededShuffle(
    [
      { value: "approve", label: "Approve for payment" },
      { value: "hold", label: "Place on hold" },
      { value: "reject", label: "Reject invoice" },
    ],
    seed + 23,
  );
}

export function getInvoiceReasonOptions(seed: number) {
  return seededShuffle(
    [
      { value: "matched-current-policy", label: "Matched current policy" },
      { value: "awaiting-receipt", label: "Awaiting receipt" },
      {
        value: "amount-tolerance-review",
        label: "Amount tolerance review",
      },
      { value: "manual-review-required", label: "Manual review required" },
    ],
    seed + 29,
  );
}

export function getInvoiceQueueOptions(seed: number) {
  return seededShuffle(
    [
      { value: "standard-ap", label: "Standard AP" },
      { value: "exception-ap", label: "Exception AP" },
      { value: "fraud-review", label: "Fraud review" },
    ],
    seed + 31,
  );
}

export function getIncidentServiceOptions(seed: number) {
  return seededShuffle(
    incidentRcaVariants.map((variant) => ({
      value: variant.affectedService,
      label: variant.affectedServiceLabel,
    })),
    seed + 37,
  );
}

export function getIncidentRootCauseOptions(seed: number) {
  return seededShuffle(
    [
      ...incidentRcaVariants.map((variant) => ({
        value: variant.rootCauseCode,
        label: variant.rootCauseLabel,
      })),
      { value: "gateway-timeout", label: "Gateway timeout" },
      { value: "cdn-purge-delay", label: "CDN purge delay" },
    ],
    seed + 41,
  );
}

export function getIncidentSeverityOptions(seed: number) {
  return seededShuffle(
    [
      { value: "sev-1", label: "SEV-1" },
      { value: "sev-2", label: "SEV-2" },
      { value: "sev-3", label: "SEV-3" },
    ],
    seed + 43,
  );
}

export function getIncidentImpactOptions(seed: number) {
  return seededShuffle(
    incidentRcaVariants.map((variant) => ({
      value: variant.customerImpact,
      label: variant.customerImpactLabel,
    })),
    seed + 47,
  );
}

export function getIncidentActionOptions(seed: number) {
  return seededShuffle(
    incidentRcaVariants.map((variant) => ({
      value: variant.correctiveAction,
      label: variant.correctiveActionLabel,
    })),
    seed + 53,
  );
}
