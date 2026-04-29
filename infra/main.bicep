@description('Azure region for the Static Web App resource.')
param location string = 'westeurope'

@description('Static Web App name, for example market-cloud-bot-dev.')
param staticWebAppName string

@description('Environment name: dev, test, or prod.')
@allowed([
  'dev'
  'test'
  'prod'
])
param environment string = 'dev'

@description('Static Web App pricing tier.')
@allowed([
  'Free'
  'Standard'
])
param skuName string = 'Free'

@description('Frontend app folder in the repo.')
param appLocation string = 'frontend'

@description('Azure Functions API folder in the repo.')
param apiLocation string = 'api'

@description('Frontend build output folder, relative to appLocation.')
param outputLocation string = 'dist'

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: location

  sku: {
    name: skuName
    tier: skuName
  }

  tags: {
    app: 'market-cloud-bot'
    environment: environment
  }

  properties: {
    buildProperties: {
      appLocation: appLocation
      apiLocation: apiLocation
      outputLocation: outputLocation
    }
  }
}

output staticWebAppName string = staticWebApp.name
output defaultHostname string = staticWebApp.properties.defaultHostname
