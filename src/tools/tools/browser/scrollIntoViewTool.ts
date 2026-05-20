import { Result } from "@/core/Result";
import { createTool } from "../createTool";
import { tabLocatorArgsSchema } from "./schemas";

export const scrollIntoViewTool = createTool({
  name: "scrollIntoView",
  description: "Scroll locator into view if needed.",
  argsSchema: tabLocatorArgsSchema,
  execute: async (context, args) => {
    const result = await context.browser.scrollIntoView(context.session, args);
    if (Result.isErr(result)) return result;

    return Result.Ok({ type: "text", content: "Scrolled locator into view" });
  },
});
