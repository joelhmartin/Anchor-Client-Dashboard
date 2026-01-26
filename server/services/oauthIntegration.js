/**
 * OAuth Integration Service
 * 
 * Handles OAuth flows for connecting third-party services to client accounts.
 * Separate from user authentication - this is for client integrations (e.g., Google Business Profile).
 */

import crypto from 'crypto';
import { query } from '../db.js';

// ============================================================================
// Google OAuth Configuration
// ============================================================================
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_BUSINESS_ACCOUNTS_URL = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';
const GOOGLE_BUSINESS_LOCATIONS_URL = 'https://mybusinessbusinessinformation.googleapis.com/v1';

const GOOGLE_BUSINESS_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/business.manage'
];

// ============================================================================
// Facebook/Instagram (Meta) OAuth Configuration
// ============================================================================
const FACEBOOK_AUTH_URL = 'https://www.facebook.com/v18.0/dialog/oauth';
const FACEBOOK_TOKEN_URL = 'https://graph.facebook.com/v18.0/oauth/access_token';
const FACEBOOK_GRAPH_URL = 'https://graph.facebook.com/v18.0';

// Facebook scopes for Pages and Instagram management
const FACEBOOK_SCOPES = [
  'email',
  'public_profile',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_read_user_content',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_comments',
  'instagram_manage_insights'
];

// ============================================================================
// TikTok OAuth Configuration
// ============================================================================
const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_API_URL = 'https://open.tiktokapis.com/v2';

// TikTok scopes for business account management
const TIKTOK_SCOPES = [
  'user.info.basic',
  'user.info.profile',
  'user.info.stats',
  'video.list',
  'video.publish',
  'video.upload'
];

// ============================================================================
// WordPress OAuth Configuration (WordPress.com / Jetpack)
// ============================================================================
const WORDPRESS_AUTH_URL = 'https://public-api.wordpress.com/oauth2/authorize';
const WORDPRESS_TOKEN_URL = 'https://public-api.wordpress.com/oauth2/token';
const WORDPRESS_API_URL = 'https://public-api.wordpress.com/rest/v1.1';
const WORDPRESS_API_V2_URL = 'https://public-api.wordpress.com/wp/v2';

// WordPress scopes for site management and posting
const WORDPRESS_SCOPES = [
  'global',  // Access to all sites the user has access to
  'posts',   // Create, edit, delete posts
  'media'    // Upload media
];

// ============================================================================
// Cookie prefixes for OAuth state
// ============================================================================
const OAUTH_STATE_PREFIX = 'oauth_int_state_';
const OAUTH_VERIFIER_PREFIX = 'oauth_int_verifier_';
const OAUTH_CLIENT_PREFIX = 'oauth_int_client_';

/**
 * Base64 URL encode a buffer
 */
function base64UrlEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Create a random OAuth state parameter
 */
export function createOauthState() {
  return base64UrlEncode(crypto.randomBytes(32));
}

/**
 * Create a PKCE code verifier
 */
export function createCodeVerifier() {
  return base64UrlEncode(crypto.randomBytes(32));
}

/**
 * Create a PKCE code challenge from a verifier
 */
export function createCodeChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64UrlEncode(hash);
}

// ============================================================================
// Provider-specific OAuth Configurations
// ============================================================================

/**
 * Get Google OAuth config for Business Profile integration
 */
export function getGoogleBusinessOAuthConfig(redirectUri) {
  return {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri,
    authUrl: GOOGLE_AUTH_URL,
    tokenUrl: GOOGLE_TOKEN_URL,
    scopes: GOOGLE_BUSINESS_SCOPES
  };
}

/**
 * Get Facebook OAuth config (also covers Instagram)
 */
export function getFacebookOAuthConfig(redirectUri) {
  return {
    clientId: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    redirectUri,
    authUrl: FACEBOOK_AUTH_URL,
    tokenUrl: FACEBOOK_TOKEN_URL,
    scopes: FACEBOOK_SCOPES
  };
}

