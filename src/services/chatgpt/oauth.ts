import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import { z } from "zod";
import { CanonicalError, Result } from "@/core/Result";
import { powerShell, type Registration, type Tokens } from "./credentials";

export const ISSUER = "https://auth.openai.com";
export const RESOURCE = "https://api.openai.com/v1";
export const PLAN_SCOPE = "chatgpt.tokens.use.direct";
export const MANAGE_USAGE = "https://chatgpt.com/settings/usage";
const SCOPE = `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`;
const CALLBACK = "/auth/callback";

const clientSchema = z.string().regex(/^oaiapp_[\w-]+$/);

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  id_token: z.string().min(1).optional(),
  token_type: z.string().regex(/^bearer$/i),
  expires_in: z.number().positive(),
  earliest_refresh_at: z.number().nonnegative().optional(),
  scope: z.string().optional(),
});

const codeSchema = z.string().regex(/^[a-zA-Z0-9_.-]{1,120}$/);

const terminalRefresh = new Set([
  "invalid_grant",
  "invalid_refresh_token",
  "token_expired",
  "refresh_token_expired",
  "refresh_token_invalidated",
  "refresh_token_reused",
]);

export class OAuthError extends CanonicalError {
  constructor(
    message: string,
    readonly reason?: string,
    status?: number,
  ) {
    super(message, undefined, status);
  }
  get unusableRefresh() {
    return !!this.reason && terminalRefresh.has(this.reason);
  }
}

class RejectedCode extends OAuthError {
  constructor(readonly clientId: string) {
    super("ChatGPT sign-in code expired or was rejected; start sign-in again");
  }
}

const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

type Identity = { subject: string; email?: string };

export async function verifyId(
  token: string,
  clientId: string,
  nonce: string,
  keys: JWTVerifyGetKey = jwks,
): Promise<Identity> {
  const { payload } = await jwtVerify(token, keys, {
    issuer: ISSUER,
    audience: clientId,
    requiredClaims: ["sub", "exp", "nonce"],
  });

  const claims = z
    .object({
      nonce: z.string(),
      azp: z.string().optional(),
      sub: z.string().refine((subject) => !!subject.trim()),
      email: z.unknown().optional(),
      email_verified: z.unknown().optional(),
    })
    .parse(payload);

  if (
    claims.nonce !== nonce ||
    (Array.isArray(payload.aud) &&
      payload.aud.length > 1 &&
      claims.azp !== clientId) ||
    (claims.azp !== undefined && claims.azp !== clientId)
  )
    throw new Error("Invalid identity");

  const email = z.email().safeParse(claims.email);
  return {
    subject: claims.sub,
    email:
      email.success && claims.email_verified === true ? email.data : undefined,
  };
}

export type CallbackHandler = (request: Request) => Response;

type Listener = { port: number; close(): void | Promise<void> };

function listen(handler: CallbackHandler): Listener {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler });
  return { port: server.port ?? 0, close: () => server.stop() };
}

async function openBrowser(url: URL, signal: AbortSignal): Promise<boolean> {
  try {
    if (process.platform === "win32") {
      await powerShell(
        "$ErrorActionPreference='Stop'; Start-Process $env:BROWSER_AGENT_AUTH_URL",
        undefined,
        { ...Bun.env, BROWSER_AGENT_AUTH_URL: url.href },
        AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      );
      return true;
    }

    const commands =
      process.platform === "darwin"
        ? [["/usr/bin/open"]]
        : [["xdg-open"], ["gio", "open"]];

    for (const [command, ...args] of commands) {
      signal.throwIfAborted();
      const executable = Bun.which(command);
      if (!executable) continue;
      if (
        (await Bun.spawn([executable, ...args, url.href], {
          stdin: "ignore",
          stdout: "ignore",
          stderr: "ignore",
          signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
        }).exited) === 0
      )
        return true;
    }
  } catch {
    // System browser unavailable; caller can offer a fresh, hint-free URL.
  }
  return false;
}
type OAuthDeps = {
  fetch?: typeof fetch;
  open?: typeof openBrowser;
  listen?: typeof listen;
  verify?: typeof verifyId;
  now?: () => number;
  timeoutMs?: number;
  retryDelay?: (ms: number) => Promise<unknown>;
};

type Grant = {
  clientId: string;
  identity: Identity;
  tokens?: Tokens;
  enabled: boolean;
};

export type SignInOptions = {
  signal?: AbortSignal;
  reconsent?: boolean;
  manualOpen?: (url: string) => void;
};

