import type z from "zod";
import type { Tool, ToolExecute } from "../types";

export function createTool<TArgs>(input: {
  name: string;
  description: string;
  argsSchema: z.ZodType<TArgs>;
  execute: ToolExecute<TArgs>;
}): Tool<TArgs> {
  return {
    name: input.name,
    description: input.description,
    argsSchema: input.argsSchema,
    parameters: input.argsSchema.toJSONSchema({
      cycles: "ref",
      reused: "inline",
    }),
    execute: input.execute,
  };
}
