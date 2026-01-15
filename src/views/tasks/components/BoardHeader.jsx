import {
useEffect,
  useMemo,
  useRef,
  useState,
  from,
  react,
  import,
  Box,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Popper,
  Select,
  Stack,
  TextField,
  Typography,,
  Button,
} from '@mui/material';
import { IconAdjustments, IconRobot, IconSearch, IconSortAscending, IconInfoCircle, IconDotsVertical } from '@tabler/icons-react';

export default function BoardHeader({
  board,
  view = 'main',
  onChangeView,
  search,
  onChangeSearch,
  onOpenAutomations,
  onOpenBoardMenu,
  onUpdateBoard
}) {
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [draftName, setDraftName] = useState(board?.name || '');
  const [draftDesc, setDraftDesc] = useState(board?.description || '');

  useEffect(() => {
    setDraftName(board?.name || '');
    setDraftDesc(board?.description || '');
  }, [board?.id, board?.name, board?.description]);

  const canEdit = Boolean(board?.id);

  const commitName = async () => {
    if (!canEdit) return;
    const next = draftName.trim();
    if (!next) return;
    setEditingName(false);
    if (next !== (board?.name || '')) {
      await onUpdateBoard?.({ name: next });
    }
  };

  const commitDesc = async () => {
    if (!canEdit) return;
    const next = (draftDesc || '').trim();
    setEditingDesc(false);
    if (next !== (board?.description || '')) {
      await onUpdateBoard?.({ description: next });
    }
  };

  return (
    <Box
      sx={{
        p: 1.25,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        position: 'sticky',
        top: 0,
        zIndex: 5,
        bgcolor: 'background.default'
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
        {/* Left */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
          {editingName ? (
            <TextField
              size="small"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') {
                  setDraftName(board?.name || '');
                  setEditingName(false);
                }
              }}
              autoFocus
            />
          ) : (
            <Typography
              variant="h6"
              sx={{ cursor: canEdit ? 'pointer' : 'default', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              onClick={() => canEdit && setEditingName(true)}
            >
              {board?.name || 'Board'}
            </Typography>
          )}

          {editingDesc ? (
            <TextField
              size="small"
              placeholder="Board description"
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              onBlur={commitDesc}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitDesc();
                if (e.key === 'Escape') {
                  setDraftDesc(board?.description || '');
                  setEditingDesc(false);
                }
              }}
              autoFocus
            />
          ) : (
            <IconButton size="small" onClick={() => canEdit && setEditingDesc(true)} title={board?.description || 'Add description'}>
              <IconInfoCircle size={18} />
            </IconButton>
          )}

          <Select size="small" value={view} onChange={(e) => onChangeView?.(e.target.value)}>
            <MenuItem value="main">Main Table</MenuItem>
            <MenuItem value="kanban" disabled>
              Kanban (soon)
            </MenuItem>
            <MenuItem value="timeline" disabled>
              Timeline (soon)
            </MenuItem>
          </Select>
        </Stack>

        {/* Right */}
        <Stack direction="row" spacing={1} alignItems="center">
          <Button size="small" variant="outlined" startIcon={<IconAdjustments size={16} />} disabled>
            Filter
          </Button>
          <Button size="small" variant="outlined" startIcon={<IconSortAscending size={16} />} disabled>
            Sort
          </Button>
          <TextField
            size="small"
            placeholder="Search board"
            value={search}
            onChange={(e) => onChangeSearch?.(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <IconSearch size={16} />
                </InputAdornment>
              )
            }}
          />
          <Button size="small" variant="contained" startIcon={<IconRobot size={16} />} onClick={onOpenAutomations}>
            Automations
          </Button>
          <IconButton size="small" onClick={onOpenBoardMenu}>
            <IconDotsVertical size={18} />
          </IconButton>
        </Stack>
      </Stack>
    </Box>
  );
}


