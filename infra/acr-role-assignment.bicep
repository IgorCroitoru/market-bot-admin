@description('Existing ACR name.')
param acrName string

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
  'AcrPush'
  'AcrPull'
  'Reader'
])
@description('ACR role to assign.')
param roleName string

var roleDefinitionIds = {
  AcrPush: '8311e382-0749-4cb8-b61a-304f252e45ec'
  AcrPull: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
  Reader: 'acdd72a7-3385-48ef-bd42-f606fba81ae7'
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

var roleDefinitionResourceId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  roleDefinitionIds[roleName]
)

resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, principalId, roleDefinitionResourceId)
  scope: acr
  properties: {
    roleDefinitionId: roleDefinitionResourceId
    principalId: principalId
    principalType: principalType
  }
}

output roleAssignmentId string = roleAssignment.id
