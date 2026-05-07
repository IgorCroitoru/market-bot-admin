import type { AppLogger } from "@market-bot-admin/logging";
import type { BotStorage } from "./Persistence";

export type SteamTokenPlatform = "mobile" | "web" | "client";

export interface BotOptions {
  accountName: string;
  password?: string;
  sharedSecret?: string;
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
  storage?: BotStorage;
  logger?: AppLogger;
}

export default BotOptions;
