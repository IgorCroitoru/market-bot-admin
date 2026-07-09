import { TableClient, odata, type TableEntity } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";
import type { TokenCredential } from "@azure/core-auth";
import { KeyValueStore, EntityStore } from "./interfaces";
import { required } from "./helper";

type JsonStorageEntity = TableEntity<{
  key: string;
  value: string;
  updatedAtUtc: string;
}>;

export interface AzureTableJsonStorageOptions {
  tableName: string;

  /**
   * Example:
   * - "bot-1022850783"
   * - "market-client"
   * - "steam-account-main"
   */
  partitionKey: string;

  /**
   * Use this in production with managed identity.
   */
  storageAccountName?: string;


  /**
   * Useful for local dev or tests.
   */
  connectionString?: string;

  /**
   * User-assigned managed identity clientId.
   * Usually process.env.AZURE_CLIENT_ID in Azure Container Apps.
   */
  managedIdentityClientId?: string;

  /**
   * Optional custom credential.
   */
  credential?: TokenCredential;

  /**
   * Set true only in the writer app or deployment/setup code.
   * A read-only identity cannot create tables.
   */
  createTableIfNotExists?: boolean;
}




export class AzureTableJsonStorage
  implements EntityStore
{
  private readonly client: TableClient;
  private readonly partitionKey: string;
  private readonly createTableIfNotExists: boolean;
  private initPromise: Promise<void> | null = null;

  constructor(options: AzureTableJsonStorageOptions) {
    this.partitionKey = options.partitionKey;
    this.createTableIfNotExists = options.createTableIfNotExists ?? false;

    if (options.connectionString) {
      this.client = TableClient.fromConnectionString(
        options.connectionString,
        options.tableName
      );
      return;
    }

    const storageAccountName = required(
      options.storageAccountName,
      "storageAccountName"
    );

    const endpoint = `https://${storageAccountName}.table.core.windows.net`;

    const credential = new DefaultAzureCredential();

    this.client = new TableClient(endpoint, options.tableName, credential);
  }
  async set<T>(key: string, entity: T): Promise<void> {
    await this.init();

    
    const value: JsonStorageEntity = {
        partitionKey: this.partitionKey,
        rowKey: this.toRowKey(key),
        key,
        value: JSON.stringify(entity),
        updatedAtUtc: new Date().toISOString()
    };
    await this.client.upsertEntity(
      value,
      "Replace"
    );
  }

  async delete(key: string): Promise<void> {
    await this.init();

    const rowKey = this.toRowKey(key);

    try {
      await this.client.deleteEntity(this.partitionKey, rowKey);
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    await this.init();

    const rowKey = this.toRowKey(key);

    try {
      const entity = await this.client.getEntity<JsonStorageEntity>(this.partitionKey, rowKey);
      return JSON.parse(entity.value) as T;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }

      throw error;
    }
  }
    // async saveData<T>(key: string, value: T): Promise<void> {
    //     await this.init();

    //     const entity: JsonStorageEntity = {
    //         partitionKey: this.partitionKey,
    //         rowKey: this.toRowKey(key),
    //         key,
    //         value: JSON.stringify(value),
    //         updatedAtUtc: new Date().toISOString()
    //     };

    //     await this.client.upsertEntity(entity, "Replace");
    // }
 
    // async deleteData(key: string): Promise<void> {
    //     await this.init();

    //     try {
    //         await this.client.deleteEntity(this.partitionKey, this.toRowKey(key));
    //     } catch (error) {
    //         if (!isNotFound(error)) {
    //             throw error;
    //         }
    //     }
    // }
    // async getData<T>(key: string): Promise<T | null> {
    //     await this.init();

    //     try {
    //         const entity = await this.client.getEntity<JsonStorageEntity>(
    //             this.partitionKey,
    //             this.toRowKey(key)
    //         );

    //         return JSON.parse(entity.value) as T;
    //     } catch (error) {
    //     if (isNotFound(error)) {
    //         return null;
    //     }

    //     throw error;
    //     }
    // }

  private async init(): Promise<void> {
    if (!this.createTableIfNotExists) {
      return;
    }

    this.initPromise ??= this.client.createTable().catch((error) => {
      if (!isConflict(error)) {
        throw error;
      }
    });

    await this.initPromise;
  }

  private toRowKey(key: string): string {
    return Buffer.from(key, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }
}



function isNotFound(error: unknown): boolean {
  return getStatusCode(error) === 404;
}

function isConflict(error: unknown): boolean {
  return getStatusCode(error) === 409;
}

function getStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const err = error as {
    statusCode?: number;
    status?: number;
  };

  return err.statusCode ?? err.status;
}