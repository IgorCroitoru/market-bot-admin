import { z } from "zod";

const configSchema = z.object({
  BOT_ENV: z.enum(["dev", "prod"]).default("dev"),

  AzureWebJobsStorage: z.string(),

  STORAGE_MODE: z.enum(["connectionString", "managedIdentity"]).default("connectionString"),
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_STORAGE_ACCOUNT_NAME: z.string().optional(),

  KEY_VAULT_URL: z.string().optional(),

  STEAM_ACCOUNT_NAME: z.string(),

  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info")
});

export const config = configSchema.parse(process.env);