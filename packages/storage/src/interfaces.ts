export interface ReadonlyStorage<TItems extends Record<string, unknown> = any> {
  getData<TKey extends keyof TItems & string>(
    key: TKey
  ): Promise<TItems[TKey] | null>;
  getGenericData<T>(key: string): Promise<T | null>
}

export interface WritableStorage<TItems extends Record<string, unknown> = any>
  extends ReadonlyStorage<TItems> {
  saveData<TKey extends keyof TItems & string>(
    key: TKey,
    value: TItems[TKey]
  ): Promise<void>;

  saveGenericData<T = any>(key: string, value: T): Promise<void>;
  deleteData<TKey extends keyof TItems & string>(
    key: TKey
  ): Promise<void>;
}