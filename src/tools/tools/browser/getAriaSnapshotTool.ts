import { Result } from "@/core/Result";
import { createTool } from "../createTool";
import { depthSchema, optionalLocatorArgsSchema } from "./schemas";

export const getAriaSnapshotTool = createTool({
  name: "getAriaSnapshot",
  description: "Get ARIA snapshot for the page or a locator.",
  argsSchema: optionalLocatorArgsSchema.extend({ depth: depthSchema }),
  execute: async (context, args) => {
    const result = await context.browser.getAriaSnapshot(context.session, args);
    if (Result.isErr(result)) return result;

    return Result.Ok({ type: "text", content: result.value });
  },
});
