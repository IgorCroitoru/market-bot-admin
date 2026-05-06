import type { AppLogger } from "@market-bot-admin/logging";

export interface RetriableErrorLike {
  code?: string;
  cause?: unknown;
  eresult?: number;
  message?: string;
  status?: number;
  statusCode?: number;
}

export interface RetryOptions {
  attempts: number;
  delayMs: number;
  maxDelayMs?: number;
  logger?: AppLogger;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const retriableEresults = new Set([
  3, // NoConnection
  10, // Busy
  16, // Timeout
  20, // ServiceUnavailable
  25, // LimitExceeded
  35, // ConnectFailed
  38, // RemoteDisconnect
  48, // TryAnotherCM
  55, // RemoteCallFailed
  76, // BadResponse
  79, // UnexpectedError
  84, // RateLimitExceeded,
  88, // TwoFactorCodeMismatch
  95, // AccountLimitExceeded / TooManyAccountsAccessThisResource
  96, // AccountActivityLimitExceeded
  110 // WGNetworkSendExceeded
]);

const retriableCodes = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETRESET",
  "ENETUNREACH",
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "EAI_AGAIN"
]);

export function isRetriableError(error: unknown): boolean {
  const current = error as RetriableErrorLike | null;

  if (!current) {
    return false;
  }

  if (typeof current.eresult === "number" && retriableEresults.has(current.eresult)) {
    return true;
  }

  const statusCode = current.statusCode ?? current.status;
  if (typeof statusCode === "number" && (statusCode === 429 || statusCode >= 500)) {
    return true;
  }

  if (current.code && retriableCodes.has(current.code)) {
    return true;
  }

  if (current.cause === "ItemServerUnavailable") {
    return true;
  }

  if (typeof current.message === "string") {
    const message = current.message.toLowerCase();

    if (
      message.includes("timeout") ||
      message.includes("temporarily unavailable") ||
      message.includes("item server unavailable") ||
      message.includes("socket hang up") ||
      message.includes("rate limit")
    ) {
      return true;
    }
  }

  return current.cause ? isRetriableError(current.cause) : false;
}

export async function withRetries<T>(
  action: (attempt: number) => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const attempts = Math.max(1, options.attempts);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await action(attempt);
    } catch (error) {
      lastError = error;

      const canRetry = options.shouldRetry?.(error) ?? isRetriableError(error);

      if (!canRetry || attempt >= attempts) {
        throw error;
      }

      const delayMs = Math.min(
        options.maxDelayMs ?? Number.MAX_SAFE_INTEGER,
        options.delayMs * attempt
      );

      options.logger?.warn(
        { err: error, attempt, nextAttempt: attempt + 1, delayMs },
        "Retryable Steam action failed"
      );
      options.onRetry?.(error, attempt, delayMs);
      await delay(delayMs);
    }
  }

  throw lastError;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
