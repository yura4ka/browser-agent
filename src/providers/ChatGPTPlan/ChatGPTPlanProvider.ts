import { LLMProvider } from "../LLMProvider";
import { CHATGPT_PLAN, ChatGPTPlanCatalog } from "./ChatGPTPlanCatalog";
import { ChatGPTPlanTransport } from "./ChatGPTPlanTransport";
import type { PlanAccounts } from "./errors";

export { CHATGPT_PLAN } from "./ChatGPTPlanCatalog";

export class ChatGPTPlanProvider extends LLMProvider {
  constructor(accounts: PlanAccounts, fetcher = fetch) {
    super(
      { id: CHATGPT_PLAN, displayName: "ChatGPT Plan (preview)" },
      new ChatGPTPlanCatalog(accounts, fetcher),
      new ChatGPTPlanTransport(accounts, fetcher),
    );
  }
}
