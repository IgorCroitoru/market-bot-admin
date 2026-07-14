targetScope = 'resourceGroup'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Optional per-resource location overrides. Any omitted key uses the default location.')
param resourceLocations object = {}

@description('Permission to developer to write to key vault')
param developerPermissionToWriteKv bool = false

@description('Project/application name used in tags and resource names.')
param projectName string = 'cs-tm-bot'

@description('Short string or number prefixed to all generated resource names.')
@minLength(1)
@maxLength(5)
param namingPrefix string

@description('Environment name: dev, test, or prod.')
@allowed([
  'dev'
  'test'
  'prod'
])
param environmentName string

@description('Trade table name used by tm-client.')
param tradeTableName string

@description('Market items table name used by tm-client.')
param marketItemsTableName string

@description('Partition key containing tm-client market item records.')
param marketItemsPartitionKey string = 'tm-client'

@description('Extra resource tags.')
param tags object = {}

@description('Deploy local-development storage, queue, table, and Key Vault resources.')
param deployLocalDev bool = false

@description('Runtime hosting target. Azure deploys ACA/ACR and their identities; OCI keeps those Azure hosting resources disabled.')
@allowed([
  'azure'
  'oci'
])
param deploymentTarget string = 'oci'

@description('Your Microsoft Entra user object ID for local development. Required when deployLocalDev is true.')
param developerObjectId string = ''


@description('Static Web App pricing tier.')
@allowed([
  'Free'
  'Standard'
])
param staticWebAppSku string = 'Free'

@description('Frontend app folder in the repo.')
param appLocation string = 'frontend'

@description('Azure Functions API folder in the repo.')
param apiLocation string = 'api'

@description('Frontend build output folder, relative to appLocation.')
param outputLocation string = 'dist'

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

@description('GitHub owner or organization name.')
param githubOwner string = 'IgorCroitoru'

@description('GitHub repository name.')
param githubRepo string = 'market-bot-admin'

@description('GitHub branch allowed to push to ACR.')
param githubBranch string = 'main'

@description('Optional GitHub environment. Leave empty to use branch-based OIDC subject.')
param githubEnvironment string = ''

@description('Image repository inside ACR.')
param imageRepository string = 'bot'

@description('Initial image tag. This must already exist in ACR unless using a public bootstrap image.')
param initialImageTag string = 'bootstrap'

@description('Use ACR image for first deploy. Set false if no image exists yet.')
param useAcrImageOnFirstDeploy bool = false

@description('Public bootstrap image used when ACR has no image yet.')
param bootstrapImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Bot container environment variables. Defined per environment in the .bicepparam files.')
param botEnv object

@description('Whether Container App ingress is enabled.')
param ingressEnabled bool = false

@description('External ingress.')
param externalIngress bool = false

@description('Target port.')
param targetPort int = 8080

@description('Name of the queue for incoming trades requests.')
param botTradeQueueName string

@description('Name of the queue for outgoing trade statuses updates.')
param botTradeStatusQueueName string

@description('Queue name for Market trade-ready registration tasks.')
param platformTradeReadyQueueName string = 'platform-trade-ready'

@description('Create azure queue if not exists.')
param botQueueCreateIfNotExists string = 'true'

@description('Visibility of trades status messages from azure queue.')
param tradesStatusVisibilityTimeoutSeconds string = '60'

@description('Number of messages to dequeue')
param botQueueMaxMessages string = '4'

@description('Max attempts of dequeue before considering poison')
param botQueueMaxDequeueCount string = '5'

module naming './shared/naming.bicep' = {
  name: 'shared-naming'
  params: {
    prefix: namingPrefix
    projectName: projectName
    environment: environmentName
  }
}

var resourceNames = naming.outputs.resources
var effectiveResourceLocations = union({
  acr: location
  staticWebApp: location
  localDev: location
  runtimeIdentity: location
  runtimeKeyVault: location
  logAnalytics: location
  containerAppsEnvironment: location
  containerApp: location
  runtimeStorage: location
}, resourceLocations)

var commonTags = union(tags, {
  project: projectName
  environment: environmentName
  managedBy: 'bicep'
})

var deployAzureHosting = deploymentTarget == 'azure'

var localDevTags = union(commonTags, {
  environment: 'local-${environmentName}'
})

var staticWebAppSettings = {
  staticWebAppName: resourceNames.staticWebApp.name
  location: effectiveResourceLocations.staticWebApp
  skuName: staticWebAppSku
  buildProperties: {
    appLocation: appLocation
    apiLocation: apiLocation
    outputLocation: outputLocation
  }
}

var azureHostingSettings = {
  projectName: projectName
  environmentName: environmentName
  locations: effectiveResourceLocations
  names: {
    acr: resourceNames.acr.name
    pipelineIdentity: resourceNames.pipelineIdentity.name
    runtimeIdentity: resourceNames.runtimeIdentity.name
    runtimeKeyVault: resourceNames.runtimeKeyVault.name
    logAnalytics: resourceNames.logAnalytics.name
    containerAppsEnvironment: resourceNames.containerAppsEnvironment.name
    containerApp: resourceNames.aca.name
    runtimeStorage: resourceNames.runtimeStorage.name
    blobContainer: resourceNames.blobContainer.name
  }
  acrSku: acrSku
  acrPublicNetworkAccess: acrPublicNetworkAccess
  github: {
    owner: githubOwner
    repo: githubRepo
    branch: githubBranch
    environment: githubEnvironment
  }
  container: {
    imageRepository: imageRepository
    initialImageTag: initialImageTag
    useAcrImageOnFirstDeploy: useAcrImageOnFirstDeploy
    bootstrapImage: bootstrapImage
    botEnv: botEnv
    ingressEnabled: ingressEnabled
    externalIngress: externalIngress
    targetPort: targetPort
  }
  storage: {
    tradesStatusVisibilityTimeoutSeconds: tradesStatusVisibilityTimeoutSeconds
    botTradeQueueName: botTradeQueueName
    botTradeStatusQueueName: botTradeStatusQueueName
    botQueueCreateIfNotExists: botQueueCreateIfNotExists
    botQueueMaxDequeueCount: botQueueMaxDequeueCount
    botQueueMaxMessages: botQueueMaxMessages
  }
  developerObjectId: developerObjectId
  developerPermissionToWriteKv: developerPermissionToWriteKv
  tags: commonTags
}

