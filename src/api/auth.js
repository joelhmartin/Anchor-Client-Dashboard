const API_BASE = import.meta.env.VITE_APP_API_BASE || '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'include',
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const contentType = res.headers.get('content-type');
  const data = contentType && contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const message = data?.message || 'Request failed';
    throw new Error(message);
  }

  return data;
}

export function fetchCurrentUser() {
  return request('/auth/me');
}

export function login(payload) {
  return request('/auth/login', { method: 'POST', body: payload });
}

export function register(payload) {
  return request('/auth/register', { method: 'POST', body: payload });
}

export function logout() {
  return request('/auth/logout', { method: 'POST' });
}

export function impersonate(userId) {
  return request('/auth/impersonate', { method: 'POST', body: { user_id: userId } });
}

export function requestPasswordReset(email) {
  return request('/auth/forgot-password', { method: 'POST', body: { email } });
}

export function resetPassword(payload) {
  return request('/auth/reset-password', { method: 'POST', body: payload });
}
