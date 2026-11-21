import type { MessagePart } from "@/core/messages";
import type { ChatRequest } from "../types";

export const TOOL_NAMESPACE = "browser_agent";

function inputPart(part: MessagePart) {
  return part.type === "text"
    ? { type: "input_text", text: part.text }
    : { type: "input_image", image_url: part.imageUrl, detail: "auto" };
}

export function buildResponsesRequest(request: ChatRequest) {
  const input: unknown[] = [];
  const usedCallIds = new Set<string>();
  const messages = request.messages;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    if (message.role === "system") {
      input.push({
        type: "message",
        role: "developer",
        content: message.content,
      });
    } else if (message.role === "user") {
      if (message.content.length)
        input.push({
          type: "message",
          role: "user",
          content: message.content.map(inputPart),
        });
    } else if (message.role === "assistant") {
      const text = message.content
        .filter((part) => part.type === "text")
        .filter((part) => part.text);

      if (text.length)
        input.push({
          type: "message",
          role: "assistant",
          content: text.map((part) => ({
            type: "output_text",
            text: part.text,
            annotations: [],
          })),
        });

      const images = message.content.filter((part) => part.type === "image");

      if (images.length)
        input.push({
          type: "message",
          role: "user",
          content: [
            inputPart({
              type: "text",
              text: "Images from the previous assistant message:",
            }),
            ...images.map(inputPart),
          ],
        });

      const calls = new Map(
        message.toolCalls?.map((call) => [call.callId, call]),
      );

      const pairs = [];

      while (messages[i + 1]?.role === "tool") {
        const result = messages[++i];
        if (result.role !== "tool") break;
        const call = calls.get(result.toolCallId);
        if (!call || call.toolName !== result.toolName) continue;
        calls.delete(call.callId);
        let callId = call.callId;
        if (!/^[\w-]{1,128}$/.test(callId) || usedCallIds.has(callId)) {
          callId = `call_replay_${i}`;
          while (usedCallIds.has(callId)) callId += "_";
        }
        usedCallIds.add(callId);
        pairs.push({
          call: {
            type: "function_call",
            call_id: callId,
            namespace: TOOL_NAMESPACE,
            name: call.toolName,
            arguments:
              typeof call.args === "string"
                ? call.args
                : JSON.stringify(call.args ?? {}),
          },
          result: {
            type: "function_call_output",
            call_id: callId,
            output: [
              ...(!result.success
                ? [inputPart({ type: "text", text: "Tool failed:" })]
                : []),
              ...(result.content.length
                ? result.content.map(inputPart)
                : [
                    inputPart({
                      type: "text",
                      text: "Tool output unavailable in saved history.",
                    }),
                  ]),
            ],
          },
        });
      }
      input.push(
        ...pairs.map(({ call }) => call),
        ...pairs.map(({ result }) => result),
      );
    }
  }
  return {
    model: request.modelId,
    store: false,
    stream: true,
    input,
    ...(request.tools.length
      ? {
          tools: [
            {
              type: "namespace",
              name: TOOL_NAMESPACE,
              description: "Local browser-agent tools",
              tools: request.tools.map(({ name, description, parameters }) => ({
                type: "function",
                name,
                description,
                parameters,
                strict: false,
              })),
            },
          ],
        }
      : {}),
  };
}
