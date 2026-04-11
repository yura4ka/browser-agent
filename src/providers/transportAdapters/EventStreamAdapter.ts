import { Result } from "@/core/Result";
import type {
  ChatRequest,
  LLMStreamEvent,
  ProviderDeps,
  ProviderTransport,
} from "../types";

type ParserFactoryOptions = {
  enqueue: (event: LLMStreamEvent) => void;
};

type ParserInstance = {
  feed: (chunk: string) => void;
  reset: (options?: { consume?: boolean }) => void;
};

export abstract class EventStreamAdapter implements ProviderTransport {
  protected abstract createParser(
    options: ParserFactoryOptions,
  ): ParserInstance;

  protected abstract fetchWithStream(
    request: ChatRequest,
    deps: ProviderDeps,
    signal?: AbortSignal,
  ): Promise<Result<Response>>;

  async *streamChat(
    request: ChatRequest,
    deps: ProviderDeps,
    signal?: AbortSignal,
  ): AsyncGenerator<LLMStreamEvent> {
    const fetchResult = await this.fetchWithStream(request, deps, signal);

    if (Result.isErr(fetchResult)) {
      yield {
        type: "error",
        error: signal?.aborted ? "Stream aborted" : fetchResult.error.message,
      };
      return;
    }

    const body = fetchResult.value.body;
    if (!body) {
      yield { type: "error", error: "No response body" };
      return;
    }

    let hasTerminated = false;
    const eventsQueue: LLMStreamEvent[] = [];
    const decoder = new TextDecoder();
    const parser = this.createParser({
      enqueue: (event) => {
        if (event.type === "error" || event.type === "message-complete") {
          hasTerminated = true;
        }
        eventsQueue.push(event);
      },
    });

    const drainQueue = (): LLMStreamEvent[] => {
      if (eventsQueue.length === 0) return [];
      return eventsQueue.splice(0, eventsQueue.length);
    };

    const reader = body.getReader();
    let interruptionError: string | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        parser.feed(decoder.decode(value, { stream: true }));
        for (const event of drainQueue()) {
          yield event;
        }

        if (hasTerminated) {
          await reader.cancel();
          break;
        }
      }
    } catch (error) {
      interruptionError = this.formatStreamInterruption(error);
    } finally {
      reader.releaseLock();
    }

    if (!signal?.aborted && !hasTerminated) {
      try {
        const trailingText = decoder.decode();
        if (trailingText.length > 0) {
          parser.feed(trailingText);
        }
        parser.reset({ consume: true });
      } catch (error) {
        interruptionError ??= this.formatStreamInterruption(error);
      }
    }

    for (const event of drainQueue()) {
      yield event;
    }

    if (!hasTerminated) {
      yield {
        type: "error",
        error:
          interruptionError ??
          (signal?.aborted
            ? "Stream aborted"
            : "Stream ended without terminal event"),
      };
    }
  }

  private formatStreamInterruption(error: unknown): string {
    if (error instanceof Error && error.name === "AbortError") {
      return "Stream aborted";
    }

    if (error instanceof Error && error.message.length > 0) {
      return `Stream interrupted: ${error.message}`;
    }

    return "Stream interrupted unexpectedly";
  }
}
