import { Database } from "bun:sqlite";
import {
  lstat,
  mkdir,
  open,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { z } from "zod";

export const registrationKey = z.uuid();

export const tokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  idToken: z.string().min(1),
  expiresAt: z.number(),
  earliestRefreshAt: z.number().optional(),
  scopes: z.array(z.string()),
});

export type Tokens = z.infer<typeof tokensSchema>;

export const registrationSchema = z.object({
  key: registrationKey,
  clientId: z.string().regex(/^oaiapp_[\w-]+$/),
  subject: z.string().min(1),
  label: z.string().min(1),
  state: z.enum(["signed-out", "disabled", "connected", "signing-out"]),
  tokens: tokensSchema.optional(),
  usageLimited: z.boolean().optional(),
  welcomed: z.boolean().optional(),
});

export type Registration = z.infer<typeof registrationSchema>;

const indexSchema = z.object({
  hostId: z.string().regex(/^urn:uuid:/),
  active: registrationKey.optional(),
  keys: z.array(registrationKey),
});

export type AccountIndex = z.infer<typeof indexSchema>;

export interface CredentialStore {
  withLock<T>(key: string, run: () => Promise<T>): Promise<T>;
  index(): Promise<AccountIndex | undefined>;
  saveIndex(value: AccountIndex): Promise<void>;
  account(key: string): Promise<Registration | undefined>;
  saveAccount(value: Registration): Promise<void>;
}

export function credentialDirectory(): string {
  const home = homedir();
  const { LOCALAPPDATA, XDG_CONFIG_HOME } = Bun.env;

  if (process.platform === "win32") {
    const base = LOCALAPPDATA;
    if (!base || !isAbsolute(base)) throw new Error("Missing LOCALAPPDATA");
    return join(base, "browser-agent", "chatgpt");
  }

  if (process.platform === "darwin")
    return join(
      home,
      "Library",
      "Application Support",
      "browser-agent",
      "chatgpt",
    );
  const base = XDG_CONFIG_HOME;
  return join(
    base && isAbsolute(base) ? base : join(home, ".config"),
    "browser-agent",
    "chatgpt",
  );
}

const windows = process.platform === "win32";

export async function powerShell(
  script: string,
  stdin?: string,
  env?: Record<string, string>,
  signal?: AbortSignal,
) {
  const { SystemRoot = "C:\\Windows" } = Bun.env;
  const proc = Bun.spawn(
    [
      join(
        SystemRoot,
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      ),
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      script,
    ],
    {
      stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
      stdout: "pipe",
      stderr: "ignore",
      env,
      signal: signal ?? AbortSignal.timeout(8000),
    },
  );
  const [output, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (code !== 0)
    throw new Error("Windows user protection or browser launch failed");
  return output.trim();
}

async function dpapi(text: string, protect: boolean): Promise<string> {
  const method = protect ? "Protect" : "Unprotect";
  return powerShell(
    `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::${method}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))`,
    text,
  );
}

export class FileCredentialStore implements CredentialStore {
  constructor(private readonly directory = credentialDirectory) {}

  private async root() {
    const path = this.directory();
    if (!windows) {
      const parent = dirname(path);
      const config = dirname(parent);
      // The per-user config directory can be a symlink, but the app-owned
      // directory cannot be replaceable by another user.
      await mkdir(config, { recursive: true, mode: 0o700 });
      const baseInfo = await stat(config);
      if (
        !baseInfo.isDirectory() ||
        baseInfo.uid !== userInfo().uid ||
        (baseInfo.mode & 0o022) !== 0
      )
        throw new Error("ChatGPT credential parent is not user-controlled");
      await mkdir(parent, { recursive: true, mode: 0o700 });
      await this.verify(parent, true, 0o022);
    }
    await mkdir(path, { recursive: true, mode: 0o700 });
    await this.verify(path, true);
    return path;
  }

  private async verify(path: string, dir = false, disallowedMode = 0o077) {
    const stat = await lstat(path);
    if (
      !(dir ? stat.isDirectory() : stat.isFile()) ||
      (!dir && stat.nlink !== 1) ||
      (!windows &&
        (stat.uid !== userInfo().uid || (stat.mode & disallowedMode) !== 0))
    )
      throw new Error("ChatGPT credential storage is not private");
  }

  async withLock<T>(key: string, run: () => Promise<T>): Promise<T> {
    const name = key === "index" ? key : registrationKey.parse(key);
    const path = join(await this.root(), `${name}.lock.sqlite`);
    try {
      await writeFile(path, "", { mode: 0o600, flag: "wx" });
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
    }
    await this.verify(path);
    // SQLite releases the OS lock if a CLI crashes. No credentials enter this DB.
    const db = new Database(path, { readwrite: true });
    try {
      db.run("PRAGMA busy_timeout = 0");
      const deadline = performance.now() + 35_000;
      for (;;) {
        try {
          db.run("BEGIN IMMEDIATE");
          break;
        } catch (error) {
          if (
            !hasCode(error, "SQLITE_BUSY", "SQLITE_LOCKED") ||
            performance.now() >= deadline
          )
            throw error;
          await Bun.sleep(40);
        }
      }
      return await run();
    } finally {
      db.close();
    }
  }

  private async read<T>(
    name: string,
    schema: z.ZodType<T>,
  ): Promise<T | undefined> {
    const path = join(await this.root(), name);
    try {
      await this.verify(path);
    } catch (error) {
      if (hasCode(error, "ENOENT")) return undefined;
      throw error;
    }
    let text = await Bun.file(path).text();
    if (windows)
      text = Buffer.from(await dpapi(text, false), "base64").toString();
    return z
      .object({ version: z.literal(1), value: schema })
      .parse(JSON.parse(text)).value;
  }

  private async save(name: string, value: unknown) {
    const path = join(await this.root(), name);
    const temp = `${path}.${crypto.randomUUID()}.tmp`;
    const json = JSON.stringify({ version: 1, value });
    const data = windows
      ? await dpapi(Buffer.from(json).toString("base64"), true)
      : json;
    if (!data) throw new Error("Could not protect ChatGPT credentials");
    try {
      await this.verify(path);
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
    }
    const handle = await open(temp, "wx", 0o600);
    try {
      try {
        await handle.writeFile(data);
        await handle.sync();
      } finally {
        await handle.close();
      }
      for (let attempt = 0; ; attempt++) {
        try {
          await rename(temp, path);
          break;
        } catch (error) {
          if (
            !windows ||
            attempt >= 5 ||
            !hasCode(error, "EACCES", "EPERM", "EBUSY")
          )
            throw error;
          await Bun.sleep(25 * (attempt + 1));
        }
      }
    } finally {
      await rm(temp, { force: true });
    }
  }

  index() {
    return this.read("index.json", indexSchema);
  }
  saveIndex(value: AccountIndex) {
    return this.save("index.json", indexSchema.parse(value));
  }
  account(key: string) {
    return this.read(`${registrationKey.parse(key)}.json`, registrationSchema);
  }
  saveAccount(value: Registration) {
    return this.save(
      `${registrationKey.parse(value.key)}.json`,
      registrationSchema.parse(value),
    );
  }
}

function hasCode(error: unknown, ...codes: string[]) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    codes.includes(error.code)
  );
}
