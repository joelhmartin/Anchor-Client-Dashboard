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
 * Get the URL to initiate Google OAuth for a client
 * This redirects to Google, so it should be used with window.location.href
 */
export function getGoogleOAuthConnectUrl(clientId) {
  return `/api/hub/oauth/google/connect?clientId=${clientId}`;
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
 * Get the URL to initiate Facebook OAuth for a client
 * This covers both Facebook Pages and Instagram (via Facebook Graph API)
 */
export function getFacebookOAuthConnectUrl(clientId) {
  return `/api/hub/oauth/facebook/connect?clientId=${clientId}`;
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
 * Get the URL to initiate TikTok OAuth for a client
 */
export function getTikTokOAuthConnectUrl(clientId) {
  return `/api/hub/oauth/tiktok/connect?clientId=${clientId}`;
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
 * Get the URL to initiate WordPress OAuth for a client
 */
export function getWordPressOAuthConnectUrl(clientId) {
  return `/api/hub/oauth/wordpress/connect?clientId=${clientId}`;
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
 * Get the OAuth connect URL for any supported provider
 */
export function getOAuthConnectUrl(provider, clientId) {
  switch (provider) {
    case 'google':
      return getGoogleOAuthConnectUrl(clientId);
    case 'facebook':
    case 'instagram':
      return getFacebookOAuthConnectUrl(clientId);
    case 'tiktok':
      return getTikTokOAuthConnectUrl(clientId);
    case 'wordpress':
      return getWordPressOAuthConnectUrl(clientId);
    default:
      throw new Error(`Unsupported OAuth provider: ${provider}`);
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

