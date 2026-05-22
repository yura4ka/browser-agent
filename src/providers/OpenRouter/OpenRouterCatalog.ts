import { Result } from "@/core/Result";
import type { ModelDescriptor, ProviderCatalog, ProviderDeps } from "../types";
import {
  type OpenRouterModel,
  type OpenRouterModelsResponse,
  openRouterModelsResponseSchema,
} from "./types";

export class OpenRouterCatalog implements ProviderCatalog {
  constructor(private readonly providerId: string) {}

  async discoverModels(
    deps: ProviderDeps,
  ): Promise<Result<ModelDescriptor[] | null>> {
    const apiKey = deps.config.env.OPENROUTER_API_KEY;
    if (!apiKey) return Result.Ok(null);

    const url = new URL("https://openrouter.ai/api/v1/models");
    url.searchParams.set("supported_parameters", "tools");
    url.searchParams.set("output_modalities", "text");

    const response = await Result.fromPromise(
      fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }),
    );

    if (Result.isErr(response)) {
      return Result.fromCanonical("Failed to fetch OpenRouter models");
    }

    if (!response.value.ok) {
      return Result.fromCanonical(
        `Failed to fetch OpenRouter models: ${response.value.status} ${response.value.statusText}`,
      );
    }

    const payload = await Result.fromPromise(response.value.json());
    if (Result.isErr(payload)) {
      return Result.fromCanonical("Invalid OpenRouter models response");
    }

    const parsedPayload = openRouterModelsResponseSchema.safeParse(
      payload.value,
    );
    if (!parsedPayload.success) {
      return Result.fromCanonical("Invalid OpenRouter models response schema");
    }

    return Result.Ok(this.parseModels(parsedPayload.data));
  }

  private parseModels(payload: OpenRouterModelsResponse): ModelDescriptor[] {
    const models: ModelDescriptor[] = [];
    for (const model of payload.data) {
      const descriptor = this.toModelDescriptor(model);
      if (descriptor) models.push(descriptor);
    }
    return models;
  }

  private toModelDescriptor(model: OpenRouterModel): ModelDescriptor | null {
    if (!this.hasTextAndImageInput(model.architecture.input_modalities)) {
      return null;
    }

    if (!this.supportsTools(model.supported_parameters)) {
      return null;
    }

    const descriptor: ModelDescriptor = {
      providerId: this.providerId,
      id: model.id,
      canonicalSlug: model.canonical_slug,
      displayName: model.name,
      pricing: {
        input: Number(model.pricing.prompt) * 1e6,
        output: Number(model.pricing.completion) * 1e6,
      },
    };

    if (typeof model.context_length === "number") {
      descriptor.contextLength = model.context_length;
    }

    return descriptor;
  }

  private hasTextAndImageInput(inputModalities: string[]): boolean {
    return (
      inputModalities.includes("text") && inputModalities.includes("image")
    );
  }

  private supportsTools(supportedParameters: string[]): boolean {
    return supportedParameters.includes("tools");
  }
}
