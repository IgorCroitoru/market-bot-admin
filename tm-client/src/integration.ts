import { AzureStorageQueue } from "@market-bot-admin/queue";
import { AzureBlobStorage, AzureTableJsonStorage, ReadonlyStorage } from "@market-bot-admin/storage";
import type {
  BotStorageItems,
  IncomingTradeTaskMessage,
  PlatformTradeReadyMessage,
  TokenCache,
  TradeItem as QueueTradeItem,
  TradeStatusQueueMessage,
} from "@market-bot-admin/shared";
import type { AppLogger } from "@market-bot-admin/logging";
import {
  loadApiOptionsFromEnv,
  loadAzureMarketItemsTableStorageOptionsFromEnv,
  loadAzureBlobStorageOptionsFromEnv,
  loadAzureQueueConsumerOptionsFromEnv,
  loadAzurePlatformTradeReadyQueueOptionsFromEnv,
  loadAzureTradeQueueOptionsFromEnv,
  loadAzureStatusQueueOptionsFromEnv,
  loadAzureTableStorageOptionsFromEnv,
} from "./config";
import { logger } from "./logger";
import { MarketClient } from "./MarketClient";
import type { ClientOptions, ItemInfo, OfferGiveP2P, Trade } from "./types";
import type { TradeOffer } from "./types/schemas";
import { MarketItemsStorageService } from "./MarketItemsStorageService";
import { TradeStorageService } from "./TradeStorageService";

type MarketP2POffer = OfferGiveP2P & {
  hash: string;
};

class MarketBotIntegration {
  private readonly client: MarketClient;
  private readonly tradeQueue: AzureStorageQueue<IncomingTradeTaskMessage>;
  private readonly statusQueue: AzureStorageQueue<TradeStatusQueueMessage>;
  private readonly platformTradeReadyQueue: AzureStorageQueue<PlatformTradeReadyMessage>;
  private readonly botStorage: ReadonlyStorage<BotStorageItems>;
  private readonly tradesService: TradeStorageService;
  private readonly marketItemsService: MarketItemsStorageService;
  private readonly logger: AppLogger;
  private readonly options: ClientOptions;
  private readonly queueConsumerOptions: ReturnType<typeof loadAzureQueueConsumerOptionsFromEnv>;
  private readonly statusQueueAbortController = new AbortController();
  private readonly platformTradeReadyQueueAbortController = new AbortController();

  private pingInterval: NodeJS.Timeout | null = null;
  private tradePollInterval: NodeJS.Timeout | null = null;
  private marketItemsPollTimeout: NodeJS.Timeout | null = null;
  private tokensPollInterval: NodeJS.Timeout | null = null;
  private tokensCache: TokenCache | null = null;
  private tradePollInFlight = false;
  private marketItemsPollInFlight = false;
  private statusQueueConsumePromise: Promise<void> | null = null;
  private platformTradeReadyQueueConsumePromise: Promise<void> | null = null;

  constructor() {
    this.logger = logger;
    this.options = loadApiOptionsFromEnv(process.env);
    this.client = new MarketClient(this.options);
    this.tradeQueue = new AzureStorageQueue(loadAzureTradeQueueOptionsFromEnv(process.env));
    this.statusQueue = new AzureStorageQueue(loadAzureStatusQueueOptionsFromEnv(process.env));
    this.platformTradeReadyQueue = new AzureStorageQueue(
      loadAzurePlatformTradeReadyQueueOptionsFromEnv(process.env)
    );
    this.queueConsumerOptions = loadAzureQueueConsumerOptionsFromEnv(process.env);
    this.botStorage = new AzureBlobStorage(loadAzureBlobStorageOptionsFromEnv(process.env));
    this.tradesService = new TradeStorageService(
      new AzureTableJsonStorage(loadAzureTableStorageOptionsFromEnv(process.env))
    );
    this.marketItemsService = new MarketItemsStorageService(
      new AzureTableJsonStorage(loadAzureMarketItemsTableStorageOptionsFromEnv(process.env))
    );
  }

  async start(): Promise<void> {
    await this.startTokensPolling();
    await this.startPeriodicPing();
    await this.startMarketTradePolling();
    await this.startMarketItemsPolling();
    this.startTradeStatusConsumer();
    this.startPlatformTradeReadyConsumer();
  }

