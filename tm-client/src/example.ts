/**
 * Example usage of Market CSGO API Client
 */

import { MarketClient, ApiVersion } from './index';
import { createLogger } from '@market-bot-admin/logging';

const logger = createLogger({
  service: 'market-client',
  environment: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
  level: 'info',
});

async function main() {
  try {
    // Initialize client with API key from environment variable
    // Set MARKET_CSGO_API_KEY environment variable
    const client = new MarketClient({
      version: ApiVersion.V2,
      maxRetries: 3,
      retryDelayMs: 1000,
      requestsPerSecond: 5, // Max 5 requests per second
    });

    // ==================== SELLING ITEMS ====================

    // Example 1: Add single item for sale
    logger.info('Adding item for sale...');
    const addResponse = await client.addToSale('14933635912', 1034, 'USD');
    logger.info({ addResponse }, 'Add to sale response');

    // Example 2: Add multiple items for sale
    logger.info('Adding multiple items for sale...');
    const massAddResponse = await client.massAddToSale(
      [
        { asset: 42403178768, price: 1900 },
        { asset: 42222704480, price: 1800 },
      ],
      'USD'
    );
    logger.info({ massAddResponse }, 'Mass add response');

    // Example 3: Set price on item
    logger.info('Setting price...');
    const setPriceResponse = await client.setPrice(5712803716, 1600, 'USD');
    logger.info({ setPriceResponse }, 'Set price response');

    // Example 4: Set price on multiple items
    logger.info('Setting prices on multiple items...');
    const massSetPriceResponse = await client.massSetPrice(
      [
        { item_id: 5712803716, price: 1600 },
        { item_id: 5712803717, price: 1700 },
      ],
      'USD'
    );
    logger.info({ massSetPriceResponse }, 'Mass set price response');

    // ==================== INVENTORY ====================

    // Example 5: Get inventory
    logger.info('Getting inventory...');
    const inventory = await client.getMyInventory('en');
    logger.info(
      { itemCount: inventory.items.length },
      'My inventory'
    );

    // Example 6: Get inventory status
    logger.info('Getting inventory status...');
    const inventoryStatus = await client.getInventoryStatus();
    logger.info({ inventoryStatus }, 'Inventory status');

    // Example 7: Get all items for sale
    logger.info('Getting items for sale...');
    const items = await client.getItems();
    logger.info({ itemCount: items.items.length }, 'Items for sale');

    // ==================== TRADING ====================

    // Example 8: Ping to keep sales enabled
    logger.info('Pinging...');
    const pingResponse = await client.pingNew({
      access_token: 'your_access_token_here',
      // proxy: 'http://login:pass@proxy_ip:port', // optional
    });
    logger.info({ pingResponse }, 'Ping response');

    // Example 9: Get P2P trade requests
    logger.info('Getting P2P trade requests...');
    const tradeRequests = await client.getTradeRequestGiveP2PAll();
    logger.info(
      { tradeCount: Object.keys(tradeRequests).length },
      'P2P trades'
    );

    // Example 10: Mark trade as ready
    logger.info('Marking trade as ready...');
    const tradeReadyResponse = await client.tradeReady('1234567890');
    logger.info({ tradeReadyResponse }, 'Trade ready response');

    // Example 11: Get active trades
    logger.info('Getting active trades...');
    const trades = await client.getTrades(true);
    logger.info({ tradeCount: trades.trades.length }, 'Active trades');

    // ==================== BUYING ITEMS ====================

    // Example 12: Buy item
    logger.info('Buying item...');
    const buyResponse = await client.buy({
      hash_name: 'M4A4 | Asiimov (Factory New)',
      price: 25000,
      custom_id: `order_${Date.now()}`,
      buy_alfaskin: 0,
    });
    logger.info({ buyResponse }, 'Buy response');

    // Example 13: Buy for another user
    logger.info('Buying item for another user...');
    const buyForResponse = await client.buyFor({
      hash_name: 'AWP Dragon Lore (Factory New)',
      price: 500000,
      partner: 12345,
      token: 'ffffffff',
      custom_id: `trade_${Date.now()}`,
    });
    logger.info({ buyForResponse }, 'Buy for response');

    // ==================== BUY TRACKING ====================

    // Example 14: Get buy info by custom ID
    logger.info('Getting buy info...');
    const buyInfo = await client.getBuyInfoByCustomId(`order_${Date.now()}`);
    logger.info({ buyInfo }, 'Buy info');

    // Example 15: Get list buy info
    logger.info('Getting list buy info...');
    const listBuyInfo = await client.getListBuyInfoByCustomId([
      'order_1',
      'order_2',
    ]);
    logger.info({ listBuyInfo }, 'List buy info');

    // ==================== HISTORY ====================

    // Example 16: Get transaction history
    logger.info('Getting transaction history...');
    const history = await client.getHistory('01-01-2025');
    logger.info({ transactionCount: history.data?.length || 0 }, 'History');

    // Example 17: Get operation history
    logger.info('Getting operation history...');
    const operationHistory = await client.getOperationHistory();
    logger.info(
      { operationCount: operationHistory.data?.length || 0 },
      'Operation history'
    );

    // ==================== MARKET DATA ====================

    // Example 18: Get item info
    logger.info('Getting item info...');
    const itemInfo = await client.getListItemsInfo([
      'M4A4 | Asiimov (Factory New)',
    ]);
    logger.info({ itemInfo }, 'Item info');

    // Example 19: Get bid/ask prices
    logger.info('Getting bid/ask prices...');
    const bidAsk = await client.getBidAsk('M4A4 | Asiimov (Factory New)');
    logger.info(
      {
        bidCount: bidAsk.bid.length,
        askCount: bidAsk.ask.length,
        currency: bidAsk.currency,
      },
      'Bid/Ask'
    );

    // Example 20: API test
    logger.info('Testing API...');
    const testResponse = await client.test();
    logger.info({ testResponse }, 'API test response');

    // ==================== RATE LIMITING ====================

    // Check rate limiter stats
    logger.info(client.getRateLimiterStats(), 'Rate limiter stats');

    // Switch API version
    client.setVersion(ApiVersion.V1);
    logger.info(`Switched to API version: ${client.getVersion()}`);
    client.setVersion(ApiVersion.V2);

    // Gracefully stop the client
    await client.stop();
    logger.info('Client stopped');
  } catch (error) {
    logger.error(error, 'Error occurred');
  }
}

// Uncomment to run the example
// main();
