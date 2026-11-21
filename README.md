# browser-agent

The AI Agent that operates a real browser in full view of the user and performs browsing and information-finding tasks

## Features

- OpenRouter and opt-in ChatGPT Plan
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

## ChatGPT Plan

On a native Linux, Windows, or macOS desktop, run `/chatgpt login` to **Continue with ChatGPT** in your system browser. No OpenAI API key is needed. After granting plan access, choose **ChatGPT Plan (preview)** in `/model`. Sign-in never starts automatically, and you can keep using OpenRouter without signing in.

- `/chatgpt` shows the active account and lets you pick a saved registration. `/chatgpt login new` adds an account or workspace. Use `/chatgpt enable` if plan access wasn't granted, or `/chatgpt logout` to sign out of the active registration.
- Use `/cancel` or Ctrl+C during sign-in. If the CLI can't open a browser, it offers a new authorization link without account hints. The browser must be able to reach the CLI's local loopback address; WSL, containers, and remote runtimes are not covered by native desktop support.
- [Manage usage](https://chatgpt.com/settings/usage) in ChatGPT. After a usage-limit error, `/chatgpt retry` allows another attempt. The CLI does not estimate remaining quota, reset times, or dollar cost for plan usage.
- Saved plan sessions remain readable locally when the original account is unavailable. To send that history to another account or provider, select the new destination and use `/session confirm`. Use `/session new` if you don't want to share the old history.

Credentials live outside `data/` and `.env`: in `$XDG_CONFIG_HOME/browser-agent/chatgpt` (default `~/.config/browser-agent/chatgpt`) on Linux, `~/Library/Application Support/browser-agent/chatgpt` on macOS, and `%LOCALAPPDATA%\browser-agent\chatgpt` on Windows. Windows uses current-user DPAPI. The CLI does not import ChatGPT conversations.
