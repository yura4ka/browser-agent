import { Result } from "@/core/Result";
import { createTool } from "../createTool";
import { selectOptionArgsSchema } from "./schemas";

export const selectOptionTool = createTool({
  name: "selectOption",
  description: "Select an option in a select element.",
  argsSchema: selectOptionArgsSchema,
  execute: async (context, args) => {
    const result = await context.browser.selectOption(context.session, args);
    if (Result.isErr(result)) return result;

    return Result.Ok({ type: "text", content: "Selected option" });
  },
});
