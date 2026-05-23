import type {
  AssistantMessage,
  CanonicalMessage,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from "@/core/messages";
import { type CanonicalError, Result } from "@/core/Result";
import type { AgentSession, AgentTurnStatus } from "@/core/session";
import type { ProviderManager } from "@/providers/ProviderManager";
import type { SelectedModel } from "@/providers/types";
import type { BrowserService } from "@/services/browser/BrowserService";
import type { ToolManager } from "@/tools/ToolManager";
import type { ToolResult } from "@/tools/types";
import type { ContextManager } from "./ContextManager";
import type { AgentDeps, AgentEvent } from "./types";

const DEFAULT_MAX_ITERATIONS = 50;

export class Agent {
  constructor(
    private readonly providers: ProviderManager,
    private readonly tools: ToolManager,
    private readonly context: ContextManager,
    private readonly browser: BrowserService,
  ) {}

  async *runTurn(
    deps: AgentDeps,
    message: UserMessage,
  ): AsyncGenerator<AgentEvent> {
    const selected = this.providers.selected;
    if (!selected) {
      yield { type: "error", error: "No model selected" };
      return;
    }

    const maxIterations = deps.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const startTime = new Date().toISOString();
    const turnMessages: CanonicalMessage[] = [message];
    let messages = this.context.buildContext({
      session: deps.session,
      newMessage: message,
    });

    try {
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        if (deps.signal?.aborted) {
          this.appendTurn(
            deps.session,
            selected,
            startTime,
            turnMessages,
            "aborted",
            "Aborted",
          );
          yield { type: "error", error: "Aborted" };
          return;
        }

        const assistantResult = yield* this.streamAssistantMessage(
          selected,
          deps,
          messages,
        );

        if (Result.isErr(assistantResult)) {
          this.appendTurn(
            deps.session,
            selected,
            startTime,
            turnMessages,
            "failed",
            assistantResult.error.message,
          );
          yield { type: "error", error: assistantResult.error.message };
          return;
        }

        const assistantMessage = assistantResult.value;
        turnMessages.push(assistantMessage);
        messages = [...messages, assistantMessage];

        const toolCalls = assistantMessage.toolCalls ?? [];
        if (toolCalls.length === 0) {
          this.appendTurn(
            deps.session,
            selected,
            startTime,
            turnMessages,
            "completed",
          );
          yield { type: "done" };
          return;
        }

        for (const toolCall of toolCalls) {
          if (deps.signal?.aborted) {
            this.appendTurn(
              deps.session,
              selected,
              startTime,
              turnMessages,
              "aborted",
              "Aborted",
            );
            yield { type: "error", error: "Aborted" };
            return;
          }

          yield { type: "tool-call", call: toolCall };

          const toolResult = await this.tools.execute(
            {
              browser: this.browser,
              session: {
                sessionId: deps.session.id,
                config: deps.config,
              },
            },
            toolCall,
          );

          const toolMessage = this.createToolResultMessage(
            toolCall,
            toolResult,
          );
          turnMessages.push(toolMessage);
          messages = [...messages, toolMessage];
          yield {
            type: "tool-result",
            callId: toolCall.callId,
            result: toolResult,
          };
        }
      }

      const error = `Agent stopped after ${maxIterations} iterations`;
      this.appendTurn(
        deps.session,
        selected,
        startTime,
        turnMessages,
        "max_iterations",
        error,
      );
      yield {
        type: "error",
        error,
      };
    } catch (error) {
      const message = deps.signal?.aborted
        ? "Aborted"
        : this.errorToMessage(error);
      this.appendTurn(
        deps.session,
        selected,
        startTime,
        turnMessages,
        deps.signal?.aborted ? "aborted" : "failed",
        message,
      );
      yield {
        type: "error",
        error: message,
      };
    }
  }

  private async *streamAssistantMessage(
    selected: SelectedModel,
    deps: AgentDeps,
    messages: CanonicalMessage[],
  ): AsyncGenerator<AgentEvent, Result<AssistantMessage>, unknown> {
    for await (const event of selected.provider.streamChat(
      {
        modelId: selected.model.id,
        messages,
        tools: this.tools.getTools(),
        sessionId: deps.session.id,
      },
      { config: deps.config },
      deps.signal,
    )) {
      if (event.type === "text-delta") {
        yield { type: "assistant-text", text: event.text };
        continue;
      }

      if (event.type === "sse-comment") {
        yield { type: "sse-comment", content: event.content };
        continue;
      }

      if (event.type === "message-complete") {
        return Result.Ok(event.message);
      }

      if (event.type === "error") {
        return Result.fromCanonical(event.error);
      }
    }

    return Result.fromCanonical(
      "Provider stream ended without a completed message",
    );
  }

  private appendTurn(
    session: AgentSession,
    selected: SelectedModel,
    startTime: string,
    messages: CanonicalMessage[],
    status: AgentTurnStatus,
    error?: string,
  ): void {
    session.turns.push({
      startTime,
      endTime: new Date().toISOString(),
      status,
      ...(error ? { error } : {}),
      provider: {
        id: selected.provider.id,
        displayName: selected.provider.displayName,
      },
      model: {
        id: selected.model.id,
        displayName: selected.model.displayName,
      },
      messages,
    });
  }

  private createToolResultMessage(
    toolCall: ToolCall,
    result: ToolResult,
  ): ToolResultMessage {
    if (Result.isErr(result)) {
      return {
        role: "tool",
        toolCallId: toolCall.callId,
        toolName: toolCall.toolName,
        content: [{ type: "text", text: this.formatToolError(result.error) }],
      };
    }

    return {
      role: "tool",
      toolCallId: toolCall.callId,
      toolName: toolCall.toolName,
      content: result.value.map((t) =>
        t.type === "text"
          ? { type: "text", text: t.content }
          : { type: "image", imageUrl: t.url },
      ),
    };
  }

  private formatToolError(error: CanonicalError): string {
    if (error.hint) {
      return `${error.message} (${error.hint})`;
    }

    return error.message;
  }

  private errorToMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
