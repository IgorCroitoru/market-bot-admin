import { describe, expect, it, jest } from "@jest/globals";
import { Currency } from "@market-bot-admin/shared";
import { MarketBotIntegration } from "../src/integration";
import type { ItemInfo } from "../src/types";
import type { MarketItemRecord } from "../src/types/schemas";

describe("Market pricing integration", () => {
  it("undercuts the lowest competing listing and persists the accepted price", async () => {
    const item: ItemInfo = {
      item_id: "101",
      assetid: "asset-101",
      classid: "class-1",
      instanceid: "instance-1",
      real_instance: "instance-1",
      market_hash_name: "AK-47 | Mock Skin",
      position: 1,
      price: 10,
      currency: Currency.USD,
      source: "mock",
      status: "1",
      live_time: 0,
      left: null,
      botid: "bot-1",
      settlement: 0,
    };

    let storedRecord: MarketItemRecord = {
      id: item.item_id,
      item,
      minPrice: 8.5,
      price: item.price,
      currency: Currency.USD,
      fixedPrice: false,
      status: "on-sale",
      statusCode: "1",
      isOnSale: true,
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      lastPollAt: "2026-01-01T00:00:00.000Z",
    };

    const marketItemsService = {
      saveMarketItem: jest.fn(async () => undefined),
      deleteItemsMissingFrom: jest.fn(async () => 0),
      listMarketItemIds: jest.fn(async () => new Set([item.item_id])),
      getMarketItem: jest.fn(async () => storedRecord),
      saveSnapshot: jest.fn(async () => undefined),
      updateMarketItemPrice: jest.fn(async (
        record: MarketItemRecord,
        price: number,
        _updatedAt: string
      ) => {
        storedRecord = { ...record, price, item: { ...record.item, price } };
      }),
    };

    const client = {
      getItems: jest.fn(async () => ({ success: true, items: [item] })),
      searchItemByHashNameSpecific: jest.fn(async (
        _marketHashName: string,
        _options: { lang: "en"; withStickers: boolean; withAlfaskins: boolean }
      ) => ({
        success: true,
        currency: Currency.USD,
        data: [
          { id: 101, market_hash_name: item.market_hash_name, price: 8.8 },
          { id: 202, market_hash_name: item.market_hash_name, price: 9 },
          { id: 303, market_hash_name: item.market_hash_name, price: 9.4 },
        ],
      })),
      massSetPrice: jest.fn(async (
        _items: Array<{ item_id: number; price: number }>,
        _currency: Currency
      ) => ({
        success: true,
        items: [{ success: true, item_id: 101, price: 8.999, currency: Currency.USD }],
      })),
    };

    const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const integration = new MarketBotIntegration(
      {
        client: { apiKey: "mock-key" } as never,
        queueConsumer: { visibilityTimeoutSeconds: 30, maxMessages: 1, maxDequeueCount: 3 },
      },
      {
        logger: logger as never,
        tradeQueue: {} as never,
        statusQueue: {} as never,
        platformTradeReadyQueue: {} as never,
        botStorage: {} as never,
        tradesStorage: {} as never,
        marketItemsStorage: {} as never,
      }
    );

    Object.assign(integration, { client, marketItemsService });

    await integration.pollMarketItems();

    expect(client.searchItemByHashNameSpecific).toHaveBeenCalledWith(
      item.market_hash_name,
      { lang: "en", withStickers: false, withAlfaskins: false }
    );
    expect(client.massSetPrice).toHaveBeenCalledWith(
      [{ item_id: 101, price: 8.999 }],
      Currency.USD
    );
    expect(marketItemsService.updateMarketItemPrice).toHaveBeenCalledWith(
      expect.objectContaining({ id: "101", price: 10 }),
      8.999,
      expect.any(String)
    );
    expect(storedRecord.price).toBe(8.999);
  });

  it("searches identical item names once, excludes all owned listings, and skips fixed prices", async () => {
    const adjustableItem = createItem("101", 10);
    const secondAdjustableItem = createItem("102", 10.5);
    const fixedItem = createItem("103", 9.5);
    const records = new Map<string, MarketItemRecord>([
      ["101", createRecord(adjustableItem, false, 8)],
      ["102", createRecord(secondAdjustableItem, false, 8)],
      ["103", createRecord(fixedItem, true, 8)],
    ]);

    const marketItemsService = {
      saveMarketItem: jest.fn(async () => undefined),
      deleteItemsMissingFrom: jest.fn(async () => 0),
      listMarketItemIds: jest.fn(async () => new Set(records.keys())),
      getMarketItem: jest.fn(async (itemId: string) => records.get(itemId) ?? null),
      saveSnapshot: jest.fn(async () => undefined),
      updateMarketItemPrice: jest.fn(async (
        record: MarketItemRecord,
        price: number,
        _updatedAt: string
      ) => {
        records.set(record.id, { ...record, price, item: { ...record.item, price } });
      }),
    };
    const searchItemByHashNameSpecific = jest.fn(async () => ({
      success: true,
      currency: Currency.USD,
      data: [
        { id: 101, market_hash_name: adjustableItem.market_hash_name, price: 7 },
        { id: 102, market_hash_name: adjustableItem.market_hash_name, price: 7.5 },
        { id: 103, market_hash_name: adjustableItem.market_hash_name, price: 8 },
        { id: 999, market_hash_name: adjustableItem.market_hash_name, price: 9 },
      ],
    }));
    const massSetPrice = jest.fn(async (
      items: Array<{ item_id: number; price: number }>,
      currency: Currency
    ) => ({
      success: true,
      items: items.map((item) => ({ ...item, success: true, currency })),
    }));
    const integration = createTestIntegration();
    Object.assign(integration, {
      marketItemsService,
      client: {
        getItems: jest.fn(async () => ({
          success: true,
          items: [adjustableItem, secondAdjustableItem, fixedItem],
        })),
        searchItemByHashNameSpecific,
        massSetPrice,
      },
    });

    await integration.pollMarketItems();

    expect(searchItemByHashNameSpecific).toHaveBeenCalledTimes(1);
    expect(massSetPrice).toHaveBeenCalledWith(
      [
        { item_id: 101, price: 8.999 },
        { item_id: 102, price: 8.999 },
      ],
      Currency.USD
    );
    expect(marketItemsService.updateMarketItemPrice).toHaveBeenCalledTimes(2);
    expect(marketItemsService.updateMarketItemPrice).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "103" }),
      expect.any(Number),
      expect.any(String)
    );
    expect(records.get("103")?.price).toBe(9.5);
  });
});

