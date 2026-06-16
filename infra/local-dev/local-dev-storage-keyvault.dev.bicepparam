using './main.bicep'
param location = 'westeurope'

param storageAccountName = 'stcstmbotlocaldev'
param blobContainerName = 'cs-tm-bot'

param keyVaultName = 'kv-cs-tm-bot-local-dev'

// Replace with your user object ID.
param developerObjectId = 'ac1aa61a-93f2-4742-a3a3-bdc008f5a074'


param queueName = 'local-dev-queue'

param tags = {
  environment: 'local-dev'
  workload: 'cs-tm-bot'
  managedBy: 'bicep'
}
