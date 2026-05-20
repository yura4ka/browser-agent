import { Result } from "@/core/Result";
import { BrowserPolicy } from "./BrowserPolicy";
import { BrowserRuntime } from "./BrowserRuntime";
import type { LocatorDef } from "./locator/schema";
import { TabAccessStore } from "./TabAccessStore";
import { TabRegistry } from "./TabRegistry";
import type {
  BrowserSelectOption,
  BrowserSessionContext,
  BrowserTab,
  TabInfo,
} from "./types";

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

  async navigateTab(
    session: BrowserSessionContext,
    tabId: string,
    url: string,
  ): Promise<Result<void>> {
    const tabResult = this.resolveAuthorizedTab(session, tabId);
    if (Result.isErr(tabResult)) return tabResult;

    return this.runtime.navigate(tabResult.value.page, url);
  }

  async reloadTab(
    session: BrowserSessionContext,
    tabId: string,
  ): Promise<Result<void>> {
    const tabResult = this.resolveAuthorizedTab(session, tabId);
    if (Result.isErr(tabResult)) return tabResult;

    return this.runtime.reload(tabResult.value.page);
  }

  async scrollTab(
    session: BrowserSessionContext,
    input: { tabId: string; deltaX?: number; deltaY?: number },
  ): Promise<Result<void>> {
    const tabResult = this.resolveAuthorizedTab(session, input.tabId);
    if (Result.isErr(tabResult)) return tabResult;

    return this.runtime.scroll(tabResult.value.page, {
      deltaX: input.deltaX,
      deltaY: input.deltaY,
    });
  }

  async getAriaSnapshot(
    session: BrowserSessionContext,
    input: { tabId: string; locator?: LocatorDef; depth?: number },
  ): Promise<Result<string>> {
    const tabResult = this.resolveAuthorizedTab(session, input.tabId);
    if (Result.isErr(tabResult)) return tabResult;

    if (!input.locator) {
      return this.runtime.getPageAreaSnapshot(tabResult.value.page, {
        depth: input.depth,
      });
    }

    const locator = this.runtime.resolveLocator(
      tabResult.value.page,
      input.locator,
    );
    if (Result.isErr(locator)) return locator;

    return this.runtime.getLocatorAriaSnapshot(locator.value, {
      depth: input.depth,
    });
  }

  async getHtmlContent(
    session: BrowserSessionContext,
    input: { tabId: string; locator?: LocatorDef; maxLength?: number },
  ): Promise<Result<string>> {
    const tabResult = this.resolveAuthorizedTab(session, input.tabId);
    if (Result.isErr(tabResult)) return tabResult;

    if (!input.locator) {
      return this.runtime.getPageHtmlContent(tabResult.value.page);
    }

    const locator = this.runtime.resolveLocator(
      tabResult.value.page,
      input.locator,
    );

    if (Result.isErr(locator)) return locator;

    const htmlResult = await this.runtime.getLocatorHtmlContent(locator.value);
    if (Result.isErr(htmlResult)) return htmlResult;

    return Result.Ok(this.truncateText(htmlResult.value, input.maxLength));
  }

  async getTextContent(
    session: BrowserSessionContext,
    input: { tabId: string; locator: LocatorDef; maxLength?: number },
  ): Promise<Result<string>> {
    const tabResult = this.resolveAuthorizedTab(session, input.tabId);
    if (Result.isErr(tabResult)) return tabResult;

    const locatorResult = this.runtime.resolveLocator(
      tabResult.value.page,
      input.locator,
    );
    if (Result.isErr(locatorResult)) return locatorResult;

    const textResult = await this.runtime.getTextContent(locatorResult.value);
    if (Result.isErr(textResult)) return textResult;

    return Result.Ok(this.truncateText(textResult.value, input.maxLength));
  }

  async click(
    session: BrowserSessionContext,
    input: { tabId: string; locator: LocatorDef },
  ): Promise<Result<void>> {
    const tabResult = this.resolveAuthorizedTab(session, input.tabId);
    if (Result.isErr(tabResult)) return tabResult;

    const locatorResult = this.runtime.resolveLocator(
      tabResult.value.page,
      input.locator,
    );
    if (Result.isErr(locatorResult)) return locatorResult;

    return this.runtime.click(locatorResult.value);
  }

  async setChecked(
    session: BrowserSessionContext,
    input: { tabId: string; locator: LocatorDef; checked: boolean },
  ): Promise<Result<void>> {
    const tabResult = this.resolveAuthorizedTab(session, input.tabId);
    if (Result.isErr(tabResult)) return tabResult;

    const locatorResult = this.runtime.resolveLocator(
      tabResult.value.page,
      input.locator,
    );
    if (Result.isErr(locatorResult)) return locatorResult;

    return this.runtime.setChecked(locatorResult.value, input.checked);
  }

  async fillText(
    session: BrowserSessionContext,
    input: { tabId: string; locator: LocatorDef; text: string },
  ): Promise<Result<void>> {
    const tabResult = this.resolveAuthorizedTab(session, input.tabId);
    if (Result.isErr(tabResult)) return tabResult;

    const locatorResult = this.runtime.resolveLocator(
      tabResult.value.page,
      input.locator,
    );
    if (Result.isErr(locatorResult)) return locatorResult;

    return this.runtime.fillText(locatorResult.value, input.text);
  }

  async clear(
    session: BrowserSessionContext,
    input: { tabId: string; locator: LocatorDef },
  ): Promise<Result<void>> {
    const tabResult = this.resolveAuthorizedTab(session, input.tabId);
    if (Result.isErr(tabResult)) return tabResult;

    const locatorResult = this.runtime.resolveLocator(
      tabResult.value.page,
      input.locator,
    );
    if (Result.isErr(locatorResult)) return locatorResult;

    return this.runtime.clear(locatorResult.value);
  }

  async highlight(
    session: BrowserSessionContext,
    input: { tabId: string; locator: LocatorDef },
  ): Promise<Result<void>> {
    const tabResult = this.resolveAuthorizedTab(session, input.tabId);
    if (Result.isErr(tabResult)) return tabResult;

    const locatorResult = this.runtime.resolveLocator(
      tabResult.value.page,
      input.locator,
    );
    if (Result.isErr(locatorResult)) return locatorResult;

    return this.runtime.highlight(locatorResult.value);
  }

  async scrollIntoView(
    session: BrowserSessionContext,
    input: { tabId: string; locator: LocatorDef },
  ): Promise<Result<void>> {
    const tabResult = this.resolveAuthorizedTab(session, input.tabId);
    if (Result.isErr(tabResult)) return tabResult;

    const locatorResult = this.runtime.resolveLocator(
      tabResult.value.page,
      input.locator,
    );
    if (Result.isErr(locatorResult)) return locatorResult;

    return this.runtime.scrollIntoView(locatorResult.value);
  }

  async selectOption(
    session: BrowserSessionContext,
    input: { tabId: string; locator: LocatorDef } & BrowserSelectOption,
  ): Promise<Result<void>> {
    const tabResult = this.resolveAuthorizedTab(session, input.tabId);
    if (Result.isErr(tabResult)) return tabResult;

    const locatorResult = this.runtime.resolveLocator(
      tabResult.value.page,
      input.locator,
    );
    if (Result.isErr(locatorResult)) return locatorResult;

    return this.runtime.selectOption(locatorResult.value, input);
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

  private truncateText(text: string, maxLength?: number): string {
    if (!maxLength || text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength)}\n[truncated to ${maxLength} characters]`;
  }
}
