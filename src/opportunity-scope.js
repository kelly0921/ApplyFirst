const coreOpportunityTypes = new Set([
  'Discovery Program',
  'Fellowship',
  'Startup / VC Fellowship',
  'Winternship',
  'Full-Time Alternative',
]);

const validDiscoveryScopes = new Set(['core', 'reference', 'review']);

export function getOpportunityDiscoveryScope(opportunity = {}) {
  const explicitScope = String(opportunity.discoveryScope || '').trim().toLowerCase();
  if (validDiscoveryScopes.has(explicitScope)) return explicitScope;

  return coreOpportunityTypes.has(opportunity.category) ? 'core' : 'reference';
}

export function isCoreOpportunity(opportunity) {
  return getOpportunityDiscoveryScope(opportunity) === 'core';
}
