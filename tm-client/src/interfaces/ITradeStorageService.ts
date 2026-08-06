import type { TradeOffer } from "../types/schemas";

export interface ITradeStorageService {
  saveTrade(tradeData: TradeOffer): Promise<void>;
  getTrade(rowKey: string): Promise<TradeOffer | null>;
  deleteTrade(rowKey: string): Promise<void>;
}
