import { type BenchmarkCase, BenchmarkManifestSchema } from "../schemas";
import {
  difficulties,
  getComplexFormVariant,
  getInformationRetrievalVariant,
  getLongContextVariant,
  supportedSeeds,
} from "./variants";

function informationRetrievalCases() {
  return difficulties.flatMap((difficulty) =>
    supportedSeeds.map((seed) => {
      const variant = getInformationRetrievalVariant(seed);

      return {
        id: `information-retrieval-${difficulty}-${seed}`,
        site: "information-retrieval" as const,
        title: "Find the release code",
        description: `Navigate the ${difficulty} information retrieval site to find the requested release code.`,
        difficulty,
        seed,
        goal: `Find the release code value for Project ${variant.project}. Return only the release code exactly as shown, with no added prefix or label.`,
        scoring: [
          {
            id: "release-code",
            type: "exact" as const,
            label: "Release code",
            expected: variant.code,
            points: 1,
          },
        ],
      };
    }),
  );
}

function longContextCases() {
  return difficulties.flatMap((difficulty) =>
    supportedSeeds.map((seed) => {
      const variant = getLongContextVariant(seed);

      return {
        id: `long-context-${difficulty}-${seed}`,
        site: "long-context" as const,
        title: "Answer the operations brief questions",
        description: `Read the ${difficulty} long operations brief and answer three factual questions.`,
        difficulty,
        seed,
        goal: "Answer: harbor inspection window, sensor threshold, and backup operator.",
        scoring: [
          {
            id: "harbor-window",
            type: "contains-all" as const,
            label: "Harbor inspection window",
            expected: [variant.harborWindow],
            points: 1,
          },
          {
            id: "sensor-threshold",
            type: "contains-all" as const,
            label: "Sensor threshold",
            expected: [variant.sensorThreshold],
            points: 1,
          },
          {
            id: "backup-operator",
            type: "contains-all" as const,
            label: "Backup operator",
            expected: [variant.backupOperator],
            points: 1,
          },
        ],
      };
    }),
  );
}

function complexFormCases() {
  return difficulties.flatMap((difficulty) =>
    supportedSeeds.map((seed) => {
      const variant = getComplexFormVariant(seed);

      return {
        id: `complex-form-${difficulty}-${seed}`,
        site: "complex-form" as const,
        title: "Submit the dispatch request",
        description: `Complete the ${difficulty} dispatch request form with the target values.`,
        difficulty,
        seed,
        goal: `Submit contact ${variant.contactName}, email ${variant.contactEmail}, ${variant.incidentType} incident, ${variant.priority} priority, ${variant.regionLabel.toLowerCase()} region, ${variant.responseWindow} response window, ${variant.notifyBy} notification, access code ${variant.accessCode}, confirmed checklist, acknowledged service level, and final review confirmation.`,
        scoring: [
          {
            id: "dispatch-request",
            type: "form-submission" as const,
            label: "Dispatch request payload",
            expectedFields: {
              contactName: variant.contactName,
              contactEmail: variant.contactEmail,
              accessCode: variant.accessCode,
              incidentType: variant.incidentType,
              priority: variant.priority,
              region: variant.region,
              responseWindow: variant.responseWindow,
              notifyBy: variant.notifyBy,
              confirmChecklist: "on",
              acknowledgeSla: "on",
              finalConfirm: "on",
            },
            points: 10,
          },
        ],
      };
    }),
  );
}

export const benchmarkManifest = BenchmarkManifestSchema.parse({
  version: 1,
  cases: [
    ...informationRetrievalCases(),
    ...longContextCases(),
    ...complexFormCases(),
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
