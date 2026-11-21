import { Agent } from "@/agent/agent";
import { ContextManager } from "@/agent/ContextManager";
import type { AgentEvent } from "@/agent/types";
import { ConfigService, type IConfigService } from "@/core/config";
import { Result } from "@/core/Result";
import type { AgentSession } from "@/core/session";
import { SYSTEM_PROMPT } from "@/core/systemPrompt";
import {
  CHATGPT_PLAN,
  ChatGPTPlanProvider,
} from "@/providers/ChatGPTPlan/ChatGPTPlanProvider";
import { OpenRouterProvider } from "@/providers/OpenRouter/OpenRouterProvider";
import { ProviderManager } from "@/providers/ProviderManager";
import type {
  ModelDescriptor,
  ProviderDescriptor,
  SelectedModel,
} from "@/providers/types";
import { BrowserService } from "@/services/browser/BrowserService";
import type { ChatGPTAccountService } from "@/services/chatgpt/ChatGPTAccountService";
import type { SignInOptions } from "@/services/chatgpt/oauth";
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
  config?: IConfigService;
  providers?: ProviderManager;
  sessions?: SessionStore;
  chatService?: ChatService;
  chatgpt?: ChatGPTAccountService;
  chatgptFetch?: typeof fetch;
};

export class AppController {
  private readonly config: IConfigService;
  private readonly providers: ProviderManager;
  private readonly sessions: SessionStore;
  private readonly chatService: ChatService;
  private selectedSessionId: string | null = null;
  private readonly chatgpt?: ChatGPTAccountService;
  private readonly chatgptFetch?: typeof fetch;
  private turnRunning = false;
  private accountOperationRunning = false;
  private confirmedDestination?: { sessionId: string; selected: SelectedModel };
  private modelAccount?: string;

  constructor(deps: AppControllerDeps = {}) {
    this.config = deps.config ?? new ConfigService();
    this.providers = deps.providers ?? new ProviderManager();
    this.sessions = deps.sessions ?? new JsonSessionStore("./data/sessions");
    this.chatService = deps.chatService ?? this.createChatService();
    this.chatgpt = deps.chatgpt;
    this.chatgptFetch = deps.chatgptFetch;
  }

  async init(): Promise<void> {
    await this.config.init();

    this.providers.add(new OpenRouterProvider());
    if (this.chatgpt)
      this.providers.add(
        new ChatGPTPlanProvider(this.chatgpt, this.chatgptFetch),
      );
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
    if (providerId === CHATGPT_PLAN) return result;
    return Result.Ok(
      result.value.toSorted((a, b) =>
        a.displayName.localeCompare(b.displayName),
      ),
    );
  }

  selectModel(providerId: string, modelId: string): Result<void> {
    if (this.turnRunning || this.accountOperationRunning)
      return Result.fromCanonical("An operation is already running");
    this.confirmedDestination = undefined;
    return this.providers.select(providerId, modelId);
  }

  async prepareModels(
    providerId: string,
    signal?: AbortSignal,
  ): Promise<Result<ModelDescriptor[]>> {
    if (providerId !== CHATGPT_PLAN) return this.getModels(providerId);
    const status = await this.chatGPTStatus();
    if (Result.isErr(status)) {
      this.invalidatePlan();
      return status;
    }
    const active = status.value.active;
    if (active?.status !== "connected") {
      this.invalidatePlan();
      return Result.fromCanonical(
        active?.status === "usage-limited"
          ? "ChatGPT plan usage is paused; use /chatgpt retry"
          : active?.status === "disabled"
            ? "Plan usage is not enabled; use /chatgpt enable"
            : "ChatGPT is signed out; use /chatgpt login",
      );
    }
    const provider = this.providers
      .getProviders()
      .find((candidate) => candidate.id === CHATGPT_PLAN);
    if (
      this.modelAccount !== active.key ||
      !provider?.connectionResult ||
      Result.isErr(provider.connectionResult)
    ) {
      this.modelAccount = active.key;
      await this.providers.refresh(CHATGPT_PLAN, {
        config: this.config.get(),
        registrationKey: active.key,
        catalogSignal: signal,
      });
      const latest = await this.chatGPTStatus();
      if (
        Result.isErr(latest) ||
        latest.value.active?.key !== active.key ||
        latest.value.active.status !== "connected"
      ) {
        const error = provider?.connectionResult;
        if (this.modelAccount === active.key) this.invalidatePlan();
        if (error && Result.isErr(error)) return error;
        if (Result.isErr(latest)) return latest;
        return Result.fromCanonical(
          "ChatGPT account changed or is unavailable; reopen the model picker",
        );
      }
    }
    if (
      this.modelAccount !== active.key ||
      provider?.registrationKey !== active.key
    ) {
      const error = provider?.connectionResult;
      if (error && Result.isErr(error)) return error;
      return Result.fromCanonical(
        "ChatGPT model catalog changed; reopen the model picker",
      );
    }
    return this.getModels(providerId);
  }

