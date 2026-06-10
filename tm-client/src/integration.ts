/**
 * Integration Example - Market CSGO API Client
 * Demonstrates all features and best practices
 */

import { MarketClient, ApiVersion, Currency, OfferGiveP2P } from './index';
import { createLogger, type AppLogger } from '@market-bot-admin/logging';
import { logger } from './logger';
import { loadApiOptionsFromEnv, loadAzureBlobStorageOptionsFromEnv, loadAzureQueueOptionsFromEnv, loadAzureTableStorageOptionsFromEnv } from './config';
import { AzureStorageQueue, AzureQueueConfig } from '@market-bot-admin/queue';
import {AzureBlobStorage, AzureTableJsonStorage, ReadonlyStorage, ReadonlyTableStorage, TableStorage} from "@market-bot-admin/storage";
import { 
  BotStorageItems, 
  TokenCache, 
  MessageDefaultBody, 
  TradeStatusChangedMessage, 
  BotStatusChangedMessage } from '@market-bot-admin/shared';
import { TradeStorageService } from './TradeStorageService';


type Messages = MessageDefaultBody & (TradeStatusChangedMessage | BotStatusChangedMessage);

class MarketBotIntegration {
  private client: MarketClient;
  private pingInterval: NodeJS.Timeout | null = null;
  private tradeStatusPollInterval: NodeJS.Timeout | null = null;
  private tokensPollInterval: NodeJS.Timeout | null = null;
  private logger: AppLogger;
  private azureQueue: AzureStorageQueue<Messages>;
  private tokensCache: TokenCache | null = null;
  private readonly botStorage: ReadonlyStorage<BotStorageItems>;
  private readonly tradesService: TradeStorageService;
  constructor() {
    this.logger = logger; 
    const options = loadApiOptionsFromEnv(process.env);
    const azureQueueConfig = loadAzureQueueOptionsFromEnv(process.env);
    const azureBlobStorageConfig = loadAzureBlobStorageOptionsFromEnv(process.env);
    const azureTableStorageConfig = loadAzureTableStorageOptionsFromEnv(process.env);
    this.azureQueue = new AzureStorageQueue(azureQueueConfig);
    // Initialize with full configuration
    this.client = new MarketClient(options);

    this.botStorage = new AzureBlobStorage(azureBlobStorageConfig);
     
    this.tradesService = new TradeStorageService(new AzureTableJsonStorage(azureTableStorageConfig));
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
      const tokenCache = await this.botStorage.getData("token-cache");
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
          this.logger.debug(`Ping successful at ${new Date().toISOString()}`);
        } else {
          this.logger.warn(response, `Ping failed`);
        }
      } catch (error) {
        this.logger.error(error, 'Ping error');
      }
  }
  
  async wasOfferAlreadySent(offer:OfferGiveP2P & {
        hash: string;
      }): Promise<boolean> {
    // Implementation for checking if offer was already sent
    return false;
  }

  async processP2PTrades(): Promise<void> {
    try {
      this.logger.info('Fetching P2P trade requests...');
      const tradeRequests = await this.client.getTradeRequestGiveP2PAll();
      if (tradeRequests.success) {
        for (const offer of tradeRequests.offers) {
          if (!(await this.wasOfferAlreadySent(offer))) {
            this.logger.info({ offerId: offer.hash }, 'Processing new P2P trade offer');

          }
        }
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
          this.logger.info(`Trade ${offerId} marked as ready`);
        } else {
          this.logger.warn(
            { offerId, error: response.error },
            `Trade failed`
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
      const tradesData = await this.client.getTrades(false);

      if (tradesData.success) {
        this.logger.info(`Found ${tradesData.trades.length} active trades`);
        
        
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
        this.logger.info({ item_id: response.id }, 'Purchase successful');

        // Track the purchase
        const customId = `buy_${Date.now()}`;
        setTimeout(async () => {
          const buyInfo = await this.client.getBuyInfoByCustomId(customId);
          this.logger.info({ buyInfo }, 'Purchase status');
        }, 5000);
      } else {
        this.logger.error(
          { error: response.error, code: response.code },
          'Purchase failed'
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
          this.logger.info({ item_id: response.item_id }, 'Item added to sale');
        } else {
          this.logger.error({ error: response.error }, 'Failed to add item');
        }
      }
    } catch (error) {
      this.logger.error(error, 'Error adding items for sale');
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
