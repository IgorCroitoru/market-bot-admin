import { EntityStore } from "../../packages/storage/dist/interfaces";
import { TradeOffer } from "./types/schemas";

export class TradeStorageService {

    private readonly storage: EntityStore
    constructor(storage: EntityStore) {
        this.storage = storage;
    }
    public async saveTrade(tradeData: TradeOffer): Promise<void> {
        const rowKey = tradeData.id
        await this.storage.set(rowKey, tradeData);
    }
    public async getTrade(rowKey: string): Promise<TradeOffer | null> {
        const data = await this.storage.get<TradeOffer>(rowKey);
        return data;
    }

    public async deleteTrade(rowKey: string): Promise<void> {
        await this.storage.delete(rowKey);
    }
    
}