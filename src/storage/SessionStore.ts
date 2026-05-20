import type { Result } from "@/core/Result";
import type { AgentSession } from "@/core/session";

export type CreateSessionInput = Pick<AgentSession, "selectedModel"> &
  Partial<Omit<AgentSession, "selectedModel">>;

export type AgentSessionSummary = {
  id: string;
  title: string;
  lastTurnAt?: string;
};

export interface SessionStore {
  createSession(input: CreateSessionInput): Promise<Result<AgentSession>>;
  getSession(sessionId: string): Promise<Result<AgentSession | null>>;
  saveSession(session: AgentSession): Promise<Result<void>>;
  deleteSession(sessionId: string): Promise<Result<void>>;
  listSessions(): Promise<Result<AgentSessionSummary[]>>;
}
