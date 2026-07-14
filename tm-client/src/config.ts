import { z, numberFromEnv, booleanFromEnv, optionalTrimmedString } from "@market-bot-admin/config"
import { ApiVersion, ClientOptions } from "./types";
import { AzureQueueConfig } from "@market-bot-admin/queue";
import { AzureBotStorageOptions, AzureTableJsonStorageOptions } from "@market-bot-admin/storage";

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
  MARKET_TRADE_POLL_INTERVAL_MS: numberFromEnv(15000),
  MARKET_TRADE_OFFER_TTL_MS: numberFromEnv(5 * 60_000),
  MARKET_ITEMS_POLL_INTERVAL_MS: numberFromEnv(5 * 60_000),
});

const azureQueueConfigSchema = z.object({
  AZURE_CONNECTION_STRING: optionalTrimmedString(),
  AZURE_QUEUE_ACCOUNT_NAME: optionalTrimmedString(),
  AZURE_STORAGE_ACCOUNT_NAME: optionalTrimmedString(),
  AZURE_QUEUE_CREATE_IF_NOT_EXISTS: booleanFromEnv(false),
  BOT_INCOMING_TRADE_QUEUE_NAME: optionalTrimmedString(),
  BOT_TRADE_STATUS_QUEUE_NAME: optionalTrimmedString(),
  PLATFORM_TRADE_READY_QUEUE_NAME: optionalTrimmedString(),
  BOT_QUEUE_VISIBILITY_TIMEOUT_SECONDS: numberFromEnv(60),
  BOT_QUEUE_MAX_MESSAGES: numberFromEnv(4),
  BOT_QUEUE_MAX_DEQUEUE_COUNT: numberFromEnv(5),
});

const azureBlobStorageConfigSchema = z.object({
  ACCOUNT_NAME: z.string(),
  AZURE_CONNECTION_STRING: optionalTrimmedString(),
  AZURE_STORAGE_ACCOUNT_NAME: optionalTrimmedString(),
  AZURE_BLOB_CONTAINER_NAME: z.string()
});

const azureTableStorageConfigSchema = z
  .object({
    AZURE_STORAGE_ACCOUNT_NAME: optionalTrimmedString(),
    AZURE_CONNECTION_STRING: optionalTrimmedString(),
    AZURE_TRADE_TABLE_NAME: z.string().min(1),
    AZURE_MARKET_ITEMS_TABLE_NAME: z.string().min(1).default("MarketItems"),
    AZURE_TABLE_PARTITION_KEY: z.string().min(1).optional(),
    AZURE_TABLE_CREATE_IF_NOT_EXISTS: booleanFromEnv(false),
  })
  .transform((config) => ({
    ...config,
    AZURE_TABLE_PARTITION_KEY:
      config.AZURE_TABLE_PARTITION_KEY ?? String(process.env.ACCOUNT_NAME),
  }));

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
  if (!config.AZURE_CONNECTION_STRING && !config.AZURE_STORAGE_ACCOUNT_NAME) {
    throw new Error(
      "Azure blob storage config requires AZURE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME."
    );
  }

  return {
    accountName: config.ACCOUNT_NAME,
    containerName: config.AZURE_BLOB_CONTAINER_NAME,
    connectionString: config.AZURE_CONNECTION_STRING,
    storageAccountName: config.AZURE_STORAGE_ACCOUNT_NAME
   }
  }

export function loadAzureTradeQueueOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): AzureQueueConfig {
  const config = loadAzureQueueZodConfigFromEnv(env);
  return createAzureQueueOptions(config, config.BOT_INCOMING_TRADE_QUEUE_NAME);
}

export function loadAzureStatusQueueOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): AzureQueueConfig {
  const config = loadAzureQueueZodConfigFromEnv(env);
  return createAzureQueueOptions(config, config.BOT_TRADE_STATUS_QUEUE_NAME);
}

export function loadAzurePlatformTradeReadyQueueOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): AzureQueueConfig {
  const config = loadAzureQueueZodConfigFromEnv(env);
  return createAzureQueueOptions(config, config.PLATFORM_TRADE_READY_QUEUE_NAME);
}

export function loadAzureQueueConsumerOptionsFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const config = loadAzureQueueZodConfigFromEnv(env);

  return {
    visibilityTimeoutSeconds: config.BOT_QUEUE_VISIBILITY_TIMEOUT_SECONDS,
    maxMessages: config.BOT_QUEUE_MAX_MESSAGES,
    maxDequeueCount: config.BOT_QUEUE_MAX_DEQUEUE_COUNT,
  };
}

function createAzureQueueOptions(
  config: AzureQueueZodConfig,
  queueName: string | undefined
): AzureQueueConfig {
  const storageAccountName = config.AZURE_QUEUE_ACCOUNT_NAME ?? config.AZURE_STORAGE_ACCOUNT_NAME;

  if (!queueName) {
    throw new Error(
      "A queue name is required. Set BOT_INCOMING_TRADE_QUEUE_NAME, BOT_TRADE_STATUS_QUEUE_NAME, or PLATFORM_TRADE_READY_QUEUE_NAME."
    );
  }

  if (!config.AZURE_CONNECTION_STRING && !storageAccountName) {
    throw new Error(
      "Azure queue config requires AZURE_CONNECTION_STRING, AZURE_QUEUE_ACCOUNT_NAME, or AZURE_STORAGE_ACCOUNT_NAME."
    );
  }

  return {
    queueName,
    connectionString: config.AZURE_CONNECTION_STRING,
    storageAccountName,
    createIfNotExists: config.AZURE_QUEUE_CREATE_IF_NOT_EXISTS,
  }
}

export function loadAzureTableStorageOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): AzureTableJsonStorageOptions {
  const config = loadAzureTableStorageConfigFromEnv(env);
  return createAzureTableStorageOptions(config, config.AZURE_TRADE_TABLE_NAME);
}

export function loadAzureMarketItemsTableStorageOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): AzureTableJsonStorageOptions {
  const config = loadAzureTableStorageConfigFromEnv(env);
  return createAzureTableStorageOptions(config, config.AZURE_MARKET_ITEMS_TABLE_NAME);
}

function createAzureTableStorageOptions(
  config: AzureTableStorageZodConfig,
  tableName: string
): AzureTableJsonStorageOptions {
  if (!config.AZURE_CONNECTION_STRING && !config.AZURE_STORAGE_ACCOUNT_NAME) {
    throw new Error(
      "Azure table storage config requires AZURE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME."
    );
  }

  return {
    tableName,
    partitionKey: config.AZURE_TABLE_PARTITION_KEY,
    connectionString: config.AZURE_CONNECTION_STRING,
    storageAccountName: config.AZURE_STORAGE_ACCOUNT_NAME,
    createTableIfNotExists: config.AZURE_TABLE_CREATE_IF_NOT_EXISTS
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
    marketTradePollIntervalMs: config.MARKET_TRADE_POLL_INTERVAL_MS,
    marketTradeOfferTtlMs: config.MARKET_TRADE_OFFER_TTL_MS,
    marketItemsPollIntervalMs: config.MARKET_ITEMS_POLL_INTERVAL_MS,
    requestTimeoutMs: config.REQUEST_TIMEOUT_MS,
  }
}
