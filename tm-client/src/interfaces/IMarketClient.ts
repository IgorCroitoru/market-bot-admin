import type Bottleneck from "bottleneck";
import type { Currency } from "@market-bot-admin/shared";
import type {
  ApiVersion,
  ItemsResponse,
  MassSetPriceResponse,
  PingNewRequest,
  PingNewResponse,
  SearchItemByHashNameSpecificResponse,
  TradeReadyResponse,
  TradeRequestGiveP2PAllResponse,
  TradesResponse,
} from "../types";

export interface IMarketClient {
  getTradeRequestGiveP2PAll(): Promise<TradeRequestGiveP2PAllResponse>;
  pingNew(request: PingNewRequest): Promise<PingNewResponse>;
  tradeReady(tradeofferId: string | number): Promise<TradeReadyResponse>;
  getTrades(extended?: boolean): Promise<TradesResponse>;
  get<T>(endpoint: string, params?: Record<string, any>): Promise<T>;
  post<T>(endpoint: string, data?: any, params?: Record<string, any>): Promise<T>;
  setVersion(version: ApiVersion): void;
  getVersion(): ApiVersion;
  getRateLimiterStats(): ReturnType<Bottleneck["counts"]>;
  stop(): Promise<void>;
  addToSale(id: string | number, price: number, cur?: Currency): Promise<any>;
  massAddToSale(items: Array<{ asset: number; price: number }>, cur?: Currency): Promise<any>;
  setPrice(itemId: string | number, price: number, cur?: Currency): Promise<any>;
  massSetPrice(
    items: Array<{ item_id: number; price: number }>,
    cur?: Currency
  ): Promise<MassSetPriceResponse>;
  massSetPriceMhn(marketHashName: string, price: number, cur?: Currency): Promise<any>;
  removeAllFromSale(): Promise<any>;
  getMyInventory(lang?: string): Promise<any>;
  getInventoryStatus(): Promise<any>;
  getItems(): Promise<ItemsResponse>;
  searchItemByHashNameSpecific(
    marketHashName: string,
    options?: {
      withStickers?: boolean;
      lang?: "ru" | "en";
      withAlfaskins?: false;
    }
  ): Promise<SearchItemByHashNameSpecificResponse>;
  ping(): Promise<any>;
  tradeRequestTake(botid?: string | number): Promise<any>;
  tradeRequestGive(): Promise<any>;
  tradeRequestGiveP2P(): Promise<any>;
  buy(options: {
    hash_name?: string;
    id?: string | number;
    price: number;
    custom_id?: string;
    buy_alfaskin?: number;
  }): Promise<any>;
  buyFor(options: {
    hash_name?: string;
    id?: string | number;
    price: number;
    partner: number;
    token: string;
    chance_to_transfer?: number;
    custom_id?: string;
    buy_alfaskin?: number;
  }): Promise<any>;
  getBuyInfoByCustomId(customId: string): Promise<any>;
  getListBuyInfoByCustomId(customIds: string[]): Promise<any>;
  checkIfReversedByCustomId(customId: string): Promise<any>;
  getHistory(dateStart?: string | number, dateEnd?: string | number): Promise<any>;
  getOperationHistory(dateStart?: string | number, dateEnd?: string | number): Promise<any>;
  getListItemsInfo(hashNames: string[]): Promise<any>;
  getBidAsk(hashName: string, phase?: string): Promise<any>;
  test(): Promise<any>;
}
