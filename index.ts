import chalk from "chalk";
import type { AgentEvent } from "@/agent/types";
import { AppController } from "@/app/AppController";
import type { CanonicalMessage, ToolCall } from "@/core/messages";
import { Result } from "@/core/Result";
import type { AgentSession, AgentUsage } from "@/core/session";
import { CHATGPT_PLAN } from "@/providers/ChatGPTPlan/ChatGPTPlanProvider";
import type { ModelDescriptor, ProviderDescriptor } from "@/providers/types";
import {
  type ChatGPTAccount,
  ChatGPTAccountService,
} from "@/services/chatgpt/ChatGPTAccountService";
import { MANAGE_USAGE } from "@/services/chatgpt/oauth";
import type { AgentSessionSummary } from "@/storage/SessionStore";
import type { ToolResult } from "@/tools/types";

type PendingSelection =
  | { type: "model-provider"; providers: ProviderDescriptor[] }
  | {
      type: "model-model";
      provider: ProviderDescriptor;
      models: ModelDescriptor[];
    }
  | { type: "session"; sessions: AgentSessionSummary[] }
  | { type: "chatgpt-account"; accounts: ChatGPTAccount[] };

type ActiveTurn = {
  abortController: AbortController;
  done: Promise<void>;
};

const app = new AppController({ chatgpt: new ChatGPTAccountService() });

let pendingSelection: PendingSelection | null = null;
let activeTurn: ActiveTurn | null = null;
let activeSignIn: ActiveTurn | null = null;
let planAccount: ChatGPTAccount | undefined;
let welcomeKey: string | undefined;
let isExiting = false;

await main();

async function main(): Promise<void> {
  process.on("SIGINT", handleSigint);

  writeLine(chalk.bold("Browser Agent"));
  writeLine(chalk.dim("Initializing..."));
  await app.init();
  writeLine(chalk.green("Ready."));
  writeLine(chalk.dim("Type /help for commands."));

  printCurrentModel();
  writePrompt();

  for await (const line of console) {
    if (isExiting) break;

    const input = String(line);

    if (activeSignIn) {
      const command = input.trim();
      if (command === "/cancel" || command === "/abort")
        activeSignIn.abortController.abort();
      else if (command === "/exit" || command === "/quit") await exitApp();
      else
        writeLine(
          chalk.dim("ChatGPT sign-in is running. Use /cancel to stop it."),
        );
      continue;
    }

    if (activeTurn) {
      await handleInputDuringActiveTurn(input);
      continue;
    }

    if (pendingSelection) {
      if (
        pendingSelection.type === "chatgpt-account" &&
        input.trimStart().startsWith("/chatgpt")
      ) {
        pendingSelection = null;
        await handleCommand(input.trim());
        if (!isExiting && !activeSignIn) writePrompt();
        continue;
      }
      await handlePendingSelection(input.trim());
      if (!isExiting && !activeTurn && !activeSignIn) writePrompt();
      continue;
    }

    if (input.trim().length === 0) {
      writePrompt();
      continue;
    }

    if (input.trimStart().startsWith("/")) {
      await handleCommand(input.trim());
      if (!isExiting && !activeTurn && !activeSignIn) writePrompt();
      continue;
    }

    startChatTurn(input);
  }
  if (activeSignIn) {
    isExiting = true;
    activeSignIn.abortController.abort();
    await activeSignIn.done;
  }
}

async function handleInputDuringActiveTurn(input: string): Promise<void> {
  const command = input.trim();

  if (command === "/abort") {
    activeTurn?.abortController.abort("User aborted turn");
    writeLine(chalk.yellow("Aborting current turn..."));
    return;
  }

  if (command === "/exit" || command === "/quit") {
    await exitApp();
    return;
  }

  writeLine(chalk.yellow("A turn is running. Use /abort to stop it."));
}

