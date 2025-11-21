import client from './client';

export function fetchTasksAndRequests() {
  return client.get('/hub/requests').then((res) => res.data);
}

export function submitRequest(payload) {
  return client.post('/hub/requests', payload).then((res) => res.data);
}
