import { expect, test } from "bun:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import type { Registration } from "./credentials";
import {
  type CallbackHandler,
  ChatGPTOAuth,
  ISSUER,
  PLAN_SCOPE,
  verifyId,
} from "./oauth";

const clientId = "oaiapp_fixture";
const hostId = "urn:uuid:test";
const body = {
  access_token: "fake-access",
  refresh_token: "fake-refresh",
  id_token: "fake-id",
  expires_in: 3600,
  scope: PLAN_SCOPE,
  token_type: "Bearer",
};

function fixture(
  options: {
    query?: Record<string, string>;
    token?: object;
    wrongState?: boolean;
  } = {},
) {
  let handler: CallbackHandler;
  const requests: URL[] = [];
  const closes: number[] = [];
  const statuses: number[] = [];
  const exchanges: URLSearchParams[] = [];
  const oauth = new ChatGPTOAuth({
    listen: (fn) => {
      handler = fn;
      return {
        port: 12345,
        close: () => {
          closes.push(1);
        },
      };
    },
    open: async (url) => {
      requests.push(url);
      const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
      redirect.searchParams.set("error", "access_denied");
      statuses.push(handler(new Request(redirect.href)).status);
      redirect.search = new URLSearchParams({
        state: options.wrongState
          ? "wrong"
          : (url.searchParams.get("state") ?? ""),
        ...(options.query ?? { code: "fake-code", client_id: clientId }),
      }).toString();
      statuses.push(
        handler(new Request(redirect.href)).status,
        handler(new Request(redirect.href)).status,
      );
      return true;
    },
    fetch: Object.assign(
      async (_url: string | URL | Request, init?: RequestInit) => {
        exchanges.push(new URLSearchParams(String(init?.body)));
        return Response.json(options.token ?? body);
      },
      { preconnect: () => {} },
    ),
    verify: async (_token, client, nonce) => {
      expect(client).toBe(clientId);
      expect(nonce).toBe(requests.at(-1)?.searchParams.get("nonce") ?? "");
      return { subject: "fixture-subject" };
    },
    timeoutMs: 100,
  });
  return { oauth, exchanges, requests, statuses, closes };
}

test("initial OAuth validates callback before using code and consumes it once", async () => {
  const f = fixture();
  const result = await f.oauth.signIn(hostId);
  expect(result.ok).toBe(true);
  expect(f.statuses).toEqual([400, 200, 400]);
  expect(f.closes).toHaveLength(1);
  expect(f.requests[0].searchParams.get("client_id")).toBe(
    "dynamic_agent_client",
  );
  expect(f.exchanges[0].get("client_id")).toBe(clientId);
  expect(f.exchanges[0].get("redirect_uri")).toBe(
    f.requests[0].searchParams.get("redirect_uri"),
  );
  const verifier = f.exchanges[0].get("code_verifier");
  expect(f.requests[0].searchParams.get("code_challenge")).toBe(
    Buffer.from(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier ?? ""),
      ),
    ).toString("base64url"),
  );
});

test("returning OAuth reuses client ID and handles a grant without plan scope", async () => {
  const f = fixture({
    query: { code: "fake" },
    token: { ...body, scope: "openid email" },
  });
  const saved: Registration = {
    key: crypto.randomUUID(),
    clientId,
    subject: "fixture-subject",
    state: "signed-out",
    label: "Account",
  };
  const result = await f.oauth.signIn(hostId, saved, { reconsent: true });
  expect(result).toMatchObject({ ok: true, value: { enabled: false } });
  expect(f.requests[0].searchParams.get("client_id")).toBe(clientId);
  expect(f.requests[0].searchParams.get("prompt")).toBe("consent");
  expect(f.requests[0].searchParams.has("agent_name_hint")).toBe(false);
});

