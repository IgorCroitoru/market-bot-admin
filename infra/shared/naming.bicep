param prefix string
param projectName string
param environment string

var compactPrefix = toLower(replace(prefix, '-', ''))
var compactProjectName = toLower(replace(projectName, '-', ''))

output resources object = {
  acr: {
    name: 'acr${compactPrefix}${compactProjectName}${environment}'
  }

  runtimeIdentity: {
    name: 'id-${prefix}-${projectName}-${environment}-runtime'
  }

  pipelineIdentity: {
    name: 'id-${prefix}-${projectName}-${environment}-github-acrpush'
  }

  staticWebAppPipelineIdentity: {
    name: 'id-${prefix}-${projectName}-${environment}-github-swa'
  }

  runtimeKeyVault: {
    name: 'kv-${prefix}-${projectName}-${environment}'
  }

  logAnalytics: {
    name: 'log-${prefix}-${projectName}-${environment}'
  }

  containerAppsEnvironment: {
    name: 'cae-${prefix}-${projectName}-${environment}'
  }

  aca: {
    name: 'ca-${prefix}-${projectName}-${environment}'
  }

  runtimeStorage: {
    name: 'st${compactPrefix}${compactProjectName}${environment}'
  }

  localStorage: {
    name: 'st${compactPrefix}${compactProjectName}local${environment}'
  }

  localKeyVault: {
    name: 'kv-${prefix}-${projectName}-local-${environment}'
  }

  staticWebApp: {
    name: '${prefix}-${projectName}-${environment}'
  }

  staticWebAppApplicationInsights: {
    name: 'appi-${prefix}-${projectName}-${environment}'
  }

  staticWebAppLogAnalytics: {
    name: 'log-${prefix}-${projectName}-${environment}-swa'
  }

  blobContainer: {
    name: '${prefix}-${projectName}'
  }
}
