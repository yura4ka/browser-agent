import { type BrowserContext, chromium, type Page } from "playwright";
import { Result } from "@/core/Result";

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

  private withHint(error: unknown, hint?: string): string {
    const message =
      error instanceof Error
        ? `Cause: ${error.message}`
        : "Cause: unknown error.";

    return hint ? `${message} ${hint}` : message;
  }
}
