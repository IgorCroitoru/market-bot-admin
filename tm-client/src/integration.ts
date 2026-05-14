/**
 * Integration Example - Market CSGO API Client
 * Demonstrates all features and best practices
 */

import { MarketClient, ApiVersion, Currency } from './index';
import { createLogger, type AppLogger } from '@market-bot-admin/logging';
import { logger } from './logger';
import { loadApiOptionsFromEnv, loadAzureQueueConfigFromEnv } from './config';
import { AzureStorageQueue, AzureQueueConfig } from '@market-bot-admin/queue';
import {AzureBlobStorage, ReadonlyStorage} from "@market-bot-admin/storage";
import { BotStorageItems, TokenCache } from '@market-bot-admin/shared';
import { log } from 'console';
type TradeStatusChangedMessage = {
  type: 'trade-status-changed';
  tradeId: string;
  offerId: number;
  oldStatus: string;
  newStatus: string;
}

type BotStatusChangedMessage = {
  type: 'bot-status-changed';
  status: string;
}

type MessageDefaultBody = {
  type: string;
}
type Messages = MessageDefaultBody & (TradeStatusChangedMessage | BotStatusChangedMessage);

class MarketBotIntegration {
  private client: MarketClient;
  private pingInterval: NodeJS.Timeout | null = null;
  private tradeStatusPollInterval: NodeJS.Timeout | null = null;
  private tokensPollInterval: NodeJS.Timeout | null = null;
  private logger: AppLogger;
  private azureQueue: AzureStorageQueue<Messages>;
  private tokensCache: TokenCache | null = null;
  private readonly storage: ReadonlyStorage<BotStorageItems>;
  constructor() {
    this.logger = logger; 
    const options = loadApiOptionsFromEnv(process.env);
    const azureQueueConfig = loadAzureQueueConfigFromEnv(process.env);
    this.azureQueue = new AzureStorageQueue(azureQueueConfig);
    // Initialize with full configuration
    this.client = new MarketClient(options);

    this.storage = new AzureBlobStorage({
      accountName: String(process.env.ACCOUNT_NAME),
      storageAccountName: String(process.env.AZURE_STORAGE_ACCOUNT_NAME),
      containerName: String(process.env.AZURE_BOT_CONTAINER_NAME),
     });
  }

  get azureQueueClient(): AzureStorageQueue<Messages> {
    return this.azureQueue;
  }

  async setQueueMessage(message: Messages): Promise<void> {
    await this.azureQueue.send(message);
  }

  async startTokensPolling(): Promise<void> {
     if (this.tokensPollInterval) {
      clearInterval(this.tokensPollInterval);
    }

    await this.loadTokensFromStorage();

    this.tokensPollInterval = setInterval(async () => {
      await this.loadTokensFromStorage();
      }, 5 * 60 * 1000); // Every 5 minutes
  }

  async loadTokensFromStorage(): Promise<void> {
    try {
      const tokenCache = await this.storage.getData("token-cache");
      this.tokensCache = tokenCache;
    } catch (error) {
      this.logger.error(error, 'Error loading tokens from storage');
    }
  }

  async startPeriodicPing(): Promise<void> {
    this.logger.info('Starting periodic ping...');

    await this.ping();

    // Then schedule it every 3 minutes (180000ms)
    this.pingInterval = setInterval(() => this.ping(), 180000);
  }

  async ping(): Promise<void> {
    if(!this.tokensCache || !this.tokensCache.accessToken) {
        this.logger.warn('No access token available, skipping ping');
        return;
      }
      try {
        const response = await this.client.pingNew({
          access_token: this.tokensCache.accessToken,
        });

        if (response.success) {
          this.logger.info(`✓ Ping successful at ${new Date().toISOString()}`);
          this.logger.info(response, 'Ping response');
        } else {
          this.logger.warn(response, `✗ Ping failed`);
        }
      } catch (error) {
        this.logger.error(error, 'Ping error');
      }
  }
  /**
   * Example 2: Fetch and process all P2P trade requests
   */
  async processP2PTrades(): Promise<void> {
    try {
      this.logger.info('Fetching P2P trade requests...');
      const tradeRequests = await this.client.getTradeRequestGiveP2PAll();

      const tradeIds = Object.keys(tradeRequests);
      this.logger.info(`Found ${tradeIds.length} trade requests`);

      // Process each trade
      for (const tradeId of tradeIds) {
        const trade = tradeRequests[tradeId];
        this.logger.info(
          {
            tradeId,
            status: trade.ui_status,
            price: trade.estimated_price,
          },
          'Trade details'
        );
      }
    } catch (error) {
      this.logger.error(error, 'Error processing P2P trades');
    }
  }