/**
 * Get TikTok OAuth config
 */
export function getTikTokOAuthConfig(redirectUri) {
  return {
    clientId: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    redirectUri,
    authUrl: TIKTOK_AUTH_URL,
    tokenUrl: TIKTOK_TOKEN_URL,
    scopes: TIKTOK_SCOPES
  };
}

/**
 * Get WordPress OAuth config (WordPress.com / Jetpack connected sites)
 */
export function getWordPressOAuthConfig(redirectUri) {
  return {
    clientId: process.env.WORDPRESS_CLIENT_ID,
    clientSecret: process.env.WORDPRESS_CLIENT_SECRET,
    redirectUri,
    authUrl: WORDPRESS_AUTH_URL,
    tokenUrl: WORDPRESS_TOKEN_URL,
    scopes: WORDPRESS_SCOPES
  };
}

// ============================================================================
// Authorization URL Builders
// ============================================================================

/**
 * Build the Google OAuth authorization URL
 */
export function buildGoogleAuthUrl(config, { state, codeChallenge }) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent' // Force consent to get refresh token
  });

  return `${config.authUrl}?${params.toString()}`;
}

/**
 * Build the Facebook OAuth authorization URL
 */
export function buildFacebookAuthUrl(config, { state }) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(','),
    state,
    auth_type: 'rerequest' // Re-request declined permissions
  });

  return `${config.authUrl}?${params.toString()}`;
}

/**
 * Build the TikTok OAuth authorization URL
 */
export function buildTikTokAuthUrl(config, { state, codeChallenge }) {
  const params = new URLSearchParams({
    client_key: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(','),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });

  return `${config.authUrl}?${params.toString()}`;
}

/**
 * Build the WordPress OAuth authorization URL
 */
export function buildWordPressAuthUrl(config, { state }) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state
  });

  return `${config.authUrl}?${params.toString()}`;
}

// ============================================================================
// Token Exchange Functions
// ============================================================================

/**
 * Exchange authorization code for tokens (Google - with PKCE)
 */
export async function exchangeCodeForTokens(config, code, codeVerifier) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code,
    code_verifier: codeVerifier
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[oauthIntegration:exchangeCode] Failed:', text);
    throw new Error(`OAuth token exchange failed: ${text}`);
  }

  return response.json();
}

/**
 * Exchange authorization code for tokens (Facebook)
 */
export async function exchangeFacebookCodeForTokens(config, code) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code
  });

  const response = await fetch(`${config.tokenUrl}?${params.toString()}`);

  if (!response.ok) {
    const text = await response.text();
    console.error('[oauthIntegration:exchangeFacebookCode] Failed:', text);
    throw new Error(`Facebook token exchange failed: ${text}`);
  }

  const data = await response.json();
  
  // Facebook returns short-lived token, exchange for long-lived token
  const longLivedResponse = await fetch(
    `${FACEBOOK_GRAPH_URL}/oauth/access_token?` +
    `grant_type=fb_exchange_token&` +
    `client_id=${config.clientId}&` +
    `client_secret=${config.clientSecret}&` +
    `fb_exchange_token=${data.access_token}`
  );

  if (!longLivedResponse.ok) {
    console.warn('[oauthIntegration] Could not get long-lived token, using short-lived');
    return data;
  }

  return longLivedResponse.json();
}

/**
 * Exchange authorization code for tokens (TikTok - with PKCE)
 */
export async function exchangeTikTokCodeForTokens(config, code, codeVerifier) {
  const params = new URLSearchParams({
    client_key: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[oauthIntegration:exchangeTikTokCode] Failed:', text);
    throw new Error(`TikTok token exchange failed: ${text}`);
  }

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`TikTok OAuth error: ${data.error.message || data.error}`);
  }

  return data.data || data;
}

/**
 * Exchange authorization code for tokens (WordPress)
 */
