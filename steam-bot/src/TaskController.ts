import { AzureStorageQueue, type AzureQueueConfig, type ReceivedQueueMessage } from "@market-bot-admin/queue";
import type TradeOffer from "steam-tradeoffer-manager/lib/classes/TradeOffer";
import TradeOfferManager from "steam-tradeoffer-manager";
import type { AppLogger } from "@market-bot-admin/logging";
import type {
  IncomingTradeTaskMessage,
  TradeStatusQueueMessage
} from "@market-bot-admin/shared";
import { Bot, type SendTradeOfferRequest, type SentTradeOffer } from "./Bot";
import { logger as defaultLogger } from "./logger";
import { isRetriableError } from "./retry";

export type {
  IncomingTradeTaskMessage,
  TradeStatusQueueMessage
} from "@market-bot-admin/shared";

export interface TaskControllerOptions {
  incomingQueue: AzureQueueConfig;
  statusQueue: AzureQueueConfig;
  logger?: AppLogger;
  visibilityTimeoutSeconds?: number;
  maxMessages?: number;
  maxDequeueCount?: number;
}

export class TaskController {
  private readonly incomingQueue: AzureStorageQueue<IncomingTradeTaskMessage>;
  private readonly statusQueue: AzureStorageQueue<TradeStatusQueueMessage>;
  private readonly log: AppLogger;
  private readonly abortController = new AbortController();
  private readonly visibilityTimeoutSeconds: number;
  private readonly maxMessages: number;
  private readonly maxDequeueCount: number;
  private consumePromise: Promise<void> | null = null;

  constructor(
    private readonly bot: Bot,
    options: TaskControllerOptions
  ) {
    this.incomingQueue = new AzureStorageQueue(options.incomingQueue);
    this.statusQueue = new AzureStorageQueue(options.statusQueue);
    this.log = options.logger ?? defaultLogger;
    this.visibilityTimeoutSeconds = options.visibilityTimeoutSeconds ?? 60;
    this.maxMessages = options.maxMessages ?? 1;
    this.maxDequeueCount = options.maxDequeueCount ?? 5;
  }

  start(): void {
    if (this.consumePromise) {
      return;
    }

    this.bot.on("sentOfferChanged", this.onSentOfferChanged);
    this.consumePromise = this.consumeIncomingTasks();
  }

  async stop(): Promise<void> {
    this.abortController.abort();
    this.bot.off("sentOfferChanged", this.onSentOfferChanged);

    if (this.consumePromise) {
      await this.consumePromise;
      this.consumePromise = null;
    }
  }

  private async consumeIncomingTasks(): Promise<void> {
    while (!this.abortController.signal.aborted) {
      try {
        await this.incomingQueue.consumeForever(
          (message) => this.handleIncomingTaskWithRetryPolicy(message),
          {
            abortSignal: this.abortController.signal,
            maxMessages: this.maxMessages,
            visibilityTimeoutSeconds: this.visibilityTimeoutSeconds,
            maxDequeueCount: this.maxDequeueCount,
            onError: (error, message) => {
              this.log.warn(
                {
                  err: error,
                  queueMessageId: message.id,
                  dequeueCount: message.dequeueCount,
                  visibleAgainAfterSeconds: this.visibilityTimeoutSeconds
                },
                "Retryable incoming trade task failed; message will be visible again"
              );
            },
            onPoisonMessage: (message, error) =>
              this.publishFailedTaskStatus(message, error)
          }
        );
      } catch (error) {
        if (this.abortController.signal.aborted) {
          return;
        }

        this.log.error({ err: error }, "Incoming trade queue consumer failed");
        await delay(5_000, this.abortController.signal);
      }
    }
  }

  private async handleIncomingTaskWithRetryPolicy(
    message: ReceivedQueueMessage<IncomingTradeTaskMessage>
  ): Promise<void> {
    try {
      await this.handleIncomingTask(message);
    } catch (error) {
      if (isRetriableError(error)) {
        throw error;
      }

      await this.publishFailedTaskStatus(message, error);
      this.log.warn(
        {
          err: error,
          queueMessageId: message.id,
          dequeueCount: message.dequeueCount
        },
        "Non-retryable incoming trade task failed; message will be deleted"
      );
    }
  }

