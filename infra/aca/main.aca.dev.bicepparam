using './main.aca.dev.bicep'

param location = 'westeurope'

// param projectName = 'market-cloud-bot'
param environmentName = 'dev'

param acrName = 'tradingbotacrdev001'
// param acrSku = 'Basic'
// param acrPublicNetworkAccess = 'Enabled'

param pipelineIdentityName = 'id-trading-bot-dev-github-acrpush'
// param githubOwner = 'IgorCroitoru'
// param githubRepo = 'market-bot-admin'
// param githubBranch = 'main'
// param githubEnvironment = ''

param runtimeIdentityName = 'id-market-cloud-bot-dev-runtime'
param keyVaultName = 'kv-market-cloud-bot-dev'
param logAnalyticsWorkspaceName = 'log-market-cloud-bot-dev'
param containerAppsEnvironmentName = 'cae-market-cloud-bot-dev'
param containerAppName = 'ca-market-cloud-bot-dev'
param blobContainerName = 'steam-bot'
param storageAccountName = 'stmarketbotclouddev001'

param imageRepository = 'bot'
param initialImageTag = 'bootstrap'
param useAcrImageOnFirstDeploy = false

param botPollIntervalMs = '30000'
param botCancelTimeMs = '600000'
param botEnv = 'dev'
param logLevel = 'info'
param steamApiDomain = 'localhost'
param steamTokenPlatform = 'mobile'
param steamGuardCode = ''
param botLoginTimeoutMs = '90000'
param botMaxLoginRetries = '3'
param botLoginRetryDelayMs = '5000'
param botMaxLoginAttemptsWithinPeriod = '3'
param botLoginAttemptPeriodMs = '60000'
param botOfferRequestTtlMs = '300000'
param botOfferMaxRetries = '4'
param botOfferRetryBaseDelayMs = '5000'
param botOfferRetryMaxDelayMs = '30000'
param botTokenRefreshIntervalMs = '300000'
param botTokenRefreshSkewMs = '120000'
param botAccessTokenRefreshSkewMs = '14400000'
param botRefreshTokenRenewalWindowMs = '604800000'

param ingressEnabled = false
param externalIngress = false
param targetPort = 8080

param commonTags = {
  workload: 'market-cloud-bot'
  environment: 'dev'
}
