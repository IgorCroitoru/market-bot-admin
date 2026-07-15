@description('Settings')
param settings object = {}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: settings.logAnalyticsName
  location: settings.location
  tags: settings.tags
  properties: {
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: settings.applicationInsightsName
  location: settings.location
  tags: settings.tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    RetentionInDays: 30
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

var staticWebAppTags = union(settings.tags, {
  'hidden-link: /app-insights-resource-id': applicationInsights.id
})

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: settings.staticWebAppName
  location: settings.location
  tags: staticWebAppTags

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

resource staticWebAppSettings 'Microsoft.Web/staticSites/config@2022-09-01' = {
  parent: staticWebApp
  name: 'appsettings'
  properties: {
    APPINSIGHTS_INSTRUMENTATIONKEY: applicationInsights.properties.InstrumentationKey
    APPLICATIONINSIGHTS_CONNECTION_STRING: applicationInsights.properties.ConnectionString
  }
}

output staticWebAppName string = staticWebApp.name
output defaultHostname string = staticWebApp.properties.defaultHostname
output applicationInsightsName string = applicationInsights.name
output logAnalyticsName string = logAnalytics.name
