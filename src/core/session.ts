import z from "zod";
import type { UserConfig } from "./config";
import { canonicalMessageSchema } from "./messages";

export type SessionContext = {
  sessionId: string;
  config: UserConfig;
};

export const agentTurnStatusSchema = z.enum([
  "completed",
  "failed",
  "aborted",
  "max_iterations",
]);

export const agentTurnSchema = z.strictObject({
  startTime: z.string(),
  endTime: z.string(),
  status: agentTurnStatusSchema,
  error: z.string().optional(),
  provider: z.strictObject({
    id: z.string(),
    displayName: z.string(),
  }),
  model: z.strictObject({
    id: z.string(),
    displayName: z.string(),
  }),
  messages: z.array(canonicalMessageSchema),
});

export const agentUsageSchema = z.strictObject({
  cost: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});

export const EMPTY_AGENT_USAGE = {
  cost: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
} satisfies z.infer<typeof agentUsageSchema>;

export const agentSessionSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  systemPrompt: z.string(),
  selectedModel: z.strictObject({
    providerId: z.string(),
    modelId: z.string(),
    registrationKey: z.uuid().optional(),
  }),
  turns: z.array(agentTurnSchema),
  usage: agentUsageSchema.default(EMPTY_AGENT_USAGE),
});

export type AgentTurnStatus = z.infer<typeof agentTurnStatusSchema>;
export type AgentTurn = z.infer<typeof agentTurnSchema>;
export type AgentUsage = z.infer<typeof agentUsageSchema>;
export type AgentSession = z.infer<typeof agentSessionSchema>;
