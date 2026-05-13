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
}