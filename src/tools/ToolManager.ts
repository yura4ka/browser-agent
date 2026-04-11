import type { ToolCall } from "@/core/messages";
import { Result } from "@/core/Result";
import type { Tool, ToolContext, ToolDefinition, ToolResult } from "./types";

export class ToolManager {
  private tools = new Map<string, Tool<unknown>>();

  addTool<TArgs>(tool: Tool<TArgs>): ToolManager {
    this.tools.set(tool.name, tool as Tool<unknown>);
    return this;
  }

  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  async execute(context: ToolContext, toolCall: ToolCall): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.toolName);
    if (!tool) {
      return Result.fromCanonical(`Tool not found: ${toolCall.toolName}`);
    }

    const argsResult = this.parseArgs(toolCall.args);
    if (Result.isErr(argsResult)) {
      return argsResult;
    }

    const parsedArgs = tool.argsSchema.safeParse(argsResult.value);
    if (!parsedArgs.success) {
      return Result.fromCanonical(
        `Invalid args for tool: ${tool.name}`,
        parsedArgs.error.message,
      );
    }

    const executeResult = await Result.fromPromise(
      tool.execute(context, parsedArgs.data),
    );
    if (Result.isErr(executeResult)) {
      return Result.fromCanonical(
        `Tool execution failed: ${tool.name}`,
        this.errorToMessage(executeResult.error),
      );
    }

    return executeResult.value;
  }

  private parseArgs(args: unknown): Result<unknown> {
    if (typeof args !== "string") {
      return Result.Ok(args);
    }

    const parsed = Result.wrap(() => JSON.parse(args));
    if (Result.isErr(parsed)) {
      return Result.fromCanonical("Invalid JSON in tool args");
    }

    return Result.Ok(parsed.value);
  }

  private errorToMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
