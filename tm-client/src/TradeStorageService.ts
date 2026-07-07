import { TableStorage } from "../../packages/storage/dist/interfaces";
import { TradeOffer } from "./types/schemas";

export class TradeStorageService {

    private readonly storage: TableStorage
    constructor(storage: TableStorage) {
        this.storage = storage;
    }
    public async saveTrade(tradeData: TradeOffer): Promise<void> {
        const rowKey = tradeData.id
        await this.storage.saveData(rowKey, tradeData);
    }
    public async getTrade(rowKey: string): Promise<TradeOffer | null> {
        const data = await this.storage.getData<TradeOffer>(rowKey);
        return data;
    }

    public async deleteTrade(rowKey: string): Promise<void> {
        await this.storage.deleteData(rowKey);
    }
    
}