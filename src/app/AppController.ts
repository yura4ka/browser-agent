import { ConfigService } from "@/core/config";
import { Result } from "@/core/Result";
import { OpenRouterProvider } from "@/providers/OpenRouter/OpenRouterProvider";
import { ProviderManager } from "@/providers/ProviderManager";
import type { ModelDescriptor, ProviderDescriptor } from "@/providers/types";

export class AppController {
  private readonly _config: ConfigService;
  private readonly _providers: ProviderManager;

  constructor() {
    this._config = new ConfigService();
    this._providers = new ProviderManager();
  }

  async init(): Promise<void> {
    await this._config.init();

    this._providers.add(new OpenRouterProvider());
    await this._providers.initAll(this._config.get());
  }

  getProviders(): ProviderDescriptor[] {
    const providers = this._providers
      .getProviders()
      .map((p) => p.getDescriptor());
    providers.sort((a, b) => {
      if (a.connectionResult && !b.connectionResult) return -1;
      if (!a.connectionResult && b.connectionResult) return 1;
      if (!a.connectionResult || !b.connectionResult)
        return a.displayName.localeCompare(b.displayName);
      if (Result.isOk(a.connectionResult) && !Result.isOk(b.connectionResult))
        return -1;
      if (!Result.isOk(a.connectionResult) && Result.isOk(b.connectionResult))
        return 1;
      return a.displayName.localeCompare(b.displayName);
    });
    return providers;
  }

  getModels(providerId: string): Result<ModelDescriptor[]> {
    const result = this._providers.getModels(providerId);
    if (Result.isErr(result)) return result;
    return Result.Ok(
      result.value.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    );
  }

  selectModel(providerId: string, modelId: string): Result<void> {
    return this._providers.select(providerId, modelId);
  }

  getSelectedModel() {
    return this._providers.selected;
  }
}
