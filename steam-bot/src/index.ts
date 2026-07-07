import "dotenv/config";
import { Bot } from "./Bot";
import { loadBotOptionsFromEnv, loadTaskControllerOptionsFromEnv } from "./config";
import { createBotStorageFromEnv } from "./storage";
import { logger } from "./logger";
import { TaskController } from "./TaskController";

export {
  Bot,
  type BotHealthError,
  type BotInventorySnapshot,
  type BotHealthSnapshot,
  type BotStatus,
  type SendTradeOfferRequest,
  type SentTradeOffer,
  type TradeItem
} from "./Bot";
export { loadBotConfigFromEnv, loadBotOptionsFromEnv, type BotRuntimeConfig } from "./config";
export { TaskController, type IncomingTradeTaskMessage, type TradeStatusQueueMessage } from "./TaskController";
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
  const taskControllerOptions = loadTaskControllerOptionsFromEnv();
  const taskController = taskControllerOptions
    ? new TaskController(bot, {
        ...taskControllerOptions,
        logger
      })
    : null;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    try {
      logger.warn({ signal }, "Shutdown signal received");

      await taskController?.stop();
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
  if (taskController) {
    taskController.start();
    logger.info(
      {
        incomingQueue: taskControllerOptions?.incomingQueue.queueName,
        statusQueue: taskControllerOptions?.statusQueue.queueName
      },
      "Steam bot task controller started"
    );
  } else {
    logger.info("Steam bot task controller disabled");
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
