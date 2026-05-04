using 'main.acr.bicep'

param location = 'westeurope'

// param staticWebAppName = 'market-cloud-bot-dev'

param projectName = 'trading-bot'
param environmentName = 'dev'

param acrName = 'tradingbotacrdev001'
param acrSku = 'Basic'
param acrPublicNetworkAccess = 'Enabled'

param pipelineIdentityName = 'id-trading-bot-dev-github-acrpush'

param githubOwner = 'IgorCroitoru'
param githubRepo = 'market-bot-admin'
param githubBranch = 'main'

// // Leave empty unless you use GitHub Environments.
// param githubEnvironment = ''

// // Optional.
// // Set this only if the Container App already exists and this pipeline should update it.
// param containerAppName = ''

// // Optional.
// // Set this to your Container App managed identity principalId if ACA should pull from this ACR.
// param containerAppRuntimePrincipalId = ''

// param tags = {
//   workload: 'bot'
//   owner: 'platform'
// }
