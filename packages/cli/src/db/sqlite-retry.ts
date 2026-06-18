const SQLITE_LOCKED_ERROR_PATTERNS = [
  "database is locked",
  "database table is locked",
  "sqlite_busy",
  "sqlite_locked",
] as const;

const DEFAULT_ATTEMPTS = 5;
const BASE_DELAY_MS = 25;
const MAX_DELAY_MS = 250;

const sleepSync = (milliseconds: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
};

export const isSqliteLockedError = (error: unknown): boolean => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { readonly code?: unknown }).code)
      : "";
  const message = error instanceof Error ? error.message : String(error);
  const haystack = `${code} ${message}`.toLowerCase();

  return SQLITE_LOCKED_ERROR_PATTERNS.some((pattern) => haystack.includes(pattern));
};

export const withSqliteWriteRetry = <A>(operation: () => A): A => {
  let lastError: unknown;

  for (let attempt = 0; attempt < DEFAULT_ATTEMPTS; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      lastError = error;

      if (!isSqliteLockedError(error) || attempt === DEFAULT_ATTEMPTS - 1) {
        throw error;
      }

      const exponentialDelay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
      const jitter = Math.floor(Math.random() * BASE_DELAY_MS);
      sleepSync(exponentialDelay + jitter);
    }
  }

  throw lastError;
};
