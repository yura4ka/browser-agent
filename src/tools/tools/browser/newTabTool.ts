import z from "zod";
import { Result } from "@/core/Result";
import { createTool } from "../createTool";

export const newTabTool = createTool({
  name: "newTab",
  description: "Open a new tab.",
  argsSchema: z.object({ url: z.url() }),
  execute: async (context, args) => {
    const result = await context.browser.createTab(context.session, args.url);
    if (Result.isErr(result)) return result;
    return Result.Ok({
      type: "text",
      content: `Create a new tab with id: ${result.value}`,
    });
  },
});
