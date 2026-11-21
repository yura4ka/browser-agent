import { describe, expect, test } from "bun:test";
import type { AgentEvent } from "@/agent/types";
import type { ConfigService, UserConfig } from "@/core/config";
import type { AssistantMessage } from "@/core/messages";
import { Result } from "@/core/Result";
import { type AgentSession, EMPTY_AGENT_USAGE } from "@/core/session";
import { SYSTEM_PROMPT } from "@/core/systemPrompt";
import { CHATGPT_PLAN } from "@/providers/ChatGPTPlan/ChatGPTPlanProvider";
import { LLMProvider } from "@/providers/LLMProvider";
import { ProviderManager } from "@/providers/ProviderManager";
import type { ChatRequest, ModelDescriptor } from "@/providers/types";
import { ChatGPTAccountService } from "@/services/chatgpt/ChatGPTAccountService";
import type {
  AccountIndex,
  CredentialStore,
  Registration,
} from "@/services/chatgpt/credentials";
import { OAuthError, PLAN_SCOPE } from "@/services/chatgpt/oauth";
import type {
  AgentSessionSummary,
  CreateSessionInput,
  SessionStore,
} from "@/storage/SessionStore";
import { AppController } from "./AppController";
import type { ChatService } from "./ChatService";

const config: UserConfig = {
  env: {},
  preferences: {
    allowedUrls: [],
    autoAllowAllTabs: false,
    promptCaching: { enabled: false, minCharacters: 2048 },
  },
};

const configService = {
  init: async () => undefined,
  get: () => config,
} as ConfigService;

const testModels: ModelDescriptor[] = [
  {
    providerId: "test-provider",
    id: "z-model",
    canonicalSlug: "z-model",
    displayName: "Z Model",
    pricing: { input: 0, output: 0 },
  },
  {
    providerId: "test-provider",
    id: "a-model",
    canonicalSlug: "a-model",
    displayName: "A Model",
    pricing: { input: 0, output: 0 },
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
      usage: input.usage ?? EMPTY_AGENT_USAGE,
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
    chatService: chatService as unknown as ChatService,
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
    usage: EMPTY_AGENT_USAGE,
    ...input,
  };
}

function assistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
  };
}

