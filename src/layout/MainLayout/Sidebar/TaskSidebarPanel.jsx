import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Button, CircularProgress, Divider, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';

import useAuth from 'hooks/useAuth';
import {
  addTaskWorkspaceMember,
  createTaskBoard,
  createTaskWorkspace,
  fetchTaskBoards,
  fetchTaskWorkspaceMembers,
  fetchTaskWorkspaces,
  removeTaskWorkspaceMember,
  updateTaskWorkspaceMember
} from 'api/tasks';
import { paths, withPane } from 'routes/paths';

function getEffectiveRole(user) {
  return user?.effective_role || user?.role;
}

export default function TaskSidebarPanel() {
  const { user } = useAuth();
  const effRole = useMemo(() => getEffectiveRole(user), [user]);
  const canCreateWorkspace = effRole === 'superadmin' || effRole === 'admin';

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const pane = searchParams.get('pane') || 'boards';
  const workspaceIdFromUrl = searchParams.get('workspace') || '';
  const boardIdFromUrl = searchParams.get('board') || '';

  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(workspaceIdFromUrl);

  const [boardsLoading, setBoardsLoading] = useState(false);
  const [boards, setBoards] = useState([]);

  const [membersLoading, setMembersLoading] = useState(false);
  const [members, setMembers] = useState([]);

  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  const [newBoardName, setNewBoardName] = useState('');
  const [creatingBoard, setCreatingBoard] = useState(false);

  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  useEffect(() => {
    // Keep internal selection in sync with URL
    if (workspaceIdFromUrl !== activeWorkspaceId) {
      setActiveWorkspaceId(workspaceIdFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceIdFromUrl]);

  const loadWorkspaces = async () => {
    setLoadingWorkspaces(true);
    try {
      const ws = await fetchTaskWorkspaces();
      setWorkspaces(ws);
      // default selection (boards pane only)
      if (pane === 'boards' && !workspaceIdFromUrl && ws.length) {
        const next = new URLSearchParams(searchParams);
        next.set('workspace', ws[0].id);
        setSearchParams(next, { replace: true });
      }
    } catch (_err) {
      setWorkspaces([]);
    } finally {
      setLoadingWorkspaces(false);
    }
  };

  useEffect(() => {
    loadWorkspaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the URL lost workspace/board (e.g., navigating between panes), reapply defaults when we have data.
  useEffect(() => {
    if (pane === 'boards' && !workspaceIdFromUrl && workspaces.length) {
      const nextWorkspaceId = workspaces[0].id;
      setActiveWorkspaceId(nextWorkspaceId);
      navigate(withPane(paths.workspace(nextWorkspaceId), pane), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane, workspaceIdFromUrl, workspaces]);

  useEffect(() => {
    if (pane === 'boards' && activeWorkspaceId && !boardIdFromUrl && boards.length) {
      const nextBoardId = boards[0].id;
      navigate(withPane(paths.board(nextBoardId), pane), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane, activeWorkspaceId, boardIdFromUrl, boards]);

  const loadWorkspaceData = async (workspaceId) => {
    if (!workspaceId) {
      setBoards([]);
      setMembers([]);
      return;
    }
    setBoardsLoading(true);
    setMembersLoading(true);
    try {
      const [b, m] = await Promise.all([fetchTaskBoards(workspaceId), fetchTaskWorkspaceMembers(workspaceId)]);
      setBoards(b);
      setMembers(m);
      // default board selection (if missing)
      if (pane === 'boards' && !boardIdFromUrl && b.length) {
        const next = new URLSearchParams(searchParams);
        next.set('workspace', workspaceId);
        next.set('board', b[0].id);
        next.delete('item');
        setSearchParams(next, { replace: true });
      }
    } catch (_err) {
      setBoards([]);
      setMembers([]);
    } finally {
      setBoardsLoading(false);
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspaceData(activeWorkspaceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  const handleSelectWorkspace = (workspaceId) => {
    if (workspaceId) {
      navigate(withPane(paths.workspace(workspaceId), pane), { replace: true });
    } else {
      navigate(withPane(paths.taskHome(), pane), { replace: true });
    }
  };

  const handleSelectBoard = (boardId) => {
    if (boardId) {
      navigate(withPane(paths.board(boardId), pane), { replace: true });
    } else if (activeWorkspaceId) {
      navigate(withPane(paths.workspace(activeWorkspaceId), pane), { replace: true });
    } else {
      navigate(withPane(paths.taskHome(), pane), { replace: true });
    }
  };

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    setCreatingWorkspace(true);
    try {
      const ws = await createTaskWorkspace({ name: newWorkspaceName.trim() });
      setWorkspaces((prev) => [ws, ...prev]);
      setNewWorkspaceName('');
      handleSelectWorkspace(ws.id);
    } catch (_err) {
      // ignore
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const handleCreateBoard = async () => {
    if (!activeWorkspaceId || !newBoardName.trim()) return;
    setCreatingBoard(true);
    try {
      const board = await createTaskBoard(activeWorkspaceId, { name: newBoardName.trim() });
      setBoards((prev) => [board, ...prev]);
      setNewBoardName('');
      handleSelectBoard(board.id);
    } catch (_err) {
      // ignore
    } finally {
      setCreatingBoard(false);
    }
  };

  const handleAddMember = async () => {
    if (!activeWorkspaceId || !newMemberEmail.trim()) return;
    setAddingMember(true);
    try {
      const member = await addTaskWorkspaceMember(activeWorkspaceId, { email: newMemberEmail.trim(), role: 'member' });
      setMembers((prev) => {
        const existing = prev.find((m) => m.user_id === member.user_id);
        if (existing) return prev.map((m) => (m.user_id === member.user_id ? member : m));
        return [...prev, member];
      });
      setNewMemberEmail('');
    } catch (_err) {
      // ignore
    } finally {
      setAddingMember(false);
    }
  };

  const handleChangeMemberRole = async (memberUserId, role) => {
    if (!activeWorkspaceId) return;
    try {
      const updated = await updateTaskWorkspaceMember(activeWorkspaceId, memberUserId, { role });
      setMembers((prev) => prev.map((m) => (m.user_id === memberUserId ? updated : m)));
    } catch (_err) {
      // ignore
    }
  };

  const handleRemoveMember = async (memberUserId) => {
    if (!activeWorkspaceId) return;
    try {
      await removeTaskWorkspaceMember(activeWorkspaceId, memberUserId);
      setMembers((prev) => prev.filter((m) => m.user_id !== memberUserId));
    } catch (_err) {
      // ignore
    }
  };

  return (
    <Box sx={{ mt: 1 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1">Workspace</Typography>
          {loadingWorkspaces && <CircularProgress size={16} />}
        </Stack>

        <Select size="small" value={activeWorkspaceId} displayEmpty onChange={(e) => handleSelectWorkspace(e.target.value)}>
          <MenuItem value="">
            <em>Select workspace…</em>
          </MenuItem>
          {workspaces.map((w) => (
            <MenuItem key={w.id} value={w.id}>
              {w.name}
            </MenuItem>
          ))}
        </Select>

        {canCreateWorkspace && (
          <Stack direction="row" spacing={1}>
            <TextField
              fullWidth
              size="small"
              label="New workspace"
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
            />
            <Button variant="contained" onClick={handleCreateWorkspace} disabled={creatingWorkspace || !newWorkspaceName.trim()}>
              Create
            </Button>
          </Stack>
        )}

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.25 }}>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
              <Typography variant="subtitle1">Members</Typography>
              {membersLoading && <CircularProgress size={16} />}
            </Stack>

            <Stack direction="row" spacing={1}>
              <TextField
                fullWidth
                size="small"
                label="Add member by email"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
                disabled={!activeWorkspaceId}
              />
              <Button variant="contained" onClick={handleAddMember} disabled={addingMember || !activeWorkspaceId || !newMemberEmail.trim()}>
                Add
              </Button>
            </Stack>

            <Stack spacing={0.75}>
              {!members.length && (
                <Typography variant="body2" color="text.secondary">
                  No members yet.
                </Typography>
              )}
              {members.map((m) => {
                const name = `${m.first_name || ''} ${m.last_name || ''}`.trim();
                const display = name || m.email || 'User';
                const isImplicitStaff = ['superadmin', 'admin', 'team'].includes(m.user_role);
                return (
                  <Box
                    key={m.user_id}
                    sx={{
                      p: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1
                    }}
                  >
                    <Stack sx={{ minWidth: 0 }}>
                      <Typography variant="body2" noWrap>
                        {display}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {m.email || ''} {m.user_role ? `• ${m.user_role}` : ''} {isImplicitStaff ? '• auto' : ''}
                      </Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Select
                        size="small"
                        value={m.membership_role || 'member'}
                        onChange={(e) => handleChangeMemberRole(m.user_id, e.target.value)}
                        disabled={isImplicitStaff}
                      >
                        <MenuItem value="admin">Admin</MenuItem>
                        <MenuItem value="member">Member</MenuItem>
                      </Select>
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        onClick={() => handleRemoveMember(m.user_id)}
                        disabled={isImplicitStaff}
                      >
                        Remove
                      </Button>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </Stack>
        </Box>

        <Divider />

        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1">Boards</Typography>
          {boardsLoading && <CircularProgress size={16} />}
        </Stack>

        <Stack direction="row" spacing={1}>
          <TextField
            fullWidth
            size="small"
            label="New board"
            value={newBoardName}
            onChange={(e) => setNewBoardName(e.target.value)}
            disabled={!activeWorkspaceId}
          />
          <Button variant="contained" onClick={handleCreateBoard} disabled={creatingBoard || !newBoardName.trim() || !activeWorkspaceId}>
            Create
          </Button>
        </Stack>

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Stack spacing={0} sx={{ py: 0.5 }}>
            {boards.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 1 }}>
                No boards yet.
              </Typography>
            )}
            {boards.map((b) => (
              <Button
                key={b.id}
                onClick={() => handleSelectBoard(b.id)}
                sx={{
                  justifyContent: 'flex-start',
                  textTransform: 'none',
                  px: 1.5,
                  py: 1,
                  borderRadius: 0,
                  ...(b.id === boardIdFromUrl && { bgcolor: 'action.selected' })
                }}
              >
                {b.name}
              </Button>
            ))}
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}
