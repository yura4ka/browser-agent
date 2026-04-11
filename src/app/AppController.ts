import { ConfigService } from "@/core/config";
import { Result } from "@/core/Result";
import { OpenRouterProvider } from "@/providers/OpenRouter/OpenRouterProvider";
import { ProviderManager } from "@/providers/ProviderManager";
import type { ModelDescriptor, ProviderDescriptor } from "@/providers/types";

export class AppController {
  private readonly config: ConfigService;
  private readonly providers: ProviderManager;

  constructor() {
    this.config = new ConfigService();
    this.providers = new ProviderManager();
  }

  async init(): Promise<void> {
    await this.config.init();

    this.providers.add(new OpenRouterProvider());
    await this.providers.initAll(this.config.get());
  }

  getProviders(): ProviderDescriptor[] {
    const providers = this.providers
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
    const result = this.providers.getModels(providerId);
    if (Result.isErr(result)) return result;
    return Result.Ok(
      result.value.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    );
  }

  selectModel(providerId: string, modelId: string): Result<void> {
    return this.providers.select(providerId, modelId);
  }

  getSelectedModel() {
    return this.providers.selected;
  }
}
