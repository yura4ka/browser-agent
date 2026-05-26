import { z } from "zod";
import { type StringOrRegex, stringOrRegexSchema } from "@/core/utils";

export type AltTextLocator = {
  kind: "altText";
  content: StringOrRegex;
  options?: { exact?: boolean };
};

export type LabelLocator = {
  kind: "label";
  content: StringOrRegex;
  options?: { exact?: boolean };
};

export type PlaceholderLocator = {
  kind: "placeholder";
  content: StringOrRegex;
  options?: { exact?: boolean };
};

export type RoleLocator = {
  kind: "role";
  role: string;
  options?: {
    checked?: boolean;
    disabled?: boolean;
    exact?: boolean;
    expanded?: boolean;
    includeHidden?: boolean;
    level?: number;
    name?: StringOrRegex;
    pressed?: boolean;
    selected?: boolean;
  };
};

export type TextLocator = {
  kind: "text";
  content: StringOrRegex;
  options?: { exact?: boolean };
};

export type TitleLocator = {
  kind: "title";
  content: StringOrRegex;
  options?: { exact?: boolean };
};

export type SelectorLocator = {
  kind: "selector";
  selector: string;
};

export type AndLocator = {
  kind: "and";
  locators: LocatorDef[];
};

export type OrLocator = {
  kind: "or";
  locators: LocatorDef[];
};

export type FirstLocator = {
  kind: "first";
  locator: LocatorDef;
};

export type LastLocator = {
  kind: "last";
  locator: LocatorDef;
};

export type NthLocator = {
  kind: "nth";
  index: number;
  locator: LocatorDef;
};

export type FilterLocator = {
  kind: "filter";
  locator: LocatorDef;
  options: LocatorFilterOptions;
};

export type LocatorDef =
  | AltTextLocator
  | LabelLocator
  | PlaceholderLocator
  | RoleLocator
  | TextLocator
  | TitleLocator
  | SelectorLocator
  | AndLocator
  | OrLocator
  | FirstLocator
  | LastLocator
  | NthLocator
  | FilterLocator;

export type LocatorFilterOptions = {
  has?: LocatorDef;
  hasNot?: LocatorDef;
  hasText?: StringOrRegex;
  hasNotText?: StringOrRegex;
  visible?: boolean;
};

