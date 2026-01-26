import crypto from 'crypto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MICROSOFT_USERINFO_URL = 'https://graph.microsoft.com/v1.0/me';

const DEFAULT_GOOGLE_SCOPES = ['openid', 'email', 'profile'];
const DEFAULT_MICROSOFT_SCOPES = ['openid', 'email', 'profile', 'User.Read'];

function base64UrlEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createOauthState() {
  return base64UrlEncode(crypto.randomBytes(32));
}

export function createCodeVerifier() {
  return base64UrlEncode(crypto.randomBytes(32));
}

export function createCodeChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64UrlEncode(hash);
}

function parseScopes(raw, fallback) {
  const scopes = (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return scopes.length > 0 ? scopes : fallback;
}

export function getOauthConfig(provider, redirectUri) {
  if (provider === 'google') {
    return {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirectUri,
      authUrl: GOOGLE_AUTH_URL,
      tokenUrl: GOOGLE_TOKEN_URL,
      scopes: parseScopes(process.env.GOOGLE_OAUTH_SCOPES, DEFAULT_GOOGLE_SCOPES)
    };
  }

  if (provider === 'microsoft') {
    return {
      clientId: process.env.MICROSOFT_OAUTH_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET,
      redirectUri,
      authUrl: MICROSOFT_AUTH_URL,
      tokenUrl: MICROSOFT_TOKEN_URL,
      scopes: parseScopes(process.env.MICROSOFT_OAUTH_SCOPES, DEFAULT_MICROSOFT_SCOPES)
    };
  }

  return null;
}

export function buildAuthUrl(provider, config, { state, codeChallenge }) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });

  if (provider === 'google') {
    params.set('access_type', 'offline');
    params.set('prompt', 'select_account');
  }

  if (provider === 'microsoft') {
    params.set('prompt', 'select_account');
  }

  return `${config.authUrl}?${params.toString()}`;
}

export async function exchangeCodeForTokens(provider, config, code, codeVerifier) {
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
    throw new Error(`OAuth token exchange failed: ${text}`);
  }

  return response.json();
}

export async function fetchProviderProfile(provider, tokens) {
  if (provider === 'google') {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google userinfo failed: ${text}`);
    }
    const data = await res.json();
    return {
      providerUserId: data.sub,
      email: data.email,
      emailVerified: Boolean(data.email_verified),
      firstName: data.given_name || '',
      lastName: data.family_name || '',
      name: data.name || '',
      picture: data.picture || ''
    };
  }

  if (provider === 'microsoft') {
    const res = await fetch(MICROSOFT_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Microsoft userinfo failed: ${text}`);
    }
    const data = await res.json();
    const email = data.mail || data.userPrincipalName || '';
    const name = data.displayName || '';
    const [firstName, ...rest] = name.split(' ').filter(Boolean);
    return {
      providerUserId: data.id,
      email,
      emailVerified: true,
      firstName: firstName || '',
      lastName: rest.join(' '),
      name,
      picture: ''
    };
  }

  throw new Error('Unsupported OAuth provider');
}

