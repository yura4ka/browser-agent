import { Result } from "@/core/Result";
import { createTool } from "../createTool";
import { tabLocatorArgsSchema } from "./schemas";

export const clickTool = createTool({
  name: "click",
  description: "Click a locator.",
  argsSchema: tabLocatorArgsSchema,
  execute: async (context, args) => {
    const result = await context.browser.click(context.session, args);
    if (Result.isErr(result)) return result;

    return Result.Ok({ type: "text", content: "Clicked locator" });
  },
});
