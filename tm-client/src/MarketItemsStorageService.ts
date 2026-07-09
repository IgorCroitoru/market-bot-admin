import { EntityStore } from "../../packages/storage/dist/interfaces";
import { ItemInfo } from "./types";
import { MarketItemRecord, MarketItemsSnapshotRecord } from "./types/schemas";

const SNAPSHOT_ROW_KEY = "latest";

export class MarketItemsStorageService {
  constructor(private readonly storage: EntityStore) {}

  async saveMarketItem(item: ItemInfo, polledAt: string): Promise<void> {
    const existingRecord = await this.getMarketItem(item.item_id);
    const record: MarketItemRecord = {
      id: item.item_id,
      item,
      status: mapMarketItemStatus(item.status),
      statusCode: item.status,
      isOnSale: item.status === "1",
      firstSeenAt: existingRecord?.firstSeenAt ?? polledAt,
      lastSeenAt: polledAt,
      lastPollAt: polledAt,
      data: {
        previousStatusCode: existingRecord?.statusCode,
        previousPrice: existingRecord?.item.price,
      },
    };

    await this.storage.set(item.item_id, record);
  }

  async saveSnapshot(snapshot: Omit<MarketItemsSnapshotRecord, "id">): Promise<void> {
    await this.storage.set(SNAPSHOT_ROW_KEY, {
      id: SNAPSHOT_ROW_KEY,
      ...snapshot,
    });
  }

  async getMarketItem(itemId: string): Promise<MarketItemRecord | null> {
    return this.storage.get<MarketItemRecord>(itemId);
  }
}

function mapMarketItemStatus(status: string): MarketItemRecord["status"] {
  switch (status) {
    case "1":
      return "on-sale";
    case "2":
      return "sold-awaiting-transfer";
    case "3":
      return "awaiting-seller-transfer";
    case "4":
      return "ready-to-pick-up";
    default:
      return "unknown";
  }
}
