import { Result } from "@/core/Result";
import { createTool } from "../createTool";
import { tabLocatorArgsSchema } from "./schemas";

export const clearTool = createTool({
  name: "clear",
  description: "Clear text from an input.",
  argsSchema: tabLocatorArgsSchema,
  execute: async (context, args) => {
    const result = await context.browser.clear(context.session, args);
    if (Result.isErr(result)) return result;

    return Result.Ok({ type: "text", content: "Cleared input" });
  },
});
