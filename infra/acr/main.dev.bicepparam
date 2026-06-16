using 'main.bicep'

param location = 'westeurope'

// param staticWebAppName = 'cs-tm-bot-dev'

param projectName = 'cs-tm-bot'
param environmentName = 'dev'

param acrName = 'acrcstmbotdev'
param acrSku = 'Basic'
param acrPublicNetworkAccess = 'Enabled'

param pipelineIdentityName = 'id-cs-tm-bot-dev-github-acrpush'

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
