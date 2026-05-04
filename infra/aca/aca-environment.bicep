@description('Container Apps managed environment name.')
param environmentName string

@description('Azure region.')
param location string = resourceGroup().location

@description('Log Analytics workspace customer ID.')
param logAnalyticsCustomerId string

@secure()
@description('Log Analytics shared key.')
param logAnalyticsSharedKey string

@description('Resource tags.')
param tags object = {}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsSharedKey
      }
    }
  }
}

output id string = managedEnvironment.id
output name string = managedEnvironment.name
