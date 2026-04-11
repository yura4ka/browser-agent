import type { Locator, Page } from "playwright";
import { Result } from "@/core/Result";
import { resolveStringOrRegex } from "@/core/utils";
import { areaRoleEnum } from "./ariaRoles";
import type { LocatorDef } from "./schema";

export function resolveLocator(
  locator: LocatorDef,
  page: Page,
): Result<Locator> {
  if (locator.kind === "altText") {
    return Result.Ok(
      page.getByAltText(resolveStringOrRegex(locator.content), locator.options),
    );
  }

  if (locator.kind === "label") {
    return Result.Ok(
      page.getByLabel(resolveStringOrRegex(locator.content), locator.options),
    );
  }

  if (locator.kind === "placeholder") {
    return Result.Ok(
      page.getByPlaceholder(
        resolveStringOrRegex(locator.content),
        locator.options,
      ),
    );
  }

  if (locator.kind === "role") {
    const role = areaRoleEnum.safeParse(locator.role);
    if (!role.success) {
      return Result.fromCanonical("Invalid role", role.error.message);
    }

    const options = {
      ...locator.options,
      name: locator.options?.name
        ? resolveStringOrRegex(locator.options.name)
        : undefined,
    };
    return Result.Ok(page.getByRole(role.data, options));
  }

  if (locator.kind === "text") {
    return Result.Ok(
      page.getByText(resolveStringOrRegex(locator.content), locator.options),
    );
  }

  if (locator.kind === "title") {
    return Result.Ok(
      page.getByTitle(resolveStringOrRegex(locator.content), locator.options),
    );
  }

  if (locator.kind === "selector") {
    return Result.Ok(page.locator(locator.selector));
  }

  if (locator.kind === "and") {
    const resolved = resolveArrayOfLocator(locator.locators, page);
    if (Result.isErr(resolved)) return resolved;

    let combined = resolved.value[0];
    if (!combined)
      return Result.fromCanonical("No locators provided for the and selector");

    for (let i = 1; i < resolved.value.length; i++) {
      combined = combined.and(resolved.value[i]);
    }
    return Result.Ok(combined);
  }

  if (locator.kind === "or") {
    const resolved = resolveArrayOfLocator(locator.locators, page);
    if (Result.isErr(resolved)) return resolved;

    let combined = resolved.value[0];
    if (!combined)
      return Result.fromCanonical("No locators provided for the or selector");

    for (let i = 1; i < resolved.value.length; i++) {
      combined = combined.or(resolved.value[i]);
    }
    return Result.Ok(combined);
  }

  if (locator.kind === "first") {
    const resolved = resolveLocator(locator.locator, page);
    if (Result.isErr(resolved)) return resolved;
    return Result.Ok(resolved.value.first());
  }

  if (locator.kind === "last") {
    const resolved = resolveLocator(locator.locator, page);
    if (Result.isErr(resolved)) return resolved;
    return Result.Ok(resolved.value.last());
  }

  if (locator.kind === "nth") {
    const resolved = resolveLocator(locator.locator, page);
    if (Result.isErr(resolved)) return resolved;
    return Result.Ok(resolved.value.nth(locator.index));
  }

  if (locator.kind === "filter") {
    const resolved = resolveLocator(locator.locator, page);
    if (Result.isErr(resolved)) return resolved;

    const hasLocator = locator.options.has
      ? resolveLocator(locator.options.has, page)
      : undefined;

    const hasNotLocator = locator.options.hasNot
      ? resolveLocator(locator.options.hasNot, page)
      : undefined;

    if (hasLocator && Result.isErr(hasLocator)) return hasLocator;
    if (hasNotLocator && Result.isErr(hasNotLocator)) return hasNotLocator;

    const options = {
      ...locator.options,
      hasText: locator.options.hasText
        ? resolveStringOrRegex(locator.options.hasText)
        : undefined,
      hasNotText: locator.options.hasNotText
        ? resolveStringOrRegex(locator.options.hasNotText)
        : undefined,
      has: hasLocator?.value,
      hasNot: hasNotLocator?.value,
    };
    return Result.Ok(resolved.value.filter(options));
  }

  return Result.fromCanonical("Unknown locator kind") as never;
}

function resolveArrayOfLocator(
  locators: LocatorDef[],
  page: Page,
): Result<Locator[]> {
  const resolved = locators.map((locator) => resolveLocator(locator, page));
  const error = resolved.find((result) => Result.isErr(result));
  if (error) return error;
  const values = resolved.filter(Result.isOk).map((result) => result.value);
  return Result.Ok(values);
}