async function handleCommand(command: string): Promise<void> {
  const [name, ...args] = command.split(/\s+/);

  switch (name) {
    case "/help":
      printHelp();
      return;
    case "/model":
      if (args[0] === "current") {
        printCurrentModel();
        return;
      }
      await startModelSelection();
      return;
    case "/session":
      if (args[0] === "confirm") {
        const result = app.confirmHistoryDestination();
        if (Result.isErr(result)) writeError(result.error.message);
        else
          writeLine(
            chalk.yellow(
              "Confirmed: the next message may send this session’s history (including browser data) to the selected destination.",
            ),
          );
        return;
      }
      if (args[0] === "new") {
        startNewSession();
        return;
      }
      await startSessionSelection();
      return;
    case "/sessions":
      await printSessions();
      return;
    case "/chatgpt":
      await handleChatGPT(args[0], args[1]);
      return;
    case "/abort":
      writeLine(chalk.dim("No active turn to abort."));
      return;
    case "/exit":
    case "/quit":
      await exitApp();
      return;
    default:
      writeLine(chalk.red(`Unknown command: ${command}`));
      writeLine(chalk.dim("Type /help for commands."));
  }
}

async function handleChatGPT(
  action?: string,
  argument?: string,
): Promise<void> {
  const status = await app.chatGPTStatus();
  if (Result.isErr(status)) {
    writeError(status.error.message, status.error.hint);
    return;
  }
  const { accounts, active } = status.value;
  planAccount = active;
  if (action === "login" && (!argument || argument === "new")) {
    startChatGPTSignIn(argument === "new" ? undefined : active?.key);
    return;
  }
  if (action === "enable") {
    startChatGPTSignIn(active?.key, !!active);
    return;
  }
  if (action === "logout") {
    const result = await app.signOutChatGPT();
    if (Result.isErr(result))
      writeError(result.error.message, result.error.hint);
    else {
      if (planAccount) planAccount = { ...planAccount, status: "signed-out" };
      writeLine(chalk.green("Signed out of ChatGPT Plan locally."));
      if (!result.value.confirmed)
        writeLine(
          chalk.yellow(
            "Remote revocation could not be confirmed. Disconnect the app in ChatGPT settings.",
          ),
        );
    }
    return;
  }
  if (action === "retry") {
    const result = await app.retryChatGPT();
    if (Result.isErr(result)) writeError(result.error.message);
    else
      writeLine(
        chalk.green(
          "Plan requests are no longer paused. Use /model to select a model.",
        ),
      );
    return;
  }
  if (action === "ok" && welcomeKey) {
    const result = await app.acknowledgeChatGPT(welcomeKey);
    if (Result.isErr(result)) writeError(result.error.message);
    else welcomeKey = undefined;
    return;
  }
  if (action) {
    writeLine(
      "Use /chatgpt, /chatgpt login [new], /chatgpt logout, /chatgpt enable, or /chatgpt retry.",
    );
    return;
  }
  writeLine(chalk.bold("ChatGPT Plan (preview)"));
  const connection = app
    .getProviders()
    .find((provider) => provider.id === CHATGPT_PLAN)?.connectionResult;
  const activeStatus =
    active?.status === "connected" && connection && Result.isErr(connection)
      ? "unavailable"
      : active?.status;
  writeLine(
    `Active: ${active ? `${active.label} — ${activeStatus}` : "signed out"}`,
  );
  writeLine(`Manage usage: ${MANAGE_USAGE}`);
  writeLine(
    "Continue with ChatGPT: /chatgpt login. To add an account or workspace: /chatgpt login new.",
  );
  if (!accounts.length) return;
  accounts.forEach((account, i) => {
    writeLine(`${i + 1}. ${account.label} — ${account.status}`);
  });
  writeLine("Choose a saved account to reauthorize or /cancel.");
  pendingSelection = { type: "chatgpt-account", accounts };
}

