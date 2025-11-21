import client from './client';

export function fetchClients() {
  return client.get('/hub/clients').then((res) => res.data.clients || []);
}

export function createClient(payload) {
  return client.post('/hub/clients', payload).then((res) => res.data);
}

export function updateClient(id, payload) {
  return client.put(`/hub/clients/${id}`, payload).then((res) => res.data.client);
}
