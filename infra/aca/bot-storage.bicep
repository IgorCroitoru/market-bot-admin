targetScope = 'resourceGroup'

@description('Azure region.')
param location string = resourceGroup().location

@description('Globally unique storage account name. Lowercase letters and numbers only, 3-24 chars.')
param storageAccountName string

@description('Blob container used by AzureBotStorage.')
param blobContainerName string


param runtimeIdentityPrincipalId string
param runtimeIdentityId string

@description('Tags.')
param tags object = {
  environment: 'cloud-dev'
  workload: 'cs-tm-bot'
  managedBy: 'bicep'
}

var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

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
    allowSharedKeyAccess: false

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
resource runtimeStorageBlobDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
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


output storageAccountName string = storageAccount.name
output blobContainerName string = blobContainer.name
output blobEndpoint string = storageAccount.properties.primaryEndpoints.blob
