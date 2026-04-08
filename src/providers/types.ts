import type { Result } from "@/core/Result";

export type ProviderDescriptor = {
  readonly id: string;
  readonly displayName: string;
  readonly connectionResult: Result<void> | null;
};

export type ModelDescriptor = {
  providerId: string;
  id: string;
  canonical_slug: string;
  displayName: string;
  contextLength?: number;
};
