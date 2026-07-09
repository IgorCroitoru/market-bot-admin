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
  const driver = (env.BOT_STORAGE_DRIVER ?? (env.BOT_ENV === "prod" ? "azure" : "local")) as StorageDriver;

  if (driver === "azure") {
    return new AzureBlobStorage<BotStorageItems>({
      accountName: options.accountName,
      containerName: env.AZURE_BOT_CONTAINER_NAME ?? "steam-bot",
      storageAccountName: required(env.AZURE_STORAGE_ACCOUNT_NAME, "AZURE_STORAGE_ACCOUNT_NAME"),
    });
  }

  return new LocalBotStorage({
    accountName: options.accountName,
    rootDir: env.BOT_LOCAL_DATA_DIR
  });
}

export { AzureBlobStorage, LocalBotStorage };

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
