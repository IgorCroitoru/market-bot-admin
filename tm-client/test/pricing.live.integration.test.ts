import path from "node:path";
import dotenv from "dotenv";
import { describe, expect, it, jest } from "@jest/globals";
import { Currency, marketPriceStep, normalizePrice } from "@market-bot-admin/shared";
import { MarketClient } from "../src/MarketClient";
import { MarketBotIntegration } from "../src/integration";
import type {
  ItemInfo,
  MarketSearchItem,
  SearchItemByHashNameSpecificResponse,
} from "../src/types";
import type { MarketItemRecord } from "../src/types/schemas";

dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });

const apiKey = process.env.API_KEY;
const liveTest = apiKey ? it : it.skip;

describe("Market pricing integration with live read-only data", () => {
  liveTest(
    "gets a real item, applies a fake stored minimum, and calculates its pricing action",
    async () => {
      const realClient = new MarketClient({
        apiKey,
        baseUrl: process.env.BASE_URL,
        requestTimeoutMs: 30_000,
        requestsPerSecond: 2,
      });

      try {
        const itemsResponse = await realClient.getItems();
        expect(itemsResponse.success).toBe(true);

        const item = itemsResponse.items.find((candidate) => candidate.status === "1");
        if (!item) {
          throw new Error("The Market account has no on-sale item available for the live pricing test");
        }

        const fakeMinPrice = normalizePrice(item.price * 0.8, item.currency);
        let storedRecord = createMockStoredItem(item, fakeMinPrice);
        let searchResponse: SearchItemByHashNameSpecificResponse | undefined;

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

        const massSetPrice = jest.fn(async (
          items: Array<{ item_id: number; price: number }>,
          currency: Currency
        ) => ({
          success: true,
          items: items.map((pricedItem) => ({
            success: true,
            item_id: pricedItem.item_id,
            price: pricedItem.price,
            currency,
          })),
        }));

        const client = {
          getItems: jest.fn(async () => ({ success: true, items: [item] })),
          searchItemByHashNameSpecific: jest.fn(async (
            marketHashName: string,
            options: { withStickers?: boolean; lang?: "ru" | "en"; withAlfaskins?: false }
          ) => {
            searchResponse ??= await realClient.searchItemByHashNameSpecific(marketHashName, options);
            console.log("Price", searchResponse.data[0].price)
            return searchResponse;
          }),
          massSetPrice,
        };

        const logger = {
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        };
        const integration = createIntegration(logger);
        Object.assign(integration, { client, marketItemsService });

        const adjustment = await getPriceAdjustment(integration, item);
        console.log(`Adjustment price:${adjustment?.price}. comparing price: ${adjustment?.competingPrice}`)
        const expectedPrice = calculateExpectedPrice(item, fakeMinPrice, searchResponse);
        console.log(`Expected price: ${expectedPrice}`)
        if (expectedPrice === null) {
          expect(adjustment).toBeNull();
        } else {
          expect(adjustment).toEqual({
            record: storedRecord,
            price: expectedPrice,
            competingPrice: findLowestCompetingPrice(item, searchResponse),
          });
        }

        await integration.pollMarketItems();

        expect(client.getItems).toHaveBeenCalledTimes(1);
        expect(client.searchItemByHashNameSpecific).toHaveBeenCalledWith(
          item.market_hash_name,
          { lang: "en", withStickers: false, withAlfaskins: false }
        );
        expect(searchResponse?.success).toBe(true);
        expect(searchResponse?.currency).toBe(item.currency);

        const ownSearchListing = searchResponse?.data.find(
          (listing) => String(listing.id) === String(item.item_id)
        );
        if (ownSearchListing) {
          expect(ownSearchListing.price).toBeCloseTo(item.price, 3);
        }

        if (expectedPrice === null) {
          expect(massSetPrice).not.toHaveBeenCalled();
          expect(storedRecord.price).toBe(item.price);
          expect(logger.debug).toHaveBeenCalledWith(
            expect.objectContaining({ itemId: item.item_id, itemName: item.market_hash_name }),
            `No adjustment found for item: ${item.market_hash_name}`
          );
        } else {
          expect(massSetPrice).toHaveBeenCalledWith(
            [{ item_id: Number(item.item_id), price: expectedPrice }],
            item.currency
          );
          expect(marketItemsService.updateMarketItemPrice).toHaveBeenCalledWith(
            expect.objectContaining({ id: item.item_id, minPrice: fakeMinPrice }),
            expectedPrice,
            expect.any(String)
          );
          expect(storedRecord.price).toBe(expectedPrice);
          expect(logger.debug).toHaveBeenCalledWith(
            expect.objectContaining({
              itemId: item.item_id,
              itemName: item.market_hash_name,
              competingPriceFound: findLowestCompetingPrice(item, searchResponse),
              adjustedPrice: expectedPrice,
            }),
            `Adjustment found for item: ${item.market_hash_name}`
          );
        }
      } finally {
        await realClient.stop();
      }
    },
    45_000
  );
});

function createMockStoredItem(item: ItemInfo, minPrice: number): MarketItemRecord {
  const timestamp = new Date().toISOString();
  return {
    id: item.item_id,
    item,
    minPrice,
    price: item.price,
    currency: item.currency,
    fixedPrice: false,
    status: "on-sale",
    statusCode: item.status,
    isOnSale: true,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    lastPollAt: timestamp,
  };
}

type PriceAdjustment = {
  record: MarketItemRecord;
  price: number;
  competingPrice: number;
};

function getPriceAdjustment(
  integration: MarketBotIntegration,
  item: ItemInfo
): Promise<PriceAdjustment | null> {
  return (integration as unknown as {
    getMarketItemPriceAdjustment(item: ItemInfo): Promise<PriceAdjustment | null>;
  }).getMarketItemPriceAdjustment(item);
}

function findLowestCompetingPrice(
  item: ItemInfo,
  response: SearchItemByHashNameSpecificResponse | undefined
): number | null {
  const prices = response?.data
    ?.filter((listing) => String(listing.id) !== String(item.item_id))
    .map((listing) => listing.price) ?? [];
  return prices.length > 0 ? Math.min(...prices) : null;
}

function calculateExpectedPrice(
  item: ItemInfo,
  minPrice: number,
  response: SearchItemByHashNameSpecificResponse | undefined
): number | null {
  if (!response?.success || response.currency !== item.currency || !Array.isArray(response.data)) {
    return null;
  }
  console.log(1)
  const competingPrices = response.data
    .filter((listing: MarketSearchItem) => String(listing.id) !== String(item.item_id))
    .map((listing: MarketSearchItem) => listing.price);
  if (competingPrices.length === 0) {
    return null;
  }
  console.log(2)
  const competingPrice = Math.min(...competingPrices);
  console.log(competingPrice)
  if (competingPrice >= item.price) {
    return null;
  }
console.log(3)
  const adjustedPrice = normalizePrice(
    Math.max(
      minPrice,
      competingPrice - marketPriceStep(item.currency)
    ),
    item.currency
  );
  return adjustedPrice < item.price ? adjustedPrice : null;
}

function createIntegration(logger: Record<string, jest.Mock>): MarketBotIntegration {
  return new MarketBotIntegration(
    {
      client: { apiKey: "replaced-by-live-client" },
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
}
