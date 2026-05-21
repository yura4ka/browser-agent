import type { Agent } from "@/agent/agent";
import type { AgentDeps, AgentEvent } from "@/agent/types";
import type { ConfigService } from "@/core/config";
import type { UserMessage } from "@/core/messages";
import { Result } from "@/core/Result";
import type { SessionStore } from "@/storage/SessionStore";

type ChatAgent = Pick<Agent, "runTurn">;
type ChatConfig = Pick<ConfigService, "get">;

export class ChatService {
  constructor(
    private readonly sessions: SessionStore,
    private readonly agent: ChatAgent,
    private readonly config: ChatConfig,
  ) {}

  async *chat(
    sessionId: string,
    text: string,
    signal?: AbortSignal,
  ): AsyncGenerator<AgentEvent> {
    const sessionResult = await this.sessions.getSession(sessionId);
    if (Result.isErr(sessionResult)) {
      yield this.toErrorEvent(sessionResult.error);
      return;
    }

    const session = sessionResult.value;
    if (!session) {
      yield { type: "error", error: `Session not found: ${sessionId}` };
      return;
    }

    const message = this.createUserMessage(text);
    const deps: AgentDeps = {
      session,
      config: this.config.get(),
      signal,
    };

    let terminalEvent: AgentEvent | null = null;
    for await (const event of this.agent.runTurn(deps, message)) {
      if (this.isTerminalEvent(event)) {
        terminalEvent = event;
        break;
      }

      yield event;
    }

    const saveResult = await this.sessions.saveSession(session);
    if (Result.isErr(saveResult)) {
      yield this.toErrorEvent(saveResult.error);
      return;
    }

    if (terminalEvent) {
      yield terminalEvent;
      return;
    }

    yield {
      type: "error",
      error: "Agent finished without a terminal event",
    };
  }

  private createUserMessage(text: string): UserMessage {
    return {
      role: "user",
      content: [{ type: "text", text }],
    };
  }

  private isTerminalEvent(event: AgentEvent): boolean {
    return event.type === "done" || event.type === "error";
  }

  private toErrorEvent(error: { message: string; hint?: string }) {
    return {
      type: "error" as const,
      error: error.hint ? `${error.message} (${error.hint})` : error.message,
    };
  }
}
