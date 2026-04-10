import { Result } from "@/core/Result";
import type {
  ChatRequest,
  LLMStreamEvent,
  ModelDescriptor,
  ProviderCatalog,
  ProviderContext,
  ProviderDescriptor,
  ProviderIdentity,
  ProviderTransport,
} from "./types";

export abstract class LLMProvider {
  protected _connectionResult: Result<void> | null = null;
  protected _models: ModelDescriptor[] = [];

  protected constructor(
    protected readonly identity: ProviderIdentity,
    protected readonly catalog: ProviderCatalog,
    protected readonly transport: ProviderTransport,
  ) {}

  get id(): string {
    return this.identity.id;
  }

  get displayName(): string {
    return this.identity.displayName;
  }

  get connectionResult(): Result<void> | null {
    return this._connectionResult;
  }

  getDescriptor(): ProviderDescriptor {
    return {
      id: this.id,
      displayName: this.displayName,
      connectionResult: this.connectionResult,
    };
  }

  async init(context: ProviderContext): Promise<void> {
    const modelsResult = await this.catalog.discoverModels(context);
    if (Result.isErr(modelsResult)) {
      this._connectionResult = modelsResult;
      return;
    }

    if (!modelsResult.value) {
      this._connectionResult = null;
      return;
    }
    this._models = modelsResult.value;
    this._connectionResult = Result.Ok(undefined);
  }

  getModels(): ModelDescriptor[] {
    return this._models;
  }

  streamChat(
    request: ChatRequest,
    context: ProviderContext,
    signal?: AbortSignal,
  ): AsyncGenerator<LLMStreamEvent> {
    return this.transport.streamChat(request, context, signal);
  }
}
