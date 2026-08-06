import type { ItemInfo } from "../types";
import type { MarketItemRecord, MarketItemsSnapshotRecord } from "../types/schemas";

export interface IMarketItemsStorageService {
  saveMarketItem(item: ItemInfo, polledAt: string): Promise<void>;
  saveSnapshot(snapshot: Omit<MarketItemsSnapshotRecord, "id">): Promise<void>;
  deleteItemsMissingFrom(currentItemIds: Set<string>): Promise<number>;
  listMarketItemIds(): Promise<Set<string>>;
  getMarketItem(itemId: string): Promise<MarketItemRecord | null>;
  updateMarketItemPrice(
    record: MarketItemRecord,
    price: number,
    updatedAt: string
  ): Promise<void>;
}
