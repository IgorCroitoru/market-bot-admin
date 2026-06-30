@description('Per-resource locations for the ACA stack.')
param locations object

@description('Container App runtime identity name.')
param runtimeIdentityName string

param developerObjectId string

param developerPermissionToWriteKv bool = false

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

@description('Bot container environment variables.')
param botEnv object

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

@description('Name of the queue for incoming trades requests.')
param botTradeQueueName string

@description('Name of the queue for outgoing trade statuses updates.')
param botTradeStatusQueueName string

@description('Create azure queue if not exists.')
param botQueueCreateIfNotExists string

@description('Visibility of trades status messages from azure queue.')
param tradesStatusVisibilityTimeoutSeconds string

@description('Number of messages to dequeue')
param botQueueMaxMessages string

@description('Max number of messages to dequeue')
param botQueueMaxDequeueCount string

module runtimeIdentity './user-assigned-identity.bicep' = {
  name: 'id-runtime-${uniqueString(resourceGroup().id, runtimeIdentityName)}'
  params: {
    identityName: runtimeIdentityName
    location: locations.runtimeIdentity
    tags: commonTags
  }
}

module keyVault './key-vault.bicep' = {
  name: 'kv-${uniqueString(resourceGroup().id, keyVaultName)}'
  params: {
    keyVaultName: keyVaultName
    location: locations.runtimeKeyVault
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
    developerPermissionToWrite: developerPermissionToWriteKv
    developerObjectId: developerObjectId
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
    location: locations.logAnalytics
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
    location: locations.containerAppsEnvironment
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
    tradesStatusVisibilityTimeoutSeconds: tradesStatusVisibilityTimeoutSeconds
    botTradeQueueName: botTradeQueueName
    botTradeStatusQueueName: botTradeStatusQueueName
    botQueueCreateIfNotExists: botQueueCreateIfNotExists
    botQueueMaxDequeueCount: botQueueMaxDequeueCount
    botQueueMaxMessages: botQueueMaxMessages
    runtimeIdentityClientId: runtimeIdentity.outputs.clientId
    blobContainerName: blobContainerName
    storageAccountName: storageAccountName
    containerAppName: containerAppName
    location: locations.containerApp
    managedEnvironmentId: containerAppsEnvironment.outputs.id
    image: selectedImage
    runtimeIdentityId: runtimeIdentity.outputs.id
    acrLoginServer: acr.properties.loginServer
    keyVaultUri: keyVault.outputs.vaultUri
    botEnv: botEnv
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
    botTradeQueueName: botTradeQueueName
    botTradeStatusQueueName: botTradeStatusQueueName
    developerObjectId: developerObjectId
    storageAccountName: storageAccountName
    blobContainerName: blobContainerName
    location: locations.runtimeStorage
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
