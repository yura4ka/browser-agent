import { type BenchmarkCase, BenchmarkManifestSchema } from "../schemas";

const releaseCodeScore = {
  id: "release-code",
  type: "exact" as const,
  label: "Release code",
  expected: "HERON-042",
  points: 1,
};

const longContextScores = [
  {
    id: "harbor-window",
    type: "exact" as const,
    label: "Harbor inspection window",
    expected: "Tuesday 09:30 UTC",
    points: 1,
  },
  {
    id: "sensor-threshold",
    type: "exact" as const,
    label: "Sensor threshold",
    expected: "18.7 psi",
    points: 1,
  },
  {
    id: "backup-operator",
    type: "exact" as const,
    label: "Backup operator",
    expected: "Mira Sol",
    points: 1,
  },
];

const formScore = {
  id: "dispatch-request",
  type: "form-submission" as const,
  label: "Dispatch request payload",
  expectedFields: {
    contactName: "Avery Stone",
    priority: "urgent",
    region: "north-harbor",
    confirmChecklist: "on",
  },
  points: 4,
};

export const benchmarkManifest = BenchmarkManifestSchema.parse({
  version: 1,
  cases: [
    ...(["easy", "medium", "hard"] as const).map((difficulty) => ({
      id: `information-retrieval-${difficulty}-0`,
      site: "information-retrieval" as const,
      title: "Find the release code",
      description: `Navigate the ${difficulty} information retrieval site to find the requested release code.`,
      difficulty,
      seed: 0,
      goal: "Find and report the release code for Project Heron.",
      scoring: [releaseCodeScore],
    })),
    ...(["easy", "medium", "hard"] as const).map((difficulty) => ({
      id: `long-context-${difficulty}-0`,
      site: "long-context" as const,
      title: "Answer the operations brief questions",
      description: `Read the ${difficulty} long operations brief and answer three factual questions.`,
      difficulty,
      seed: 0,
      goal: "Answer: harbor inspection window, sensor threshold, and backup operator.",
      scoring: longContextScores,
    })),
    ...(["easy", "medium", "hard"] as const).map((difficulty) => ({
      id: `complex-form-${difficulty}-0`,
      site: "complex-form" as const,
      title: "Submit the dispatch request",
      description: `Complete the ${difficulty} dispatch request form with the target values.`,
      difficulty,
      seed: 0,
      goal: "Submit contact Avery Stone, urgent priority, north harbor region, and confirmed checklist.",
      scoring: [formScore],
    })),
  ],
});

export function selectBenchmarkCase(options: {
  site: string;
  difficulty: string;
  seed?: number;
  caseId?: string;
}): BenchmarkCase | undefined {
  return benchmarkManifest.cases.find((benchmarkCase) => {
    if (options.caseId !== undefined) {
      return benchmarkCase.id === options.caseId;
    }

    return (
      benchmarkCase.site === options.site &&
      benchmarkCase.difficulty === options.difficulty &&
      benchmarkCase.seed === options.seed
    );
  });
}
