import { Result } from "@/core/Result";
import { createTool } from "../createTool";
import { maxLengthSchema, tabLocatorArgsSchema } from "./schemas";

export const getTextContentTool = createTool({
  name: "getTextContent",
  description: "Get text content for a locator.",
  argsSchema: tabLocatorArgsSchema.extend({ maxLength: maxLengthSchema }),
  execute: async (context, args) => {
    const result = await context.browser.getTextContent(context.session, args);
    if (Result.isErr(result)) return result;

    return Result.Ok({ type: "text", content: result.value });
  },
});
