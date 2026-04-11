import {
  createParser,
  type EventSourceMessage,
  type ParseError,
} from "eventsource-parser";
import { Result } from "@/core/Result";
import { EventStreamAdapter } from "../transportAdapters/EventStreamAdapter";
import type { ChatRequest, LLMStreamEvent, ProviderDeps } from "../types";
import { OpenRouterMessageBuilder } from "./OpenRouterMessageBuilder";
import type { OpenRouterChunk } from "./types";

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
          messages: request.messages,
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
}
