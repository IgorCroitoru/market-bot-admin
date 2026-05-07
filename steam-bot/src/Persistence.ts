import { BotInventorySnapshot } from "./Bot";
import type { PollData } from "./PollData";
import { TokenCache } from "./storage/AzureBotStorage";

export interface BotPersistence {
  savePollData(pollData: PollData): Promise<void>;
  loadPollData(): Promise<PollData | null>;

  saveData<T>(key: string, data: T): Promise<void>;
  loadData<T>(key: string): Promise<T | null>;

  saveTokenCache(tokenCache: TokenCache): Promise<void>;
  loadTokenCache(): Promise<TokenCache | null>;

  saveInventorySnapshot(snapshot: BotInventorySnapshot): Promise<void>;
  loadInventorySnapshot(): Promise<BotInventorySnapshot | null>;

  saveLoginAttempts(attempts: number[]): Promise<void>;
  loadLoginAttempts(): Promise<number[] | null>;
}

export type BotStorage = BotPersistence;
