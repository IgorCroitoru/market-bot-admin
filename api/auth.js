function getClientPrincipal(req) {
  const header = req.headers.get("x-ms-client-principal");

  if (!header) {
    return null;
  }

  const decoded = Buffer.from(header, "base64").toString("utf8");
  return JSON.parse(decoded);
}

function requireRole(req, role) {
  const user = getClientPrincipal(req);

  if (!user) {
    return {
      ok: false,
      response: {
        status: 401,
        jsonBody: {
          error: "Not authenticated"
        }
      }
    };
  }

  const roles = user.userRoles || [];

  if (!roles.includes(role)) {
    return {
      ok: false,
      response: {
        status: 403,
        jsonBody: {
          error: "Forbidden"
        }
      }
    };
  }

  return {
    ok: true,
    user
  };
}

module.exports = {
  getClientPrincipal,
  requireRole
};