test("plan sessions stay viewable but never send across accounts without explicit confirmation", async () => {
  let index: AccountIndex | undefined;
  const records = new Map<string, Registration>();
  const store: CredentialStore = {
    withLock: async (_key, run) => run(),
    index: async () => index,
    saveIndex: async (value) => {
      index = value;
    },
    account: async (key) => records.get(key),
    saveAccount: async (value) => {
      records.set(value.key, value);
    },
  };
  let grants = 0;
  const accounts = new ChatGPTAccountService(store, {
    signIn: async () => {
      const number = ++grants;
      return Result.Ok({
        clientId: `oaiapp_fixture${number}`,
        identity: { subject: "same-subject", email: "fixture@example.test" },
        enabled: true,
        tokens: {
          accessToken: `fake-access-${number}`,
          refreshToken: "fake-refresh",
          idToken: "fake-id",
          expiresAt: Number.MAX_SAFE_INTEGER,
          scopes: [PLAN_SCOPE],
        },
      });
    },
    refresh: async () => Result.Err(new OAuthError("Unexpected refresh")),
    revoke: async () => true,
  });
  const sessions = new TestSessionStore();
  const calls: { url: string; token: string | null; body?: string }[] = [];
  const fetcher = Object.assign(
    async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        token: new Headers(init?.headers).get("Authorization"),
        body: init?.body?.toString(),
      });
      if (String(url).endsWith("/models")) {
        const suffix =
          new Headers(init?.headers).get("Authorization") ===
          "Bearer fake-access-2"
            ? "second"
            : "first";
        return Response.json({
          models: [
            { slug: "shared", display_name: "Shared", visibility: "list" },
            { slug: suffix, display_name: suffix, visibility: "list" },
          ],
        });
      }
      return new Response(
        `data: ${JSON.stringify({
          type: "response.completed",
          response: {
            output: [
              {
                type: "message",
                content: [{ type: "output_text", text: "fixture output" }],
              },
            ],
            usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
          },
        })}\n\n`,
      );
    },
    { preconnect: () => {} },
  );
  const controller = new AppController({
    config: configService,
    sessions,
    chatgpt: accounts,
    chatgptFetch: fetcher,
  });
  await controller.init();
  expect(calls).toHaveLength(0);
  const first = await controller.signInChatGPT();
  if (Result.isErr(first)) throw first.error;
  expect((await controller.prepareModels(CHATGPT_PLAN)).ok).toBe(true);
  expect(controller.selectModel(CHATGPT_PLAN, "shared").ok).toBe(true);
  expect(
    await collectEvents(controller.chat("private saved history")),
  ).toContainEqual({ type: "done" });
  const selected = await controller.getSelectedSession();
  if (Result.isErr(selected) || !selected.value)
    throw new Error("Session was not saved");
  const id = selected.value.id;
  expect(selected.value.selectedModel.registrationKey).toBe(first.value.key);
  expect(selected.value.usage.cost).toBe(0);
  expect(JSON.stringify(selected.value)).not.toMatch(
    /fake-access|fake-refresh|oaiapp_fixture|fixture@example/,
  );

  const resumed = new AppController({
    config: configService,
    sessions,
    chatgpt: accounts,
    chatgptFetch: fetcher,
  });
  await resumed.init();
  expect((await resumed.selectSession(id)).ok).toBe(true);
  expect(resumed.getSelectedModel()?.registrationKey).toBe(first.value.key);
  const second = await resumed.signInChatGPT();
  if (Result.isErr(second)) throw second.error;
  expect(second.value.label).not.toBe(first.value.label);
  expect(resumed.getSelectedModel()).toBeNull();
  expect(resumed.getModels(CHATGPT_PLAN)).toMatchObject({
    ok: true,
    value: [{ id: "shared" }, { id: "second" }],
  });
  expect((await resumed.selectSession(id)).ok).toBe(true);
  expect(resumed.getSelectedModel()).toBeNull();
  expect((await resumed.prepareModels(CHATGPT_PLAN)).ok).toBe(true);
  expect(resumed.selectModel(CHATGPT_PLAN, "shared").ok).toBe(true);
  const count = calls.length;
  const blocked = await collectEvents(resumed.chat("not sent"));
  expect(blocked).toMatchObject([{ type: "error" }]);
  expect(calls).toHaveLength(count);
  expect(resumed.confirmHistoryDestination().ok).toBe(true);
  expect(await collectEvents(resumed.chat("now send"))).toContainEqual({
    type: "done",
  });
  expect(calls.at(-1)?.token).toBe("Bearer fake-access-2");
  expect(calls.at(-1)?.body).toContain("private saved history");
});

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
        systemPrompt: SYSTEM_PROMPT,
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

  test("updates selected session model metadata before chat", async () => {
    const providers = await createProviderManager();
    const sessions = new TestSessionStore();
    const session = createSession({ id: "existing" });
    sessions.sessions.set(session.id, session);
    const { controller, chatService } = createController({
      providers,
      sessions,
    });
    const selectSessionResult = await controller.selectSession("existing");
    expect(Result.isOk(selectSessionResult)).toBe(true);
    const selectModelResult = controller.selectModel(
      "test-provider",
      "z-model",
    );
    expect(Result.isOk(selectModelResult)).toBe(true);

    const events = await collectEvents(controller.chat("Continue with z"));

    expect(events).toEqual([{ type: "done" }]);
    expect(chatService.calls[0]?.sessionId).toBe("existing");
    expect(sessions.sessions.get("existing")?.selectedModel).toEqual({
      providerId: "test-provider",
      modelId: "z-model",
    });
  });

  test("does not create a session when chat is already aborted", async () => {
    const providers = await createProviderManager();
    const { controller, sessions, chatService } = createController({
      providers,
    });
    expect(
      Result.isOk(controller.selectModel("test-provider", "a-model")),
    ).toBe(true);
    const abortController = new AbortController();
    abortController.abort();

    const events = await collectEvents(
      controller.chat("Do not create", abortController.signal),
    );

    expect(events).toEqual([{ type: "error", error: "Aborted" }]);
    expect(sessions.createInputs).toEqual([]);
    expect(chatService.calls).toEqual([]);
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
