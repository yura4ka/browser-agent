import { z } from "zod";

export type StringOrRegex =
  | { type: "text"; text: string }
  | { type: "regex"; pattern: string; flags?: string };

export const stringOrRegexSchema: z.ZodType<StringOrRegex> = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("text"), text: z.string() }).strict(),
    z
      .object({
        type: z.literal("regex"),
        pattern: z.string(),
        flags: z
          .string()
          .regex(
            /^[dgimsuvy]*$/,
            "Regex flags must be a combination of d, g, i, m, s, u, v, y",
          )
          .refine((flags) => new Set(flags).size === flags.length, {
            message: "Regex flags must not repeat characters",
          })
          .optional(),
      })
      .strict()
      .refine(
        ({ pattern, flags }) => {
          try {
            new RegExp(pattern, flags);
            return true;
          } catch {
            return false;
          }
        },
        { message: "Invalid regular expression pattern or flags" },
      ),
  ])
  .describe("Text or regex to match.")
  .register(z.globalRegistry, { id: "StringOrRegExp" });

export function resolveStringOrRegex(input: StringOrRegex): string | RegExp {
  if (input.type === "text") {
    return input.text;
  } else {
    return new RegExp(input.pattern, input.flags);
  }
}