export async function exchangeWordPressCodeForTokens(config, code) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[oauthIntegration:exchangeWordPressCode] Failed:', text);
    throw new Error(`WordPress token exchange failed: ${text}`);
  }

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`WordPress OAuth error: ${data.error_description || data.error}`);
  }

  // WordPress returns: access_token, blog_id, blog_url, token_type
  return data;
}

// ============================================================================
// Profile Fetching Functions
// ============================================================================

/**
 * Fetch Google user profile (to get account identifier)
 */
export async function fetchGoogleProfile(accessToken) {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch Google profile: ${text}`);
  }

  const data = await res.json();
  return {
    id: data.sub,
    email: data.email,
    name: data.name || data.email,
    picture: data.picture
  };
}

/**
 * Fetch Facebook user profile
 */
export async function fetchFacebookProfile(accessToken) {
  const res = await fetch(
    `${FACEBOOK_GRAPH_URL}/me?fields=id,name,email,picture&access_token=${accessToken}`
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch Facebook profile: ${text}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    email: data.email || '',
    name: data.name,
    picture: data.picture?.data?.url || ''
  };
}

/**
 * Fetch TikTok user profile
 */
export async function fetchTikTokProfile(accessToken) {
  const res = await fetch(
    `${TIKTOK_API_URL}/user/info/?fields=open_id,display_name,avatar_url,username`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch TikTok profile: ${text}`);
  }

  const result = await res.json();
  const data = result.data?.user || {};
  
  return {
    id: data.open_id,
    email: '', // TikTok doesn't provide email
    name: data.display_name || data.username || data.open_id,
    username: data.username,
    picture: data.avatar_url || ''
  };
}

/**
 * Fetch WordPress user profile and primary site info
 * WordPress OAuth returns blog_id and blog_url with the token
 */
export async function fetchWordPressProfile(accessToken, tokenData = {}) {
  // Fetch user info from WordPress.com API
  const res = await fetch(`${WORDPRESS_API_URL}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch WordPress profile: ${text}`);
  }

  const data = await res.json();
  
  return {
    id: String(data.ID),
    email: data.email || '',
    name: data.display_name || data.username,
    username: data.username,
    picture: data.avatar_URL || '',
    primaryBlogId: tokenData.blog_id || data.primary_blog,
    primaryBlogUrl: tokenData.blog_url || data.primary_blog_url
  };
}

/**
 * Fetch Google Business accounts for the authenticated user
 */
export async function fetchGoogleBusinessAccounts(accessToken) {
  const res = await fetch(GOOGLE_BUSINESS_ACCOUNTS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[oauthIntegration:fetchAccounts] Failed:', text);
    // Return empty if no accounts or no permission
    if (res.status === 404 || res.status === 403) {
      return [];
    }
    throw new Error(`Failed to fetch Google Business accounts: ${text}`);
  }

  const data = await res.json();
  return (data.accounts || []).map((account) => ({
    name: account.name, // format: accounts/123456789
    accountName: account.accountName,
    type: account.type,
    role: account.role,
    state: account.state?.status
  }));
}

/**
 * Fetch locations for a Google Business account
 */
export async function fetchGoogleBusinessLocations(accessToken, accountName) {
  // accountName format: accounts/123456789
  const url = `${GOOGLE_BUSINESS_LOCATIONS_URL}/${accountName}/locations?readMask=name,title,storefrontAddress,websiteUri`;
  
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[oauthIntegration:fetchLocations] Failed:', text);
    if (res.status === 404 || res.status === 403) {
      return [];
    }
    throw new Error(`Failed to fetch Google Business locations: ${text}`);
  }

  const data = await res.json();
  return (data.locations || []).map((loc) => ({
    name: loc.name, // format: locations/123456789
    title: loc.title,
    address: loc.storefrontAddress,
    websiteUri: loc.websiteUri
  }));
}

// ============================================================================
// Facebook/Instagram Resource Functions
// ============================================================================