  /**
   * Example 3: Register trades and mark them as ready
   */
  async registerTrades(tradeOfferIds: string[]): Promise<void> {
    this.logger.info(`Registering ${tradeOfferIds.length} trades...`);

    for (const offerId of tradeOfferIds) {
      try {
        const response = await this.client.tradeReady(offerId);

        if (response.success) {
          this.logger.info(`✓ Trade ${offerId} marked as ready`);
        } else {
          this.logger.warn(
            { offerId, error: response.error },
            `✗ Trade failed`
          );
        }
      } catch (error) {
        this.logger.error({ offerId, error }, 'Error registering trade');
      }
    }
  }

  /**
   * Example 4: Monitor active trades
   */
  async monitorActiveTrades(): Promise<void> {
    try {
      this.logger.info('Fetching active trades...');
      const tradesData = await this.client.getTrades(true);

      if (tradesData.success) {
        this.logger.info(`Found ${tradesData.trades.length} active trades`);

        for (const trade of tradesData.trades) {
          const totalValue = trade.items.reduce(
            (sum, item) => sum + item.price,
            0
          );
          this.logger.info(
            {
              tradeId: trade.trade_id,
              status: trade.status,
              itemCount: trade.items.length,
              totalValue,
            },
            'Trade info'
          );
        }
      }
    } catch (error) {
      this.logger.error(error, 'Error fetching trades');
    }
  }

  /**
   * Example 5: Manage inventory and sales
   */
  async manageInventory(): Promise<void> {
    try {
      // Get inventory status
      const status = await this.client.getInventoryStatus();
      this.logger.info(
        {
          is_updating: status.is_updating,
          items: status.items,
        },
        'Inventory status'
      );

      // Get my inventory
      const inventory = await this.client.getMyInventory('en');
      this.logger.info(`Found ${inventory.items.length} items in inventory`);

      // Get current items for sale
      const items = await this.client.getItems();
      this.logger.info(
        {
          count: items.items.length,
          statuses: items.items.map((i: any) => i.status),
        },
        'Items for sale'
      );
    } catch (error) {
      this.logger.error(error, 'Error managing inventory');
    }
  }

  /**
   * Example 6: Buying items
   */
  async buyItem(itemHash: string, maxPrice: number): Promise<void> {
    try {
      this.logger.info(`Attempting to buy ${itemHash} for max $${maxPrice / 1000}`);

      const response = await this.client.buy({
        hash_name: itemHash,
        price: maxPrice,
        custom_id: `buy_${Date.now()}`,
        buy_alfaskin: 0,
      });

      if (response.success) {
        this.logger.info({ item_id: response.id }, '✓ Purchase successful');

        // Track the purchase
        const customId = `buy_${Date.now()}`;
        setTimeout(async () => {
          const buyInfo = await this.client.getBuyInfoByCustomId(customId);
          this.logger.info({ buyInfo }, 'Purchase status');
        }, 5000);
      } else {
        this.logger.error(
          { error: response.error, code: response.code },
          '✗ Purchase failed'
        );
      }
    } catch (error) {
      this.logger.error(error, 'Error buying item');
    }
  }

  /**
   * Example 7: Add items for sale
   */
  async addItemsForSale(
    items: Array<{ id: string; price: number }>
  ): Promise<void> {
    try {
      this.logger.info(`Adding ${items.length} items for sale...`);

      for (const item of items) {
        const response = await this.client.addToSale(item.id, item.price, Currency.USD);
        if (response.success) {
          this.logger.info({ item_id: response.item_id }, '✓ Item added to sale');
        } else {
          this.logger.error({ error: response.error }, '✗ Failed to add item');
        }
      }
    } catch (error) {
      this.logger.error(error, 'Error adding items for sale');
    }
  }

