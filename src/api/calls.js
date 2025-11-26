import client from './client';

export function fetchCalls() {
  return client.get('/hub/calls').then((res) => res.data.calls || []);
}

export function scoreCall(callId, score) {
  return client.post(`/hub/calls/${callId}/score`, { score }).then((res) => res.data);
}

export function clearCallScore(callId) {
  return client.delete(`/hub/calls/${callId}/score`).then((res) => res.data);
}

export function clearAndReloadCalls() {
  return client.delete('/hub/calls').then((res) => ({
    calls: res.data.calls || [],
    message: res.data.message
  }));
}
