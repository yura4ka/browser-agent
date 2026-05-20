import z from "zod";
import { Result } from "@/core/Result";
import { createTool } from "../createTool";
import { tabIdArgsSchema } from "./schemas";

export const navigateTool = createTool({
  name: "navigate",
  description: "Navigate a tab to a URL.",
  argsSchema: tabIdArgsSchema.extend({ url: z.url() }),
  execute: async (context, args) => {
    const result = await context.browser.navigateTab(
      context.session,
      args.tabId,
      args.url,
    );
    if (Result.isErr(result)) return result;

    return Result.Ok({
      type: "text",
      content: `Navigated tab ${args.tabId} to ${args.url}`,
    });
  },
});
