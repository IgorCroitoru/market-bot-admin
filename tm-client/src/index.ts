import "dotenv/config";
export { MarketClient } from './MarketClient';
export * from './types';
import { AzureStorageQueue, InMemoryStorageQueue } from "@market-bot-admin/queue";
import {
  AzureBlobStorage,
  AzureTableJsonStorage,
  InMemoryStorage,
  LocalJsonStorage
} from "@market-bot-admin/storage";
import type {
  BotStorageItems,
  IncomingTradeTaskMessage,
  PlatformTradeReadyMessage,
  TradeStatusQueueMessage
} from "@market-bot-admin/shared";
import {
  loadApiOptionsFromEnv,
  loadAzureBlobStorageOptionsFromEnv,
  loadAzureMarketItemsTableStorageOptionsFromEnv,
  loadAzurePlatformTradeReadyQueueOptionsFromEnv,
  loadAzureQueueConsumerOptionsFromEnv,
  loadAzureStatusQueueOptionsFromEnv,
  loadAzureTableStorageOptionsFromEnv,
  loadAzureTradeQueueOptionsFromEnv,
  loadInfrastructureDriversFromEnv
} from "./config";
import { MarketBotIntegration } from "./integration";
import { logger } from "./logger";

export { MarketBotIntegration } from "./integration";

export function createMarketBotIntegrationFromEnv(
  env: NodeJS.ProcessEnv = process.env
): MarketBotIntegration {
  const drivers = loadInfrastructureDriversFromEnv(env);

  const tradeQueue = drivers.queue === "azure"
    ? new AzureStorageQueue<IncomingTradeTaskMessage>(
        loadAzureTradeQueueOptionsFromEnv(env)
      )
    : new InMemoryStorageQueue<IncomingTradeTaskMessage>("incoming-trades");
  const statusQueue = drivers.queue === "azure"
    ? new AzureStorageQueue<TradeStatusQueueMessage>(
        loadAzureStatusQueueOptionsFromEnv(env)
      )
    : new InMemoryStorageQueue<TradeStatusQueueMessage>("trade-status");
  const platformTradeReadyQueue = drivers.queue === "azure"
    ? new AzureStorageQueue<PlatformTradeReadyMessage>(
        loadAzurePlatformTradeReadyQueueOptionsFromEnv(env)
      )
    : new InMemoryStorageQueue<PlatformTradeReadyMessage>("platform-trade-ready");

  const botStorage = drivers.storage === "azure"
    ? new AzureBlobStorage<BotStorageItems>(loadAzureBlobStorageOptionsFromEnv(env))
    : drivers.storage === "local"
      ? new LocalJsonStorage<BotStorageItems>(
          `${env.LOCAL_STORAGE_DIR ?? ".tm-client-data"}/bot`
        )
      : new InMemoryStorage<BotStorageItems>();
  const tradesStorage = drivers.storage === "azure"
    ? new AzureTableJsonStorage(loadAzureTableStorageOptionsFromEnv(env))
    : drivers.storage === "local"
      ? new LocalJsonStorage(`${env.LOCAL_STORAGE_DIR ?? ".tm-client-data"}/trades`)
      : new InMemoryStorage();
  const marketItemsStorage = drivers.storage === "azure"
    ? new AzureTableJsonStorage(loadAzureMarketItemsTableStorageOptionsFromEnv(env))
    : drivers.storage === "local"
      ? new LocalJsonStorage(
          `${env.LOCAL_STORAGE_DIR ?? ".tm-client-data"}/market-items`
        )
      : new InMemoryStorage();

  return new MarketBotIntegration(
    {
      client: loadApiOptionsFromEnv(env),
      queueConsumer: loadAzureQueueConsumerOptionsFromEnv(env)
    },
    {
      tradeQueue,
      statusQueue,
      platformTradeReadyQueue,
      botStorage,
      tradesStorage,
      marketItemsStorage,
      logger
    }
  );
}

async function main(): Promise<void> {
  const integration = createMarketBotIntegrationFromEnv();
  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    await integration.stop();
  };

  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());

  try {
    await integration.start();
    logger.info("Market bot integration started");
  } catch (error) {
    logger.error({ err: error }, "Market bot integration failed to start");
    await stop();
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
