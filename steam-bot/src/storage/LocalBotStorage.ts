import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BotStorageItems } from "@market-bot-admin/shared";
import type { KeyValueStore } from "@market-bot-admin/storage";

export interface LocalBotStorageOptions {
  accountName: string;
  rootDir?: string;
}

export class LocalBotStorage implements KeyValueStore<BotStorageItems> {
  private readonly dataDir: string;

  constructor(options: LocalBotStorageOptions) {
    const rootDir = options.rootDir ?? path.join(process.cwd(), ".steam-bot-data");
    const accountDir = sanitizePathPart(options.accountName);

    this.dataDir = path.join(rootDir, accountDir, "data");
  }

  async delete(key: string): Promise<void> {
    try {
      await rm(this.dataPath(key));
    } catch (error) {
      if (isMissingFile(error)) return;
      throw error;
    }
  }

  async set<TKey extends Extract<keyof BotStorageItems, string>>(
    key: TKey,
    data: BotStorageItems[TKey]
  ): Promise<void> {
    await this.setUnknown(key, data);
  }

  async setUnknown<TValue = unknown>(key: string, value: TValue): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.dataPath(key), JSON.stringify(value, null, 2), "utf8");
  }
  async get<TKey extends Extract<keyof BotStorageItems, string>>(
    key: TKey
  ): Promise<BotStorageItems[TKey] | null> {
    return this.getUnknown<BotStorageItems[TKey]>(key);
  }

  async getUnknown<TValue = unknown>(key: string): Promise<TValue | null> {
     try {
      const content = await readFile(this.dataPath(key), "utf8");
      return JSON.parse(content) as TValue;
    } catch (error) {
      if (isMissingFile(error)) {
        return null;
      }

      throw error;
    }
  }

  private dataPath(key: string): string {
    return path.join(this.dataDir, `${sanitizePathPart(key)}.json`);
  }
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^a-z0-9._-]/gi, "_");
}

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}
