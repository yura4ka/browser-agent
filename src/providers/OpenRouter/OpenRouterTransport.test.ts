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
          { role: "system", content: "System prompt" },
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
});
