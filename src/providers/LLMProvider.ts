import { Result } from "@/core/Result";
import type {
  ChatRequest,
  LLMStreamEvent,
  ModelDescriptor,
  ProviderCatalog,
  ProviderDeps,
  ProviderDescriptor,
  ProviderIdentity,
  ProviderTransport,
} from "./types";

export abstract class LLMProvider {
  protected connectionResultValue: Result<void> | null = null;
  protected models: ModelDescriptor[] = [];
  private revision = 0;
  registrationKey?: string;

  invalidate(): void {
    this.revision++;
    this.models = [];
    this.connectionResultValue = null;
    this.registrationKey = undefined;
  }

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
    return this.connectionResultValue;
  }

  getDescriptor(): ProviderDescriptor {
    return {
      id: this.id,
      displayName: this.displayName,
      connectionResult: this.connectionResult,
    };
  }

  async init(deps: ProviderDeps): Promise<void> {
    this.invalidate();
    const revision = this.revision;
    const modelsResult = await this.catalog.discoverModels(deps);
    if (revision !== this.revision) return;
    if (Result.isErr(modelsResult)) {
      this.connectionResultValue = modelsResult;
      return;
    }

    if (!modelsResult.value) {
      this.connectionResultValue = null;
      return;
    }
    this.models = modelsResult.value;
    this.registrationKey = deps.registrationKey;
    this.connectionResultValue = Result.Ok(undefined);
  }

  getModels(): ModelDescriptor[] {
    return this.models;
  }

  streamChat(
    request: ChatRequest,
    deps: ProviderDeps,
    signal?: AbortSignal,
  ): AsyncGenerator<LLMStreamEvent> {
    return this.transport.streamChat(request, deps, signal);
  }
}
