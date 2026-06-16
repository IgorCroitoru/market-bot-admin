@description('Existing Key Vault name.')
param keyVaultName string

@description('Developer id')
param developerObjectId string

param developerPermissionToWrite bool = false

@description('Principal/object ID receiving the role.')
param principalId string

@allowed([
  'ServicePrincipal'
  'User'
  'Group'
])
@description('Principal type. Managed identities are ServicePrincipal.')
param principalType string = 'ServicePrincipal'

@allowed([
  'KeyVaultSecretsUser'
])
@description('Key Vault role to assign.')
param roleName string = 'KeyVaultSecretsUser'

var roleDefinitionIds = {
  KeyVaultSecretsUser: '4633458b-17de-408a-b874-0445c86b69e6'
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

var roleDefinitionResourceId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  roleDefinitionIds[roleName]
)

resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, principalId, roleDefinitionResourceId)
  scope: keyVault
  properties: {
    roleDefinitionId: roleDefinitionResourceId
    principalId: principalId
    principalType: principalType
  }
}

resource secretsOfficerRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if(developerPermissionToWrite) {
  name: guid(keyVault.id, developerObjectId, 'KeyVaultSecretsOfficer')
  scope: keyVault
  properties: {
    principalId: developerObjectId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      'b86a8fe4-44ce-4948-aee5-eccb2c155cd7' // Key Vault Secrets Officer
    )
  }
}

output roleAssignmentId string = roleAssignment.id
