import { Result } from "@/core/Result";
import { createTool } from "../createTool";
import { maxLengthSchema, optionalLocatorArgsSchema } from "./schemas";

export const getHtmlContentTool = createTool({
  name: "getHtmlContent",
  description: "Get HTML content for the page or a locator.",
  argsSchema: optionalLocatorArgsSchema.extend({ maxLength: maxLengthSchema }),
  execute: async (context, args) => {
    const result = await context.browser.getHtmlContent(context.session, args);
    if (Result.isErr(result)) return result;

    return Result.Ok({ type: "text", content: result.value });
  },
});
