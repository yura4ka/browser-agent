import { Result } from "@/core/Result";
import { BrowserService } from "@/services/browser/BrowserService";
import type { BrowserSessionContext } from "@/services/browser/types";

const scenarioUrl = "https://playwright.dev/";

const session = {
  sessionId: "browser-service-smoke-scenario",
  config: {
    env: {},
    preferences: {
      allowedUrls: [scenarioUrl],
      autoAllowAllTabs: false,
    },
  },
} satisfies BrowserSessionContext;

const browser = new BrowserService();

const tab = await browser.createTab(session, scenarioUrl);

if (Result.isErr(tab)) {
  console.error(tab.error);
  process.exit(1);
}

const tabId = tab.value;

await browser.click(session, {
  tabId,
  locator: {
    kind: "role",
    role: "link",
    options: { name: { type: "text", text: "Get Started" } },
  },
});

const result = await browser.getTextContent(session, {
  tabId,
  locator: {
    kind: "role",
    role: "heading",
    options: { name: { type: "text", text: "Installation" } },
  },
});

if (Result.isErr(result)) {
  console.error(result.error);
  process.exit(1);
}

console.log(result.value);