  async startTokensPolling(): Promise<void> {
    this.clearTimer("tokens");
    await this.loadTokensFromStorage();

    this.tokensPollInterval = setInterval(() => {
      this.loadTokensFromStorage().catch((error) => {
        this.logger.error({ err: error }, "Token cache polling failed");
      });
    }, 5 * 60_000);
  }

  async loadTokensFromStorage(): Promise<void> {
    try {
      this.tokensCache = await this.botStorage.getData("token-cache");
      
    } catch (error) {
      this.logger.error({ err: error }, "Error loading tokens from storage");
    }
  }

  async startPeriodicPing(): Promise<void> {
    this.clearTimer("ping");
    await this.ping();

    this.pingInterval = setInterval(() => {
      this.ping().catch((error) => {
        this.logger.error({ err: error }, "Market ping failed");
      });
    }, this.options.pingIntervalMs ?? 180_000);
  }

  async ping(): Promise<void> {
    if (!this.tokensCache?.accessToken) {
      this.logger.warn("No Steam access token available, skipping market ping");
      return;
    }

    const response = await this.client.pingNew({
      access_token: this.tokensCache.accessToken,
    });

    if (response.success) {
      this.logger.debug(
        {
          online: response.online,
          p2p: response.p2p,
          steamApiKey: response.steamApiKey,
        },
        "Market ping succeeded"
      );
      return;
    }

    this.logger.warn({ response }, "Market ping returned an unsuccessful response");
  }

  async startMarketTradePolling(): Promise<void> {
    this.clearTimer("trade");
    await this.pollMarketTrades();

    this.tradePollInterval = setInterval(() => {
      this.pollMarketTrades().catch((error) => {
        this.logger.error({ err: error }, "Market trade polling failed");
      });
    }, this.options.marketTradePollIntervalMs ?? 15_000);
  }

  async pollMarketTrades(): Promise<void> {
    if (this.tradePollInFlight) {
      this.logger.debug("Market trade poll already in flight; skipping tick");
      return;
    }

    this.tradePollInFlight = true;

    try {
      const tradesResponse = await this.client.getTrades(false);

      if (!tradesResponse.success) {
        this.logger.debug({ response: tradesResponse }, "Market trades poll was not successful");
        return;
      }

      const activeTrades = tradesResponse.trades.filter((trade) => trade.dir === "in");

      if (activeTrades.length === 0) {
        this.logger.debug("No active incoming Market trades found");
        return;
      }

      const p2pResponse = await this.client.getTradeRequestGiveP2PAll();

      if (!p2pResponse.success) {
        if(p2pResponse.error === "nothing"){
          return
        }
        this.logger.warn({ response: p2pResponse }, "Market P2P trade details poll was not successful");
        return;
      }

      const offersBySecret = new Map<string, MarketP2POffer>();

      for (const offer of p2pResponse.offers) {
        const secret = extractOfferSecret(offer);

        if (secret) {
          offersBySecret.set(secret, offer);
        }
      }

      this.logger.info(
        {
          tradeCount: activeTrades.length,
          p2pOfferCount: p2pResponse.offers.length,
        },
        "Market trades found; matching P2P details by secret"
      );

      for (const trade of activeTrades) {
        const offer = offersBySecret.get(trade.secret);

        if (!offer) {
          this.logger.warn(
            {
              tradeId: trade.trade_id,
              secret: trade.secret,
              botId: trade.bot_id,
            },
            "Market trade has no matching P2P offer details yet"
          );
          continue;
        }

        await this.registerAndQueueP2PTrade(trade, offer);
      }
    } finally {
      this.tradePollInFlight = false;
    }
  }

  async startMarketItemsPolling(): Promise<void> {
    this.clearTimer("marketItems");
    await this.pollMarketItemsAndScheduleNext();
  }

  private async pollMarketItemsAndScheduleNext(): Promise<void> {
    let nextDelayMs = this.options.marketItemsEmptyPollIntervalMs ?? 30 * 60_000;

    try {
      nextDelayMs = await this.pollMarketItems();
    } catch (error) {
      this.logger.error({ err: error }, "Market items polling failed");
    } finally {
      this.marketItemsPollTimeout = setTimeout(() => {
        void this.pollMarketItemsAndScheduleNext();
      }, nextDelayMs);
    }
  }

