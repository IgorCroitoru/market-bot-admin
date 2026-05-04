@description('Container App runtime identity name.')
param runtimeIdentityName string

@description('Key Vault name.')
param keyVaultName string

@description('Log Analytics workspace name.')
param logAnalyticsWorkspaceName string

@description('Container Apps managed environment name.')
param containerAppsEnvironmentName string

@description('Container App name.')
param containerAppName string

@description('Image repository inside ACR.')
param imageRepository string = 'bot'

@description('Initial image tag. This must already exist in ACR unless using a public bootstrap image.')
param initialImageTag string = 'bootstrap'

@description('Use ACR image for first deploy. Set false if no image exists yet.')
param useAcrImageOnFirstDeploy bool = true

@description('Public bootstrap image used when ACR has no image yet.')
param bootstrapImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Bot environment.')
param botEnv string = environmentName

@description('Log level.')
param logLevel string = 'info'

@description('Steam API domain.')
param steamApiDomain string = 'localhost'

@description('Steam token platform.')
param steamTokenPlatform string = 'mobile'

@description('Whether Container App ingress is enabled.')
param ingressEnabled bool = false

@description('External ingress.')
param externalIngress bool = false

@description('Target port.')
param targetPort int = 8080

module runtimeIdentity './user-assigned-identity.bicep' = {
  name: 'id-runtime-${uniqueString(resourceGroup().id, runtimeIdentityName)}'
  params: {
    identityName: runtimeIdentityName
    location: location
    tags: commonTags
  }
}

module keyVault './modules/key-vault.bicep' = {
  name: 'kv-${uniqueString(resourceGroup().id, keyVaultName)}'
  params: {
    keyVaultName: keyVaultName
    location: location
    tags: commonTags
  }
}

module acrPullForRuntime '../acr/main.acr.bicep' = {
  name: 'ra-acrpull-runtime-${uniqueString(acrName, runtimeIdentityName)}'
  params: {
    acrName: acrName
    principalId: runtimeIdentity.outputs.principalId
    principalType: 'ServicePrincipal'
    roleName: 'AcrPull'
  }
}

module keyVaultSecretsUserForRuntime './modules/key-vault-role-assignment.bicep' = {
  name: 'ra-kv-secrets-runtime-${uniqueString(keyVaultName, runtimeIdentityName)}'
  params: {
    keyVaultName: keyVault.outputs.name
    principalId: runtimeIdentity.outputs.principalId
    principalType: 'ServicePrincipal'
    roleName: 'KeyVaultSecretsUser'
  }
}

module logAnalytics './modules/log-analytics.bicep' = {
  name: 'log-${uniqueString(resourceGroup().id, logAnalyticsWorkspaceName)}'
  params: {
    workspaceName: logAnalyticsWorkspaceName
    location: location
    retentionInDays: 30
    tags: commonTags
  }
}

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: logAnalytics.outputs.name
}

module containerAppsEnvironment './modules/container-app-environment.bicep' = {
  name: 'cae-${uniqueString(resourceGroup().id, containerAppsEnvironmentName)}'
  params: {
    environmentName: containerAppsEnvironmentName
    location: location
    logAnalyticsCustomerId: logAnalytics.outputs.customerId
    logAnalyticsSharedKey: logAnalyticsWorkspace.listKeys().primarySharedKey
    tags: commonTags
  }
}

var acrImage = '${acr.outputs.loginServer}/${imageRepository}:${initialImageTag}'
var selectedImage = useAcrImageOnFirstDeploy ? acrImage : bootstrapImage

module containerApp './modules/container-app.bicep' = {
  name: 'ca-${uniqueString(resourceGroup().id, containerAppName)}'
  dependsOn: [
    acrPullForRuntime
    keyVaultSecretsUserForRuntime
  ]
  params: {
    containerAppName: containerAppName
    location: location
    managedEnvironmentId: containerAppsEnvironment.outputs.id
    image: selectedImage
    runtimeIdentityId: runtimeIdentity.outputs.id
    acrLoginServer: acr.outputs.loginServer
    keyVaultUri: keyVault.outputs.vaultUri
    botEnv: botEnv
    logLevel: logLevel
    steamApiDomain: steamApiDomain
    steamTokenPlatform: steamTokenPlatform
    ingressEnabled: ingressEnabled
    externalIngress: externalIngress
    targetPort: targetPort
    minReplicas: 1
    maxReplicas: 1
    tags: commonTags
  }
}

output runtimeIdentityId string = runtimeIdentity.outputs.id
output runtimeIdentityClientId string = runtimeIdentity.outputs.clientId
output runtimeIdentityPrincipalId string = runtimeIdentity.outputs.principalId

output keyVaultName string = keyVault.outputs.name
output keyVaultUri string = keyVault.outputs.vaultUri

output containerAppName string = containerApp.outputs.name
output containerAppsEnvironmentName string = containerAppsEnvironment.outputs.name
