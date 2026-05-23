import { seededShuffle } from "./seed";

export const supportedSeeds = [0, 1, 2] as const;
export const difficulties = ["easy", "medium", "hard"] as const;

const informationRetrievalVariants = [
  {
    project: "Heron",
    code: "HERON-042",
    distractors: ["IBIS-219", "KITE-771", "ARCHIVE-000"],
  },
  {
    project: "Orchid",
    code: "ORCHID-317",
    distractors: ["FERN-884", "MOSS-205", "ARCHIVE-111"],
  },
  {
    project: "Nimbus",
    code: "NIMBUS-608",
    distractors: ["CIRRUS-144", "STRATUS-502", "ARCHIVE-222"],
  },
];

const longContextVariants = [
  {
    harborWindow: "Tuesday 09:30 UTC",
    sensorThreshold: "18.7 psi",
    backupOperator: "Mira Sol",
  },
  {
    harborWindow: "Thursday 14:15 UTC",
    sensorThreshold: "21.4 psi",
    backupOperator: "Noah Vale",
  },
  {
    harborWindow: "Monday 06:45 UTC",
    sensorThreshold: "16.2 psi",
    backupOperator: "Iris Chen",
  },
];

const formVariants = [
  {
    contactName: "Avery Stone",
    priority: "urgent",
    region: "north-harbor",
    regionLabel: "North Harbor",
  },
  {
    contactName: "Riley Chen",
    priority: "routine",
    region: "south-yard",
    regionLabel: "South Yard",
  },
  {
    contactName: "Morgan Lee",
    priority: "urgent",
    region: "west-dock",
    regionLabel: "West Dock",
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

export function getProjectDistractors(seed: number): string[] {
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
