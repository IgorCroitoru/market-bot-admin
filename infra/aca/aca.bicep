@description('Container App name.')
param containerAppName string

@description('Azure region.')
param location string = resourceGroup().location

@description('Container Apps managed environment resource ID.')
param managedEnvironmentId string

@description('Container image, for example myacr.azurecr.io/bot:bootstrap.')
param image string

@description('Container name.')
param containerName string = 'bot'

@description('CPU cores.')
param cpu string = '0.5'

@description('Memory size.')
param memory string = '1.0Gi'

@description('Minimum replicas.')
param minReplicas int = 1

@description('Maximum replicas.')
param maxReplicas int = 1

@description('User-assigned runtime identity resource ID.')
param runtimeIdentityId string

@description('ACR login server, for example myacr.azurecr.io.')
param acrLoginServer string

@description('Key Vault URI, for example https://myvault.vault.azure.net/.')
param keyVaultUri string

@description('Bot environment.')
param botEnv string = 'dev'

@description('Log level.')
param logLevel string = 'info'

@description('Steam API domain.')
param steamApiDomain string = 'localhost'

@allowed([
  'mobile'
  'web'
  'client'
])
@description('Steam token platform.')
param steamTokenPlatform string = 'mobile'

@description('Bot poll interval in milliseconds.')
param botPollIntervalMs string = '30000'

@description('Bot cancel time in milliseconds.')
param botCancelTimeMs string = '600000'

@description('Whether ingress is enabled.')
param ingressEnabled bool = false

@description('External ingress. Only used if ingressEnabled is true.')
param externalIngress bool = false

@description('Target port. Only used if ingressEnabled is true.')
param targetPort int = 8080

@description('Resource tags.')
param tags object = {}

var secretNames = {
  steamAccountName: 'steam-account-name'
  steamPassword: 'steam-password'
  steamSharedSecret: 'steam-shared-secret'
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  tags: tags

  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${runtimeIdentityId}': {}
    }
  }

  properties: {
    managedEnvironmentId: managedEnvironmentId

    configuration: {
      activeRevisionsMode: 'Single'

      registries: [
        {
          server: acrLoginServer
          identity: runtimeIdentityId
        }
      ]

      secrets: [
        {
          name: secretNames.steamAccountName
          keyVaultUrl: '${keyVaultUri}secrets/steam-account-name'
          identity: runtimeIdentityId
        }
        {
          name: secretNames.steamPassword
          keyVaultUrl: '${keyVaultUri}secrets/steam-password'
          identity: runtimeIdentityId
        }
        {
          name: secretNames.steamSharedSecret
          keyVaultUrl: '${keyVaultUri}secrets/steam-shared-secret'
          identity: runtimeIdentityId
        }
      ]

      ingress: ingressEnabled ? {
        external: externalIngress
        targetPort: targetPort
        transport: 'auto'
      } : null
    }

    template: {
      containers: [
        {
          name: containerName
          image: image
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: [
            {
              name: 'BOT_ENV'
              value: botEnv
            }
            {
              name: 'LOG_LEVEL'
              value: logLevel
            }
            {
              name: 'STEAM_ACCOUNT_NAME'
              secretRef: secretNames.steamAccountName
            }
            {
              name: 'STEAM_PASSWORD'
              secretRef: secretNames.steamPassword
            }
            {
              name: 'STEAM_SHARED_SECRET'
              secretRef: secretNames.steamSharedSecret
            }
            {
              name: 'STEAM_API_DOMAIN'
              value: steamApiDomain
            }
            {
              name: 'STEAM_TOKEN_PLATFORM'
              value: steamTokenPlatform
            }
            {
              name: 'BOT_POLL_INTERVAL_MS'
              value: botPollIntervalMs
            }
            {
              name: 'BOT_CANCEL_TIME_MS'
              value: botCancelTimeMs
            }
          ]
        }
      ]

      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

output id string = containerApp.id
output name string = containerApp.name