export class ChatGPTOAuth {
  constructor(private readonly deps: OAuthDeps = {}) {}

  private async token(form: URLSearchParams, signal?: AbortSignal) {
    const timeout = AbortSignal.timeout(12_000);
    const response = await (this.deps.fetch ?? fetch)(
      `${ISSUER}/api/accounts/oauth/token`,
      {
        method: "POST",
        body: form,
        redirect: "error",
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      },
    );

    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const error = z.object({ error: codeSchema }).safeParse(body);
      const reason =
        error.success && response.status < 500 ? error.data.error : undefined;
      throw new OAuthError(
        reason === "invalid_client"
          ? "ChatGPT rejected the registered OAuth client"
          : "ChatGPT token request failed",
        reason,
        response.status,
      );
    }

    return tokenSchema.parse(body);
  }

  private toTokens(
    body: z.infer<typeof tokenSchema>,
    previous?: Tokens,
  ): Tokens | undefined {
    const scopes =
      body.scope === undefined
        ? (previous?.scopes ?? [])
        : body.scope.split(/\s+/).filter(Boolean);

    if (!scopes.includes(PLAN_SCOPE)) return undefined;

    const idToken = previous?.idToken ?? body.id_token;

    if (!body.refresh_token || !idToken)
      throw new Error("Incomplete renewable grant");

    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      idToken,
      scopes,
      expiresAt: (this.deps.now ?? Date.now)() + body.expires_in * 1000,
      earliestRefreshAt:
        body.earliest_refresh_at === undefined
          ? undefined
          : body.earliest_refresh_at * 1000,
    };
  }

  async signIn(
    hostId: string,
    saved?: Registration,
    options: SignInOptions = {},
  ): Promise<Result<Grant, OAuthError>> {
    const signal = AbortSignal.any([
      AbortSignal.timeout(this.deps.timeoutMs ?? 5 * 60_000),
      ...(options.signal ? [options.signal] : []),
    ]);

    try {
      const authorize = async (clientId = saved?.clientId) => {
        const result = await this.attempt(
          hostId,
          saved,
          options,
          signal,
          false,
          clientId,
        );
        if (result) return result;
        if (!options.manualOpen)
          throw new OAuthError("Could not open the system browser");
        return this.attempt(hostId, saved, options, signal, true, clientId);
      };

      let result: Grant | undefined;

      try {
        result = await authorize();
      } catch (error) {
        // The first registration may already exist even though its code was rejected.
        // Make at most one fresh attempt with that issued client, never the old code.
        if (!(error instanceof RejectedCode)) throw error;
        result = await authorize(error.clientId);
      }

      if (!result)
        return Result.Err(new OAuthError("Could not start ChatGPT sign-in"));

      return Result.Ok(result);
    } catch (error) {
      if (options.signal?.aborted)
        return Result.Err(new OAuthError("ChatGPT sign-in cancelled"));
      if (signal.aborted)
        return Result.Err(new OAuthError("ChatGPT sign-in timed out"));
      return Result.Err(
        error instanceof OAuthError
          ? error
          : new OAuthError(
              "Could not complete ChatGPT sign-in or verify its identity",
            ),
      );
    }
  }

  private async attempt(
    hostId: string,
    saved: Registration | undefined,
    options: SignInOptions,
    signal: AbortSignal,
    manual: boolean,
    returningClientId?: string,
  ): Promise<Grant | undefined> {
    signal.throwIfAborted();
    const state = random();
    const nonce = random();
    const verifier = random();
    const challenge = Buffer.from(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ).toString("base64url");
    const callback = Promise.withResolvers<URLSearchParams>();
    let consumed = false;

    const listener = (this.deps.listen ?? listen)((request) => {
      const url = new URL(request.url);
      if (request.method !== "GET" || url.pathname !== CALLBACK)
        return new Response("Not found", { status: 404 });

      if (
        consumed ||
        signal.aborted ||
        url.searchParams.getAll("state").length !== 1 ||
        url.searchParams.get("state") !== state
      )
        return new Response("Invalid or expired sign-in", { status: 400 });

      consumed = true;
      callback.resolve(url.searchParams);

      return new Response("Callback received. Check the terminal.", {
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    });

    const redirect = `http://127.0.0.1:${listener.port}${CALLBACK}`;
    const url = new URL(`${ISSUER}/api/accounts/authorize`);

    url.search = new URLSearchParams({
      client_id: returningClientId ?? "dynamic_agent_client",
      ext_agent_host_id: hostId,
      response_type: "code",
      redirect_uri: redirect,
      scope: SCOPE,
      resource: RESOURCE,
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      ...(!returningClientId ? { agent_name_hint: "browser-agent" } : {}),
      ...(options.reconsent ? { prompt: "consent" } : {}),
      ...(!manual && saved?.tokens
        ? { id_token_hint: saved.tokens.idToken }
        : {}),
    }).toString();

    let params: URLSearchParams;
    try {
      if (manual) {
        options.manualOpen?.(url.href);
        params = await abortable(callback.promise, signal);
      } else {
        const launch = (this.deps.open ?? openBrowser)(url, signal).catch(
          () => false,
        );
        const first = await abortable(
          Promise.race([launch, callback.promise]),
          signal,
        );
        if (first === false) return undefined;
        params =
          first === true ? await abortable(callback.promise, signal) : first;
      }
    } finally {
      await listener.close();
    }

    signal.throwIfAborted();

    if (params.has("error")) {
      const denied = params.get("error") === "access_denied";
      throw new OAuthError(
        denied
          ? "ChatGPT permission was declined"
          : "ChatGPT authorization failed",
        denied ? "access_denied" : undefined,
      );
    }

    const code = params.get("code");
    const returned = params.get("client_id");
    const issued = clientSchema.safeParse(returningClientId ?? returned);

    if (
      !code ||
      params.getAll("code").length !== 1 ||
      params.getAll("client_id").length > 1 ||
      !issued.success ||
      (returned !== null && returned !== issued.data)
    )
      throw new OAuthError(
        "ChatGPT callback did not match the requested registration",
      );

    const clientId = issued.data;
    let body: z.infer<typeof tokenSchema>;

    try {
      body = await this.token(
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          code,
          code_verifier: verifier,
          redirect_uri: redirect,
          resource: RESOURCE,
        }),
        signal,
      );
    } catch (error) {
      if (error instanceof OAuthError && error.reason === "invalid_grant")
        throw new RejectedCode(clientId);
      throw error;
    }

    if (!body.id_token) throw new Error("Incomplete identity");
    const identity = await abortable(
      (this.deps.verify ?? verifyId)(body.id_token, clientId, nonce),
      signal,
    );

    if (saved && saved.subject !== identity.subject)
      throw new OAuthError(
        "ChatGPT returned a different account; the saved registration was not changed",
      );

    const tokens = this.toTokens(body);
    return { clientId, identity, tokens, enabled: !!tokens };
  }

  async refresh(
    saved: Registration,
    tokens: Tokens,
    signal?: AbortSignal,
  ): Promise<Result<Tokens | undefined, OAuthError>> {
    try {
      const body = await this.token(
        new URLSearchParams({
          grant_type: "refresh_token",
          client_id: saved.clientId,
          refresh_token: tokens.refreshToken,
          resource: RESOURCE,
        }),
        signal,
      );

      return Result.Ok(this.toTokens(body, tokens));
    } catch (error) {
      return Result.Err(
        error instanceof OAuthError
          ? error
          : new OAuthError("Could not renew ChatGPT access"),
      );
    }
  }

  async revoke(clientId: string, refreshToken: string): Promise<boolean> {
    const fetcher = this.deps.fetch ?? fetch;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const metadata = await fetcher(
          `${ISSUER}/.well-known/openid-configuration`,
          {
            redirect: "error",
            signal: AbortSignal.timeout(3000),
          },
        );

        if (!metadata.ok && metadata.status < 500) return false;
        if (!metadata.ok) throw new Error("Discovery unavailable");

        const data = z
          .object({ revocation_endpoint: z.url() })
          .parse(await metadata.json());

        const endpoint = new URL(data.revocation_endpoint);
        if (
          endpoint.origin !== ISSUER ||
          endpoint.username ||
          endpoint.password
        )
          return false;

        const response = await fetcher(endpoint, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(3000),
          body: new URLSearchParams({
            token: refreshToken,
            token_type_hint: "refresh_token",
            client_id: clientId,
          }),
        });
        
        if (response.status === 200) return true;
        if (response.status < 500) return false;
      } catch {
        // Retry temporary discovery or revocation failures before local removal.
      }
      if (attempt < 2)
        await (this.deps.retryDelay ?? Bun.sleep)(200 * 2 ** attempt);
    }
    return false;
  }
}

function random() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "base64url",
  );
}

async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  const abort = Promise.withResolvers<never>();
  const onAbort = () => abort.reject(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) onAbort();
  try {
    return await Promise.race([work, abort.promise]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
