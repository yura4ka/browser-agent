import { Result } from "@/core/Result";
import { createTool } from "../createTool";
import { screenshotOptionsSchema } from "./schemas";

export const screenshotTool = createTool({
  name: "screenshot",
  description: "Take a screenshot of a page or a locator.",
  argsSchema: screenshotOptionsSchema,
  execute: async (context, args) => {
    const screenshotResult = await context.browser.screenshot(
      context.session,
      args,
    );
    if (Result.isErr(screenshotResult)) return screenshotResult;

    return Result.Ok({
      type: "image",
      url: screenshotResult.value,
    });
  },
});
