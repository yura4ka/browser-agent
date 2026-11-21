import { createParser } from "eventsource-parser";
import { z } from "zod";
import type { ToolCall } from "@/core/messages";
import { Result } from "@/core/Result";
import { RESOURCE } from "@/services/chatgpt/oauth";
import { EventStreamAdapter } from "../transportAdapters/EventStreamAdapter";
import type { ChatRequest, LLMStreamEvent, ProviderDeps } from "../types";
import {
  buildResponsesRequest,
  TOOL_NAMESPACE,
} from "./ChatGPTPlanMessageBuilder";
import {
  failure,
  httpFailure,
  type PlanAccounts,
  report,
  requestId,
} from "./errors";
import {
  argumentsDeltaSchema,
  completedSchema,
  deltaSchema,
  eventSchema,
  functionCallSchema,
  itemSchema,
  textOutputSchema,
  usageSchema,
} from "./wire";

export class ChatGPTPlanTransport {
  constructor(
    private readonly accounts: PlanAccounts,
    private readonly fetcher = fetch,
  ) {}

  async *streamChat(
    request: ChatRequest,
    deps: ProviderDeps,
    signal?: AbortSignal,
  ): AsyncGenerator<LLMStreamEvent> {
    const key = deps.registrationKey;

    if (!key) {
      yield { type: "error", error: "No ChatGPT registration selected" };
      return;
    }

    const token = await this.accounts.getAccessToken(key, signal);

    if (Result.isErr(token)) {
      yield {
        type: "error",
        error: token.error.hint
          ? `${token.error.message} (${token.error.hint})`
          : token.error.message,
      };
      return;
    }

    const send = async () => {
      try {
        signal?.throwIfAborted();
        return Result.Ok(
          await this.fetcher(`${RESOURCE}/responses`, {
            method: "POST",
            redirect: "error",
            signal,
            headers: {
              Authorization: `Bearer ${token.value}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(buildResponsesRequest(request)),
          }),
        );
      } catch {
        return Result.fromCanonical("Could not connect to ChatGPT");
      }
    };

    const response = await send();

    if (Result.isErr(response)) {
      yield {
        type: "error",
        error: signal?.aborted ? "Stream aborted" : response.error.message,
        details: { kind: signal?.aborted ? "aborted" : "network" },
      };
      return;
    }

    const requestID = requestId(response.value);

    if (!response.value.ok) {
      yield await report(
        this.accounts,
        key,
        token.value,
        await httpFailure(response.value),
      );
      return;
    }

    const adapter = new ResponsesStream(
      response.value,
      request.tools.map((tool) => tool.name),
      requestID,
    );

    for await (const event of adapter.streamChat(request, deps, signal)) {
      if (event.type === "error") {
        const detail = event.details
          ? event
          : {
              ...event,
              error: signal?.aborted
                ? "Stream aborted"
                : "ChatGPT stream ended before completion",
              details: {
                kind: signal?.aborted ? "aborted" : "interrupted",
                requestId: requestID,
              },
            };
        yield await report(this.accounts, key, token.value, detail);
      } else yield event;
    }
  }
}

class ResponsesStream extends EventStreamAdapter {
  constructor(
    private readonly response: Response,
    private readonly tools: string[],
    private readonly requestId?: string,
  ) {
    super();
  }

  protected override async fetchWithStream() {
    return Result.Ok(this.response);
  }

  protected override createParser({
    enqueue,
  }: {
    enqueue: (event: LLMStreamEvent) => void;
  }) {
    const fragments = new Map<string, string>();
    let text = "";
    let terminated = false;

    const terminal = (event: LLMStreamEvent) => {
      if (terminated) return;
      terminated = true;
      enqueue(event);
    };

    const malformed = () =>
      terminal({
        type: "error",
        error: "Invalid ChatGPT response stream",
        details: { kind: "malformed", requestId: this.requestId },
      });
      
    return createParser({
      onError: malformed,
      onEvent: (event) => {
        if (terminated) return;
        try {
          const data = eventSchema.parse(JSON.parse(event.data));
          switch (data.type) {
            case "response.output_text.delta":
            case "response.refusal.delta": {
              const { delta } = deltaSchema.parse(data);
              text += delta;
              enqueue({ type: "text-delta", text: delta });
              return;
            }
            case "response.output_item.added": {
              const item = itemSchema.parse(data.item);
              if (item.type === "function_call") {
                fragments.set(item.id, item.arguments ?? "");
              }
              return;
            }
            case "response.output_item.done": {
              const item = itemSchema.parse(data.item);
              if (item.type === "function_call" && item.arguments)
                fragments.set(item.id, item.arguments);
              return;
            }
            case "response.function_call_arguments.delta": {
              const { item_id, delta } = argumentsDeltaSchema.parse(data);
              fragments.set(item_id, (fragments.get(item_id) ?? "") + delta);
              return;
            }
            case "error":
              terminal(failure(data, undefined, this.requestId, "sse-error"));
              return;
            case "response.failed":
            case "response.incomplete": {
              const response = z
                .object({ error: z.unknown().optional() })
                .safeParse(data.response).data;
              terminal(
                failure(
                  response?.error,
                  undefined,
                  this.requestId,
                  data.type.split(".")[1],
                ),
              );
              return;
            }
            case "response.completed": {
              const { response } = completedSchema.parse(data);
              const usage = usageSchema.safeParse(response.usage).data;
              const calls: ToolCall[] = [];
              const seen = new Set<string>();
              const known = new Set(this.tools);
              const output: string[] = [];
              for (const item of response.output) {
                if (item.type === "message") {
                  for (const part of textOutputSchema.parse(item).content) {
                    if (part.type === "output_text" || part.type === "refusal")
                      output.push(
                        z
                          .string()
                          .parse(
                            part[part.type === "refusal" ? "refusal" : "text"],
                          ),
                      );
                  }
                }
                if (item.type !== "function_call") continue;
                const call = functionCallSchema.parse(item);
                if (
                  call.namespace !== TOOL_NAMESPACE ||
                  !known.has(call.name) ||
                  seen.has(call.call_id) ||
                  (call.status !== undefined && call.status !== "completed")
                )
                  throw new Error("Invalid completed tool call");
                const args = JSON.parse(
                  call.arguments || fragments.get(call.id) || "",
                );
                if (!z.record(z.string(), z.unknown()).safeParse(args).success)
                  throw new Error("Invalid tool arguments");
                seen.add(call.call_id);
                calls.push({ callId: call.call_id, toolName: call.name, args });
              }
              const fullText = output.join("") || text;
              if (!text && fullText)
                enqueue({ type: "text-delta", text: fullText });
              terminal({
                type: "message-complete",
                message: {
                  role: "assistant",
                  content: fullText ? [{ type: "text", text: fullText }] : [],
                  toolCalls: calls,
                },
                usage: usage
                  ? {
                      inputTokens: usage.input_tokens,
                      outputTokens: usage.output_tokens,
                      totalTokens: usage.total_tokens,
                      cost: 0,
                    }
                  : undefined,
              });
            }
          }
        } catch {
          malformed();
        }
      },
    });
  }
}
