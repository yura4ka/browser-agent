import { expect, test } from "bun:test";
import { chmod, lstat, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Result } from "@/core/Result";
import { ChatGPTAccountService } from "./ChatGPTAccountService";
import { FileCredentialStore, type Registration } from "./credentials";
import { OAuthError, PLAN_SCOPE } from "./oauth";

test("protected store serializes competing rotations, survives reload and clears tokens on unconfirmed revocation", async () => {
  const folder = await mkdtemp(join(tmpdir(), "browser agent é "));
  try {
    const path = join(folder, "browser-agent", "chatgpt");
    const first = new FileCredentialStore(() => path);
    const second = new FileCredentialStore(() => path);
    const original: Registration = {
      key: crypto.randomUUID(),
      clientId: "oaiapp_fixture",
      subject: "fixture-sub",
      label: "Fixture",
      state: "connected",
      tokens: {
        accessToken: "old-access",
        refreshToken: "old-refresh",
        idToken: "fixture-id",
        expiresAt: 1,
        scopes: [PLAN_SCOPE],
      },
    };
    await first.saveIndex({
      hostId: `urn:uuid:${crypto.randomUUID()}`,
      active: original.key,
      keys: [original.key],
    });
    await first.saveAccount(original);
    let refreshes = 0;
    const gate = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const oauth = {
      signIn: async () => Result.Err(new OAuthError("Unexpected sign in")),
      revoke: async () => false,
      refresh: async (
        _saved: Registration,
        tokens: NonNullable<Registration["tokens"]>,
      ) => {
        refreshes++;
        started.resolve();
        await gate.promise;
        return Result.Ok({
          ...tokens,
          expiresAt: 100_000,
          accessToken: "new-access",
          refreshToken: "new-refresh",
        });
      },
    };
    const a = new ChatGPTAccountService(first, oauth, () => 100);
    const b = new ChatGPTAccountService(second, oauth, () => 100);
    const waiting = a.getAccessToken(original.key);
    await started.promise;
    const concurrent = b.getAccessToken(original.key);
    // The second store must contend while the first account transaction is open.
    await Bun.sleep(80);
    gate.resolve();
    expect(await Promise.all([waiting, concurrent])).toEqual([
      Result.Ok("new-access"),
      Result.Ok("new-access"),
    ]);
    expect(refreshes).toBe(1);
    expect((await second.account(original.key))?.tokens?.refreshToken).toBe(
      "new-refresh",
    );
    const record = join(path, `${original.key}.json`);
    if (process.platform === "win32") {
      expect(await Bun.file(record).text()).not.toContain("new-refresh");
    } else {
      expect((await lstat(record)).mode & 0o777).toBe(0o600);
    }
    // A late response from the previous token must not erase the replacement.
    await a.reportFailure(original.key, "old-access", "revoked");
    expect((await a.getAccessToken(original.key)).ok).toBe(true);
    await a.reportFailure(original.key, "new-access", "usage-limited");
    expect((await a.getAccessToken(original.key)).ok).toBe(false);
    await b.retry(original.key);
    expect((await a.getAccessToken(original.key)).ok).toBe(true);
    expect(await b.signOut(original.key)).toEqual(
      Result.Ok({ confirmed: false }),
    );
    expect((await first.account(original.key))?.tokens).toBeUndefined();
    expect((await a.getAccessToken(original.key)).ok).toBe(false);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}, 20_000);

test.skipIf(process.platform === "win32")(
  "store refuses a credential directory with permissive POSIX modes",
  async () => {
    const folder = await mkdtemp(join(tmpdir(), "browser-agent-"));
    try {
      const path = join(folder, "browser-agent", "chatgpt");
      const store = new FileCredentialStore(() => path);
      await store.index();
      await chmod(path, 0o755);
      await expect(store.index()).rejects.toThrow("not private");
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
);
