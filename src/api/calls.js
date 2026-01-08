import client from './client';

// Fetch cached calls (instant load from database)
export function fetchCalls() {
  return client.get('/hub/calls').then((res) => ({
    calls: res.data.calls || [],
    cached: res.data.cached || false,
    message: res.data.message
  }));
}

// Sync with CTM and return updated calls (use for background refresh)
export function syncCalls() {
  return client.post('/hub/calls/sync').then((res) => ({
    calls: res.data.calls || [],
    synced: res.data.synced || false,
    newCalls: res.data.newCalls || 0,
    updatedCalls: res.data.updatedCalls || 0,
    message: res.data.message
  }));
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
