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

export const agentSessionSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  systemPrompt: z.string(),
  selectedModel: z.strictObject({
    providerId: z.string(),
    modelId: z.string(),
  }),
  turns: z.array(agentTurnSchema),
});

export type AgentTurnStatus = z.infer<typeof agentTurnStatusSchema>;
export type AgentTurn = z.infer<typeof agentTurnSchema>;
export type AgentSession = z.infer<typeof agentSessionSchema>;
