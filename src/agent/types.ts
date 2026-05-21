import type { UserConfig } from "@/core/config";
import type { ToolCall } from "@/core/messages";
import type { AgentSession } from "@/core/session";
import type { ToolResult } from "@/tools/types";

export type AgentDeps = {
  session: AgentSession;
  config: UserConfig;
  signal?: AbortSignal;
  maxIterations?: number;
};

export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "assistant-text"; text: string }
  | { type: "tool-call"; call: ToolCall }
  | { type: "tool-result"; callId: string; result: ToolResult }
  | { type: "error"; error: string }
  | { type: "done" };
