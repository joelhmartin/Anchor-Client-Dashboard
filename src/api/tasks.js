import client from './client';

export function fetchTaskWorkspaces() {
  return client.get('/tasks/workspaces').then((res) => res.data.workspaces || []);
}

export function createTaskWorkspace(payload) {
  return client.post('/tasks/workspaces', payload).then((res) => res.data.workspace);
}

export function fetchTaskWorkspaceMembers(workspaceId) {
  return client.get(`/tasks/workspaces/${workspaceId}/members`).then((res) => res.data.members || []);
}

export function addTaskWorkspaceMember(workspaceId, payload) {
  return client.post(`/tasks/workspaces/${workspaceId}/members`, payload).then((res) => res.data.member);
}

export function updateTaskWorkspaceMember(workspaceId, memberUserId, payload) {
  return client.patch(`/tasks/workspaces/${workspaceId}/members/${memberUserId}`, payload).then((res) => res.data.member);
}

export function removeTaskWorkspaceMember(workspaceId, memberUserId) {
  return client.delete(`/tasks/workspaces/${workspaceId}/members/${memberUserId}`).then((res) => res.data);
}

export function searchTaskWorkspaceMembers(workspaceId, q) {
  return client.get(`/tasks/workspaces/${workspaceId}/members/search`, { params: { q } }).then((res) => res.data.members || []);
}

export function fetchTaskBoards(workspaceId) {
  return client.get(`/tasks/workspaces/${workspaceId}/boards`).then((res) => res.data.boards || []);
}

export function createTaskBoard(workspaceId, payload) {
  return client.post(`/tasks/workspaces/${workspaceId}/boards`, payload).then((res) => res.data.board);
}

export function fetchTaskBoardView(boardId) {
  return client.get(`/tasks/boards/${boardId}/view`).then((res) => res.data);
}

export function updateTaskBoard(boardId, payload) {
  return client.patch(`/tasks/boards/${boardId}`, payload).then((res) => res.data.board);
}

export function fetchTaskBoardsAll() {
  return client.get('/tasks/boards').then((res) => res.data.boards || []);
}

export function runTaskBoardsReport(payload) {
  return client.post('/tasks/reports/boards', payload).then((res) => res.data.rows || []);
}

export function runBillingReport(payload) {
  return client.post('/tasks/reports/billing', payload).then((res) => res.data.items || []);
}

export function createTaskGroup(boardId, payload) {
  return client.post(`/tasks/boards/${boardId}/groups`, payload).then((res) => res.data.group);
}

export function createTaskItem(groupId, payload) {
  return client.post(`/tasks/groups/${groupId}/items`, payload).then((res) => res.data.item);
}

export function updateTaskItem(itemId, payload) {
  return client.patch(`/tasks/items/${itemId}`, payload).then((res) => res.data.item);
}

export function fetchTaskItemUpdates(itemId) {
  return client.get(`/tasks/items/${itemId}/updates`).then((res) => res.data.updates || []);
}

export function createTaskItemUpdate(itemId, payload) {
  return client.post(`/tasks/items/${itemId}/updates`, payload).then((res) => res.data.update);
}

export function fetchTaskItemFiles(itemId) {
  return client.get(`/tasks/items/${itemId}/files`).then((res) => res.data.files || []);
}

export function uploadTaskItemFile(itemId, file) {
  const formData = new FormData();
  formData.append('file', file);
  return client
    .post(`/tasks/items/${itemId}/files`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((res) => res.data.file);
}

export function fetchTaskItemTimeEntries(itemId) {
  return client.get(`/tasks/items/${itemId}/time-entries`).then((res) => res.data.time_entries || []);
}

export function createTaskItemTimeEntry(itemId, payload) {
  return client.post(`/tasks/items/${itemId}/time-entries`, payload).then((res) => res.data.time_entry);
}

export function fetchTaskItemAssignees(itemId) {
  return client.get(`/tasks/items/${itemId}/assignees`).then((res) => res.data.assignees || []);
}

export function addTaskItemAssignee(itemId, payload) {
  return client.post(`/tasks/items/${itemId}/assignees`, payload).then((res) => res.data.assignee);
}

export function removeTaskItemAssignee(itemId, assigneeUserId) {
  return client.delete(`/tasks/items/${itemId}/assignees/${assigneeUserId}`).then((res) => res.data);
}

export function fetchTaskItemSubitems(itemId) {
  return client.get(`/tasks/items/${itemId}/subitems`).then((res) => res.data.subitems || []);
}

export function createTaskSubitem(itemId, payload) {
  return client.post(`/tasks/items/${itemId}/subitems`, payload).then((res) => res.data.subitem);
}

export function updateTaskSubitem(subitemId, payload) {
  return client.patch(`/tasks/subitems/${subitemId}`, payload).then((res) => res.data.subitem);
}

export function deleteTaskSubitem(subitemId) {
  return client.delete(`/tasks/subitems/${subitemId}`).then((res) => res.data);
}

export function fetchTaskBoardAutomations(boardId) {
  return client.get(`/tasks/boards/${boardId}/automations`).then((res) => res.data.automations || []);
}

export function createTaskBoardAutomation(boardId, payload) {
  return client.post(`/tasks/boards/${boardId}/automations`, payload).then((res) => res.data.automation);
}

export function setTaskAutomationActive(automationId, is_active) {
  return client.patch(`/tasks/automations/${automationId}`, { is_active }).then((res) => res.data.automation);
}

export function fetchTaskBoardReport(boardId) {
  return client.get(`/tasks/boards/${boardId}/report`).then((res) => res.data.report);
}

export function downloadTaskBoardCsv(boardId) {
  return client.get(`/tasks/boards/${boardId}/export.csv`, { responseType: 'blob' }).then((res) => res.data);
}

export function fetchTaskItemAiSummary(itemId) {
  return client.get(`/tasks/items/${itemId}/ai-summary`).then((res) => res.data);
}

export function refreshTaskItemAiSummary(itemId) {
  return client.post(`/tasks/items/${itemId}/ai-summary/refresh`).then((res) => res.data.summary);
}

export function fetchMyWork() {
  return client.get('/tasks/my-work').then((res) => res.data.boards || []);
}

// Update view tracking
export function markUpdatesViewed(updateIds) {
  return client.post('/tasks/updates/mark-viewed', { update_ids: updateIds }).then((res) => res.data);
}

export function fetchUpdateViews(updateIds) {
  return client.post('/tasks/updates/views', { update_ids: updateIds }).then((res) => res.data.views || {});
}

// AI Daily Overview
export function fetchAiDailyOverview(refresh = false) {
  return client.get('/tasks/ai/daily-overview', { params: refresh ? { refresh: '1' } : {} }).then((res) => res.data);
}

// Status Labels
export function fetchBoardStatusLabels(boardId) {
  return client.get(`/tasks/boards/${boardId}/status-labels`).then((res) => res.data.status_labels || []);
}

export function createBoardStatusLabel(boardId, payload) {
  return client.post(`/tasks/boards/${boardId}/status-labels`, payload).then((res) => res.data.status_label);
}

export function updateStatusLabel(labelId, payload) {
  return client.patch(`/tasks/status-labels/${labelId}`, payload).then((res) => res.data.status_label);
}

export function deleteStatusLabel(labelId) {
  return client.delete(`/tasks/status-labels/${labelId}`).then((res) => res.data);
}

export function initBoardStatusLabels(boardId) {
  return client.post(`/tasks/boards/${boardId}/status-labels/init`).then((res) => res.data.status_labels || []);
}

