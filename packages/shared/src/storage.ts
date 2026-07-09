import CEconItem from "steamcommunity/classes/CEconItem";

export type TokenCache = {
  accessToken: string | null;
  refreshToken: string | null;
  sessionCookies: string[] | null;
  accessTokenExpiry?: number;
  refreshTokenExpiry?: number;
  updatedAt: number;
}

export interface BotInventorySnapshot {
  fetchedAt: number;
  inventory: CEconItem[];
}

export type BotStorageItems = {
  "token-cache": TokenCache;
  "inventory-snapshot": BotInventorySnapshot;
  "poll-data": PollData;
  "login-attempts": number[]
}

export interface OfferData {
  dealId?: number;
  partnerId?: string;
  errorLogs?: string;
  trade_offer_expiry_at?: number;
  trade_offer_created_at?: number;
  trade_offer_finished_at?: number;
}

export interface PollData {
  sent?: Record<string, number>;
  received?: Record<string, number>;
  timestamps?: Record<string, number>;
  offersSince?: number;
  offerData?: Record<string, OfferData>;
  [key: string]: unknown;
}