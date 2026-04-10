import { LLMProvider } from "../LLMProvider";
import { OpenRouterCatalog } from "./OpenRouterCatalog";
import { OpenRouterTransport } from "./OpenRouterTransport";

export class OpenRouterProvider extends LLMProvider {
  constructor() {
    super(
      {
        id: "openrouter",
        displayName: "OpenRouter",
      },
      new OpenRouterCatalog("openrouter"),
      new OpenRouterTransport(),
    );
  }
}
