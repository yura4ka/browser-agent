import { describe, expect, test } from "bun:test";
import type { AgentEvent } from "@/agent/types";
import type { BenchmarkCase } from "../schemas";
import { ScoreOutputSchema } from "../schemas";
import { extractFinalAssistantText, summarizeMetrics } from "./metrics";
import { scoreBenchmarkCase } from "./scoring";

const baseCase = {
  id: "case-1",
  site: "information-retrieval",
  title: "Case 1",
  description: "Test case",
  difficulty: "easy",
  seed: 0,
  entryPath: "/",
  goal: "Answer",
  tags: [],
} satisfies Omit<BenchmarkCase, "scoring">;

describe("benchmark scoring", () => {
  test("extracts final assistant answer from streamed text", () => {
    expect(
      extractFinalAssistantText([
        { type: "assistant-text", text: "HERON" },
        { type: "assistant-text", text: "-042" },
        { type: "done" },
      ]),
    ).toBe("HERON-042");
  });

  test("scores exact, contains-all, regex, and composite checks", () => {
    const benchmarkCase: BenchmarkCase = {
      ...baseCase,
      scoring: [
        {
          id: "exact",
          type: "exact",
          label: "Exact",
          expected: "HERON-042",
          caseSensitive: false,
          points: 1,
        },
        {
          id: "contains",
          type: "contains-all",
          label: "Contains",
          expected: ["HERON", "042"],
          caseSensitive: false,
          points: 1,
        },
        {
          id: "regex",
          type: "regex",
          label: "Regex",
          pattern: "HERON-[0-9]+",
          flags: "",
          points: 1,
        },
        {
          id: "composite",
          type: "composite",
          label: "Composite",
          checkIds: ["exact", "contains", "regex"],
          passThreshold: 1,
          points: 1,
        },
      ],
    };

    const score = scoreBenchmarkCase({
      runId: "run-1",
      status: "completed",
      benchmarkCase,
      finalAnswer: "HERON-042",
    });

    expect(score.passed).toBe(true);
    expect(score.totalScore).toBe(4);
  });

  test("records missing final answers explicitly", () => {
    const benchmarkCase: BenchmarkCase = {
      ...baseCase,
      scoring: [
        {
          id: "exact",
          type: "exact",
          label: "Exact",
          expected: "HERON-042",
          caseSensitive: false,
          points: 1,
        },
      ],
    };

    const score = scoreBenchmarkCase({
      runId: "run-1",
      status: "failed",
      benchmarkCase,
    });

    expect(score.passed).toBe(false);
    expect(score.checks[0]?.reason).toBe("Missing final assistant answer");
  });

  test("scores separate contains checks against one combined answer", () => {
    const benchmarkCase: BenchmarkCase = {
      ...baseCase,
      site: "long-context",
      scoring: [
        {
          id: "harbor-window",
          type: "contains-all",
          label: "Harbor inspection window",
          expected: ["Tuesday 09:30 UTC"],
          caseSensitive: false,
          points: 1,
        },
        {
          id: "sensor-threshold",
          type: "contains-all",
          label: "Sensor threshold",
          expected: ["18.7 psi"],
          caseSensitive: false,
          points: 1,
        },
        {
          id: "backup-operator",
          type: "contains-all",
          label: "Backup operator",
          expected: ["Mira Sol"],
          caseSensitive: false,
          points: 1,
        },
      ],
    };

    const score = scoreBenchmarkCase({
      runId: "run-1",
      status: "completed",
      benchmarkCase,
      finalAnswer: "Tuesday 09:30 UTC, 18.7 psi, Mira Sol",
    });

    expect(score.passed).toBe(true);
    expect(score.totalScore).toBe(3);
  });

  test("scores form submissions and reports mismatches", () => {
    const benchmarkCase: BenchmarkCase = {
      ...baseCase,
      site: "complex-form",
      scoring: [
        {
          id: "form",
          type: "form-submission",
          label: "Form",
          expectedFields: { contactName: "Avery Stone", priority: "urgent" },
          points: 2,
        },
      ],
    };

    const score = scoreBenchmarkCase({
      runId: "run-1",
      status: "completed",
      benchmarkCase,
      interactions: [
        {
          timestamp: new Date().toISOString(),
          route: "/submit",
          method: "POST",
          fields: { contactName: "Avery Stone", priority: "routine" },
        },
      ],
    });

    expect(score.passed).toBe(false);
    expect(score.checks[0]?.reason).toBe("Mismatched fields: priority");
  });

  test("aggregates event-derived metrics", () => {
    const events: AgentEvent[] = [
      {
        type: "tool-call",
        call: { callId: "1", toolName: "browser_navigate", args: {} },
      },
      {
        type: "tool-call",
        call: { callId: "2", toolName: "browser_screenshot", args: {} },
      },
      {
        type: "tool-result",
        callId: "2",
        result: { ok: false, error: new Error("boom") },
      },
    ];

    const metrics = summarizeMetrics(events);

    expect(metrics.toolCallCount).toBe(2);
    expect(metrics.failedToolCallCount).toBe(1);
    expect(metrics.navigationAttemptCount).toBe(1);
    expect(metrics.screenshotCount).toBe(1);
    expect(metrics.eventCounts["tool-call"]).toBe(2);
  });

  test("rejects malformed score output", () => {
    const parsed = ScoreOutputSchema.safeParse({
      runId: "run",
      caseId: "case",
      totalScore: -1,
    });

    expect(parsed.success).toBe(false);
  });
});
