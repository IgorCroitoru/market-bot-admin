@description('ACR name.')
param name string

@description('Azure region.')
param location string

@allowed([
  'Basic'
  'Standard'
  'Premium'
])
@description('ACR SKU.')
param sku string = 'Basic'

@description('Whether the ACR admin user is enabled. Keep false for RBAC/OIDC.')
param adminUserEnabled bool = false

@allowed([
  'Enabled'
  'Disabled'
])
@description('Whether public network access is enabled.')
param publicNetworkAccess string = 'Enabled'

@description('Resource tags.')
param tags object = {}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: name
  location: location
  sku: {
    name: sku
  }
  tags: tags
  properties: {
    adminUserEnabled: adminUserEnabled
    anonymousPullEnabled: false
    publicNetworkAccess: publicNetworkAccess
  }
}

output id string = registry.id
output name string = registry.name
output loginServer string = registry.properties.loginServer
