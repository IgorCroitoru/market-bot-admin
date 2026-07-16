import { Currency } from "@market-bot-admin/shared";
import { ItemInfo, OfferGiveP2P, Trade } from ".";

export interface TradeOffer {
    id: string;
    offerP2P: OfferGiveP2P;
    marketTrade?: Trade;
    botId?: string; // basically user id of the tm client who buys the item
    nik?: string;
    secret?: string;
    offerId?: string | number;
    offerStatusHistory: OfferStatus[];
    status: "pending" | "queued" | "sent" | "accepted" | "rejected" | "cancelled" | "failed";
    timestamp: number;
    deadlineAt?: string;
    /**
     * True only after Market trade-ready accepts the Steam offer id.
     */
    registeredWithPlatform: boolean;
    registeredAt?: number;
    createdAt: string;
    updatedAt: string;
    queueMessageId?: string;
    source?: "market-p2p";
    data?: Record<string, unknown>;
}

export type OfferStatus = {
    /**
     * A value from TradeOfferManager.ETradeOfferState enum
     */
    status: number;
    oldStatus?: number;
    statusText?: string;
    processingStatus?: "processed" | "failed" | "changed";
    error?: string;
    timestamp: number;
    data?: Record<string, unknown>;
}

export interface ClientStatus {
    user_token: boolean;
    trade_check: boolean;
    site_online: boolean;
    site_notmpban: boolean;
    steam_web_api_key: boolean;
}

export interface MarketItemRecord {
    id: string;
    item: ItemInfo;
    minPrice?: number;
    price: number;
    currency: Currency;
    fixedPrice: boolean
    status: "on-sale" | "sold-awaiting-transfer" | "awaiting-seller-transfer" | "ready-to-pick-up" | "trade-protection" |"unknown";
    statusCode: string;
    isOnSale: boolean;
    firstSeenAt: string;
    lastSeenAt: string;
    lastPollAt: string;
    data?: Record<string, unknown>;
}

export interface MarketItemsSnapshotRecord {
    id: "latest";
    itemCount: number;
    onSaleCount: number;
    polledAt: string;
}
