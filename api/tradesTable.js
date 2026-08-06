const { AzureTableJsonStorage } = require("@market-bot-admin/storage");

function createStorage() {
  const tableName = process.env.AZURE_TRADE_TABLE_NAME || "Trades";
  const partitionKey = process.env.AZURE_TABLE_PARTITION_KEY;
  const connectionString = process.env.AZURE_CONNECTION_STRING;
  const storageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;

  if (!partitionKey) {
    throw new Error("AZURE_TABLE_PARTITION_KEY is required");
  }

  if (!connectionString && !storageAccountName) {
    throw new Error("AZURE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME is required");
  }

  return new AzureTableJsonStorage({
    tableName,
    partitionKey,
    connectionString,
    storageAccountName,
    createTableIfNotExists: false,
  });
}

async function listTrades(limit = 100) {
  const storage = createStorage();
  const tradeIds = await storage.listKeys();
  const records = await Promise.all(tradeIds.map((tradeId) => storage.get(tradeId)));

  return records
    .filter(Boolean)
    .sort((left, right) => tradeTimestamp(right) - tradeTimestamp(left))
    .slice(0, limit);
}

function tradeTimestamp(trade) {
  const timestamp = Date.parse(trade.updatedAt || trade.createdAt || "");
  return Number.isFinite(timestamp) ? timestamp : Number(trade.timestamp || 0);
}

module.exports = { listTrades };
