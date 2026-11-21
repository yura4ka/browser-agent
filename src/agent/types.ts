import type { UserConfig } from "@/core/config";
import type { ToolCall } from "@/core/messages";
import type { AgentSession } from "@/core/session";
import type { SelectedModel } from "@/providers/types";
import type { ToolResult } from "@/tools/types";

export type AgentDeps = {
  session: AgentSession;
  config: UserConfig;
  signal?: AbortSignal;
  maxIterations?: number;
  selectedModel?: SelectedModel;
};

export type AgentEvent =
  | { type: "assistant-text"; text: string }
  | { type: "tool-call"; call: ToolCall }
  | { type: "tool-result"; callId: string; result: ToolResult }
  | { type: "sse-comment"; content: string }
  | { type: "error"; error: string }
  | { type: "done" };
