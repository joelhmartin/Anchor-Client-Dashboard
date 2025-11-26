import client from './client';

export function fetchServices() {
  return client.get('/hub/services').then((res) => res.data.services);
}

export function createService(payload) {
  return client.post('/hub/services', payload).then((res) => res.data.service);
}

export function updateService(id, payload) {
  return client.put(`/hub/services/${id}`, payload).then((res) => res.data.service);
}

export function deleteService(id) {
  return client.delete(`/hub/services/${id}`).then((res) => res.data);
}

export function fetchActiveClients() {
  return client.get('/hub/active-clients').then((res) => res.data.active_clients);
}

export function agreeToService(userId, payload) {
  return client.post(`/hub/clients/${userId}/agree-to-service`, payload).then((res) => res.data);
}

export function redactOldServices() {
  return client.post('/hub/active-clients/redact-services').then((res) => res.data);
}

export function applyServicePreset(clientId, services) {
  return client.post(`/hub/clients/${clientId}/service-presets`, { services }).then((res) => res.data);
}

export function fetchClientServices(clientId) {
  return client.get(`/hub/admin/clients/${clientId}/services`).then((res) => res.data.services);
}

export function saveClientServices(clientId, services) {
  return client.put(`/hub/admin/clients/${clientId}/services`, { services }).then((res) => res.data.services);
}
