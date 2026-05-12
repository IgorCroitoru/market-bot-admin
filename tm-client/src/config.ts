import { z, numberFromEnv } from "@market-bot-admin/config"
import { ApiVersion, ClientOptions } from "./types";

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

export type ApiRuntimeConfig = z.infer<typeof envSchema>;

export function loadApiConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ApiRuntimeConfig {
  return envSchema.parse(env);
}

export function loadApiOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): ClientOptions {
  const config = loadApiConfigFromEnv(env);

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