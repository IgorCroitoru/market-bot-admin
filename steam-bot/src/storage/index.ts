import { AzureBlobStorage, type KeyValueStore } from "@market-bot-admin/storage";
import type { BotStorageItems } from "@market-bot-admin/shared";
import { LocalBotStorage } from "./LocalBotStorage";

export type StorageDriver = "local" | "azure";

export interface CreateStorageOptions {
  accountName: string;
  env?: NodeJS.ProcessEnv;
}

export function createBotStorageFromEnv(options: CreateStorageOptions): KeyValueStore<BotStorageItems> {
  const env = options.env ?? process.env;
  const driver = (env.BOT_STORAGE_DRIVER ?? "azure") as StorageDriver;

  if (driver === "azure") {
    const connectionString = env.AZURE_CONNECTION_STRING;
    const storageAccountName = env.AZURE_STORAGE_ACCOUNT_NAME;
    if (!connectionString && !storageAccountName) {
      throw new Error("Azure blob storage requires AZURE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME.");
    }

    return new AzureBlobStorage<BotStorageItems>({
      accountName: options.accountName,
      containerName: env.AZURE_BOT_CONTAINER_NAME ?? "steam-bot",
      connectionString,
      storageAccountName,
    });
  }

  return new LocalBotStorage({
    accountName: options.accountName,
    rootDir: env.BOT_LOCAL_DATA_DIR
  });
}

export { AzureBlobStorage, LocalBotStorage };
