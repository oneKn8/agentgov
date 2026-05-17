targetScope = 'subscription'

@minLength(1)
@maxLength(48)
@description('azd environment name. Used as the resource-group suffix and as a tag for azd downs.')
param environmentName string

@minLength(1)
@description('Primary Azure region for all resources.')
param location string

@allowed([
  'free'
  'paid'
])
@description('Service tier. free: Consumption profile, scale-to-zero, no observability. paid: adds Log Analytics + App Insights and pins minReplicas=1.')
param tier string = 'free'

@description('Fully-qualified container image reference (e.g. myacr.azurecr.io/agentgov:0.1.0). Override at deploy time once Codex ships a Dockerfile.')
param containerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@secure()
@description('Optional. Bearer token required for /releases/{id}/revoke when set. Stored as a Container Apps secret.')
param revokeToken string = ''

@secure()
@description('Optional. Bearer token required for POST /mcp when AGENTGOV_ALLOW_ANY_ORIGIN=true. Stored as a Container Apps secret.')
param mcpToken string = ''

var rgName = 'rg-agentgov-${environmentName}'
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = {
  'azd-env-name': environmentName
  workload: 'agentgov'
  tier: tier
}

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: rgName
  location: location
  tags: tags
}

module workload 'workload.bicep' = {
  name: 'agentgov-workload'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
    tier: tier
    containerImage: containerImage
    revokeToken: revokeToken
    mcpToken: mcpToken
  }
}

output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_TENANT_ID string = tenant().tenantId
output AGENTGOV_FQDN string = workload.outputs.fqdn
output AGENTGOV_URL string = 'https://${workload.outputs.fqdn}'
