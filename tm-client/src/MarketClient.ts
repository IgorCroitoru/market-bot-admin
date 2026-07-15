import axios, { AxiosInstance, AxiosError } from 'axios';
import Bottleneck from 'bottleneck';
import {
  ApiVersion,
  ClientOptions,
  ERROR_MESSAGES,
  HTTP_STATUS_CODES,
  MarketError,
  PingNewRequest,
  PingNewResponse,
  TradeReadyResponse,
  TradesResponse,
  TradeRequestGiveP2PAllResponse,
  RetryConfig,
  RateLimiterConfig,
  ItemsResponse,
  MassSetPriceResponse,
  SearchItemByHashNameSpecificResponse,
} from './types';
import { Currency, normalizePrice, toMarketWritePrice } from '@market-bot-admin/shared';

/**
 * Market CSGO API Client
 * Handles API communication with rate limiting and retry logic
 */
export class MarketClient {
  private axiosInstance: AxiosInstance;
  private limiter: Bottleneck;
  private retryConfig: RetryConfig;
  private apiKey: string;
  private version: ApiVersion = ApiVersion.V2;

  constructor(options: ClientOptions) {
    // Get API key from options or environment variable
    if (!options.apiKey) {
      throw new Error(
        'API key is required. Provide it via options or set MARKET_CSGO_API_KEY environment variable'
      );
    }

    this.apiKey = options.apiKey;
    this.version = options.version || ApiVersion.V2;

    // Configure retry settings
    this.retryConfig = {
      maxRetries: options.maxRetries ?? 3,
      delayMs: options.retryDelayMs ?? 1000,
      backoffMultiplier: options.retryBackoffMultiplier ?? 2,
      maxBackoffMs: options.maxBackoffMs ?? 10000,
    };

    // Create axios instance
    this.axiosInstance = axios.create({
      baseURL: options.baseUrl || 'https://market.csgo.com/api',
      timeout: options.requestTimeoutMs ?? 30000,
    });

    // Configure rate limiter: max 5 requests per second
    const requestsPerSecond = options.requestsPerSecond ?? 5;
    const rateLimiterConfig: RateLimiterConfig = {
      maxConcurrent: 1,
      minTime: 1000 / requestsPerSecond, // milliseconds between requests
    };

    this.limiter = new Bottleneck(rateLimiterConfig);

    // Add response interceptor for error handling
    this.setupInterceptors();
  }

