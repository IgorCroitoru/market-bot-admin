using './local-dev-storage-keyvault.bicep'

param location = 'westeurope'

param storageAccountName = 'stmarketbotdev001'
param blobContainerName = 'steam-bot'

param keyVaultName = 'kv-market-bot-local-dev'

// Replace with your user object ID.
param developerObjectId = 'ac1aa61a-93f2-4742-a3a3-bdc008f5a074'

// Optional. Leave empty for local-dev-only.
// If you also want ACA runtime access, set this to id-market-cloud-bot-dev-runtime principalId.
param runtimePrincipalId = ''

param tags = {
  environment: 'local-dev'
  workload: 'market-cloud-bot'
  managedBy: 'bicep'
}
