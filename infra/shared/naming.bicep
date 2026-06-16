param projectName string
param environment string

var compactProjectName = toLower(replace(projectName, '-', ''))

output resources object = {
  acr: {
    name: 'acr${compactProjectName}${environment}'
  }

  runtimeIdentity: {
    name: 'id-${projectName}-${environment}-runtime'
  }

  pipelineIdentity: {
    name: 'id-${projectName}-${environment}-github-acrpush'
  }

  runtimeKeyVault: {
    name: 'kv-${projectName}-${environment}'
  }

  logAnalytics: {
    name: 'log-${projectName}-${environment}'
  }

  containerAppsEnvironment: {
    name: 'cae-${projectName}-${environment}'
  }

  aca: {
    name: 'ca-${projectName}-${environment}'
  }

  runtimeStorage: {
    name: 'st${compactProjectName}${environment}'
  }

  localStorage: {
    name: 'st${compactProjectName}local${environment}'
  }

  localKeyVault: {
    name: 'kv-${projectName}-local-${environment}'
  }

  staticWebApp: {
    name: '${projectName}-${environment}'
  }

  blobContainer: {
    name: projectName
  }
}
