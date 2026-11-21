import { expect, mock, test } from "bun:test";
import { Result } from "@/core/Result";
import type { ChatRequest, LLMStreamEvent, ProviderDeps } from "../types";
import { ChatGPTPlanCatalog } from "./ChatGPTPlanCatalog";
import {
  buildResponsesRequest,
  TOOL_NAMESPACE,
} from "./ChatGPTPlanMessageBuilder";
import { ChatGPTPlanTransport } from "./ChatGPTPlanTransport";

const deps: ProviderDeps = {
  config: {
    env: {},
    preferences: {
      allowedUrls: [],
      autoAllowAllTabs: false,
      promptCaching: { enabled: false, minCharacters: 2048 },
    },
  },
  registrationKey: "fixture",
};
const tool = {
  name: "screenshot",
  description: "Fixture tool",
  parameters: { type: "object" },
};
const request: ChatRequest = {
  modelId: "model",
  tools: [tool],
  messages: [],
  sessionId: "not-on-wire",
};
const getAccessToken = async () => Result.Ok("fake-bearer");
const fakeFetch = (
  fn: (url: URL | string | Request, init?: RequestInit) => Promise<Response>,
): typeof fetch => Object.assign(fn, { preconnect: () => {} });

function sse(...events: object[]) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(
    events.map((value) => `data: ${JSON.stringify(value)}\r\n\r\n`).join(""),
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    }),
    { headers: { "x-request-id": "req_fixture" } },
  );
}
async function collect(stream: AsyncGenerator<LLMStreamEvent>) {
  const events: LLMStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

test("catalog uses plan billing and preserves the service's order for visible models", async () => {
  const fetcher = fakeFetch(async (url, init) => {
    expect(String(url)).toBe("https://api.openai.com/v1/models");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer fake-bearer",
    );
    return Response.json({
      models: [
        { slug: "z", display_name: "Z", visibility: "list" },
        { slug: "hidden", visibility: "hidden" },
        { slug: "a", display_name: "A", visibility: "list" },
      ],
    });
  });
  const catalog = new ChatGPTPlanCatalog(
    { getAccessToken, reportFailure: async () => Result.Ok(undefined) },
    fetcher,
  );
  const result = await catalog.discoverModels(deps);
  expect(result).toMatchObject({
    ok: true,
    value: [
      { id: "z", billing: "chatgpt-plan" },
      { id: "a", billing: "chatgpt-plan" },
    ],
  });
});

test("request replays only matched tool history and preserves developer messages and screenshots", () => {
  const image = "data:image/png;base64,fixture";
  const built = buildResponsesRequest({
    ...request,
    messages: [
      { role: "system", content: "Initial" },
      { role: "user", content: [{ type: "image", imageUrl: image }] },
      {
        role: "assistant",
        content: [],
        toolCalls: [
          { callId: "call_old", toolName: tool.name, args: {} },
          { callId: "call_unmatched", toolName: tool.name, args: {} },
          { callId: "call_stripped", toolName: tool.name, args: {} },
        ],
      },
      {
        role: "tool",
        toolCallId: "call_old",
        toolName: tool.name,
        success: false,
        content: [{ type: "image", imageUrl: image }],
      },
      {
        role: "tool",
        toolCallId: "call_stripped",
        toolName: tool.name,
        success: true,
        content: [],
      },
      { role: "system", content: "Interrupted" },
    ],
  });
  expect(built).toMatchObject({
    store: false,
    stream: true,
    tools: [{ name: TOOL_NAMESPACE, tools: [{ strict: false }] }],
  });
  expect(built.input).toEqual([
    { type: "message", role: "developer", content: "Initial" },
    {
      type: "message",
      role: "user",
      content: [{ type: "input_image", image_url: image, detail: "auto" }],
    },
    {
      type: "function_call",
      call_id: "call_old",
      namespace: TOOL_NAMESPACE,
      name: tool.name,
      arguments: "{}",
    },
    {
      type: "function_call",
      call_id: "call_stripped",
      namespace: TOOL_NAMESPACE,
      name: tool.name,
      arguments: "{}",
    },
    {
      type: "function_call_output",
      call_id: "call_old",
      output: [
        { type: "input_text", text: "Tool failed:" },
        { type: "input_image", image_url: image, detail: "auto" },
      ],
    },
    {
      type: "function_call_output",
      call_id: "call_stripped",
      output: [
        {
          type: "input_text",
          text: "Tool output unavailable in saved history.",
        },
      ],
    },
    { type: "message", role: "developer", content: "Interrupted" },
  ]);
  expect(built).not.toHaveProperty("previous_response_id");
  expect(built).not.toHaveProperty("sessionId");
});

