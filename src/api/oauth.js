import client from './client';

// ============================================================================
// OAuth Providers (App-level, Admin-only)
// ============================================================================

export function fetchOAuthProviders() {
  return client.get('/hub/oauth-providers').then((res) => res.data.providers || []);
}

export function fetchOAuthProvider(id) {
  return client.get(`/hub/oauth-providers/${id}`).then((res) => res.data.provider);
}

export function createOAuthProvider(payload) {
  return client.post('/hub/oauth-providers', payload).then((res) => res.data.provider);
}

export function updateOAuthProvider(id, payload) {
  return client.put(`/hub/oauth-providers/${id}`, payload).then((res) => res.data.provider);
}

export function deleteOAuthProvider(id) {
  return client.delete(`/hub/oauth-providers/${id}`).then((res) => res.data);
}

// ============================================================================
// OAuth Connections (Per-client)
// ============================================================================

export function fetchOAuthConnections(clientId) {
  return client.get(`/hub/clients/${clientId}/oauth-connections`).then((res) => res.data.connections || []);
}

export function createOAuthConnection(clientId, payload) {
  return client.post(`/hub/clients/${clientId}/oauth-connections`, payload).then((res) => res.data.connection);
}

export function updateOAuthConnection(connectionId, payload) {
  return client.put(`/hub/oauth-connections/${connectionId}`, payload).then((res) => res.data.connection);
}

export function revokeOAuthConnection(connectionId) {
  return client.post(`/hub/oauth-connections/${connectionId}/revoke`).then((res) => res.data.connection);
}

export function deleteOAuthConnection(connectionId) {
  return client.delete(`/hub/oauth-connections/${connectionId}`).then((res) => res.data);
}

// ============================================================================
// OAuth Resources (Pages/Locations under a connection)
// ============================================================================

export function fetchOAuthResources(connectionId) {
  return client.get(`/hub/oauth-connections/${connectionId}/resources`).then((res) => res.data.resources || []);
}

export function fetchClientOAuthResources(clientId) {
  return client.get(`/hub/clients/${clientId}/oauth-resources`).then((res) => res.data.resources || []);
}

export function createOAuthResource(connectionId, payload) {
  return client.post(`/hub/oauth-connections/${connectionId}/resources`, payload).then((res) => res.data.resource);
}

export function updateOAuthResource(resourceId, payload) {
  return client.put(`/hub/oauth-resources/${resourceId}`, payload).then((res) => res.data.resource);
}

export function deleteOAuthResource(resourceId) {
  return client.delete(`/hub/oauth-resources/${resourceId}`).then((res) => res.data);
}

// ============================================================================
// Helper Constants
// ============================================================================

export const OAUTH_PROVIDERS = {
  google: { label: 'Google', color: '#4285F4' },
  facebook: { label: 'Facebook', color: '#1877F2' },
  instagram: { label: 'Instagram', color: '#E4405F' },
  tiktok: { label: 'TikTok', color: '#000000' }
};

export const RESOURCE_TYPES = {
  google_location: { label: 'Google Business Location', provider: 'google' },
  facebook_page: { label: 'Facebook Page', provider: 'facebook' },
  instagram_account: { label: 'Instagram Account', provider: 'instagram' },
  tiktok_account: { label: 'TikTok Account', provider: 'tiktok' }
};

export function getResourceTypesForProvider(provider) {
  return Object.entries(RESOURCE_TYPES)
    .filter(([, config]) => config.provider === provider)
    .map(([value, config]) => ({ value, label: config.label }));
}

