import type { AgentEvent } from "@/agent/types";
import type { AgentSession } from "@/core/session";

export function extractFinalAssistantText(
  events: AgentEvent[],
): string | undefined {
  const text = events
    .filter((event) => event.type === "assistant-text")
    .map((event) => event.text)
    .join("")
    .trim();

  return text.length > 0 ? text : undefined;
}

export function summarizeMetrics(
  events: AgentEvent[],
  sessions: AgentSession[] = [],
) {
  const toolResults = events.filter((event) => event.type === "tool-result");
  const eventCounts: Record<string, number> = {};
  const toolCallCountsByName: Record<string, number> = {};
  const navigateTool = "browser_navigate";
  const screenshotTool = "browser_screenshot";
  const htmlTool = "browser_get_html_content";
  const ariaTool = "browser_get_aria_snapshot";

  for (const event of events) {
    eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;

    if (event.type === "tool-call") {
      toolCallCountsByName[event.call.toolName] =
        (toolCallCountsByName[event.call.toolName] ?? 0) + 1;
    }
  }

  const usage = sessions.reduce(
    (total, session) => ({
      inputTokens: total.inputTokens + session.usage.inputTokens,
      outputTokens: total.outputTokens + session.usage.outputTokens,
      costUsd: total.costUsd + session.usage.cost,
    }),
    { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  );

  return {
    toolCallCount: events.filter((event) => event.type === "tool-call").length,
    failedToolCallCount: toolResults.filter((event) => !event.result.ok).length,
    navigationAttemptCount: toolCallCountsByName[navigateTool] ?? 0,
    screenshotCount: toolCallCountsByName[screenshotTool] ?? 0,
    htmlReadCount: toolCallCountsByName[htmlTool] ?? 0,
    ariaSnapshotCount: toolCallCountsByName[ariaTool] ?? 0,
    eventCounts,
    toolCallCountsByName,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd: usage.costUsd,
  };
}
