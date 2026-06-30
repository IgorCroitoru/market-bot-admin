targetScope = 'resourceGroup'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Optional per-resource location overrides. Any omitted key uses the default location.')
param resourceLocations object = {}

@description('Permission to developer to write to key vault')
param developerPermissionToWriteKv bool = false

@description('Project/application name used in tags and resource names.')
param projectName string = 'cs-tm-bot'

@description('Environment name: dev, test, or prod.')
@allowed([
  'dev'
  'test'
  'prod'
])
param environmentName string


@description('Extra resource tags.')
param tags object = {}

@description('Deploy local-development storage, queue, table, and Key Vault resources.')
param deployLocalDev bool = false

@description('Your Microsoft Entra user object ID for local development. Required when deployLocalDev is true.')
param developerObjectId string = ''

@description('Queue name created for local development.')
param localQueueName string = 'local-dev-queue'

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

@description('Create azure queue if not exists.')
param botQueueCreateIfNotExists string = 'true'

@description('Visibility of trades status messages from azure queue.')
param tradesStatusVisibilityTimeoutSeconds string = '60'

@description('Number of messages to dequeue')
param botQueueMaxMessages string = '4'

@description('Max number of messages to dequeue')
param botQueueMaxDequeueCount string = '5'

module naming './shared/naming.bicep' = {
  name: 'shared-naming'
  params: {
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

module acr './acr/main.bicep' = {
  name: 'acr-stack-${environmentName}'
  params: {
    location: effectiveResourceLocations.acr
    projectName: projectName
    environmentName: environmentName
    acrName: resourceNames.acr.name
    acrSku: acrSku
    acrPublicNetworkAccess: acrPublicNetworkAccess
    pipelineIdentityName: resourceNames.pipelineIdentity.name
    githubOwner: githubOwner
    githubRepo: githubRepo
    githubBranch: githubBranch
    githubEnvironment: githubEnvironment
    tags: commonTags
  }
}

module staticApp './static-web-app/static-app.bicep' = {
  name: 'static-web-app-${environmentName}'
  params: {
    settings: staticWebAppSettings
  }
}

module localDev './local-dev/main.bicep' = if (deployLocalDev) {
  name: 'local-dev-${environmentName}'
  params: {
    location: effectiveResourceLocations.localDev
    storageAccountName: resourceNames.localStorage.name
    blobContainerName: resourceNames.blobContainer.name
    keyVaultName: resourceNames.localKeyVault.name
    developerObjectId: developerObjectId
    queueName: localQueueName
    tags: localDevTags
  }
}

module aca './aca/main.bicep' = {
  name: 'aca-stack-${environmentName}'
  params: {
    locations: {
      runtimeIdentity: effectiveResourceLocations.runtimeIdentity
      runtimeKeyVault: effectiveResourceLocations.runtimeKeyVault
      logAnalytics: effectiveResourceLocations.logAnalytics
      containerAppsEnvironment: effectiveResourceLocations.containerAppsEnvironment
      containerApp: effectiveResourceLocations.containerApp
      runtimeStorage: effectiveResourceLocations.runtimeStorage
    }
    tradesStatusVisibilityTimeoutSeconds: tradesStatusVisibilityTimeoutSeconds
    botTradeQueueName:  botTradeQueueName
    botTradeStatusQueueName: botTradeStatusQueueName
    botQueueCreateIfNotExists: botQueueCreateIfNotExists
    botQueueMaxDequeueCount: botQueueMaxDequeueCount
    botQueueMaxMessages: botQueueMaxMessages
    developerObjectId: developerObjectId
    developerPermissionToWriteKv: developerPermissionToWriteKv
    runtimeIdentityName: resourceNames.runtimeIdentity.name
    keyVaultName: resourceNames.runtimeKeyVault.name
    logAnalyticsWorkspaceName: resourceNames.logAnalytics.name
    containerAppsEnvironmentName: resourceNames.containerAppsEnvironment.name
    containerAppName: resourceNames.aca.name
    imageRepository: imageRepository
    initialImageTag: initialImageTag
    useAcrImageOnFirstDeploy: useAcrImageOnFirstDeploy
    bootstrapImage: bootstrapImage
    botEnv: botEnv
    ingressEnabled: ingressEnabled
    externalIngress: externalIngress
    targetPort: targetPort
    commonTags: commonTags
    acrName: acr.outputs.acrName
    pipelineIdentityName: resourceNames.pipelineIdentity.name
    blobContainerName: resourceNames.blobContainer.name
    storageAccountName: resourceNames.runtimeStorage.name
  }
}

output acrName string = acr.outputs.acrName
output acrId string = acr.outputs.acrId
output acrLoginServer string = acr.outputs.acrLoginServer

output githubActionsClientId string = acr.outputs.githubActionsClientId
output githubActionsPrincipalId string = acr.outputs.githubActionsPrincipalId
output githubActionsFederatedSubject string = acr.outputs.githubActionsFederatedSubject

output staticWebAppName string = staticApp.outputs.staticWebAppName
output staticWebAppDefaultHostname string = staticApp.outputs.defaultHostname

output runtimeIdentityId string = aca.outputs.runtimeIdentityId
output runtimeIdentityClientId string = aca.outputs.runtimeIdentityClientId
output runtimeIdentityPrincipalId string = aca.outputs.runtimeIdentityPrincipalId
output runtimeKeyVaultName string = aca.outputs.keyVaultName
output runtimeKeyVaultUri string = aca.outputs.keyVaultUri
output containerAppName string = aca.outputs.containerAppName
output containerAppsEnvironmentName string = aca.outputs.containerAppsEnvironmentName

output runtimeStorageAccountName string = resourceNames.runtimeStorage.name
output localStorageAccountName string = deployLocalDev ? resourceNames.localStorage.name : ''
output localKeyVaultName string = deployLocalDev ? resourceNames.localKeyVault.name : ''
