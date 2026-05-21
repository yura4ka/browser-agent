import { z } from "zod";
import type { SystemMessage } from "@/core/messages";

const openRouterModelSchema = z
  .object({
    id: z.string(),
    canonical_slug: z.string(),
    name: z.string(),
    context_length: z.number().int().optional(),
    architecture: z
      .object({
        input_modalities: z.array(z.string()),
      })
      .strip(),
    supported_parameters: z.array(z.string()),
  })
  .strip();

export const openRouterModelsResponseSchema = z
  .object({
    data: z.array(openRouterModelSchema),
  })
  .strip();

export type OpenRouterModel = z.infer<typeof openRouterModelSchema>;
export type OpenRouterModelsResponse = z.infer<
  typeof openRouterModelsResponseSchema
>;

export type OpenRouterChunk = {
  id?: string;
  model?: string;
  error?: { message?: string; code?: string | number };
  usage?: unknown;
  choices?: Array<{
    index?: number;
    finish_reason?: string | null;
    delta?: {
      role?: "assistant";
      content?: string;
      tool_calls?: OpenRouterToolCallDelta[];
    };
  }>;
};

export type OpenRouterToolCallDelta = {
  index?: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
};
export type OpenRouterMessagePart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type OpenRouterSystemMessage = SystemMessage;

export type OpenRouterUserMessage = {
  role: "user";
  content: OpenRouterMessagePart[];
};

export type OpenRouterAssistantMessage = {
  role: "assistant";
  content: OpenRouterMessagePart[];
  tool_calls?: {
    type: "function";
    id: string;
    function: { name: string; arguments: string };
  }[];
};

export type OpenRouterToolResultMessage = {
  role: "tool";
  tool_call_id: string;
  content: OpenRouterMessagePart[];
};

export type OpenRouterMessage =
  | OpenRouterSystemMessage
  | OpenRouterUserMessage
  | OpenRouterAssistantMessage
  | OpenRouterToolResultMessage;

export type OpenRouterToolDefintion = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};
