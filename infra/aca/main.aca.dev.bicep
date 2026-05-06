@description('Azure region for all resources.')
param location string

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

@description('Environment name.')
param environmentName string

@description('Bot poll interval in milliseconds.')
param botPollIntervalMs string 

@description('Bot cancel time in milliseconds.')
param botCancelTimeMs string 

@description('Bot environment.')
param botEnv string = environmentName

@description('Log level.')
param logLevel string = 'info'

@description('Steam API domain.')
param steamApiDomain string = 'localhost'

@description('Steam token platform.')
param steamTokenPlatform string = 'mobile'

@description('Steam guard code, if required. Leave empty when not used.')
param steamGuardCode string = ''

@description('Bot login timeout in milliseconds.')
param botLoginTimeoutMs string

@description('Maximum login retries.')
param botMaxLoginRetries string

@description('Delay between login retries in milliseconds.')
param botLoginRetryDelayMs string

@description('Maximum login attempts within the configured period.')
param botMaxLoginAttemptsWithinPeriod string = '3'

@description('Login attempt period in milliseconds.')
param botLoginAttemptPeriodMs string

@description('Offer request TTL in milliseconds.')
param botOfferRequestTtlMs string

@description('Maximum offer retries.')
param botOfferMaxRetries string

@description('Offer retry base delay in milliseconds.')
param botOfferRetryBaseDelayMs string 

@description('Maximum offer retry delay in milliseconds.')
param botOfferRetryMaxDelayMs string

@description('Token refresh interval in milliseconds.')
param botTokenRefreshIntervalMs string

@description('Token refresh skew in milliseconds.')
param botTokenRefreshSkewMs string

@description('Access token refresh skew in milliseconds.')
param botAccessTokenRefreshSkewMs string

@description('Refresh token renewal window in milliseconds.')
param botRefreshTokenRenewalWindowMs string

@description('Whether Container App ingress is enabled.')
param ingressEnabled bool = false

@description('External ingress.')
param externalIngress bool = false

@description('Target port.')
param targetPort int = 8080

@description('Project/application name used in tags.')
param commonTags object = {}

@description('Container Registry name.')
param acrName string

@description('Github pipeline identity name. This identity will be granted permissions to push to ACR and optionally manage Container App.')
param pipelineIdentityName string

@description('Blob container name used by the bot. This container will be created in the storage account and used by AzureBotStorage.')
param blobContainerName string

@description('Bot storage name')
param storageAccountName string
module runtimeIdentity './user-assigned-identity.bicep' = {
  name: 'id-runtime-${uniqueString(resourceGroup().id, runtimeIdentityName)}'
  params: {
    identityName: runtimeIdentityName
    location: location
    tags: commonTags
  }
}

module keyVault './key-vault.bicep' = {
  name: 'kv-${uniqueString(resourceGroup().id, keyVaultName)}'
  params: {
    keyVaultName: keyVaultName
    location: location
    tags: commonTags
  }
}

module acrPullForRuntime '../acr/acr-role-assignment.bicep' = {
  name: 'ra-acrpull-runtime-${uniqueString(acrName, runtimeIdentityName)}'
  params: {
    acrName: acrName
    principalId: runtimeIdentity.outputs.principalId
    principalType: 'ServicePrincipal'
    roleName: 'AcrPull'
  }
}

module keyVaultSecretsUserForRuntime './key-vault-role-assignment.bicep' = {
  name: 'ra-kv-secrets-runtime-${uniqueString(keyVaultName, runtimeIdentityName)}'
  dependsOn: [
    keyVault
  ]
  params: {
    keyVaultName: keyVaultName
    principalId: runtimeIdentity.outputs.principalId
    principalType: 'ServicePrincipal'
    roleName: 'KeyVaultSecretsUser'
  }
}

