import {logger} from "./logger";

let stopping = false;
const timers: NodeJS.Timeout[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function consumeBotCommandsForever(): Promise<void> {
  console.log("bot command consumer started");

  let emptyDelayMs = 1_000;
  const maxEmptyDelayMs = 15_000;

  while (!stopping) {
    try {
    //   const response = await botToClientQueue.receiveMessages({
    //     numberOfMessages: 8,
    //     visibilityTimeout: 120,
    //   });

    //   const messages = response.receivedMessageItems;

    //   if (messages.length === 0) {
    //     await sleep(emptyDelayMs);
    //     emptyDelayMs = Math.min(emptyDelayMs * 2, maxEmptyDelayMs);
    //     continue;
    //   }

      emptyDelayMs = 1_000;

    //   for (const message of messages) {
        try {
        //   const command = decodeMessage<BotCommand>(message.messageText);

        //   await executeBotCommand(command);

        //   await botToClientQueue.deleteMessage(
        //     message.messageId,
        //     message.popReceipt
        //   );

        } catch (err) {
        //   console.error("failed to process bot command", {
        //     messageId: message.messageId,
        //     dequeueCount: message.dequeueCount,
        //     err,
        //   });

          // Do not delete the message.
          // It will become visible again after visibilityTimeout.
        }
    //   }
    } catch (err) {
      logger.error(err, "queue consumer loop failed");
      await sleep(5_000);
    }
  }

  logger.info("bot command consumer stopped");
}

function requestShutdown(signal: string): void {
  logger.info(`received ${signal}; shutting down...`);

  stopping = true;

  for (const timer of timers) {
    clearInterval(timer);
  }
}

process.once("SIGINT", () => requestShutdown("SIGINT"));
process.once("SIGTERM", () => requestShutdown("SIGTERM"));