/**
 * Fetch Facebook Pages the user manages
 */
export async function fetchFacebookPages(accessToken) {
  const res = await fetch(
    `${FACEBOOK_GRAPH_URL}/me/accounts?fields=id,name,access_token,category,picture,link,instagram_business_account&access_token=${accessToken}`
  );

  if (!res.ok) {
    const text = await res.text();
    console.error('[oauthIntegration:fetchFacebookPages] Failed:', text);
    if (res.status === 404 || res.status === 403) {
      return [];
    }
    throw new Error(`Failed to fetch Facebook Pages: ${text}`);
  }

  const data = await res.json();
  return (data.data || []).map((page) => ({
    id: page.id,
    name: page.name,
    category: page.category,
    picture: page.picture?.data?.url || '',
    link: page.link,
    accessToken: page.access_token, // Page-specific token for posting
    instagramBusinessAccountId: page.instagram_business_account?.id || null
  }));
}

/**
 * Fetch Instagram Business Account details for a Facebook Page
 */
export async function fetchInstagramAccountForPage(pageAccessToken, instagramAccountId) {
  const res = await fetch(
    `${FACEBOOK_GRAPH_URL}/${instagramAccountId}?fields=id,username,name,profile_picture_url,followers_count,media_count&access_token=${pageAccessToken}`
  );

  if (!res.ok) {
    const text = await res.text();
    console.error('[oauthIntegration:fetchInstagramAccount] Failed:', text);
    return null;
  }

  const data = await res.json();
  return {
    id: data.id,
    username: data.username,
    name: data.name || data.username,
    picture: data.profile_picture_url || '',
    followersCount: data.followers_count,
    mediaCount: data.media_count
  };
}

/**
 * Fetch all Instagram accounts connected to the user's Facebook Pages
 */
export async function fetchInstagramAccounts(accessToken) {
  // First get all pages
  const pages = await fetchFacebookPages(accessToken);
  
  // Then get Instagram accounts for pages that have them
  const instagramAccounts = [];
  
  for (const page of pages) {
    if (page.instagramBusinessAccountId) {
      const igAccount = await fetchInstagramAccountForPage(
        page.accessToken,
        page.instagramBusinessAccountId
      );
      if (igAccount) {
        instagramAccounts.push({
          ...igAccount,
          linkedPageId: page.id,
          linkedPageName: page.name,
          pageAccessToken: page.accessToken
        });
      }
    }
  }
  
  return instagramAccounts;
}

// ============================================================================
// TikTok Resource Functions
// ============================================================================

/**
 * Fetch TikTok account info (the authenticated user's account)
 * TikTok doesn't have "pages" like Facebook - just the user's own account
 */
export async function fetchTikTokAccountInfo(accessToken) {
  const res = await fetch(
    `${TIKTOK_API_URL}/user/info/?fields=open_id,union_id,avatar_url,display_name,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count,username`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error('[oauthIntegration:fetchTikTokAccountInfo] Failed:', text);
    throw new Error(`Failed to fetch TikTok account info: ${text}`);
  }

  const result = await res.json();
  const user = result.data?.user || {};
  
  return {
    id: user.open_id,
    unionId: user.union_id,
    username: user.username,
    displayName: user.display_name,
    bio: user.bio_description,
    profileUrl: user.profile_deep_link,
    picture: user.avatar_url,
    isVerified: user.is_verified,
    followerCount: user.follower_count,
    followingCount: user.following_count,
    likesCount: user.likes_count,
    videoCount: user.video_count
  };
}

// ============================================================================
// WordPress Resource Functions
// ============================================================================

/**
 * Fetch WordPress sites the user has access to
 */