  async chatGPTStatus() {
    return (
      this.chatgpt?.status() ??
      Result.fromCanonical("ChatGPT Plan is not enabled in this application")
    );
  }

  async signInChatGPT(key?: string, options?: SignInOptions) {
    return this.changeAccount(async (accounts) => {
      const before = await accounts.status();
      const result = await accounts.signIn(key, options);
      if (Result.isErr(result)) return result;
      const previousKey = Result.isOk(before)
        ? before.value.active?.key
        : undefined;
      if (
        result.value.status === "connected" ||
        !previousKey ||
        previousKey === result.value.key
      )
        this.invalidatePlan();
      if (result.value.status === "connected" && !options?.signal?.aborted)
        await this.prepareModels(CHATGPT_PLAN, options?.signal);
      return result;
    });
  }

  async signOutChatGPT() {
    return this.changeAccount(async (accounts) => {
      const status = await accounts.status();
      if (Result.isErr(status)) return status;
      if (!status.value.active)
        return Result.fromCanonical("No active ChatGPT account");
      this.invalidatePlan();
      return accounts.signOut(status.value.active.key);
    });
  }

  async retryChatGPT() {
    return this.changeAccount(async (accounts) => {
      const status = await accounts.status();
      if (Result.isErr(status)) return status;
      if (!status.value.active)
        return Result.fromCanonical("No active ChatGPT account");
      if (status.value.active.status !== "usage-limited")
        return Result.fromCanonical("ChatGPT plan usage is not paused");
      this.invalidatePlan();
      return accounts.retry(status.value.active.key);
    });
  }

  async acknowledgeChatGPT(key: string) {
    return (
      this.chatgpt?.acknowledge(key) ??
      Result.fromCanonical("ChatGPT Plan is not enabled")
    );
  }

  confirmHistoryDestination(): Result<void> {
    const selected = this.providers.selected;
    if (!selected || !this.selectedSessionId)
      return Result.fromCanonical(
        "Open a session and choose a destination model first",
      );
    if (this.turnRunning || this.accountOperationRunning)
      return Result.fromCanonical("An operation is already running");
    this.confirmedDestination = { sessionId: this.selectedSessionId, selected };
    return Result.Ok(undefined);
  }

  private invalidatePlan() {
    this.modelAccount = undefined;
    this.providers.invalidate(CHATGPT_PLAN);
  }

  private async changeAccount<T>(
    operation: (accounts: ChatGPTAccountService) => Promise<Result<T>>,
  ): Promise<Result<T>> {
    if (!this.chatgpt)
      return Result.fromCanonical("ChatGPT Plan is not enabled");
    if (this.turnRunning || this.accountOperationRunning)
      return Result.fromCanonical("An operation is already running");
    this.accountOperationRunning = true;
    try {
      return await operation(this.chatgpt);
    } finally {
      this.accountOperationRunning = false;
    }
  }

  getSelectedModel() {
    return this.providers.selected;
  }

  listSessions(): Promise<Result<AgentSessionSummary[]>> {
    return this.sessions.listSessions();
  }

