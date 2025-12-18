import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import useAuth from 'hooks/useAuth';
import {
  createTaskBoard,
  createTaskWorkspace,
  deleteTaskBoard,
  deleteTaskWorkspace,
  fetchTaskBoards,
  fetchTaskWorkspaces
} from 'api/tasks';

function getEffectiveRole(user) {
  return user?.effective_role || user?.role;
}

export default function TaskPanel() {
  const { user } = useAuth();
  const effRole = useMemo(() => getEffectiveRole(user), [user]);
  const canCreateBoard = effRole === 'superadmin' || effRole === 'admin';
  const canDelete = canCreateBoard;

  const [searchParams, setSearchParams] = useSearchParams();
  const workspaceIdFromUrl = searchParams.get('workspace') || '';
  const boardIdFromUrl = searchParams.get('board') || '';

  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [workspaces, setWorkspaces] = useState([]);
  const [boardsByWorkspace, setBoardsByWorkspace] = useState({});
  const [expanded, setExpanded] = useState(workspaceIdFromUrl || '');

  const [creatingBoardFor, setCreatingBoardFor] = useState('');
  const [newBoardName, setNewBoardName] = useState('');
  const [creatingBoard, setCreatingBoard] = useState(false);

  const [creatingWorkspaceOpen, setCreatingWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  const [deleteWorkspaceId, setDeleteWorkspaceId] = useState('');
  const [deleteBoardInfo, setDeleteBoardInfo] = useState({ workspaceId: '', boardId: '' });
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setExpanded(workspaceIdFromUrl || '');
  }, [workspaceIdFromUrl]);

  useEffect(() => {
    const load = async () => {
      setLoadingWorkspaces(true);
      try {
        const ws = await fetchTaskWorkspaces();
        setWorkspaces(ws);
        if (!workspaceIdFromUrl && ws.length) {
          const next = new URLSearchParams(searchParams);
          next.set('workspace', ws[0].id);
          setSearchParams(next, { replace: true });
        }
        // Preload boards for all workspaces
        const allBoards = await Promise.all(ws.map((w) => fetchTaskBoards(w.id).then((b) => [w.id, b])));
        setBoardsByWorkspace(Object.fromEntries(allBoards));
      } catch (_err) {
        setWorkspaces([]);
        setBoardsByWorkspace({});
      } finally {
        setLoadingWorkspaces(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectWorkspace = (workspaceId) => {
    const next = new URLSearchParams(searchParams);
    if (workspaceId) next.set('workspace', workspaceId);
    else next.delete('workspace');
    next.delete('board');
    next.delete('item');
    next.set('pane', 'boards');
    setSearchParams(next, { replace: true });
  };

  const selectBoard = (workspaceId, boardId) => {
    const next = new URLSearchParams(searchParams);
    if (workspaceId) next.set('workspace', workspaceId);
    if (boardId) next.set('board', boardId);
    next.delete('item');
    next.set('pane', 'boards');
    setSearchParams(next, { replace: true });
  };

  const openCreateBoard = (workspaceId) => {
    setCreatingBoardFor(workspaceId);
    setNewBoardName('');
  };

  const openCreateWorkspace = () => {
    setCreatingWorkspaceOpen(true);
    setNewWorkspaceName('');
  };

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    setCreatingWorkspace(true);
    try {
      const workspace = await createTaskWorkspace({ name: newWorkspaceName.trim() });
      setWorkspaces((prev) => [workspace, ...(prev || [])]);
      setBoardsByWorkspace((prev) => ({ ...prev, [workspace.id]: [] }));
      setCreatingWorkspaceOpen(false);
      // Auto-select the new workspace (mirrors "add board" UX)
      selectWorkspace(workspace.id);
    } catch (_err) {
      // ignore
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const handleCreateBoard = async () => {
    if (!creatingBoardFor || !newBoardName.trim()) return;
    setCreatingBoard(true);
    try {
      const board = await createTaskBoard(creatingBoardFor, { name: newBoardName.trim() });
      setBoardsByWorkspace((prev) => ({
        ...prev,
        [creatingBoardFor]: [board, ...(prev[creatingBoardFor] || [])]
      }));
      setNewBoardName('');
      setCreatingBoardFor('');
      selectBoard(board.workspace_id, board.id);
    } catch (_err) {
      // ignore
    } finally {
      setCreatingBoard(false);
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!deleteWorkspaceId) return;
    setDeleting(true);
    try {
      await deleteTaskWorkspace(deleteWorkspaceId);
      setBoardsByWorkspace((prev) => {
        const next = { ...(prev || {}) };
        delete next[deleteWorkspaceId];
        return next;
      });
      setWorkspaces((prev) => (prev || []).filter((w) => w.id !== deleteWorkspaceId));

      if (workspaceIdFromUrl === deleteWorkspaceId) {
        const remaining = (workspaces || []).filter((w) => w.id !== deleteWorkspaceId);
        const nextWs = remaining[0]?.id || '';
        const next = new URLSearchParams(searchParams);
        if (nextWs) next.set('workspace', nextWs);
        else next.delete('workspace');
        next.delete('board');
        next.delete('item');
        next.set('pane', 'boards');
        setSearchParams(next, { replace: true });
      }
      setDeleteWorkspaceId('');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteBoard = async () => {
    if (!deleteBoardInfo?.boardId) return;
    setDeleting(true);
    try {
      await deleteTaskBoard(deleteBoardInfo.boardId);
      setBoardsByWorkspace((prev) => ({
        ...(prev || {}),
        [deleteBoardInfo.workspaceId]: (prev?.[deleteBoardInfo.workspaceId] || []).filter((b) => b.id !== deleteBoardInfo.boardId)
      }));

      if (boardIdFromUrl === deleteBoardInfo.boardId) {
        const next = new URLSearchParams(searchParams);
        next.delete('board');
        next.delete('item');
        next.set('pane', 'boards');
        setSearchParams(next, { replace: true });
      }
      setDeleteBoardInfo({ workspaceId: '', boardId: '' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box
      sx={{
        mt: 1,
        // Ensure all buttons in the panel keep labels on one line
        '& .MuiButton-root': { whiteSpace: 'nowrap' }
      }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1">Workspaces</Typography>
          <Stack direction="row" spacing={0.5} alignItems="center">
            {canCreateBoard && (
              <IconButton size="small" onClick={openCreateWorkspace} aria-label="create workspace">
                <AddIcon fontSize="small" />
              </IconButton>
            )}
            {loadingWorkspaces && <CircularProgress size={16} />}
          </Stack>
        </Stack>

        {workspaces.length === 0 && !loadingWorkspaces && (
          <Typography variant="body2" color="text.secondary">
            No workspaces found.
          </Typography>
        )}

        <Stack spacing={0.75}>
          {workspaces.map((w) => {
            const boards = boardsByWorkspace[w.id] || [];
            const isExpanded = expanded === w.id;
            return (
              <Accordion
                key={w.id}
                expanded={isExpanded}
                onChange={(_e, exp) => {
                  setExpanded(exp ? w.id : '');
                  if (exp) selectWorkspace(w.id);
                }}
                sx={{
                  '&.Mui-expanded': {
                    margin: 0
                  }
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    px: 0,
                    py: 0,
                    mb: 0,
                    mt: 1,
                    minHeight: 'auto',
                    '&.MuiButtonBase-root': { px: 0, py: 0, minHeight: 'auto' },
                    '& .MuiAccordionSummary-content': { my: 0 },
                    '& .MuiAccordionSummary-contentGutters': { margin: 0 },
                    '& .MuiAccordionSummary-expandIconWrapper': { mr: 0 },
                    '&.Mui-expanded': {
                      minHeight: 'auto',
                      my: 0
                    }
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ width: '100%' }}>
                    <Button
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectWorkspace(w.id);
                      }}
                      sx={{
                        textTransform: 'none',
                        justifyContent: 'flex-start',
                        py: 0,
                        pb: 0,
                        pt: 0,
                        minHeight: 0,
                        height: 'auto',
                        lineHeight: 1.2,
                        whiteSpace: 'nowrap',
                        '&.MuiButton-root': { minHeight: 0, paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 }
                      }}
                    >
                      {w.name}
                    </Button>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {canCreateBoard && (
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCreateBoard(w.id);
                          }}
                          aria-label="create board"
                        >
                          <AddIcon fontSize="small" />
                        </IconButton>
                      )}
                      {canDelete && (
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteWorkspaceId(w.id);
                          }}
                          aria-label="delete workspace"
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Stack>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 0, py: 0, my: 0, '&.Mui-expanded': { py: 0, my: 0 } }}>
                  {boards.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No boards yet.
                    </Typography>
                  ) : (
                    <Stack spacing={0.5}>
                      {boards.map((b) => (
                        <Stack key={b.id} direction="row" spacing={0.5} alignItems="center" justifyContent="space-between">
                          <Button
                            onClick={() => selectBoard(w.id, b.id)}
                            variant={b.id === boardIdFromUrl ? 'contained' : 'text'}
                            color={b.id === boardIdFromUrl ? 'primary' : 'inherit'}
                            sx={{ justifyContent: 'flex-start', textTransform: 'none', whiteSpace: 'nowrap', px: 2, flex: 1 }}
                          >
                            {b.name}
                          </Button>
                          {canDelete && (
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteBoardInfo({ workspaceId: w.id, boardId: b.id });
                              }}
                              aria-label="delete board"
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Stack>
      </Stack>

      <Dialog open={Boolean(creatingBoardFor)} onClose={() => setCreatingBoardFor('')}>
        <DialogTitle>Create board</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Board name"
            fullWidth
            value={newBoardName}
            onChange={(e) => setNewBoardName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreatingBoardFor('')}>Cancel</Button>
          <Button onClick={handleCreateBoard} disabled={creatingBoard || !newBoardName.trim()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={creatingWorkspaceOpen} onClose={() => setCreatingWorkspaceOpen(false)}>
        <DialogTitle>Create workspace</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Workspace name"
            fullWidth
            value={newWorkspaceName}
            onChange={(e) => setNewWorkspaceName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreatingWorkspaceOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateWorkspace} disabled={creatingWorkspace || !newWorkspaceName.trim()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteWorkspaceId)} onClose={() => setDeleteWorkspaceId('')}>
        <DialogTitle>Delete workspace?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will permanently delete the workspace and all boards/groups/items inside it.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteWorkspaceId('')}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteWorkspace} disabled={deleting}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteBoardInfo?.boardId)} onClose={() => setDeleteBoardInfo({ workspaceId: '', boardId: '' })}>
        <DialogTitle>Delete board?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will permanently delete the board and all groups/items inside it.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteBoardInfo({ workspaceId: '', boardId: '' })}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteBoard} disabled={deleting}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