export async function fetchWordPressSites(accessToken) {
  const res = await fetch(`${WORDPRESS_API_URL}/me/sites`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[oauthIntegration:fetchWordPressSites] Failed:', text);
    if (res.status === 404 || res.status === 403) {
      return [];
    }
    throw new Error(`Failed to fetch WordPress sites: ${text}`);
  }

  const data = await res.json();
  return (data.sites || []).map((site) => ({
    id: String(site.ID),
    blogId: site.ID,
    name: site.name,
    description: site.description,
    url: site.URL,
    adminUrl: site.admin_URL,
    icon: site.icon?.img || '',
    isPrivate: site.is_private,
    isJetpack: site.jetpack,
    capabilities: site.capabilities || {},
    plan: site.plan?.product_name_short || 'Free'
  }));
}

/**
 * Fetch WordPress site info by ID
 */
export async function fetchWordPressSiteInfo(accessToken, siteId) {
  const res = await fetch(`${WORDPRESS_API_URL}/sites/${siteId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[oauthIntegration:fetchWordPressSiteInfo] Failed:', text);
    throw new Error(`Failed to fetch WordPress site info: ${text}`);
  }

  const site = await res.json();
  return {
    id: String(site.ID),
    blogId: site.ID,
    name: site.name,
    description: site.description,
    url: site.URL,
    adminUrl: site.admin_URL,
    icon: site.icon?.img || '',
    isPrivate: site.is_private,
    isJetpack: site.jetpack,
    postCount: site.post_count,
    capabilities: site.capabilities || {}
  };
}

/**
 * Create a blog post on a WordPress site
 */
export async function createWordPressPost(accessToken, siteId, postData) {
  const res = await fetch(`${WORDPRESS_API_URL}/sites/${siteId}/posts/new`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: postData.title,
      content: postData.content,
      status: postData.status || 'draft', // draft, publish, pending, private
      excerpt: postData.excerpt || '',
      categories: postData.categories || [],
      tags: postData.tags || [],
      featured_image: postData.featuredImage || '',
      format: postData.format || 'standard'
    })
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[oauthIntegration:createWordPressPost] Failed:', text);
    throw new Error(`Failed to create WordPress post: ${text}`);
  }

  const post = await res.json();
  return {
    id: post.ID,
    title: post.title,
    url: post.URL,
    shortUrl: post.short_URL,
    status: post.status,
    date: post.date
  };
}

/**
 * Set OAuth cookies for state management
 */
export function setOAuthCookies(res, provider, { state, verifier, clientId }) {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000 // 10 minutes
  };

  res.cookie(`${OAUTH_STATE_PREFIX}${provider}`, state, cookieOptions);
  res.cookie(`${OAUTH_VERIFIER_PREFIX}${provider}`, verifier, cookieOptions);
  res.cookie(`${OAUTH_CLIENT_PREFIX}${provider}`, clientId, cookieOptions);
}

/**
 * Get OAuth cookies
 */
export function getOAuthCookies(req, provider) {
  return {
    state: req.cookies?.[`${OAUTH_STATE_PREFIX}${provider}`],
    verifier: req.cookies?.[`${OAUTH_VERIFIER_PREFIX}${provider}`],
    clientId: req.cookies?.[`${OAUTH_CLIENT_PREFIX}${provider}`]
  };
}

/**
 * Clear OAuth cookies after callback
 */
export function clearOAuthCookies(res, provider) {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  };

  res.clearCookie(`${OAUTH_STATE_PREFIX}${provider}`, cookieOptions);
  res.clearCookie(`${OAUTH_VERIFIER_PREFIX}${provider}`, cookieOptions);
  res.clearCookie(`${OAUTH_CLIENT_PREFIX}${provider}`, cookieOptions);
}

/**
 * Get default scopes for a provider
 */
function getDefaultScopesForProvider(provider) {
  switch (provider) {
    case 'google':
      return GOOGLE_BUSINESS_SCOPES;
    case 'facebook':
    case 'instagram':
      return FACEBOOK_SCOPES;
    case 'tiktok':
      return TIKTOK_SCOPES;
    case 'wordpress':
      return WORDPRESS_SCOPES;
    default:
      return [];
  }
}

/**
 * Save or update OAuth connection for a client
 */
export async function saveOAuthConnection(clientId, provider, tokens, profile) {
  // Check if connection already exists for this provider + account
  const existing = await query(
    `SELECT id FROM oauth_connections 
     WHERE client_id = $1 AND provider = $2 AND provider_account_id = $3`,
    [clientId, provider, profile.id]
  );

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  // Parse scope from token response or use defaults
  let scopeGranted;
  if (tokens.scope) {
    // Google uses space-separated, Facebook/TikTok may use comma-separated
    scopeGranted = tokens.scope.includes(',') 
      ? tokens.scope.split(',') 
      : tokens.scope.split(' ');
  } else {
    scopeGranted = getDefaultScopesForProvider(provider);
  }

  if (existing.rows.length > 0) {
    // Update existing connection
    const { rows } = await query(
      `UPDATE oauth_connections SET
        provider_account_name = $2,
        access_token = $3,
        refresh_token = COALESCE($4, refresh_token),
        scope_granted = $5,
        expires_at = $6,
        is_connected = true,
        last_error = NULL,
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        existing.rows[0].id,
        profile.name,
        tokens.access_token,
        tokens.refresh_token,
        scopeGranted,
        expiresAt
      ]
    );
    return rows[0];
  } else {
    // Create new connection
    const { rows } = await query(
      `INSERT INTO oauth_connections 
        (client_id, provider, provider_account_id, provider_account_name, 
         access_token, refresh_token, scope_granted, expires_at, is_connected)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
       RETURNING *`,
      [
        clientId,
        provider,
        profile.id,
        profile.name,
        tokens.access_token,
        tokens.refresh_token,
        scopeGranted,
        expiresAt
      ]
    );
    return rows[0];
  }
}

