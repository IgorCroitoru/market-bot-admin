import dotenv from "dotenv";
import { Bot } from "./Bot";
import { loadBotOptionsFromEnv } from "./config";
import { createBotStorageFromEnv } from "./storage";

dotenv.config();

export { Bot, type BotStatus, type SendTradeOfferRequest, type SentTradeOffer, type TradeItem } from "./Bot";
export { loadBotConfigFromEnv, loadBotOptionsFromEnv, type BotRuntimeConfig } from "./config";
export { isRetriableError, withRetries } from "./retry";
export { LocalBotStorage, AzureBotStorage, createBotStorageFromEnv } from "./storage";
export type { BotOptions, SteamTokenPlatform } from "./IOptions";
export type { BotStorage, BotPersistence } from "./Persistence";
export type { PollData, OfferData } from "./PollData";

async function main(): Promise<void> {
  const options = loadBotOptionsFromEnv();
  const bot = new Bot({
    ...options,
    storage: createBotStorageFromEnv({
      accountName: options.accountName
    })
  });

  const shutdown = async (): Promise<void> => {
    await bot.stop();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });

  await bot.start();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
