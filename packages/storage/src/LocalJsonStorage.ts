import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EntityStore, KeyValueStore } from "./interfaces";

export class LocalJsonStorage<
  TSchema extends Record<string, unknown> = Record<string, unknown>
> implements KeyValueStore<TSchema>, EntityStore {
  constructor(private readonly directory: string) {}

  async get<TKey extends Extract<keyof TSchema, string>>(
    key: TKey
  ): Promise<TSchema[TKey] | null>;
  async get<TEntity>(key: string): Promise<TEntity | null>;
  async get<TValue>(key: string): Promise<TValue | null> {
    try {
      return JSON.parse(await readFile(this.filePath(key), "utf8")) as TValue;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async getUnknown<TValue = unknown>(key: string): Promise<TValue | null> {
    return this.get<TValue>(key);
  }

  async set<TKey extends Extract<keyof TSchema, string>>(
    key: TKey,
    value: TSchema[TKey]
  ): Promise<void>;
  async set(key: string, value: unknown): Promise<void>;
  async set(key: string, value: unknown): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.filePath(key), JSON.stringify(value, null, 2), "utf8");
  }

  async setUnknown<TValue = unknown>(key: string, value: TValue): Promise<void> {
    await this.set(key, value);
  }

  async delete(key: string): Promise<void> {
    try {
      await rm(this.filePath(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async listKeys(): Promise<string[]> {
    try {
      return (await readdir(this.directory))
        .filter((name) => name.endsWith(".json"))
        .map((name) => decodeURIComponent(name.slice(0, -5)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private filePath(key: string): string {
    return path.join(this.directory, `${encodeURIComponent(key)}.json`);
  }
}
