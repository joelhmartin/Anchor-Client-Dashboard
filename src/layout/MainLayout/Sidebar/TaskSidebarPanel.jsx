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

import useAuth from 'hooks/useAuth';
import { createTaskBoard, fetchTaskBoards, fetchTaskWorkspaces } from 'api/tasks';

function getEffectiveRole(user) {
  return user?.effective_role || user?.role;
}

export default function TaskSidebarPanel() {
  const { user } = useAuth();
  const effRole = useMemo(() => getEffectiveRole(user), [user]);
  const canCreateBoard = effRole === 'superadmin' || effRole === 'admin';

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
          {loadingWorkspaces && <CircularProgress size={16} />}
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
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ py: 0, '& .MuiAccordionSummary-content': { my: 0 } }}>
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
                        minHeight: 0,
                        height: 'auto',
                        lineHeight: 1.2,
                        whiteSpace: 'nowrap',
                        '&.MuiButton-root': { minHeight: 0, paddingTop: 0, paddingBottom: 0 }
                      }}
                    >
                      {w.name}
                    </Button>
                    {canCreateBoard && (
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          openCreateBoard(w.id);
                        }}
                      >
                        <AddIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  {boards.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No boards yet.
                    </Typography>
                  ) : (
                    <Stack spacing={0.5}>
                      {boards.map((b) => (
                        <Button
                          key={b.id}
                          onClick={() => selectBoard(w.id, b.id)}
                          variant={b.id === boardIdFromUrl ? 'contained' : 'text'}
                          color={b.id === boardIdFromUrl ? 'primary' : 'inherit'}
                          sx={{ justifyContent: 'flex-start', textTransform: 'none', whiteSpace: 'nowrap' }}
                        >
                          {b.name}
                        </Button>
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
    </Box>
  );
}