module logAnalytics './log-analytics.bicep' = {
  name: 'log-${uniqueString(resourceGroup().id, logAnalyticsWorkspaceName)}'
  params: {
    workspaceName: logAnalyticsWorkspaceName
    location: location
    retentionInDays: 30
    tags: commonTags
  }
}

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  dependsOn: [
    logAnalytics
  ]
  name: logAnalyticsWorkspaceName
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

module containerAppsEnvironment './aca-environment.bicep' = {
  name: 'cae-${uniqueString(resourceGroup().id, containerAppsEnvironmentName)}'
  params: {
    environmentName: containerAppsEnvironmentName
    location: location
    logAnalyticsCustomerId: logAnalytics.outputs.customerId
    logAnalyticsSharedKey: logAnalyticsWorkspace.listKeys().primarySharedKey
    tags: commonTags
  }
}

var acrImage = '${acr.properties.loginServer}/${imageRepository}:${initialImageTag}'
var selectedImage = useAcrImageOnFirstDeploy ? acrImage : bootstrapImage

module containerApp './aca.bicep' = {
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
    acrLoginServer: acr.properties.loginServer
    keyVaultUri: keyVault.outputs.vaultUri
    botEnv: botEnv
    botPollIntervalMs: botPollIntervalMs
    botCancelTimeMs: botCancelTimeMs
    logLevel: logLevel
    steamApiDomain: steamApiDomain
    steamTokenPlatform: steamTokenPlatform
    steamGuardCode: steamGuardCode
    botLoginTimeoutMs: botLoginTimeoutMs
    botMaxLoginRetries: botMaxLoginRetries
    botLoginRetryDelayMs: botLoginRetryDelayMs
    botMaxLoginAttemptsWithinPeriod: botMaxLoginAttemptsWithinPeriod
    botLoginAttemptPeriodMs: botLoginAttemptPeriodMs
    botOfferRequestTtlMs: botOfferRequestTtlMs
    botOfferMaxRetries: botOfferMaxRetries
    botOfferRetryBaseDelayMs: botOfferRetryBaseDelayMs
    botOfferRetryMaxDelayMs: botOfferRetryMaxDelayMs
    botTokenRefreshIntervalMs: botTokenRefreshIntervalMs
    botTokenRefreshSkewMs: botTokenRefreshSkewMs
    botAccessTokenRefreshSkewMs: botAccessTokenRefreshSkewMs
    botRefreshTokenRenewalWindowMs: botRefreshTokenRenewalWindowMs
    ingressEnabled: ingressEnabled
    externalIngress: externalIngress
    targetPort: targetPort
    minReplicas: 1
    maxReplicas: 1
    tags: commonTags
  }
}

resource githubIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2018-11-30' existing = {
  name: pipelineIdentityName
}

module pipelineCanUpdateContainerApp './aca-role-assignment.bicep' = {
  name: 'ra-aca-contributor-${uniqueString(containerAppName, pipelineIdentityName)}'
  dependsOn: [
    containerApp
  ]
  params: {
    containerAppName: containerAppName
    principalId: githubIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

module botStorage './bot-storage.bicep' = {
  name: 'bs-${uniqueString(resourceGroup().id, containerAppName)}'
  dependsOn: [
    containerApp
  ]
  params: {
    storageAccountName: storageAccountName
    blobContainerName: blobContainerName
    location: location
    tags: commonTags
    runtimeIdentityId: runtimeIdentity.outputs.id
    runtimeIdentityPrincipalId: runtimeIdentity.outputs.principalId
  }
}

output runtimeIdentityId string = runtimeIdentity.outputs.id
output runtimeIdentityClientId string = runtimeIdentity.outputs.clientId
output runtimeIdentityPrincipalId string = runtimeIdentity.outputs.principalId

output keyVaultName string = keyVault.outputs.name
output keyVaultUri string = keyVault.outputs.vaultUri

output containerAppName string = containerApp.outputs.name
output containerAppsEnvironmentName string = containerAppsEnvironment.outputs.name
