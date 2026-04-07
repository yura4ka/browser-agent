import type { UserConfig } from "@/core/config";
import { Result } from "@/core/Result";
import type { LLMProvider } from "./LLMProvider";
import type { ModelDescriptor } from "./types";

export class ProviderManager {
  private _providers = new Map<string, LLMProvider>();

  add(provider: LLMProvider): ProviderManager {
    this._providers.set(provider.id, provider);
    return this;
  }

  async initAll(config: UserConfig): Promise<void> {
    await Promise.all(
      Array.from(this._providers.values()).map((p) => p.init(config)),
    );
  }

  getProviders(): LLMProvider[] {
    return Array.from(this._providers.values());
  }

  getConnectedProviders(): LLMProvider[] {
    return Array.from(this._providers.values()).filter(
      (p) => p.connectionResult !== null && Result.isOk(p.connectionResult),
    );
  }

  getModels(providerId: string): Result<ModelDescriptor[]> {
    const provider = this._providers.get(providerId);
    if (!provider) return Result.fromCanonical("Provider not found");
    return Result.Ok(provider.getModels());
  }
}
