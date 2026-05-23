import { describe, expect, test } from "bun:test";
import { benchmarkManifest } from "./manifest";
import { createSeededRandom, seededShuffle } from "./seed";

describe("benchmark manifest seeds", () => {
  test("exposes three seeds for every category and difficulty", () => {
    expect(benchmarkManifest.cases).toHaveLength(27);

    for (const site of [
      "information-retrieval",
      "long-context",
      "complex-form",
    ]) {
      for (const difficulty of ["easy", "medium", "hard"]) {
        const seeds = benchmarkManifest.cases
          .filter(
            (benchmarkCase) =>
              benchmarkCase.site === site &&
              benchmarkCase.difficulty === difficulty,
          )
          .map((benchmarkCase) => benchmarkCase.seed)
          .toSorted();

        expect(seeds).toEqual([0, 1, 2]);
      }
    }
  });

  test("seed helpers are deterministic", () => {
    const first = createSeededRandom(2);
    const second = createSeededRandom(2);

    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
    expect(seededShuffle(["a", "b", "c"], 1)).toEqual(
      seededShuffle(["a", "b", "c"], 1),
    );
  });

  test("complex form cases score the full multi-step payload", () => {
    const formCase = benchmarkManifest.cases.find(
      (benchmarkCase) => benchmarkCase.id === "complex-form-hard-2",
    );

    expect(formCase).toBeDefined();
    expect(formCase?.scoring).toHaveLength(1);

    const scoring = formCase?.scoring[0];
    expect(scoring?.type).toBe("form-submission");

    if (scoring?.type !== "form-submission") {
      throw new Error("Expected form-submission scoring.");
    }

    expect(scoring.points).toBe(10);
    expect(scoring.expectedFields).toEqual({
      contactName: "Morgan Lee",
      contactEmail: "morgan.lee@example.test",
      accessCode: "WD-608",
      incidentType: "safety-review",
      priority: "urgent",
      region: "west-dock",
      responseWindow: "same-shift",
      notifyBy: "sms",
      confirmChecklist: "on",
      acknowledgeSla: "on",
      finalConfirm: "on",
    });
  });
});
