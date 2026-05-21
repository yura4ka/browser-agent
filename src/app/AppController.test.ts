import { describe, expect, test } from "bun:test";
import type { AgentEvent } from "@/agent/types";
import type { ConfigService, UserConfig } from "@/core/config";
import type { AssistantMessage } from "@/core/messages";
import { Result } from "@/core/Result";
import type { AgentSession } from "@/core/session";
import { LLMProvider } from "@/providers/LLMProvider";
import { ProviderManager } from "@/providers/ProviderManager";
import type { ChatRequest, ModelDescriptor } from "@/providers/types";
import type {
  AgentSessionSummary,
  CreateSessionInput,
  SessionStore,
} from "@/storage/SessionStore";
import { AppController } from "./AppController";

const config: UserConfig = {
  env: {},
  preferences: {
    allowedUrls: [],
    autoAllowAllTabs: false,
  },
};

const configService = {
  init: async () => undefined,
  get: () => config,
} satisfies Pick<ConfigService, "get" | "init">;

const testModels: ModelDescriptor[] = [
  {
    providerId: "test-provider",
    id: "z-model",
    canonicalSlug: "z-model",
    displayName: "Z Model",
  },
  {
    providerId: "test-provider",
    id: "a-model",
    canonicalSlug: "a-model",
    displayName: "A Model",
  },
];

class TestProvider extends LLMProvider {
  constructor() {
    super(
      { id: "test-provider", displayName: "Test Provider" },
      {
        discoverModels: async () => Result.Ok(testModels),
      },
      {
        streamChat: async function* (_request: ChatRequest) {
          yield { type: "message-complete", message: assistantMessage("Hi") };
        },
      },
    );
  }
}

class TestSessionStore implements SessionStore {
  sessions = new Map<string, AgentSession>();
  createInputs: CreateSessionInput[] = [];
  listResult: Awaited<ReturnType<SessionStore["listSessions"]>> = Result.Ok([]);

  async createSession(
    input: CreateSessionInput,
  ): Promise<Result<AgentSession>> {
    this.createInputs.push(input);

    const session = createSession({
      id: input.id ?? `created-${this.createInputs.length}`,
      title: input.title ?? "Untitled session",
      systemPrompt: input.systemPrompt ?? "",
      selectedModel: input.selectedModel,
      turns: input.turns ?? [],
    });
    this.sessions.set(session.id, session);
    return Result.Ok(session);
  }

  async getSession(sessionId: string): Promise<Result<AgentSession | null>> {
    return Result.Ok(this.sessions.get(sessionId) ?? null);
  }

  async saveSession(session: AgentSession): Promise<Result<void>> {
    this.sessions.set(session.id, session);
    return Result.Ok(undefined);
  }

  async deleteSession(sessionId: string): Promise<Result<void>> {
    this.sessions.delete(sessionId);
    return Result.Ok(undefined);
  }

  async listSessions(): Promise<Result<AgentSessionSummary[]>> {
    return this.listResult;
  }
}

class TestChatService {
  calls: { sessionId: string; text: string; signal?: AbortSignal }[] = [];

  constructor(
    private readonly events: AgentEvent[] = [{ type: "done" }],
    private readonly thrown?: unknown,
  ) {}

  async *chat(
    sessionId: string,
    text: string,
    signal?: AbortSignal,
  ): AsyncGenerator<AgentEvent> {
    this.calls.push({ sessionId, text, signal });

    if (this.thrown) {
      throw this.thrown;
    }

    for (const event of this.events) {
      yield event;
    }
  }
}

async function createProviderManager(): Promise<ProviderManager> {
  const providers = new ProviderManager().add(new TestProvider());
  await providers.initAll(config);
  return providers;
}

function createController(input: {
  providers: ProviderManager;
  sessions?: TestSessionStore;
  chatService?: TestChatService;
}) {
  const sessions = input.sessions ?? new TestSessionStore();
  const chatService = input.chatService ?? new TestChatService();
  const controller = new AppController({
    config: configService,
    providers: input.providers,
    sessions,
    chatService,
  });

  return { controller, sessions, chatService };
}

function createSession(input: Partial<AgentSession> = {}): AgentSession {
  return {
    id: "session-id",
    title: "Session",
    systemPrompt: "System prompt",
    selectedModel: { providerId: "test-provider", modelId: "a-model" },
    turns: [],
    ...input,
  };
}

function assistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
  };
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

