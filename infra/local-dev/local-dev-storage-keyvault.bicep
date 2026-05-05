targetScope = 'resourceGroup'

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

@description('Optional ACA runtime managed identity principalId. Leave empty for local-dev-only deployment.')
param runtimePrincipalId string = ''

@description('Tags.')
param tags object = {
  environment: 'local-dev'
  workload: 'market-cloud-bot'
  managedBy: 'bicep'
}

var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var keyVaultSecretsOfficerRoleId = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

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

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    tenantId: tenant().tenantId

    // Required for RBAC roles like Key Vault Secrets Officer/User.
    enableRbacAuthorization: true

    publicNetworkAccess: 'Enabled'
    sku: {
      family: 'A'
      name: 'standard'
    }

    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: false
  }
}

// Local developer: read/write blob data.
resource developerStorageBlobDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, developerObjectId, storageBlobDataContributorRoleId)
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      storageBlobDataContributorRoleId
    )
    principalId: developerObjectId
    principalType: 'User'
  }
}

// Local developer: create/update/read Key Vault secrets.
resource developerKeyVaultSecretsOfficer 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, developerObjectId, keyVaultSecretsOfficerRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      keyVaultSecretsOfficerRoleId
    )
    principalId: developerObjectId
    principalType: 'User'
  }
}

// // Optional: ACA runtime identity can read blob data.
// resource runtimeStorageBlobDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(runtimePrincipalId)) {
//   name: guid(storageAccount.id, runtimePrincipalId, storageBlobDataContributorRoleId)
//   scope: storageAccount
//   properties: {
//     roleDefinitionId: subscriptionResourceId(
//       'Microsoft.Authorization/roleDefinitions',
//       storageBlobDataContributorRoleId
//     )
//     principalId: runtimePrincipalId
//     principalType: 'ServicePrincipal'
//   }
// }

// // Optional: ACA runtime identity can read Key Vault secrets.
// resource runtimeKeyVaultSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(runtimePrincipalId)) {
//   name: guid(keyVault.id, runtimePrincipalId, keyVaultSecretsUserRoleId)
//   scope: keyVault
//   properties: {
//     roleDefinitionId: subscriptionResourceId(
//       'Microsoft.Authorization/roleDefinitions',
//       keyVaultSecretsUserRoleId
//     )
//     principalId: runtimePrincipalId
//     principalType: 'ServicePrincipal'
//   }
// }

output storageAccountName string = storageAccount.name
output blobContainerName string = blobContainer.name
output keyVaultName string = keyVault.name
output keyVaultUrl string = keyVault.properties.vaultUri
output blobEndpoint string = storageAccount.properties.primaryEndpoints.blob
