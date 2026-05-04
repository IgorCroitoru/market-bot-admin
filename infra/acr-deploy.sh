RG_NAME="rg-market-cloud-bot-dev"
DEPLOYMENT_NAME="acr-bootstrap-dev"

az deployment group create \
  --resource-group "$RG_NAME" \
  --name "$DEPLOYMENT_NAME" \
  --parameters main.dev.bicepparam