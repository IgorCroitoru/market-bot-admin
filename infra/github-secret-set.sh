RG_NAME="rg-cs-tm-bot-dev"
DEPLOYMENT_NAME="acr-bootstrap-dev"

CLIENT_ID="$(az deployment group show \
  --resource-group "$RG_NAME" \
  --name "$DEPLOYMENT_NAME" \
  --query properties.outputs.githubActionsClientId.value \
  --output tsv)"

TENANT_ID="$(az deployment group show \
  --resource-group "$RG_NAME" \
  --name "$DEPLOYMENT_NAME" \
  --query properties.outputs.tenantId.value \
  --output tsv)"

SUBSCRIPTION_ID="$(az deployment group show \
  --resource-group "$RG_NAME" \
  --name "$DEPLOYMENT_NAME" \
  --query properties.outputs.subscriptionId.value \
  --output tsv)"

ACR_NAME="$(az deployment group show \
  --resource-group "$RG_NAME" \
  --name "$DEPLOYMENT_NAME" \
  --query properties.outputs.acrName.value \
  --output tsv)"

echo "Setting GitHub secrets and variables..."
echo "CLIENT_ID: $CLIENT_ID"
echo "TENANT_ID: $TENANT_ID"
echo "SUBSCRIPTION_ID: $SUBSCRIPTION_ID"
echo "ACR_NAME: $ACR_NAME"


# gh secret set AZURE_CLIENT_ID --body "$CLIENT_ID"
# gh secret set AZURE_TENANT_ID --body "$TENANT_ID"
# gh secret set AZURE_SUBSCRIPTION_ID --body "$SUBSCRIPTION_ID"

# gh variable set AZURE_RESOURCE_GROUP --body "$RG_NAME"
# gh variable set ACR_NAME --body "$ACR_NAME"
# gh variable set IMAGE_REPOSITORY --body "bot"
# gh variable set DOCKERFILE_PATH --body "Dockerfile.bot"
# gh variable set BUILD_CONTEXT --body "."
