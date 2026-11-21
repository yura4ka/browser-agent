import { Result } from "@/core/Result";
import { RESOURCE } from "@/services/chatgpt/oauth";
import type { ModelDescriptor, ProviderCatalog, ProviderDeps } from "../types";
import { httpFailure, type PlanAccounts, report } from "./errors";
import { modelListSchema } from "./wire";

export const CHATGPT_PLAN = "chatgpt-plan";

export class ChatGPTPlanCatalog implements ProviderCatalog {
  constructor(
    private readonly accounts: PlanAccounts,
    private readonly fetcher = fetch,
  ) {}

  async discoverModels(
    deps: ProviderDeps,
  ): Promise<Result<ModelDescriptor[] | null>> {
    if (!deps.registrationKey) return Result.Ok(null);

    const key = deps.registrationKey;
    const token = await this.accounts.getAccessToken(key, deps.catalogSignal);
    if (Result.isErr(token)) return token;

    try {
      const timeout = AbortSignal.timeout(12_000);
      const response = await this.fetcher(`${RESOURCE}/models`, {
        headers: { Authorization: `Bearer ${token.value}` },
        redirect: "error",
        signal: deps.catalogSignal
          ? AbortSignal.any([deps.catalogSignal, timeout])
          : timeout,
      });
      if (!response.ok) {
        const event = await report(
          this.accounts,
          key,
          token.value,
          await httpFailure(response),
        );
        return Result.fromCanonical(event.error);
      }

      const result = modelListSchema.safeParse(await response.json());

      if (!result.success)
        return Result.fromCanonical("Invalid ChatGPT model catalog");
      
      return Result.Ok(
        result.data.models
          .filter((model) => model.visibility === "list")
          .map((model) => ({
            providerId: CHATGPT_PLAN,
            id: model.slug,
            canonicalSlug: model.slug,
            displayName: model.display_name || model.slug,
            pricing: {
              input: 0,
              output: 0,
            }
          })),
      );
    } catch {
      return Result.fromCanonical("Could not fetch ChatGPT models");
    }
  }
}
