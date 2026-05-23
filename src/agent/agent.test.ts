import { describe, expect, test } from "bun:test";
import z from "zod";
import type { UserConfig } from "@/core/config";
import type { AssistantMessage, UserMessage } from "@/core/messages";
import { Result } from "@/core/Result";
import { type AgentSession, EMPTY_AGENT_USAGE } from "@/core/session";
import { LLMProvider } from "@/providers/LLMProvider";
import { ProviderManager } from "@/providers/ProviderManager";
import type {
  ChatRequest,
  LLMStreamEvent,
  ModelDescriptor,
} from "@/providers/types";
import type { BrowserService } from "@/services/browser/BrowserService";
import { ToolManager } from "@/tools/ToolManager";
import { createTool } from "@/tools/tools/createTool";
import { Agent } from "./agent";
import { ContextManager } from "./ContextManager";
import type { AgentEvent } from "./types";

const config: UserConfig = {
  env: {},
  preferences: {
    allowedUrls: [],
    autoAllowAllTabs: false,
    promptCaching: { enabled: false, minCharacters: 2048 },
  },
};

const testModel: ModelDescriptor = {
  providerId: "test-provider",
  id: "test-model",
  canonicalSlug: "test-model",
  displayName: "Test Model",
  pricing: { input: 0, output: 0 },
};

class TestProvider extends LLMProvider {
  constructor(responses: LLMStreamEvent[][], requests: ChatRequest[]) {
    super(
      { id: "test-provider", displayName: "Test Provider" },
      {
        discoverModels: async () => Result.Ok([testModel]),
      },
      {
        streamChat: async function* (request) {
          requests.push(request);

          for (const event of responses.shift() ?? []) {
            yield event;
          }
        },
      },
    );
  }
}

class ThrowingProvider extends LLMProvider {
  constructor(requests: ChatRequest[]) {
    super(
      { id: "test-provider", displayName: "Test Provider" },
      {
        discoverModels: async () => Result.Ok([testModel]),
      },
      {
        streamChat: async function* (request) {
          requests.push(request);
          if (request.modelId === "never") {
            yield { type: "sse-comment", content: "unused" };
          }
          throw new Error("provider exploded");
        },
      },
    );
  }
}

function createSession(input: Partial<AgentSession> = {}): AgentSession {
  return {
    id: "session-id",
    title: "Session",
    systemPrompt: "System prompt",
    selectedModel: {
      providerId: "test-provider",
      modelId: "test-model",
    },
    turns: [],
    usage: EMPTY_AGENT_USAGE,
    ...input,
  };
}

function userMessage(text: string): UserMessage {
  return {
    role: "user",
    content: [{ type: "text", text }],
  };
}

function assistantMessage(
  text: string,
  toolCalls: AssistantMessage["toolCalls"] = [],
): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    toolCalls,
  };
}

async function createProviderManager(responses: LLMStreamEvent[][]): Promise<{
  providers: ProviderManager;
  requests: ChatRequest[];
}> {
  const requests: ChatRequest[] = [];
  const providers = new ProviderManager().add(
    new TestProvider(responses, requests),
  );

  await providers.initAll(config);
  providers.select(testModel.providerId, testModel.id);
  return { providers, requests };
}

async function createThrowingProviderManager(): Promise<{
  providers: ProviderManager;
  requests: ChatRequest[];
}> {
  const requests: ChatRequest[] = [];
  const providers = new ProviderManager().add(new ThrowingProvider(requests));

  await providers.initAll(config);
  providers.select(testModel.providerId, testModel.id);
  return { providers, requests };
}

async function collectEvents(
  stream: AsyncGenerator<AgentEvent>,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];

  for await (const event of stream) {
    events.push(event);
  }

  return events;
}

function createAgent(providers: ProviderManager, tools = new ToolManager()) {
  return new Agent(
    providers,
    tools,
    new ContextManager(),
    {} as BrowserService,
  );
}

