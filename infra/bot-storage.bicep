@description('Azure region for the bot storage resources.')
param location string = resourceGroup().location

@description('Environment name: dev, test, or prod.')
@allowed([
  'dev'
  'test'
  'prod'
])
param environment string = 'dev'

@description('Short app name used for resource names and tags.')
param appName string = 'cs-tm-bot'

@description('Storage account name. Must be globally unique, 3-24 lowercase letters and numbers.')
param storageAccountName string = take('st${toLower(replace(appName, '-', ''))}${environment}${uniqueString(resourceGroup().id)}', 24)

@description('Blob container used by AzureBotStorage for poll data and other JSON state.')
param blobContainerName string = appName

@description('Key Vault name. Must be globally unique, 3-24 alphanumeric characters and hyphens.')
param keyVaultName string = take('kv-${appName}-${environment}-${uniqueString(resourceGroup().id)}', 24)

@description('Object IDs for managed identities or users that should read/write bot blobs and secrets.')
param botPrincipalObjectIds array = []

@description('Allow storage account shared key access. Keep false when AzureBotStorage uses managed identity.')
param allowSharedKeyAccess bool = false

var tags = {
  app: appName
  environment: environment
  component: 'bot-storage'
}

var storageBlobDataContributorRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
)
var keyVaultSecretsOfficerRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'
)

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: allowSharedKeyAccess
    defaultToOAuthAuthentication: !allowSharedKeyAccess
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
    encryption: {
      keySource: 'Microsoft.Storage'
      services: {
        blob: {
          enabled: true
        }
      }
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  name: 'default'
  parent: storageAccount
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

resource botContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: blobContainerName
  parent: blobService
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
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    enablePurgeProtection: environment == 'prod'
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

resource blobRoleAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for principalObjectId in botPrincipalObjectIds: {
    name: guid(storageAccount.id, principalObjectId, storageBlobDataContributorRoleId)
    scope: storageAccount
    properties: {
      roleDefinitionId: storageBlobDataContributorRoleId
      principalId: principalObjectId
    }
  }
]

resource secretRoleAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for principalObjectId in botPrincipalObjectIds: {
    name: guid(keyVault.id, principalObjectId, keyVaultSecretsOfficerRoleId)
    scope: keyVault
    properties: {
      roleDefinitionId: keyVaultSecretsOfficerRoleId
      principalId: principalObjectId
    }
  }
]

output storageAccountName string = storageAccount.name
output blobContainerName string = botContainer.name
output keyVaultName string = keyVault.name
output keyVaultUrl string = keyVault.properties.vaultUri
output botStorageAppSettings object = {
  BOT_STORAGE_DRIVER: 'azure'
  AZURE_STORAGE_ACCOUNT_NAME: storageAccount.name
  AZURE_BOT_CONTAINER_NAME: botContainer.name
  KEY_VAULT_URL: keyVault.properties.vaultUri
}