  async pollMarketItems(): Promise<number> {
    if (this.marketItemsPollInFlight) {
      this.logger.debug("Market items poll already in flight; skipping tick");
      return this.options.marketItemsPollIntervalMs ?? 5 * 60_000;
    }

    this.marketItemsPollInFlight = true;

    try {
      const response = await this.client.getItems();

      if (!response.success) {
        this.logger.warn({ response }, "Market items poll was not successful");
        return this.options.marketItemsEmptyPollIntervalMs ?? 30 * 60_000;
      }

      const items = Array.isArray(response.items)
        ? response.items
        : [];
      const polledAt = new Date().toISOString();
      const onSaleItems = items.filter((item) => item.status === "1");

      for (const item of items) {
        await this.marketItemsService.saveMarketItem(item, polledAt);
      }

      await this.marketItemsService.saveSnapshot({
        itemCount: items.length,
        onSaleCount: onSaleItems.length,
        polledAt,
      });

      this.logger.debug(
        {
          itemCount: items.length,
          onSaleCount: onSaleItems.length,
        },
        "Market items saved to table storage"
      );

      return onSaleItems.length > 0
        ? this.options.marketItemsPollIntervalMs ?? 5 * 60_000
        : this.options.marketItemsEmptyPollIntervalMs ?? 30 * 60_000;
    } finally {
      this.marketItemsPollInFlight = false;
    }
  }

  startTradeStatusConsumer(): void {
    if (this.statusQueueConsumePromise) {
      return;
    }

    this.statusQueueConsumePromise = this.statusQueue.consumeForever(
      (message) => this.handleTradeStatusMessage(message.body),
      {
        abortSignal: this.statusQueueAbortController.signal,
        maxMessages: this.queueConsumerOptions.maxMessages,
        visibilityTimeoutSeconds: this.queueConsumerOptions.visibilityTimeoutSeconds,
        maxDequeueCount: this.queueConsumerOptions.maxDequeueCount,
        onError: (error, message) => {
          this.logger.warn(
            {
              err: error,
              queueMessageId: message.id,
              tradeOfferId: message.body?.tradeOfferId,
              dequeueCount: message.dequeueCount,
            },
            "Trade status message failed; it will be visible again"
          );
        },
        onPoisonMessage: async (message, error) => {
          this.logger.error(
            {
              err: error,
              queueMessageId: message.id,
              tradeOfferId: message.body?.tradeOfferId,
            },
            "Trade status message reached max dequeue count and will be deleted"
          );
        },
      }
    );
  }

  private async handleTradeStatusMessage(message: TradeStatusQueueMessage): Promise<void> {
    if (!message || message.type !== "trade-status-changed") {
      throw new Error(`Unsupported trade status message type: ${String((message as any)?.type)}`);
    }

    const existingTrade = await this.tradesService.getTrade(message.tradeOfferId);

    if (!existingTrade) {
      this.logger.warn(
        { tradeOfferId: message.tradeOfferId, offerId: message.offerId },
        "Received trade status for an unknown trade"
      );
      return;
    }

    const updatedTrade: TradeOffer = {
      ...existingTrade,
      offerId: message.offerId ?? existingTrade.offerId,
      status: mapTradeStatus(message, existingTrade.status),
      offerStatusHistory: [
        ...(existingTrade.offerStatusHistory ?? []),
        {
          status: message.status,
          oldStatus: message.oldStatus,
          statusText: message.statusText,
          processingStatus: message.processingStatus,
          error: message.error,
          timestamp: message.timestamp,
          data: message.data,
        },
      ],
      registeredWithPlatform: existingTrade.registeredWithPlatform,
      registeredAt: existingTrade.registeredAt,
      updatedAt: new Date().toISOString(),
      data: {
        ...(existingTrade.data ?? {}),
        lastStatusQueueMessageId: message.queueMessageId,
        lastStatusAt: message.timestamp,
      },
    };

    await this.tradesService.saveTrade(updatedTrade);

    if (shouldQueuePlatformRegistration(message, updatedTrade)) {
      await this.enqueuePlatformTradeReady(updatedTrade, message);
    }

    this.logger.info(
      {
        tradeOfferId: message.tradeOfferId,
        offerId: message.offerId,
        status: updatedTrade.status,
        processingStatus: message.processingStatus,
      },
      "Trade status saved to table storage"
    );
  }

