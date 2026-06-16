RG_NAME="rg-cs-tm-bot-dev"
DEPLOYMENT_NAME="aca-bootstrap-dev"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

az deployment group create \
  --resource-group "$RG_NAME" \
  --name "$DEPLOYMENT_NAME" \
  --template-file "$SCRIPT_DIR/../main.bicep" \
  --parameters "$SCRIPT_DIR/../main.dev.bicepparam"
