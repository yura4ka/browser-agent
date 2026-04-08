import type { UserConfig } from "@/core/config";
import type { Result } from "@/core/Result";
import type { LLMProvider } from "./../LLMProvider";
import type { ModelDescriptor, ProviderDescriptor } from "../types";

export abstract class OpenAICompatibleProvider implements LLMProvider {
  protected _connectionResult: Result<void> | null = null;
  protected abstract get completionUrl(): string;

  abstract get id(): string;
  abstract get displayName(): string;
  abstract init(_config: UserConfig): Promise<void>;
  abstract getModels(): ModelDescriptor[];

  get connectionResult(): Result<void> | null {
    return this._connectionResult;
  }

  getDescriptor(): ProviderDescriptor {
    return {
      id: this.id,
      displayName: this.displayName,
      connectionResult: this.connectionResult,
    };
  }
}
