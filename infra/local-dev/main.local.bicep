@description('Azure region.')
param location string = resourceGroup().location

@description('Globally unique storage account name. Lowercase letters and numbers only, 3-24 chars.')
param storageAccountName string

@description('Blob container used by AzureBotStorage.')
param blobContainerName string = 'steam-bot'

@description('Globally unique Key Vault name.')
param keyVaultName string

@description('Your Microsoft Entra user object ID for local development.')
param developerObjectId string

@description('Name of the queue to create.')
param queueName string

@description('Tags.')
param tags object = {
  environment: 'local-dev'
  workload: 'market-cloud-bot'
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
    queueName: queueName
  }
  dependsOn: [
    storageKeyVault
  ]
}

module tableStorage 'local-dev-table.storage.bicep' = {
  name: 'tableStorage'
  params: {
    storageAccountName: storageAccountName
    developerObjectId: developerObjectId
  }
  dependsOn: [
    storageKeyVault
  ]
}
