import { createLogger } from "@market-bot-admin/logging";

const environment =
  process.env.NODE_ENV === "prod" || process.env.NODE_ENV === "test"
    ? process.env.NODE_ENV
    : "dev";

export const logger = createLogger({
  service: "market-client",
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
