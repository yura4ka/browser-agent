import z from "zod";
import { Result } from "@/core/Result";
import { createTool } from "../createTool";
import { tabIdArgsSchema } from "./schemas";

export const scrollTool = createTool({
  name: "scroll",
  description: "Scroll the page in a tab.",
  argsSchema: tabIdArgsSchema.extend({
    x: z.number().optional(),
    y: z.number().optional(),
  }),
  execute: async (context, args) => {
    const result = await context.browser.scrollTab(context.session, args);
    if (Result.isErr(result)) return result;

    return Result.Ok({
      type: "text",
      content: `Scrolled tab ${args.tabId}`,
    });
  },
});
