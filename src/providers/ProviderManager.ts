import type { UserConfig } from "@/core/config";
import { Result } from "@/core/Result";
import type { LLMProvider } from "./LLMProvider";
import type { ModelDescriptor } from "./types";

export class ProviderManager {
  private providers = new Map<string, LLMProvider>();
  private selectedProviderModel: {
    provider: LLMProvider;
    model: ModelDescriptor;
  } | null = null;

  get selected(): { provider: LLMProvider; model: ModelDescriptor } | null {
    return this.selectedProviderModel;
  }

  add(provider: LLMProvider): ProviderManager {
    this.providers.set(provider.id, provider);
    return this;
  }

  async initAll(config: UserConfig): Promise<void> {
    await Promise.all(
      Array.from(this.providers.values()).map((p) => p.init({ config })),
    );
  }

  getProviders(): LLMProvider[] {
    return Array.from(this.providers.values());
  }

  getModels(providerId: string): Result<ModelDescriptor[]> {
    const provider = this.providers.get(providerId);
    if (!provider) return Result.fromCanonical("Provider not found");
    return Result.Ok(provider.getModels());
  }

  select(providerId: string, modelId: string): Result<void> {
    const provider = this.providers.get(providerId);
    if (!provider) return Result.fromCanonical("Provider not found");

    if (!provider.connectionResult)
      return Result.fromCanonical("Not connected");
    if (Result.isErr(provider.connectionResult))
      return provider.connectionResult;

    const model = provider.getModels().find((m) => m.id === modelId);
    if (!model) return Result.fromCanonical("Model not found");
    this.selectedProviderModel = { provider, model };
    return Result.Ok(undefined);
  }
}
