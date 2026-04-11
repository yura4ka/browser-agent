import { Result } from "@/core/Result";
import { BrowserPolicy } from "./BrowserPolicy";
import { BrowserRuntime } from "./BrowserRuntime";
import { TabAccessStore } from "./TabAccessStore";
import { TabRegistry } from "./TabRegistry";
import type { BrowserSessionContext, BrowserTab, TabInfo } from "./types";

export class BrowserService {
  private readonly runtime: BrowserRuntime;
  private readonly registry: TabRegistry;
  private readonly accessStore: TabAccessStore;
  private readonly policy: BrowserPolicy;

  constructor(
    runtime: BrowserRuntime = new BrowserRuntime(),
    registry: TabRegistry = new TabRegistry(),
    accessStore: TabAccessStore = new TabAccessStore(),
    policy?: BrowserPolicy,
  ) {
    this.runtime = runtime;
    this.registry = registry;
    this.accessStore = accessStore;
    this.policy = policy ?? new BrowserPolicy(this.accessStore);
  }

  async createTab(
    session: BrowserSessionContext,
    url: string,
  ): Promise<Result<string>> {
    const policyResult = this.policy.canOpenUrl(session, url);
    if (Result.isErr(policyResult)) return policyResult;

    const contextResult = await this.runtime.ensureContext();
    if (Result.isErr(contextResult)) return contextResult;

    const pageResult = await this.runtime.createPage();
    if (Result.isErr(pageResult)) return pageResult;

    const page = pageResult.value;
    const navigationResult = await this.runtime.navigate(page, url);

    if (Result.isErr(navigationResult)) {
      await page.close().catch(() => undefined);
      return navigationResult;
    }

    const tabResult = this.registry.createAgentTab(page, session.sessionId);
    if (Result.isErr(tabResult)) {
      await page.close().catch(() => undefined);
      return tabResult;
    }

    return Result.Ok(tabResult.value.id);
  }

  async listTabs(session: BrowserSessionContext): Promise<Result<TabInfo[]>> {
    const syncResult = this.syncState();
    if (Result.isErr(syncResult)) return syncResult;

    const visibleTabs = this.registry
      .listAll()
      .filter((browserPage) => this.canSessionAccessTab(session, browserPage));

    const tabs: TabInfo[] = [];
    for (const browserPage of visibleTabs) {
      const title = await Result.fromPromise(browserPage.page.title());

      tabs.push({
        id: browserPage.id,
        url: browserPage.page.url(),
        title: Result.isOk(title) ? title.value : "[title unavailable]",
        origin: browserPage.origin,
      });
    }

    return Result.Ok(tabs);
  }

  grantTabToSession(sessionId: string, tabId: string): Result<void> {
    const syncResult = this.syncState();
    if (Result.isErr(syncResult)) return syncResult;

    const tabResult = this.registry.getById(tabId);
    if (Result.isErr(tabResult)) {
      return Result.fromCanonical(
        `Failed to grant tab: tab "${tabId}" was not found`,
      );
    }

    return this.accessStore.grant(sessionId, tabResult.value.id);
  }

  revokeTabFromSession(sessionId: string, tabId: string): Result<void> {
    return this.accessStore.revoke(sessionId, tabId);
  }

  resolveAuthorizedTab(
    session: BrowserSessionContext,
    tabId: string,
  ): Result<BrowserTab> {
    const syncResult = this.syncState();
    if (Result.isErr(syncResult)) return syncResult;

    const tab = this.registry.getById(tabId);
    if (Result.isErr(tab)) return tab;

    const accessResult = this.policy.canAccessTab(session, tab.value);
    if (Result.isErr(accessResult)) return accessResult;

    return Result.Ok(tab.value);
  }

  private syncState(): Result<void> {
    const livePagesResult = this.runtime.listLivePages();
    if (Result.isErr(livePagesResult)) return livePagesResult;

    const syncResult = this.registry.syncWithLivePages(livePagesResult.value);
    if (Result.isErr(syncResult)) return syncResult;

    const knownTabIds = new Set(this.registry.listAll().map((page) => page.id));
    return this.accessStore.pruneUnknownTabs(knownTabIds);
  }

  private canSessionAccessTab(
    session: BrowserSessionContext,
    browserPage: BrowserTab,
  ): boolean {
    const accessResult = this.policy.canAccessTab(session, browserPage);
    return Result.isOk(accessResult);
  }
}
