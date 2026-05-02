import { z } from "zod";
import type { BotOptions, SteamTokenPlatform } from "./IOptions";

const numberFromEnv = (defaultValue: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return defaultValue;
    }

    if (typeof value === "string") {
      return Number(value);
    }

    return value;
  }, z.number().int().nonnegative());

const envSchema = z.object({
  BOT_ENV: z.enum(["dev", "prod", "test"]).default("dev"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  STEAM_ACCOUNT_NAME: z.string().min(1),
  STEAM_PASSWORD: z.string().optional(),
  STEAM_SHARED_SECRET: z.string().optional(),
  STEAM_GUARD_CODE: z.string().optional(),
  STEAM_API_DOMAIN: z.string().default("localhost"),
  STEAM_TOKEN_PLATFORM: z.enum(["mobile", "web", "client"]).default("mobile"),

  BOT_POLL_INTERVAL_MS: numberFromEnv(30_000),
  BOT_CANCEL_TIME_MS: numberFromEnv(10 * 60_000),
  BOT_LOGIN_TIMEOUT_MS: numberFromEnv(90_000),
  BOT_MAX_LOGIN_RETRIES: numberFromEnv(3),
  BOT_LOGIN_RETRY_DELAY_MS: numberFromEnv(5_000),
  BOT_MAX_LOGIN_ATTEMPTS_WITHIN_PERIOD: numberFromEnv(3),
  BOT_LOGIN_ATTEMPT_PERIOD_MS: numberFromEnv(60_000),
  BOT_TOKEN_REFRESH_INTERVAL_MS: numberFromEnv(5 * 60_000),
  BOT_TOKEN_REFRESH_SKEW_MS: numberFromEnv(2 * 60_000),
  BOT_REFRESH_TOKEN_RENEWAL_WINDOW_MS: numberFromEnv(7 * 24 * 60 * 60_000)
});

export type BotRuntimeConfig = z.infer<typeof envSchema>;

export function loadBotConfigFromEnv(env: NodeJS.ProcessEnv = process.env): BotRuntimeConfig {
  return envSchema.parse(env);
}

export function loadBotOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): BotOptions {
  const config = loadBotConfigFromEnv(env);

  return {
    accountName: config.STEAM_ACCOUNT_NAME,
    password: config.STEAM_PASSWORD,
    sharedSecret: config.STEAM_SHARED_SECRET,
    steamGuardCode: config.STEAM_GUARD_CODE,
    domain: config.STEAM_API_DOMAIN,
    pollIntervalMs: config.BOT_POLL_INTERVAL_MS,
    cancelTimeMs: config.BOT_CANCEL_TIME_MS,
    loginTimeoutMs: config.BOT_LOGIN_TIMEOUT_MS,
    maxLoginRetries: config.BOT_MAX_LOGIN_RETRIES,
    loginRetryDelayMs: config.BOT_LOGIN_RETRY_DELAY_MS,
    maxLoginAttemptsWithinPeriod: config.BOT_MAX_LOGIN_ATTEMPTS_WITHIN_PERIOD,
    loginAttemptPeriodMs: config.BOT_LOGIN_ATTEMPT_PERIOD_MS,
    tokenRefreshIntervalMs: config.BOT_TOKEN_REFRESH_INTERVAL_MS,
    tokenRefreshSkewMs: config.BOT_TOKEN_REFRESH_SKEW_MS,
    refreshTokenRenewalWindowMs: config.BOT_REFRESH_TOKEN_RENEWAL_WINDOW_MS,
    tokenPlatform: config.STEAM_TOKEN_PLATFORM as SteamTokenPlatform
  };
}
