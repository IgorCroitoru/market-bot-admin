export type StringKeyOf<T> = Extract<keyof T, string>;

export interface KeyValueReader<TSchema extends Record<string, unknown> = Record<string, unknown>> {
  get<TKey extends StringKeyOf<TSchema>>(
    key: TKey
  ): Promise<TSchema[TKey] | null>;

  getUnknown<TValue = unknown>(key: string): Promise<TValue | null>;
}

export interface KeyValueStore<TSchema extends Record<string, unknown> = Record<string, unknown>>
  extends KeyValueReader<TSchema> {
  set<TKey extends StringKeyOf<TSchema>>(
    key: TKey,
    value: TSchema[TKey]
  ): Promise<void>;

  setUnknown<TValue = unknown>(key: string, value: TValue): Promise<void>;

  delete(key: string): Promise<void>;
}

export interface EntityReader {
  get<TEntity>(key: string): Promise<TEntity | null>;

  listKeys(): Promise<string[]>;
}

export interface EntityStore
  extends EntityReader {
  set(key: string, entity: unknown): Promise<void>;

  delete(key: string): Promise<void>;
}
