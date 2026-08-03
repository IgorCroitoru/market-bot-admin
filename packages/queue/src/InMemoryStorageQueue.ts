import { randomUUID } from "node:crypto";
import type {
  ConsumeForeverOptions,
  ReceiveOptions,
  ReceivedQueueMessage,
  SendOptions
} from "./AzureStorageQueue";
import type { QueueSendResult, StorageQueue } from "./StorageQueue";

type InMemoryMessage<T> = ReceivedQueueMessage<T> & {
  visibleAt: number;
};

export class InMemoryStorageQueue<TMessage> implements StorageQueue<TMessage> {
  private readonly messages: InMemoryMessage<TMessage>[] = [];

  constructor(public readonly queueName: string) {}

  async init(): Promise<void> {}

  async send(message: TMessage, options: SendOptions = {}): Promise<QueueSendResult> {
    const messageId = randomUUID();
    this.messages.push({
      id: messageId,
      popReceipt: randomUUID(),
      dequeueCount: 0,
      body: structuredClone(message),
      raw: {} as ReceivedQueueMessage<TMessage>["raw"],
      visibleAt: Date.now() + (options.visibleAfterSeconds ?? 0) * 1_000
    });
    return { messageId };
  }

  async receive(options: ReceiveOptions = {}): Promise<ReceivedQueueMessage<TMessage>[]> {
    const now = Date.now();
    const maxMessages = options.maxMessages ?? 1;
    const visibilityMs = (options.visibilityTimeoutSeconds ?? 30) * 1_000;
    return this.messages
      .filter((message) => message.visibleAt <= now)
      .slice(0, maxMessages)
      .map((message) => {
        message.dequeueCount += 1;
        message.visibleAt = now + visibilityMs;
        message.popReceipt = randomUUID();
        return message;
      });
  }

  async delete(message: ReceivedQueueMessage<TMessage>): Promise<void> {
    const index = this.messages.findIndex(
      (candidate) =>
        candidate.id === message.id && candidate.popReceipt === message.popReceipt
    );
    if (index >= 0) this.messages.splice(index, 1);
  }

  async updateVisibility(
    message: ReceivedQueueMessage<TMessage>,
    visibilityTimeoutSeconds: number
  ): Promise<void> {
    const stored = this.messages.find((candidate) => candidate.id === message.id);
    if (stored) stored.visibleAt = Date.now() + visibilityTimeoutSeconds * 1_000;
  }

  async countApproximateMessages(): Promise<number> {
    return this.messages.length;
  }

  async consumeForever(
    handler: (message: ReceivedQueueMessage<TMessage>) => Promise<void>,
    options: ConsumeForeverOptions<TMessage> = {}
  ): Promise<void> {
    let emptyDelayMs = options.emptyDelayMs ?? 10;
    const initialDelayMs = emptyDelayMs;
    const maxEmptyDelayMs = options.maxEmptyDelayMs ?? 100;

    while (!options.abortSignal?.aborted) {
      const messages = await this.receive(options);
      if (messages.length === 0) {
        await abortableDelay(emptyDelayMs, options.abortSignal);
        emptyDelayMs = Math.min(emptyDelayMs * 2, maxEmptyDelayMs);
        continue;
      }

      emptyDelayMs = initialDelayMs;
      for (const message of messages) {
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
            await this.delete(message);
          }
        }
      }
    }
  }
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}
