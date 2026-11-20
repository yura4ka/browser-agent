import type { IConfigService, UserConfig } from "@/core/config";

export class BenchmarkConfigService implements IConfigService {
  private config: UserConfig | null = null;

  constructor(private readonly entryUrl: string) {}

  async init(): Promise<void> {
    const { OPENROUTER_API_KEY } = process.env;

    this.config = {
      env: {
        OPENROUTER_API_KEY,
      },
      preferences: {
        allowedUrls: [this.entryUrl],
        autoAllowAllTabs: false,
        promptCaching: {
          enabled: true,
          minCharacters: 2048,
        },
      },
    };
  }

  get(): UserConfig {
    if (!this.config) {
      throw new Error(
        "BenchmarkConfigService is not initialized. Call init() first.",
      );
    }

    return this.config;
  }
}
