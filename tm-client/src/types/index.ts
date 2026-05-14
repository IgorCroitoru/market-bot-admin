import type { AppLogger } from "@market-bot-admin/logging";

/**
 * Market CSGO API Types
 */

export enum ApiVersion {
  V1 = 'v1',
  V2 = 'v2',
}

export enum Currency {
  RUB = 'RUB',
  USD = 'USD',
  EUR = 'EUR',
}

export const HTTP_STATUS_CODES = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMIT: 429,
  SERVER_ERROR_START: 500,
  SERVER_ERROR_END: 599,
} as const;

export const API_ERROR_MESSAGES = {
  INVALID_ACCESS_TOKEN: 'Invalid access token'
} as const;

export const ERROR_MESSAGES = {
  MISSING_API_KEY: 'API key is required. Provide it via options or set MARKET_CSGO_API_KEY environment variable',
  REQUEST_FAILED: 'Request failed',
  RETRY_EXHAUSTED: 'Max retries exhausted',
  INVALID_API_VERSION: 'Invalid API version. Use v1 or v2',
  UNAUTHORIZED: 'Unauthorized. Check your API key and permissions',
  FORBIDDEN: 'Forbidden. You do not have access to this resource',
} as const;

export class MarketError extends Error {
  code?: number;
  retryable: boolean;
  responseData?: unknown;

  constructor(
    message: string,
    options: {
      code?: number;
      retryable?: boolean;
      responseData?: unknown;
      cause?: unknown;
    } = {}
  ) {
    super(message);
    this.name = 'MarketError';
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.responseData = options.responseData;
    if (options.cause !== undefined) {
      (this as any).cause = options.cause;
    }
  }
}


export interface ClientOptions {
  apiKey?: string;
  baseUrl?: string;
  version?: ApiVersion;
  maxRetries?: number;
  retryDelayMs?: number;
  requestsPerSecond?: number;
  retryBackoffMultiplier?: number;
  requestTimeoutMs?: number;
  maxBackoffMs?: number;
  pingIntervalMs?: number;
  logger?: AppLogger;
}

export interface ApiBaseResponse {
    success: boolean;
}

/**
 * Trade Request Response
 */
export interface TradeRequestGiveP2PAllResponse {
  [key: string]: TradeOffer;
}

export interface TradeOffer {
  id: string;
  created_at: string;
  ui_status: string;
  status: string;
  trade_offer_id: string;
  estimated_price: number;
  suggested_price: number;
  buyer_inventory?: string[];
  seller_inventory?: string[];
}

/**
 * Ping New Request/Response
 */
export interface PingNewRequest {
  access_token: string;
  proxy?: string;
}

export interface PingNewResponse extends ApiBaseResponse {
  ping: string;
  p2p: boolean;
  online: boolean;
  steamApiKey: boolean;
}

export interface PingNewErrorResponse extends ApiBaseResponse {
  message: string;
}

/**
 * Trade Ready Response
 */
export interface TradeReadyResponse extends ApiBaseResponse {
  tradeofferid: number;
  error?: string;
}

/**
 * Trades Response
 */
export interface TradesResponse extends ApiBaseResponse {
  trades: Trade[];
}

export interface Trade {
  trade_id: string;
  trade_offer_id: string;
  status: string;
  created_at: string;
  items: TradeItem[];
}

export interface TradeItem {
  id: string;
  name: string;
  price: number;
}

/**
 * API Error Response
 */
export interface ApiErrorResponse {
  success: false;
  error?: string;
}

/**
 * Retry Configuration
 */
export interface RetryConfig {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier?: number;
  maxBackoffMs?: number;
}

/**
 * Rate Limiter Configuration
 */
export interface RateLimiterConfig {
  maxConcurrent?: number;
  minTime?: number;
  reservoir?: number;
  reservoirRefreshAmount?: number;
  reservoirRefreshInterval?: number;
}

/**
 * Add to Sale Request/Response
 */
export interface AddToSaleRequest {
  id: string | number;
  price: number;
  cur: string; // RUB, USD, EUR
}

export interface AddToSaleResponse extends ApiBaseResponse {
  item_id: number;
  error?: string;
}

/**
 * Mass Add to Sale Request/Response
 */
export interface MassAddToSaleRequest {
  items: Array<{
    asset: number;
    price: number;
  }>;
}

export interface MassAddToSaleResponse extends ApiBaseResponse {
  items: Array<{
    success: boolean;
    asset: number;
    item_id?: number;
    currency?: string;
    error?: string;
  }>;
}

/**
 * Set Price Request/Response
 */
export interface SetPriceRequest {
  item_id: string | number;
  price: number;
  cur: string; // RUB, USD, EUR
}

export interface SetPriceResponse extends ApiBaseResponse {
  error?: string;
}

/**
 * Mass Set Price Request/Response
 */
export interface MassSetPriceRequest {
  items: Array<{
    item_id: number;
    price: number;
  }>;
}

export interface MassSetPriceResponse extends ApiBaseResponse {
  items?: Array<{
    success: boolean;
    item_id: number;
    price: number;
    currency: string;
    error?: string;
  }>;
  error?: string;
}

/**
 * Mass Set Price by Hash Name Request/Response
 */
export interface MassSetPriceMhnRequest {
  market_hash_name: string;
  price: number;
}

