@description('GitHub organization or username')
param githubOwner string

@description('GitHub repository name')
param githubRepository string

@description('Branch allowed to authenticate')
param githubBranch string = 'main'

@description('Existing Azure Storage Account name')
param storageAccountName string

@description('Existing Azure Static Web App name')
param staticWebAppName string

@description('Name of the GitHub Actions managed identity')
param githubIdentityName string = 'id-github-swa-settings'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' existing = {
  name: staticWebAppName
}

resource githubIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: githubIdentityName
  location: resourceGroup().location
}

/*
GitHub OIDC trust for pushes or workflow runs from the main branch.

Subject format:
repo:<owner>/<repository>:ref:refs/heads/<branch>
*/
resource githubFederatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: githubIdentity
  name: 'github-${githubBranch}'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubOwner}/${githubRepository}:ref:refs/heads/${githubBranch}'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

/*
Storage Account Key Operator Service Role

Allows:
- listKeys
- regenerateKey

Because the assignment is scoped directly to this storage account,
the identity cannot list keys for other storage accounts.
*/
var storageKeyOperatorRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '81a9662b-bebf-436f-a333-f67b29880f12'
)

resource storageKeyRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(
    storageAccount.id,
    githubIdentity.id,
    storageKeyOperatorRoleId
  )
  scope: storageAccount
  properties: {
    principalId: githubIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: storageKeyOperatorRoleId
  }
}

/*
Reader is also required because `az storage account show-connection-string`
reads the storage account metadata before listing its keys.
*/
var readerRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'acdd72a7-3385-48ef-bd42-f606fba81ae7'
)

resource storageReaderRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(
    storageAccount.id,
    githubIdentity.id,
    readerRoleId
  )
  scope: storageAccount
  properties: {
    principalId: githubIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: readerRoleId
  }
}

/*
Contributor role, but scoped only to this Static Web App.

This permits the workflow to update SWA API application settings.
*/
var contributorRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'b24988ac-6180-42a0-ab88-20f7382dd24c'
)

resource staticWebAppRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(
    staticWebApp.id,
    githubIdentity.id,
    contributorRoleId
  )
  scope: staticWebApp
  properties: {
    principalId: githubIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: contributorRoleId
  }
}

output githubClientId string = githubIdentity.properties.clientId
output githubPrincipalId string = githubIdentity.properties.principalId
output azureTenantId string = tenant().tenantId
output azureSubscriptionId string = subscription().subscriptionId
