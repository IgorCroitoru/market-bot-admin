
export type MessageDefaultBody = {
  type: string;
}

export type TradeItem = {
  appid: number;
  contextid: string | number;
  assetid: string | number;
  id?: string;
  amount: number;
  [key: string]: unknown;
}

export type TradeRequest = {
  partner: string;
  token?: string;
  message?: string;
  createdAt?: number | string | Date;
  deadlineAt?: number | string | Date;
  timestamp?: number | string | Date;
  itemsToGive?: TradeItem[];
  itemsToReceive?: TradeItem[];
  data?: Record<string, unknown>;
}

export type TradeRequestMessage = {
  type: 'trade-request';
  trade: TradeRequest;
  tradeOfferId: string;
}

export type IncomingTradeTaskMessage = TradeRequestMessage;

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
    oldStatus?: number;
    statusText?: string;
    processingStatus?: "processed" | "failed" | "changed";
    externalId?: string;
    requestId?: string;
    queueMessageId?: string;
    error?: string;
    timestamp: number;
    data?: Record<string, unknown>;
}

export type TradeStatusQueueMessage = TradeStatusChangedMessage;

export type PlatformTradeReadyMessage = {
    type: 'platform-trade-ready';
    /**
     * App internal id / Market hash from trade-request-give-p2p-all.
     */
    tradeOfferId: string;
    /**
     * Steam offer id returned by steam-tradeoffer-manager.
     */
    offerId: string | number;
    statusQueueMessageId?: string;
    createdAt: number;
    data?: Record<string, unknown>;
}