function startChatGPTSignIn(key?: string, reconsent = false): void {
  const abortController = new AbortController();
  writeLine(chalk.bold("Continue with ChatGPT"));
  writeLine(chalk.dim("Waiting for sign-in. Use /cancel or Ctrl+C to stop."));
  const done = (async () => {
    try {
      const result = await app.signInChatGPT(key, {
        signal: abortController.signal,
        reconsent,
        manualOpen: (url) =>
          writeLine(`Open this authorization link in your browser:\n${url}`),
      });
      if (Result.isErr(result)) {
        writeError(result.error.message, result.error.hint);
      } else if (result.value.status === "disabled") {
        writeLine(
          chalk.yellow(
            "Signed in, but ChatGPT plan usage was not granted. Use /chatgpt enable or select another provider.",
          ),
        );
      } else {
        planAccount = result.value;
        writeLine(
          chalk.green(
            `Connected: ${result.value.label}. Use /model to choose a model.`,
          ),
        );
        if (!result.value.welcomed) {
          welcomeKey = result.value.key;
          writeLine(
            `You're using your ChatGPT plan for eligible requests. Manage usage: ${MANAGE_USAGE}\nUse /chatgpt ok to acknowledge.`,
          );
        }
      }
    } finally {
      activeSignIn = null;
      writePrompt();
    }
  })();
  activeSignIn = { abortController, done };
}

async function startModelSelection(): Promise<void> {
  const providers = app.getProviders();
  if (providers.length === 0) {
    writeLine(chalk.red("No providers are available."));
    return;
  }

  writeLine(chalk.bold("Providers"));
  providers.forEach((provider, index) => {
    const status = formatProviderStatus(provider);
    writeLine(
      `${chalk.cyan(String(index + 1).padStart(2))}. ${provider.displayName} ${status}`,
    );
  });

  pendingSelection = { type: "model-provider", providers };
}

async function startSessionSelection(): Promise<void> {
  const result = await app.listSessions();
  if (Result.isErr(result)) {
    writeError(result.error.message, result.error.hint);
    return;
  }

  if (result.value.length === 0) {
    writeLine(chalk.dim("No saved sessions."));
    return;
  }

  printSessionSummaries(result.value);
  pendingSelection = { type: "session", sessions: result.value };
}

async function handlePendingSelection(input: string): Promise<void> {
  if (input === "/cancel") {
    pendingSelection = null;
    writeLine(chalk.dim("Cancelled."));
    return;
  }

  if (input === "/exit" || input === "/quit") {
    await exitApp();
    return;
  }

  const pending = pendingSelection;
  if (!pending) return;

  if (pending.type === "model-provider") {
    await selectProvider(input, pending.providers);
    return;
  }

  if (pending.type === "model-model") {
    selectModel(input, pending.provider, pending.models);
    return;
  }

  if (pending.type === "chatgpt-account") {
    const account = getSelectedItem(input, pending.accounts);
    if (!account) {
      writeInvalidSelection();
      return;
    }
    pendingSelection = null;
    startChatGPTSignIn(account.key, account.status === "disabled");
    return;
  }

  await selectSession(input, pending.sessions);
}

async function selectProvider(
  input: string,
  providers: ProviderDescriptor[],
): Promise<void> {
  const provider = getSelectedItem(input, providers);
  if (!provider) {
    writeInvalidSelection();
    return;
  }

  const modelsResult = await app.prepareModels(provider.id);
  if (Result.isErr(modelsResult)) {
    pendingSelection = null;
    writeError(modelsResult.error.message, modelsResult.error.hint);
    return;
  }

  if (provider.id === CHATGPT_PLAN) {
    const status = await app.chatGPTStatus();
    if (Result.isOk(status)) planAccount = status.value.active;
  }

  if (modelsResult.value.length === 0) {
    pendingSelection = null;
    writeLine(
      chalk.red(`No models are available for ${provider.displayName}.`),
    );
    return;
  }

  writeLine(chalk.bold(`Models for ${provider.displayName}`));
  modelsResult.value.forEach((model, index) => {
    const context = model.contextLength
      ? chalk.dim(` ${model.contextLength.toLocaleString()} ctx`)
      : "";

    const price =
      model.pricing.input === 0 && model.pricing.output === 0
          ? "(Free)"
          : `($${model.pricing.input.toFixed(2)} / $${model.pricing.output.toFixed(2)} per 1M tokens)`;

    writeLine(
      `${chalk.cyan(String(index + 1).padStart(2))}. ${model.displayName}${context} ${chalk.dim(price)}`,
    );
  });

  pendingSelection = {
    type: "model-model",
    provider,
    models: modelsResult.value,
  };
}

