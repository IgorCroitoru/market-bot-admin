@description('Existing Azure Container App name.')
param containerAppName string

@description('Principal/object ID receiving the role.')
param principalId string

@allowed([
  'ServicePrincipal'
  'User'
  'Group'
])
param principalType string = 'ServicePrincipal'

var containerAppsContributorRoleDefinitionId = '358470bc-b998-42bd-ab17-a7e34c199c0f'

resource containerApp 'Microsoft.App/containerApps@2024-03-01' existing = {
  name: containerAppName
}

var roleDefinitionResourceId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  containerAppsContributorRoleDefinitionId
)

resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerApp.id, principalId, roleDefinitionResourceId)
  scope: containerApp
  properties: {
    roleDefinitionId: roleDefinitionResourceId
    principalId: principalId
    principalType: principalType
  }
}

output roleAssignmentId string = roleAssignment.id
