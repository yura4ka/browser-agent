import { type BenchmarkCase, BenchmarkManifestSchema } from "../schemas";

export const benchmarkManifest = BenchmarkManifestSchema.parse({
  version: 1,
  cases: [
    {
      id: "information-retrieval-easy-0",
      site: "information-retrieval",
      title: "Find the release code",
      description:
        "Navigate from the entry page to find the requested release code.",
      difficulty: "easy",
      seed: 0,
      goal: "Find and report the release code for Project Heron.",
      scoring: [
        {
          id: "release-code",
          type: "exact",
          label: "Release code",
          expected: "HERON-042",
          points: 1,
        },
      ],
    },
    {
      id: "information-retrieval-medium-0",
      site: "information-retrieval",
      title: "Find the release code",
      description:
        "Navigate through a less direct page to find the requested release code.",
      difficulty: "medium",
      seed: 0,
      goal: "Find and report the release code for Project Heron.",
      scoring: [
        {
          id: "release-code",
          type: "exact",
          label: "Release code",
          expected: "HERON-042",
          points: 1,
        },
      ],
    },
    {
      id: "information-retrieval-hard-0",
      site: "information-retrieval",
      title: "Find the release code",
      description:
        "Navigate a degraded but fair page to find the requested release code.",
      difficulty: "hard",
      seed: 0,
      goal: "Find and report the release code for Project Heron.",
      scoring: [
        {
          id: "release-code",
          type: "exact",
          label: "Release code",
          expected: "HERON-042",
          points: 1,
        },
      ],
    },
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