module azureHosting './azure-hosting/main.bicep' = if (deployAzureHosting) {
  name: 'azure-hosting-${environmentName}'
  params: {
    settings: azureHostingSettings
  }
}

module staticApp './static-web-app/static-app.bicep' = {
  name: 'static-web-app-${environmentName}'
  dependsOn: [
    localDev
  ]
  params: {
    settings: staticWebAppSettings
  }
}

module localDev './local-dev/main.bicep' = if (deployLocalDev) {
  name: 'local-dev-${environmentName}'
  params: {
    tradeTableName: tradeTableName
    marketItemsTableName: marketItemsTableName
    location: effectiveResourceLocations.localDev
    storageAccountName: resourceNames.localStorage.name
    blobContainerName: resourceNames.blobContainer.name
    keyVaultName: resourceNames.localKeyVault.name
    developerObjectId: developerObjectId
    tradesQueueName: botTradeQueueName
    statusQueueName: botTradeStatusQueueName
    platformTradeReadyQueueName: platformTradeReadyQueueName
    tags: localDevTags
  }
}

module runtimeStorage './storage/runtime-storage.bicep' = {
  name: 'runtime-storage-${environmentName}'
  params: {
    location: effectiveResourceLocations.runtimeStorage
    tradeTableName: tradeTableName
    marketItemsTableName: marketItemsTableName
    botTradeQueueName: botTradeQueueName
    botTradeStatusQueueName: botTradeStatusQueueName
    platformTradeReadyQueueName: platformTradeReadyQueueName
    developerObjectId: developerObjectId
    storageAccountName: resourceNames.runtimeStorage.name
    blobContainerName: resourceNames.blobContainer.name
    tags: commonTags
    runtimeIdentityId: deployAzureHosting ? azureHosting!.outputs.runtimeIdentityId : ''
    runtimeIdentityPrincipalId: deployAzureHosting ? azureHosting!.outputs.runtimeIdentityPrincipalId : ''
    allowSharedKeyAccess: !deployAzureHosting
  }
}

module staticWebAppGithubIdentity './static-web-app/github-oidc-identity.bicep' = {
  name: 'static-web-app-github-oidc-${environmentName}'
  params: {
    githubOwner: githubOwner
    githubRepository: githubRepo
    githubBranch: githubBranch
    storageAccountName: runtimeStorage.outputs.storageAccountName
    staticWebAppName: staticApp.outputs.staticWebAppName
    githubIdentityName: resourceNames.staticWebAppPipelineIdentity.name
  }
}

output deploymentTarget string = deploymentTarget
output deployAzureHosting bool = deployAzureHosting
output acrName string = deployAzureHosting ? azureHosting!.outputs.acrName : ''
output acrId string = deployAzureHosting ? azureHosting!.outputs.acrId : ''
output acrLoginServer string = deployAzureHosting ? azureHosting!.outputs.acrLoginServer : ''

output githubActionsClientId string = deployAzureHosting ? azureHosting!.outputs.githubActionsClientId : ''
output githubActionsPrincipalId string = deployAzureHosting ? azureHosting!.outputs.githubActionsPrincipalId : ''
output githubActionsFederatedSubject string = deployAzureHosting ? azureHosting!.outputs.githubActionsFederatedSubject : ''

output staticWebAppName string = staticApp.outputs.staticWebAppName
output staticWebAppDefaultHostname string = staticApp.outputs.defaultHostname
output staticWebAppGithubClientId string = staticWebAppGithubIdentity.outputs.githubClientId
output staticWebAppGithubPrincipalId string = staticWebAppGithubIdentity.outputs.githubPrincipalId
output staticWebAppGithubTenantId string = staticWebAppGithubIdentity.outputs.azureTenantId
output staticWebAppGithubSubscriptionId string = staticWebAppGithubIdentity.outputs.azureSubscriptionId

output runtimeIdentityId string = deployAzureHosting ? azureHosting!.outputs.runtimeIdentityId : ''
output runtimeIdentityClientId string = deployAzureHosting ? azureHosting!.outputs.runtimeIdentityClientId : ''
output runtimeIdentityPrincipalId string = deployAzureHosting ? azureHosting!.outputs.runtimeIdentityPrincipalId : ''
output runtimeKeyVaultName string = deployAzureHosting ? azureHosting!.outputs.runtimeKeyVaultName : ''
output runtimeKeyVaultUri string = deployAzureHosting ? azureHosting!.outputs.runtimeKeyVaultUri : ''
output containerAppName string = deployAzureHosting ? azureHosting!.outputs.containerAppName : ''
output containerAppsEnvironmentName string = deployAzureHosting ? azureHosting!.outputs.containerAppsEnvironmentName : ''

output runtimeStorageAccountName string = resourceNames.runtimeStorage.name
output localStorageAccountName string = deployLocalDev ? resourceNames.localStorage.name : ''
output localKeyVaultName string = deployLocalDev ? resourceNames.localKeyVault.name : ''
