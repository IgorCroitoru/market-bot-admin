using 'main.bicep'

param location = 'westeurope'

param resourceLocations = {
  // runtimeIdentity: 'northeurope'
  // runtimeKeyVault: 'northeurope'
  // logAnalytics: 'northeurope'
  containerAppsEnvironment: 'northeurope'
  containerApp: 'northeurope'
  // runtimeStorage: 'northeurope'
}

param projectName = 'cs-tm-bot'
param environmentName = 'dev'


param developerPermissionToWriteKv = true
param deployLocalDev = true
param developerObjectId = '6db7fa80-16c3-4e11-9e65-6175c6fde0af'
param localQueueName = 'local-dev-queue'
param botQueueCreateIfNotExists = 'true'
param botQueueMaxDequeueCount = '5'
param botQueueMaxMessages = '4'
param botTradeQueueName ='trade-requests'
param botTradeStatusQueueName='trade-status-update'

param staticWebAppSku = 'Free'
param appLocation = 'frontend'
param apiLocation = 'api'
param outputLocation = 'dist'

param acrSku = 'Basic'
param acrPublicNetworkAccess = 'Enabled'

param githubOwner = 'IgorCroitoru'
param githubRepo = 'market-bot-admin'
param githubBranch = 'main'
param githubEnvironment = ''

param imageRepository = 'bot'
param initialImageTag = 'bootstrap'
param useAcrImageOnFirstDeploy = false

param botEnv = {
  environment: 'dev'
  storageDriver: 'azure'
  logLevel: 'info'
  steamApiDomain: 'localhost'
  steamTokenPlatform: 'mobile'
  steamGuardCode: ''
  botPollIntervalMs: '30000'
  botCancelTimeMs: '600000'
  botInventoryPollIntervalMs: '43200000'
  botLoginTimeoutMs: '90000'
  botMaxLoginRetries: '3'
  botLoginRetryDelayMs: '5000'
  botMaxLoginAttemptsWithinPeriod: '3'
  botLoginAttemptPeriodMs: '60000'
  botOfferRequestTtlMs: '300000'
  botOfferMaxRetries: '4'
  botOfferRetryBaseDelayMs: '5000'
  botOfferRetryMaxDelayMs: '30000'
  botTokenRefreshIntervalMs: '300000'
  botTokenRefreshSkewMs: '120000'
  botAccessTokenRefreshSkewMs: '14400000'
  botRefreshTokenRenewalWindowMs: '604800000'
}

param ingressEnabled = false
param externalIngress = false
param targetPort = 8080

param tags = {
  workload: 'cs-tm-bot'
}
