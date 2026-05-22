import { Agent } from "@/agent/agent";
import { ContextManager } from "@/agent/ContextManager";
import type { AgentEvent } from "@/agent/types";
import { ConfigService } from "@/core/config";
import { Result } from "@/core/Result";
import type { AgentSession } from "@/core/session";
import { SYSTEM_PROMPT } from "@/core/systemPrompt";
import { OpenRouterProvider } from "@/providers/OpenRouter/OpenRouterProvider";
import { ProviderManager } from "@/providers/ProviderManager";
import type {
  ModelDescriptor,
  ProviderDescriptor,
  SelectedModel,
} from "@/providers/types";
import { BrowserService } from "@/services/browser/BrowserService";
import { JsonSessionStore } from "@/storage/JsonSessionStore";
import type { AgentSessionSummary, SessionStore } from "@/storage/SessionStore";
import { ToolManager } from "@/tools/ToolManager";
import {
  clearTool,
  clickTool,
  fillTextTool,
  getAriaSnapshotTool,
  getHtmlContentTool,
  getNavigationPolicyTool,
  getTextContentTool,
  highlightTool,
  listTabsTool,
  navigateTool,
  newTabTool,
  reloadTool,
  scrollIntoViewTool,
  scrollTool,
  selectOptionTool,
  setCheckedTool,
} from "@/tools/tools/browser";
import { screenshotTool } from "@/tools/tools/browser/screenshotTool";
import { ChatService } from "./ChatService";

export type AppControllerDeps = {
  config?: ConfigService;
  providers?: ProviderManager;
  sessions?: SessionStore;
  chatService?: ChatService;
};

export class AppController {
  private readonly config: ConfigService;
  private readonly providers: ProviderManager;
  private readonly sessions: SessionStore;
  private readonly chatService: ChatService;
  private selectedSessionId: string | null = null;

  constructor(deps: AppControllerDeps = {}) {
    this.config = deps.config ?? new ConfigService();
    this.providers = deps.providers ?? new ProviderManager();
    this.sessions = deps.sessions ?? new JsonSessionStore("./data/sessions");
    this.chatService = deps.chatService ?? this.createChatService();
  }

  async init(): Promise<void> {
    await this.config.init();

    this.providers.add(new OpenRouterProvider());
    await this.providers.initAll(this.config.get());
  }

  getProviders(): ProviderDescriptor[] {
    const providers = this.providers
      .getProviders()
      .map((p) => p.getDescriptor());
    providers.sort((a, b) => {
      if (a.connectionResult && !b.connectionResult) return -1;
      if (!a.connectionResult && b.connectionResult) return 1;
      if (!a.connectionResult || !b.connectionResult)
        return a.displayName.localeCompare(b.displayName);
      if (Result.isOk(a.connectionResult) && !Result.isOk(b.connectionResult))
        return -1;
      if (!Result.isOk(a.connectionResult) && Result.isOk(b.connectionResult))
        return 1;
      return a.displayName.localeCompare(b.displayName);
    });
    return providers;
  }

  getModels(providerId: string): Result<ModelDescriptor[]> {
    const result = this.providers.getModels(providerId);
    if (Result.isErr(result)) return result;
    return Result.Ok(
      result.value.toSorted((a, b) =>
        a.displayName.localeCompare(b.displayName),
      ),
    );
  }

  selectModel(providerId: string, modelId: string): Result<void> {
    return this.providers.select(providerId, modelId);
  }

  getSelectedModel() {
    return this.providers.selected;
  }

  listSessions(): Promise<Result<AgentSessionSummary[]>> {
    return this.sessions.listSessions();
  }

  async selectSession(sessionId: string): Promise<Result<AgentSession>> {
    const sessionResult = await this.sessions.getSession(sessionId);
    if (Result.isErr(sessionResult)) return sessionResult;
    if (!sessionResult.value) {
      return Result.fromCanonical(`Session not found: ${sessionId}`);
    }

    const session = sessionResult.value;
    const selectModelResult = this.providers.select(
      session.selectedModel.providerId,
      session.selectedModel.modelId,
    );
    if (Result.isErr(selectModelResult)) return selectModelResult;

    this.selectedSessionId = session.id;
    return Result.Ok(session);
  }

  startNewSession(): void {
    this.selectedSessionId = null;
  }

