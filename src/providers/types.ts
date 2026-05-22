import type { UserConfig } from "@/core/config";
import type { AssistantMessage, CanonicalMessage } from "@/core/messages";
import type { Result } from "@/core/Result";
import type { ToolDefinition } from "@/tools/types";
import type { LLMProvider } from "./LLMProvider";

export type ProviderIdentity = {
  readonly id: string;
  readonly displayName: string;
};

export type ProviderDeps = {
  config: UserConfig;
};

export type ProviderDescriptor = ProviderIdentity & {
  readonly connectionResult: Result<void> | null;
};

export interface ProviderCatalog {
  discoverModels(deps: ProviderDeps): Promise<Result<ModelDescriptor[] | null>>;
}

export interface ProviderTransport {
  streamChat(
    request: ChatRequest,
    deps: ProviderDeps,
    signal?: AbortSignal,
  ): AsyncGenerator<LLMStreamEvent>;
}

export type ModelDescriptor = {
  providerId: string;
  id: string;
  canonicalSlug: string;
  displayName: string;
  contextLength?: number;
  pricing: {
    input: number;
    output: number;
  };
};

export type SelectedModel = { provider: LLMProvider; model: ModelDescriptor };

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
  tools: ToolDefinition[];
};
