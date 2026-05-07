import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BotStorage } from "../Persistence";
import type { PollData } from "../PollData";
import { TokenCache } from "./AzureBotStorage";
import { BotInventorySnapshot } from "../Bot";

export interface LocalBotStorageOptions {
  accountName: string;
  rootDir?: string;
}

export class LocalBotStorage implements BotStorage {
  private readonly dataDir: string;
  private readonly secretsDir: string;

  constructor(options: LocalBotStorageOptions) {
    const rootDir = options.rootDir ?? path.join(process.cwd(), ".steam-bot-data");
    const accountDir = sanitizePathPart(options.accountName);

    this.dataDir = path.join(rootDir, accountDir, "data");
    this.secretsDir = path.join(rootDir, accountDir, "secrets");
  }
  async saveInventorySnapshot(snapshot: BotInventorySnapshot): Promise<void> {
    await this.saveData("inventory-snapshot", snapshot);

  }
  async loadInventorySnapshot(): Promise<BotInventorySnapshot | null> {
    return this.loadData<BotInventorySnapshot>("inventory-snapshot");
  }
  async saveTokenCache(tokenCache: TokenCache): Promise<void> {
    await this.saveData("token-cache", tokenCache);
  }
  async loadTokenCache(): Promise<TokenCache | null> {
    return this.loadData<TokenCache>("token-cache");
  }

  async savePollData(pollData: PollData): Promise<void> {
    await this.saveData("poll-data", pollData);
  }

  async loadPollData(): Promise<PollData | null> {
    return this.loadData<PollData>("poll-data");
  }

  async saveData<T>(key: string, data: T): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.dataPath(key), JSON.stringify(data, null, 2), "utf8");
  }

  async loadData<T>(key: string): Promise<T | null> {
    try {
      const content = await readFile(this.dataPath(key), "utf8");
      return JSON.parse(content) as T;
    } catch (error) {
      if (isMissingFile(error)) {
        return null;
      }

      throw error;
    }
  }

  async saveLoginAttempts(attempts: number[]): Promise<void> {
    await this.saveData("login-attempts", attempts);
  }

  async loadLoginAttempts(): Promise<number[] | null> {
    return this.loadData<number[]>("login-attempts");
  }


  private dataPath(key: string): string {
    return path.join(this.dataDir, `${sanitizePathPart(key)}.json`);
  }

  private secretPath(key: string): string {
    return path.join(this.secretsDir, `${sanitizePathPart(key)}.txt`);
  }
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^a-z0-9._-]/gi, "_");
}

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}
