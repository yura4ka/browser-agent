import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Result } from "@/core/Result";
import {
  type AgentSession,
  type AgentTurn,
  EMPTY_AGENT_USAGE,
} from "@/core/session";
import { SYSTEM_PROMPT } from "@/core/systemPrompt";
import { JsonSessionStore } from "./JsonSessionStore";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
  tempDirectories.length = 0;
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "browser-agent-sessions-"));
  tempDirectories.push(directory);
  return directory;
}

function createTurn(endTime: string): AgentTurn {
  return {
    startTime: "2026-01-01T00:00:00.000Z",
    endTime,
    status: "completed",
    provider: { id: "openrouter", displayName: "OpenRouter" },
    model: { id: "model-id", displayName: "Model" },
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    ],
  };
}

function createSession(input: Partial<AgentSession> = {}): AgentSession {
  return {
    id: "session-id",
    title: "Session",
    systemPrompt: "System prompt",
    selectedModel: { providerId: "openrouter", modelId: "model-id" },
    turns: [],
    usage: EMPTY_AGENT_USAGE,
    ...input,
  };
}

describe("JsonSessionStore", () => {
  test("creates and retrieves a session", async () => {
    const store = new JsonSessionStore(await createTempDirectory());

    const createResult = await store.createSession({
      title: "Created session",
      selectedModel: { providerId: "openrouter", modelId: "model-id" },
    });
    expect(Result.isOk(createResult)).toBe(true);
    if (Result.isErr(createResult)) throw createResult.error;

    const getResult = await store.getSession(createResult.value.id);
    expect(Result.isOk(getResult)).toBe(true);
    if (Result.isErr(getResult)) throw getResult.error;

    expect(getResult.value).toEqual(createResult.value);
    expect(getResult.value?.systemPrompt).toBe(SYSTEM_PROMPT);
    expect(getResult.value?.usage).toEqual(EMPTY_AGENT_USAGE);
  });

  test("saves and lists session summaries sorted by latest turn", async () => {
    const store = new JsonSessionStore(await createTempDirectory());
    const older = createSession({
      id: "older",
      title: "Older",
      turns: [createTurn("2026-01-01T00:01:00.000Z")],
    });
    const newer = createSession({
      id: "newer",
      title: "Newer",
      turns: [createTurn("2026-01-01T00:02:00.000Z")],
    });

    expect(Result.isOk(await store.saveSession(older))).toBe(true);
    expect(Result.isOk(await store.saveSession(newer))).toBe(true);

    const listResult = await store.listSessions();
    expect(Result.isOk(listResult)).toBe(true);
    if (Result.isErr(listResult)) throw listResult.error;

    expect(listResult.value).toEqual([
      {
        id: "newer",
        title: "Newer",
        lastTurnAt: "2026-01-01T00:02:00.000Z",
      },
      {
        id: "older",
        title: "Older",
        lastTurnAt: "2026-01-01T00:01:00.000Z",
      },
    ]);
  });

  test("deletes sessions idempotently", async () => {
    const store = new JsonSessionStore(await createTempDirectory());
    const session = createSession();

    expect(Result.isOk(await store.saveSession(session))).toBe(true);
    expect(Result.isOk(await store.deleteSession(session.id))).toBe(true);
    expect(Result.isOk(await store.deleteSession(session.id))).toBe(true);

    const getResult = await store.getSession(session.id);
    expect(Result.isOk(getResult)).toBe(true);
    if (Result.isErr(getResult)) throw getResult.error;

    expect(getResult.value).toBeNull();
  });

  test("returns an error for invalid session files", async () => {
    const directory = await createTempDirectory();
    const store = new JsonSessionStore(directory);

    await mkdir(directory, { recursive: true });
    await Bun.write(
      join(directory, "invalid.json"),
      JSON.stringify({ id: "invalid" }),
    );

    const listResult = await store.listSessions();

    expect(Result.isErr(listResult)).toBe(true);
    if (Result.isOk(listResult))
      throw new Error("Expected invalid session error");

    expect(listResult.error.message).toBe("Invalid session data");
  });

  test("requires success on stored tool result messages", async () => {
    const directory = await createTempDirectory();
    const store = new JsonSessionStore(directory);

    await mkdir(directory, { recursive: true });
    await Bun.write(
      join(directory, "legacy-tool-result.json"),
      JSON.stringify({
        ...createSession({ id: "legacy-tool-result" }),
        turns: [
          {
            ...createTurn("2026-01-01T00:01:00.000Z"),
            messages: [
              {
                role: "tool",
                toolCallId: "call-1",
                toolName: "search",
                content: [{ type: "text", text: "Search result" }],
              },
            ],
          },
        ],
      }),
    );

    const getResult = await store.getSession("legacy-tool-result");

    expect(Result.isErr(getResult)).toBe(true);
    if (Result.isOk(getResult))
      throw new Error("Expected invalid session error");

    expect(getResult.error.message).toBe("Invalid session data");
  });
});
