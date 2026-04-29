@description('Azure region.')
param location string = 'westeurope'

@description('Static Web App name.')
param staticWebAppName string

@description('Environment name.')
param environment string = 'dev'

@description('Static Web App SKU.')
@allowed([
  'Free'
  'Standard'
])
param skuName string = 'Free'

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
      appLocation: 'frontend'
      apiLocation: 'api'
      outputLocation: 'dist'
    }
  }
}

output staticWebAppName string = staticWebApp.name
output defaultHostname string = staticWebApp.properties.defaultHostname