  startPlatformTradeReadyConsumer(): void {
    if (this.platformTradeReadyQueueConsumePromise) {
      return;
    }

    this.platformTradeReadyQueueConsumePromise = this.platformTradeReadyQueue.consumeForever(
      (message) => this.handlePlatformTradeReadyMessage(message.body),
      {
        abortSignal: this.platformTradeReadyQueueAbortController.signal,
        maxMessages: this.queueConsumerOptions.maxMessages,
        visibilityTimeoutSeconds: this.queueConsumerOptions.visibilityTimeoutSeconds,
        maxDequeueCount: this.queueConsumerOptions.maxDequeueCount,
        onError: (error, message) => {
          this.logger.warn(
            {
              err: error,
              queueMessageId: message.id,
              tradeOfferId: message.body?.tradeOfferId,
              offerId: message.body?.offerId,
              dequeueCount: message.dequeueCount,
            },
            "Platform trade-ready registration failed; message will be visible again"
          );
        },
        onPoisonMessage: async (message, error) => {
          this.logger.error(
            {
              err: error,
              queueMessageId: message.id,
              tradeOfferId: message.body?.tradeOfferId,
              offerId: message.body?.offerId,
            },
            "Platform trade-ready registration reached max dequeue count and will be deleted"
          );
        },
      }
    );
  }

  private async enqueuePlatformTradeReady(
    trade: TradeOffer,
    statusMessage: TradeStatusQueueMessage
  ): Promise<void> {
    if (!trade.offerId) {
      return;
    }

    const existingRegistrationQueueMessageId = asOptionalString(
      trade.data?.platformRegistrationQueueMessageId
    );

    if (existingRegistrationQueueMessageId) {
      this.logger.debug(
        {
          tradeOfferId: trade.id,
          offerId: trade.offerId,
          queueMessageId: existingRegistrationQueueMessageId,
        },
        "Platform trade-ready registration already queued"
      );
      return;
    }

    const response = await this.platformTradeReadyQueue.send({
      type: "platform-trade-ready",
      tradeOfferId: trade.id,
      offerId: trade.offerId,
      statusQueueMessageId: statusMessage.queueMessageId,
      createdAt: Date.now(),
      data: {
        steamStatus: statusMessage.status,
        steamStatusText: statusMessage.statusText,
      },
    });

    await this.tradesService.saveTrade({
      ...trade,
      updatedAt: new Date().toISOString(),
      data: {
        ...(trade.data ?? {}),
        platformRegistrationQueueMessageId: response.messageId,
        platformRegistrationQueuedAt: Date.now(),
      },
    });

    this.logger.info(
      {
        tradeOfferId: trade.id,
        offerId: trade.offerId,
        queueMessageId: response.messageId,
      },
      "Queued active Steam offer for Market trade-ready registration"
    );
  }

  private async handlePlatformTradeReadyMessage(
    message: PlatformTradeReadyMessage
  ): Promise<void> {
    if (!message || message.type !== "platform-trade-ready") {
      throw new Error(`Unsupported platform registration message type: ${String((message as any)?.type)}`);
    }

    const existingTrade = await this.tradesService.getTrade(message.tradeOfferId);

    if (!existingTrade) {
      this.logger.warn(
        { tradeOfferId: message.tradeOfferId, offerId: message.offerId },
        "Received platform registration task for an unknown trade"
      );
      return;
    }

    if (existingTrade.registeredWithPlatform) {
      this.logger.info(
        { tradeOfferId: message.tradeOfferId, offerId: message.offerId },
        "Trade offer already registered with platform"
      );
      return;
    }

    const response = await this.client.tradeReady(message.offerId);

    logger.debug({
      queueMessageId: message.statusQueueMessageId,
      tradeOfferId: message.tradeOfferId,
      offerId: message.offerId,
      responseTradeReadySuccess: response.success,
      responseTradeReadyError: response.error
    }, "Trade ready sent and received response")

    if (!response.success) {
      throw new Error(response.error ?? `Market trade-ready failed for offer ${message.offerId}`);
    }

    await this.tradesService.saveTrade({
      ...existingTrade,
      registeredWithPlatform: true,
      registeredAt: Date.now(),
      updatedAt: new Date().toISOString(),
      data: {
        ...(existingTrade.data ?? {}),
        platformRegisteredOfferId: response.tradeofferid ?? message.offerId,
        platformRegisteredAt: Date.now(),
        platformRegistrationError: undefined,
      },
    });

    this.logger.info(
      {
        tradeOfferId: message.tradeOfferId,
        offerId: message.offerId,
        platformTradeOfferId: response.tradeofferid,
      },
      "Registered Steam offer with Market platform"
    );
  }