// ============================================================================
// Token Refresh Functions
// ============================================================================

/**
 * Refresh an expired Google access token
 */
export async function refreshGoogleAccessToken(connectionId) {
  const { rows } = await query(
    'SELECT refresh_token FROM oauth_connections WHERE id = $1',
    [connectionId]
  );

  if (!rows.length || !rows[0].refresh_token) {
    throw new Error('No refresh token available');
  }

  const refreshToken = rows[0].refresh_token;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token: refreshToken
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    // Mark connection as disconnected
    await query(
      `UPDATE oauth_connections SET is_connected = false, last_error = $2, updated_at = NOW() WHERE id = $1`,
      [connectionId, `Token refresh failed: ${text}`]
    );
    throw new Error(`Token refresh failed: ${text}`);
  }

  const tokens = await response.json();
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  // Update connection with new access token
  await query(
    `UPDATE oauth_connections SET 
      access_token = $2, 
      expires_at = $3, 
      is_connected = true,
      last_error = NULL,
      updated_at = NOW() 
     WHERE id = $1`,
    [connectionId, tokens.access_token, expiresAt]
  );

  return tokens.access_token;
}

/**
 * Refresh Facebook access token
 * Note: Facebook long-lived tokens last ~60 days and can be refreshed before expiry
 */
export async function refreshFacebookAccessToken(connectionId) {
  const { rows } = await query(
    'SELECT access_token FROM oauth_connections WHERE id = $1',
    [connectionId]
  );

  if (!rows.length || !rows[0].access_token) {
    throw new Error('No access token available');
  }

  const currentToken = rows[0].access_token;

  // Facebook doesn't use refresh tokens - you exchange the current token for a new one
  const response = await fetch(
    `${FACEBOOK_GRAPH_URL}/oauth/access_token?` +
    `grant_type=fb_exchange_token&` +
    `client_id=${process.env.FACEBOOK_APP_ID}&` +
    `client_secret=${process.env.FACEBOOK_APP_SECRET}&` +
    `fb_exchange_token=${currentToken}`
  );

  if (!response.ok) {
    const text = await response.text();
    await query(
      `UPDATE oauth_connections SET is_connected = false, last_error = $2, updated_at = NOW() WHERE id = $1`,
      [connectionId, `Token refresh failed: ${text}`]
    );
    throw new Error(`Facebook token refresh failed: ${text}`);
  }

  const tokens = await response.json();
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  await query(
    `UPDATE oauth_connections SET 
      access_token = $2, 
      expires_at = $3, 
      is_connected = true,
      last_error = NULL,
      updated_at = NOW() 
     WHERE id = $1`,
    [connectionId, tokens.access_token, expiresAt]
  );

  return tokens.access_token;
}

