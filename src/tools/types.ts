import type { z } from "zod";
import type { Result } from "@/core/Result";
import type { SessionContext } from "@/core/session";
import type { BrowserService } from "@/services/browser/BrowserService";

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ToolContext = {
  session: SessionContext;
  browser: BrowserService;
};

export type ToolResultContent =
  | { type: "text"; content: string }
  | { type: "image"; url: string };

export type ToolResult = Result<ToolResultContent[]>;

export type ToolExecute<T> = (
  ctx: ToolContext,
  args: T,
) => Promise<Result<ToolResultContent[] | ToolResultContent>>;

export type Tool<TArgs> = ToolDefinition & {
  argsSchema: z.ZodType<TArgs>;
  execute: ToolExecute<TArgs>;
};
