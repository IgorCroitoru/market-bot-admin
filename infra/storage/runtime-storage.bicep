targetScope = 'resourceGroup'

@description('Azure region.')
param location string = resourceGroup().location

@description('Globally unique storage account name. Lowercase letters and numbers only, 3-24 chars.')
param storageAccountName string

@description('Trades Queue name.')
param botTradeQueueName string = 'trade-requests'

@description('Trades status Queue name.')
param botTradeStatusQueueName string = 'trade-status-update'

@description('Queue name for Market trade-ready registration tasks.')
param platformTradeReadyQueueName string

@description('Trade table name used by tm-client.')
param tradeTableName string

@description('Market items table name used by tm-client.')
param marketItemsTableName string

@description('Blob container used by AzureBotStorage.')
param blobContainerName string

@description('Your id to be able to contribute to queue in portal.')
param developerObjectId string

@description('ACA runtime identity principal ID. Empty when the runtime is hosted outside Azure.')
param runtimeIdentityPrincipalId string = ''

@description('ACA runtime identity resource ID. Empty when the runtime is hosted outside Azure.')
param runtimeIdentityId string = ''

@description('Enable account keys for non-Azure runtimes such as OCI.')
param allowSharedKeyAccess bool = false

@description('Tags.')
param tags object = {
  environment: 'cloud-dev'
  workload: 'cs-tm-bot'
  managedBy: 'bicep'
}

var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var storageQueueContributorRoleId = '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
var storageTableDataContributorRoleId = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'

resource storageAccount 'Microsoft.Storage/storageAccounts@2024-01-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false

    // Since your code uses DefaultAzureCredential, shared keys are not needed.
    // If you still want to use connectionString locally, set this to true.
    allowSharedKeyAccess: allowSharedKeyAccess

    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2024-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

resource blobContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2024-01-01' = {
  parent: blobService
  name: blobContainerName
  properties: {
    publicAccess: 'None'
  }
}

// ACA runtime identity can read blob data.
resource runtimeStorageBlobDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(runtimeIdentityPrincipalId)) {
  name: guid(storageAccount.id, runtimeIdentityId, storageBlobDataContributorRoleId)
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      storageBlobDataContributorRoleId
    )
    principalId: runtimeIdentityPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource tradesQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = {
  parent: queueService
  name: botTradeQueueName
  properties: {
    metadata: {}
  }
}

resource tradesStatusQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = {
  parent: queueService
  name: botTradeStatusQueueName
  properties: {
    metadata: {}
  }
}

resource platformTradeReadyQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = {
  parent: queueService
  name: platformTradeReadyQueueName
  properties: {
    metadata: {}
  }
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource tradesTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tableService
  name: tradeTableName
  properties: {
    signedIdentifiers: []
  }
}

resource marketItemsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tableService
  name: marketItemsTableName
  properties: {
    signedIdentifiers: []
  }
}

// Runtime identity contributor
resource queueDataContributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(runtimeIdentityPrincipalId)) {
  name: guid(storageAccount.id, runtimeIdentityPrincipalId, storageQueueContributorRoleId)
  scope: storageAccount
  properties: {
    principalId: runtimeIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      storageQueueContributorRoleId
    )
  }
}


// User contributor
resource queueDataUserContributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, developerObjectId, storageQueueContributorRoleId)
  scope: storageAccount
  properties: {
    principalId: developerObjectId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      storageQueueContributorRoleId
    )
  }
}

resource tableDataContributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(runtimeIdentityPrincipalId)) {
  name: guid(storageAccount.id, runtimeIdentityPrincipalId, storageTableDataContributorRoleId)
  scope: storageAccount
  properties: {
    principalId: runtimeIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      storageTableDataContributorRoleId
    )
  }
}

resource tableDataUserContributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, developerObjectId, storageTableDataContributorRoleId)
  scope: storageAccount
  properties: {
    principalId: developerObjectId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      storageTableDataContributorRoleId
    )
  }
}

output storageAccountName string = storageAccount.name
output blobContainerName string = blobContainer.name
output blobEndpoint string = storageAccount.properties.primaryEndpoints.blob
output tradeTableName string = tradesTable.name
output marketItemsTableName string = marketItemsTable.name
