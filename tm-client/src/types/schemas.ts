import { OfferGiveP2P } from ".";

export interface TradeOffer {
    id: string;
    offerP2P: OfferGiveP2P;
    botId: string; //basically user id of the tm client wo buys the item
    nik: string;
    secret: string;
    offerId?: string | number;
    status: "pending" | "queued" | "sent" | "accepted" | "rejected" | "cancelled" | "failed";
    timestamp: number;
    registered: false;
    registeredAt?: number;
    createdAt: string;
    updatedAt: string;
}

export interface ClientStatus {
    user_token: boolean;
    trade_check: boolean;
    site_online: boolean;
    site_notmpban: boolean;
    steam_web_api_key: boolean;
}