  /**
   * Set up axios interceptors for error handling
   */
  private setupInterceptors(): void {
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => Promise.reject(this.toMarketError(error))
    );
  }

  /**
   * Execute a request with retry logic and rate limiting
   */
  private async executeWithRetry<T>(
    requestFn: () => Promise<T>
  ): Promise<T> {
    return this.limiter.schedule(async () => {
      let delay = this.retryConfig.delayMs;

      for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
        try {
          return await requestFn();
        } catch (error: any) {
          const marketError = this.toMarketError(error);

          if (!marketError.retryable || attempt === this.retryConfig.maxRetries) {
            throw marketError;
          }

          // Wait before retrying with exponential backoff
          const backoffDelay = Math.min(
            delay * Math.pow(this.retryConfig.backoffMultiplier!, attempt),
            this.retryConfig.maxBackoffMs || 10000
          );

          await this.delay(backoffDelay);
        }
      }

      throw new MarketError(ERROR_MESSAGES.RETRY_EXHAUSTED, {
        retryable: false,
      });
    });
  }

  private toMarketError(error: unknown): MarketError {
    if (error instanceof MarketError) {
      return error;
    }

    const axiosError = error as AxiosError<any>;
    const code = axiosError.response?.status;
    const responseData = axiosError.response?.data;
    const message =
      responseData?.error ||
      responseData?.message ||
      responseData?.msg ||
      axiosError.message ||
      ERROR_MESSAGES.REQUEST_FAILED;

    return new MarketError(message, {
      code,
      retryable: this.isRetryableError(axiosError),
      responseData,
      cause: error,
    });
  }

  private isRetryableError(error: AxiosError<any>): boolean {
    const statusCode = error.response?.status;

    if (!statusCode) {
      return true;
    }

    if (
      statusCode === HTTP_STATUS_CODES.UNAUTHORIZED ||
      statusCode === HTTP_STATUS_CODES.FORBIDDEN ||
      statusCode === HTTP_STATUS_CODES.NOT_FOUND
    ) {
      return false;
    }

    if (statusCode === HTTP_STATUS_CODES.RATE_LIMIT) {
      return true;
    }

    return (
      statusCode >= HTTP_STATUS_CODES.SERVER_ERROR_START &&
      statusCode <= HTTP_STATUS_CODES.SERVER_ERROR_END
    );
  }

  /**
   * Helper to create delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Build query string with API key
   */
  private buildQueryString(params?: Record<string, any>): string {
    const queryParams = new URLSearchParams();
    queryParams.append('key', this.apiKey);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    return queryParams.toString();
  }

  /**
   * Get trade requests for P2P (v2)
   * https://market.csgo.com/api/v2/trade-request-give-p2p-all?key=[your_secret_key]
   */
  async getTradeRequestGiveP2PAll(): Promise<TradeRequestGiveP2PAllResponse> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/trade-request-give-p2p-all?${this.buildQueryString()}`;
      const response = await this.axiosInstance.get<TradeRequestGiveP2PAllResponse>(url);
      return response.data;
    });
  }

  /**
   * Send ping to enable sales (v2)
   * [POST] https://market.csgo.com/api/v2/ping-new?key=[your_secret_key]
   * Body: { access_token: "...", proxy?: "..." }
   */
  async pingNew(request: PingNewRequest): Promise<PingNewResponse> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/ping-new?${this.buildQueryString()}`;
      const response = await this.axiosInstance.post<PingNewResponse>(url, request);
      return response.data;
    });
  }

  /**
   * Register trade offer as ready (v2)
   * https://market.csgo.com/api/v2/trade-ready?key=[your_secret_key]&tradeoffer=[steam_trade_offer_id]
   */
  async tradeReady(tradeofferId: string | number): Promise<TradeReadyResponse> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/trade-ready?${this.buildQueryString({
        tradeoffer: tradeofferId,
      })}`;
      const response = await this.axiosInstance.get<TradeReadyResponse>(url);
      return response.data;
    });
  }

  /**
   * Get list of active trades (v2)
   * https://market.csgo.com/api/v2/trades?key=[your_secret_key]&extended=1
   */
  async getTrades(extended: boolean = false): Promise<TradesResponse> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/trades?${this.buildQueryString({
        extended: extended ? 1 : 0,
      })}`;
      const response = await this.axiosInstance.get<TradesResponse>(url);
      return response.data;
    });
  }

  /**
   * Generic GET request method for custom endpoints
   */
  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    return this.executeWithRetry(async () => {
      const queryString = this.buildQueryString(params);
      const url = `/${this.version}/${endpoint}?${queryString}`;
      const response = await this.axiosInstance.get<T>(url);
      return response.data;
    });
  }

  /**
   * Generic POST request method for custom endpoints
   */
  async post<T>(endpoint: string, data?: any, params?: Record<string, any>): Promise<T> {
    return this.executeWithRetry(async () => {
      const queryString = this.buildQueryString(params);
      const url = `/${this.version}/${endpoint}?${queryString}`;
      const response = await this.axiosInstance.post<T>(url, data);
      return response.data;
    });
  }

  /**
   * Set API version
   */
  setVersion(version: ApiVersion): void {
    this.version = version;
  }

  /**
   * Get current API version
   */
  getVersion(): ApiVersion {
    return this.version;
  }

  /**
   * Get rate limiter stats
   */
  getRateLimiterStats() {
    return this.limiter.counts();
  }

  /**
   * Stop the rate limiter
   */
  async stop(): Promise<void> {
    await this.limiter.stop();
  }

  // ==================== SELLING ITEMS ====================

  /**
   * Put an item for sale
   * https://market.csgo.com/api/v2/add-to-sale?key=[your_secret_key]&id=[id]&price=[price]&cur=[currency]
   */
  async addToSale(id: string | number, price: number, cur: Currency = Currency.USD): Promise<any> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/add-to-sale?${this.buildQueryString({
        id,
        price: toMarketWritePrice(price, cur),
        cur,
      })}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }

  /**
   * Put multiple items for sale
   * [POST] https://market.csgo.com/api/v2/mass-add-to-sale?key=[your_secret_key]&cur=[currency]
   */
  async massAddToSale(items: Array<{ asset: number; price: number }>, cur: Currency = Currency.USD): Promise<any> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/mass-add-to-sale?${this.buildQueryString({ cur })}`;
      const marketItems = items.map((item) => ({
        ...item,
        price: toMarketWritePrice(item.price, cur),
      }));
      const response = await this.axiosInstance.post<any>(url, { items: marketItems });
      return response.data;
    });
  }

  /**
   * Set a new price on the item, or remove from sale
   * https://market.csgo.com/api/v2/set-price?key=[your_secret_key]&item_id=[item_id]&price=[price]&cur=[currency]
   */
  async setPrice(itemId: string | number, price: number, cur: Currency = Currency.USD): Promise<any> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/set-price?${this.buildQueryString({
        item_id: itemId,
        price: toMarketWritePrice(price, cur),
        cur,
      })}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }

  /**
   * Set a new price on multiple items
   * [POST] https://market.csgo.com/api/v2/mass-set-price?key=[your_secret_key]&cur=[currency]
   */
  async massSetPrice(
    items: Array<{ item_id: number; price: number }>,
    cur: Currency = Currency.USD
  ): Promise<MassSetPriceResponse> {
    if (items.length > 50) {
      throw new Error('mass-set-price accepts a maximum of 50 items per request');
    }

    return this.executeWithRetry(async () => {
      const url = `/${this.version}/mass-set-price?${this.buildQueryString({ cur })}`;
      const marketItems = items.map((item) => ({
        ...item,
        price: toMarketWritePrice(item.price, cur),
      }));
      const response = await this.axiosInstance.post<MassSetPriceResponse>(url, { items: marketItems });
      return response.data;
    });
  }

  /**
   * Set price by market hash name
   * [POST] https://market.csgo.com/api/v2/mass-set-price-mhn?key=[your_secret_key]&cur=[currency]
   */
  async massSetPriceMhn(marketHashName: string, price: number, cur: Currency = Currency.USD ): Promise<any> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/mass-set-price-mhn?${this.buildQueryString({ cur })}`;
      const response = await this.axiosInstance.post<any>(url, {
        market_hash_name: marketHashName,
        price: toMarketWritePrice(price, cur),
      });
      return response.data;
    });
  }

  /**
   * Remove all items from sale
   * https://market.csgo.com/api/v2/remove-all-from-sale?key=[your_secret_key]
   */
  async removeAllFromSale(): Promise<any> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/remove-all-from-sale?${this.buildQueryString()}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }

  // ==================== INVENTORY ====================

  /**
   * Get Steam inventory
   * https://market.csgo.com/api/v2/my-inventory?key=[your_secret_key]&lang=[lang?]
   */
  async getMyInventory(lang: string = 'en'): Promise<any> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/my-inventory?${this.buildQueryString({ lang })}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }

  /**
   * Get inventory cache status
   * https://market.csgo.com/api/v2/inventory-status?key=[your_secret_key]
   */
  async getInventoryStatus(): Promise<any> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/inventory-status?${this.buildQueryString()}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }

  /**
   * Get list of items
   * https://market.csgo.com/api/v2/items?key=[your_secret_key]
   */
  async getItems(): Promise<ItemsResponse> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/items?${this.buildQueryString()}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }

  /**
   * Search current listings by exact market hash name.
   * https://market.csgo.com/api/v2/search-item-by-hash-name-specific
   */
  async searchItemByHashNameSpecific(
    marketHashName: string,
    options: {
      withStickers?: boolean;
      lang?: 'ru' | 'en';
      withAlfaskins?: false;
    } = {}
  ): Promise<SearchItemByHashNameSpecificResponse> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/search-item-by-hash-name-specific?${this.buildQueryString({
        hash_name: marketHashName,
        with_stickers: options.withStickers ? 1 : 0,
        lang: options.lang ?? 'en',
        with_alfaskins: options.withAlfaskins ? 1 : 0,
      })}`;
      const response = await this.axiosInstance.get<SearchItemByHashNameSpecificResponse>(url);

      if (!response.data.success || !Array.isArray(response.data.data)) {
        return response.data;
      }

      return {
        ...response.data,
        data: response.data.data.map((item) => ({
          ...item,
          price: normalizePrice(item.price, response.data.currency),
        })),
      };
    });
  }

  // ==================== TRADING ====================

  /**
   * Ping to enable sales (deprecated)
   * https://market.csgo.com/api/v2/ping?key=[your_secret_key]
   */
  async ping(): Promise<any> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/ping?${this.buildQueryString()}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }

  /**
   * Create a request for the transfer of purchased items
   * https://market.csgo.com/api/v2/trade-request-take?key=[your_secret_key][&bot=botid]
   */
  async tradeRequestTake(botid?: string | number): Promise<any> {
    return this.executeWithRetry(async () => {
      const params: any = {};
      if (botid !== undefined) {
        params.bot = botid;
      }
      const url = `/${this.version}/trade-request-take?${this.buildQueryString(params)}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }

  /**
   * Create a request to transfer purchased items to bot
   * https://market.csgo.com/api/v2/trade-request-give?key=[your_secret_key]
   */
  async tradeRequestGive(): Promise<any> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/trade-request-give?${this.buildQueryString()}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }

  /**
   * Request data to transfer item to buyer (P2P)
   * https://market.csgo.com/api/v2/trade-request-give-p2p?key=[your_secret_key]
   */
  async tradeRequestGiveP2P(): Promise<any> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/trade-request-give-p2p?${this.buildQueryString()}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }

  // ==================== BUYING ITEMS ====================

  /**
   * Purchase item
   * https://market.csgo.com/api/v2/buy?key=[your_secret_key]&hash_name=[market_hash_name]&price=[price]&buy_alfaskin=[0|1]
   */
  async buy(
    options: {
      hash_name?: string;
      id?: string | number;
      price: number;
      custom_id?: string;
      buy_alfaskin?: number;
    }
  ): Promise<any> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/buy?${this.buildQueryString(options)}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }

  /**
   * Purchase and transfer item to another user
   * https://market.csgo.com/api/v2/buy-for?key=[your_secret_key]&hash_name=[market_hash_name]&price=[price]&partner=[partner]&token=[token]
   */
  async buyFor(
    options: {
      hash_name?: string;
      id?: string | number;
      price: number;
      partner: number;
      token: string;
      chance_to_transfer?: number;
      custom_id?: string;
      buy_alfaskin?: number;
    }
  ): Promise<any> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/buy-for?${this.buildQueryString(options)}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }

  // ==================== BUY TRACKING ====================

  /**
   * Get purchase status information by custom_id
   * https://market.csgo.com/api/v2/get-buy-info-by-custom-id?key=[your_secret_key]&custom_id=[custom_id]
   */
  async getBuyInfoByCustomId(customId: string): Promise<any> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/get-buy-info-by-custom-id?${this.buildQueryString({
        custom_id: customId,
      })}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }

  /**
   * Get purchase status for multiple custom_ids
   * https://market.csgo.com/api/v2/get-list-buy-info-by-custom-id?key=[your_secret_key]&custom_id[]=[custom_id1]&custom_id[]=[custom_id2]
   */
  async getListBuyInfoByCustomId(customIds: string[]): Promise<any> {
    return this.executeWithRetry(async () => {
      const params = this.buildQueryString();
      const customIdParams = customIds.map((id) => `custom_id[]=${encodeURIComponent(id)}`).join('&');
      const url = `/${this.version}/get-list-buy-info-by-custom-id?${params}&${customIdParams}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }

  /**
   * Check if trade was reversed by custom_id
   * https://market.csgo.com/api/v2/check-if-reversed-by-custom-id?key=[your_secret_key]&custom_id=[custom_id]
   */
  async checkIfReversedByCustomId(customId: string): Promise<any> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/check-if-reversed-by-custom-id?${this.buildQueryString({
        custom_id: customId,
      })}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }

  // ==================== HISTORY ====================

  /**
   * Get purchase and sale history
   * https://market.csgo.com/api/v2/history?key=[your_secret_key]&date=[date]&date_end=[date_end]
   */
  async getHistory(dateStart?: string | number, dateEnd?: string | number): Promise<any> {
    return this.executeWithRetry(async () => {
      const params: any = {};
      if (dateStart !== undefined) {
        params.date = dateStart;
      }
      if (dateEnd !== undefined) {
        params.date_end = dateEnd;
      }
      const url = `/${this.version}/history?${this.buildQueryString(params)}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }

  /**
   * Get operation history (all operations)
   * https://market.csgo.com/api/v2/operation-history?key=[your_secret_key]&date=[date]&date_end=[date_end]
   */
  async getOperationHistory(dateStart?: string | number, dateEnd?: string | number): Promise<any> {
    return this.executeWithRetry(async () => {
      const params: any = {};
      if (dateStart !== undefined) {
        params.date = dateStart;
      }
      if (dateEnd !== undefined) {
        params.date_end = dateEnd;
      }
      const url = `/${this.version}/operation-history?${this.buildQueryString(params)}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }

  // ==================== MARKET DATA ====================

  /**
   * Get item information by market hash name
   * https://market.csgo.com/api/v2/get-list-items-info?key=[your_secret_key]&list_hash_name[]=[market_hash_name]
   */
  async getListItemsInfo(hashNames: string[]): Promise<any> {
    return this.executeWithRetry(async () => {
      const params = this.buildQueryString();
      const hashParams = hashNames
        .map((name) => `list_hash_name[]=${encodeURIComponent(name)}`)
        .join('&');
      const url = `/${this.version}/get-list-items-info?${params}&${hashParams}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }

  /**
   * Get bid/ask prices for item
   * https://market.csgo.com/api/v2/bid-ask?key=[your_secret_key]&hash_name=[market_hash_name]&phase=[phase]
   */
  async getBidAsk(hashName: string, phase?: string): Promise<any> {
    return this.executeWithRetry(async () => {
      const params: any = { hash_name: hashName };
      if (phase !== undefined) {
        params.phase = phase;
      }
      const url = `/${this.version}/bid-ask?${this.buildQueryString(params)}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }

  /**
   * Test API - Check all possible obstacles to successful item selling
   * https://market.csgo.com/api/v2/test?key=[your_secret_key]
   */
  async test(): Promise<any> {
    return this.executeWithRetry(async () => {
      const url = `/${this.version}/test?${this.buildQueryString()}`;
      const response = await this.axiosInstance.get<any>(url);
      return response.data;
    });
  }
}

export default MarketClient;