function selectModel(
  input: string,
  provider: ProviderDescriptor,
  models: ModelDescriptor[],
): void {
  const model = getSelectedItem(input, models);
  if (!model) {
    writeInvalidSelection();
    return;
  }

  const result = app.selectModel(provider.id, model.id);
  pendingSelection = null;

  if (Result.isErr(result)) {
    writeError(result.error.message, result.error.hint);
    return;
  }

  writeLine(
    chalk.green(`Selected ${provider.displayName} / ${model.displayName}.`),
  );
}

async function selectSession(
  input: string,
  sessions: AgentSessionSummary[],
): Promise<void> {
  const summary = getSelectedItem(input, sessions);
  if (!summary) {
    writeInvalidSelection();
    return;
  }

  const result = await app.selectSession(summary.id);
  pendingSelection = null;

  if (Result.isErr(result)) {
    writeError(result.error.message, result.error.hint);
    return;
  }

  clearScreen();
  if (result.value.selectedModel.providerId === CHATGPT_PLAN) {
    const status = await app.chatGPTStatus();
    if (Result.isOk(status)) planAccount = status.value.active;
    if (!app.getSelectedModel())
      writeLine(
        chalk.yellow(
          "History is local. Activate the saved account and select an available model to continue.",
        ),
      );
  }
  writeLine(chalk.bold(`Session: ${result.value.title}`));
  printCurrentModel();
  renderHistory(result.value);
  printSessionUsage(result.value);
}

function startNewSession(): void {
  app.startNewSession();
  pendingSelection = null;
  clearScreen();
  writeLine(chalk.bold("New session"));
  printCurrentModel();
}

function startChatTurn(input: string): void {
  const abortController = new AbortController();
  const startedAt = performance.now();
  const toolCalls = new Map<string, ToolCall>();

  const done = (async () => {
    let assistantStarted = false;
    let assistantLineOpen = false;

    try {
      for await (const event of app.chat(input, abortController.signal)) {
        if (event.type === "assistant-text") {
          if (!assistantStarted) {
            write(`${chalk.green("assistant")} `);
            assistantStarted = true;
            assistantLineOpen = true;
          }
          write(event.text);
          continue;
        }

        if (assistantLineOpen) {
          write("\n");
          assistantLineOpen = false;
        }

        handleAgentEvent(event, toolCalls);
      }
    } finally {
      if (assistantLineOpen) write("\n\n");
      await printSelectedSessionUsage();
      printTurnMetadata(performance.now() - startedAt);
      if (activeTurn?.abortController === abortController) activeTurn = null;
      if (!isExiting) writePrompt();
    }
  })();

  activeTurn = { abortController, done };
}

function handleAgentEvent(
  event: Exclude<AgentEvent, { type: "assistant-text" }>,
  toolCalls: Map<string, ToolCall>,
): void {
  switch (event.type) {
    case "sse-comment":
      // writeLine(chalk.dim(event.content));
      return;
    case "tool-call":
      toolCalls.set(event.call.callId, event.call);
      return;
    case "tool-result":
      printToolResult(toolCalls.get(event.callId), event.result);
      toolCalls.delete(event.callId);
      return;
    case "error":
      writeLine(chalk.red(`Error: ${event.error}`));
      return;
    case "done":
      return;
  }
}

function renderHistory(session: AgentSession): void {
  if (session.turns.length === 0) {
    writeLine(chalk.dim("No history yet."));
    return;
  }

  writeLine("");
  for (const turn of session.turns) {
    const toolCalls = new Map<string, ToolCall>();

    for (const message of turn.messages) {
      renderHistoryMessage(message, toolCalls);
    }

    writeLine(
      chalk.dim(
        `[${turn.status}] ${turn.provider.displayName} / ${turn.model.displayName} (${formatElapsed(
          Date.parse(turn.endTime) - Date.parse(turn.startTime),
        )})`,
      ),
    );

    if (turn.error) writeLine(chalk.red(`Error: ${turn.error}`));
    writeLine("");
  }
}

