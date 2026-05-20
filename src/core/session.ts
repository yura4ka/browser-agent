import z from "zod";
import type { UserConfig } from "./config";
import { canonicalMessageSchema } from "./messages";

export type SessionContext = {
  sessionId: string;
  config: UserConfig;
};

export const agentTurnSchema = z.strictObject({
  startTime: z.string(),
  endTime: z.string(),
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

export type AgentTurn = z.infer<typeof agentTurnSchema>;
export type AgentSession = z.infer<typeof agentSessionSchema>;
