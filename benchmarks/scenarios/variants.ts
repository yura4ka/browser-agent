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
