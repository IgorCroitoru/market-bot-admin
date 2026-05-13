import { z, numberFromEnv, booleanFromEnv } from "@market-bot-admin/config"
import { ApiVersion, ClientOptions } from "./types";
import { AzureQueueConfig } from "../../packages/queue/dist/AzureStorageQueue";

const envSchema = z.object({
  NODE_ENV: z.enum(["dev", "prod", "test"]).default("dev"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  BASE_URL: z.string().default('https://market.csgo.com/api'),
  VERSION: z.enum(ApiVersion).default(ApiVersion.V2),
  API_KEY: z.string(),
  REQUEST_TIMEOUT_MS: numberFromEnv(30000),
  MAX_RETRIES: numberFromEnv(3),
  RETRY_DELAY_MS: numberFromEnv(1000),
  RETRY_BACKOFF_MULTIPLIER: numberFromEnv(2),
  MAX_BACKOFF_MS: numberFromEnv(10000),
  REQUESTS_PER_SECOND: numberFromEnv(5),
  PING_INTERVAL_MS: numberFromEnv(180000), // 3 minutes
});

const azureQueueConfigSchema = z.object({
  AZURE_QUEUE_CONNECTION_STRING: z.string().optional(),
  AZURE_QUEUE_ACCOUNT_NAME: z.string().optional(),
  AZURE_QUEUE_CREATE_IF_NOT_EXISTS: booleanFromEnv(false),
  AZURE_QUEUE_NAME: z.string()
});

export type ApiRuntimeZodConfig = z.infer<typeof envSchema>;
export type AzureQueueZodConfig = z.infer<typeof azureQueueConfigSchema>;

export function loadApiZodConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ApiRuntimeZodConfig {
  return envSchema.parse(env);
}

export function loadAzureQueueZodConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AzureQueueZodConfig {
  return azureQueueConfigSchema.parse(env);
}

export function loadAzureQueueConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AzureQueueConfig {
  const config = loadAzureQueueZodConfigFromEnv(env);
  return {
    queueName: config.AZURE_QUEUE_NAME,
    accountName: config.AZURE_QUEUE_ACCOUNT_NAME,
    createIfNotExists: config.AZURE_QUEUE_CREATE_IF_NOT_EXISTS,
  }
}

export function loadApiOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): ClientOptions {
  const config = loadApiZodConfigFromEnv(env);

  return {
    apiKey: config.API_KEY,
    baseUrl: config.BASE_URL,
    version: config.VERSION,
    maxRetries: config.MAX_RETRIES,
    retryDelayMs: config.RETRY_DELAY_MS,
    requestsPerSecond: config.REQUESTS_PER_SECOND,
    retryBackoffMultiplier: config.RETRY_BACKOFF_MULTIPLIER,
    maxBackoffMs: config.MAX_BACKOFF_MS,
    pingIntervalMs: config.PING_INTERVAL_MS,
    requestTimeoutMs: config.REQUEST_TIMEOUT_MS,
  }
}