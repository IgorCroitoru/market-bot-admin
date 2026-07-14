import type { BotOptions, SteamTokenPlatform } from "./IOptions";
import type { AzureQueueConfig } from "@market-bot-admin/queue";
import type { TaskControllerOptions } from "./TaskController";
import {booleanFromEnv, numberFromEnv, optionalBooleanFromEnv, optionalTrimmedString, z} from "@market-bot-admin/config"


const envSchema = z.object({
  BOT_ENV: z.enum(["dev", "prod", "test"]).default("dev"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  STEAM_ACCOUNT_NAME: z.string().min(1),
  STEAM_PASSWORD: z.string().optional(),
  STEAM_SHARED_SECRET: z.string().optional(),
  STEAM_IDENTITY_SECRET: z.string(),
  STEAM_GUARD_CODE: z.string().optional(),
  STEAM_API_DOMAIN: z.string().default("localhost"),
  STEAM_TOKEN_PLATFORM: z.enum(["mobile", "web", "client"]).default("mobile"),
  BOT_INVENTORY_POLL_INTERVAL_MS: numberFromEnv(12 * 60 * 60_000),

  BOT_POLL_INTERVAL_MS: numberFromEnv(30_000),
  BOT_CANCEL_TIME_MS: numberFromEnv(10 * 60_000),
  BOT_LOGIN_TIMEOUT_MS: numberFromEnv(90_000),
  BOT_MAX_LOGIN_RETRIES: numberFromEnv(3),
  BOT_LOGIN_RETRY_DELAY_MS: numberFromEnv(30_000),
  BOT_MAX_LOGIN_ATTEMPTS_WITHIN_PERIOD: numberFromEnv(3),
  BOT_LOGIN_ATTEMPT_PERIOD_MS: numberFromEnv(60_000),
  BOT_OFFER_REQUEST_TTL_MS: numberFromEnv(5 * 60_000),
  BOT_OFFER_MAX_RETRIES: numberFromEnv(4),
  BOT_OFFER_RETRY_BASE_DELAY_MS: numberFromEnv(5_000),
  BOT_OFFER_RETRY_MAX_DELAY_MS: numberFromEnv(30_000),
  BOT_TOKEN_REFRESH_INTERVAL_MS: numberFromEnv(5 * 60_000),
  BOT_TOKEN_REFRESH_SKEW_MS: numberFromEnv(2 * 60_000),
  BOT_ACCESS_TOKEN_REFRESH_SKEW_MS: numberFromEnv(4 * 60 * 60_000),
  BOT_REFRESH_TOKEN_RENEWAL_WINDOW_MS: numberFromEnv(7 * 24 * 60 * 60_000)
});



const queueEnvSchema = z.object({
  BOT_QUEUE_ENABLED: optionalBooleanFromEnv(),
  BOT_INCOMING_TRADE_QUEUE_NAME: optionalTrimmedString(),
  BOT_TRADE_STATUS_QUEUE_NAME: optionalTrimmedString(),
  AZURE_CONNECTION_STRING: optionalTrimmedString(),
  AZURE_QUEUE_ACCOUNT_NAME: optionalTrimmedString(),
  AZURE_STORAGE_ACCOUNT_NAME: optionalTrimmedString(),
  BOT_QUEUE_CREATE_IF_NOT_EXISTS: booleanFromEnv(false),
  BOT_QUEUE_VISIBILITY_TIMEOUT_SECONDS: numberFromEnv(60),
  BOT_QUEUE_MAX_MESSAGES: numberFromEnv(1),
  BOT_QUEUE_MAX_DEQUEUE_COUNT: numberFromEnv(5)
});

export type BotRuntimeConfig = z.infer<typeof envSchema>;
export type BotQueueRuntimeConfig = z.infer<typeof queueEnvSchema>;

export function loadBotConfigFromEnv(env: NodeJS.ProcessEnv = process.env): BotRuntimeConfig {
  return envSchema.parse(env);
}

export function loadBotOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): BotOptions {
  const config = loadBotConfigFromEnv(env);

  return {
    accountName: config.STEAM_ACCOUNT_NAME,
    password: config.STEAM_PASSWORD,
    sharedSecret: config.STEAM_SHARED_SECRET,
    identitySecret: config.STEAM_IDENTITY_SECRET,
    steamGuardCode: config.STEAM_GUARD_CODE,
    domain: config.STEAM_API_DOMAIN,
    inventoryPollIntervalMs: config.BOT_INVENTORY_POLL_INTERVAL_MS,
    pollIntervalMs: config.BOT_POLL_INTERVAL_MS,
    cancelTimeMs: config.BOT_CANCEL_TIME_MS,
    loginTimeoutMs: config.BOT_LOGIN_TIMEOUT_MS,
    maxLoginRetries: config.BOT_MAX_LOGIN_RETRIES,
    loginRetryDelayMs: config.BOT_LOGIN_RETRY_DELAY_MS,
    maxLoginAttemptsWithinPeriod: config.BOT_MAX_LOGIN_ATTEMPTS_WITHIN_PERIOD,
    loginAttemptPeriodMs: config.BOT_LOGIN_ATTEMPT_PERIOD_MS,
    offerRequestTtlMs: config.BOT_OFFER_REQUEST_TTL_MS,
    offerMaxRetries: config.BOT_OFFER_MAX_RETRIES,
    offerRetryBaseDelayMs: config.BOT_OFFER_RETRY_BASE_DELAY_MS,
    offerRetryMaxDelayMs: config.BOT_OFFER_RETRY_MAX_DELAY_MS,
    tokenRefreshIntervalMs: config.BOT_TOKEN_REFRESH_INTERVAL_MS,
    tokenRefreshSkewMs: config.BOT_TOKEN_REFRESH_SKEW_MS,
    accessTokenRefreshSkewMs: config.BOT_ACCESS_TOKEN_REFRESH_SKEW_MS,
    refreshTokenRenewalWindowMs: config.BOT_REFRESH_TOKEN_RENEWAL_WINDOW_MS,
    tokenPlatform: config.STEAM_TOKEN_PLATFORM as SteamTokenPlatform
  };
}

