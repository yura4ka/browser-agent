import { Result } from "@/core/Result";
import {
  type AccountIndex,
  type CredentialStore,
  FileCredentialStore,
  type Registration,
} from "./credentials";
import { ChatGPTOAuth, MANAGE_USAGE, type SignInOptions } from "./oauth";

export type ChatGPTAccount = {
  key: string;
  label: string;
  status: "signed-out" | "disabled" | "connected" | "usage-limited";
  welcomed: boolean;
};

export class ChatGPTAccountService {
  constructor(
    private readonly store: CredentialStore = new FileCredentialStore(),
    private readonly oauth: Pick<
      ChatGPTOAuth,
      "signIn" | "refresh" | "revoke"
    > = new ChatGPTOAuth(),
    private readonly now = Date.now,
  ) {}

  async status() {
    return this.safe(async () => {
      const index = await this.store.index();
      const accounts = (
        await Promise.all(
          (index?.keys ?? []).map((key) => this.store.account(key)),
        )
      )
        .filter((account): account is Registration => !!account)
        .map(display);
      return Result.Ok({
        accounts,
        active: accounts.find((account) => account.key === index?.active),
      });
    });
  }

  async signIn(key?: string, options: SignInOptions = {}) {
    return this.safe(async () => {
      const index = await this.store.withLock("index", async () => {
        const old = await this.store.index();
        if (old) return old;

        const created: AccountIndex = {
          hostId: `urn:uuid:${crypto.randomUUID()}`,
          keys: [],
        };

        await this.store.saveIndex(created);
        return created;
      });

      const previous = key ? await this.store.account(key) : undefined;
      if (key && !previous)
        return Result.fromCanonical("ChatGPT registration not found");

      const grant = await this.oauth.signIn(index.hostId, previous, options);
      if (Result.isErr(grant)) return grant;

      const { clientId, identity, tokens, enabled } = grant.value;

      return this.store.withLock("index", async () => {
        if (options.signal?.aborted)
          return Result.fromCanonical("ChatGPT sign-in cancelled");

        const currentIndex = (await this.store.index()) ?? index;
        const all = await Promise.all(
          currentIndex.keys.map((id) => this.store.account(id)),
        );

        const current = all.find(
          (item) =>
            item?.clientId === clientId && item?.subject === identity.subject,
        );

        if (
          (key && current?.key !== key) ||
          all.some(
            (item) =>
              item?.clientId === clientId && item.subject !== identity.subject,
          )
        )
          return Result.fromCanonical(
            "ChatGPT sign-in did not match the saved registration",
          );

        const id = current?.key ?? crypto.randomUUID();

        return this.store.withLock(id, async () => {
          const latest = await this.store.account(id);
          if (options.signal?.aborted)
            return Result.fromCanonical("ChatGPT sign-in cancelled");

          if (
            latest &&
            key &&
            (latest.tokens?.refreshToken !== previous?.tokens?.refreshToken ||
              latest.state !== previous?.state)
          )
            return Result.fromCanonical(
              "ChatGPT credentials changed; start sign-in again",
            );

          if (latest && !key)
            return Result.fromCanonical(
              "ChatGPT registration already exists; choose it from /chatgpt",
            );

          const base = identity.email ?? "ChatGPT account";

          const account: Registration = {
            key: id,
            clientId,
            subject: identity.subject,
            label: latest?.label ?? `${base} (${currentIndex.keys.length + 1})`,
            state: enabled ? "connected" : "disabled",
            tokens,
            welcomed: latest?.welcomed,
          };

          await this.store.saveAccount(account);
          await this.store.saveIndex({
            ...currentIndex,
            active: enabled ? id : (currentIndex.active ?? id),
            keys: currentIndex.keys.includes(id)
              ? currentIndex.keys
              : [...currentIndex.keys, id],
          });

          return Result.Ok(display(account));
        });
      });
    });
  }

