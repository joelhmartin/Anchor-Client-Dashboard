import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Divider,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import {
  fetchTaskBoardsAll,
  fetchTaskBoardAutomations,
  createTaskBoardAutomation,
  fetchGlobalTaskAutomations,
  createGlobalTaskAutomation,
  updateTaskAutomation,
  fetchAutomationRuns,
  deleteTaskAutomation
} from 'api/tasks';

const TRIGGERS = [
  { id: 'status_change', label: 'Status changes' },
  { id: 'assignee_added', label: 'Person is assigned' },
  { id: 'due_date_relative', label: 'Due date (relative)' }
];

const ACTIONS = [
  { id: 'notify_admins', label: 'Notify admins' },
  { id: 'notify_assignees', label: 'Notify assignees' },
  { id: 'set_status', label: 'Set status' },
  { id: 'set_needs_attention', label: 'Set Needs Attention flag' },
  { id: 'add_update', label: 'Post an update' }
];

function defaultTemplate({ boardStatusLabels }) {
  const defaultStatus = (boardStatusLabels || []).find((l) => l.label)?.label || 'Needs Attention';
  return {
    name: 'When status changes → notify admins',
    trigger_type: 'status_change',
    trigger_config: { to_status: defaultStatus },
    action_type: 'notify_admins',
    action_config: { title: 'Task updated', body: 'A task changed status.' },
    is_active: true
  };
}

