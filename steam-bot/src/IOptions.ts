import type { AppLogger } from "@market-bot-admin/logging";
import type { BotStorageItems } from "@market-bot-admin/shared";
import type { KeyValueStore } from "@market-bot-admin/storage";

export type SteamTokenPlatform = "mobile" | "web" | "client";

export interface BotOptions {
  accountName: string;
  password?: string;
  sharedSecret?: string;
  identitySecret?: string;
  steamGuardCode?: string;
  domain?: string;
  language?: string;
  inventoryPollIntervalMs?: number;
  pollIntervalMs?: number;
  cancelTimeMs?: number;
  loginTimeoutMs?: number;
  maxLoginRetries?: number;
  loginRetryDelayMs?: number;
  maxLoginAttemptsWithinPeriod?: number;
  loginAttemptPeriodMs?: number;
  steamGuardTokenSubmitDelayMs?: number;
  steamGuardTokenSubmitAttempts?: number;
  offerRequestTtlMs?: number;
  offerMaxRetries?: number;
  offerRetryBaseDelayMs?: number;
  offerRetryMaxDelayMs?: number;
  tokenRefreshIntervalMs?: number;
  tokenRefreshSkewMs?: number;
  accessTokenRefreshSkewMs?: number;
  refreshTokenRenewalWindowMs?: number;
  tokenPlatform?: SteamTokenPlatform;
  storage?: KeyValueStore<BotStorageItems>;
  logger?: AppLogger;
}

export default BotOptions;
