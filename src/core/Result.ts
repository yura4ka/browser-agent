type CanonicalErrorData = { message: string; hint?: string; code?: number };

export class CanonicalError extends Error {
  readonly code?: number;
  readonly hint?: string;

  constructor(message: string, hint?: string, code?: number);
  constructor(data: CanonicalErrorData);
  constructor(
    messageOrData: string | CanonicalErrorData,
    hint?: string,
    code?: number,
  ) {
    const data =
      typeof messageOrData === "string"
        ? { message: messageOrData, hint, code }
        : messageOrData;

    super(data.message);
    this.name = "CanonicalError";
    this.hint = data.hint;
    this.code = data.code;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type Result<T, E = CanonicalError> = ResultOk<T> | ResultErr<E>;
export type ResultOk<T> = { ok: true; value: T };
export type ResultErr<E> = { ok: false; error: E };

export const Result = {
  Ok<T>(value: T): ResultOk<T> {
    return { ok: true, value };
  },
  Err<E = CanonicalError>(error: E): ResultErr<E> {
    return { ok: false, error };
  },
  fromCanonical(
    message: string | CanonicalErrorData | CanonicalError,
    hint?: string,
    code?: number,
  ): ResultErr<CanonicalError> {
    let error: CanonicalError;
    if (typeof message === "string") {
      error = new CanonicalError(message, hint, code);
    } else if (message instanceof CanonicalError) {
      error = message;
    } else {
      error = new CanonicalError(message);
    }

    return { ok: false, error };
  },
  fromPromise<T, E = unknown>(promise: Promise<T>): Promise<Result<T, E>> {
    return promise
      .then((value) => Result.Ok(value))
      .catch((error) => Result.Err(error));
  },
  wrap<T>(fn: () => T): Result<T, unknown> {
    try {
      return Result.Ok(fn());
    } catch (error) {
      return Result.Err(error);
    }
  },
  isOk<T, E>(result: Result<T, E>): result is ResultOk<T> {
    return result.ok;
  },
  isErr<T, E>(result: Result<T, E>): result is ResultErr<E> {
    return !result.ok;
  },
} as const;