  async getAccessToken(
    key: string,
    signal?: AbortSignal,
  ): Promise<Result<string>> {
    return this.safe(() =>
      this.store.withLock(key, async () => {
        if (signal?.aborted) return Result.fromCanonical("Aborted");

        if ((await this.store.index())?.active !== key)
          return Result.fromCanonical(
            "The active ChatGPT registration changed",
          );

        const account = await this.store.account(key);

        if (!account || account.state !== "connected" || !account.tokens)
          return Result.fromCanonical(
            account?.state === "disabled"
              ? "ChatGPT plan usage is not enabled"
              : "ChatGPT account is signed out",
            "Use /chatgpt login",
          );

        if (account.usageLimited)
          return Result.fromCanonical(
            "ChatGPT plan usage is paused",
            `Manage usage: ${MANAGE_USAGE}; use /chatgpt retry to resume`,
          );

        const tokens = account.tokens;
        const now = this.now();
        if (
          tokens.expiresAt > now &&
          (tokens.expiresAt > now + 60_000 ||
            (tokens.earliestRefreshAt ?? 0) > now)
        )
          return Result.Ok(tokens.accessToken);

        const refreshed = await this.oauth.refresh(account, tokens);
        if (Result.isErr(refreshed)) {
          if (!refreshed.error.unusableRefresh) return refreshed;
          await this.store.saveAccount({
            ...account,
            state: "signed-out",
            tokens: undefined,
          });
          return Result.fromCanonical(
            "ChatGPT authorization expired",
            "Use /chatgpt login",
          );
        }

        await this.store.saveAccount({
          ...account,
          tokens: refreshed.value,
          state: refreshed.value ? "connected" : "disabled",
        });

        return refreshed.value
          ? Result.Ok(refreshed.value.accessToken)
          : Result.fromCanonical(
              "ChatGPT plan usage is not enabled",
              "Use /chatgpt login",
            );
      }),
    );
  }

  async reportFailure(
    key: string,
    accessToken: string,
    reason: "revoked" | "usage-limited",
  ) {
    return this.update(key, (account) => {
      if (
        account.state !== "connected" ||
        (reason === "revoked" && account.tokens?.accessToken !== accessToken)
      )
        return account;
      return reason === "revoked"
        ? { ...account, tokens: undefined, state: "signed-out" }
        : { ...account, usageLimited: true };
    });
  }

  retry(key: string) {
    return this.update(key, (account) => ({ ...account, usageLimited: false }));
  }
  acknowledge(key: string) {
    return this.update(key, (account) => ({ ...account, welcomed: true }));
  }

  async signOut(key: string) {
    return this.safe(() =>
      this.store.withLock(key, async () => {
        const account = await this.store.account(key);
        if (!account)
          return Result.fromCanonical("ChatGPT registration not found");

        await this.store.saveAccount({ ...account, state: "signing-out" });

        const confirmed =
          !account.tokens ||
          (await this.oauth
            .revoke(account.clientId, account.tokens.refreshToken)
            .catch(() => false));

        await this.store.saveAccount({
          ...account,
          tokens: undefined,
          state: "signed-out",
          usageLimited: false,
        });

        return Result.Ok({ confirmed });
      }),
    );
  }

  private async update(
    key: string,
    change: (account: Registration) => Registration,
  ) {
    return this.safe(() =>
      this.store.withLock(key, async () => {
        const account = await this.store.account(key);
        if (!account)
          return Result.fromCanonical("ChatGPT registration not found");

        const next = change(account);
        if (next !== account) await this.store.saveAccount(next);
        
        return Result.Ok(undefined);
      }),
    );
  }

  private async safe<T>(
    operation: () => Promise<Result<T>>,
  ): Promise<Result<T>> {
    try {
      return await operation();
    } catch {
      return Result.fromCanonical(
        "Could not access protected ChatGPT credentials",
        "Check the per-user storage permissions or Windows user protection",
      );
    }
  }
}

function display(account: Registration): ChatGPTAccount {
  return {
    key: account.key,
    label: account.label,
    welcomed: account.welcomed ?? false,
    status:
      account.state === "signing-out"
        ? "signed-out"
        : account.state === "connected" && account.usageLimited
          ? "usage-limited"
          : account.state,
  };
}
