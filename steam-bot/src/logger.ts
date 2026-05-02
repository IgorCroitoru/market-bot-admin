import { createLogger } from "@market-bot-admin/logging";

const environment =
  process.env.BOT_ENV === "prod" || process.env.BOT_ENV === "test"
    ? process.env.BOT_ENV
    : "dev";

export const logger = createLogger({
  service: "steam-bot",
  environment,
  level: process.env.LOG_LEVEL as
    | "trace"
    | "debug"
    | "info"
    | "warn"
    | "error"
    | "fatal"
    | undefined
});
