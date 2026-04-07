import { z } from "zod";

const envSchema = z
  .object({
    OPENROUTER_API_KEY: z.string().optional(),
  })
  .strip();

const searchEngineSchema = z
  .object({
    name: z.string(),
    url: z.string(),
  })
  .strip();

const preferencesSchema = z
  .object({
    allowedSearchEngines: z.array(searchEngineSchema).optional(),
    urlAllowList: z.array(z.string()).optional(),
  })
  .strip();

type UserPreferences = z.infer<typeof preferencesSchema>;
type EnvConfig = z.infer<typeof envSchema>;

export type UserConfig = {
  env: EnvConfig;
  preferences: UserPreferences;
};

export class ConfigService {
  private _config: UserConfig | null = null;

  async init(): Promise<void> {
    const envConfig = envSchema.parse(process.env);
    const preferencesConfig = await this.loadPreferences();

    this._config = {
      env: envConfig,
      preferences: preferencesConfig,
    };
  }

  get(): UserConfig {
    if (!this._config) {
      throw new Error("ConfigService is not initialized. Call init() first.");
    }

    return this._config;
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
