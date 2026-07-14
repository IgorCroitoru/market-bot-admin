const { app } = require("@azure/functions");
const { createApiLogger } = require("../logging");
const { requireRole } = require("../auth");
const { listMarketItems, updateMarketItem } = require("../marketItemsTable");

app.http("marketItems", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "market-items",
  handler: async (request, context) => {
    const logger = createApiLogger(context);
    const auth = requireRole(request, "admin");

    if (!auth.ok) {
      return auth.response;
    }

    try {
      const items = await listMarketItems();
      return { status: 200, jsonBody: { items } };
    } catch (error) {
      logger.error({ err: error }, "Failed to list market items");
      return { status: 500, jsonBody: { error: "Failed to load market items" } };
    }
  },
});

app.http("updateMarketItem", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "market-items/{id}",
  handler: async (request, context) => {
    const logger = createApiLogger(context);
    const auth = requireRole(request, "admin");

    if (!auth.ok) {
      return auth.response;
    }

    const itemId = request.params.id;
    let body;

    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: "Request body must be valid JSON" } };
    }

    const price = Number(body.price);
    const minPrice = Number(body.minPrice);

    if (!Number.isFinite(price) || price < 0) {
      return { status: 400, jsonBody: { error: "price must be a non-negative number" } };
    }

    if (!Number.isFinite(minPrice) || minPrice < 0) {
      return { status: 400, jsonBody: { error: "minPrice must be a non-negative number" } };
    }

    if (minPrice > price) {
      return { status: 400, jsonBody: { error: "minPrice cannot be greater than price" } };
    }

    if (typeof body.fixedPrice !== "boolean") {
      return { status: 400, jsonBody: { error: "fixedPrice must be a boolean" } };
    }

    try {
      const item = await updateMarketItem(itemId, {
        price,
        minPrice,
        fixedPrice: body.fixedPrice,
      });

      if (!item) {
        return { status: 404, jsonBody: { error: "Market item not found" } };
      }

      return { status: 200, jsonBody: { item } };
    } catch (error) {
      logger.error({ err: error, itemId }, "Failed to update market item");
      return { status: 500, jsonBody: { error: "Failed to update market item" } };
    }
  },
});
