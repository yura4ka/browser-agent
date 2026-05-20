import z from "zod";
import { Result } from "@/core/Result";
import { createTool } from "../createTool";
import { tabLocatorArgsSchema } from "./schemas";

export const fillTextTool = createTool({
  name: "fillText",
  description: "Fill text into an input.",
  argsSchema: tabLocatorArgsSchema.extend({ text: z.string() }),
  execute: async (context, args) => {
    const result = await context.browser.fillText(context.session, args);
    if (Result.isErr(result)) return result;

    return Result.Ok({ type: "text", content: "Filled text" });
  },
});
