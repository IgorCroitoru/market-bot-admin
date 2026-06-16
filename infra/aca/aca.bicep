@description('Container App name.')
param containerAppName string

@description('Azure region.')
param location string = resourceGroup().location

@description('Container Apps managed environment resource ID.')
param managedEnvironmentId string

@description('Used by sdk to request tokens')
param runtimeIdentityClientId string

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

@description('Container name.')
param blobContainerName string
  
@description('Storage account name.')
param storageAccountName string

@description('User-assigned runtime identity resource ID.')
param runtimeIdentityId string

@description('ACR login server, for example myacr.azurecr.io.')
param acrLoginServer string

@description('Key Vault URI, for example https://myvault.vault.azure.net/.')
param keyVaultUri string

@description('Bot container environment variables.')
param botEnv object

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
              name: 'AZURE_CLIENT_ID'
              value: runtimeIdentityClientId
            }
            {
              name: 'BOT_ENV'
              value: botEnv.environment
            }
            {
              name: 'BOT_STORAGE_DRIVER'
              value: botEnv.storageDriver
            }
            {
              name: 'AZURE_BOT_CONTAINER_NAME'
              value: blobContainerName
            }
            {
              name: 'AZURE_STORAGE_ACCOUNT_NAME'
              value: storageAccountName
            }
            {
              name: 'LOG_LEVEL'
              value: botEnv.logLevel
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
              name: 'STEAM_GUARD_CODE'
              value: botEnv.steamGuardCode
            }
            {
              name: 'STEAM_API_DOMAIN'
              value: botEnv.steamApiDomain
            }
            {
              name: 'STEAM_TOKEN_PLATFORM'
              value: botEnv.steamTokenPlatform
            }
            {
              name: 'BOT_POLL_INTERVAL_MS'
              value: botEnv.botPollIntervalMs
            }
            {
              name: 'BOT_CANCEL_TIME_MS'
              value: botEnv.botCancelTimeMs
            }
            {
              name: 'BOT_LOGIN_TIMEOUT_MS'
              value: botEnv.botLoginTimeoutMs
            }
            {
              name: 'BOT_MAX_LOGIN_RETRIES'
              value: botEnv.botMaxLoginRetries
            }
            {
              name: 'BOT_LOGIN_RETRY_DELAY_MS'
              value: botEnv.botLoginRetryDelayMs
            }
            {
              name: 'BOT_MAX_LOGIN_ATTEMPTS_WITHIN_PERIOD'
              value: botEnv.botMaxLoginAttemptsWithinPeriod
            }
            {
              name: 'BOT_INVENTORY_POLL_INTERVAL_MS'
              value: botEnv.botInventoryPollIntervalMs
            }
            {
              name: 'BOT_LOGIN_ATTEMPT_PERIOD_MS'
              value: botEnv.botLoginAttemptPeriodMs
            }
            {
              name: 'BOT_OFFER_REQUEST_TTL_MS'
              value: botEnv.botOfferRequestTtlMs
            }
            {
              name: 'BOT_OFFER_MAX_RETRIES'
              value: botEnv.botOfferMaxRetries
            }
            {
              name: 'BOT_OFFER_RETRY_BASE_DELAY_MS'
              value: botEnv.botOfferRetryBaseDelayMs
            }
            {
              name: 'BOT_OFFER_RETRY_MAX_DELAY_MS'
              value: botEnv.botOfferRetryMaxDelayMs
            }
            {
              name: 'BOT_TOKEN_REFRESH_INTERVAL_MS'
              value: botEnv.botTokenRefreshIntervalMs
            }
            {
              name: 'BOT_TOKEN_REFRESH_SKEW_MS'
              value: botEnv.botTokenRefreshSkewMs
            }
            {
              name: 'BOT_ACCESS_TOKEN_REFRESH_SKEW_MS'
              value: botEnv.botAccessTokenRefreshSkewMs
            }
            {
              name: 'BOT_REFRESH_TOKEN_RENEWAL_WINDOW_MS'
              value: botEnv.botRefreshTokenRenewalWindowMs
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
