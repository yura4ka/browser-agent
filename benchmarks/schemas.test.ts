import { describe, expect, test } from "bun:test";

import { BenchmarkManifestSchema, RunnerConfigSchema } from "./schemas";

const validManifest = {
  version: 1,
  cases: [
    {
      id: "information-retrieval-easy-0",
      site: "information-retrieval",
      title: "Find a product code",
      description:
        "Navigate from the entry page and report the requested product code.",
      difficulty: "easy",
      seed: 0,
      goal: "Find the product code for the highlighted item.",
      scoring: [
        {
          id: "final-answer",
          type: "exact",
          label: "Final answer",
          expected: "ZX-104",
          points: 1,
        },
      ],
    },
  ],
};

describe("benchmark schemas", () => {
  test("parse valid benchmark manifests", () => {
    const parsed = BenchmarkManifestSchema.parse(validManifest);

    expect(parsed.cases[0].entryPath).toBe("/");
    expect(parsed.cases[0].tags).toEqual([]);
  });

  test("produce useful errors for invalid manifests", () => {
    const result = BenchmarkManifestSchema.safeParse({
      version: 1,
      cases: [
        {
          ...validManifest.cases[0],
          difficulty: "extreme",
          scoring: [],
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));

      expect(paths).toContain("cases.0.difficulty");
      expect(paths).toContain("cases.0.scoring");
    }
  });

  test("require seed or case id for runner config", () => {
    const result = RunnerConfigSchema.safeParse({
      providerId: "openrouter",
      modelId: "example/model",
      site: "information-retrieval",
      difficulty: "easy",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Provide either seed or caseId",
      );
    }
  });
});
