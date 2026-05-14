import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { ReadonlyStorage, WritableStorage } from "./interfaces";
import { DefaultAzureCredential } from "@azure/identity";

export type BlobNameMap<TItems extends Record<string, unknown>> = {
  [K in keyof TItems & string]: string;
};

export interface AzureBotStorageOptions {
  accountName: string;
  containerName: string;
  storageAccountName: string;
}

export class AzureBlobStorage<TItems extends Record<string, unknown> = any> implements WritableStorage<TItems> {
    private readonly accountName: string;
    private readonly container: ContainerClient;
    private ensureContainerPromise: Promise<void> | null = null;

    constructor(options: AzureBotStorageOptions) {
        this.accountName = options.accountName;
        const credential = new DefaultAzureCredential();
        const azureBlobServiceClient = new BlobServiceClient(
            `https://${options.storageAccountName}.blob.core.windows.net`,
            credential  
        );

        this.container = azureBlobServiceClient.getContainerClient(options.containerName);
    }
    async saveGenericData<T>(key: string, value: T): Promise<void> {
        await this.ensureContainer();

        const blob = this.container.getBlockBlobClient(this.blobName(key));
        const content = JSON.stringify(value, null, 2);
        await blob.upload(content, Buffer.byteLength(content), {
            blobHTTPHeaders: {
                blobContentType: "application/json"
            }
        });
    }
    async saveData<TKey extends keyof TItems & string>(key: TKey, value: TItems[TKey]): Promise<void> {
        await this.saveGenericData(key, value);
    }
    async deleteData<TKey extends keyof TItems & string>(key: TKey): Promise<void> {
        await this.ensureContainer();
        const blob = this.container.getBlockBlobClient(this.blobName(key));
        await blob.delete();
    }

    async getData<TKey extends keyof TItems & string>(
        key: TKey
    ): Promise<TItems[TKey] | null> {
        return await this.getGenericData<TItems[TKey]>(key);
    }

    async getGenericData<T>(key: string): Promise<T | null> {
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