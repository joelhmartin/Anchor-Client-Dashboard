import {
useMemo,
  useRef,
  useState,
  from,
  react,
  import,
  Avatar,
  Box,
  Chip,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Popper,
  Select,
  Stack,
  Slider,
  TextField,
  Typography,,
  Button,
} from '@mui/material';
import { IconChevronDown, IconChevronRight, IconMessageCircle, IconClock, IconTrash } from '@tabler/icons-react';

// Default status labels
const DEFAULT_STATUS_LABELS = [
  { id: 'default-todo', label: 'To Do', color: '#808080', order_index: 0, is_done_state: false },
  { id: 'default-working', label: 'Working on it', color: '#fdab3d', order_index: 1, is_done_state: false },
  { id: 'default-stuck', label: 'Stuck', color: '#e2445c', order_index: 2, is_done_state: false },
  { id: 'default-done', label: 'Done', color: '#00c875', order_index: 3, is_done_state: true },
  { id: 'default-needs-attention', label: 'Needs Attention', color: '#ff642e', order_index: 4, is_done_state: false }
];

function getStatusColor(status, statusLabels = []) {
  const labels = statusLabels.length ? statusLabels : DEFAULT_STATUS_LABELS;
  const match = labels.find((l) => l.label === status);
  if (match) {
    return { bg: match.color, fg: '#ffffff' };
  }
  // Fallback for legacy status values
  const legacyMap = {
    done: '#00c875',
    working: '#fdab3d',
    blocked: '#e2445c',
    stuck: '#e2445c',
    needs_attention: '#ff642e',
    todo: '#808080'
  };
  return { bg: legacyMap[status] || '#808080', fg: '#ffffff' };
}