test("a rejected first code retries with the issued client and a fresh authorization", async () => {
  let handler: CallbackHandler;
  const urls: URL[] = [];
  const forms: URLSearchParams[] = [];
  const oauth = new ChatGPTOAuth({
    listen: (next) => {
      handler = next;
      return { port: 10000 + urls.length, close: () => {} };
    },
    open: async (url) => {
      urls.push(url);
      const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
      redirect.searchParams.set("state", url.searchParams.get("state") ?? "");
      redirect.searchParams.set("code", `fixture-code-${urls.length}`);
      if (urls.length === 1) redirect.searchParams.set("client_id", clientId);
      expect(handler(new Request(redirect.href)).status).toBe(200);
      return true;
    },
    fetch: Object.assign(
      async (_url: string | URL | Request, init?: RequestInit) => {
        forms.push(new URLSearchParams(String(init?.body)));
        return forms.length === 1
          ? Response.json({ error: "invalid_grant" }, { status: 400 })
          : Response.json(body);
      },
      { preconnect: () => {} },
    ),
    verify: async () => ({ subject: "fixture-subject" }),
  });
  expect((await oauth.signIn(hostId)).ok).toBe(true);
  expect(urls.map((url) => url.searchParams.get("client_id"))).toEqual([
    "dynamic_agent_client",
    clientId,
  ]);
  expect(urls[1].searchParams.has("agent_name_hint")).toBe(false);
  expect(forms.map((form) => form.get("code"))).toEqual([
    "fixture-code-1",
    "fixture-code-2",
  ]);
  expect(forms[0].get("code_verifier")).not.toEqual(
    forms[1].get("code_verifier"),
  );
});

test("wrong state, decline, missing client and changed returning client never exchange a code", async () => {
  const saved: Registration = {
    key: crypto.randomUUID(),
    clientId,
    subject: "fixture-subject",
    state: "signed-out",
    label: "Account",
  };
  for (const [f, registration] of [
    [fixture({ wrongState: true }), undefined],
    [fixture({ query: { error: "access_denied" } }), undefined],
    [fixture({ query: { code: "code" } }), undefined],
    [fixture({ query: { code: "code", client_id: "oaiapp_other" } }), saved],
  ] as const) {
    expect((await f.oauth.signIn(hostId, registration)).ok).toBe(false);
    expect(f.exchanges).toHaveLength(0);
    expect(f.closes).toHaveLength(1);
  }
});

test("launch failure restarts with a fresh callback and cancellation cleans both listeners", async () => {
  const controller = new AbortController();
  const urls: URL[] = [];
  let closeCount = 0;
  const oauth = new ChatGPTOAuth({
    listen: () => ({
      port: 10000 + closeCount,
      close: () => {
        closeCount++;
      },
    }),
    open: async (url) => {
      urls.push(url);
      return false;
    },
  });
  const result = await oauth.signIn(hostId, undefined, {
    signal: controller.signal,
    manualOpen: (url) => {
      urls.push(new URL(url));
      controller.abort();
    },
  });
  expect(result).toMatchObject({
    ok: false,
    error: { message: "ChatGPT sign-in cancelled" },
  });
  expect(closeCount).toBe(2);
  expect(urls[0].searchParams.get("state")).not.toBe(
    urls[1].searchParams.get("state"),
  );
  expect(urls[1].searchParams.has("id_token_hint")).toBe(false);
});

test("ID token verification checks signature, issuer, audience, expiry and nonce", async () => {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = await exportJWK(publicKey);
  const keys = createLocalJWKSet({ keys: [jwk] });
  const make = (
    iss = ISSUER,
    aud = clientId,
    nonce: string | null = "good",
    exp = "1m",
    key = privateKey,
  ) =>
    new SignJWT(nonce === null ? {} : { nonce })
      .setProtectedHeader({ alg: "ES256" })
      .setIssuer(iss)
      .setAudience(aud)
      .setSubject("fixture-subject")
      .setExpirationTime(exp)
      .sign(key);
  expect(await verifyId(await make(), clientId, "good", keys)).toMatchObject({
    subject: "fixture-subject",
  });
  for (const token of [
    await make("https://not-the-issuer.test"),
    await make(ISSUER, "oaiapp_other"),
    await make(ISSUER, clientId, null),
    await make(ISSUER, clientId, "wrong"),
    await make(ISSUER, clientId, "good", "-1m"),
    await make(
      ISSUER,
      clientId,
      "good",
      "1m",
      (await generateKeyPair("ES256")).privateKey,
    ),
  ])
    await expect(verifyId(token, clientId, "good", keys)).rejects.toThrow();
});
