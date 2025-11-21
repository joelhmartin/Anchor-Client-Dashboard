import client from './client';

export function fetchProfile() {
  return client.get('/hub/profile').then((res) => res.data.user);
}

export function updateProfile(payload) {
  return client.put('/hub/profile', payload).then((res) => res.data.user);
}

export function uploadAvatar(file) {
  const formData = new FormData();
  formData.append('avatar', file);
  return client
    .post('/hub/profile/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    .then((res) => res.data);
}
