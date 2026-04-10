import { z } from "zod";

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
