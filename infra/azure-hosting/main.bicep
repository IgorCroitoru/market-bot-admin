targetScope = 'resourceGroup'

@description('Complete Azure container-hosting configuration (ACR, identities, Key Vault, logs, ACA environment, and Container App).')
param settings object

module acr '../acr/main.bicep' = {
  name: 'acr-stack-${settings.environmentName}'
  params: {
    location: settings.locations.acr
    projectName: settings.projectName
    environmentName: settings.environmentName
    acrName: settings.names.acr
    acrSku: settings.acrSku
    acrPublicNetworkAccess: settings.acrPublicNetworkAccess
    pipelineIdentityName: settings.names.pipelineIdentity
    githubOwner: settings.github.owner
    githubRepo: settings.github.repo
    githubBranch: settings.github.branch
    githubEnvironment: settings.github.environment
    tags: settings.tags
  }
}

module aca '../aca/main.bicep' = {
  name: 'aca-stack-${settings.environmentName}'
  params: {
    locations: settings.locations
    tradesStatusVisibilityTimeoutSeconds: settings.storage.tradesStatusVisibilityTimeoutSeconds
    botTradeQueueName: settings.storage.botTradeQueueName
    botTradeStatusQueueName: settings.storage.botTradeStatusQueueName
    botQueueCreateIfNotExists: settings.storage.botQueueCreateIfNotExists
    botQueueMaxDequeueCount: settings.storage.botQueueMaxDequeueCount
    botQueueMaxMessages: settings.storage.botQueueMaxMessages
    developerObjectId: settings.developerObjectId
    developerPermissionToWriteKv: settings.developerPermissionToWriteKv
    runtimeIdentityName: settings.names.runtimeIdentity
    keyVaultName: settings.names.runtimeKeyVault
    logAnalyticsWorkspaceName: settings.names.logAnalytics
    containerAppsEnvironmentName: settings.names.containerAppsEnvironment
    containerAppName: settings.names.containerApp
    imageRepository: settings.container.imageRepository
    initialImageTag: settings.container.initialImageTag
    useAcrImageOnFirstDeploy: settings.container.useAcrImageOnFirstDeploy
    bootstrapImage: settings.container.bootstrapImage
    botEnv: settings.container.botEnv
    ingressEnabled: settings.container.ingressEnabled
    externalIngress: settings.container.externalIngress
    targetPort: settings.container.targetPort
    commonTags: settings.tags
    acrName: acr.outputs.acrName
    pipelineIdentityName: settings.names.pipelineIdentity
    blobContainerName: settings.names.blobContainer
    storageAccountName: settings.names.runtimeStorage
  }
}

output acrName string = acr.outputs.acrName
output acrId string = acr.outputs.acrId
output acrLoginServer string = acr.outputs.acrLoginServer
output githubActionsClientId string = acr.outputs.githubActionsClientId
output githubActionsPrincipalId string = acr.outputs.githubActionsPrincipalId
output githubActionsFederatedSubject string = acr.outputs.githubActionsFederatedSubject
output runtimeIdentityId string = aca.outputs.runtimeIdentityId
output runtimeIdentityClientId string = aca.outputs.runtimeIdentityClientId
output runtimeIdentityPrincipalId string = aca.outputs.runtimeIdentityPrincipalId
output runtimeKeyVaultName string = aca.outputs.keyVaultName
output runtimeKeyVaultUri string = aca.outputs.keyVaultUri
output containerAppName string = aca.outputs.containerAppName
output containerAppsEnvironmentName string = aca.outputs.containerAppsEnvironmentName
