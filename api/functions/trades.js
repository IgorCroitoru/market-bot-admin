const { app } = require("@azure/functions");
const { createApiLogger } = require("../logging");
const { requireRole } = require("../auth");
const { listTrades } = require("../tradesTable");

app.http("trades", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "trades",
  handler: async (request, context) => {
    const logger = createApiLogger(context);
    const auth = requireRole(request, "admin");

    if (!auth.ok) {
      return auth.response;
    }

    const requestedLimit = Number(request.query.get("limit") || 100);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(250, Math.max(1, requestedLimit))
      : 100;

    try {
      const trades = await listTrades(limit);
      return { status: 200, jsonBody: { trades } };
    } catch (error) {
      logger.error({ err: error }, "Failed to list trade history");
      return { status: 500, jsonBody: { error: "Failed to load trade history" } };
    }
  },
});
