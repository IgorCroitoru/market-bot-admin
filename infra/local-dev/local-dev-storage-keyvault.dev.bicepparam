using './main.local.bicep'
param location = 'westeurope'

param storageAccountName = 'stmarketbotdev001'
param blobContainerName = 'steam-bot'

param keyVaultName = 'kv-market-bot-local-dev'

// Replace with your user object ID.
param developerObjectId = 'ac1aa61a-93f2-4742-a3a3-bdc008f5a074'


param queueName = 'local-dev-queue'

param tags = {
  environment: 'local-dev'
  workload: 'market-cloud-bot'
  managedBy: 'bicep'
}
