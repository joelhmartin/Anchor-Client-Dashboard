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
// OAuth Connect Flow - Google
// ============================================================================

/**
 * Initiate Google OAuth for a client
 * Returns { authUrl } - frontend should redirect to this URL
 */
export function initiateGoogleOAuth(clientId) {
  return client.post('/hub/oauth/google/connect', { clientId }).then((res) => res.data);
}

/**
 * Fetch Google Business accounts for an OAuth connection
 */
export function fetchGoogleBusinessAccounts(connectionId) {
  return client.get(`/hub/oauth-connections/${connectionId}/google-accounts`).then((res) => res.data.accounts || []);
}

/**
 * Fetch Google Business locations for a specific account
 */
export function fetchGoogleBusinessLocations(connectionId, accountName) {
  return client
    .get(`/hub/oauth-connections/${connectionId}/google-locations`, { params: { accountName } })
    .then((res) => res.data.locations || []);
}

// ============================================================================
// OAuth Connect Flow - Facebook/Instagram
// ============================================================================

/**
 * Initiate Facebook OAuth for a client
 * This covers both Facebook Pages and Instagram (via Facebook Graph API)
 * Returns { authUrl } - frontend should redirect to this URL
 */
export function initiateFacebookOAuth(clientId) {
  return client.post('/hub/oauth/facebook/connect', { clientId }).then((res) => res.data);
}

/**
 * Fetch Facebook Pages for an OAuth connection
 */
export function fetchFacebookPages(connectionId) {
  return client.get(`/hub/oauth-connections/${connectionId}/facebook-pages`).then((res) => res.data.pages || []);
}

/**
 * Fetch Instagram Business accounts linked to Facebook Pages
 */
export function fetchInstagramAccounts(connectionId) {
  return client.get(`/hub/oauth-connections/${connectionId}/instagram-accounts`).then((res) => res.data.accounts || []);
}

// ============================================================================
// OAuth Connect Flow - TikTok
// ============================================================================

/**
 * Initiate TikTok OAuth for a client
 * Returns { authUrl } - frontend should redirect to this URL
 */
export function initiateTikTokOAuth(clientId) {
  return client.post('/hub/oauth/tiktok/connect', { clientId }).then((res) => res.data);
}

/**
 * Fetch TikTok account info for an OAuth connection
 */
export function fetchTikTokAccount(connectionId) {
  return client.get(`/hub/oauth-connections/${connectionId}/tiktok-account`).then((res) => res.data.account || null);
}

// ============================================================================
// OAuth Connect Flow - WordPress
// ============================================================================

/**
 * Initiate WordPress OAuth for a client
 * Returns { authUrl } - frontend should redirect to this URL
 */
export function initiateWordPressOAuth(clientId) {
  return client.post('/hub/oauth/wordpress/connect', { clientId }).then((res) => res.data);
}

/**
 * Fetch WordPress sites for an OAuth connection
 */
export function fetchWordPressSites(connectionId) {
  return client.get(`/hub/oauth-connections/${connectionId}/wordpress-sites`).then((res) => res.data.sites || []);
}

// ============================================================================
// Generic OAuth Connect Helper
// ============================================================================

/**
 * Initiate OAuth for any supported provider
 * Returns a promise that resolves to { authUrl }
 * Frontend should redirect to the returned authUrl
 */
export function initiateOAuth(provider, clientId) {
  switch (provider) {
    case 'google':
      return initiateGoogleOAuth(clientId);
    case 'facebook':
    case 'instagram':
      return initiateFacebookOAuth(clientId);
    case 'tiktok':
      return initiateTikTokOAuth(clientId);
    case 'wordpress':
      return initiateWordPressOAuth(clientId);
    default:
      return Promise.reject(new Error(`Unsupported OAuth provider: ${provider}`));
  }
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
  tiktok: { label: 'TikTok', color: '#000000' },
  wordpress: { label: 'WordPress', color: '#21759B' }
};

export const RESOURCE_TYPES = {
  google_location: { label: 'Google Business Location', provider: 'google' },
  facebook_page: { label: 'Facebook Page', provider: 'facebook' },
  instagram_account: { label: 'Instagram Account', provider: 'instagram' },
  tiktok_account: { label: 'TikTok Account', provider: 'tiktok' },
  wordpress_site: { label: 'WordPress Site', provider: 'wordpress' }
};

export function getResourceTypesForProvider(provider) {
  return Object.entries(RESOURCE_TYPES)
    .filter(([, config]) => config.provider === provider)
    .map(([value, config]) => ({ value, label: config.label }));
}

