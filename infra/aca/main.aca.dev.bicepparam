using './main.aca.dev.bicep'

param location = 'westeurope'

param projectName = 'market-cloud-bot'
param environmentName = 'dev'

param acrName = 'tradingbotacrdev001'
param acrSku = 'Basic'
param acrPublicNetworkAccess = 'Enabled'

param pipelineIdentityName = 'id-trading-bot-dev-github-acrpush'
param githubOwner = 'IgorCroitoru'
param githubRepo = 'market-bot-admin'
param githubBranch = 'main'
param githubEnvironment = ''

param runtimeIdentityName = 'id-market-cloud-bot-dev-runtime'
param keyVaultName = 'kv-market-cloud-bot-dev'
param logAnalyticsWorkspaceName = 'log-market-cloud-bot-dev'
param containerAppsEnvironmentName = 'cae-market-cloud-bot-dev'
param containerAppName = 'ca-market-cloud-bot-dev'

param imageRepository = 'bot'
param initialImageTag = 'bootstrap'
param useAcrImageOnFirstDeploy = false

param botEnv = 'dev'
param logLevel = 'info'
param steamApiDomain = 'localhost'
param steamTokenPlatform = 'mobile'

param ingressEnabled = false
param externalIngress = false
param targetPort = 8080

param tags = {
  workload: 'market-cloud-bot'
  environment: 'dev'
}