describe("Agent", () => {
  test("streams a completed assistant response and appends a turn", async () => {
    const session = createSession();
    const { providers, requests } = await createProviderManager([
      [
        { type: "text-delta", text: "Hello" },
        {
          type: "message-complete",
          message: assistantMessage("Hello"),
          usage: {
            cost: 0.001,
            inputTokens: 10,
            outputTokens: 3,
            totalTokens: 13,
          },
        },
      ],
    ]);
    const agent = createAgent(providers);

    const events = await collectEvents(
      agent.runTurn({ session, config }, userMessage("Hi")),
    );

    expect(events).toEqual([
      { type: "assistant-text", text: "Hello" },
      { type: "done" },
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.messages).toEqual([
      { role: "system", content: "System prompt" },
      userMessage("Hi"),
    ]);
    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]?.status).toBe("completed");
    expect(session.turns[0]?.messages).toEqual([
      userMessage("Hi"),
      assistantMessage("Hello"),
    ]);
    expect(session.usage).toEqual({
      cost: 0.001,
      inputTokens: 10,
      outputTokens: 3,
      totalTokens: 13,
    });
  });

  test("executes tool calls and continues with tool results in context", async () => {
    const session = createSession();
    const toolManager = new ToolManager().addTool(
      createTool({
        name: "test_tool",
        description: "Returns a test value.",
        argsSchema: z.strictObject({ value: z.string() }),
        execute: async (_context, args) =>
          Result.Ok({ type: "text", content: `tool:${args.value}` }),
      }),
    );
    const toolCall = {
      callId: "call-1",
      toolName: "test_tool",
      args: '{"value":"abc"}',
    };
    const firstAssistant = assistantMessage("", [toolCall]);
    const finalAssistant = assistantMessage("Done");
    const { providers, requests } = await createProviderManager([
      [{ type: "message-complete", message: firstAssistant }],
      [
        { type: "text-delta", text: "Done" },
        { type: "message-complete", message: finalAssistant },
      ],
    ]);
    const agent = createAgent(providers, toolManager);

    const events = await collectEvents(
      agent.runTurn({ session, config }, userMessage("Use a tool")),
    );

    expect(events).toEqual([
      { type: "tool-call", call: toolCall },
      {
        type: "tool-result",
        callId: "call-1",
        result: Result.Ok([{ type: "text", content: "tool:abc" }]),
      },
      { type: "assistant-text", text: "Done" },
      { type: "done" },
    ]);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.tools?.[0]?.name).toBe("test_tool");
    expect(requests[1]?.messages.at(-2)).toEqual(firstAssistant);
    expect(requests[1]?.messages.at(-1)).toEqual({
      role: "tool",
      toolCallId: "call-1",
      toolName: "test_tool",
      content: [{ type: "text", text: "tool:abc" }],
    });
    expect(session.turns[0]?.status).toBe("completed");
    expect(session.turns[0]?.messages).toEqual([
      userMessage("Use a tool"),
      firstAssistant,
      {
        role: "tool",
        toolCallId: "call-1",
        toolName: "test_tool",
        content: [{ type: "text", text: "tool:abc" }],
      },
      finalAssistant,
    ]);
  });

  test("reports a missing selected model error", async () => {
    const session = createSession();
    const agent = createAgent(new ProviderManager());

    const events = await collectEvents(
      agent.runTurn({ session, config }, userMessage("Hi")),
    );

    expect(events).toEqual([{ type: "error", error: "No model selected" }]);
    expect(session.turns).toEqual([]);
  });

  test("persists provider failures and includes a recovery note in later context", async () => {
    const session = createSession();
    const { providers, requests } = await createProviderManager([
      [{ type: "error", error: "provider down" }],
      [{ type: "message-complete", message: assistantMessage("Recovered") }],
    ]);
    const agent = createAgent(providers);

    const failedEvents = await collectEvents(
      agent.runTurn({ session, config }, userMessage("Do the task")),
    );
    const recoveredEvents = await collectEvents(
      agent.runTurn({ session, config }, userMessage("Try again differently")),
    );

    expect(failedEvents).toEqual([{ type: "error", error: "provider down" }]);
    expect(recoveredEvents).toEqual([{ type: "done" }]);
    expect(session.turns[0]?.status).toBe("failed");
    expect(session.turns[0]?.error).toBe("provider down");
    expect(requests[1]?.messages).toEqual([
      { role: "system", content: "System prompt" },
      userMessage("Do the task"),
      {
        role: "system",
        content:
          "Previous turn failed with error: provider down. If relevant, recover or ask for clarification instead of assuming the task completed.",
      },
      userMessage("Try again differently"),
    ]);
  });

  test("persists unexpected provider exceptions", async () => {
    const session = createSession();
    const { providers, requests } = await createThrowingProviderManager();
    const agent = createAgent(providers);

    const events = await collectEvents(
      agent.runTurn({ session, config }, userMessage("Do the task")),
    );

    expect(events).toEqual([{ type: "error", error: "provider exploded" }]);
    expect(requests).toHaveLength(1);
    expect(session.turns[0]?.status).toBe("failed");
    expect(session.turns[0]?.error).toBe("provider exploded");
    expect(session.turns[0]?.messages).toEqual([userMessage("Do the task")]);
  });

  test("persists aborted turns", async () => {
    const session = createSession();
    const { providers, requests } = await createProviderManager([]);
    const agent = createAgent(providers);
    const controller = new AbortController();
    controller.abort();

    const events = await collectEvents(
      agent.runTurn(
        { session, config, signal: controller.signal },
        userMessage("Stop this"),
      ),
    );

    expect(events).toEqual([{ type: "error", error: "Aborted" }]);
    expect(requests).toEqual([]);
    expect(session.turns[0]?.status).toBe("aborted");
    expect(session.turns[0]?.error).toBe("Aborted");
    expect(session.turns[0]?.messages).toEqual([userMessage("Stop this")]);
  });

  test("persists max-iteration turns", async () => {
    const session = createSession();
    const toolCall = {
      callId: "call-1",
      toolName: "missing_tool",
      args: {},
    };
    const { providers } = await createProviderManager([
      [{ type: "message-complete", message: assistantMessage("", [toolCall]) }],
    ]);
    const agent = createAgent(providers);

    const events = await collectEvents(
      agent.runTurn(
        { session, config, maxIterations: 1 },
        userMessage("Use missing tool"),
      ),
    );

    expect(events.at(-1)).toEqual({
      type: "error",
      error: "Agent stopped after 1 iterations",
    });
    expect(session.turns[0]?.status).toBe("max_iterations");
    expect(session.turns[0]?.error).toBe("Agent stopped after 1 iterations");
  });
});
