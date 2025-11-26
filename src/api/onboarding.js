import client from './client';

export function fetchOnboarding(token) {
  return client.get(`/onboarding/${token}`).then((res) => res.data);
}

export function submitOnboarding(token, payload) {
  return client.post(`/onboarding/${token}`, payload).then((res) => res.data);
}
