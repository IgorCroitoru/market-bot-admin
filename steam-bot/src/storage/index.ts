import { AzureBotStorage } from "./AzureBotStorage";
import { LocalBotStorage } from "./LocalBotStorage";
import type { BotStorage } from "../Persistence";

export type StorageDriver = "local" | "azure";

export interface CreateStorageOptions {
  accountName: string;
  env?: NodeJS.ProcessEnv;
}

export function createBotStorageFromEnv(options: CreateStorageOptions): BotStorage {
  const env = options.env ?? process.env;
  const driver = (env.BOT_STORAGE_DRIVER ?? (env.BOT_ENV === "prod" ? "azure" : "local")) as StorageDriver;

  if (driver === "azure") {
    return new AzureBotStorage({
      accountName: options.accountName,
      containerName: env.AZURE_BOT_CONTAINER_NAME,
      storageAccountName: env.AZURE_STORAGE_ACCOUNT_NAME,
    });
  }

  return new LocalBotStorage({
    accountName: options.accountName,
    rootDir: env.BOT_LOCAL_DATA_DIR
  });
}

export { AzureBotStorage, LocalBotStorage };

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
