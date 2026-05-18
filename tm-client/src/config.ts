import { z, numberFromEnv, booleanFromEnv } from "@market-bot-admin/config"
import { ApiVersion, ClientOptions } from "./types";
import { AzureQueueConfig } from "../../packages/queue/dist/AzureStorageQueue";
import { AzureBotStorageOptions } from "../../packages/storage/dist/AzureBlobStorage";
import { AzureTableJsonStorageOptions } from "../../packages/storage/dist/AzureTableStorage";

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

const azureBlobStorageConfigSchema = z.object({
  ACCOUNT_NAME: z.string(),
  AZURE_STORAGE_ACCOUNT_NAME: z.string(),
  AZURE_BLOB_CONTAINER_NAME: z.string()
});

const azureTableStorageConfigSchema = z.object({
  AZURE_STORAGE_ACCOUNT_NAME: z.string().optional(),
  AZURE_TABLE_NAME: z.string(),
  AZURE_TABLE_PARTITION_KEY: z.string()
});

export type ApiRuntimeZodConfig = z.infer<typeof envSchema>;
export type AzureQueueZodConfig = z.infer<typeof azureQueueConfigSchema>;
export type AzureBlobStorageZodConfig = z.infer<typeof azureBlobStorageConfigSchema>;
export type AzureTableStorageZodConfig = z.infer<typeof azureTableStorageConfigSchema>;

export function loadApiZodConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ApiRuntimeZodConfig {
  return envSchema.parse(env);
}

export function loadAzureQueueZodConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AzureQueueZodConfig {
  return azureQueueConfigSchema.parse(env);
}

export function loadAzureBlobStorageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AzureBlobStorageZodConfig {
  return azureBlobStorageConfigSchema.parse(env);
}

export function loadAzureTableStorageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AzureTableStorageZodConfig {
  return azureTableStorageConfigSchema.parse(env);
}

export function loadAzureBlobStorageOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): AzureBotStorageOptions {
  const config = loadAzureBlobStorageConfigFromEnv(env);
  return {
    accountName: config.ACCOUNT_NAME,
    containerName: config.AZURE_BLOB_CONTAINER_NAME,
    storageAccountName: config.AZURE_STORAGE_ACCOUNT_NAME
   }
  }

export function loadAzureQueueOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): AzureQueueConfig {
  const config = loadAzureQueueZodConfigFromEnv(env);
  return {
    queueName: config.AZURE_QUEUE_NAME,
    storageAccountName: config.AZURE_QUEUE_ACCOUNT_NAME,
    createIfNotExists: config.AZURE_QUEUE_CREATE_IF_NOT_EXISTS,
  }
}

export function loadAzureTableStorageOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): AzureTableJsonStorageOptions {
  const config = loadAzureTableStorageConfigFromEnv(env);
  return {
    tableName: config.AZURE_TABLE_NAME,
    partitionKey: config.AZURE_TABLE_PARTITION_KEY,
    storageAccountName: config.AZURE_STORAGE_ACCOUNT_NAME
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