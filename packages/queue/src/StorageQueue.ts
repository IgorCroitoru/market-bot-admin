import type {
  ConsumeForeverOptions,
  ReceiveOptions,
  ReceivedQueueMessage,
  SendOptions
} from "./AzureStorageQueue";

/**
 * Small contracts that consumers can depend on and tests can replace with fakes.
 */
export interface QueueSender<TMessage> {
  send(message: TMessage, options?: SendOptions): Promise<QueueSendResult>;
}

export interface QueueSendResult {
  messageId: string;
}
export interface QueueConsumer<TMessage> {
  consumeForever(
    handler: (message: ReceivedQueueMessage<TMessage>) => Promise<void>,
    options?: ConsumeForeverOptions<TMessage>
  ): Promise<void>;
}

/**
 * Transport-independent queue contract.
 *
 * `rawClient` is deliberately omitted because it is specific to Azure.
 */
export interface StorageQueue<TMessage>
  extends QueueSender<TMessage>, QueueConsumer<TMessage> {
  readonly queueName: string;

  init(): Promise<void>;
  receive(options?: ReceiveOptions): Promise<ReceivedQueueMessage<TMessage>[]>;
  delete(message: ReceivedQueueMessage<TMessage>): Promise<void>;
  updateVisibility(
    message: ReceivedQueueMessage<TMessage>,
    visibilityTimeoutSeconds: number
  ): Promise<void>;
  countApproximateMessages(): Promise<number>;
}