  /**
   * Example 8: Update prices
   */
  async updatePrices(
    items: Array<{ item_id: number; price: number }>
  ): Promise<void> {
    try {
      this.logger.info(`Updating prices for ${items.length} items...`);

      const response = await this.client.massSetPrice(items, Currency.USD);

      if (response.success && response.items) {
        response.items.forEach((item: any) => {
          if (item.success) {
            this.logger.info(
              { item_id: item.item_id, price: item.price },
              '✓ Price updated'
            );
          } else {
            this.logger.error(
              { item_id: item.item_id, error: item.error },
              '✗ Price update failed'
            );
          }
        });
      }
    } catch (error) {
      this.logger.error(error, 'Error updating prices');
    }
  }

  /**
   * Example 9: Get market data
   */
  async getMarketData(itemHashes: string[]): Promise<void> {
    try {
      this.logger.info(`Fetching market data for ${itemHashes.length} items...`);

      const info = await this.client.getListItemsInfo(itemHashes);

      if (info.success) {
        Object.entries(info.data).forEach(([hash, data]: [string, any]) => {
          this.logger.info(
            {
              item: hash,
              min: data.min,
              max: data.max,
              avg: data.average,
            },
            'Market data'
          );
        });
      }

      // Also get bid/ask prices
      if (itemHashes.length > 0) {
        const bidAsk = await this.client.getBidAsk(itemHashes[0]);
        this.logger.info(
          {
            item: itemHashes[0],
            bid_count: bidAsk.bid.length,
            ask_count: bidAsk.ask.length,
          },
          'Bid/Ask prices'
        );
      }
    } catch (error) {
      this.logger.error(error, 'Error fetching market data');
    }
  }


  async getTransactionHistory(): Promise<void> {
    try {
      // Get history for last 30 days
      const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
      const now = Math.floor(Date.now() / 1000);

      const history = await this.client.getHistory(thirtyDaysAgo, now);

      if (history.success && history.data) {
        this.logger.info(`Found ${history.data.length} transactions`);

        // Separate buys and sells
        const buys = history.data.filter((h: any) => h.event === 'buy');
        const sells = history.data.filter((h: any) => h.event === 'sell');

        this.logger.info({ count: buys.length }, 'Total buys');
        this.logger.info({ count: sells.length }, 'Total sells');
      }
    } catch (error) {
      this.logger.error(error, 'Error fetching history');
    }
  }

  async monitorRateLimiting(): Promise<void> {
    this.logger.info(this.client.getRateLimiterStats(), 'Rate limiter stats');

    // Make several requests to see the queue
    const promises = [
      this.client.getTrades(),
      this.client.getTrades(),
      this.client.getTrades(),
    ];

    this.logger.info('Made 3 concurrent requests');
    this.logger.info(this.client.getRateLimiterStats(), 'Rate limiter stats');

    await Promise.all(promises);
    this.logger.info(
      this.client.getRateLimiterStats(),
      'After requests completed'
    );
  }

  /**
   * Example 13: Error handling and retries
   */
  async demonstrateErrorHandling(): Promise<void> {
    try {
      // This will retry up to 3 times if 5xx errors occur
      const response = await this.client.getTrades();
      this.logger.info(response, 'Request succeeded');
    } catch (error: any) {
      if (error.response?.status === 401) {
        this.logger.error(
          'Authentication failed - invalid API key'
        );
      } else if (error.response?.status === 429) {
        this.logger.error('Rate limited - too many requests');
      } else if (error.response?.status >= 500) {
        this.logger.error(
          { status: error.response?.status },
          'Server error (retry failed)'
        );
      } else if (!error.response) {
        this.logger.error(error, 'Network error');
      }
    }
  }

  /**
   * Clean up and stop
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping integration...');

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.logger.info('Stopped periodic ping');
    }

    await this.client.stop();
    this.logger.info('Client stopped');
  }
}


export async function main() {
  const integration = new MarketBotIntegration();
  let stopping = false;

  const stopIntegration = async (): Promise<void> => {
    if (stopping) {
      return;
    }

    stopping = true;
    await integration.stop();
  };

  process.once('SIGINT', () => {
    void stopIntegration();
  });

  process.once('SIGTERM', () => {
    void stopIntegration();
  });

  try {
    await integration.startTokensPolling();
    await integration.startPeriodicPing();
    logger.info('Integration started and running until shutdown signal');
  } catch (error) {
    logger.error(error, 'Integration error');
  }
}

// Uncomment to run:
// main();

export { MarketBotIntegration };
