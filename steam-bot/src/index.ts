import dotenv from "dotenv";
import { Bot } from "./Bot";
import { loadBotOptionsFromEnv } from "./config";
import { createBotStorageFromEnv } from "./storage";
import { logger } from "./logger";

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

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    try {
      logger.warn({ signal }, "Shutdown signal received");

      await bot.stop();

      process.exitCode = 0;
    } catch (err) {
      logger.error({ err }, "Shutdown failed");

      process.exitCode = 1;
    }
   };

    process.once("SIGINT", () => {
      void shutdown("SIGINT");
    });

    process.once("SIGTERM", () => {
      void shutdown("SIGTERM");
    });

  await bot.start();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
