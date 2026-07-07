@description('Settings')
param settings object = {}

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: settings.staticWebAppName
  location: settings.location

  sku: {
    name: settings.skuName
    tier: settings.skuName
  }

  properties: {
    buildProperties: {
      appLocation: settings.buildProperties.appLocation
      apiLocation: settings.buildProperties.apiLocation
      outputLocation: settings.buildProperties.outputLocation
    }
  }
}

output staticWebAppName string = staticWebApp.name
output defaultHostname string = staticWebApp.properties.defaultHostname
