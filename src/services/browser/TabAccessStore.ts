import { Result } from "@/core/Result";

export class TabAccessStore {
  private grantedTabsBySessionId = new Map<string, Set<string>>();

  grant(sessionId: string, tabId: string): Result<void> {
    let grantedTabs = this.grantedTabsBySessionId.get(sessionId);
    if (!grantedTabs) {
      grantedTabs = new Set<string>();
      this.grantedTabsBySessionId.set(sessionId, grantedTabs);
    }

    grantedTabs.add(tabId);
    return Result.Ok(undefined);
  }

  revoke(sessionId: string, tabId: string): Result<void> {
    const grantedTabs = this.grantedTabsBySessionId.get(sessionId);
    if (!grantedTabs) {
      return Result.Ok(undefined);
    }

    grantedTabs.delete(tabId);
    if (grantedTabs.size === 0) {
      this.grantedTabsBySessionId.delete(sessionId);
    }

    return Result.Ok(undefined);
  }

  isGranted(sessionId: string, tabId: string): boolean {
    const grantedTabs = this.grantedTabsBySessionId.get(sessionId);
    return grantedTabs?.has(tabId) ?? false;
  }

  pruneUnknownTabs(knownTabIds: Set<string>): Result<void> {
    for (const [
      sessionId,
      grantedTabs,
    ] of this.grantedTabsBySessionId.entries()) {
      for (const tabId of grantedTabs) {
        if (!knownTabIds.has(tabId)) {
          grantedTabs.delete(tabId);
        }
      }

      if (grantedTabs.size === 0) {
        this.grantedTabsBySessionId.delete(sessionId);
      }
    }

    return Result.Ok(undefined);
  }
}
