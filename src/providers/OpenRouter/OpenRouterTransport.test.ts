import { describe, expect, test } from "bun:test";
import type { ChatRequest, LLMStreamEvent, ProviderDeps } from "../types";
import { OpenRouterTransport } from "./OpenRouterTransport";

const deps: ProviderDeps = {
  config: {
    env: {
      OPENROUTER_API_KEY: "test-key",
    },
    preferences: {
      autoAllowAllTabs: false,
      allowedUrls: [],
      promptCaching: {
        enabled: false,
        minCharacters: 2048,
      },
    },
  },
};

const promptCachingDeps: ProviderDeps = {
  config: {
    ...deps.config,
    preferences: {
      ...deps.config.preferences,
      promptCaching: {
        enabled: true,
        minCharacters: 10,
      },
    },
  },
};

async function collectEvents(
  stream: AsyncGenerator<LLMStreamEvent>,
): Promise<LLMStreamEvent[]> {
  const events: LLMStreamEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function streamResponse(text: string): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
  );
}

describe("OpenRouterTransport", () => {
  test("maps canonical messages to OpenRouter request messages", async () => {
    const originalFetch = globalThis.fetch;
    let body: unknown;

    globalThis.fetch = (async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return streamResponse("data: [DONE]\n\n");
    }) as typeof fetch;

    try {
      const request: ChatRequest = {
        modelId: "model-id",
        messages: [
          { role: "system", content: "System prompt" },
          {
            role: "user",
            content: [
              { type: "text", text: "Look at this" },
              { type: "image", imageUrl: "https://example.com/image.png" },
            ],
          },
          {
            role: "assistant",
            content: [{ type: "text", text: "I'll use a tool" }],
            toolCalls: [
              {
                callId: "call-1",
                toolName: "search",
                args: { query: "browser agent" },
              },
              {
                callId: "call-2",
                toolName: "open",
                args: '{"url":"https://example.com"}',
              },
            ],
          },
          {
            role: "tool",
            toolCallId: "call-1",
            toolName: "search",
            success: true,
            content: [{ type: "text", text: "Search result" }],
          },
        ],
        tools: [],
      };

      const events = await collectEvents(
        new OpenRouterTransport().streamChat(request, deps),
      );

      expect(events).toEqual([
        {
          type: "message-complete",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "" }],
            toolCalls: [],
          },
        },
      ]);
      expect(body).toEqual({
        model: "model-id",
        messages: [
          {
            role: "system",
            content: [{ type: "text", text: "System prompt" }],
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Look at this" },
              {
                type: "image_url",
                image_url: { url: "https://example.com/image.png" },
              },
            ],
          },
          {
            role: "assistant",
            content: [{ type: "text", text: "I'll use a tool" }],
            tool_calls: [
              {
                type: "function",
                id: "call-1",
                function: {
                  name: "search",
                  arguments: '{"query":"browser agent"}',
                },
              },
              {
                type: "function",
                id: "call-2",
                function: {
                  name: "open",
                  arguments: '{"url":"https://example.com"}',
                },
              },
            ],
          },
          {
            role: "tool",
            tool_call_id: "call-1",
            content: [{ type: "text", text: "Search result" }],
          },
        ],
        tools: [],
        stream: true,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("ignores null content stream deltas", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (_input, _init) => {
      return streamResponse(
        [
          'data: {"choices":[{"delta":{"content":null}}]}',
          'data: {"choices":[{"delta":{"content":"Hi"}}]}',
          "data: [DONE]",
          "",
        ].join("\n\n"),
      );
    }) as typeof fetch;

    try {
      const request: ChatRequest = {
        modelId: "model-id",
        messages: [
          { role: "user", content: [{ type: "text", text: "Hello" }] },
        ],
        tools: [],
      };

      const events = await collectEvents(
        new OpenRouterTransport().streamChat(request, deps),
      );

      expect(events).toEqual([
        { type: "text-delta", text: "Hi" },
        {
          type: "message-complete",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Hi" }],
            toolCalls: [],
          },
        },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("maps final OpenRouter usage chunk", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (_input, _init) => {
      return streamResponse(
        [
          'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":"stop"}]}',
          'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":4,"total_tokens":14,"cost":0.00014}}',
          "data: [DONE]",
          "",
        ].join("\n\n"),
      );
    }) as typeof fetch;

    try {
      const request: ChatRequest = {
        modelId: "model-id",
        messages: [
          { role: "user", content: [{ type: "text", text: "Hello" }] },
        ],
        tools: [],
      };

      const events = await collectEvents(
        new OpenRouterTransport().streamChat(request, deps),
      );

      expect(events).toEqual([
        { type: "text-delta", text: "Hi" },
        {
          type: "message-complete",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Hi" }],
            toolCalls: [],
          },
          usage: {
            cost: 0.00014,
            inputTokens: 10,
            outputTokens: 4,
            totalTokens: 14,
          },
        },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("adds cache control to the first eligible system prompt", async () => {
    const originalFetch = globalThis.fetch;
    let body: unknown;

    globalThis.fetch = (async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return streamResponse("data: [DONE]\n\n");
    }) as typeof fetch;

    try {
      const request: ChatRequest = {
        modelId: "model-id",
        messages: [
          { role: "system", content: "Long stable system prompt" },
          { role: "system", content: "Dynamic status" },
          { role: "user", content: [{ type: "text", text: "Hello" }] },
        ],
        tools: [],
      };

      await collectEvents(
        new OpenRouterTransport().streamChat(request, promptCachingDeps),
      );

      expect(body).toEqual({
        model: "model-id",
        messages: [
          {
            role: "system",
            content: [
              {
                type: "text",
                text: "Long stable system prompt",
                cache_control: { type: "ephemeral" },
              },
            ],
          },
          {
            role: "system",
            content: [{ type: "text", text: "Dynamic status" }],
          },
          {
            role: "user",
            content: [{ type: "text", text: "Hello" }],
          },
        ],
        tools: [],
        stream: true,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("does not cache short system prompts", async () => {
    const originalFetch = globalThis.fetch;
    let body: unknown;

    globalThis.fetch = (async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return streamResponse("data: [DONE]\n\n");
    }) as typeof fetch;

    try {
      const request: ChatRequest = {
        modelId: "model-id",
        messages: [
          { role: "system", content: "Short" },
          { role: "user", content: [{ type: "text", text: "Hello" }] },
        ],
        tools: [],
      };

      await collectEvents(
        new OpenRouterTransport().streamChat(request, promptCachingDeps),
      );

      expect(body).toEqual({
        model: "model-id",
        messages: [
          { role: "system", content: [{ type: "text", text: "Short" }] },
          {
            role: "user",
            content: [{ type: "text", text: "Hello" }],
          },
        ],
        tools: [],
        stream: true,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("adds cache control to recent long text-only tool results", async () => {
    const originalFetch = globalThis.fetch;
    let body: unknown;

    globalThis.fetch = (async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return streamResponse("data: [DONE]\n\n");
    }) as typeof fetch;

    try {
      const request: ChatRequest = {
        modelId: "model-id",
        messages: [
          {
            role: "tool",
            toolCallId: "call-1",
            toolName: "getTextContent",
            success: true,
            content: [{ type: "text", text: "Old long result" }],
          },
          {
            role: "tool",
            toolCallId: "call-2",
            toolName: "getTextContent",
            success: true,
            content: [{ type: "text", text: "Recent long result" }],
          },
          {
            role: "tool",
            toolCallId: "call-3",
            toolName: "getHtmlContent",
            success: true,
            content: [{ type: "text", text: "Another long result" }],
          },
          {
            role: "tool",
            toolCallId: "call-4",
            toolName: "getAriaSnapshot",
            success: true,
            content: [{ type: "text", text: "Newest long result" }],
          },
        ],
        tools: [],
      };

      await collectEvents(
        new OpenRouterTransport().streamChat(request, promptCachingDeps),
      );

      expect(body).toEqual({
        model: "model-id",
        messages: [
          {
            role: "tool",
            tool_call_id: "call-1",
            content: [{ type: "text", text: "Old long result" }],
          },
          {
            role: "tool",
            tool_call_id: "call-2",
            content: [
              {
                type: "text",
                text: "Recent long result",
              },
            ],
          },
          {
            role: "tool",
            tool_call_id: "call-3",
            content: [
              {
                type: "text",
                text: "Another long result",
              },
            ],
          },
          {
            role: "tool",
            tool_call_id: "call-4",
            content: [
              {
                type: "text",
                text: "Newest long result",
                cache_control: { type: "ephemeral" },
              },
            ],
          },
        ],
        tools: [],
        stream: true,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("does not cache short, failed, or image tool results", async () => {
    const originalFetch = globalThis.fetch;
    let body: unknown;

    globalThis.fetch = (async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return streamResponse("data: [DONE]\n\n");
    }) as typeof fetch;

    try {
      const request: ChatRequest = {
        modelId: "model-id",
        messages: [
          {
            role: "tool",
            toolCallId: "call-1",
            toolName: "getTextContent",
            success: true,
            content: [{ type: "text", text: "Short" }],
          },
          {
            role: "tool",
            toolCallId: "call-2",
            toolName: "getTextContent",
            success: false,
            content: [{ type: "text", text: "Long failed result" }],
          },
          {
            role: "tool",
            toolCallId: "call-3",
            toolName: "screenshot",
            success: true,
            content: [
              { type: "text", text: "Took screenshot" },
              { type: "image", imageUrl: "data:image/jpeg;base64,abc" },
            ],
          },
        ],
        tools: [],
      };

      await collectEvents(
        new OpenRouterTransport().streamChat(request, promptCachingDeps),
      );

      expect(body).toEqual({
        model: "model-id",
        messages: [
          {
            role: "tool",
            tool_call_id: "call-1",
            content: [{ type: "text", text: "Short" }],
          },
          {
            role: "tool",
            tool_call_id: "call-2",
            content: [{ type: "text", text: "Long failed result" }],
          },
          {
            role: "tool",
            tool_call_id: "call-3",
            content: [
              { type: "text", text: "Took screenshot" },
              {
                type: "image_url",
                image_url: { url: "data:image/jpeg;base64,abc" },
              },
            ],
          },
        ],
        tools: [],
        stream: true,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