function renderHistoryMessage(
  message: CanonicalMessage,
  toolCalls: Map<string, ToolCall>,
): void {
  if (message.role === "system") return;

  if (message.role === "user") {
    writeLine(`${chalk.blue("user")} ${formatMessageParts(message.content)}`);
    return;
  }

  if (message.role === "assistant") {
    const text = formatMessageParts(message.content);
    if (text) writeLine(`${chalk.green("assistant")} ${text}`);
    for (const toolCall of message.toolCalls ?? []) {
      toolCalls.set(toolCall.callId, toolCall);
    }
    return;
  }

  printStoredToolResult(toolCalls.get(message.toolCallId), message);
  toolCalls.delete(message.toolCallId);
}

function printStoredToolResult(
  call: ToolCall | undefined,
  message: Extract<CanonicalMessage, { role: "tool" }>,
): void {
  const name = call?.toolName ?? message.toolName;
  const args = call ? ` ${formatJson(call.args)}` : "";
  writeLine(chalk.magenta(`tool ${name}${args}`));
  writeLine(chalk.dim(formatMessageParts(message.content)));
}

function printToolResult(call: ToolCall | undefined, result: ToolResult): void {
  const name = call?.toolName ?? "unknown";
  const args = call ? ` ${formatJson(call.args)}` : "";
  writeLine(chalk.magenta(`tool ${name}${args}`));

  if (Result.isErr(result)) {
    writeError(result.error.message, result.error.hint);
    return;
  }

  for (const part of result.value) {
    if (part.type === "text") {
      const contentText =
        part.content.length > 280
          ? `${part.content.slice(0, 277)}...`
          : part.content;
      writeLine(chalk.dim(contentText));
    } else {
      writeLine(chalk.dim(`[image]`));
    }
  }
}

async function printSessions(): Promise<void> {
  const result = await app.listSessions();
  if (Result.isErr(result)) {
    writeError(result.error.message, result.error.hint);
    return;
  }

  if (result.value.length === 0) {
    writeLine(chalk.dim("No saved sessions."));
    return;
  }

  printSessionSummaries(result.value);
}

function printSessionSummaries(sessions: AgentSessionSummary[]): void {
  writeLine(chalk.bold("Sessions"));
  sessions.forEach((session, index) => {
    const time = session.lastTurnAt ? ` ${formatDate(session.lastTurnAt)}` : "";
    writeLine(
      `${chalk.cyan(String(index + 1).padStart(2))}. ${session.title}${chalk.dim(
        time,
      )}`,
    );
  });
}

function printHelp(): void {
  writeLine(chalk.bold("Commands"));
  writeLine(`${chalk.cyan("/model")} select a model`);
  writeLine(`${chalk.cyan("/model current")} print the current model`);
  writeLine(`${chalk.cyan("/session")} select a saved session`);
  writeLine(`${chalk.cyan("/session new")} start a new session`);
  writeLine(
    `${chalk.cyan("/session confirm")} allow the selected destination to receive the open history`,
  );
  writeLine(`${chalk.cyan("/sessions")} list saved sessions`);
  writeLine(
    `${chalk.cyan("/chatgpt")} show ChatGPT Plan accounts, status, and usage settings`,
  );
  writeLine(
    `${chalk.cyan("/chatgpt login [new]")} continue with ChatGPT or add an account`,
  );
  writeLine(
    `${chalk.cyan("/chatgpt logout")} sign out of the active ChatGPT account`,
  );
  writeLine(
    `${chalk.cyan("/chatgpt enable | retry")} enable plan consent or resume after a usage limit`,
  );
  writeLine(`${chalk.cyan("/abort")} abort the active turn`);
  writeLine(`${chalk.cyan("/cancel")} cancel a selection prompt`);
  writeLine(`${chalk.cyan("/exit")} exit the app`);
}

function printCurrentModel(): void {
  const selected = app.getSelectedModel();
  if (!selected) {
    writeLine(chalk.yellow("No model selected. Use /model to select one."));
    return;
  }

  writeLine(
    `${chalk.dim("model")} ${selected.provider.displayName} / ${selected.model.displayName}`,
  );
}

