import { AssistantMessageBuilder } from "../builders/AssistantMessageBuilder";
import type { ToolCallDelta } from "../types";
import type { OpenRouterChunk, OpenRouterToolCallDelta } from "./types";

export class OpenRouterMessageBuilder extends AssistantMessageBuilder<
  OpenRouterChunk,
  OpenRouterToolCallDelta
> {
  override parseToolCallDelta(delta: OpenRouterToolCallDelta): ToolCallDelta {
    const index = delta.index ?? 0;

    return {
      index,
      callId: delta.id ?? `tool-call-${index}`,
      toolNamePart: delta.function?.name,
      argsPart: delta.function?.arguments,
    };
  }

  override applyChunk(chunk: OpenRouterChunk): string | null {
    let finishReason: string | null = null;

    for (const choice of chunk?.choices ?? []) {
      finishReason = choice.finish_reason ?? finishReason;
      const delta = choice.delta;
      if (!delta) continue;

      if (typeof delta.content === "string") {
        this.contentParts.push(delta.content);
      }

      for (const tc of delta.tool_calls ?? []) {
        const parsed = this.parseToolCallDelta(tc);
        let entry = this.toolCallsByIndex.get(parsed.index);

        if (!entry) {
          entry = {
            id: parsed.callId,
            nameParts: [],
            argumentsParts: [],
          };
          this.toolCallsByIndex.set(parsed.index, entry);
        }

        if (tc.id) entry.id = tc.id;
        if (tc.function?.name) entry.nameParts.push(tc.function.name);
        if (tc.function?.arguments)
          entry.argumentsParts.push(tc.function.arguments);
      }
    }
    return finishReason;
  }
}
