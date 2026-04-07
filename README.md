# browser-agent

The AI Agent that operates a real browser in full view of the user and performs browsing and information-finding tasks

## Features

- Multi-provider LLM support (Anthropic, OpenRouter, LlamaCpp, HuggingFace)
- Agent operates a real visible browser (Chromium via Playwright)
- Streaming responses
- DOM querying, accessibility tree access, page screenshots
- Tool use validation:
  * URL whitelist — agent can only navigate directly to approved URLs
  * New tab creation restricted to a configured search engine
- Session persistence

## How to run

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```