export default function AutomationsPane({ activeBoardId = '', boardStatusLabels = [] }) {
  const [scope, setScope] = useState('board'); // 'board' | 'global'
  const [allBoards, setAllBoards] = useState([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState(activeBoardId || '');
  const [boardQuery, setBoardQuery] = useState('');

  const [rules, setRules] = useState([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [error, setError] = useState('');

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(() => defaultTemplate({ boardStatusLabels }));

  const [runs, setRuns] = useState([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

  useEffect(() => {
    if (activeBoardId) setSelectedBoardId(activeBoardId);
  }, [activeBoardId]);

  useEffect(() => {
    setLoadingBoards(true);
    fetchTaskBoardsAll()
      .then((rows) => setAllBoards(rows || []))
      .catch(() => setAllBoards([]))
      .finally(() => setLoadingBoards(false));
  }, []);

  const canShowBoard = scope === 'board';
  const effectiveBoardId = canShowBoard ? selectedBoardId : '';

  const statusOptions = useMemo(() => {
    const labels = Array.isArray(boardStatusLabels) && boardStatusLabels.length ? boardStatusLabels : [{ id: 'default', label: 'Needs Attention' }];
    return labels.map((l) => l.label);
  }, [boardStatusLabels]);

  const refresh = async () => {
    setError('');
    setLoadingRules(true);
    try {
      const next = scope === 'global' ? await fetchGlobalTaskAutomations() : effectiveBoardId ? await fetchTaskBoardAutomations(effectiveBoardId) : [];
      setRules(next || []);
    } catch (err) {
      setRules([]);
      setError(err.message || 'Unable to load automations');
    } finally {
      setLoadingRules(false);
    }

    // runs
    setLoadingRuns(true);
    try {
      const params = scope === 'global' ? { scope: 'global' } : effectiveBoardId ? { scope: 'board', board_id: effectiveBoardId } : { scope: 'board' };
      const rows = await fetchAutomationRuns(params);
      setRuns(rows || []);
    } catch (_err) {
      setRuns([]);
    } finally {
      setLoadingRuns(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, effectiveBoardId]);

  const create = async () => {
    setCreating(true);
    setError('');
    try {
      if (scope === 'global') {
        await createGlobalTaskAutomation(draft);
      } else {
        if (!effectiveBoardId) throw new Error('Select a board first');
        await createTaskBoardAutomation(effectiveBoardId, draft);
      }
      setDraft(defaultTemplate({ boardStatusLabels }));
      await refresh();
    } catch (err) {
      setError(err.message || 'Unable to create automation');
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (rule) => {
    if (!rule?.id) return;
    setError('');
    try {
      const updated = await updateTaskAutomation(rule.id, { is_active: !rule.is_active });
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      setError(err.message || 'Unable to update automation');
    }
  };

  const handleDelete = async (rule) => {
    if (!rule?.id) return;
    if (!window.confirm('Delete this automation?')) return;
    setError('');
    try {
      await deleteTaskAutomation(rule.id);
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    } catch (err) {
      setError(err.message || 'Unable to delete automation');
    }
  };

  const renderTriggerFields = () => {
    if (draft.trigger_type === 'status_change') {
      return (
        <Select
          size="small"
          value={draft.trigger_config?.to_status || ''}
          onChange={(e) => setDraft((p) => ({ ...p, trigger_config: { ...(p.trigger_config || {}), to_status: e.target.value } }))}
        >
          <MenuItem value="">Any status</MenuItem>
          {statusOptions.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </Select>
      );
    }
    if (draft.trigger_type === 'due_date_relative') {
      return (
        <TextField
          size="small"
          type="number"
          label="days_from_due"
          helperText="Example: -10 = 10 days before due, 0 = on due date, 1 = 1 day after due"
          value={draft.trigger_config?.days_from_due ?? -10}
          onChange={(e) =>
            setDraft((p) => ({ ...p, trigger_config: { ...(p.trigger_config || {}), days_from_due: Number(e.target.value) } }))
          }
        />
      );
    }
    return (
      <Typography variant="body2" color="text.secondary">
        No trigger settings.
      </Typography>
    );
  };

  const renderActionFields = () => {
    if (draft.action_type === 'set_status') {
      return (
        <Select
          size="small"
          value={draft.action_config?.status || statusOptions[0] || 'To Do'}
          onChange={(e) => setDraft((p) => ({ ...p, action_config: { ...(p.action_config || {}), status: e.target.value } }))}
        >
          {statusOptions.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </Select>
      );
    }
    if (draft.action_type === 'set_needs_attention') {
      return (
        <Select
          size="small"
          value={String(Boolean(draft.action_config?.value))}
          onChange={(e) => setDraft((p) => ({ ...p, action_config: { ...(p.action_config || {}), value: e.target.value === 'true' } }))}
        >
          <MenuItem value="true">Set to true</MenuItem>
          <MenuItem value="false">Set to false</MenuItem>
        </Select>
      );
    }
    if (draft.action_type === 'add_update') {
      return (
        <TextField
          size="small"
          label="Update content"
          value={draft.action_config?.content || ''}
          onChange={(e) => setDraft((p) => ({ ...p, action_config: { ...(p.action_config || {}), content: e.target.value } }))}
        />
      );
    }
    // notification defaults
    return (
      <>
        <TextField
          size="small"
          label="Title"
          value={draft.action_config?.title || ''}
          onChange={(e) => setDraft((p) => ({ ...p, action_config: { ...(p.action_config || {}), title: e.target.value } }))}
        />
        <TextField
          size="small"
          label="Body"
          value={draft.action_config?.body || ''}
          onChange={(e) => setDraft((p) => ({ ...p, action_config: { ...(p.action_config || {}), body: e.target.value } }))}
        />
      </>
    );
  };

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 3, minHeight: 420 }}>
      <Stack spacing={2}>
        <Stack spacing={0.25}>
          <Typography variant="h5">Automations</Typography>
          <Typography variant="body2" color="text.secondary">
            Create Monday-style rules. Choose whether the automation is global or scoped to a board.
          </Typography>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        <Divider />

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <Select size="small" value={scope} onChange={(e) => setScope(e.target.value)} sx={{ minWidth: 160 }}>
            <MenuItem value="board">Board</MenuItem>
            <MenuItem value="global">Global</MenuItem>
          </Select>

          {scope === 'board' && (
            <Autocomplete
              size="small"
              options={allBoards}
              loading={loadingBoards}
              getOptionLabel={(option) => {
                const ws = option.workspace_name ? ` • ${option.workspace_name}` : '';
                return `${option.name || 'Board'}${ws}`;
              }}
              value={allBoards.find((b) => b.id === selectedBoardId) || null}
              onChange={(_e, val) => setSelectedBoardId(val?.id || '')}
              inputValue={boardQuery}
              onInputChange={(_e, val) => setBoardQuery(val)}
              sx={{ minWidth: 280, flex: 1 }}
              renderInput={(params) => <TextField {...params} placeholder="Search boards…" />}
              filterOptions={(opts, state) => {
                const q = (state.inputValue || '').toLowerCase().trim();
                if (!q) return opts;
                return opts.filter((o) => {
                  const name = (o.name || '').toLowerCase();
                  const ws = (o.workspace_name || '').toLowerCase();
                  return name.includes(q) || ws.includes(q);
                });
              }}
            />
          )}

          <Button variant="outlined" onClick={refresh} disabled={loadingRules || loadingRuns}>
            Refresh
          </Button>
        </Stack>

        <Divider />

        <Stack spacing={1}>
          <Typography variant="subtitle2">Create automation</Typography>
          <TextField
            size="small"
            label="Name"
            value={draft.name}
            onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
          />
          <Select
            size="small"
            value={draft.trigger_type}
            onChange={(e) => setDraft((p) => ({ ...p, trigger_type: e.target.value, trigger_config: {} }))}
          >
            {TRIGGERS.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.label}
              </MenuItem>
            ))}
          </Select>
          {renderTriggerFields()}

          <Select
            size="small"
            value={draft.action_type}
            onChange={(e) => setDraft((p) => ({ ...p, action_type: e.target.value, action_config: {} }))}
          >
            {ACTIONS.map((a) => (
              <MenuItem key={a.id} value={a.id}>
                {a.label}
              </MenuItem>
            ))}
          </Select>
          {renderActionFields()}

          <Button variant="contained" onClick={create} disabled={creating || (scope === 'board' && !effectiveBoardId)}>
            {creating ? 'Creating…' : 'Create automation'}
          </Button>
        </Stack>

        <Divider />

        <Stack spacing={1}>
          <Typography variant="subtitle2">Automations</Typography>
          {loadingRules ? (
            <CircularProgress size={18} />
          ) : (
            <Stack spacing={0.75}>
              {!rules.length && (
                <Typography variant="body2" color="text.secondary">
                  No automations yet.
                </Typography>
              )}
              {rules.map((r) => (
                <Box
                  key={r.id}
                  sx={{
                    p: 1.25,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 1
                  }}
                >
                  <Stack sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {r.trigger_type} → {r.action_type} {r.is_active ? '(active)' : '(inactive)'}
      </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5}>
                    <Button size="small" variant="outlined" onClick={() => toggleActive(r)}>
                      {r.is_active ? 'Disable' : 'Enable'}
                    </Button>
                    <Button size="small" color="error" variant="outlined" onClick={() => handleDelete(r)}>
                      Delete
                    </Button>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </Stack>

        <Divider />

        <Stack spacing={1}>
          <Typography variant="subtitle2">Recent runs</Typography>
          {loadingRuns ? (
            <CircularProgress size={18} />
          ) : (
            <Stack spacing={0.75}>
              {!runs.length && (
      <Typography variant="body2" color="text.secondary">
                  No runs yet.
                </Typography>
              )}
              {runs.slice(0, 20).map((r) => (
                <Box key={r.id} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    {r.scope} • {r.trigger_type} • {r.status} • {r.ran_at ? new Date(r.ran_at).toLocaleString() : ''}
                  </Typography>
                  {r.error ? (
                    <Typography variant="body2" color="error" sx={{ mt: 0.25 }}>
                      {r.error}
      </Typography>
                  ) : null}
                </Box>
              ))}
            </Stack>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}

