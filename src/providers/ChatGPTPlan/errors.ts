import { z } from "zod";
import { Result } from "@/core/Result";
import type { ChatGPTAccountService } from "@/services/chatgpt/ChatGPTAccountService";
import { MANAGE_USAGE } from "@/services/chatgpt/oauth";
import type { LLMStreamEvent } from "../types";
import { errorSchema } from "./wire";

export type PlanAccounts = Pick<
  ChatGPTAccountService,
  "getAccessToken" | "reportFailure"
>;
type StreamError = Extract<LLMStreamEvent, { type: "error" }>;
const diagnostic = z.string().regex(/^[\w.[\]-]{1,128}$/);
function safeField(value: unknown): string | undefined {
  return diagnostic.safeParse(value).data;
}

export function failure(
  value: unknown,
  status?: number,
  id?: string,
  kind = "failed",
): StreamError {
  const parsed = errorSchema.safeParse(value).data;
  const code = safeField(parsed?.code);
  const parameter = safeField(parsed?.param);
  let error =
    kind === "incomplete"
      ? "ChatGPT response was incomplete"
      : "ChatGPT request failed";
  if (code === "subscription_sharing_usage_limit_exceeded") {
    kind = "usage-limited";
    error = `ChatGPT plan usage limit reached. Manage usage: ${MANAGE_USAGE}; use /chatgpt retry to resume`;
  } else if (code === "subscription_sharing_user_not_eligible") {
    error = "This ChatGPT account or workspace is not eligible for plan usage";
  } else if (code === "subscription_sharing_unsupported_capability") {
    error =
      "ChatGPT does not support a capability in this request (for example, this model may not accept screenshots)";
  } else if (code === "invalid_token" || code === "token_revoked") {
    kind = "revoked";
    error = "ChatGPT authorization is no longer valid. Use /chatgpt login";
  } else if (
    status === 503 ||
    code === "subscription_sharing_usage_unavailable" ||
    code === "subscription_sharing_user_unavailable"
  ) {
    error = "ChatGPT plan usage is temporarily unavailable. Retry later";
  } else if (status === 401 || code === "subscription_sharing_invalid_user") {
    error =
      "ChatGPT did not accept this account or grant. Check /chatgpt or reauthorize";
  } else if (
    status === 403 ||
    code === "chatpass_v2_scope_not_authorized" ||
    code === "chatpass_v2_invalid_authorization_context"
  ) {
    error =
      "ChatGPT plan usage was blocked by a permission, route, or policy restriction";
  }
  if (status) error += ` (HTTP ${status})`;
  if (id) error += ` [request ID: ${id}]`;
  return {
    type: "error",
    error,
    details: { kind, status, code, parameter, requestId: id },
  };
}

export async function httpFailure(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  const rawError = z.object({ error: z.unknown() }).safeParse(body).data?.error;
  const challenge = response.headers.get("www-authenticate") ?? "";
  const confirmed =
    response.status === 401 &&
    /^Bearer\s+.*\berror="invalid_token"(?:,|$)/i.test(challenge);
  return failure(
    confirmed ? { code: "invalid_token" } : rawError,
    response.status,
    requestId(response),
  );
}

export async function report(
  accounts: PlanAccounts,
  key: string,
  token: string,
  event: StreamError,
) {
  const kind = event.details?.kind;
  if (kind !== "revoked" && kind !== "usage-limited") return event;
  const result = await accounts.reportFailure(key, token, kind);
  return Result.isErr(result)
    ? { ...event, error: `${event.error}. ${result.error.message}` }
    : event;
}

export function requestId(response: Response) {
  return safeField(
    response.headers.get("x-request-id") ??
      response.headers.get("openai-request-id"),
  );
}
