targetScope = 'resourceGroup'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Project/application name used in tags.')
param projectName string

@description('Environment name, for example dev, test, prod.')
param environmentName string = 'dev'

@description('Globally unique ACR name. Must be 5-50 alphanumeric characters.')
param acrName string

@allowed([
  'Basic'
  'Standard'
  'Premium'
])
@description('ACR SKU.')
param acrSku string = 'Basic'

@allowed([
  'Enabled'
  'Disabled'
])
@description('Whether the ACR public endpoint is enabled.')
param acrPublicNetworkAccess string = 'Enabled'

@description('Name of the user-assigned managed identity used by GitHub Actions OIDC.')
param pipelineIdentityName string

@description('GitHub owner or organization name.')
param githubOwner string

@description('GitHub repository name.')
param githubRepo string

@description('GitHub branch allowed to push to ACR.')
param githubBranch string = 'main'

@description('Optional GitHub environment. Leave empty to use branch-based OIDC subject.')
param githubEnvironment string = ''

// @description('Optional existing Azure Container App name. If set, the pipeline identity receives Container Apps Contributor on this app.')
// param containerAppName string = ''

@description('Optional runtime principalId of the Container App managed identity. If set, it receives AcrPull on the ACR.')
param containerAppRuntimePrincipalId string = ''

@description('Extra resource tags.')
param tags object = {}

var commonTags = union(tags, {
  project: projectName
  environment: environmentName
  managedBy: 'bicep'
})

module acr './acr.bicep' = {
  name: 'acr-${uniqueString(resourceGroup().id, acrName)}'
  params: {
    name: acrName
    location: location
    sku: acrSku
    publicNetworkAccess: acrPublicNetworkAccess
    tags: commonTags
  }
}

module githubIdentity './github-oidc-identity.bicep' = {
  name: 'github-oidc-${uniqueString(resourceGroup().id, pipelineIdentityName)}'
  params: {
    identityName: pipelineIdentityName
    location: location
    githubOwner: githubOwner
    githubRepo: githubRepo
    githubBranch: githubBranch
    githubEnvironment: githubEnvironment
    tags: commonTags
  }
}

module acrPush './acr-role-assignment.bicep' = {
  name: 'ra-acrpush-${uniqueString(acrName, pipelineIdentityName)}'
  params: {
    acrName: acr.outputs.name
    principalId: githubIdentity.outputs.principalId
    principalType: 'ServicePrincipal'
    roleName: 'AcrPush'
  }
}

module acrPullForContainerApp './acr-role-assignment.bicep' = if (!empty(containerAppRuntimePrincipalId)) {
  name: 'ra-acrpull-${uniqueString(acrName, containerAppRuntimePrincipalId)}'
  params: {
    acrName: acr.outputs.name
    principalId: containerAppRuntimePrincipalId
    principalType: 'ServicePrincipal'
    roleName: 'AcrPull'
  }
}

module acrReader './acr-role-assignment.bicep' = {
  name: 'ra-acrreader-${uniqueString(acrName, pipelineIdentityName)}'
  params: {
    acrName: acr.outputs.name
    principalId: githubIdentity.outputs.principalId
    principalType: 'ServicePrincipal'
    roleName: 'Reader'
  }
}
// module containerAppContributor './modules/container-app-role-assignment.bicep' = if (!empty(containerAppName)) {
//   name: 'ra-aca-contributor-${uniqueString(containerAppName, pipelineIdentityName)}'
//   params: {
//     containerAppName: containerAppName
//     principalId: githubIdentity.outputs.principalId
//     principalType: 'ServicePrincipal'
//   }
// }

output acrName string = acr.outputs.name
output acrId string = acr.outputs.id
output acrLoginServer string = acr.outputs.loginServer

output githubActionsClientId string = githubIdentity.outputs.clientId
output githubActionsPrincipalId string = githubIdentity.outputs.principalId
output githubActionsFederatedSubject string = githubIdentity.outputs.federatedCredentialSubject

output tenantId string = tenant().tenantId
output subscriptionId string = subscription().subscriptionId
