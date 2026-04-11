import { Result } from "@/core/Result";
import type { TabAccessStore } from "./TabAccessStore";
import type { BrowserSessionContext, BrowserTab } from "./types";

export class BrowserPolicy {
  constructor(private readonly accessStore: TabAccessStore) {}

  canOpenUrl(session: BrowserSessionContext, url: string): Result<void> {
    const urlHref = Result.wrap(() => new URL(url).href);
    if (Result.isErr(urlHref))
      return Result.fromCanonical(`Failed to open URL: "${url}" is not valid`);

    for (const rule of session.config.preferences.allowedUrls) {
      const ruleHref = Result.wrap(() => new URL(rule).href);
      if (Result.isOk(ruleHref) && urlHref.value === ruleHref.value) {
        return Result.Ok(undefined);
      }
    }

    return Result.fromCanonical(`Failed to open URL: "${url}" is not allowed`);
  }

  canAccessTab(
    session: BrowserSessionContext,
    browserPage: BrowserTab,
  ): Result<void> {
    if (browserPage.createdBySessionId === session.sessionId) {
      return Result.Ok(undefined);
    }

    if (this.accessStore.isGranted(session.sessionId, browserPage.id)) {
      return Result.Ok(undefined);
    }

    if (
      session.config.preferences.autoAllowAllTabs &&
      browserPage.origin === "user"
    ) {
      return Result.Ok(undefined);
    }

    return Result.fromCanonical(
      `Failed to resolve tab: this session is not authorized for tab "${browserPage.id}"`,
    );
  }
}
