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
