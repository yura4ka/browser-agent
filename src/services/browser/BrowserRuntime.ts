import {
  type BrowserContext,
  chromium,
  type Locator,
  type Page,
} from "playwright";
import { Result } from "@/core/Result";
import { resolveLocator } from "./locator/resolveLocator";
import type { LocatorDef } from "./locator/schema";
import type { BrowserSelectOption } from "./types";

export class BrowserRuntime {
  private browserContext: BrowserContext | null = null;

  async ensureContext(): Promise<Result<BrowserContext>> {
    if (this.browserContext) {
      return Result.Ok(this.browserContext);
    }

    try {
      const browser = await chromium.launch({ headless: false });
      const context = await browser.newContext();
      this.browserContext = context;
      return Result.Ok(context);
    } catch (error) {
      return Result.fromCanonical(
        "Failed to create browser context",
        this.withHint(error),
      );
    }
  }

  listLivePages(): Result<Page[]> {
    if (!this.browserContext) return Result.Ok([]);

    const livePages = this.browserContext
      .pages()
      .filter((page) => !page.isClosed());

    return Result.Ok(livePages);
  }

  async createPage(): Promise<Result<Page>> {
    const browserContext = await this.ensureContext();
    if (Result.isErr(browserContext)) return browserContext;

    const pageResult = await Result.fromPromise(browserContext.value.newPage());
    if (Result.isErr(pageResult)) {
      return Result.fromCanonical(
        "Failed to create tab: unable to open a new page",
        this.withHint(pageResult.error),
      );
    }

    return Result.Ok(pageResult.value);
  }

  async navigate(page: Page, url: string): Promise<Result<void>> {
    const navigationResult = await Result.fromPromise(page.goto(url));
    if (Result.isErr(navigationResult)) {
      return Result.fromCanonical(
        `Failed to open URL: "${url}"`,
        this.withHint(navigationResult.error),
      );
    }

    return Result.Ok(undefined);
  }

  async reload(page: Page): Promise<Result<void>> {
    const reloadResult = await Result.fromPromise(page.reload());
    if (Result.isErr(reloadResult)) {
      return Result.fromCanonical(
        "Failed to reload tab",
        this.withHint(reloadResult.error),
      );
    }

    return Result.Ok(undefined);
  }

  async scroll(
    page: Page,
    input: { deltaX?: number; deltaY?: number },
  ): Promise<Result<void>> {
    const scrollResult = await Result.fromPromise(
      page.mouse.wheel(input.deltaX ?? 0, input.deltaY ?? 0),
    );
    if (Result.isErr(scrollResult)) {
      return Result.fromCanonical(
        "Failed to scroll tab",
        this.withHint(scrollResult.error),
      );
    }

    return Result.Ok(undefined);
  }

  async getPageAreaSnapshot(
    page: Page,
    options?: { depth?: number },
  ): Promise<Result<string>> {
    const snapshotResult = await Result.fromPromise(
      page.ariaSnapshot({ depth: options?.depth }),
    );
    if (Result.isErr(snapshotResult)) {
      return Result.fromCanonical(
        "Failed to get aria snapshot",
        this.withHint(snapshotResult.error),
      );
    }

    return Result.Ok(snapshotResult.value);
  }

  async getLocatorAriaSnapshot(
    locator: Locator,
    options: { depth?: number },
  ): Promise<Result<string>> {
    const snapshotResult = await Result.fromPromise(
      locator.ariaSnapshot({ depth: options?.depth }),
    );
    if (Result.isErr(snapshotResult)) {
      return Result.fromCanonical(
        "Failed to get aria snapshot",
        this.withHint(snapshotResult.error),
      );
    }

    return Result.Ok(snapshotResult.value);
  }

  async getPageHtmlContent(page: Page): Promise<Result<string>> {
    const contentResult = await Result.fromPromise(page.content());
    if (Result.isErr(contentResult)) {
      return Result.fromCanonical(
        "Failed to get html content",
        this.withHint(contentResult.error),
      );
    }

    return Result.Ok(contentResult.value);
  }

