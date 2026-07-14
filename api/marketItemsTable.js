const { AzureTableJsonStorage } = require("@market-bot-admin/storage");
const { normalizePrice } = require("@market-bot-admin/shared");

const SNAPSHOT_ROW_KEY = "latest";
function createStorage() {
  const tableName = process.env.AZURE_MARKET_ITEMS_TABLE_NAME || "MarketItems";
  const partitionKey = process.env.AZURE_TABLE_PARTITION_KEY;
  const connectionString = process.env.AZURE_CONNECTION_STRING;
  const storageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;

  if (!partitionKey) {
    throw new Error("AZURE_TABLE_PARTITION_KEY is required");
  }

  if (!connectionString && !storageAccountName) {
    throw new Error(
      "AZURE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME is required"
    );
  }

  return new AzureTableJsonStorage({
    tableName,
    partitionKey,
    connectionString,
    storageAccountName,
    createTableIfNotExists: false,
  });
}

async function listMarketItems() {
  const storage = createStorage();
  const itemIds = (await storage.listKeys()).filter((key) => key !== SNAPSHOT_ROW_KEY);
  const records = await Promise.all(itemIds.map((itemId) => storage.get(itemId)));

  return records
    .filter(Boolean)
    .sort((left, right) =>
      String(left.item?.market_hash_name || left.id).localeCompare(
        String(right.item?.market_hash_name || right.id)
      )
    );
}

async function updateMarketItem(itemId, changes) {
  const storage = createStorage();
  const record = await storage.get(itemId);

  if (!record) {
    return null;
  }

  const updatedAt = new Date().toISOString();
  const price = normalizePrice(changes.price, record.currency);
  const minPrice = normalizePrice(changes.minPrice, record.currency);
  const updatedRecord = {
    ...record,
    price,
    minPrice,
    fixedPrice: changes.fixedPrice,
    item: {
      ...record.item,
      price,
    },
    data: {
      ...record.data,
      previousPrice: record.price,
      adminUpdatedAt: updatedAt,
    },
  };

  await storage.set(itemId, updatedRecord);
  return updatedRecord;
}

module.exports = {
  listMarketItems,
  updateMarketItem,
};
