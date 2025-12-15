export const paths = {
  taskHome: () => '/tasks',
  workspace: (workspaceId) => `/tasks/workspaces/${workspaceId}`,
  board: (boardId) => `/tasks/boards/${boardId}`,
  workspaceBoard: (workspaceId, boardId) => `/tasks/workspaces/${workspaceId}/boards/${boardId}`
};

export function withPane(url, pane) {
  if (!pane || pane === 'boards') return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}pane=${pane}`;
}


