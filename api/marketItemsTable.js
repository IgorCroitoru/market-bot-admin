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

async function updateMarketItemMinimumPrices(changes) {
  const storage = createStorage();
  const records = await Promise.all(changes.map(({ id }) => storage.get(id)));
  const missingIndex = records.findIndex((record) => !record);

  if (missingIndex >= 0) {
    const error = new Error(`Market item ${changes[missingIndex].id} not found`);
    error.code = "MARKET_ITEM_NOT_FOUND";
    throw error;
  }

  const updatedAt = new Date().toISOString();
  const updatedRecords = records.map((record, index) => {
    const minPrice = normalizePrice(changes[index].minPrice, record.currency);

    if (minPrice > record.price) {
      const error = new Error(`Minimum price for ${changes[index].id} cannot exceed market price`);
      error.code = "MIN_PRICE_ABOVE_MARKET_PRICE";
      throw error;
    }

    return {
      ...record,
      minPrice,
      fixedPrice: changes[index].fixedPrice,
      data: {
        ...record.data,
        adminUpdatedAt: updatedAt,
      },
    };
  });

  await Promise.all(
    updatedRecords.map((record, index) => storage.set(changes[index].id, record))
  );
  return updatedRecords;
}

module.exports = {
  listMarketItems,
  updateMarketItemMinimumPrices,
};
