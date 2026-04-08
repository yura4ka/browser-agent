import type { UserConfig } from "@/core/config";
import type { ModelDescriptor, ProviderDescriptor } from "./types";

export interface LLMProvider extends ProviderDescriptor {
  init(config: UserConfig): Promise<void>;
  getModels(): ModelDescriptor[];
  getDescriptor(): ProviderDescriptor;
}
