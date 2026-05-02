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
  pollIntervalMs?: number;
  cancelTimeMs?: number;
  loginTimeoutMs?: number;
  maxLoginRetries?: number;
  loginRetryDelayMs?: number;
  maxLoginAttemptsWithinPeriod?: number;
  loginAttemptPeriodMs?: number;
  tokenRefreshIntervalMs?: number;
  tokenRefreshSkewMs?: number;
  refreshTokenRenewalWindowMs?: number;
  tokenPlatform?: SteamTokenPlatform;
  storage?: BotStorage;
  logger?: AppLogger;
}

export default BotOptions;
