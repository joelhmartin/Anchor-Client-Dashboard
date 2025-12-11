import client from './client';

export function fetchOnboarding(token) {
  return client.get(`/onboarding/${token}`).then((res) => res.data);
}

export function submitOnboarding(token, payload) {
  return client.post(`/onboarding/${token}`, payload).then((res) => res.data);
}

export function uploadOnboardingAvatar(token, file) {
  const formData = new FormData();
  formData.append('avatar', file);
  return client.post(`/onboarding/${token}/avatar`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
}

export function uploadOnboardingBrandAsset(token, file) {
  const formData = new FormData();
  formData.append('brand_asset', file);
  return client.post(`/onboarding/${token}/brand-assets`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
}
