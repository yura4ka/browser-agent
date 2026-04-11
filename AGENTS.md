# Agent Rules

- Use `zod` for schema validation

Before finishing work, always run type and Biome checks.
- Run `bunx tsc --noEmit`
- Run `bun run check:write`
- Run `bun run check`

## Bun

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

### APIs

- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

### Testing

Use `bun test` to run tests.

```ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Result Type

Use `Result<T, E>` from `src/core/Result.ts` for expected/recoverable failures.
`Result` can be used as a type and as an object. **DO NOT** import both

```ts
import { Result } from "@/core/Result";

function getProviderModels(providerId: string): Result<string[]> {
  if (providerId.length === 0) {
    return Result.fromCanonical("Provider id is required", "Pass a non-empty id");
  }

  return Result.Ok(["model-a", "model-b"]);
}
```

Prefer narrowing with `Result.isOk`/`Result.isErr`:

```ts
const result = getProviderModels(input);

if (Result.isOk(result)) {
  console.log(result.value);
} else {
  console.error(result.error.message);
}
```

Working with promises:
```ts
const result = await Result.fromPromise(fetch());
if (Result.isErr(result)) {
  return Result.fromCanonical("Fetch error");
}
```