function parseJsonObjectString(value: unknown): unknown {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

const defaultOptionsSchema = z
  .object({
    exact: z
      .boolean()
      .optional()
      .describe("Exact match (case-sensitive, full string)."),
  })
  .strict()
  .optional()
  .register(z.globalRegistry, { id: "LocatorOptions" });

const roleOptionsSchema = z
  .object({
    checked: z
      .boolean()
      .optional()
      .describe("Match aria-checked / checkbox state."),
    disabled: z
      .boolean()
      .optional()
      .describe("Match aria-disabled / disabled state."),
    exact: z.boolean().optional().describe("Exact name match."),
    expanded: z.boolean().optional().describe("Match aria-expanded state."),
    includeHidden: z.boolean().optional().describe("Include hidden elements."),
    level: z
      .number()
      .int()
      .optional()
      .describe("Match level (for example headings)."),
    name: stringOrRegexSchema.optional().describe("Accessible name to match."),
    pressed: z.boolean().optional().describe("Match aria-pressed state."),
    selected: z.boolean().optional().describe("Match aria-selected state."),
  })
  .strict()
  .optional()
  .describe("Options for role locators.")
  .register(z.globalRegistry, { id: "RoleLocatorOptions" });

const locatorSchemaBase: z.ZodType<LocatorDef> = z
  .discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("altText"),
        content: stringOrRegexSchema,
        options: defaultOptionsSchema,
      })
      .strict()
      .describe("Locate by alt text.")
      .register(z.globalRegistry, { id: "AltTextLocator" }),
    z
      .object({
        kind: z.literal("label"),
        content: stringOrRegexSchema,
        options: defaultOptionsSchema,
      })
      .strict()
      .describe("Locate inputs by the associated label.")
      .register(z.globalRegistry, { id: "LabelLocator" }),
    z
      .object({
        kind: z.literal("placeholder"),
        content: stringOrRegexSchema,
        options: defaultOptionsSchema,
      })
      .strict()
      .describe("Locate inputs by placeholder.")
      .register(z.globalRegistry, { id: "PlaceholderLocator" }),
    z
      .object({
        kind: z.literal("role"),
        role: z.string(),
        options: roleOptionsSchema,
      })
      .strict()
      .describe("Locate by ARIA role and related options.")
      .register(z.globalRegistry, { id: "RoleLocator" }),
    z
      .object({
        kind: z.literal("text"),
        content: stringOrRegexSchema,
        options: defaultOptionsSchema,
      })
      .strict()
      .describe("Locate by text content.")
      .register(z.globalRegistry, { id: "TextLocator" }),
    z
      .object({
        kind: z.literal("title"),
        content: stringOrRegexSchema,
        options: defaultOptionsSchema,
      })
      .strict()
      .describe("Locate by title attribute.")
      .register(z.globalRegistry, { id: "TitleLocator" }),
    z
      .object({
        kind: z.literal("selector"),
        selector: z.string().describe("CSS or XPath selector."),
      })
      .strict()
      .describe("Locate by selector.")
      .register(z.globalRegistry, { id: "SelectorLocator" }),
    z
      .object({
        kind: z.literal("and"),
        locators: z.lazy(() => z.array(locatorSchema).min(2)),
      })
      .strict()
      .describe("Matches all of the provided locators.")
      .register(z.globalRegistry, { id: "AndLocator" }),
    z
      .object({
        kind: z.literal("or"),
        locators: z.lazy(() => z.array(locatorSchema).min(2)),
      })
      .strict()
      .describe("Matches any of the provided locators.")
      .register(z.globalRegistry, { id: "OrLocator" }),
    z
      .object({
        kind: z.literal("first"),
        locator: z.lazy(() => locatorSchema),
      })
      .strict()
      .describe("Returns the first matching element.")
      .register(z.globalRegistry, { id: "FirstLocator" }),
    z
      .object({
        kind: z.literal("last"),
        locator: z.lazy(() => locatorSchema),
      })
      .strict()
      .describe("Returns the last matching element.")
      .register(z.globalRegistry, { id: "LastLocator" }),
    z
      .object({
        kind: z.literal("nth"),
        index: z.number().int().min(0),
        locator: z.lazy(() => locatorSchema),
      })
      .strict()
      .describe("Returns the nth matching element.")
      .register(z.globalRegistry, { id: "NthLocator" }),
    z
      .object({
        kind: z.literal("filter"),
        locator: z.lazy(() => locatorSchema),
        options: z
          .object({
            has: z
              .lazy(() => locatorSchema)
              .optional()
              .describe("Only include elements containing this locator."),
            hasNot: z
              .lazy(() => locatorSchema)
              .optional()
              .describe("Exclude elements containing this locator."),
            hasText: stringOrRegexSchema
              .optional()
              .describe("Only include elements with matching text."),
            hasNotText: stringOrRegexSchema
              .optional()
              .describe("Exclude elements with matching text."),
            visible: z
              .boolean()
              .optional()
              .describe("Match only visible or hidden elements."),
          })
          .strict()
          .register(z.globalRegistry, { id: "LocatorFilterOptions" }),
      })
      .strict()
      .describe("Filter the locator by options.")
      .register(z.globalRegistry, { id: "FilterLocator" }),
  ])
  .describe("Input for resolving a Playwright locator.");

export const locatorSchema: z.ZodType<LocatorDef> = z
  .preprocess(parseJsonObjectString, locatorSchemaBase)
  .describe("Input for resolving a Playwright locator.")
  .register(z.globalRegistry, { id: "Locator" });
