import type { EntityStore, KeyValueStore } from "./interfaces";

export class InMemoryStorage<
  TSchema extends Record<string, unknown> = Record<string, unknown>
> implements KeyValueStore<TSchema>, EntityStore {
  private readonly values = new Map<string, unknown>();

  async get<TKey extends Extract<keyof TSchema, string>>(
    key: TKey
  ): Promise<TSchema[TKey] | null>;
  async get<TEntity>(key: string): Promise<TEntity | null>;
  async get<TValue>(key: string): Promise<TValue | null> {
    return (this.values.get(key) as TValue | undefined) ?? null;
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
    this.values.set(key, structuredClone(value));
  }

  async setUnknown<TValue = unknown>(key: string, value: TValue): Promise<void> {
    await this.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async listKeys(): Promise<string[]> {
    return [...this.values.keys()];
  }
}
