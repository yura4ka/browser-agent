import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Result } from "@/core/Result";
import { type AgentSession, agentSessionSchema } from "@/core/session";
import { SYSTEM_PROMPT } from "@/core/systemPrompt";
import type {
  AgentSessionSummary,
  CreateSessionInput,
  SessionStore,
} from "./SessionStore";

export class JsonSessionStore implements SessionStore {
  constructor(private readonly directory: string) {}

  async createSession(
    input: CreateSessionInput,
  ): Promise<Result<AgentSession>> {
    const session: AgentSession = {
      id: input.id ?? crypto.randomUUID(),
      title: input.title ?? "Untitled session",
      systemPrompt: input.systemPrompt ?? SYSTEM_PROMPT,
      selectedModel: input.selectedModel,
      turns: input.turns ?? [],
    };

    const parsed = agentSessionSchema.safeParse(session);
    if (!parsed.success) {
      return Result.fromCanonical("Invalid session", parsed.error.message);
    }

    const filePath = this.getSessionPath(parsed.data.id);
    const existsResult = await this.fileExists(filePath);
    if (Result.isErr(existsResult)) return existsResult;
    if (existsResult.value) {
      return Result.fromCanonical(`Session already exists: ${parsed.data.id}`);
    }

    const saveResult = await this.saveSession(parsed.data);
    if (Result.isErr(saveResult)) return saveResult;

    return Result.Ok(parsed.data);
  }

  async getSession(sessionId: string): Promise<Result<AgentSession | null>> {
    const filePath = this.getSessionPath(sessionId);
    const existsResult = await this.fileExists(filePath);
    if (Result.isErr(existsResult)) return existsResult;
    if (!existsResult.value) return Result.Ok(null);

    return this.readSessionFile(filePath);
  }

  async saveSession(session: AgentSession): Promise<Result<void>> {
    const parsed = agentSessionSchema.safeParse(session);
    if (!parsed.success) {
      return Result.fromCanonical("Invalid session", parsed.error.message);
    }

    const mkdirResult = await Result.fromPromise(
      mkdir(this.directory, { recursive: true }),
    );
    if (Result.isErr(mkdirResult)) {
      return Result.fromCanonical(
        "Failed to create session directory",
        this.errorToMessage(mkdirResult.error),
      );
    }

    const writeResult = await Result.fromPromise(
      Bun.write(
        this.getSessionPath(parsed.data.id),
        `${JSON.stringify(parsed.data, null, 2)}\n`,
      ),
    );
    if (Result.isErr(writeResult)) {
      return Result.fromCanonical(
        "Failed to save session",
        this.errorToMessage(writeResult.error),
      );
    }

    return Result.Ok(undefined);
  }

  async deleteSession(sessionId: string): Promise<Result<void>> {
    const filePath = this.getSessionPath(sessionId);
    const existsResult = await this.fileExists(filePath);
    if (Result.isErr(existsResult)) return existsResult;
    if (!existsResult.value) return Result.Ok(undefined);

    const deleteResult = await Result.fromPromise(Bun.file(filePath).delete());
    if (Result.isErr(deleteResult)) {
      return Result.fromCanonical(
        "Failed to delete session",
        this.errorToMessage(deleteResult.error),
      );
    }

    return Result.Ok(undefined);
  }

  async listSessions(): Promise<Result<AgentSessionSummary[]>> {
    const mkdirResult = await Result.fromPromise(
      mkdir(this.directory, { recursive: true }),
    );
    if (Result.isErr(mkdirResult)) {
      return Result.fromCanonical(
        "Failed to create session directory",
        this.errorToMessage(mkdirResult.error),
      );
    }

    const entriesResult = await Result.fromPromise(readdir(this.directory));
    if (Result.isErr(entriesResult)) {
      return Result.fromCanonical(
        "Failed to list sessions",
        this.errorToMessage(entriesResult.error),
      );
    }

    const summaries: AgentSessionSummary[] = [];

    for (const entry of entriesResult.value) {
      if (!entry.endsWith(".json")) continue;

      const sessionResult = await this.readSessionFile(
        join(this.directory, entry),
      );
      if (Result.isErr(sessionResult)) return sessionResult;

      summaries.push(this.toSummary(sessionResult.value));
    }

    summaries.sort((a, b) =>
      (b.lastTurnAt ?? "").localeCompare(a.lastTurnAt ?? ""),
    );

    return Result.Ok(summaries);
  }

  private async readSessionFile(
    filePath: string,
  ): Promise<Result<AgentSession>> {
    const readResult = await Result.fromPromise(Bun.file(filePath).json());
    if (Result.isErr(readResult)) {
      return Result.fromCanonical(
        "Failed to read session",
        this.errorToMessage(readResult.error),
      );
    }

    const parsed = agentSessionSchema.safeParse(readResult.value);
    if (!parsed.success) {
      return Result.fromCanonical("Invalid session data", parsed.error.message);
    }

    return Result.Ok(parsed.data);
  }

  private async fileExists(filePath: string): Promise<Result<boolean>> {
    const existsResult = await Result.fromPromise(Bun.file(filePath).exists());
    if (Result.isErr(existsResult)) {
      return Result.fromCanonical(
        "Failed to check session file",
        this.errorToMessage(existsResult.error),
      );
    }

    return Result.Ok(existsResult.value);
  }

  private getSessionPath(sessionId: string): string {
    return join(this.directory, `${encodeURIComponent(sessionId)}.json`);
  }

  private toSummary(session: AgentSession): AgentSessionSummary {
    const latestTurn = session.turns.at(-1);

    return {
      id: session.id,
      title: session.title,
      lastTurnAt: latestTurn?.endTime || latestTurn?.startTime,
    };
  }

  private errorToMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
