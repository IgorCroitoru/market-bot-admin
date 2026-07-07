@description('Azure region.')
param location string = resourceGroup().location

@description('Globally unique storage account name. Lowercase letters and numbers only, 3-24 chars.')
param storageAccountName string

@description('Blob container used by AzureBotStorage.')
param blobContainerName string = 'cs-tm-bot'

@description('Globally unique Key Vault name.')
param keyVaultName string

@description('Your Microsoft Entra user object ID for local development.')
param developerObjectId string

@description('Name of the queue to create.')
param tradesQueueName string

@description('Name of the queue for outgoing trade status updates.')
param statusQueueName string = 'trade-status-update'

@description('Queue name for Market trade-ready registration tasks.')
param platformTradeReadyQueueName string = 'platform-trade-ready'

@description('Trade table name used by tm-client.')
param tradeTableName string

@description('Market items table name used by tm-client.')
param marketItemsTableName string

@description('Tags.')
param tags object = {
  environment: 'local-dev'
  workload: 'cs-tm-bot'
  managedBy: 'bicep'
}

module storageKeyVault 'local-dev-storage-keyvault.bicep' = {
  name: 'storageKeyVault'
  params: {
    location: location
    blobContainerName: blobContainerName
    tags: tags
    developerObjectId: developerObjectId
    keyVaultName: keyVaultName
    storageAccountName: storageAccountName
  }
}

module queue 'local-dev-queue.bicep' = {
  name: 'queue'
  params: {
    developerObjectId: developerObjectId
    storageAccountName: storageAccountName
    queueNames: [
      tradesQueueName
      statusQueueName
      platformTradeReadyQueueName
    ]
  }
  dependsOn: [
    storageKeyVault
  ]
}

module tableStorage 'local-dev-table.storage.bicep' = {
  name: 'tableStorage'
  params: {
    tableNames: [
      tradeTableName
      marketItemsTableName
    ]
    storageAccountName: storageAccountName
    developerObjectId: developerObjectId
  }
  dependsOn: [
    storageKeyVault
  ]
}
