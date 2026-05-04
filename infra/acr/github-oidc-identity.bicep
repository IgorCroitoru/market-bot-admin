@description('User-assigned managed identity name.')
param identityName string

@description('Azure region.')
param location string

@description('GitHub owner or organization.')
param githubOwner string

@description('GitHub repository.')
param githubRepo string

@description('GitHub branch allowed to authenticate.')
param githubBranch string = 'main'

@description('Optional GitHub environment. Leave empty to use branch-based OIDC subject.')
param githubEnvironment string = ''

@description('Resource tags.')
param tags object = {}

var githubIssuer = 'https://token.actions.githubusercontent.com'
var githubAudience = 'api://AzureADTokenExchange'

var sanitizedOwner = replace(githubOwner, '.', '-')
var sanitizedRepo = replace(githubRepo, '.', '-')
var sanitizedBranch = replace(replace(githubBranch, '/', '-'), '.', '-')

var federatedCredentialName = take('github-${sanitizedOwner}-${sanitizedRepo}-${sanitizedBranch}', 120)

var branchSubject = 'repo:${githubOwner}/${githubRepo}:ref:refs/heads/${githubBranch}'
var environmentSubject = 'repo:${githubOwner}/${githubRepo}:environment:${githubEnvironment}'
var federatedCredentialSubject = empty(githubEnvironment) ? branchSubject : environmentSubject

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
  tags: tags
}

resource federatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2025-05-31-preview' = {
  parent: identity
  name: federatedCredentialName
  properties: {
    issuer: githubIssuer
    subject: federatedCredentialSubject
    audiences: [
      githubAudience
    ]
  }
}

output id string = identity.id
output clientId string = identity.properties.clientId
output principalId string = identity.properties.principalId
output federatedCredentialSubject string = federatedCredentialSubject
