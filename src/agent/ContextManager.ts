import type { CanonicalMessage, UserMessage } from "@/core/messages";
import type { AgentSession, AgentTurn } from "@/core/session";

export class ContextManager {
  buildContext(input: {
    session: AgentSession;
    newMessage: UserMessage;
  }): CanonicalMessage[] {
    const context: CanonicalMessage[] = [
      {
        role: "system",
        content: input.session.systemPrompt,
      },
    ];
    for (const turn of input.session.turns) {
      for (const message of turn.messages) {
        context.push(message);
      }

      const statusMessage = this.createTurnStatusMessage(turn);
      if (statusMessage) {
        context.push(statusMessage);
      }
    }
    context.push(input.newMessage);
    return context;
  }

  private createTurnStatusMessage(turn: AgentTurn): CanonicalMessage | null {
    switch (turn.status) {
      case "completed":
        return null;
      case "aborted":
        return {
          role: "system",
          content:
            "Previous turn was aborted by the user. Treat the next user message as the source of truth for whether to continue, revise, or ignore that interrupted work.",
        };
      case "failed":
        return {
          role: "system",
          content: turn.error
            ? `Previous turn failed with error: ${turn.error}. If relevant, recover or ask for clarification instead of assuming the task completed.`
            : "Previous turn failed. If relevant, recover or ask for clarification instead of assuming the task completed.",
        };
      case "max_iterations":
        return {
          role: "system",
          content:
            "Previous turn stopped because the agent reached the maximum iteration limit before completing. Continue from the available context, avoid repeating the same failed loop, and choose a different strategy if needed.",
        };
    }
  }
}