  private async registerAndQueueP2PTrade(
    marketTrade: Trade,
    offer: MarketP2POffer
  ): Promise<void> {
    const tradeRowKey = marketTrade.secret;
    const existingTrade = await this.tradesService.getTrade(tradeRowKey);

    if (existingTrade?.queueMessageId) {
      this.logger.debug(
        {
          tradeOfferId: tradeRowKey,
          queueMessageId: existingTrade.queueMessageId,
        },
        "Market trade already queued"
      );
      return;
    }

    const now = Date.now();
    const marketTradeCreatedAtMs = normalizeMarketTimestamp(marketTrade.timestamp);
    const deadlineAtMs = marketTradeCreatedAtMs + (this.options.marketTradeOfferTtlMs ?? 5 * 60_000);

    if (now >= deadlineAtMs) {
      await this.tradesService.saveTrade({
        ...(existingTrade ?? {}),
        id: tradeRowKey,
        offerP2P: offer,
        marketTrade,
        botId: marketTrade.bot_id,
        nik: marketTrade.nik,
        secret: marketTrade.secret,
        offerStatusHistory: existingTrade?.offerStatusHistory ?? [],
        status: "failed",
        timestamp: marketTradeCreatedAtMs,
        deadlineAt: new Date(deadlineAtMs).toISOString(),
        registeredWithPlatform: existingTrade?.registeredWithPlatform ?? false,
        registeredAt: existingTrade?.registeredAt,
        createdAt: existingTrade?.createdAt ?? new Date(marketTradeCreatedAtMs).toISOString(),
        updatedAt: new Date(now).toISOString(),
        source: "market-p2p",
        data: {
          ...(existingTrade?.data ?? {}),
          marketHash: offer.hash,
          itemCount: offer.items.length,
          queueSkippedReason: "market-trade-expired",
          deadlineAt: new Date(deadlineAtMs).toISOString(),
        },
      });

      this.logger.warn(
        {
          tradeOfferId: tradeRowKey,
          tradeId: marketTrade.trade_id,
          deadlineAt: new Date(deadlineAtMs).toISOString(),
        },
        "Market trade is older than the send deadline; not queueing"
      );
      return;
    }

    const createdAt = existingTrade?.createdAt ?? new Date(marketTradeCreatedAtMs).toISOString();
    const pendingTrade: TradeOffer = {
      ...(existingTrade ?? {}),
      id: tradeRowKey,
      offerP2P: offer,
      marketTrade,
      botId: marketTrade.bot_id,
      nik: marketTrade.nik,
      secret: marketTrade.secret,
      offerStatusHistory: existingTrade?.offerStatusHistory ?? [],
      status: existingTrade?.status ?? "pending",
      timestamp: existingTrade?.timestamp ?? marketTradeCreatedAtMs,
      deadlineAt: new Date(deadlineAtMs).toISOString(),
      registeredWithPlatform: existingTrade?.registeredWithPlatform ?? false,
      createdAt,
      updatedAt: new Date(now).toISOString(),
      source: "market-p2p",
      data: {
        ...(existingTrade?.data ?? {}),
        marketHash: offer.hash,
        marketTradeId: marketTrade.trade_id,
        itemCount: offer.items.length,
        deadlineAt: new Date(deadlineAtMs).toISOString(),
        remainingMs: deadlineAtMs - now,
      },
    };

    await this.tradesService.saveTrade(pendingTrade);

    const queueMessage = this.createIncomingTradeTaskMessage(offer, pendingTrade);
    const queueResponse = await this.tradeQueue.send(queueMessage);
    const queuedTrade: TradeOffer = {
      ...pendingTrade,
      status: "queued",
      queueMessageId: queueResponse.messageId,
      updatedAt: new Date().toISOString(),
    };

    await this.tradesService.saveTrade(queuedTrade);

    this.logger.info(
      {
        tradeOfferId: tradeRowKey,
        secret: marketTrade.secret,
        queueMessageId: queueResponse.messageId,
        partner: offer.partner,
        itemCount: offer.items.length,
      },
      "Market P2P trade registered and queued for Steam bot"
    );
  }

