import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import type { BotStorage } from "../Persistence";
import type { PollData } from "../PollData";

export interface AzureBotStorageOptions {
  accountName: string;
  containerName?: string;
  connectionString?: string;
  storageAccountName?: string;
  keyVaultUrl: string;
}

export class AzureBotStorage implements BotStorage {
  private readonly accountName: string;
  private readonly container: ContainerClient;
  private readonly secrets: SecretClient;
  private ensureContainerPromise: Promise<void> | null = null;

  constructor(options: AzureBotStorageOptions) {
    this.accountName = options.accountName;

    const credential = new DefaultAzureCredential();
    const blobServiceClient = options.connectionString
      ? BlobServiceClient.fromConnectionString(options.connectionString)
      : new BlobServiceClient(
          `https://${required(options.storageAccountName, "AZURE_STORAGE_ACCOUNT_NAME")}.blob.core.windows.net`,
          credential
        );

    this.container = blobServiceClient.getContainerClient(
      options.containerName ?? "steam-bot"
    );
    this.secrets = new SecretClient(options.keyVaultUrl, credential);
  }

  async savePollData(pollData: PollData): Promise<void> {
    await this.saveData("poll-data", pollData);
  }

  async loadPollData(): Promise<PollData | null> {
    return this.loadData<PollData>("poll-data");
  }

  async saveData<T>(key: string, data: T): Promise<void> {
    await this.ensureContainer();

    const blob = this.container.getBlockBlobClient(this.blobName(key));
    const content = JSON.stringify(data, null, 2);
    await blob.upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: {
        blobContentType: "application/json"
      }
    });
  }

  async loadData<T>(key: string): Promise<T | null> {
    await this.ensureContainer();

    try {
      const blob = this.container.getBlobClient(this.blobName(key));
      const response = await blob.download();

      if (!response.readableStreamBody) {
        return null;
      }

      const content = await streamToString(response.readableStreamBody);
      return JSON.parse(content) as T;
    } catch (error) {
      if (isAzureMissing(error)) {
        return null;
      }

      throw error;
    }
  }

  async saveRefreshToken(token: string): Promise<void> {
    await this.saveSecret("refresh-token", token);
  }

  async loadRefreshToken(): Promise<string | null> {
    return this.loadSecret("refresh-token");
  }

  async deleteRefreshToken(): Promise<void> {
    try {
      await this.secrets.beginDeleteSecret(this.secretName("refresh-token"));
    } catch (error) {
      if (!isAzureMissing(error)) {
        throw error;
      }
    }
  }

  async saveAccessToken(token: string): Promise<void> {
    await this.saveSecret("access-token", token);
  }

  async loadAccessToken(): Promise<string | null> {
    return this.loadSecret("access-token");
  }

  // async deleteAccessToken(): Promise<void> {
  //   try {
  //     await this.secrets.beginDeleteSecret(this.secretName("access-token"));
  //   } catch (error) {
  //     if (!isAzureMissing(error)) {
  //       throw error;
  //     }
  //   }
  // }

  async saveCookies(cookies: string[]): Promise<void> {
    await this.saveSecret("cookies", JSON.stringify(cookies));
  }

  async loadCookies(): Promise<string[] | null> {
    const value = await this.loadSecret("cookies");

    if (!value) {
      return null;
    }

    return JSON.parse(value) as string[];
  }

  async saveLoginAttempts(attempts: number[]): Promise<void> {
    await this.saveData("login-attempts", attempts);
  }

  async loadLoginAttempts(): Promise<number[] | null> {
    return this.loadData<number[]>("login-attempts");
  }

  private async saveSecret(key: string, value: string): Promise<void> {
    await this.secrets.setSecret(this.secretName(key), value);
  }

  private async loadSecret(key: string): Promise<string | null> {
    try {
      const secret = await this.secrets.getSecret(this.secretName(key));
      return secret.value ?? null;
    } catch (error) {
      if (isAzureMissing(error)) {
        return null;
      }

      throw error;
    }
  }

  private async ensureContainer(): Promise<void> {
    this.ensureContainerPromise ??= this.container.createIfNotExists().then(() => undefined);
    await this.ensureContainerPromise;
  }

  private blobName(key: string): string {
    return `${sanitizeName(this.accountName)}/${sanitizeName(key)}.json`;
  }

  private secretName(key: string): string {
    return `steam-${sanitizeName(this.accountName)}-${sanitizeName(key)}`.slice(0, 127);
  }
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required Azure storage option: ${name}`);
  }

  return value;
}

function sanitizeName(value: string): string {
  return value.replace(/[^a-z0-9-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function isAzureMissing(error: unknown): boolean {
  const current = error as { code?: string; statusCode?: number; status?: number };
  return (
    current.statusCode === 404 ||
    current.status === 404 ||
    current.code === "BlobNotFound" ||
    current.code === "ContainerNotFound" ||
    current.code === "SecretNotFound"
  );
}
