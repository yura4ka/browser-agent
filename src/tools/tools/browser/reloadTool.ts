import { Result } from "@/core/Result";
import { createTool } from "../createTool";
import { tabIdArgsSchema } from "./schemas";

export const reloadTool = createTool({
  name: "reload",
  description: "Reload a browser tab.",
  argsSchema: tabIdArgsSchema,
  execute: async (context, args) => {
    const result = await context.browser.reloadTab(context.session, args.tabId);
    if (Result.isErr(result)) return result;

    return Result.Ok({
      type: "text",
      content: `Reloaded tab ${args.tabId}`,
    });
  },
});