  async selectSession(sessionId: string): Promise<Result<AgentSession>> {
    if (this.turnRunning || this.accountOperationRunning)
      return Result.fromCanonical("An operation is already running");
    const sessionResult = await this.sessions.getSession(sessionId);
    if (Result.isErr(sessionResult)) return sessionResult;
    if (!sessionResult.value) {
      return Result.fromCanonical(`Session not found: ${sessionId}`);
    }

    const session = sessionResult.value;
    this.confirmedDestination = undefined;
    if (session.selectedModel.providerId === CHATGPT_PLAN) {
      this.providers.clearSelection();
      const status = await this.chatGPTStatus();
      if (
        Result.isOk(status) &&
        status.value.active?.status === "connected" &&
        status.value.active.key === session.selectedModel.registrationKey
      ) {
        const models = await this.prepareModels(CHATGPT_PLAN);
        if (Result.isOk(models))
          this.providers.select(CHATGPT_PLAN, session.selectedModel.modelId);
      }
      this.selectedSessionId = session.id;
      return Result.Ok(session);
    }
    const selectModelResult = this.providers.select(
      session.selectedModel.providerId,
      session.selectedModel.modelId,
    );
    if (Result.isErr(selectModelResult)) return selectModelResult;

    this.selectedSessionId = session.id;
    return Result.Ok(session);
  }

  startNewSession(): void {
    if (this.turnRunning || this.accountOperationRunning) return;
    this.selectedSessionId = null;
    this.confirmedDestination = undefined;
  }

  async getSelectedSession(): Promise<Result<AgentSession | null>> {
    if (!this.selectedSessionId) return Result.Ok(null);
    return this.sessions.getSession(this.selectedSessionId);
  }

  async *chat(
    text: string,
    signal?: AbortSignal,
    options: { maxIterations?: number } = {},
  ): AsyncGenerator<AgentEvent> {
    if (this.turnRunning || this.accountOperationRunning) {
      yield { type: "error", error: "An operation is already running" };
      return;
    }
    this.turnRunning = true;
    const selected = this.providers.selected;
    const abortController = new AbortController();
    const cleanup = this.forwardAbort(signal, abortController);

    try {
      if (abortController.signal.aborted) {
        yield { type: "error", error: "Aborted" };
        return;
      }

      if (!selected) {
        yield {
          type: "error",
          error:
            this.chatgpt && this.selectedSessionId
              ? "No model selected. Use /model, or /chatgpt to check the saved account."
              : "No model selected",
        };
        return;
      }
      if (selected.provider.id === CHATGPT_PLAN) {
        const status = await this.chatGPTStatus();
        if (
          Result.isErr(status) ||
          status.value.active?.status !== "connected" ||
          status.value.active.key !== selected.registrationKey
        ) {
          this.invalidatePlan();
          yield {
            type: "error",
            error:
              "ChatGPT account changed or is unavailable. Use /chatgpt and select a model again.",
          };
          return;
        }
      }
      const sessionId = await this.getOrCreateSessionId(text, selected);
      if (Result.isErr(sessionId)) {
        yield this.toErrorEvent(sessionId.error);
        return;
      }

      for await (const event of this.chatService.chat(
        sessionId.value,
        text,
        abortController.signal,
        { ...options, selectedModel: selected },
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
      if (selected?.provider.id === CHATGPT_PLAN) {
        const status = await this.chatGPTStatus();
        if (
          Result.isErr(status) ||
          status.value.active?.status !== "connected" ||
          status.value.active.key !== selected.registrationKey
        )
          this.invalidatePlan();
      }
      this.turnRunning = false;
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

  private async getOrCreateSessionId(
    text: string,
    selected: SelectedModel,
  ): Promise<Result<string>> {
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
      ...(selected.registrationKey
        ? { registrationKey: selected.registrationKey }
        : {}),
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
    const previous = session.selectedModel;
    if (
      (previous.providerId === CHATGPT_PLAN ||
        selectedModel.providerId === CHATGPT_PLAN) &&
      (previous.providerId !== selectedModel.providerId ||
        previous.registrationKey !== selectedModel.registrationKey ||
        (previous.providerId === CHATGPT_PLAN && !previous.registrationKey)) &&
      (this.confirmedDestination?.sessionId !== sessionId ||
        this.confirmedDestination.selected !== selected)
    )
      return Result.fromCanonical(
        "History was not sent to a different account or provider",
        "Use /session confirm to allow the selected destination, or /session new",
      );
    if (
      session.selectedModel.providerId === selectedModel.providerId &&
      session.selectedModel.modelId === selectedModel.modelId &&
      session.selectedModel.registrationKey === selectedModel.registrationKey
    ) {
      return Result.Ok(sessionId);
    }

    session.selectedModel = selectedModel;
    const saveResult = await this.sessions.saveSession(session);
    if (Result.isErr(saveResult)) return saveResult;
    this.confirmedDestination = undefined;

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
