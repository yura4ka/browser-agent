export type CanonicalMessage =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolResultMessage;

export type SystemMessage = {
  role: "system";
  content: string;
};

export type UserMessage = {
  role: "user";
  content: MessagePart[];
};

export type AssistantMessage = {
  role: "assistant";
  content: MessagePart[];
  toolCalls?: ToolCall[];
};

export type ToolCall = {
  callId: string;
  toolName: string;
  args: unknown;
};

export type ToolResultMessage = {
  role: "tool";
  toolCallId: string;
  toolName: string;
  content: MessagePart;
};

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "image"; imageUrl: string };
