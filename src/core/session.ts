import type { UserConfig } from "./config";

export type SessionContext = {
  sessionId: string;
  config: UserConfig;
};
