import pino, { Logger } from "pino";

export type AppLogger = Logger;

export type ServiceName =
  | "api"
  | "steam-bot"
  | "market-worker"
  | "scheduler";

export interface CreateLoggerOptions {
  service: ServiceName;
  environment: "dev" | "prod" | "test";
  level?: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  context?: Record<string, unknown>;
  redactPaths?: string []
}

export function createLogger(options: CreateLoggerOptions): AppLogger {
  return pino({
    level: options.level ?? "info",

    base: {
      service: options.service,
      environment: options.environment,
      ...options.context
    },

    redact: {
      paths: [
        "steamPassword",
        "steamSharedSecret",
        "steamIdentitySecret",
        "steamRefreshToken",
        "marketCsgoApiKey",
        "password",
        "sharedSecret",
        "identitySecret",
        "refreshToken",
        "apiKey",
        "authorization",
        "cookie",
        "headers.authorization",
        "headers.cookie",
        "req.headers.authorization",
        "req.headers.cookie"
      ],
      censor: "[REDACTED]"
    }
  });
}