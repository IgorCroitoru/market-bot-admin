const { app } = require("@azure/functions");
const { createApiLogger } = require("../logging");
const { requireRole } = require("../auth");

app.http("me", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me",
  handler: async (request, context) => {
    const logger = createApiLogger(context);

    logger.info("Handling GET /me");

    const auth = requireRole(request, "admin");

    if (!auth.ok) {
      logger.warn("Unauthorized request to /me");
      return auth.response;
    }

    logger.info({ userId: auth.user.userId }, "Returning /me response");

    return {
      status: 200,
      jsonBody: {
        userId: auth.user.userId,
        userDetails: auth.user.userDetails,
        identityProvider: auth.user.identityProvider,
        roles: auth.user.userRoles
      }
    };
  }
});