function fmtMinutes(mins) {
  const n = Number(mins || 0);
  if (!n) return '0m';
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export default function BoardTable({
  boardId,
  groups = [],
  itemsByGroup = {},
  assigneesByItem = {},
  workspaceMembers = [],
  updateCountsByItem = {},
  timeTotalsByItem = {},
  statusLabels = [],
  canManageLabels = false,
  onCreateStatusLabel,
  highlightedItemId,
  onClickItem,
  onUpdateItem,
  onToggleAssignee,
  onArchiveItem,
  onDeleteGroup,
  newItemNameByGroup = {},
  creatingItemByGroup = {},
  onChangeNewItemName,
  onCreateItem
}) {
  // Use provided labels or defaults
  const labels = statusLabels.length ? statusLabels : DEFAULT_STATUS_LABELS;
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [editingItemId, setEditingItemId] = useState('');
  const [draftName, setDraftName] = useState('');
  const clickTimerRef = useRef(null);

  // Status label creator dialog state
  const [addLabelOpen, setAddLabelOpen] = useState(false);
  const [addLabelForItemId, setAddLabelForItemId] = useState('');
  const [labelText, setLabelText] = useState('');
  const [labelHex, setLabelHex] = useState('#808080');
  const [labelOpacity, setLabelOpacity] = useState(100);
  const [makeGlobal, setMakeGlobal] = useState(false);
  const [creatingLabel, setCreatingLabel] = useState(false);

  // Archive item confirm dialog state
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiveTargetItem, setArchiveTargetItem] = useState(null);

  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState(null);

  const uniqueLabelColors = useMemo(() => {
    const seen = new Set();
    const colors = [];
    for (const l of labels) {
      const c = String(l.color || '').trim();
      if (!c) continue;
      const key = c.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      colors.push(c);
    }
    return colors;
  }, [labels]);

  const normalizeHex = (value) => {
    const v = String(value || '').trim();
    if (!v) return '#808080';
    if (v.startsWith('#')) return v;
    return `#${v}`;
  };

  const hexToRgbaHex = (hex, opacityPct) => {
    const base = normalizeHex(hex).replace(/[^#0-9A-Fa-f]/g, '');
    // base should be #RRGGBB
    const clean = base.length === 7 ? base : '#808080';
    const a = Math.max(0, Math.min(100, Number(opacityPct)));
    const aa = Math.round((a / 100) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
    // Use #RRGGBBAA for opacity support
    return `${clean}${aa}`;
  };

  const openAddLabel = (itemId) => {
    setAddLabelForItemId(itemId || '');
    setLabelText('');
    setLabelHex('#808080');
    setLabelOpacity(100);
    setMakeGlobal(false);
    setAddLabelOpen(true);
  };

  const closeAddLabel = () => {
    setAddLabelOpen(false);
    setAddLabelForItemId('');
    setLabelText('');
    setMakeGlobal(false);
  };

  const handleCreateLabel = async () => {
    if (!boardId || !canManageLabels || !onCreateStatusLabel) return;
    const name = labelText.trim();
    if (!name) return;
    setCreatingLabel(true);
    try {
      const color = hexToRgbaHex(labelHex, labelOpacity);
      const created = await onCreateStatusLabel({ label: name, color, makeGlobal });
      if (created && addLabelForItemId) {
        // Optionally set the item's status to the newly created label immediately.
        await onUpdateItem?.(addLabelForItemId, { status: created.label || name });
      }
      closeAddLabel();
    } finally {
      setCreatingLabel(false);
    }
  };

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
      const userRole = String(m.user_role || '').toLowerCase();
      const membershipRole = String(m.membership_role || '').toLowerCase();
      return email.includes(q) || name.includes(q) || userRole.includes(q) || membershipRole.includes(q);
    });
  }, [workspaceMembers, peopleQuery]);

  const availableMembers = useMemo(() => {
    return (filteredMembers || []).filter((m) => !currentAssigneeIds.has(m.user_id));
  }, [filteredMembers, currentAssigneeIds]);

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
    // Monday-style: the first column typically has no header label (item name).
    { key: 'name', label: '', width: 320, sticky: true },
    { key: 'status', label: 'Status', width: 160 },
    { key: 'people', label: 'People', width: 180 },
    { key: 'due', label: 'Date', width: 160 },
    // Updates count icon/button column does not need a header label.
    { key: 'updates', label: '', width: 90 },
    { key: 'time', label: 'Time', width: 110 }
  ];

  const gridTemplateColumns = columns.map((c) => `${c.width}px`).join(' ');

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
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
              {/* group header row (Monday-style): group name sits in the first column header slot */}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns,
                  alignItems: 'center',
                  bgcolor: 'grey.100',
                  borderBottom: '1px solid',
                  borderColor: 'divider'
                }}
              >
                {/* first (name) column: caret + group name + count */}
                <Box
                  sx={{
                    p: 1,
                    borderRight: '1px solid',
                    borderColor: 'divider',
                    position: 'sticky',
                    left: 0,
                    zIndex: 6,
                    bgcolor: 'grey.100'
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <IconButton size="small" onClick={() => setCollapsedGroups((p) => ({ ...p, [g.id]: !p[g.id] }))}>
                      {collapsed ? <IconChevronRight size={18} /> : <IconChevronDown size={18} />}
                    </IconButton>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                      {g.name}
                    </Typography>
                    <Chip size="small" label={groupCounts[g.id] || 0} />
                    {onDeleteGroup && (
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteGroupTarget(g);
                          setDeleteGroupOpen(true);
                        }}
                        title="Delete group"
                      >
                        <IconTrash size={16} />
                      </IconButton>
                    )}
                  </Stack>
                </Box>

                {/* remaining column headers */}
                {columns.slice(1).map((c) => (
                  <Box
                    key={`${g.id}-${c.key}-hdr`}
                    sx={{
                      p: 1,
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      color: 'text.secondary',
                      borderRight: c.key === 'time' ? 'none' : '1px solid',
                      borderColor: 'divider',
                      textAlign: 'center'
                    }}
                  >
                    {c.label}
                  </Box>
                ))}
              </Box>

              {!collapsed && (
                <Stack spacing={1} sx={{ p: 1, pt: 0 }}>
                  {/* Items */}
                  {items.map((it) => {
                    const status = it.status || 'To Do';
                    const sc = getStatusColor(status, labels);
                    const assignees = assigneesByItem[it.id] || [];
                    const updateCount = updateCountsByItem[it.id] || 0;
                    const timeTotal = timeTotalsByItem[it.id] || 0;
                    const isHighlighted = highlightedItemId === it.id;
                    const isEditing = editingItemId === it.id;

                    return (
                      <Box
                        key={it.id}
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
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, minWidth: 0, flex: 1 }}
                                noWrap
                                onClick={() => handleNameClick(it)}
                                onDoubleClick={() => handleNameDoubleClick(it)}
                              >
                                {it.name}
                              </Typography>
                              {onArchiveItem && (
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setArchiveTargetItem(it);
                                    setArchiveConfirmOpen(true);
                                  }}
                                  title="Delete (archive)"
                                >
                                  <IconTrash size={16} />
                                </IconButton>
                              )}
                            </Stack>
                          )}
                        </Box>

                        {/* status */}
                        <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }} onClick={(e) => e.stopPropagation()}>
                          <Select
                            size="small"
                            value={status}
                            onChange={(e) => {
                              const next = e.target.value;
                              if (next === '__add_label__') {
                                openAddLabel(it.id);
                                return;
                              }
                              onUpdateItem?.(it.id, { status: next });
                            }}
                            sx={{
                              width: '100%',
                              '& .MuiSelect-select': { py: 0.5, color: sc.fg },
                              '& .MuiSvgIcon-root': { color: sc.fg },
                              bgcolor: sc.bg,
                              color: sc.fg,
                              borderRadius: 999,
                              '.MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' }
                            }}
                          >
                            {labels.map((sl) => (
                              <MenuItem key={sl.id} value={sl.label}>
                                <Box
                                  component="span"
                                  sx={{
                                    display: 'inline-block',
                                    width: 10,
                                    height: 10,
                                    borderRadius: '50%',
                                    bgcolor: sl.color,
                                    mr: 1
                                  }}
                                />
                                {sl.label}
                              </MenuItem>
                            ))}
                            {boardId && canManageLabels && (
                              <>
                                <Divider />
                                <MenuItem value="__add_label__">
                                  <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                                    Add Label…
                                  </Typography>
                                </MenuItem>
                              </>
                            )}
                          </Select>
                        </Box>

                        {/* people */}
                        <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }} onClick={(e) => openPeoplePicker(e, it.id)}>
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
                            value={it.due_date ? it.due_date.slice(0, 10) : ''}
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
                          <Button size="small" variant="text" startIcon={<IconClock size={16} />}>
                            {fmtMinutes(timeTotal)}
                          </Button>
                        </Box>
                      </Box>
                    );
                  })}

                  {/* New item row (bottom of group, Monday-style) */}
                  {onCreateItem && (
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      alignItems={{ xs: 'stretch', sm: 'center' }}
                      sx={{ pt: 0.5 }}
                    >
                      <TextField
                        fullWidth
                        size="small"
                        placeholder="New item"
                        value={newItemNameByGroup[g.id] || ''}
                        onChange={(e) => onChangeNewItemName?.(g.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onCreateItem?.(g.id);
                        }}
                      />
                      <Button
                        variant="contained"
                        onClick={() => onCreateItem?.(g.id)}
                        disabled={creatingItemByGroup[g.id] || !(newItemNameByGroup[g.id] || '').trim()}
                      >
                        {creatingItemByGroup[g.id] ? 'Adding…' : 'Add item'}
                      </Button>
                    </Stack>
                  )}
                </Stack>
              )}
            </Box>
          );
        })}
      </Box>

      <Popper open={peopleOpen} anchorEl={peopleAnchor} placement="bottom-start" sx={{ zIndex: 2000 }}>
        <Paper sx={{ p: 1, width: 320 }}>
          <Stack spacing={1}>
            <TextField
              size="small"
              placeholder="Search names, roles or teams"
              value={peopleQuery}
              onChange={(e) => setPeopleQuery(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start">@</InputAdornment>
              }}
            />
            {currentAssignees.length > 0 && (
              <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
                {currentAssignees.map((a) => {
                  const label =
                    [a.first_name, a.last_name].filter(Boolean).join(' ').trim() || a.email || a.user_id?.slice?.(0, 6) || 'User';
                  return (
                    <Chip
                      key={a.user_id}
                      size="small"
                      label={label}
                      avatar={
                        <Avatar src={a.avatar_url || ''} sx={{ width: 22, height: 22, fontSize: 11 }}>
                          {label.slice(0, 1).toUpperCase()}
                        </Avatar>
                      }
                      onMouseDown={(e) => e.preventDefault()}
                      onDelete={() => onToggleAssignee?.(peopleItemId, a.user_id, true)}
                      sx={{ maxWidth: '100%' }}
                    />
                  );
                })}
              </Stack>
            )}
            <Divider />
            <Box sx={{ maxHeight: 260, overflow: 'auto' }}>
              <Stack spacing={0.5}>
                {availableMembers.slice(0, 25).map((m) => {
                  const name = `${m.first_name || ''} ${m.last_name || ''}`.trim();
                  const label = name ? `${name}` : m.email;
                  return (
                    <Button
                      key={m.user_id}
                      size="small"
                      variant="outlined"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onToggleAssignee?.(peopleItemId, m.user_id, false)}
                      sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Avatar src={m.avatar_url || ''} sx={{ width: 22, height: 22, fontSize: 11 }}>
                          {(label || 'U').slice(0, 1).toUpperCase()}
                        </Avatar>
                        <Stack sx={{ minWidth: 0, flex: 1, alignItems: 'flex-start' }}>
                          <Typography variant="body2" noWrap sx={{ width: '100%', display: 'block', textAlign: 'left' }}>
                            {label}
                          </Typography>
                        </Stack>
                      </Stack>
                    </Button>
                  );
                })}
                {!availableMembers.length && (
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

      <Dialog open={addLabelOpen} onClose={closeAddLabel} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
            <Box>
              <Typography variant="h5">Add Label</Typography>
              <Typography variant="body2" color="text.secondary">
                Create a new status label{boardId ? ' for this board' : ''}.
              </Typography>
            </Box>
            <FormControlLabel
              control={<Checkbox checked={makeGlobal} onChange={(e) => setMakeGlobal(e.target.checked)} />}
              label="Make Global Label"
            />
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Label text"
              value={labelText}
              onChange={(e) => setLabelText(e.target.value)}
              fullWidth
              autoFocus
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Box sx={{ minWidth: 220 }}>
                <TextField
                  label="Hex"
                  value={labelHex}
                  onChange={(e) => setLabelHex(normalizeHex(e.target.value))}
                  fullWidth
                  inputProps={{ maxLength: 9 }}
                  helperText="Use #RRGGBB (opacity applied below)"
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <input
                  type="color"
                  value={normalizeHex(labelHex).slice(0, 7)}
                  onChange={(e) => setLabelHex(e.target.value)}
                  style={{ width: 44, height: 44, border: 'none', background: 'transparent', padding: 0 }}
                />
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    bgcolor: hexToRgbaHex(labelHex, labelOpacity),
                    border: '1px solid',
                    borderColor: 'divider'
                  }}
                  title={hexToRgbaHex(labelHex, labelOpacity)}
                />
              </Box>
            </Stack>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Opacity ({labelOpacity}%)
              </Typography>
              <Slider
                value={labelOpacity}
                onChange={(_e, v) => setLabelOpacity(Number(v))}
                min={0}
                max={100}
                step={1}
                valueLabelDisplay="auto"
              />
            </Box>

            {uniqueLabelColors.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Pick an existing color
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', pt: 1 }}>
                  {uniqueLabelColors.map((c) => (
                    <Box
                      key={c}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        // If existing color includes alpha (#RRGGBBAA), preserve it by setting opacity.
                        const hex = String(c).trim();
                        const base = hex.slice(0, 7);
                        setLabelHex(base);
                        if (hex.length === 9) {
                          const aa = parseInt(hex.slice(7, 9), 16);
                          const pct = Math.round((aa / 255) * 100);
                          setLabelOpacity(pct);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const hex = String(c).trim();
                          const base = hex.slice(0, 7);
                          setLabelHex(base);
                        }
                      }}
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        bgcolor: c,
                        border: '2px solid',
                        borderColor: hexToRgbaHex(labelHex, labelOpacity).toLowerCase() === String(c).toLowerCase() ? 'primary.main' : 'divider',
                        cursor: 'pointer'
                      }}
                      title={c}
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeAddLabel}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateLabel}
            disabled={creatingLabel || !labelText.trim() || !boardId || !canManageLabels}
          >
            {creatingLabel ? 'Creating…' : 'Create label'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={archiveConfirmOpen}
        onClose={() => {
          setArchiveConfirmOpen(false);
          setArchiveTargetItem(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete item?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will archive the item for 30 days, then it will be permanently deleted.
          </Typography>
          {archiveTargetItem?.name && (
            <Typography variant="subtitle2" sx={{ mt: 1, fontWeight: 800 }}>
              {archiveTargetItem.name}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setArchiveConfirmOpen(false);
              setArchiveTargetItem(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={async () => {
              const id = archiveTargetItem?.id;
              setArchiveConfirmOpen(false);
              setArchiveTargetItem(null);
              if (id) await onArchiveItem?.(id);
            }}
            disabled={!archiveTargetItem?.id}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteGroupOpen}
        onClose={() => {
          setDeleteGroupOpen(false);
          setDeleteGroupTarget(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete group?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will permanently delete the group and all items inside it.
          </Typography>
          {deleteGroupTarget?.name && (
            <Typography variant="subtitle2" sx={{ mt: 1, fontWeight: 800 }}>
              {deleteGroupTarget.name}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteGroupOpen(false);
              setDeleteGroupTarget(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={async () => {
              const id = deleteGroupTarget?.id;
              setDeleteGroupOpen(false);
              setDeleteGroupTarget(null);
              if (id) await onDeleteGroup?.(id);
            }}
            disabled={!deleteGroupTarget?.id}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
