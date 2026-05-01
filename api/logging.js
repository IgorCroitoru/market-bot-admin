const { createLogger } = require("@market-bot-admin/logging");

function createApiLogger(context) {
  return createLogger({
    service: "api",
    environment: "dev",
    level: "debug",
    context: {
      invocationId: context?.invocationId,
      functionName: context?.functionName
    }
  });
}

module.exports = {
  createApiLogger
};