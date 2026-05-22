import { describe, expect, test } from "bun:test";
import type { AgentDeps, AgentEvent } from "@/agent/types";
import type { ConfigService, UserConfig } from "@/core/config";
import type { UserMessage } from "@/core/messages";
import { Result } from "@/core/Result";
import type { AgentSession, AgentTurn } from "@/core/session";
import type {
  AgentSessionSummary,
  CreateSessionInput,
  SessionStore,
} from "@/storage/SessionStore";
import { ChatService } from "./ChatService";

const config: UserConfig = {
  env: {},
  preferences: {
    allowedUrls: [],
    autoAllowAllTabs: false,
    promptCaching: { enabled: false, minCharacters: 2048 },
  },
};

const configService = {
  get: () => config,
} satisfies Pick<ConfigService, "get">;

class TestSessionStore implements SessionStore {
  sessionResult: Awaited<ReturnType<SessionStore["getSession"]>> =
    Result.Ok(null);
  saveResult: Awaited<ReturnType<SessionStore["saveSession"]>> =
    Result.Ok(undefined);
  savedSessions: AgentSession[] = [];

  async createSession(
    _input: CreateSessionInput,
  ): Promise<Result<AgentSession>> {
    return Result.fromCanonical("Not implemented");
  }

  async getSession(_sessionId: string): Promise<Result<AgentSession | null>> {
    return this.sessionResult;
  }

  async saveSession(session: AgentSession): Promise<Result<void>> {
    this.savedSessions.push(session);
    return this.saveResult;
  }

  async deleteSession(_sessionId: string): Promise<Result<void>> {
    return Result.fromCanonical("Not implemented");
  }

  async listSessions(): Promise<Result<AgentSessionSummary[]>> {
    return Result.fromCanonical("Not implemented");
  }
}

class TestAgent {
  calls: { deps: AgentDeps; message: UserMessage }[] = [];

  constructor(
    private readonly events: AgentEvent[],
    private readonly mutate?: (session: AgentSession) => void,
  ) {}

  async *runTurn(
    deps: AgentDeps,
    message: UserMessage,
  ): AsyncGenerator<AgentEvent> {
    this.calls.push({ deps, message });

    for (const event of this.events) {
      if (event.type === "done" || event.type === "error") {
        this.mutate?.(deps.session);
      }

      yield event;
    }
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
    ...input,
  };
}

function createCompletedTurn(): AgentTurn {
  return {
    startTime: "2026-01-01T00:00:00.000Z",
    endTime: "2026-01-01T00:00:01.000Z",
    status: "completed",
    provider: { id: "test-provider", displayName: "Test Provider" },
    model: { id: "test-model", displayName: "Test Model" },
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "Hello" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Hi" }],
      },
    ],
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

describe("ChatService", () => {
  test("loads a session, streams a turn, and saves before done", async () => {
    const session = createSession();
    const completedTurn = createCompletedTurn();
    const sessions = new TestSessionStore();
    sessions.sessionResult = Result.Ok(session);
    const agent = new TestAgent(
      [{ type: "assistant-text", text: "Hi" }, { type: "done" }],
      (s) => s.turns.push(completedTurn),
    );
    const controller = new AbortController();
    const service = new ChatService(sessions, agent, configService);

    const events = await collectEvents(
      service.chat("session-id", "Hello", controller.signal),
    );

    expect(events).toEqual([
      { type: "assistant-text", text: "Hi" },
      { type: "done" },
    ]);
    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0]?.deps).toEqual({
      session,
      config,
      signal: controller.signal,
    });
    expect(agent.calls[0]?.message).toEqual({
      role: "user",
      content: [{ type: "text", text: "Hello" }],
    });
    expect(sessions.savedSessions).toEqual([session]);
    expect(sessions.savedSessions[0]?.turns).toEqual([completedTurn]);
  });

  test("returns an error when the session is missing", async () => {
    const sessions = new TestSessionStore();
    sessions.sessionResult = Result.Ok(null);
    const agent = new TestAgent([{ type: "done" }]);
    const service = new ChatService(sessions, agent, configService);

    const events = await collectEvents(service.chat("missing", "Hello"));

    expect(events).toEqual([
      { type: "error", error: "Session not found: missing" },
    ]);
    expect(agent.calls).toEqual([]);
    expect(sessions.savedSessions).toEqual([]);
  });

  test("returns storage load errors without running the agent", async () => {
    const sessions = new TestSessionStore();
    sessions.sessionResult = Result.fromCanonical("Failed to load", "disk");
    const agent = new TestAgent([{ type: "done" }]);
    const service = new ChatService(sessions, agent, configService);

    const events = await collectEvents(service.chat("session-id", "Hello"));

    expect(events).toEqual([{ type: "error", error: "Failed to load (disk)" }]);
    expect(agent.calls).toEqual([]);
    expect(sessions.savedSessions).toEqual([]);
  });

  test("returns save errors instead of a terminal done event", async () => {
    const session = createSession();
    const completedTurn = createCompletedTurn();
    const sessions = new TestSessionStore();
    sessions.sessionResult = Result.Ok(session);
    sessions.saveResult = Result.fromCanonical(
      "Failed to save session",
      "disk full",
    );
    const agent = new TestAgent(
      [{ type: "assistant-text", text: "Hi" }, { type: "done" }],
      (s) => s.turns.push(completedTurn),
    );
    const service = new ChatService(sessions, agent, configService);

    const events = await collectEvents(service.chat("session-id", "Hello"));

    expect(events).toEqual([
      { type: "assistant-text", text: "Hi" },
      { type: "error", error: "Failed to save session (disk full)" },
    ]);
    expect(sessions.savedSessions).toEqual([session]);
  });

  test("saves changed sessions when the agent throws", async () => {
    const session = createSession();
    const completedTurn = createCompletedTurn();
    const sessions = new TestSessionStore();
    sessions.sessionResult = Result.Ok(session);
    const agent = {
      async *runTurn(deps: AgentDeps, _message: UserMessage) {
        deps.session.turns.push(completedTurn);
        if (deps.session.id === "never") {
          yield { type: "status" as const, message: "unused" };
        }
        throw new Error("boom");
      },
    };
    const service = new ChatService(sessions, agent, configService);

    const events = await collectEvents(service.chat("session-id", "Hello"));

    expect(events).toEqual([{ type: "error", error: "boom" }]);
    expect(sessions.savedSessions).toEqual([session]);
    expect(sessions.savedSessions[0]?.turns).toEqual([completedTurn]);
  });
});
