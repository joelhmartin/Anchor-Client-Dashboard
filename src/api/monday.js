import client from './client';

export function fetchMondaySettings() {
  return client.get('/hub/monday/settings').then((res) => res.data.settings);
}

export function saveMondaySettings(payload) {
  return client.put('/hub/monday/settings', payload).then((res) => res.data.settings);
}

export function fetchBoards(search) {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return client.get(`/hub/monday/boards${query}`).then((res) => res.data.boards || []);
}

export function fetchGroups(boardId) {
  return client.get(`/hub/monday/boards/${boardId}/groups`).then((res) => res.data.groups || []);
}

export function fetchColumns(boardId) {
  return client.get(`/hub/monday/boards/${boardId}/columns`).then((res) => res.data.columns || []);
}

export function fetchPeople() {
  return client.get('/hub/monday/people').then((res) => res.data.people || []);
}
