import { describe, expect, test } from "bun:test";
import type { AssistantMessage } from "@/core/messages";
import { Result } from "@/core/Result";
import type { ChatRequest, LLMStreamEvent, ProviderDeps } from "../types";
import { EventStreamAdapter } from "./EventStreamAdapter";

type ParserInstance = {
  feed: (chunk: string) => void;
  reset: (options?: { consume?: boolean }) => void;
};

type ReaderStep =
  | { kind: "chunk"; value: Uint8Array }
  | { kind: "done" }
  | { kind: "throw"; error: unknown };

const request: ChatRequest = {
  modelId: "model-id",
  messages: [],
  tools: [],
};

const deps: ProviderDeps = {
  config: {
    env: {},
    preferences: {
      autoAllowAllTabs: false,
      allowedUrls: [],
      promptCaching: { enabled: false, minCharacters: 2048 },
    },
  },
};

const assistantMessage: AssistantMessage = {
  role: "assistant",
  content: [{ type: "text", text: "done" }],
};

const encoder = new TextEncoder();

function textChunk(text: string): ReaderStep {
  return { kind: "chunk", value: encoder.encode(text) };
}

function bytesChunk(bytes: number[]): ReaderStep {
  return { kind: "chunk", value: new Uint8Array(bytes) };
}

function createMockReader(steps: ReaderStep[]) {
  const state = {
    readCalls: 0,
    cancelled: false,
    released: false,
  };

  let index = 0;

  const reader = {
    async read() {
      state.readCalls += 1;

      const step = steps[index] ?? { kind: "done" as const };
      index += 1;

      if (step.kind === "throw") {
        throw step.error;
      }

      if (step.kind === "done") {
        return { done: true, value: undefined };
      }

      return { done: false, value: step.value };
    },
    async cancel(): Promise<void> {
      state.cancelled = true;
    },
    releaseLock(): void {
      state.released = true;
    },
  };

  return {
    reader,
    state,
  };
}

function responseWithReader(reader: {
  read: () => Promise<unknown>;
  cancel: () => Promise<void>;
  releaseLock: () => void;
}): Response {
  return {
    body: {
      getReader: () => reader,
    },
  } as unknown as Response;
}

class TestEventStreamAdapter extends EventStreamAdapter {
  constructor(
    private readonly parserFactory: (
      enqueue: (event: LLMStreamEvent) => void,
    ) => ParserInstance,
    private readonly fetchResultFactory: () => Promise<Result<Response>>,
  ) {
    super();
  }

  protected override createParser(options: {
    enqueue: (event: LLMStreamEvent) => void;
  }): ParserInstance {
    return this.parserFactory(options.enqueue);
  }

  protected override async fetchWithStream(
    _request: ChatRequest,
    _deps: ProviderDeps,
    _signal?: AbortSignal,
  ): Promise<Result<Response>> {
    return this.fetchResultFactory();
  }
}

