const { app } = require("@azure/functions");
const SteamTotp = require("steam-totp");
const { createApiLogger } = require("../logging");
const { requireRole } = require("../auth");

const CODE_PERIOD_SECONDS = 30;

function getSharedSecret() {
  const sharedSecret = process.env.STEAM_SHARED_SECRET;
  if (!sharedSecret) {
    throw new Error("STEAM_SHARED_SECRET is not configured");
  }
  return sharedSecret;
}

app.http("steamGuardCode", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "steam-guard-code",
  handler: async (request, context) => {
    const logger = createApiLogger(context);
    const auth = requireRole(request, "admin");

    if (!auth.ok) {
      return auth.response;
    }

    try {
      const sharedSecret = getSharedSecret();

      const nowSeconds = Math.floor(Date.now() / 1000);
      const expiresAtSeconds = (Math.floor(nowSeconds / CODE_PERIOD_SECONDS) + 1) * CODE_PERIOD_SECONDS;

      return {
        status: 200,
        headers: {
          "cache-control": "no-store, max-age=0",
          pragma: "no-cache",
        },
        jsonBody: {
          code: SteamTotp.generateAuthCode(sharedSecret),
          generatedAt: new Date(nowSeconds * 1000).toISOString(),
          expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
          validitySeconds: expiresAtSeconds - nowSeconds,
        },
      };
    } catch (error) {
      logger.error({ err: error }, "Failed to generate Steam Guard code");
      return {
        status: 500,
        headers: { "cache-control": "no-store" },
        jsonBody: { error: "Failed to generate Steam Guard code" },
      };
    }
  },
});