function createItem(id: string, price: number): ItemInfo {
  return {
    item_id: id,
    assetid: `asset-${id}`,
    classid: "class-1",
    instanceid: "instance-1",
    real_instance: "instance-1",
    market_hash_name: "AK-47 | Shared Mock Skin",
    position: 1,
    price,
    currency: Currency.USD,
    source: "mock",
    status: "1",
    live_time: 0,
    left: null,
    botid: "bot-1",
    settlement: 0,
  };
}

function createRecord(item: ItemInfo, fixedPrice: boolean, minPrice: number): MarketItemRecord {
  return {
    id: item.item_id,
    item,
    minPrice,
    price: item.price,
    currency: item.currency,
    fixedPrice,
    status: "on-sale",
    statusCode: "1",
    isOnSale: true,
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    lastPollAt: "2026-01-01T00:00:00.000Z",
  };
}

function createTestIntegration(): MarketBotIntegration {
  return new MarketBotIntegration(
    {
      client: { apiKey: "mock-key" } as never,
      queueConsumer: { visibilityTimeoutSeconds: 30, maxMessages: 1, maxDequeueCount: 3 },
    },
    {
      logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as never,
      tradeQueue: {} as never,
      statusQueue: {} as never,
      platformTradeReadyQueue: {} as never,
      botStorage: {} as never,
      tradesStorage: {} as never,
      marketItemsStorage: {} as never,
    }
  );
}
