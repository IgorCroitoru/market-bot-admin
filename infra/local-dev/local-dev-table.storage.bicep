
@description('Globally unique storage account name. Lowercase letters and numbers only.')
param storageAccountName string

@description('Your Microsoft Entra user object ID for local development.')
param developerObjectId string

@description('Table names must start with a letter and contain only letters/numbers.')
param tableNames array = [
  'BotState'
  'Trades'
  'MarketItems'
]

var storageTableDataContributorRoleId = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'

resource storageAccountExisting 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  name: 'default'
  parent: storageAccountExisting
}

resource tables 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = [
  for tableName in tableNames: {
    name: tableName
    parent: tableService
    properties: {
      signedIdentifiers: []
    }
  }
]

resource tableDataAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccountExisting.id, developerObjectId, storageTableDataContributorRoleId)
  scope: storageAccountExisting
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      storageTableDataContributorRoleId
    )
    principalId: developerObjectId
    principalType: 'User'
  }
}
