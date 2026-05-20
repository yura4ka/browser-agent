import z from "zod";
import { Result } from "@/core/Result";
import { createTool } from "../createTool";

export const listTabsTool = createTool({
  name: "listTabs",
  description: "List available browser tabs.",
  argsSchema: z.object({}).strict(),
  execute: async (context) => {
    const result = await context.browser.listTabs(context.session);
    if (Result.isErr(result)) return result;

    return Result.Ok({
      type: "text",
      content: JSON.stringify(result.value, null, 2),
    });
  },
});
