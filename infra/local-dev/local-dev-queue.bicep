

@description('Queue names.')
param queueNames array

@description('User account object ID for role assignment.')
param developerObjectId string

@description('Existing storage account name to create the queue in. Must be the same as the one created by local-dev-storage-keyvault.bicep.')
param storageAccountName string
var storageQueueDataContributorRoleId = '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
var readerRoleId = 'acdd72a7-3385-48ef-bd42-f606fba81ae7'


resource storageAccountExisting 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-05-01' = {
  parent: storageAccountExisting
  name: 'default'
}

resource queues 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = [
  for name in queueNames: {
    parent: queueService
    name: name
    properties: {
      metadata: {}
    }
  }
]

resource queueDataContributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccountExisting.id, developerObjectId, storageQueueDataContributorRoleId)
  dependsOn: [storageAccountExisting]
  scope: storageAccountExisting
  properties: {
    principalId: developerObjectId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      storageQueueDataContributorRoleId
    )
  }
}

// Optional but useful for Azure Portal browsing.
resource readerAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccountExisting.id, developerObjectId, readerRoleId)
  dependsOn: [storageAccountExisting]
  scope: storageAccountExisting
  properties: {
    principalId: developerObjectId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      readerRoleId
    )
  }
}
