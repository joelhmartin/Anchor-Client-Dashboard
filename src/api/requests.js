import client from './client';

export function fetchTasksAndRequests() {
  return client.get('/hub/requests').then((res) => res.data);
}

export function submitRequest(payload) {
  const { attachment, ...fields } = payload || {};
  if (attachment) {
    const formData = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (typeof value === 'boolean') {
        formData.append(key, value ? 'true' : 'false');
      } else {
        formData.append(key, value);
      }
    });
    formData.append('attachment', attachment);
    return client
      .post('/hub/requests', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      .then((res) => res.data);
  }
  return client.post('/hub/requests', fields).then((res) => res.data);
}
