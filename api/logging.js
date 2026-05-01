const pino = require("pino");

function createLogger(options) {
  return pino({
    level: options.level ?? "info",
    base: {
      service: options.service,
      environment: options.environment,
      ...options.context
    },
    redact: {
      paths: [
        "steamPassword",
        "steamSharedSecret",
        "steamIdentitySecret",
        "steamRefreshToken",
        "marketCsgoApiKey",
        "password",
        "sharedSecret",
        "identitySecret",
        "refreshToken",
        "apiKey",
        "authorization",
        "cookie",
        "headers.authorization",
        "headers.cookie",
        "req.headers.authorization",
        "req.headers.cookie"
      ],
      censor: "[REDACTED]"
    }
  });
}

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