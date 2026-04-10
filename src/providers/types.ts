import type { UserConfig } from "@/core/config";
import type { AssistantMessage, CanonicalMessage } from "@/core/messages";
import type { Result } from "@/core/Result";

export type ProviderIdentity = {
  readonly id: string;
  readonly displayName: string;
};

export type ProviderContext = {
  config: UserConfig;
};

export type ProviderDescriptor = ProviderIdentity & {
  readonly connectionResult: Result<void> | null;
};

export interface ProviderCatalog {
  discoverModels(
    context: ProviderContext,
  ): Promise<Result<ModelDescriptor[] | null>>;
}

export interface ProviderTransport {
  streamChat(
    request: ChatRequest,
    context: ProviderContext,
    signal?: AbortSignal,
  ): AsyncGenerator<LLMStreamEvent>;
}

export type ModelDescriptor = {
  providerId: string;
  id: string;
  canonical_slug: string;
  displayName: string;
  contextLength?: number;
};

export type LLMStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call-delta"; call: ToolCallDelta }
  | { type: "message-complete"; message: AssistantMessage }
  | { type: "sse-comment"; content: string }
  | { type: "error"; error: string };

export type ToolCallDelta = {
  index: number;
  callId: string;
  toolNamePart: string | undefined;
  argsPart: string | undefined;
};

export type ChatRequest = {
  modelId: string;
  messages: CanonicalMessage[];
};
