import { createHash } from "node:crypto";
import { TableStorage } from "../../packages/storage/dist/interfaces";
import { TradeOffer } from "./types/schemas";

export class TradeStorageService {

    private readonly storage: TableStorage
    constructor(storage: TableStorage) {
        this.storage = storage;
    }
    public async saveTrade(tradeData: TradeOffer): Promise<void> {
        const { botId, secret } = tradeData;
        const rowKey = TradeStorageService.makeTradeRowKey(botId, secret);
        await this.storage.saveData(rowKey, tradeData);
    }
    public async getTrade(botId: string, secret: string): Promise<TradeOffer | null> {
        const rowKey = TradeStorageService.makeTradeRowKey(botId, secret);
        const data = await this.storage.getData<TradeOffer>(rowKey);
        return data;
    }

    public async deleteTrade(botId: string, secret: string): Promise<void> {
        const rowKey = TradeStorageService.makeTradeRowKey(botId, secret);
        await this.storage.deleteData(rowKey);
    }
    static makeTradeRowKey(botId:string, secret:string): string{
        const secretHash = createHash("sha256")
        .update(secret)
        .digest("base64url");

        return `bot_${botId}_secret_${secretHash}`;
    }
    
}