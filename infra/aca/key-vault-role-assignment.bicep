@description('Existing Key Vault name.')
param keyVaultName string

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

output roleAssignmentId string = roleAssignment.id
