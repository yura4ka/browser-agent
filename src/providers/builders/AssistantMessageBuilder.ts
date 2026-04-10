import type { AssistantMessage, ToolCall } from "@/core/messages";
import type { ToolCallDelta } from "../types";

export abstract class AssistantMessageBuilder<TChunk, TDelta> {
  protected _contentParts: string[] = [];
  protected _toolCallsByIndex: Map<
    number,
    { id: string; nameParts: string[]; argumentsParts: string[] }
  > = new Map();

  abstract parseToolCallDelta(delta: TDelta): ToolCallDelta;

  abstract applyChunk(chunk: TChunk): string | null;

  finalize(): AssistantMessage {
    const toolCalls: ToolCall[] = Array.from(this._toolCallsByIndex.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, tc]) => ({
        callId: tc.id,
        toolName: tc.nameParts.join(""),
        args: tc.argumentsParts.join(""),
      }));

    return {
      role: "assistant",
      content: [{ type: "text", text: this._contentParts.join("") }],
      toolCalls,
    };
  }
}
