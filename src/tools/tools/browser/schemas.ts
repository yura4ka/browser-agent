import z from "zod";
import { locatorSchema } from "@/services/browser/locator/schema";

export const tabIdArgsSchema = z.object({ tabId: z.string() }).strict();

export const tabLocatorArgsSchema = z
  .object({
    tabId: z.string(),
    locator: locatorSchema,
  })
  .strict();

export const optionalLocatorArgsSchema = z
  .object({
    tabId: z.string(),
    locator: locatorSchema.optional(),
  })
  .strict();

export const maxLengthSchema = z.number().int().min(1).max(200_000).optional();
export const depthSchema = z.number().int().min(0).max(20).optional();

export const selectOptionArgsSchema = z.discriminatedUnion("type", [
  z
    .object({
      tabId: z.string(),
      locator: locatorSchema,
      type: z.literal("value"),
      value: z.string(),
    })
    .strict(),
  z
    .object({
      tabId: z.string(),
      locator: locatorSchema,
      type: z.literal("label"),
      label: z.string(),
    })
    .strict(),
  z
    .object({
      tabId: z.string(),
      locator: locatorSchema,
      type: z.literal("index"),
      index: z.number().int().min(0),
    })
    .strict(),
]);

export const screenshotOptionsSchema = optionalLocatorArgsSchema.extend({
  options: z
    .object({
      animations: z.enum(["disabled", "allow"]).optional(),
      timeout: z.number().optional(),
      fullPage: z.boolean().optional(),
      clip: z
        .object({
          x: z.number().int().min(0),
          y: z.number().int().min(0),
          width: z.number().int().min(0),
          height: z.number().int().min(0),
        })
        .strict()
        .optional(),
    })
    .strict()
    .optional(),
});
