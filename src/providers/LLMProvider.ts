import type { UserConfig } from "@/core/config";
import type { Result } from "@/core/Result";
import type { ModelDescriptor } from "./types";

export interface LLMProvider {
  readonly id: string;
  readonly displayName: string;
  readonly connectionResult: Result<void> | null;

  init(config: UserConfig): Promise<void>;
  getModels(): ModelDescriptor[];
}