async function collectEvents(
  stream: AsyncGenerator<LLMStreamEvent>,
): Promise<LLMStreamEvent[]> {
  const events: LLMStreamEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe("EventStreamAdapter", () => {
  test("yields fetch error", async () => {
    const adapter = new TestEventStreamAdapter(
      () => ({
        feed: () => {},
        reset: () => {},
      }),
      async () => Result.fromCanonical("fetch failed"),
    );

    const events = await collectEvents(adapter.streamChat(request, deps));
    expect(events).toEqual([{ type: "error", error: "fetch failed" }]);
  });

  test("prefers aborted message when fetch fails and signal is aborted", async () => {
    const adapter = new TestEventStreamAdapter(
      () => ({
        feed: () => {},
        reset: () => {},
      }),
      async () => Result.fromCanonical("fetch failed"),
    );

    const controller = new AbortController();
    controller.abort();

    const events = await collectEvents(
      adapter.streamChat(request, deps, controller.signal),
    );

    expect(events).toEqual([{ type: "error", error: "Stream aborted" }]);
  });

  test("yields error when response body is missing", async () => {
    const adapter = new TestEventStreamAdapter(
      () => ({
        feed: () => {},
        reset: () => {},
      }),
      async () => Result.Ok({ body: null } as Response),
    );

    const events = await collectEvents(adapter.streamChat(request, deps));
    expect(events).toEqual([{ type: "error", error: "No response body" }]);
  });

  test("streams events and terminates on message-complete", async () => {
    const { reader, state } = createMockReader([
      textChunk("first"),
      textChunk("second"),
      { kind: "done" },
    ]);

    const adapter = new TestEventStreamAdapter(
      (enqueue) => ({
        feed: (chunk) => {
          if (chunk === "first") {
            enqueue({ type: "text-delta", text: "first" });
          }
          if (chunk === "second") {
            enqueue({ type: "text-delta", text: "second" });
            enqueue({ type: "message-complete", message: assistantMessage });
          }
        },
        reset: () => {},
      }),
      async () => Result.Ok(responseWithReader(reader)),
    );

    const events = await collectEvents(adapter.streamChat(request, deps));

    expect(events).toEqual([
      { type: "text-delta", text: "first" },
      { type: "text-delta", text: "second" },
      { type: "message-complete", message: assistantMessage },
    ]);
    expect(state.cancelled).toBe(true);
    expect(state.released).toBe(true);
  });

  test("cancels reader immediately when parser emits terminal event", async () => {
    const { reader, state } = createMockReader([
      textChunk("complete-now"),
      textChunk("should-not-read"),
      { kind: "done" },
    ]);

    const adapter = new TestEventStreamAdapter(
      (enqueue) => ({
        feed: (chunk) => {
          if (chunk === "complete-now") {
            enqueue({ type: "message-complete", message: assistantMessage });
          }
        },
        reset: () => {},
      }),
      async () => Result.Ok(responseWithReader(reader)),
    );

    const events = await collectEvents(adapter.streamChat(request, deps));

    expect(events).toEqual([
      { type: "message-complete", message: assistantMessage },
    ]);
    expect(state.cancelled).toBe(true);
    expect(state.readCalls).toBe(1);
  });

  test("formats AbortError interruptions", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";

    const { reader, state } = createMockReader([
      { kind: "throw", error: abortError },
    ]);

    const adapter = new TestEventStreamAdapter(
      () => ({
        feed: () => {},
        reset: () => {},
      }),
      async () => Result.Ok(responseWithReader(reader)),
    );

    const events = await collectEvents(adapter.streamChat(request, deps));

    expect(events).toEqual([{ type: "error", error: "Stream aborted" }]);
    expect(state.released).toBe(true);
  });

  test("formats generic reader interruptions", async () => {
    const { reader } = createMockReader([
      { kind: "throw", error: new Error("network dropped") },
    ]);

    const adapter = new TestEventStreamAdapter(
      () => ({
        feed: () => {},
        reset: () => {},
      }),
      async () => Result.Ok(responseWithReader(reader)),
    );

    const events = await collectEvents(adapter.streamChat(request, deps));

    expect(events).toEqual([
      { type: "error", error: "Stream interrupted: network dropped" },
    ]);
  });

  test("yields ended-without-terminal error after non-terminal events", async () => {
    const { reader } = createMockReader([textChunk("delta"), { kind: "done" }]);

    const adapter = new TestEventStreamAdapter(
      (enqueue) => ({
        feed: (chunk) => {
          if (chunk.length > 0) {
            enqueue({ type: "text-delta", text: chunk });
          }
        },
        reset: () => {},
      }),
      async () => Result.Ok(responseWithReader(reader)),
    );

    const events = await collectEvents(adapter.streamChat(request, deps));

    expect(events).toEqual([
      { type: "text-delta", text: "delta" },
      { type: "error", error: "Stream ended without terminal event" },
    ]);
  });

  test("flushes trailing decoder text and consumes parser reset output", async () => {
    const { reader } = createMockReader([bytesChunk([0xe2]), { kind: "done" }]);

    const resetCalls: Array<{ consume?: boolean } | undefined> = [];

    const adapter = new TestEventStreamAdapter(
      (enqueue) => ({
        feed: (chunk) => {
          if (chunk.length > 0) {
            enqueue({ type: "text-delta", text: chunk });
          }
        },
        reset: (options) => {
          resetCalls.push(options);
          if (options?.consume) {
            enqueue({ type: "message-complete", message: assistantMessage });
          }
        },
      }),
      async () => Result.Ok(responseWithReader(reader)),
    );

    const events = await collectEvents(adapter.streamChat(request, deps));

    expect(events).toEqual([
      { type: "text-delta", text: "�" },
      { type: "message-complete", message: assistantMessage },
    ]);
    expect(resetCalls).toEqual([{ consume: true }]);
  });

  test("uses reset errors as final interruption", async () => {
    const { reader } = createMockReader([{ kind: "done" }]);

    const adapter = new TestEventStreamAdapter(
      () => ({
        feed: () => {},
        reset: () => {
          throw new Error("reset boom");
        },
      }),
      async () => Result.Ok(responseWithReader(reader)),
    );

    const events = await collectEvents(adapter.streamChat(request, deps));

    expect(events).toEqual([
      { type: "error", error: "Stream interrupted: reset boom" },
    ]);
  });

  test("treats parser error events as terminal", async () => {
    const { reader, state } = createMockReader([
      textChunk("error-now"),
      textChunk("should-not-read"),
      { kind: "done" },
    ]);

    const adapter = new TestEventStreamAdapter(
      (enqueue) => ({
        feed: (chunk) => {
          if (chunk === "error-now") {
            enqueue({ type: "error", error: "bad chunk" });
          }
        },
        reset: () => {},
      }),
      async () => Result.Ok(responseWithReader(reader)),
    );

    const events = await collectEvents(adapter.streamChat(request, deps));

    expect(events).toEqual([{ type: "error", error: "bad chunk" }]);
    expect(state.cancelled).toBe(true);
    expect(state.readCalls).toBe(1);
  });
});
