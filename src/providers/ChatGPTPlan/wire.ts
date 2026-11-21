import { z } from "zod";

export const eventSchema = z.looseObject({
  type: z.string(),
  item: z.unknown().optional(),
  response: z.unknown().optional(),
});

export const deltaSchema = z.object({ delta: z.string() });

export const argumentsDeltaSchema = deltaSchema.extend({
  item_id: z.string().min(1),
});

export const itemSchema = z.object({
  id: z.string().min(1),
  type: z.string(),
  arguments: z.string().optional(),
});

export const functionCallSchema = itemSchema.extend({
  type: z.literal("function_call"),
  call_id: z.string().min(1),
  name: z.string().min(1),
  namespace: z.string().nullish(),
  arguments: z.string(),
  status: z.string().optional(),
});

export const usageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});

export const completedSchema = z.object({
  response: z.object({
    output: z.array(z.looseObject({ type: z.string() })),
    usage: z.unknown().optional(),
  }),
});

export const textOutputSchema = z.object({
  content: z.array(z.looseObject({ type: z.string() })),
});

export const errorSchema = z.object({
  code: z.unknown().optional(),
  param: z.unknown().optional(),
});

export const modelListSchema = z.object({
  models: z.array(
    z.object({
      slug: z.string().min(1),
      display_name: z.string().optional(),
      visibility: z.string(),
    }),
  ),
});
