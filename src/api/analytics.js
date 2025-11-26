import client from './client';

export function fetchAnalyticsUrl() {
  return client.get('/hub/analytics').then((res) => res.data.looker_url || null);
}
