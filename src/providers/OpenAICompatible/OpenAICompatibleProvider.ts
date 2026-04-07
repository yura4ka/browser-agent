import type { UserConfig } from "@/core/config";
import type { Result } from "@/core/Result";
import type { LLMProvider } from "./../LLMProvider";
import type { ModelDescriptor } from "../types";

export class OpenAICompatibleProvider implements LLMProvider {
  get id(): string {
    throw new Error("OpenAICompatibleProvider.id must be overridden");
  }

  get displayName(): string {
    throw new Error("OpenAICompatibleProvider.displayName must be overridden");
  }

  get connectionResult(): Result<void> | null {
    throw new Error(
      "OpenAICompatibleProvider.connectionResult must be overridden",
    );
  }

  async init(_config: UserConfig): Promise<void> {
    throw new Error("OpenAICompatibleProvider.init must be overridden");
  }

  getModels(): ModelDescriptor[] {
    throw new Error("OpenAICompatibleProvider.getModels must be overridden");
  }
}