export interface MassSetPriceMhnResponse extends ApiBaseResponse {
  items?: Array<{
    success: boolean;
    item_id: number;
    price: number;
    currency: string;
  }>;
  error?: string;
}

/**
 * Remove All From Sale Response
 */
export interface RemoveAllFromSaleResponse extends ApiBaseResponse {
  count: number;
}

/**
 * My Inventory Response
 */
export interface InventoryItem {
  id: string;
  classid: string;
  instanceid: string;
  market_hash_name: string;
  market_price: number;
  tradable: number;
}

export interface MyInventoryResponse extends ApiBaseResponse {
  items: InventoryItem[];
}

/**
 * Inventory Status Response
 */
export interface InventoryStatusResponse extends ApiBaseResponse {
  is_updating: boolean;
  last_time_update: number;
  last_time_success_update: number;
  items: number;
}

/**
 * Items Response
 */
export interface ItemInfo {
  item_id: string;
  assetid: string;
  classid: string;
  instanceid: string;
  real_instance: string;
  market_hash_name: string;
  position: number;
  price: number;
  currency: string;
  source: string;
  status: string;
  live_time: number;
  left: null | number;
  botid: string;
  settlement: number;
}

export interface ItemsResponse extends ApiBaseResponse {
  items: ItemInfo[];
}

/**
 * Trade Request Take Response
 */
export interface TradeRequestTakeResponse extends ApiBaseResponse {
  trade: string;
  nick: string;
  botid: string;
  profile: string;
  secret: string;
  items: string[];
  error?: string | number;
}

/**
 * Trade Request Give Response
 */
export interface TradeRequestGiveResponse extends ApiBaseResponse {
  trade: string;
  nick: string;
  botid: string;
  profile: string;
  secret: string;
  items: number[];
}

/**
 * Trade Request Give P2P Response
 */
export interface TradeRequestGiveP2PResponse extends ApiBaseResponse {
  hash: string;
  offer: {
    partner: number;
    token: string;
    tradeoffermessage: string;
    items: Array<{
      appid: number;
      contextid: number;
      assetid: number;
      amount: number;
    }>;
  };
}

/**
 * Buy Request/Response
 */
export interface BuyRequest {
  hash_name?: string;
  id?: string | number;
  price: number;
  custom_id?: string;
  buy_alfaskin?: number;
}

export interface BuyResponse extends ApiBaseResponse {
  id: string;
  error?: string;
  code?: number;
}

/**
 * Buy For Request/Response
 */
export interface BuyForRequest extends BuyRequest {
  partner: number;
  token: string;
  chance_to_transfer?: number;
}

/**
 * Get Buy Info Response
 */
export interface BuyInfoRefund {
  amount: number;
  currency: string;
  refund_id: number;
}

export interface GetBuyInfoResponse extends ApiBaseResponse {
  data: {
    item_id: string;
    market_hash_name: string;
    classid: string;
    instance: string;
    time: string;
    settlement: string;
    send_until: null | string;
    stage: string;
    paid: number;
    causer: string;
    refund: {
      seller?: BuyInfoRefund;
      market?: BuyInfoRefund;
    };
    currency: string;
    for: string | null;
    trade_id: string | null;
  };
}

/**
 * Get List Buy Info Response
 */
export interface GetListBuyInfoResponse extends ApiBaseResponse {
  data: {
    [key: string]: GetBuyInfoResponse['data'];
  };
}

/**
 * Check if Reversed Response
 */
export interface CheckIfReversedResponse extends ApiBaseResponse {
  message: string;
}

/**
 * History Entry
 */
export interface HistoryEntry {
  item_id: string;
  market_hash_name: string;
  class: string;
  instance: string;
  time: string;
  event: string;
  app: number;
  stage: string;
  for: null | string;
  custom_id: null | string;
  paid?: number;
  received?: number;
  currency: string;
  causer?: string;
  refund?: {
    seller?: BuyInfoRefund;
    market?: BuyInfoRefund;
  };
}

export interface HistoryResponse extends ApiBaseResponse {
  data: HistoryEntry[];
}

/**
 * Operation History Entry
 */
export interface OperationHistoryEntry {
  time: string;
  settlement: string;
  causer?: string;
  refund?: {
    seller?: BuyInfoRefund;
    market?: BuyInfoRefund;
  };
  event: string;
  item_id?: string;
  market_hash_name?: string | null;
  class?: string | null;
  instance?: string | null;
  price?: number | string;
  received?: number | string;
  paid?: number | string;
  currency: string;
  stage?: string;
  for?: null | string;
  custom_id?: null | string;
  app?: number;
  id?: string;
  amount?: number | string;
  status?: string;
}

export interface OperationHistoryResponse extends ApiBaseResponse {
  data: OperationHistoryEntry[];
}

/**
 * Get List Items Info Response
 */
export interface ListItemsInfoData {
  max: number;
  min: number;
  average: number;
  history: Array<[number, number]>;
}

export interface GetListItemsInfoResponse extends ApiBaseResponse {
  currency: string;
  data: {
    [key: string]: ListItemsInfoData;
  };
}

/**
 * Bid Ask Response
 */
export interface BidAskOrder {
  price: string;
  total: string;
}

export interface BidAskResponse extends ApiBaseResponse {
  bid: BidAskOrder[];
  ask: BidAskOrder[];
  currency: string;
}

/**
 * Test Response
 */
export interface TestResponse extends ApiBaseResponse {
  [key: string]: any;
}
