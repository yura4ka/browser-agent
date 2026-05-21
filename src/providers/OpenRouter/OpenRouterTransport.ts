import {
  createParser,
  type EventSourceMessage,
  type ParseError,
} from "eventsource-parser";
import type { CanonicalMessage, MessagePart, ToolCall } from "@/core/messages";
import { Result } from "@/core/Result";
import type { ToolDefinition } from "@/tools/types";
import { EventStreamAdapter } from "../transportAdapters/EventStreamAdapter";
import type { ChatRequest, LLMStreamEvent, ProviderDeps } from "../types";
import { OpenRouterMessageBuilder } from "./OpenRouterMessageBuilder";
import type {
  OpenRouterAssistantMessage,
  OpenRouterChunk,
  OpenRouterMessage,
  OpenRouterMessagePart,
  OpenRouterToolDefintion,
} from "./types";

export class OpenRouterTransport extends EventStreamAdapter {
  protected override createParser(options: {
    enqueue: (event: LLMStreamEvent) => void;
  }) {
    let streamClosed = false;
    const messageBuilder = new OpenRouterMessageBuilder();

    const finalize = () => {
      if (streamClosed) return;
      streamClosed = true;
      options.enqueue({
        type: "message-complete",
        message: messageBuilder.finalize(),
      });
    };

    const fail = (error: string) => {
      if (streamClosed) return;
      streamClosed = true;
      options.enqueue({
        type: "error",
        error,
      });
    };

    return createParser({
      onEvent: (event) => {
        if (streamClosed) return;

        if (event.data === "[DONE]") {
          finalize();
          return;
        }

        const chunkResult = this.parseChunk(event);
        if (Result.isErr(chunkResult)) {
          fail(chunkResult.error.message);
          return;
        }

        const chunk = chunkResult.value;
        if (chunk.error) {
          fail(chunk.error.message ?? "Stream error");
          return;
        }

        for (const choice of chunk.choices ?? []) {
          const delta = choice.delta;
          if (!delta) continue;

          if (delta.content !== undefined) {
            options.enqueue({
              type: "text-delta",
              text: delta.content,
            });
          }

          for (const tc of delta.tool_calls ?? []) {
            options.enqueue({
              type: "tool-call-delta",
              call: messageBuilder.parseToolCallDelta(tc),
            });
          }
        }

        const finishReason = messageBuilder.applyChunk(chunk);
        if (finishReason !== null) {
          finalize();
        }
      },
      onComment: (comment) => {
        if (streamClosed) return;
        options.enqueue({
          type: "sse-comment",
          content: comment,
        });
      },
      onError: (error) => {
        fail(this.formatParseError(error));
      },
    });
  }

  protected override async fetchWithStream(
    request: ChatRequest,
    deps: ProviderDeps,
    signal?: AbortSignal,
  ): Promise<Result<Response>> {
    const apiKey = deps.config.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return Result.fromCanonical("Missing OPENROUTER_API_KEY");
    }

    const response = await Result.fromPromise(
      fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: request.modelId,
          messages: request.messages.map((message) => this.mapMessage(message)),
          tools: request.tools.map(this.mapToolDefinition),
          stream: true,
        }),
        signal,
      }),
    );

    if (Result.isErr(response)) {
      return Result.fromCanonical(
        "Failed to fetch OpenRouter chat/completions",
      );
    }

    if (!response.value.ok) {
      const error = await Result.fromPromise(response.value.json());
      const message =
        Result.isOk(error) &&
        (error.value as { error?: { message?: string } })?.error?.message;
      return Result.fromCanonical(
        `${response.value.status} - ${response.value.statusText}. ${message ?? ""}`,
      );
    }

    return Result.Ok(response.value);
  }

  private parseChunk(event: EventSourceMessage): Result<OpenRouterChunk> {
    try {
      return Result.Ok(JSON.parse(event.data) as OpenRouterChunk);
    } catch {
      return Result.fromCanonical("Invalid OpenRouter stream chunk");
    }
  }

  private formatParseError(error: ParseError): string {
    if (error.type === "invalid-retry") {
      return `Invalid SSE retry value: ${error.value}`;
    }

    if (error.type === "unknown-field") {
      return `Invalid SSE field '${error.field}': ${error.value}`;
    }

    return `SSE parse error: ${String(error.type)}`;
  }

  private mapMessage(message: CanonicalMessage): OpenRouterMessage {
    switch (message.role) {
      case "system":
        return message;
      case "user":
        return {
          role: "user",
          content: message.content.map((part) => this.mapMessagePart(part)),
        };
      case "assistant": {
        const mapped: OpenRouterAssistantMessage = {
          role: "assistant",
          content: message.content.map((part) => this.mapMessagePart(part)),
        };

        if (message.toolCalls && message.toolCalls.length > 0) {
          mapped.tool_calls = message.toolCalls.map((toolCall) => ({
            type: "function",
            id: toolCall.callId,
            function: {
              name: toolCall.toolName,
              arguments: this.mapToolCallArgs(toolCall),
            },
          }));
        }

        return mapped;
      }
      case "tool":
        return {
          role: "tool",
          tool_call_id: message.toolCallId,
          content: message.content.map((part) => this.mapMessagePart(part)),
        };
    }
  }

  private mapMessagePart(part: MessagePart): OpenRouterMessagePart {
    switch (part.type) {
      case "text":
        return part;
      case "image":
        return {
          type: "image_url",
          image_url: { url: part.imageUrl },
        };
    }
  }

  private mapToolCallArgs(toolCall: ToolCall): string {
    if (typeof toolCall.args === "string") {
      return toolCall.args;
    }

    const serialized = Result.wrap(() => JSON.stringify(toolCall.args));
    if (Result.isErr(serialized) || serialized.value === undefined) {
      return "";
    }

    return serialized.value;
  }

  private mapToolDefinition(tool: ToolDefinition): OpenRouterToolDefintion {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };
  }
}
