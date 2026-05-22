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
    pricing: z.object({
      completion: z.string(),
      prompt: z.string(),
    }),
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

const openRouterToolCallDeltaSchema = z
  .object({
    index: z.number().int().optional(),
    id: z.string().optional(),
    type: z.literal("function").optional(),
    function: z
      .object({
        name: z.string().optional(),
        arguments: z.string().optional(),
      })
      .strip()
      .optional(),
  })
  .strip();

export const openRouterChunkSchema = z
  .object({
    id: z.string().optional(),
    model: z.string().optional(),
    error: z
      .object({
        message: z.string().optional(),
        code: z.union([z.string(), z.number()]).optional(),
      })
      .strip()
      .optional(),
    usage: z.unknown().optional(),
    choices: z
      .array(
        z
          .object({
            index: z.number().int().optional(),
            finish_reason: z.string().nullable().optional(),
            delta: z
              .object({
                role: z.literal("assistant").optional(),
                content: z.string().nullable().optional(),
                tool_calls: z.array(openRouterToolCallDeltaSchema).optional(),
              })
              .strip()
              .optional(),
          })
          .strip(),
      )
      .optional(),
  })
  .strip();

export type OpenRouterChunk = z.infer<typeof openRouterChunkSchema>;

export type OpenRouterToolCallDelta = z.infer<
  typeof openRouterToolCallDeltaSchema
>;
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