  private createIncomingTradeTaskMessage(
    offer: MarketP2POffer,
    tradeRecord: TradeOffer
  ): IncomingTradeTaskMessage {
    return {
      type: "trade-request",
      tradeOfferId: tradeRecord.id,
      trade: {
        partner: String(offer.partner),
        token: offer.token,
        message: offer.tradeoffermessage,
        createdAt: tradeRecord.createdAt,
        deadlineAt: tradeRecord.deadlineAt,
        itemsToGive: offer.items.map((item): QueueTradeItem => ({
          appid: Number(item.appid),
          contextid: String(item.contextid),
          assetid: String(item.assetid),
          amount: Number(item.amount),
        })),
        data: {
          source: "market-p2p",
          marketHash: offer.hash,
          marketSecret: tradeRecord.secret,
          registeredAt: tradeRecord.createdAt,
          prices: offer.items
            .filter((item) => item.price)
            .map((item) => ({
              assetid: String(item.assetid),
              price: item.price,
            })),
        },
      },
    };
  }

  async stop(): Promise<void> {
    this.logger.info("Stopping market bot integration");

    this.statusQueueAbortController.abort();
    this.platformTradeReadyQueueAbortController.abort();
    this.clearTimer("tokens");
    this.clearTimer("ping");
    this.clearTimer("trade");
    this.clearTimer("marketItems");

    if (this.statusQueueConsumePromise) {
      await this.statusQueueConsumePromise;
      this.statusQueueConsumePromise = null;
    }

    if (this.platformTradeReadyQueueConsumePromise) {
      await this.platformTradeReadyQueueConsumePromise;
      this.platformTradeReadyQueueConsumePromise = null;
    }

    await this.client.stop();
  }

  private clearTimer(timer: "tokens" | "ping" | "trade" | "marketItems"): void {
    if (timer === "tokens" && this.tokensPollInterval) {
      clearInterval(this.tokensPollInterval);
      this.tokensPollInterval = null;
    }

    if (timer === "ping" && this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (timer === "trade" && this.tradePollInterval) {
      clearInterval(this.tradePollInterval);
      this.tradePollInterval = null;
    }

    if (timer === "marketItems" && this.marketItemsPollTimeout) {
      clearTimeout(this.marketItemsPollTimeout);
      this.marketItemsPollTimeout = null;
    }
  }
}

function shouldQueuePlatformRegistration(
  message: TradeStatusQueueMessage,
  trade: TradeOffer
): boolean {
  return message.status === 2 && Boolean(trade.offerId) && !trade.registeredWithPlatform;
}

function asOptionalString(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value);
}

function extractOfferSecret(offer: MarketP2POffer): string | null {
  const messageSecret = offer.tradeoffermessage.trim().split(/\s+/)[0];

  if (messageSecret) {
    return messageSecret;
  }

  const hashSecret = offer.hash.trim().split(/\s+/)[0];
  return hashSecret || null;
}

function normalizeMarketTimestamp(timestamp: number): number {
  return timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
}

function mapTradeStatus(
  message: TradeStatusQueueMessage,
  currentStatus: TradeOffer["status"]
): TradeOffer["status"] {
  if (message.processingStatus === "failed" || message.status < 0) {
    return "failed";
  }

  if (message.status === 3) {
    return "accepted";
  }

  if (message.status === 5 || message.status === 6) {
    return "cancelled";
  }

  if (message.status === 7 || message.status === 8 || message.status === 10) {
    return "rejected";
  }

  if (message.processingStatus === "processed" || message.status === 2 || message.status === 9) {
    return "sent";
  }

  return currentStatus;
}

export async function main(): Promise<void> {
  const integration = new MarketBotIntegration();
  let stopping = false;

  const stopIntegration = async (): Promise<void> => {
    if (stopping) {
      return;
    }

    stopping = true;
    await integration.stop();
  };

  process.once("SIGINT", () => {
    void stopIntegration();
  });

  process.once("SIGTERM", () => {
    void stopIntegration();
  });

  try {
    await integration.start();
    logger.info("Market bot integration started");
  } catch (error) {
    logger.error({ err: error }, "Market bot integration failed to start");
    await stopIntegration();
    process.exitCode = 1;
  }
}

export { MarketBotIntegration };
