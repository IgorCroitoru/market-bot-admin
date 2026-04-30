const { app } = require("@azure/functions");
const { requireRole } = require("../auth");

app.http("me", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me",
  handler: async (request, context) => {


    const auth = requireRole(request, "admin");

    if (!auth.ok) {
      return auth.response;
    }


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