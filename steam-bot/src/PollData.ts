export interface OfferData {
  dealId?: number;
  partnerId?: string;
  errorLogs?: string;
  trade_offer_expiry_at?: number;
  trade_offer_created_at?: number;
  trade_offer_finished_at?: number;
}

export interface PollData {
  sent?: Record<string, number>;
  received?: Record<string, number>;
  timestamps?: Record<string, number>;
  offersSince?: number;
  offerData?: Record<string, OfferData>;
  [key: string]: unknown;
}
