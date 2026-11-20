export function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);

  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

export function readNumberOption(
  args: string[],
  name: string,
): number | undefined {
  const value = readOption(args, name);

  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

export function missingRequiredArgs(args: string[], names: string[]): string[] {
  return names.filter((name) => readOption(args, name) === undefined);
}

export function formatMissingArgsError(
  command: string,
  missing: string[],
  example: string,
): string {
  return [
    `${command} is missing required argument${missing.length === 1 ? "" : "s"}: ${missing
      .map((name) => `--${name}`)
      .join(", ")}`,
    `Example: ${example}`,
  ].join("\n");
}
