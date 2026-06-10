import { DefaultAzureCredential } from "@azure/identity";
import { QueueClient } from "@azure/storage-queue";
import type { TokenCredential } from "@azure/core-auth";
import type { DequeuedMessageItem } from "@azure/storage-queue";

const MAX_AZURE_QUEUE_MESSAGE_BYTES = 64 * 1024;

export type AzureQueueConfig = {
  queueName: string;

  /**
   * Use this for local/dev if you want.
   * Example: AZURE_STORAGE_CONNECTION_STRING
   */
  connectionString?: string;

  /**
   * Use this with DefaultAzureCredential / managed identity.
   * Example: mystorageaccount
   */
  storageAccountName?: string;

  /**
   * Optional custom credential.
   * If omitted and connectionString is not used, DefaultAzureCredential is used.
   */
  credential?: TokenCredential;

  /**
   * Good for dev. In production, you may prefer creating queues with IaC.
   */
  createIfNotExists?: boolean;

  /**
   * Queue message encoding.
   * base64-json is safest for arbitrary JSON.
   */
  encoding?: "base64-json" | "plain-json";
};

export type SendOptions = {
  /**
   * Delay before the message becomes visible.
   * Azure SDK option: visibilityTimeout.
   */
  visibleAfterSeconds?: number;

  /**
   * Message TTL in seconds.
   * Use -1 for no expiry on supported service versions.
   */
  timeToLiveSeconds?: number;
};

export type ReceiveOptions = {
  /**
   * Azure Queue Storage supports up to 32 messages per receive request.
   */
  maxMessages?: number;

  /**
   * How long the message is hidden from other consumers after receive.
   */
  visibilityTimeoutSeconds?: number;
};

export type ReceivedQueueMessage<T> = {
  id: string;
  popReceipt: string;
  dequeueCount: number;
  body: T;
  raw: DequeuedMessageItem;
};

export type ConsumeForeverOptions<T> = ReceiveOptions & {
  /**
   * Delay when queue is empty.
   */
  emptyDelayMs?: number;

  /**
   * Max delay when queue stays empty.
   */
  maxEmptyDelayMs?: number;

  /**
   * Stops the consumer loop when aborted.
   */
  abortSignal?: AbortSignal;

  /**
   * Called when a message handler fails.
   */
  onError?: (error: unknown, message: ReceivedQueueMessage<T>) => void | Promise<void>;

  /**
   * Optional poison handling threshold.
   * If message.dequeueCount >= maxDequeueCount, onPoisonMessage is called.
   */
  maxDequeueCount?: number;

  onPoisonMessage?: (
    message: ReceivedQueueMessage<T>,
    error: unknown
  ) => void | Promise<void>;
};

export class AzureStorageQueue<TMessage> {
  private readonly client: QueueClient;
  private readonly encoding: "base64-json" | "plain-json";
  private initialized = false;
  private readonly shouldCreateIfNotExists: boolean;

  constructor(config: AzureQueueConfig) {
    this.encoding = config.encoding ?? "base64-json";
    this.shouldCreateIfNotExists = config.createIfNotExists ?? false;

    if (config.connectionString) {
      this.client = new QueueClient(config.connectionString, config.queueName);
      return;
    }

    if (!config.storageAccountName) {
      throw new Error(
        "AzureStorageQueue requires either connectionString or storageAccountName."
      );
    }

    const credential = config.credential ?? new DefaultAzureCredential();

    this.client = new QueueClient(
      `https://${config.storageAccountName}.queue.core.windows.net/${config.queueName}`,
      credential
    );
  }

  get queueName(): string {
    return this.client.name;
  }

  get rawClient(): QueueClient {
    return this.client;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    if (this.shouldCreateIfNotExists) {
      await this.client.createIfNotExists();
    }

    this.initialized = true;
  }

  async send(message: TMessage, options: SendOptions = {}) {
    await this.init();

    return this.client.sendMessage(this.encode(message), {
      visibilityTimeout: options.visibleAfterSeconds,
      messageTimeToLive: options.timeToLiveSeconds,
    });
  }