  async getLocatorHtmlContent(locator: Locator): Promise<Result<string>> {
    const contentResult = await Result.fromPromise(locator.innerHTML());
    if (Result.isErr(contentResult)) {
      return Result.fromCanonical(
        "Failed to get html content",
        this.withHint(contentResult.error),
      );
    }

    return Result.Ok(contentResult.value);
  }

  async getTextContent(locator: Locator): Promise<Result<string>> {
    const textResult = await Result.fromPromise(locator.textContent());
    if (Result.isErr(textResult)) {
      return Result.fromCanonical(
        "Failed to get text content",
        this.withHint(textResult.error),
      );
    }

    return Result.Ok(textResult.value ?? "");
  }

  async click(locator: Locator): Promise<Result<void>> {
    const clickResult = await Result.fromPromise(locator.click());
    if (Result.isErr(clickResult)) {
      return Result.fromCanonical(
        "Failed to click locator",
        this.withHint(clickResult.error),
      );
    }

    return Result.Ok(undefined);
  }

  async setChecked(locator: Locator, checked: boolean): Promise<Result<void>> {
    const checkedResult = await Result.fromPromise(locator.setChecked(checked));
    if (Result.isErr(checkedResult)) {
      return Result.fromCanonical(
        "Failed to set checked state",
        this.withHint(checkedResult.error),
      );
    }

    return Result.Ok(undefined);
  }

  async fillText(locator: Locator, text: string): Promise<Result<void>> {
    const fillResult = await Result.fromPromise(locator.fill(text));
    if (Result.isErr(fillResult)) {
      return Result.fromCanonical(
        "Failed to fill text",
        this.withHint(fillResult.error),
      );
    }

    return Result.Ok(undefined);
  }

  async clear(locator: Locator): Promise<Result<void>> {
    const clearResult = await Result.fromPromise(locator.clear());
    if (Result.isErr(clearResult)) {
      return Result.fromCanonical(
        "Failed to clear input",
        this.withHint(clearResult.error),
      );
    }

    return Result.Ok(undefined);
  }

  async highlight(locator: Locator): Promise<Result<void>> {
    const highlightResult = await Result.fromPromise(locator.highlight());
    if (Result.isErr(highlightResult)) {
      return Result.fromCanonical(
        "Failed to highlight locator",
        this.withHint(highlightResult.error),
      );
    }

    return Result.Ok(undefined);
  }

  async scrollIntoView(locator: Locator): Promise<Result<void>> {
    const scrollResult = await Result.fromPromise(
      locator.scrollIntoViewIfNeeded(),
    );
    if (Result.isErr(scrollResult)) {
      return Result.fromCanonical(
        "Failed to scroll locator into view",
        this.withHint(scrollResult.error),
      );
    }

    return Result.Ok(undefined);
  }

  async selectOption(
    locator: Locator,
    option: BrowserSelectOption,
  ): Promise<Result<void>> {
    const normalizedOption = this.normalizeSelectOption(option);

    const selectResult = await Result.fromPromise(
      locator.selectOption(normalizedOption),
    );
    if (Result.isErr(selectResult)) {
      return Result.fromCanonical(
        "Failed to select option",
        this.withHint(selectResult.error),
      );
    }

    return Result.Ok(undefined);
  }

  resolveLocator(page: Page, locator: LocatorDef): Result<Locator> {
    return resolveLocator(locator, page);
  }

  private normalizeSelectOption(option: BrowserSelectOption):
    | string
    | {
        label?: string;
        index?: number;
      } {
    if (option.type === "value") {
      return option.value;
    }

    if (option.type === "label") {
      return { label: option.label };
    }

    return { index: option.index };
  }

  private withHint(error: unknown, hint?: string): string {
    const message =
      error instanceof Error
        ? `Cause: ${error.message}`
        : "Cause: unknown error.";

    return hint ? `${message} ${hint}` : message;
  }
}
