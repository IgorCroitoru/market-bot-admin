
export type MessageDefaultBody = {
  type: string;
}

export type TradeStatusChangedMessage = {
    type: 'trade-status-changed';
    /**
     * App internal id
     */
    tradeOfferId: string;
    /**
     * Steam offerId
     */
    offerId?: string | number;
    /**
     * A value from TradeOfferManager.ETradeOfferState enum
     */
    status: number;
}

export type BotStatusChangedMessage = {
  type: 'bot-status-changed';
  status: string;
}