describe("AppController", () => {
  test("lists providers and sorted provider models", async () => {
    const providers = await createProviderManager();
    const { controller } = createController({ providers });

    expect(controller.getProviders()).toEqual([
      {
        id: "test-provider",
        displayName: "Test Provider",
        connectionResult: Result.Ok(undefined),
      },
    ]);

    const modelsResult = controller.getModels("test-provider");

    expect(Result.isOk(modelsResult)).toBe(true);
    if (Result.isErr(modelsResult)) throw modelsResult.error;
    expect(modelsResult.value.map((model) => model.displayName)).toEqual([
      "A Model",
      "Z Model",
    ]);
  });

  test("selects a model", async () => {
    const providers = await createProviderManager();
    const { controller } = createController({ providers });

    const selectResult = controller.selectModel("test-provider", "a-model");

    expect(Result.isOk(selectResult)).toBe(true);
    expect(controller.getSelectedModel()?.model.id).toBe("a-model");
  });

  test("lists sessions", async () => {
    const providers = await createProviderManager();
    const sessions = new TestSessionStore();
    sessions.listResult = Result.Ok([
      { id: "session-1", title: "Session 1", lastTurnAt: "time" },
    ]);
    const { controller } = createController({ providers, sessions });

    const result = await controller.listSessions();

    expect(result).toEqual(
      Result.Ok([{ id: "session-1", title: "Session 1", lastTurnAt: "time" }]),
    );
  });

  test("selects an existing session", async () => {
    const providers = await createProviderManager();
    const sessions = new TestSessionStore();
    const session = createSession({ id: "existing" });
    sessions.sessions.set(session.id, session);
    const { controller } = createController({ providers, sessions });

    const result = await controller.selectSession("existing");
    const selected = await controller.getSelectedSession();

    expect(result).toEqual(Result.Ok(session));
    expect(selected).toEqual(Result.Ok(session));
    expect(controller.getSelectedModel()?.model.id).toBe("a-model");
  });

  test("starts a new session without persisting until first chat", async () => {
    const providers = await createProviderManager();
    const { controller, sessions } = createController({ providers });

    controller.startNewSession();
    const selected = await controller.getSelectedSession();

    expect(selected).toEqual(Result.Ok(null));
    expect(sessions.createInputs).toEqual([]);
  });

  test("creates and selects a session on first chat", async () => {
    const providers = await createProviderManager();
    const { controller, sessions, chatService } = createController({
      providers,
    });
    expect(
      Result.isOk(controller.selectModel("test-provider", "a-model")),
    ).toBe(true);

    const events = await collectEvents(controller.chat("Hello new session"));
    const selected = await controller.getSelectedSession();

    expect(events).toEqual([{ type: "done" }]);
    expect(sessions.createInputs).toEqual([
      {
        title: "Hello new session",
        selectedModel: { providerId: "test-provider", modelId: "a-model" },
      },
    ]);
    expect(chatService.calls[0]?.sessionId).toBe("created-1");
    expect(chatService.calls[0]?.text).toBe("Hello new session");
    expect(selected).toEqual(
      Result.Ok(sessions.sessions.get("created-1") ?? null),
    );
  });

  test("does not create a session when chat has no selected model", async () => {
    const providers = await createProviderManager();
    const { controller, sessions, chatService } = createController({
      providers,
    });

    const events = await collectEvents(controller.chat("Hello"));

    expect(events).toEqual([{ type: "error", error: "No model selected" }]);
    expect(sessions.createInputs).toEqual([]);
    expect(chatService.calls).toEqual([]);
  });

  test("uses an existing selected session for chat", async () => {
    const providers = await createProviderManager();
    const sessions = new TestSessionStore();
    const session = createSession({ id: "existing" });
    sessions.sessions.set(session.id, session);
    const { controller, chatService } = createController({
      providers,
      sessions,
    });
    const selectResult = await controller.selectSession("existing");
    expect(Result.isOk(selectResult)).toBe(true);

    const events = await collectEvents(controller.chat("Continue"));

    expect(events).toEqual([{ type: "done" }]);
    expect(sessions.createInputs).toEqual([]);
    expect(chatService.calls[0]?.sessionId).toBe("existing");
  });

  test("aborts chat and yields an error when chat service throws", async () => {
    const providers = await createProviderManager();
    const chatService = new TestChatService([], new Error("boom"));
    const { controller } = createController({ providers, chatService });
    expect(
      Result.isOk(controller.selectModel("test-provider", "a-model")),
    ).toBe(true);

    const events = await collectEvents(controller.chat("Throw please"));

    expect(events).toEqual([{ type: "error", error: "boom" }]);
    expect(chatService.calls[0]?.signal?.aborted).toBe(true);
  });
});