export function loadTaskControllerOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): TaskControllerOptions | null {
  const config = queueEnvSchema.parse(env);
  const enabled = config.BOT_QUEUE_ENABLED ?? Boolean(
    config.BOT_INCOMING_TRADE_QUEUE_NAME && config.BOT_TRADE_STATUS_QUEUE_NAME
  );

  if (!enabled) {
    return null;
  }

  if (!config.BOT_INCOMING_TRADE_QUEUE_NAME || !config.BOT_TRADE_STATUS_QUEUE_NAME) {
    throw new Error(
      "BOT_INCOMING_TRADE_QUEUE_NAME and BOT_TRADE_STATUS_QUEUE_NAME are required when BOT_QUEUE_ENABLED is true."
    );
  }

  const baseQueueConfig = createAzureQueueConfig(config);

  return {
    incomingQueue: {
      ...baseQueueConfig,
      queueName: config.BOT_INCOMING_TRADE_QUEUE_NAME
    },
    statusQueue: {
      ...baseQueueConfig,
      queueName: config.BOT_TRADE_STATUS_QUEUE_NAME
    },
    visibilityTimeoutSeconds: config.BOT_QUEUE_VISIBILITY_TIMEOUT_SECONDS,
    maxMessages: config.BOT_QUEUE_MAX_MESSAGES,
    maxDequeueCount: config.BOT_QUEUE_MAX_DEQUEUE_COUNT
  };
}

function createAzureQueueConfig(config: BotQueueRuntimeConfig): Omit<AzureQueueConfig, "queueName"> {
  const storageAccountName = config.AZURE_QUEUE_ACCOUNT_NAME ?? config.AZURE_STORAGE_ACCOUNT_NAME;
  if (!config.AZURE_CONNECTION_STRING && !storageAccountName) {
    throw new Error(
      "Azure queue config requires AZURE_CONNECTION_STRING, AZURE_QUEUE_ACCOUNT_NAME, or AZURE_STORAGE_ACCOUNT_NAME."
    );
  }

  return {
    connectionString: config.AZURE_CONNECTION_STRING,
    storageAccountName,
    createIfNotExists: config.BOT_QUEUE_CREATE_IF_NOT_EXISTS
  };
}
