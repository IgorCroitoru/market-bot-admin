import "dotenv/config";
import { Bot } from "./Bot";
import { loadBotOptionsFromEnv, loadTaskControllerOptionsFromEnv } from "./config";
import { createBotStorageFromEnv } from "./storage";
import { logger } from "./logger";
import { TaskController } from "./TaskController";
import { AzureStorageQueue, InMemoryStorageQueue } from "@market-bot-admin/queue";
import type {
  IncomingTradeTaskMessage,
  TradeStatusQueueMessage
} from "@market-bot-admin/shared";

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
export {
  TaskController,
  type IncomingTradeTaskMessage,
  type TaskControllerDependencies,
  type TaskControllerOptions,
  type TradeStatusQueueMessage
} from "./TaskController";
export { isRetriableError, withRetries } from "./retry";
export { LocalBotStorage, AzureBlobStorage, createBotStorageFromEnv } from "./storage";
export type { BotOptions, SteamTokenPlatform } from "./IOptions";
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
  const incomingQueue = taskControllerOptions?.queueDriver === "inmemory"
    ? new InMemoryStorageQueue<IncomingTradeTaskMessage>(
        taskControllerOptions.incomingQueueName
      )
    : taskControllerOptions?.incomingQueue
      ? new AzureStorageQueue<IncomingTradeTaskMessage>(
          taskControllerOptions.incomingQueue
        )
      : null;
  const statusQueue = taskControllerOptions?.queueDriver === "inmemory"
    ? new InMemoryStorageQueue<TradeStatusQueueMessage>(
        taskControllerOptions.statusQueueName
      )
    : taskControllerOptions?.statusQueue
      ? new AzureStorageQueue<TradeStatusQueueMessage>(
          taskControllerOptions.statusQueue
        )
      : null;
  const taskController = taskControllerOptions
    ? new TaskController(
        bot,
        {
          logger,
          visibilityTimeoutSeconds: taskControllerOptions.visibilityTimeoutSeconds,
          maxMessages: taskControllerOptions.maxMessages,
          maxDequeueCount: taskControllerOptions.maxDequeueCount
        },
        {
          incomingQueue: incomingQueue!,
          statusQueue: statusQueue!
        }
      )
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
        incomingQueue: taskControllerOptions?.incomingQueueName,
        statusQueue: taskControllerOptions?.statusQueueName,
        queueDriver: taskControllerOptions?.queueDriver
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
