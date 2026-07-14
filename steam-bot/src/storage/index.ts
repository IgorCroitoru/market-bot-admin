import { AzureBlobStorage, type KeyValueStore } from "@market-bot-admin/storage";
import type { BotStorageItems } from "@market-bot-admin/shared";
import { loadBotStorageConfigFromEnv } from "../config";
import { LocalBotStorage } from "./LocalBotStorage";

export type StorageDriver = "local" | "azure";

export interface CreateStorageOptions {
  accountName: string;
  env?: NodeJS.ProcessEnv;
}

export function createBotStorageFromEnv(options: CreateStorageOptions): KeyValueStore<BotStorageItems> {
  const config = loadBotStorageConfigFromEnv(options.env);

  if (config.BOT_STORAGE_DRIVER === "azure") {
    const connectionString = config.AZURE_CONNECTION_STRING;
    const storageAccountName = config.AZURE_STORAGE_ACCOUNT_NAME;
    if (!connectionString && !storageAccountName) {
      throw new Error("Azure blob storage requires AZURE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME.");
    }

    return new AzureBlobStorage<BotStorageItems>({
      accountName: options.accountName,
      containerName: config.AZURE_BOT_CONTAINER_NAME,
      connectionString,
      storageAccountName,
    });
  }

  return new LocalBotStorage({
    accountName: options.accountName,
    rootDir: config.BOT_LOCAL_DATA_DIR
  });
}

export { AzureBlobStorage, LocalBotStorage };