  async receive(
    options: ReceiveOptions = {}
  ): Promise<ReceivedQueueMessage<TMessage>[]> {
    await this.init();

    const maxMessages = options.maxMessages ?? 1;

    if (maxMessages < 1 || maxMessages > 32) {
      throw new Error("maxMessages must be between 1 and 32.");
    }

    const response = await this.client.receiveMessages({
      numberOfMessages: maxMessages,
      visibilityTimeout: options.visibilityTimeoutSeconds ?? 30,
    });

    return response.receivedMessageItems.map((item) => ({
      id: item.messageId,
      popReceipt: item.popReceipt,
      dequeueCount: item.dequeueCount,
      body: this.decode(item.messageText),
      raw: item,
    }));
  }

  async delete(message: ReceivedQueueMessage<TMessage>): Promise<void> {
    await this.client.deleteMessage(message.id, message.popReceipt);
  }

  async updateVisibility(
    message: ReceivedQueueMessage<TMessage>,
    visibilityTimeoutSeconds: number
  ): Promise<void> {
    await this.client.updateMessage(
      message.id,
      message.popReceipt,
      undefined,
      visibilityTimeoutSeconds
    );
  }

  async countApproximateMessages(): Promise<number> {
    await this.init();

    const properties = await this.client.getProperties();
    return properties.approximateMessagesCount ?? 0;
  }

  async consumeForever(
    handler: (message: ReceivedQueueMessage<TMessage>) => Promise<void>,
    options: ConsumeForeverOptions<TMessage> = {}
  ): Promise<void> {
    await this.init();

    let emptyDelayMs = options.emptyDelayMs ?? 1_000;
    const initialEmptyDelayMs = emptyDelayMs;
    const maxEmptyDelayMs = options.maxEmptyDelayMs ?? 15_000;

    while (!options.abortSignal?.aborted) {
      const messages = await this.receive({
        maxMessages: options.maxMessages ?? 8,
        visibilityTimeoutSeconds: options.visibilityTimeoutSeconds ?? 30,
      });

      if (messages.length === 0) {
        await sleep(emptyDelayMs, options.abortSignal);
        emptyDelayMs = Math.min(emptyDelayMs * 2, maxEmptyDelayMs);
        continue;
      }

      emptyDelayMs = initialEmptyDelayMs;

      for (const message of messages) {
        if (options.abortSignal?.aborted) return;

        try {
          await handler(message);
          await this.delete(message);
        } catch (error) {
          await options.onError?.(error, message);

          if (
            options.maxDequeueCount !== undefined &&
            message.dequeueCount >= options.maxDequeueCount
          ) {
            await options.onPoisonMessage?.(message, error);

            // Delete only after your poison handler succeeds.
            await this.delete(message);
          }

          // Otherwise do not delete. Azure will make it visible again
          // after visibilityTimeoutSeconds.
        }
      }
    }
  }

  private encode(message: TMessage): string {
    const json = JSON.stringify(message);

    if (this.encoding === "plain-json") {
      this.assertMessageSize(json);
      return json;
    }

    const encoded = Buffer.from(json, "utf8").toString("base64");
    this.assertMessageSize(encoded);
    return encoded;
  }

  private decode(messageText: string): TMessage {
    if (this.encoding === "plain-json") {
      return JSON.parse(messageText) as TMessage;
    }

    const json = Buffer.from(messageText, "base64").toString("utf8");
    return JSON.parse(json) as TMessage;
  }

  private assertMessageSize(messageText: string): void {
    const size = Buffer.byteLength(messageText, "utf8");

    if (size > MAX_AZURE_QUEUE_MESSAGE_BYTES) {
      throw new Error(
        `Azure Queue message too large: ${size} bytes. Max is ${MAX_AZURE_QUEUE_MESSAGE_BYTES} bytes.`
      );
    }
  }
}

function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
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