import { z } from "zod";

const envSchema = z
  .object({
    OPENROUTER_API_KEY: z.string().optional(),
  })
  .strip();

const preferencesSchema = z
  .object({
    allowedUrls: z.array(z.string()).default([]),
    autoAllowAllTabs: z.boolean().default(false),
    promptCaching: z
      .object({
        enabled: z.boolean().default(false),
        minCharacters: z.number().int().min(0).default(2048),
      })
      .default({ enabled: false, minCharacters: 2048 }),
  })
  .strip();

type EnvConfig = z.infer<typeof envSchema>;
type UserPreferences = z.infer<typeof preferencesSchema>;

export type UserConfig = {
  env: EnvConfig;
  preferences: UserPreferences;
};

export type IConfigService = {
  init(): Promise<void>;
  get(): UserConfig;
};

export class ConfigService implements IConfigService {
  private config: UserConfig | null = null;

  async init(): Promise<void> {
    const envConfig = envSchema.parse(process.env);
    const preferencesConfig = await this.loadPreferences();

    this.config = {
      env: envConfig,
      preferences: preferencesConfig,
    };
  }

  get(): UserConfig {
    if (!this.config) {
      throw new Error("ConfigService is not initialized. Call init() first.");
    }

    return this.config;
  }

  private async loadPreferences(): Promise<UserPreferences> {
    const preferencesFile = Bun.file("./data/preferences.json");
    if (!(await preferencesFile.exists())) {
      return preferencesSchema.parse({});
    }

    const preferencesData = (await preferencesFile.json()) as unknown;
    return preferencesSchema.parse(preferencesData);
  }
}
