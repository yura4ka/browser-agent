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

const stringOrRegex = stringOrRegexSchema.describe("Text or regex to match.");

const defaultOptionsSchema = z
  .object({
    exact: z
      .boolean()
      .optional()
      .describe("Exact match (case-sensitive, full string)."),
  })
  .strict()
  .optional();

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
    name: stringOrRegex.optional().describe("Accessible name to match."),
    pressed: z.boolean().optional().describe("Match aria-pressed state."),
    selected: z.boolean().optional().describe("Match aria-selected state."),
  })
  .strict()
  .optional()
  .describe("Options for role locators.");

export const locatorSchema: z.ZodType<LocatorDef> = z
  .discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("altText"),
        content: stringOrRegex,
        options: defaultOptionsSchema,
      })
      .strict()
      .describe("Locate by alt text."),
    z
      .object({
        kind: z.literal("label"),
        content: stringOrRegex,
        options: defaultOptionsSchema,
      })
      .strict()
      .describe("Locate inputs by the associated label."),
    z
      .object({
        kind: z.literal("placeholder"),
        content: stringOrRegex,
        options: defaultOptionsSchema,
      })
      .strict()
      .describe("Locate inputs by placeholder."),
    z
      .object({
        kind: z.literal("role"),
        role: z.string(),
        options: roleOptionsSchema,
      })
      .strict()
      .describe("Locate by ARIA role and related options."),
    z
      .object({
        kind: z.literal("text"),
        content: stringOrRegex,
        options: defaultOptionsSchema,
      })
      .strict()
      .describe("Locate by text content."),
    z
      .object({
        kind: z.literal("title"),
        content: stringOrRegex,
        options: defaultOptionsSchema,
      })
      .strict()
      .describe("Locate by title attribute."),
    z
      .object({
        kind: z.literal("selector"),
        selector: z.string().describe("CSS or XPath selector."),
      })
      .strict()
      .describe("Locate by selector."),
    z
      .object({
        kind: z.literal("and"),
        locators: z.lazy(() => z.array(locatorSchema).min(2)),
      })
      .strict()
      .describe("Matches all of the provided locators."),
    z
      .object({
        kind: z.literal("or"),
        locators: z.lazy(() => z.array(locatorSchema).min(2)),
      })
      .strict()
      .describe("Matches any of the provided locators."),
    z
      .object({
        kind: z.literal("first"),
        locator: z.lazy(() => locatorSchema),
      })
      .strict()
      .describe("Returns the first matching element."),
    z
      .object({
        kind: z.literal("last"),
        locator: z.lazy(() => locatorSchema),
      })
      .strict()
      .describe("Returns the last matching element."),
    z
      .object({
        kind: z.literal("nth"),
        index: z.number().int().min(0),
        locator: z.lazy(() => locatorSchema),
      })
      .strict()
      .describe("Returns the nth matching element."),
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
            hasText: stringOrRegex
              .optional()
              .describe("Only include elements with matching text."),
            hasNotText: stringOrRegex
              .optional()
              .describe("Exclude elements with matching text."),
            visible: z
              .boolean()
              .optional()
              .describe("Match only visible or hidden elements."),
          })
          .strict(),
      })
      .strict()
      .describe("Filter the locator by options."),
  ])
  .describe("Input for resolving a Playwright locator.");