function printTurnMetadata(elapsedMs: number): void {
  const selected = app.getSelectedModel();
  const provider = selected?.provider.displayName ?? "none";
  const model = selected?.model.displayName ?? "none";
  writeLine(
    chalk.dim(
      `provider: ${provider} | model: ${model} | elapsed: ${formatElapsed(
        elapsedMs,
      )}`,
    ),
  );
}

async function printSelectedSessionUsage(): Promise<void> {
  const result = await app.getSelectedSession();
  if (Result.isErr(result)) {
    writeError(result.error.message, result.error.hint);
    return;
  }

  if (!result.value) return;
  printSessionUsage(result.value);
}

function printSessionUsage(session: AgentSession): void {
  writeLine(chalk.dim(`usage: ${formatUsage(session.usage)}`));
}

function formatUsage(usage: AgentUsage): string {
  return [
    `${usage.totalTokens} tokens`,
    `${formatCost(usage.cost)} spent`,
  ].join(" | ");
}

function formatCost(cost: number): string {
  if (!Number.isFinite(cost)) return "unknown";
  if (cost === 0) return "0";
  if (cost < 0.000001) return cost.toExponential(2);
  return cost.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function getSelectedItem<T>(input: string, items: T[]): T | undefined {
  const index = Number(input);
  if (!Number.isInteger(index) || index < 1 || index > items.length) {
    return undefined;
  }

  return items[index - 1];
}

function writeInvalidSelection(): void {
  writeLine(chalk.red("Invalid selection. Enter a listed number or /cancel."));
}

function formatProviderStatus(provider: ProviderDescriptor): string {
  if (provider.id === CHATGPT_PLAN && !provider.connectionResult)
    return chalk.yellow("opt-in; use /chatgpt");
  if (!provider.connectionResult) return chalk.yellow("not initialized");
  if (Result.isOk(provider.connectionResult)) return chalk.green("connected");
  return chalk.red(provider.connectionResult.error.message);
}

function formatMessageParts(
  parts: Extract<
    CanonicalMessage,
    { role: "user" | "assistant" | "tool" }
  >["content"],
): string {
  return parts
    .map((part) => (part.type === "text" ? part.text : `[image]`))
    .join("\n");
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatElapsed(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return "unknown";
  if (elapsedMs < 1000) return `${Math.round(elapsedMs)}ms`;
  return `${(elapsedMs / 1000).toFixed(1)}s`;
}

function writeError(message: string, hint?: string): void {
  writeLine(chalk.red(`Error: ${message}`));
  if (hint) writeLine(chalk.dim(hint));
}

function writePrompt(): void {
  if (isExiting || activeTurn || activeSignIn) return;

  if (pendingSelection?.type === "model-provider") {
    write(chalk.cyan("provider # > "));
    return;
  }

  if (pendingSelection?.type === "model-model") {
    write(chalk.cyan("model # > "));
    return;
  }

  if (pendingSelection?.type === "session") {
    write(chalk.cyan("session # > "));
    return;
  }
  
  if (pendingSelection?.type === "chatgpt-account") {
    write(chalk.cyan("account # > "));
    return;
  }

  write(chalk.blue("you > "));
}

function clearScreen(): void {
  write("\x1b[2J\x1b[3J\x1b[H");
}

function writeLine(text: string): void {
  write(`${text}\n`);
}

function write(text: string): void {
  process.stdout.write(text);
}

async function exitApp(): Promise<void> {
  isExiting = true;
  if (activeTurn) {
    activeTurn.abortController.abort("User exited");
    await activeTurn.done;
  }
  if (activeSignIn) {
    activeSignIn.abortController.abort();
    await activeSignIn.done;
  }
  writeLine(chalk.dim("Bye."));
  process.exit(0);
}

function handleSigint(): void {
  if (activeSignIn) {
    activeSignIn.abortController.abort();
    return;
  }
  if (activeTurn) {
    activeTurn.abortController.abort("Interrupted");
    writeLine(chalk.yellow("Aborting current turn..."));
    return;
  }

  writeLine("");
  exitApp();
}
