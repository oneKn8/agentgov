@description('Azure region for all resources in this RG.')
param location string

@description('Common resource tags propagated to every resource.')
param tags object

@description('Stable, deterministic token used for global-uniqueness suffixes (Log Analytics, App Insights, etc).')
param resourceToken string

@allowed([
  'free'
  'paid'
])
param tier string

param containerImage string

@secure()
param revokeToken string

@secure()
param mcpToken string

var enableObservability = tier == 'paid'
var minReplicas = tier == 'paid' ? 1 : 0
var maxReplicas = tier == 'paid' ? 5 : 3

var envName = 'cae-agentgov-${resourceToken}'
var appName = 'ca-agentgov'
var lawName = 'law-agentgov-${resourceToken}'
var aiName = 'appi-agentgov-${resourceToken}'

resource law 'Microsoft.OperationalInsights/workspaces@2023-09-01' = if (enableObservability) {
  name: lawName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

resource ai 'Microsoft.Insights/components@2020-02-02' = if (enableObservability) {
  name: aiName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: law.id
    DisableIpMasking: false
  }
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: enableObservability ? {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: law.properties.customerId
        sharedKey: law.listKeys().primarySharedKey
      }
    } : {
      destination: 'none'
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

var baseEnvVars = [
  {
    name: 'NODE_ENV'
    value: 'production'
  }
  {
    name: 'PORT'
    value: '8080'
  }
]

var revokeEnvVar = empty(revokeToken) ? [] : [
  {
    name: 'AGENTGOV_REVOKE_TOKEN'
    secretRef: 'revoke-token'
  }
]

var mcpEnvVar = empty(mcpToken) ? [] : [
  {
    name: 'AGENTGOV_MCP_TOKEN'
    secretRef: 'mcp-token'
  }
]

var aiEnvVar = enableObservability ? [
  {
    name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
    value: ai.properties.ConnectionString
  }
] : []

var allSecrets = concat(
  empty(revokeToken) ? [] : [
    {
      name: 'revoke-token'
      value: revokeToken
    }
  ],
  empty(mcpToken) ? [] : [
    {
      name: 'mcp-token'
      value: mcpToken
    }
  ]
)

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: env.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      secrets: allSecrets
    }
    template: {
      containers: [
        {
          name: 'agentgov'
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: concat(baseEnvVars, revokeEnvVar, mcpEnvVar, aiEnvVar)
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/healthz'
                port: 8080
              }
              initialDelaySeconds: 5
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/readyz'
                port: 8080
              }
              initialDelaySeconds: 2
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-scale'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

output fqdn string = app.properties.configuration.ingress.fqdn
output appName string = app.name
output environmentName string = env.name
output appIdentityPrincipalId string = app.identity.principalId
