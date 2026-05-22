import z from "zod";
import { Result } from "@/core/Result";
import { createTool } from "../createTool";

export const getNavigationPolicyTool = createTool({
  name: "getNavigationPolicy",
  description: "Get the current in-memory browser navigation policy.",
  argsSchema: z.object({}).strict(),
  execute: async (context) => {
    const { allowedUrls } = context.session.config.preferences;

    return Result.Ok({
      type: "text",
      content: JSON.stringify(
        {
          allowedUrls,
          matching: "exact normalized URL href",
          refresh:
            "Preferences are loaded at app startup; restart the app after changing allowed URLs.",
        },
        null,
        2,
      ),
    });
  },
});
