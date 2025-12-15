import { useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Popper,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { IconChevronDown, IconChevronRight, IconMessageCircle, IconClock } from '@tabler/icons-react';

function statusColor(status) {
  switch (status) {
    case 'done':
      return { bg: 'success.main', fg: 'common.white' };
    case 'working':
      return { bg: 'info.main', fg: 'common.white' };
    case 'blocked':
      return { bg: 'error.main', fg: 'common.white' };
    case 'needs_attention':
      return { bg: 'warning.main', fg: 'common.white' };
    case 'todo':
    default:
      return { bg: 'grey.400', fg: 'common.white' };
  }
}

function fmtMinutes(mins) {
  const n = Number(mins || 0);
  if (!n) return '0m';
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export default function BoardTable({
  groups = [],
  itemsByGroup = {},
  assigneesByItem = {},
  workspaceMembers = [],
  updateCountsByItem = {},
  timeTotalsByItem = {},
  highlightedItemId,
  onClickItem,
  onUpdateItem
  ,
  onToggleAssignee
}) {
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [editingItemId, setEditingItemId] = useState('');
  const [draftName, setDraftName] = useState('');
  const clickTimerRef = useRef(null);

  // People picker state
  const [peopleAnchor, setPeopleAnchor] = useState(null);
  const [peopleItemId, setPeopleItemId] = useState('');
  const [peopleQuery, setPeopleQuery] = useState('');

  const peopleOpen = Boolean(peopleAnchor && peopleItemId);
  const currentAssignees = assigneesByItem[peopleItemId] || [];
  const currentAssigneeIds = new Set(currentAssignees.map((a) => a.user_id));
  const filteredMembers = useMemo(() => {
    const q = peopleQuery.trim().toLowerCase();
    const list = Array.isArray(workspaceMembers) ? workspaceMembers : [];
    if (!q) return list;
    return list.filter((m) => {
      const email = String(m.email || '').toLowerCase();
      const name = `${m.first_name || ''} ${m.last_name || ''}`.trim().toLowerCase();
      return email.includes(q) || name.includes(q);
    });
  }, [workspaceMembers, peopleQuery]);

  const groupCounts = useMemo(() => {
    const map = {};
    for (const g of groups) {
      map[g.id] = (itemsByGroup[g.id] || []).length;
    }
    return map;
  }, [groups, itemsByGroup]);

  const startEditName = (item) => {
    setEditingItemId(item.id);
    setDraftName(item.name || '');
  };

  const commitEditName = async (itemId) => {
    const next = draftName.trim();
    setEditingItemId('');
    if (!next) return;
    await onUpdateItem?.(itemId, { name: next });
  };

  const handleNameClick = (item) => {
    if (editingItemId === item.id) return;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      onClickItem?.(item, 'updates');
    }, 180);
  };

  const handleNameDoubleClick = (item) => {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    startEditName(item);
  };

  const openPeoplePicker = (e, itemId) => {
    e.stopPropagation();
    setPeopleAnchor(e.currentTarget);
    setPeopleItemId(itemId);
    setPeopleQuery('');
  };

  const closePeoplePicker = () => {
    setPeopleAnchor(null);
    setPeopleItemId('');
    setPeopleQuery('');
  };

  const columns = [
    { key: 'name', label: 'Item Name', width: 320, sticky: true },
    { key: 'status', label: 'Status', width: 160 },
    { key: 'people', label: 'People', width: 180 },
    { key: 'due', label: 'Due Date', width: 160 },
    { key: 'updates', label: 'Updates', width: 90 },
    { key: 'time', label: 'Time', width: 110 }
  ];

  const gridTemplateColumns = columns.map((c) => `${c.width}px`).join(' ');

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
      {/* Sticky header row */}
      <Box sx={{ position: 'sticky', top: 0, zIndex: 4, bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns, alignItems: 'center' }}>
          {columns.map((c) => (
            <Box
              key={c.key}
              sx={{
                p: 1,
                fontWeight: 700,
                fontSize: '0.85rem',
                borderRight: '1px solid',
                borderColor: 'divider',
                ...(c.sticky && {
                  position: 'sticky',
                  left: 0,
                  zIndex: 5,
                  bgcolor: 'background.default'
                })
              }}
            >
              {c.label}
            </Box>
          ))}
        </Box>
      </Box>

      {/* Groups (each group is its own element: header + table beneath it) */}
      <Box sx={{ maxHeight: 'calc(100vh - 280px)', overflow: 'auto', p: 1.25 }}>
        {groups.map((g) => {
          const collapsed = Boolean(collapsedGroups[g.id]);
          const items = itemsByGroup[g.id] || [];
          return (
            <Box
              key={g.id}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                overflow: 'hidden',
                bgcolor: 'background.paper',
                mb: 1.25
              }}
            >
              {/* group header */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 1,
                  bgcolor: 'grey.100',
                  borderBottom: '1px solid',
                  borderColor: 'divider'
                }}
              >
                <IconButton size="small" onClick={() => setCollapsedGroups((p) => ({ ...p, [g.id]: !p[g.id] }))}>
                  {collapsed ? <IconChevronRight size={18} /> : <IconChevronDown size={18} />}
                </IconButton>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  {g.name}
                </Typography>
                <Chip size="small" label={groupCounts[g.id] || 0} />
              </Box>

              {!collapsed &&
                items.map((it) => {
                  const status = it.status || 'todo';
                  const sc = statusColor(status);
                  const assignees = assigneesByItem[it.id] || [];
                  const updateCount = updateCountsByItem[it.id] || 0;
                  const timeTotal = timeTotalsByItem[it.id] || 0;
                  const isHighlighted = highlightedItemId === it.id;
                  const isEditing = editingItemId === it.id;
                  return (
                    <Box
                      key={it.id}
                      onClick={() => onClickItem?.(it)}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns,
                        alignItems: 'center',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        cursor: 'pointer',
                        ...(isHighlighted && { bgcolor: 'action.selected' }),
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                    >
                      {/* name */}
                      <Box
                        sx={{
                          p: 1,
                          borderRight: '1px solid',
                          borderColor: 'divider',
                          position: 'sticky',
                          left: 0,
                          zIndex: 3,
                          bgcolor: 'background.default'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isEditing ? (
                          <TextField
                            size="small"
                            fullWidth
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            onBlur={() => commitEditName(it.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEditName(it.id);
                              if (e.key === 'Escape') {
                                setEditingItemId('');
                                setDraftName('');
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600 }}
                            onClick={() => handleNameClick(it)}
                            onDoubleClick={() => handleNameDoubleClick(it)}
                          >
                            {it.name}
                          </Typography>
                        )}
                      </Box>

                      {/* status */}
                      <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }} onClick={(e) => e.stopPropagation()}>
                        <Select
                          size="small"
                          value={status}
                          onChange={(e) => onUpdateItem?.(it.id, { status: e.target.value })}
                          sx={{
                            width: '100%',
                            '& .MuiSelect-select': { py: 0.5 },
                            bgcolor: sc.bg,
                            color: sc.fg,
                            borderRadius: 999,
                            '.MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' }
                          }}
                        >
                          <MenuItem value="todo">Todo</MenuItem>
                          <MenuItem value="working">Working</MenuItem>
                          <MenuItem value="blocked">Blocked</MenuItem>
                          <MenuItem value="done">Done</MenuItem>
                          <MenuItem value="needs_attention">Needs Attention</MenuItem>
                        </Select>
                      </Box>

                      {/* people */}
                      <Box
                        sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }}
                        onClick={(e) => openPeoplePicker(e, it.id)}
                      >
                        <Stack direction="row" spacing={-0.5} alignItems="center">
                          {assignees.slice(0, 3).map((a) => {
                            const label =
                              [a.first_name, a.last_name].filter(Boolean).join(' ').trim() || a.email || a.user_id?.slice?.(0, 6) || 'U';
                            return (
                              <Avatar key={a.user_id} src={a.avatar_url || ''} sx={{ width: 26, height: 26, fontSize: 12 }}>
                                {label.slice(0, 1).toUpperCase()}
                              </Avatar>
                            );
                          })}
                          {assignees.length > 3 && (
                            <Avatar sx={{ width: 26, height: 26, fontSize: 12 }}>{`+${assignees.length - 3}`}</Avatar>
                          )}
                          {!assignees.length && (
                            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                              —
                            </Typography>
                          )}
                        </Stack>
                      </Box>

                      {/* due */}
                      <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }} onClick={(e) => e.stopPropagation()}>
                        <TextField
                          size="small"
                          type="date"
                          value={it.due_date || ''}
                          onChange={(e) => onUpdateItem?.(it.id, { due_date: e.target.value || null })}
                          InputLabelProps={{ shrink: true }}
                          sx={{ width: '100%' }}
                        />
                      </Box>

                      {/* updates */}
                      <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }} onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="small"
                          variant="text"
                          startIcon={<IconMessageCircle size={16} />}
                          onClick={() => onClickItem?.(it, 'updates')}
                        >
                          {updateCount}
                        </Button>
                      </Box>

                      {/* time */}
                      <Box sx={{ p: 1 }} onClick={(e) => e.stopPropagation()}>
                        <Button size="small" variant="text" startIcon={<IconClock size={16} />} onClick={() => onClickItem?.(it, 'time')}>
                          {fmtMinutes(timeTotal)}
                        </Button>
                      </Box>
                    </Box>
                  );
                })}
            </Box>
          );
        })}
      </Box>

      <Popper open={peopleOpen} anchorEl={peopleAnchor} placement="bottom-start" sx={{ zIndex: 2000 }}>
        <Paper sx={{ p: 1, width: 320 }}>
          <Stack spacing={1}>
            <Typography variant="subtitle2">People</Typography>
            <TextField
              size="small"
              placeholder="Search people"
              value={peopleQuery}
              onChange={(e) => setPeopleQuery(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start">@</InputAdornment>
              }}
            />
            <Divider />
            <Box sx={{ maxHeight: 260, overflow: 'auto' }}>
              <Stack spacing={0.5}>
                {filteredMembers.slice(0, 25).map((m) => {
                  const name = `${m.first_name || ''} ${m.last_name || ''}`.trim();
                  const label = name ? `${name}` : m.email;
                  const selected = currentAssigneeIds.has(m.user_id);
                  return (
                    <Button
                      key={m.user_id}
                      size="small"
                      variant={selected ? 'contained' : 'outlined'}
                      onClick={() => onToggleAssignee?.(peopleItemId, m.user_id, selected)}
                      sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Avatar src={m.avatar_url || ''} sx={{ width: 22, height: 22, fontSize: 11 }}>
                          {(label || 'U').slice(0, 1).toUpperCase()}
                        </Avatar>
                        <Stack sx={{ minWidth: 0 }}>
                          <Typography variant="body2" noWrap>
                            {label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {m.email || ''}
                          </Typography>
                        </Stack>
                      </Stack>
                    </Button>
                  );
                })}
                {!filteredMembers.length && (
                  <Typography variant="body2" color="text.secondary">
                    No matches.
                  </Typography>
                )}
              </Stack>
            </Box>
            <Button size="small" variant="text" onClick={closePeoplePicker}>
              Close
            </Button>
          </Stack>
        </Paper>
      </Popper>
    </Box>
  );
}