test("transport assembles interleaved calls after a split UTF-8 stream and accepts only one terminal event", async () => {
  const wireCall = (suffix: string) => ({
    type: "function_call",
    id: `item_${suffix}`,
    call_id: `call_${suffix}`,
    namespace: TOOL_NAMESPACE,
    name: tool.name,
    arguments: "",
  });
  const delta = (suffix: string, value: string) => ({
    type: "response.function_call_arguments.delta",
    item_id: `item_${suffix}`,
    delta: value,
  });
  const transport = new ChatGPTPlanTransport(
    { getAccessToken, reportFailure: async () => Result.Ok(undefined) },
    fakeFetch(async () =>
      sse(
        { type: "response.output_text.delta", delta: "✓" },
        { type: "response.output_item.added", item: wireCall("a") },
        { type: "response.output_item.added", item: wireCall("b") },
        delta("b", '{"page":'),
        delta("a", "{"),
        delta("b", "2}"),
        delta("a", "}"),
        {
          type: "response.completed",
          response: {
            output: [wireCall("a"), wireCall("b")],
            usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
          },
        },
        { type: "response.failed" },
      ),
    ),
  );
  expect(await collect(transport.streamChat(request, deps))).toEqual([
    { type: "text-delta", text: "✓" },
    {
      type: "message-complete",
      usage: {
        inputTokens: 3,
        outputTokens: 2,
        totalTokens: 5,
        cost: 0,
      },
      message: {
        role: "assistant",
        content: [{ type: "text", text: "✓" }],
        toolCalls: [
          { callId: "call_a", toolName: tool.name, args: {} },
          { callId: "call_b", toolName: tool.name, args: { page: 2 } },
        ],
      },
    },
  ]);
});

test("transport pauses on late quota failure, and treats incomplete and EOF as non-completion", async () => {
  const reportFailure = mock(
    async (_key: string, _token: string, _reason: string) =>
      Result.Ok(undefined),
  );
  const accounts = { getAccessToken, reportFailure };
  const partial = { type: "response.output_text.delta", delta: "partial" };
  const quota = {
    type: "response.failed",
    response: {
      error: {
        code: "subscription_sharing_usage_limit_exceeded",
        message: "never print this",
      },
    },
  };
  for (const [events, kind] of [
    [[partial, quota], "usage-limited"],
    [[partial], "interrupted"],
    [[partial, { type: "response.incomplete" }], "incomplete"],
  ] as const) {
    const transport = new ChatGPTPlanTransport(
      accounts,
      fakeFetch(async () => sse(...events)),
    );
    const result = await collect(transport.streamChat(request, deps));
    expect(result).toMatchObject([
      { type: "text-delta" },
      { type: "error", details: { kind, requestId: "req_fixture" } },
    ]);
    expect(JSON.stringify(result)).not.toContain("never print this");
  }
  expect(reportFailure.mock.calls).toEqual([
    ["fixture", "fake-bearer", "usage-limited"],
  ]);
});

test("an abort cancels the response reader even while a mocked fetch body is waiting", async () => {
  const controller = new AbortController();
  const cancel = mock(() => {});
  const transport = new ChatGPTPlanTransport(
    {
      getAccessToken,
      reportFailure: async () => Result.Ok(undefined),
    },
    fakeFetch(
      async () =>
        new Response(
          new ReadableStream({
            start(body) {
              body.enqueue(
                new TextEncoder().encode(
                  'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
                ),
              );
            },
            cancel,
          }),
        ),
    ),
  );
  const stream = transport.streamChat(request, deps, controller.signal);
  expect((await stream.next()).value).toEqual({
    type: "text-delta",
    text: "partial",
  });
  controller.abort();
  const result = await collect(stream);
  expect(result).toMatchObject([
    { type: "error", details: { kind: "aborted" } },
  ]);
  expect(cancel).toHaveBeenCalledTimes(1);
});

test("admission errors without an API error object are sanitized and do not erase credentials", async () => {
  const reportFailure = mock(
    async (_key: string, _token: string, _reason: string) =>
      Result.Ok(undefined),
  );
  const transport = new ChatGPTPlanTransport(
    { getAccessToken, reportFailure },
    fakeFetch(async () =>
      Response.json(
        { detail: "unsafe upstream detail" },
        {
          status: 403,
          headers: { "x-request-id": "req_fixture" },
        },
      ),
    ),
  );
  const result = await collect(transport.streamChat(request, deps));
  expect(result).toMatchObject([
    { type: "error", details: { status: 403, requestId: "req_fixture" } },
  ]);
  expect(JSON.stringify(result)).not.toContain("unsafe upstream detail");
  expect(reportFailure).not.toHaveBeenCalled();
});