  private async handleIncomingTask(
    message: ReceivedQueueMessage<IncomingTradeTaskMessage>
  ): Promise<void> {
    const body = message.body as Partial<IncomingTradeTaskMessage> | null;

    if (!body || typeof body !== "object") {
      throw new Error("Incoming trade task body must be an object");
    }

    if (body.type !== "trade-request") {
      throw new Error(`Unsupported incoming trade task type: ${String(body.type)}`);
    }

    const { trade, tradeOfferId } = body;

    if (typeof tradeOfferId !== "string" || tradeOfferId.length === 0) {
      throw new Error("Incoming trade task is missing tradeOfferId");
    }

    if (!trade || typeof trade.partner !== "string") {
      throw new Error("Incoming trade task is missing trade.partner");
    }

    const request: SendTradeOfferRequest = {
      ...trade,
      data: {
        ...(trade.data ?? {}),
        tradeOfferId,
        queueMessageId: message.id,
        queueDequeueCount: message.dequeueCount,
        processingStatus: "processing",
        processedBy: "steam-bot",
        processingStartedAt: new Date().toISOString()
      }
    };

    this.log.info(
      {
        queueMessageId: message.id,
        tradeOfferId,
        partner: request.partner
      },
      "Processing incoming trade task"
    );

    const result = await this.bot.sendTradeOffer(request);
    this.markOfferProcessed(result, tradeOfferId, message.id);

    try {
      await this.publishStatus({
        type: "trade-status-changed",
        tradeOfferId,
        offerId: result.offer.id,
        status: Number(result.offer.state ?? 0),
        statusText: result.status,
        processingStatus: "processed",
        queueMessageId: message.id,
        timestamp: Date.now(),
        data: this.readTrackedOfferData(result.offer)
      });
    } catch (error) {
      this.log.error(
        {
          err: error,
          queueMessageId: message.id,
          tradeOfferId,
          offerId: result.offer.id
        },
        "Trade offer was sent but status queue publish failed"
      );
    }
  }

  private markOfferProcessed(
    result: SentTradeOffer,
    tradeOfferId: string,
    queueMessageId: string
  ): void {
    result.offer.data("processingStatus", "processed");
    result.offer.data("tradeOfferId", tradeOfferId);
    result.offer.data("queueMessageId", queueMessageId);
    result.offer.data("processedAt", new Date().toISOString());
  }

  private readonly onSentOfferChanged = (offer: TradeOffer, oldState: number): void => {
    this.publishStatus({
      type: "trade-status-changed",
      tradeOfferId: String(offer.data("tradeOfferId")),
      offerId: offer.id,
      status: Number(offer.state ?? 0),
      oldStatus: oldState,
      statusText: this.getTradeOfferStateLabel(Number(offer.state ?? 0)),
      processingStatus: "changed",
      queueMessageId: asOptionalString(offer.data("queueMessageId")),
      timestamp: Date.now(),
      data: this.readTrackedOfferData(offer)
    }).catch((error) => {
      this.log.warn(
        { err: error, offerId: offer.id, oldState, newState: offer.state },
        "Failed to publish sent trade offer status change"
      );
    });
  };

  private async publishFailedTaskStatus(
    message: ReceivedQueueMessage<IncomingTradeTaskMessage>,
    error: unknown
  ): Promise<void> {
    const body = message.body as Partial<IncomingTradeTaskMessage> | null;
    const tradeOfferId = body && typeof body === "object"
      ? asOptionalString(body.tradeOfferId) ?? message.id
      : message.id;

    await this.publishStatus({
      type: "trade-status-changed",
      tradeOfferId,
      status: -1,
      processingStatus: "failed",
      queueMessageId: message.id,
      error: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    });
  }

  private async publishStatus(message: TradeStatusQueueMessage): Promise<void> {
    await this.statusQueue.send(message);
    this.log.info(
      {
        tradeOfferId: message.tradeOfferId,
        offerId: message.offerId,
        status: message.status,
        processingStatus: message.processingStatus
      },
      "Published trade status queue message"
    );
  }

  private readTrackedOfferData(offer: TradeOffer): Record<string, unknown> {
    return {
      tradeOfferId: offer.data("tradeOfferId"),
      queueMessageId: offer.data("queueMessageId"),
      processingStatus: offer.data("processingStatus"),
      processedAt: offer.data("processedAt"),
    };
  }

  private getTradeOfferStateLabel(state: number): string {
    const states = TradeOfferManager.ETradeOfferState as unknown as Record<number, string>;
    return states[state] ?? String(state);
  }
}

function asOptionalString(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value);
}

function delay(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (abortSignal?.aborted) {
      resolve();
      return;
    }

    const timeout = setTimeout(resolve, ms);

    abortSignal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
}
