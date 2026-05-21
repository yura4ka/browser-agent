import z from "zod";

const textMessagePartSchema = z.strictObject({
  type: z.literal("text"),
  text: z.string(),
});

const imageMessagePartSchema = z.strictObject({
  type: z.literal("image"),
  imageUrl: z.string(),
});

const messagePartSchema = z.discriminatedUnion("type", [
  textMessagePartSchema,
  imageMessagePartSchema,
]);

const toolCallSchema = z.strictObject({
  callId: z.string(),
  toolName: z.string(),
  args: z.unknown(),
});

const systemMessageSchema = z.strictObject({
  role: z.literal("system"),
  content: z.string(),
});

const userMessageSchema = z.strictObject({
  role: z.literal("user"),
  content: z.array(messagePartSchema),
});

const assistantMessageSchema = z.strictObject({
  role: z.literal("assistant"),
  content: z.array(messagePartSchema),
  toolCalls: z.array(toolCallSchema).optional(),
});

const toolResultMessageSchema = z.strictObject({
  role: z.literal("tool"),
  toolCallId: z.string(),
  toolName: z.string(),
  content: z.array(messagePartSchema),
});

export const canonicalMessageSchema = z.discriminatedUnion("role", [
  systemMessageSchema,
  userMessageSchema,
  assistantMessageSchema,
  toolResultMessageSchema,
]);

export type CanonicalMessage = z.infer<typeof canonicalMessageSchema>;

export type SystemMessage = z.infer<typeof systemMessageSchema>;

export type UserMessage = z.infer<typeof userMessageSchema>;

export type AssistantMessage = z.infer<typeof assistantMessageSchema>;

export type ToolCall = z.infer<typeof toolCallSchema>;

export type ToolResultMessage = z.infer<typeof toolResultMessageSchema>;

export type MessagePart = z.infer<typeof messagePartSchema>;
