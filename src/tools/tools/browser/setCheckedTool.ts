import z from "zod";
import { Result } from "@/core/Result";
import { createTool } from "../createTool";
import { tabLocatorArgsSchema } from "./schemas";

export const setCheckedTool = createTool({
  name: "setChecked",
  description: "Set checkbox or radio checked state.",
  argsSchema: tabLocatorArgsSchema.extend({ checked: z.boolean() }),
  execute: async (context, args) => {
    const result = await context.browser.setChecked(context.session, args);
    if (Result.isErr(result)) return result;

    return Result.Ok({
      type: "text",
      content: `Set checked state to ${args.checked}`,
    });
  },
});
