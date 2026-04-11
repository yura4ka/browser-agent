import type { Page } from "playwright";
import type { SessionContext } from "@/core/session";

export type BrowserSessionContext = SessionContext;

export type BrowserTab = {
  id: string;
  origin: "agent" | "user";
  createdBySessionId?: string;
  page: Page;
};

export type TabInfo = {
  id: string;
  url: string;
  title: string;
  origin: "agent" | "user";
};
