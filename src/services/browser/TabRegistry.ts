import type { Page } from "playwright";
import { Result } from "@/core/Result";
import type { BrowserTab } from "./types";

export class TabRegistry {
  private tabs: BrowserTab[] = [];

  syncWithLivePages(livePages: Page[]): Result<void> {
    this.tabs = this.tabs.filter((tab) => livePages.includes(tab.page));

    for (const livePage of livePages) {
      const exists = this.tabs.some((tab) => tab.page === livePage);
      if (!exists) {
        this.tabs.push({
          id: this.generateTabId(),
          page: livePage,
          origin: "user",
        });
      }
    }

    return Result.Ok(undefined);
  }

  createAgentTab(page: Page, sessionId: string): Result<BrowserTab> {
    const tab: BrowserTab = {
      id: this.generateTabId(),
      origin: "agent",
      createdBySessionId: sessionId,
      page,
    };

    this.tabs.push(tab);
    return Result.Ok(tab);
  }

  registerUserTab(page: Page): Result<BrowserTab> {
    const existing = this.tabs.find((tab) => tab.page === page);
    if (existing) return Result.Ok(existing);

    const tab: BrowserTab = {
      id: this.generateTabId(),
      origin: "user",
      page,
    };
    this.tabs.push(tab);
    return Result.Ok(tab);
  }

  getById(tabId: string): Result<BrowserTab> {
    const tab = this.tabs.find((tab) => tab.id === tabId);
    if (!tab) {
      return Result.fromCanonical(
        `Failed to resolve tab: tab "${tabId}" was not found or already closed`,
      );
    }

    return Result.Ok(tab);
  }

  listAll(): BrowserTab[] {
    return [...this.tabs];
  }

  private generateTabId(): string {
    let id = "";
    do {
      id = `tab-${Bun.randomUUIDv7().slice(-5)}`;
    } while (this.tabs.some((page) => page.id === id));

    return id;
  }
}
