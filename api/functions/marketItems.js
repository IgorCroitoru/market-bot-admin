const { app } = require("@azure/functions");
const { createApiLogger } = require("../logging");
const { requireRole } = require("../auth");
const { listMarketItems, updateMarketItemMinimumPrices } = require("../marketItemsTable");

app.http("marketItems", {
  methods: ["GET", "PATCH"],
  authLevel: "anonymous",
  route: "market-items",
  handler: async (request, context) => {
    const logger = createApiLogger(context);
    const auth = requireRole(request, "admin");

    if (!auth.ok) {
      return auth.response;
    }

    if (request.method === "GET") {
      try {
        const items = await listMarketItems();
        return { status: 200, jsonBody: { items } };
      } catch (error) {
        logger.error({ err: error }, "Failed to list market items");
        return { status: 500, jsonBody: { error: "Failed to load market items" } };
      }
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: "Request body must be valid JSON" } };
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return { status: 400, jsonBody: { error: "items must be a non-empty array" } };
    }

    const invalidChange = body.items.find((item) =>
      !item || typeof item.id !== "string" || item.id.length === 0 ||
      !Number.isFinite(Number(item.minPrice)) || Number(item.minPrice) < 0 ||
      typeof item.fixedPrice !== "boolean"
    );
    if (invalidChange) {
      return {
        status: 400,
        jsonBody: { error: "Each item requires an id, non-negative minPrice, and fixedPrice boolean" },
      };
    }

    if (new Set(body.items.map((item) => item.id)).size !== body.items.length) {
      return { status: 400, jsonBody: { error: "Item ids must be unique" } };
    }

    try {
      const changes = body.items.map((item) => ({
        id: item.id,
        minPrice: Number(item.minPrice),
        fixedPrice: item.fixedPrice,
      }));
      const items = await updateMarketItemMinimumPrices(changes);
      return { status: 200, jsonBody: { items } };
    } catch (error) {
      if (error.code === "MARKET_ITEM_NOT_FOUND") {
        return { status: 404, jsonBody: { error: error.message } };
      }
      if (error.code === "MIN_PRICE_ABOVE_MARKET_PRICE") {
        return { status: 400, jsonBody: { error: error.message } };
      }
      logger.error({ err: error }, "Failed to update market item minimum prices");
      return { status: 500, jsonBody: { error: "Failed to update market item minimum prices" } };
    }
  },
});