  async getSelectedSession(): Promise<Result<AgentSession | null>> {
    if (!this.selectedSessionId) return Result.Ok(null);
    return this.sessions.getSession(this.selectedSessionId);
  }

  async *chat(text: string, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
    const abortController = new AbortController();
    const cleanup = this.forwardAbort(signal, abortController);

    try {
      if (abortController.signal.aborted) {
        yield { type: "error", error: "Aborted" };
        return;
      }

      const sessionId = await this.getOrCreateSessionId(text);
      if (Result.isErr(sessionId)) {
        yield this.toErrorEvent(sessionId.error);
        return;
      }

      for await (const event of this.chatService.chat(
        sessionId.value,
        text,
        abortController.signal,
      )) {
        yield event;
      }
    } catch (error) {
      abortController.abort();
      yield {
        type: "error",
        error: this.errorToMessage(error),
      };
    } finally {
      cleanup();
    }
  }

  private createChatService(): ChatService {
    const browser = new BrowserService();
    const tools = this.createToolManager();
    const agent = new Agent(
      this.providers,
      tools,
      new ContextManager(),
      browser,
    );

    return new ChatService(this.sessions, agent, this.config);
  }

  private createToolManager(): ToolManager {
    return new ToolManager()
      .addTool(clearTool)
      .addTool(clickTool)
      .addTool(fillTextTool)
      .addTool(getAriaSnapshotTool)
      .addTool(getHtmlContentTool)
      .addTool(getNavigationPolicyTool)
      .addTool(getTextContentTool)
      .addTool(screenshotTool)
      .addTool(highlightTool)
      .addTool(listTabsTool)
      .addTool(navigateTool)
      .addTool(newTabTool)
      .addTool(reloadTool)
      .addTool(scrollIntoViewTool)
      .addTool(scrollTool)
      .addTool(selectOptionTool)
      .addTool(setCheckedTool);
  }

  private async getOrCreateSessionId(text: string): Promise<Result<string>> {
    const selected = this.providers.selected;
    if (!selected) return Result.fromCanonical("No model selected");

    if (this.selectedSessionId) {
      return this.updateSelectedSessionModel(this.selectedSessionId, selected);
    }

    const sessionResult = await this.sessions.createSession({
      title: this.createSessionTitle(text),
      systemPrompt: SYSTEM_PROMPT,
      selectedModel: this.toSessionSelectedModel(selected),
    });
    if (Result.isErr(sessionResult)) return sessionResult;

    this.selectedSessionId = sessionResult.value.id;
    return Result.Ok(sessionResult.value.id);
  }

  private createSessionTitle(text: string): string {
    const title = text.trim().replace(/\s+/g, " ");
    if (!title) return "Untitled session";
    return title.length > 36 ? `${title.slice(0, 34)}...` : title;
  }

  private toSessionSelectedModel(selected: SelectedModel) {
    return {
      providerId: selected.provider.id,
      modelId: selected.model.id,
    };
  }

  private async updateSelectedSessionModel(
    sessionId: string,
    selected: SelectedModel,
  ): Promise<Result<string>> {
    const sessionResult = await this.sessions.getSession(sessionId);
    if (Result.isErr(sessionResult)) return sessionResult;

    const session = sessionResult.value;
    if (!session) {
      return Result.fromCanonical(`Session not found: ${sessionId}`);
    }

    const selectedModel = this.toSessionSelectedModel(selected);
    if (
      session.selectedModel.providerId === selectedModel.providerId &&
      session.selectedModel.modelId === selectedModel.modelId
    ) {
      return Result.Ok(sessionId);
    }

    session.selectedModel = selectedModel;
    const saveResult = await this.sessions.saveSession(session);
    if (Result.isErr(saveResult)) return saveResult;

    return Result.Ok(sessionId);
  }

  private forwardAbort(
    signal: AbortSignal | undefined,
    abortController: AbortController,
  ): () => void {
    if (!signal) return () => undefined;

    const abort = () => abortController.abort(signal.reason);
    if (signal.aborted) {
      abort();
      return () => undefined;
    }

    signal.addEventListener("abort", abort, { once: true });
    return () => signal.removeEventListener("abort", abort);
  }

  private toErrorEvent(error: { message: string; hint?: string }): AgentEvent {
    return {
      type: "error",
      error: error.hint ? `${error.message} (${error.hint})` : error.message,
    };
  }

  private errorToMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
