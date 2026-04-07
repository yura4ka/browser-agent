import type { UserConfig } from "@/core/config";
import { Result } from "@/core/Result";
import { OpenAICompatibleProvider } from "../OpenAICompatible/OpenAICompatibleProvider";
import type { ModelDescriptor } from "../types";
import {
  type OpenRouterModel,
  type OpenRouterModelsResponse,
  openRouterModelsResponseSchema,
} from "./types";

export class OpenRouterProvider extends OpenAICompatibleProvider {
  private _connectionResult: Result<void> | null = null;
  private _models: ModelDescriptor[] = [];

  override get id(): string {
    return "openrouter";
  }

  override get displayName(): string {
    return "OpenRouter";
  }

  override get connectionResult(): Result<void> | null {
    return this._connectionResult;
  }

  override async init(config: UserConfig): Promise<void> {
    const apiKey = config.env.OPENROUTER_API_KEY;
    if (!apiKey) return;

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
      this._connectionResult = Result.fromCanonical(
        "Failed to fetch OpenRouter models",
      );
      return;
    }

    if (!response.value.ok) {
      this._connectionResult = Result.fromCanonical(
        `Failed to fetch OpenRouter models: ${response.value.status} ${response.value.statusText}`,
      );
      return;
    }

    const payload = await Result.fromPromise(response.value.json());
    if (Result.isErr(payload)) {
      this._connectionResult = Result.fromCanonical(
        "Invalid OpenRouter models response",
      );
      return;
    }

    const parsedPayload = openRouterModelsResponseSchema.safeParse(
      payload.value,
    );
    if (!parsedPayload.success) {
      this._connectionResult = Result.fromCanonical(
        "Invalid OpenRouter models response schema",
      );
      return;
    }

    this._models = this.parseModels(parsedPayload.data);
    this._connectionResult = Result.Ok(undefined);
  }

  override getModels(): ModelDescriptor[] {
    return this._models;
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
      providerId: this.id,
      id: model.id,
      canonical_slug: model.canonical_slug,
      displayName: model.name,
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