/**
 * Refresh TikTok access token
 */
export async function refreshTikTokAccessToken(connectionId) {
  const { rows } = await query(
    'SELECT refresh_token FROM oauth_connections WHERE id = $1',
    [connectionId]
  );

  if (!rows.length || !rows[0].refresh_token) {
    throw new Error('No refresh token available');
  }

  const refreshToken = rows[0].refresh_token;

  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  const response = await fetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    await query(
      `UPDATE oauth_connections SET is_connected = false, last_error = $2, updated_at = NOW() WHERE id = $1`,
      [connectionId, `Token refresh failed: ${text}`]
    );
    throw new Error(`TikTok token refresh failed: ${text}`);
  }

  const result = await response.json();
  const tokens = result.data || result;
  
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  await query(
    `UPDATE oauth_connections SET 
      access_token = $2, 
      refresh_token = COALESCE($3, refresh_token),
      expires_at = $4, 
      is_connected = true,
      last_error = NULL,
      updated_at = NOW() 
     WHERE id = $1`,
    [connectionId, tokens.access_token, tokens.refresh_token, expiresAt]
  );

  return tokens.access_token;
}

/**
 * Refresh WordPress access token
 * Note: WordPress.com tokens don't expire by default, but we support refresh for Jetpack sites
 */
export async function refreshWordPressAccessToken(connectionId) {
  const { rows } = await query(
    'SELECT access_token, refresh_token FROM oauth_connections WHERE id = $1',
    [connectionId]
  );

  if (!rows.length) {
    throw new Error('Connection not found');
  }

  // WordPress.com tokens typically don't expire, so we might just need to validate
  // If there's a refresh token (Jetpack), try to refresh
  if (rows[0].refresh_token) {
    const params = new URLSearchParams({
      client_id: process.env.WORDPRESS_CLIENT_ID,
      client_secret: process.env.WORDPRESS_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: rows[0].refresh_token
    });

    const response = await fetch(WORDPRESS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) {
      const text = await response.text();
      await query(
        `UPDATE oauth_connections SET is_connected = false, last_error = $2, updated_at = NOW() WHERE id = $1`,
        [connectionId, `Token refresh failed: ${text}`]
      );
      throw new Error(`WordPress token refresh failed: ${text}`);
    }

    const tokens = await response.json();
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    await query(
      `UPDATE oauth_connections SET 
        access_token = $2, 
        refresh_token = COALESCE($3, refresh_token),
        expires_at = $4, 
        is_connected = true,
        last_error = NULL,
        updated_at = NOW() 
       WHERE id = $1`,
      [connectionId, tokens.access_token, tokens.refresh_token, expiresAt]
    );

    return tokens.access_token;
  }

  // If no refresh token, just return the existing access token (WordPress.com tokens are long-lived)
  return rows[0].access_token;
}

/**
 * Generic refresh function that routes to provider-specific refresh
 */
export async function refreshAccessToken(connectionId, provider) {
  switch (provider) {
    case 'google':
      return refreshGoogleAccessToken(connectionId);
    case 'facebook':
    case 'instagram':
      return refreshFacebookAccessToken(connectionId);
    case 'tiktok':
      return refreshTikTokAccessToken(connectionId);
    case 'wordpress':
      return refreshWordPressAccessToken(connectionId);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

