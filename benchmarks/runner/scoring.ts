import type {
  BenchmarkCase,
  ScoreCheckResult,
  ScoreDefinition,
  ScoreOutput,
} from "../schemas";
import type { CapturedInteraction } from "../server/types";

export type RunStatus = "completed" | "failed" | "timeout" | "aborted";

export function scoreBenchmarkCase(options: {
  runId: string;
  status: RunStatus;
  benchmarkCase: BenchmarkCase;
  finalAnswer?: string;
  interactions?: CapturedInteraction[];
}): ScoreOutput {
  const checks: ScoreCheckResult[] = [];

  for (const definition of options.benchmarkCase.scoring) {
    if (definition.type === "composite") continue;
    checks.push(
      scoreDefinition(
        definition,
        options.finalAnswer,
        options.interactions ?? [],
      ),
    );
  }

  for (const definition of options.benchmarkCase.scoring) {
    if (definition.type !== "composite") continue;
    checks.push(scoreComposite(definition, checks));
  }

  const totalScore = checks.reduce((sum, check) => sum + check.score, 0);
  const maxScore = checks.reduce((sum, check) => sum + check.maxScore, 0);

  return {
    runId: options.runId,
    caseId: options.benchmarkCase.id,
    status: options.status,
    finalAnswer: options.finalAnswer,
    totalScore,
    maxScore,
    passed: totalScore === maxScore,
    checks,
  };
}

function scoreDefinition(
  definition: Exclude<ScoreDefinition, { type: "composite" }>,
  finalAnswer: string | undefined,
  interactions: CapturedInteraction[],
): ScoreCheckResult {
  if (definition.type === "form-submission") {
    return scoreFormSubmission(definition, interactions);
  }

  if (!finalAnswer) {
    return failedCheck(
      definition.id,
      definition.label,
      definition.points,
      "Missing final assistant answer",
    );
  }

  if (definition.type === "exact") {
    const actual = normalize(finalAnswer, definition.caseSensitive);
    const expected = normalize(definition.expected, definition.caseSensitive);
    const passed = actual === expected;

    return passed
      ? passedCheck(definition.id, definition.label, definition.points)
      : failedCheck(
          definition.id,
          definition.label,
          definition.points,
          `Expected exact answer ${definition.expected}`,
        );
  }

  if (definition.type === "contains-all") {
    const actual = normalize(finalAnswer, definition.caseSensitive);
    const missing = definition.expected.filter(
      (expected) =>
        !actual.includes(normalize(expected, definition.caseSensitive)),
    );

    return missing.length === 0
      ? passedCheck(definition.id, definition.label, definition.points)
      : failedCheck(
          definition.id,
          definition.label,
          definition.points,
          `Missing expected text: ${missing.join(", ")}`,
        );
  }

  const pattern = new RegExp(definition.pattern, definition.flags);
  return pattern.test(finalAnswer)
    ? passedCheck(definition.id, definition.label, definition.points)
    : failedCheck(
        definition.id,
        definition.label,
        definition.points,
        `Answer did not match /${definition.pattern}/${definition.flags}`,
      );
}

function scoreComposite(
  definition: Extract<ScoreDefinition, { type: "composite" }>,
  checks: ScoreCheckResult[],
): ScoreCheckResult {
  const referenced = checks.filter((check) =>
    definition.checkIds.includes(check.id),
  );
  const passedRatio =
    referenced.length === 0
      ? 0
      : referenced.filter((check) => check.passed).length / referenced.length;

  return passedRatio >= definition.passThreshold
    ? passedCheck(definition.id, definition.label, definition.points)
    : failedCheck(
        definition.id,
        definition.label,
        definition.points,
        `Composite pass ratio ${passedRatio} below ${definition.passThreshold}`,
      );
}

function scoreFormSubmission(
  definition: Extract<ScoreDefinition, { type: "form-submission" }>,
  interactions: CapturedInteraction[],
): ScoreCheckResult {
  const submission = interactions.at(-1);
  if (!submission) {
    return failedCheck(
      definition.id,
      definition.label,
      definition.points,
      "No form submission captured",
    );
  }

  const mismatches = Object.entries(definition.expectedFields).filter(
    ([field, expected]) => {
      const actual = submission.fields[field];
      return !fieldMatches(actual, expected);
    },
  );

  return mismatches.length === 0
    ? passedCheck(definition.id, definition.label, definition.points)
    : failedCheck(
        definition.id,
        definition.label,
        definition.points,
        `Mismatched fields: ${mismatches.map(([field]) => field).join(", ")}`,
      );
}

function fieldMatches(
  actual: string | string[] | undefined,
  expected: string | boolean | string[],
): boolean {
  if (actual === undefined) return false;
  const actualValues = Array.isArray(actual) ? actual : [actual];
  const expectedValues = Array.isArray(expected)
    ? expected.map(String)
    : [String(expected)];

  return expectedValues.every((value) => actualValues.includes(value));
}

function normalize(value: string, caseSensitive: boolean): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return caseSensitive ? normalized : normalized.toLowerCase();
}

function passedCheck(
  id: string,
  label: string,
  points: number,
): ScoreCheckResult {
  return { id, label, score: points, maxScore: points, passed: true };
}

function failedCheck(
  id: string,
  label: string,
  points: number,
  reason: string,
): ScoreCheckResult {
  return { id, label, score: 0, maxScore: points, passed: false, reason };
}
