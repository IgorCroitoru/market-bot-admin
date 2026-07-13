# Azure container hosting stack

This stack groups resources that exist only when `deploymentTarget = 'azure'`:

- Azure Container Registry and its GitHub Actions OIDC identity
- Azure Container Apps environment and Container App
- the Container App runtime identity and its Azure RBAC assignments
- runtime Key Vault and Log Analytics workspace

The root `infra/main.bicep` deploys this stack conditionally through:

```bicep
var deployAzureHosting = deploymentTarget == 'azure'
```

Azure Storage remains outside this stack because both Azure-hosted and OCI-hosted runtimes use the queues, tables, and blob container. When OCI is selected, storage shared-key access is enabled because an OCI VM cannot use the ACA managed identity.
