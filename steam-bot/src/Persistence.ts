import type { PollData } from "./PollData";
import { TokenCache } from "./storage/AzureBotStorage";

export interface BotPersistence {
  savePollData(pollData: PollData): Promise<void>;
  loadPollData(): Promise<PollData | null>;

  saveData<T>(key: string, data: T): Promise<void>;
  loadData<T>(key: string): Promise<T | null>;

  saveTokenCache(tokenCache: TokenCache): Promise<void>;
  loadTokenCache(): Promise<TokenCache | null>;
  // saveRefreshToken(token: string): Promise<void>;
  // loadRefreshToken(): Promise<string | null>;
  // deleteRefreshToken(): Promise<void>;

  // saveAccessToken(token: string): Promise<void>;
  // loadAccessToken(): Promise<string | null>;
  // deleteAccessToken(): Promise<void>;

  // saveCookies(cookies: string[]): Promise<void>;
  // loadCookies(): Promise<string[] | null>;

  saveLoginAttempts(attempts: number[]): Promise<void>;
  loadLoginAttempts(): Promise<number[] | null>;
}

export type BotStorage = BotPersistence;
