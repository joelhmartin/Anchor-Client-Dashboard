import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  Alert,
  Avatar,
  AvatarGroup,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Popper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { IconEye, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';

import MainCard from 'ui-component/cards/MainCard';
import useAuth from 'hooks/useAuth';
import BoardHeader from './components/BoardHeader';
import BoardTable from './components/BoardTable';
import HomePane from './panes/HomePane';
import MyWorkPane from './panes/MyWorkPane';
import AutomationsPane from './panes/AutomationsPane';
import BillingPane from './panes/BillingPane';
import {
  createTaskGroup,
  createTaskItem,
  createTaskBoardAutomation,
  fetchTaskWorkspaceMembers,
  searchTaskWorkspaceMembers,
  fetchTaskBoardView,
  fetchTaskBoardAutomations,
  fetchTaskBoardReport,
  fetchTaskBoardsAll,
  fetchTaskBoards,
  fetchTaskItemUpdates,
  createTaskItemUpdate,
  fetchTaskItemFiles,
  uploadTaskItemFile,
  fetchTaskItemTimeEntries,
  createTaskItemTimeEntry,
  fetchTaskItemAssignees,
  addTaskItemAssignee,
  removeTaskItemAssignee,
  fetchTaskItemSubitems,
  createTaskSubitem,
  updateTaskSubitem,
  deleteTaskSubitem,
  setTaskAutomationActive,
  downloadTaskBoardCsv,
  fetchTaskItemAiSummary,
  refreshTaskItemAiSummary,
  updateTaskBoard,
  updateTaskItem,
  runTaskBoardsReport,
  fetchMyWork,
  markUpdatesViewed,
  fetchUpdateViews,
  createBoardStatusLabel,
  updateStatusLabel,
  deleteStatusLabel,
  initBoardStatusLabels
} from 'api/tasks';

function getEffectiveRole(user) {
  return user?.effective_role || user?.role;
}

function normalizeDateStr(value) {
  if (!value) return value;
  if (typeof value === 'string') return value.slice(0, 10);
  return value;
}

function normalizeBoardView(view) {
  if (!view) return view;
  const items = Array.isArray(view?.items)
    ? view.items.map((it) => ({
        ...it,
        due_date: normalizeDateStr(it.due_date)
      }))
    : [];
  return { ...view, items };
}

// Default status labels (used when board has none)
const DEFAULT_STATUS_LABELS = [
  { id: 'default-todo', label: 'To Do', color: '#808080', order_index: 0, is_done_state: false },
  { id: 'default-working', label: 'Working on it', color: '#fdab3d', order_index: 1, is_done_state: false },
  { id: 'default-stuck', label: 'Stuck', color: '#e2445c', order_index: 2, is_done_state: false },
  { id: 'default-done', label: 'Done', color: '#00c875', order_index: 3, is_done_state: true },
  { id: 'default-needs-attention', label: 'Needs Attention', color: '#ff642e', order_index: 4, is_done_state: false }
];

// Get status color from labels array
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

function clampNonNegInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function normalizeHm({ hours, minutes }) {
  const h = clampNonNegInt(hours);
  let mRaw = Number(minutes);
  if (!Number.isFinite(mRaw)) mRaw = 0;
  mRaw = Math.max(0, mRaw);
  // enforce 15-minute increments
  const mRounded = Math.round(mRaw / 15) * 15;
  const carry = Math.floor(mRounded / 60);
  const m = mRounded % 60;
  return { hours: h + carry, minutes: m };
}

export default function TaskManager() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawPane = searchParams.get('pane') || 'home';
  const pane = ['home', 'boards', 'my-work', 'automations', 'billing'].includes(rawPane) ? rawPane : 'home';
  const reportRun = searchParams.get('report_run') || '';
  const reportStart = searchParams.get('report_start') || '';
  const reportEnd = searchParams.get('report_end') || '';
  const reportBoards = (searchParams.get('report_boards') || '').split(',').filter(Boolean);

  const [error, setError] = useState('');

  const activeWorkspaceId = searchParams.get('workspace') || '';
  const activeBoardId = searchParams.get('board') || '';
  const [workspaceMembers, setWorkspaceMembers] = useState([]);

  const [boardViewLoading, setBoardViewLoading] = useState(false);
  const [boardView, setBoardView] = useState(null); // { board, groups, items }
  const [boardSearch, setBoardSearch] = useState('');
  const [boardViewType, setBoardViewType] = useState('main');
  const [automations, setAutomations] = useState([]);
  const [automationsLoading, setAutomationsLoading] = useState(false);
  const [creatingAutomation, setCreatingAutomation] = useState(false);
  const [automationsAnchorEl, setAutomationsAnchorEl] = useState(null);
  const [automationToStatus, setAutomationToStatus] = useState('Needs Attention');
  const [automationAction, setAutomationAction] = useState('notify_admins');
  const [automationTitle, setAutomationTitle] = useState('Task needs attention');
  const [automationBody, setAutomationBody] = useState('An item was moved to Needs Attention.');

  // Status labels editor
  const [statusLabelsDialogOpen, setStatusLabelsDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState(null);
  const [newLabelText, setNewLabelText] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#808080');
  const [savingLabel, setSavingLabel] = useState(false);
  const [boardReport, setBoardReport] = useState(null);
  const [boardReportLoading, setBoardReportLoading] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [newItemNameByGroup, setNewItemNameByGroup] = useState({});
  const [creatingItemByGroup, setCreatingItemByGroup] = useState({});

  // Item drawer
  const [activeItem, setActiveItem] = useState(null);
  const [itemDrawerOpen, setItemDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState('updates'); // updates | files | time
  const [itemUpdates, setItemUpdates] = useState([]);
  const [itemUpdatesLoading, setItemUpdatesLoading] = useState(false);
  const [newUpdateText, setNewUpdateText] = useState('');
  const [postingUpdate, setPostingUpdate] = useState(false);
  const updateInputRef = useRef(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionOptions, setMentionOptions] = useState([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  // Update view tracking
  const [updateViews, setUpdateViews] = useState({}); // { updateId: [{ user_id, user_name, avatar_url, viewed_at }] }
  const [viewPopperAnchor, setViewPopperAnchor] = useState(null);
  const [viewPopperUpdateId, setViewPopperUpdateId] = useState(null);
  const [itemFiles, setItemFiles] = useState([]);
  const [itemFilesLoading, setItemFilesLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [timeEntries, setTimeEntries] = useState([]);
  const [timeEntriesLoading, setTimeEntriesLoading] = useState(false);
  const [loggingTime, setLoggingTime] = useState(false);
  const [timeBillable, setTimeBillable] = useState(true);
  const [timeCategory, setTimeCategory] = useState('Other');
  const [timeDescription, setTimeDescription] = useState('');
  const [timeHours, setTimeHours] = useState(0);
  const [timeMins, setTimeMins] = useState(0);
  const [billableHours, setBillableHours] = useState(0);
  const [billableMins, setBillableMins] = useState(0);
  const [billableTouched, setBillableTouched] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [aiSummaryMeta, setAiSummaryMeta] = useState({ is_stale: false, latest_update_at: null });
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryRefreshing, setAiSummaryRefreshing] = useState(false);
  const [assignees, setAssignees] = useState([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [newAssigneeUserId, setNewAssigneeUserId] = useState('');
  const [addingAssignee, setAddingAssignee] = useState(false);
  const [subitems, setSubitems] = useState([]);
  const [subitemsLoading, setSubitemsLoading] = useState(false);
  const [newSubitemName, setNewSubitemName] = useState('');
  const [creatingSubitem, setCreatingSubitem] = useState(false);

  const closeItemDrawer = () => {
    setItemDrawerOpen(false);
    setActiveItem(null);
    // Clear deep-link params so background board refreshes don't re-open the drawer.
    const next = new URLSearchParams(searchParams);
    next.delete('item');
    setSearchParams(next, { replace: true });
  };

  // Board scroll/highlight helpers
  const itemCardRefs = useRef({});
  const [highlightedItemId, setHighlightedItemId] = useState('');

  // Reporting results (main content when pane=reports)
  const [reportRows, setReportRows] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [allBoards, setAllBoards] = useState([]);
  const [allBoardsLoading, setAllBoardsLoading] = useState(false);
  const [reportBoardQuery, setReportBoardQuery] = useState('');
  const [reportStartInput, setReportStartInput] = useState(reportStart || '');
  const [reportEndInput, setReportEndInput] = useState(reportEnd || '');
  const [selectedReportBoards, setSelectedReportBoards] = useState(() => new Set(reportBoards));

  // My Work
  const [myWorkBoards, setMyWorkBoards] = useState([]);
  const [myWorkLoading, setMyWorkLoading] = useState(false);
  const [myWorkMembers, setMyWorkMembers] = useState([]);
  const refreshMyWork = async () => {
    try {
      const rows = await fetchMyWork();
      if (Array.isArray(rows)) setMyWorkBoards(rows);
    } catch (_err) {
      // ignore
    }
  };

  // Workspace boards (when only workspace selected)
  const [workspaceBoards, setWorkspaceBoards] = useState([]);
  const [workspaceBoardsLoading, setWorkspaceBoardsLoading] = useState(false);

  // Current status labels (from boardView or defaults)
  const statusLabels = boardView?.status_labels || DEFAULT_STATUS_LABELS;
  const isAdmin = ['superadmin', 'admin'].includes(user?.effective_role);

  // Status label management functions
  const handleInitializeLabels = async () => {
    if (!activeBoardId) return;
    setSavingLabel(true);
    try {
      const labels = await initBoardStatusLabels(activeBoardId);
      setBoardView((prev) => ({ ...prev, status_labels: labels }));
    } catch (err) {
      console.error('Failed to initialize status labels:', err);
    }
    setSavingLabel(false);
  };

  const handleAddLabel = async () => {
    if (!activeBoardId || !newLabelText.trim()) return;
    setSavingLabel(true);
    try {
      const label = await createBoardStatusLabel(activeBoardId, {
        label: newLabelText.trim(),
        color: newLabelColor
      });
      setBoardView((prev) => ({
        ...prev,
        status_labels: [...(prev.status_labels || []), label]
      }));
      setNewLabelText('');
      setNewLabelColor('#808080');
    } catch (err) {
      console.error('Failed to add status label:', err);
    }
    setSavingLabel(false);
  };

  const handleUpdateLabel = async (labelId, updates) => {
    setSavingLabel(true);
    try {
      const updated = await updateStatusLabel(labelId, updates);
      setBoardView((prev) => ({
        ...prev,
        status_labels: (prev.status_labels || []).map((l) => (l.id === labelId ? updated : l))
      }));
      setEditingLabel(null);
    } catch (err) {
      console.error('Failed to update status label:', err);
    }
    setSavingLabel(false);
  };

  const handleDeleteLabel = async (labelId) => {
    if (!confirm('Delete this status label? Items using it will keep their current status text.')) return;
    setSavingLabel(true);
    try {
      await deleteStatusLabel(labelId);
      setBoardView((prev) => ({
        ...prev,
        status_labels: (prev.status_labels || []).filter((l) => l.id !== labelId)
      }));
    } catch (err) {
      console.error('Failed to delete status label:', err);
    }
    setSavingLabel(false);
  };

  // Close overlays when pane changes to avoid blocking navigation (e.g., reports)
  useEffect(() => {
    setAutomationsAnchorEl(null);
  }, [pane]);

  // When billable is toggled, keep billable duration in sync unless user overrides it.
  useEffect(() => {
    if (!timeBillable) {
      setBillableTouched(false);
      setBillableHours(0);
      setBillableMins(0);
      return;
    }
    // billable on: default billable duration == duration
    if (!billableTouched) {
      const next = normalizeHm({ hours: timeHours, minutes: timeMins });
      setBillableHours(next.hours);
      setBillableMins(next.minutes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeBillable]);

  // If billable duration hasn't been manually edited, keep it mirrored to Duration.
  useEffect(() => {
    if (!timeBillable) return;
    if (billableTouched) return;
    const next = normalizeHm({ hours: timeHours, minutes: timeMins });
    if (billableHours !== next.hours) setBillableHours(next.hours);
    if (billableMins !== next.minutes) setBillableMins(next.minutes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeHours, timeMins, timeBillable, billableTouched]);

  const updateItemField = async (patch) => {
    if (!activeItem?.id) return;
    setError('');
    try {
      const next = await updateTaskItem(activeItem.id, patch);
      setActiveItem(next);
      // refresh board data so cards reflect changes
      if (activeBoardId) {
        loadBoardView(activeBoardId);
        loadBoardReport(activeBoardId);
      }
    } catch (err) {
      setError(err.message || 'Unable to update item');
    }
  };

  // Members are used for assignee dropdown and mention autocomplete
  useEffect(() => {
    if (!activeWorkspaceId) {
      setWorkspaceMembers([]);
      return;
    }
    // Sidebar owns member management; we only need the list for dropdowns.
    fetchTaskWorkspaceMembers(activeWorkspaceId)
      .then((m) => setWorkspaceMembers(m))
      .catch(() => setWorkspaceMembers([]));
  }, [activeWorkspaceId]);

  const loadBoardView = async (boardId) => {
    if (!boardId) {
      setBoardView(null);
      return;
    }
    setBoardViewLoading(true);
    setError('');
    try {
      const data = await fetchTaskBoardView(boardId);
      setBoardView(normalizeBoardView(data));
      // Ensure workspace param is populated for sidebar + dropdowns when deep-linked by board only
      if (data?.board?.workspace_id && !activeWorkspaceId) {
        const next = new URLSearchParams(searchParams);
        next.set('workspace', data.board.workspace_id);
        setSearchParams(next, { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Unable to load board');
      setBoardView(null);
    } finally {
      setBoardViewLoading(false);
    }
  };

  const loadAutomations = async (boardId) => {
    if (!boardId) {
      setAutomations([]);
      return;
    }
    setAutomationsLoading(true);
    try {
      const rules = await fetchTaskBoardAutomations(boardId);
      setAutomations(rules);
    } catch (err) {
      // non-fatal
      setAutomations([]);
    } finally {
      setAutomationsLoading(false);
    }
  };

  const loadBoardReport = async (boardId) => {
    if (!boardId) {
      setBoardReport(null);
      return;
    }
    setBoardReportLoading(true);
    try {
      const report = await fetchTaskBoardReport(boardId);
      setBoardReport(report);
    } catch (_err) {
      setBoardReport(null);
    } finally {
      setBoardReportLoading(false);
    }
  };

  useEffect(() => {
    if (pane === 'boards') {
      loadBoardView(activeBoardId);
      loadAutomations(activeBoardId);
      loadBoardReport(activeBoardId);
      // When only workspace is selected, load boards list for that workspace
      if (!activeBoardId && activeWorkspaceId) {
        setWorkspaceBoardsLoading(true);
        fetchTaskBoards(activeWorkspaceId)
          .then((rows) => setWorkspaceBoards(rows || []))
          .catch(() => setWorkspaceBoards([]))
          .finally(() => setWorkspaceBoardsLoading(false));
      } else {
        setWorkspaceBoards([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoardId, pane]);

  // Reload boards list when workspace changes (even if board was previously selected)
  useEffect(() => {
    if (pane !== 'boards') return;
    setWorkspaceBoards([]);
    setWorkspaceBoardsLoading(true);
    if (!activeWorkspaceId) {
      setWorkspaceBoardsLoading(false);
      return;
    }
    fetchTaskBoards(activeWorkspaceId)
      .then((rows) => setWorkspaceBoards(rows || []))
      .catch(() => setWorkspaceBoards([]))
      .finally(() => setWorkspaceBoardsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, pane]);

  // Load all boards for reporting pane
  useEffect(() => {
    if (pane !== 'reports') return;
    setAllBoardsLoading(true);
    fetchTaskBoardsAll()
      .then((rows) => setAllBoards(rows))
      .catch(() => setAllBoards([]))
      .finally(() => setAllBoardsLoading(false));
  }, [pane]);

  // Load My Work (assigned to current user), grouped by board
  useEffect(() => {
    if (pane !== 'my-work') return;
    setMyWorkLoading(true);
    const run = async () => {
      let rows = [];
      try {
        rows = await fetchMyWork();
      } catch (_err) {
        rows = [];
      }

      if (rows && rows.length) {
        setMyWorkBoards(rows);
        setMyWorkLoading(false);
        return;
      }

      // Fallback: derive my work client-side across all boards
      try {
        const boards = await fetchTaskBoardsAll();
        const me = user?.id;
        const grouped = [];
        for (const b of boards) {
          try {
            const view = await fetchTaskBoardView(b.id);
            const assigneesByItem = view?.assignees_by_item || {};
            const items = (view?.items || []).filter((it) => {
              const assignees = assigneesByItem[it.id] || [];
              return assignees.some((a) => a.user_id === me);
            });
            if (items.length) {
              grouped.push({
                board_id: b.id,
                board_name: b.name,
                workspace_id: b.workspace_id,
                workspace_name: b.workspace_name,
                items
              });
            }
          } catch (_err) {
            // ignore individual board errors
          }
        }
        setMyWorkBoards(grouped);
      } catch (_err) {
        setMyWorkBoards([]);
      } finally {
        setMyWorkLoading(false);
      }
    };
    run();
  }, [pane]);

  // Load members for all workspaces represented in My Work so the People picker works
  useEffect(() => {
    if (pane !== 'my-work') return;
    const workspaceIds = Array.from(new Set((myWorkBoards || []).map((b) => b.workspace_id).filter(Boolean)));
    if (!workspaceIds.length) {
      setMyWorkMembers([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const lists = await Promise.all(
          workspaceIds.map((wsId) =>
            fetchTaskWorkspaceMembers(wsId)
              .then((m) => m || [])
              .catch(() => [])
          )
        );
        if (cancelled) return;
        const merged = [];
        const seen = new Set();
        for (const list of lists) {
          for (const m of list) {
            if (m?.user_id && !seen.has(m.user_id)) {
              seen.add(m.user_id);
              merged.push(m);
            }
          }
        }
        setMyWorkMembers(merged);
      } catch (_err) {
        if (!cancelled) setMyWorkMembers([]);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [pane, myWorkBoards]);

  // My Work derived structures for BoardTable reuse
  const myWorkGroups = useMemo(() => {
    if (!Array.isArray(myWorkBoards)) return [];
    return myWorkBoards.map((b) => ({
      id: b.board_id,
      name: b.board_name,
      count: (b.items || []).length
    }));
  }, [myWorkBoards]);

  const myWorkItemsByGroup = useMemo(() => {
    const map = {};
    if (!Array.isArray(myWorkBoards)) return map;
    for (const b of myWorkBoards) {
      const gid = b.board_id;
      map[gid] = (b.items || []).map((it) => ({
        ...it,
        group_id: gid
      }));
    }
    return map;
  }, [myWorkBoards]);

  const myWorkAssigneesByItem = useMemo(() => {
    const map = {};
    if (!Array.isArray(myWorkBoards)) return map;
    for (const b of myWorkBoards) {
      for (const it of b.items || []) {
        if (it.id) map[it.id] = it.assignees || [];
      }
    }
    return map;
  }, [myWorkBoards]);

  const myWorkUpdateCounts = useMemo(() => {
    const map = {};
    if (!Array.isArray(myWorkBoards)) return map;
    for (const b of myWorkBoards) {
      for (const it of b.items || []) {
        if (it.id) map[it.id] = Number(it.update_count || 0);
      }
    }
    return map;
  }, [myWorkBoards]);

  const myWorkTimeTotals = useMemo(() => {
    const map = {};
    if (!Array.isArray(myWorkBoards)) return map;
    for (const b of myWorkBoards) {
      for (const it of b.items || []) {
        if (it.id) map[it.id] = Number(it.time_total_minutes || 0);
      }
    }
    return map;
  }, [myWorkBoards]);

  // Sync reporting selections from URL
  useEffect(() => {
    if (pane !== 'reports') return;
    setReportStartInput(reportStart || '');
    setReportEndInput(reportEnd || '');
    setSelectedReportBoards(new Set(reportBoards));
  }, [pane, reportStart, reportEnd, reportBoards]);

  const filteredReportBoards = useMemo(() => {
    const q = reportBoardQuery.trim().toLowerCase();
    if (!q) return allBoards;
    return allBoards.filter((b) => {
      const name = (b.name || '').toLowerCase();
      const ws = (b.workspace_name || '').toLowerCase();
      return name.includes(q) || ws.includes(q);
    });
  }, [allBoards, reportBoardQuery]);

  const toggleReportBoard = (boardId) => {
    setSelectedReportBoards((prev) => {
      const next = new Set(prev);
      if (next.has(boardId)) next.delete(boardId);
      else next.add(boardId);
      return next;
    });
  };

  const toggleAllReportBoards = () => {
    const ids = filteredReportBoards.map((b) => b.id);
    setSelectedReportBoards((prev) => {
      const next = new Set(prev);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleRunReport = async () => {
    const ids = Array.from(selectedReportBoards);
    if (!ids.length) return;
    setReportLoading(true);
    setError('');
    try {
      const rows = await runTaskBoardsReport({
        board_ids: ids,
        start_date: reportStartInput || null,
        end_date: reportEndInput || null
      });
      setReportRows(rows || []);
      const next = new URLSearchParams(searchParams);
      next.set('pane', 'reports');
      next.set('report_boards', ids.join(','));
      if (reportStartInput) next.set('report_start', reportStartInput);
      else next.delete('report_start');
      if (reportEndInput) next.set('report_end', reportEndInput);
      else next.delete('report_end');
      setSearchParams(next, { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to run report');
    } finally {
      setReportLoading(false);
    }
  };

  const handleExportReportCsv = () => {
    if (!reportRows.length) return;
    const headers = [
      'Workspace',
      'Board',
      'Total',
      'Todo',
      'Working',
      'Blocked',
      'Done',
      'Updates (range)',
      'Time minutes (range)',
      'Updated (range)'
    ];
    const lines = [
      headers.join(','),
      ...reportRows.map((r) =>
        [
          r.workspace_name,
          r.board_name,
          r.total_items || 0,
          r.todo || 0,
          r.working || 0,
          r.blocked || 0,
          r.done || 0,
          r.updates_in_range || 0,
          r.time_minutes_in_range || 0,
          r.items_updated_in_range || 0
        ]
          .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
          .join(',')
      )
    ].join('\n');
    const blob = new Blob([lines], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'board-report.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (pane !== 'reports') return;
    if (!reportBoards.length) {
      setReportRows([]);
      return;
    }
    setReportLoading(true);
    runTaskBoardsReport({
      board_ids: reportBoards,
      start_date: reportStart || null,
      end_date: reportEnd || null
    })
      .then((rows) => setReportRows(rows))
      .catch(() => setReportRows([]))
      .finally(() => setReportLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane, reportRun]);

  const handleCreateGroup = async () => {
    if (!activeBoardId || !newGroupName.trim()) return;
    setCreatingGroup(true);
    setError('');
    try {
      await createTaskGroup(activeBoardId, { name: newGroupName.trim() });
      setNewGroupName('');
      await loadBoardView(activeBoardId);
    } catch (err) {
      setError(err.message || 'Unable to create group');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleAddNeedsAttentionAutomation = async () => {
    if (!activeBoardId) return;
    setCreatingAutomation(true);
    setError('');
    try {
      await createTaskBoardAutomation(activeBoardId, {
        name: 'Notify admins when status becomes needs_attention',
        trigger_type: 'status_change',
        trigger_config: { to_status: 'needs_attention' },
        action_type: 'notify_admins',
        action_config: { title: 'Task needs attention', body: 'An item was moved to needs_attention.', link_url: '/tasks' },
        is_active: true
      });
      await loadAutomations(activeBoardId);
    } catch (err) {
      setError(err.message || 'Unable to create automation');
    } finally {
      setCreatingAutomation(false);
    }
  };

  const handleCreateAutomation = async () => {
    if (!activeBoardId) return;
    setCreatingAutomation(true);
    setError('');
    try {
      await createTaskBoardAutomation(activeBoardId, {
        name: `${automationAction} when status -> ${automationToStatus}`,
        trigger_type: 'status_change',
        trigger_config: { to_status: automationToStatus },
        action_type: automationAction,
        action_config: { title: automationTitle, body: automationBody }
      });
      await loadAutomations(activeBoardId);
    } catch (err) {
      setError(err.message || 'Unable to create automation');
    } finally {
      setCreatingAutomation(false);
    }
  };

  const handleToggleAutomation = async (rule) => {
    if (!rule?.id) return;
    try {
      const updated = await setTaskAutomationActive(rule.id, !rule.is_active);
      setAutomations((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      setError(err.message || 'Unable to update automation');
    }
  };

  const handleDownloadCsv = async () => {
    if (!activeBoardId) return;
    setExportingCsv(true);
    setError('');
    try {
      const blob = await downloadTaskBoardCsv(activeBoardId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `board-${activeBoardId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Unable to export CSV');
    } finally {
      setExportingCsv(false);
    }
  };

  const handleCreateItem = async (groupId) => {
    const name = (newItemNameByGroup[groupId] || '').trim();
    if (!name) return;
    setCreatingItemByGroup((prev) => ({ ...prev, [groupId]: true }));
    setError('');
    try {
      await createTaskItem(groupId, { name });
      setNewItemNameByGroup((prev) => ({ ...prev, [groupId]: '' }));
      await loadBoardView(activeBoardId);
    } catch (err) {
      setError(err.message || 'Unable to create item');
    } finally {
      setCreatingItemByGroup((prev) => ({ ...prev, [groupId]: false }));
    }
  };

  const openItemDrawer = async (item) => {
    setActiveItem(item);
    setItemDrawerOpen(true);
    // keep deep link in sync
    if (activeBoardId && item?.id) {
      const next = new URLSearchParams(searchParams);
      next.set('board', activeBoardId);
      next.set('item', item.id);
      setSearchParams(next, { replace: true });
    }
    setNewUpdateText('');
    setItemUpdates([]);
    setItemUpdatesLoading(true);
    setItemFiles([]);
    setItemFilesLoading(true);
    setTimeEntries([]);
    setTimeEntriesLoading(true);
    setTimeHours(0);
    setTimeMins(0);
    setTimeBillable(true);
    setTimeCategory('Other');
    setTimeDescription('');
    setBillableHours(0);
    setBillableMins(0);
    setBillableTouched(false);
    setAiSummary(null);
    setAiSummaryMeta({ is_stale: false, latest_update_at: null });
    setAiSummaryLoading(true);
    setAssignees([]);
    setAssigneesLoading(true);
    setNewAssigneeUserId('');
    setSubitems([]);
    setSubitemsLoading(true);
    setNewSubitemName('');
    try {
      const [updates, files, times, ai, ass, subs] = await Promise.all([
        fetchTaskItemUpdates(item.id),
        fetchTaskItemFiles(item.id),
        fetchTaskItemTimeEntries(item.id),
        fetchTaskItemAiSummary(item.id),
        fetchTaskItemAssignees(item.id),
        fetchTaskItemSubitems(item.id)
      ]);
      setItemUpdates(updates);
      setItemFiles(files);
      setTimeEntries(times);
      setAiSummary(ai.summary || null);
      setAiSummaryMeta({ is_stale: Boolean(ai.is_stale), latest_update_at: ai.latest_update_at || null });
      setAssignees(ass);
      setSubitems(subs);

      // Mark updates as viewed by current user & fetch view info
      if (updates.length) {
        const updateIds = updates.map((u) => u.id);
        markUpdatesViewed(updateIds).catch(() => {}); // fire-and-forget
        fetchUpdateViews(updateIds)
          .then((views) => setUpdateViews(views))
          .catch(() => {});
      } else {
        setUpdateViews({});
      }
    } catch (err) {
      setError(err.message || 'Unable to load item updates');
    } finally {
      setItemUpdatesLoading(false);
      setItemFilesLoading(false);
      setTimeEntriesLoading(false);
      setAiSummaryLoading(false);
      setAssigneesLoading(false);
      setSubitemsLoading(false);
    }
  };

  const updateItemInline = async (itemId, patch) => {
    if (!itemId) return;
    setError('');
    // optimistic update board view
    setBoardView((prev) => {
      if (!prev?.items) return prev;
      return {
        ...prev,
        items: prev.items.map((it) =>
          it.id === itemId ? { ...it, ...patch, due_date: normalizeDateStr(patch.due_date ?? it.due_date) } : it
        )
      };
    });
    try {
      const updated = await updateTaskItem(itemId, patch);
      setBoardView((prev) => {
        if (!prev?.items) return prev;
        return {
          ...prev,
          items: prev.items.map((it) => (it.id === itemId ? { ...updated, due_date: normalizeDateStr(updated.due_date) } : it))
        };
      });
      if (activeItem?.id === itemId) setActiveItem({ ...updated, due_date: normalizeDateStr(updated.due_date) });
      if (pane === 'my-work') {
        refreshMyWork();
      }
    } catch (err) {
      setError(err.message || 'Unable to update item');
      // reload view to recover
      if (activeBoardId) loadBoardView(activeBoardId);
    }
  };

  const toggleAssigneeInline = async (itemId, userId, isCurrentlyAssigned) => {
    if (!itemId || !userId) return;
    // optimistic update
    setBoardView((prev) => {
      if (!prev) return prev;
      const existing = prev.assignees_by_item || {};
      const list = Array.isArray(existing[itemId]) ? [...existing[itemId]] : [];
      if (isCurrentlyAssigned) {
        const nextList = list.filter((a) => a.user_id !== userId);
        return { ...prev, assignees_by_item: { ...existing, [itemId]: nextList } };
      }
      const member = (workspaceMembers || []).find((m) => m.user_id === userId);
      const nextList = [
        ...list,
        {
          user_id: userId,
          email: member?.email,
          first_name: member?.first_name,
          last_name: member?.last_name,
          avatar_url: member?.avatar_url
        }
      ];
      return { ...prev, assignees_by_item: { ...existing, [itemId]: nextList } };
    });

    try {
      if (isCurrentlyAssigned) {
        await removeTaskItemAssignee(itemId, userId);
      } else {
        await addTaskItemAssignee(itemId, { user_id: userId });
      }
      // refresh assignees list in drawer if same item open
      if (activeItem?.id === itemId) {
        const ass = await fetchTaskItemAssignees(itemId);
        setAssignees(ass);
      }
      // Refresh board view so assignee chips/avatars update immediately.
      if (activeBoardId) await loadBoardView(activeBoardId);
      if (pane === 'my-work') {
        refreshMyWork();
      }
    } catch (err) {
      setError(err.message || 'Unable to update assignees');
      if (activeBoardId) loadBoardView(activeBoardId);
    }
  };

  // When an item is opened (via click or deep-link), scroll it into view and highlight it briefly.
  useEffect(() => {
    const id = activeItem?.id;
    if (!id) return;
    const el = itemCardRefs.current?.[id];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
    setHighlightedItemId(id);
    const t = setTimeout(() => setHighlightedItemId(''), 4000);
    return () => clearTimeout(t);
  }, [activeItem?.id]);

  useEffect(() => {
    const itemFromUrl = searchParams.get('item') || '';
    if (!itemFromUrl || !boardView?.items?.length) return;
    // if drawer already open for that item, no-op
    if (activeItem?.id === itemFromUrl && itemDrawerOpen) return;
    const found = boardView.items.find((it) => it.id === itemFromUrl);
    if (found) {
      openItemDrawer(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardView, searchParams]);

  const handlePostUpdate = async () => {
    if (!activeItem?.id || !newUpdateText.trim()) return;
    setPostingUpdate(true);
    setError('');
    try {
      await createTaskItemUpdate(activeItem.id, { content: newUpdateText.trim() });
      const updates = await fetchTaskItemUpdates(activeItem.id);
      setItemUpdates(updates);
      setNewUpdateText('');
      // Mark summary as stale locally; user can refresh.
      setAiSummaryMeta((prev) => ({ ...prev, is_stale: true }));
      // Refresh view tracking
      if (updates.length) {
        const updateIds = updates.map((u) => u.id);
        markUpdatesViewed(updateIds).catch(() => {});
        fetchUpdateViews(updateIds)
          .then((views) => setUpdateViews(views))
          .catch(() => {});
      }
    } catch (err) {
      setError(err.message || 'Unable to post update');
    } finally {
      setPostingUpdate(false);
    }
  };

  function getMentionStateFromText(text, caretIndex) {
    const before = String(text || '').slice(0, caretIndex);
    const at = before.lastIndexOf('@');
    if (at < 0) return { active: false };
    const afterAt = before.slice(at + 1);
    // stop if whitespace between @ and caret
    if (/\s/.test(afterAt)) return { active: false };
    return { active: true, query: afterAt, atIndex: at };
  }

  useEffect(() => {
    if (!mentionOpen || !activeWorkspaceId) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      const q = mentionQuery.trim();
      if (!q) {
        // show a few members (local) if query empty
        const local = (workspaceMembers || []).slice(0, 5);
        setMentionOptions(local);
        return;
      }
      setMentionLoading(true);
      searchTaskWorkspaceMembers(activeWorkspaceId, q)
        .then((rows) => {
          if (cancelled) return;
          setMentionOptions(rows);
        })
        .catch(() => {
          if (cancelled) return;
          // fallback local filter
          const ql = q.toLowerCase();
          const local = (workspaceMembers || []).filter((m) => {
            const name = `${m.first_name || ''} ${m.last_name || ''}`.trim().toLowerCase();
            return (m.email || '').toLowerCase().includes(ql) || name.includes(ql);
          });
          setMentionOptions(local.slice(0, 10));
        })
        .finally(() => {
          if (cancelled) return;
          setMentionLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [mentionOpen, mentionQuery, activeWorkspaceId, workspaceMembers]);

  const insertMention = (email) => {
    const el = updateInputRef.current;
    const text = newUpdateText || '';
    const caret = el?.selectionStart ?? text.length;
    const state = getMentionStateFromText(text, caret);
    if (!state.active) return;
    const before = text.slice(0, state.atIndex);
    const after = text.slice(caret);
    const next = `${before}@${email} ${after}`;
    setNewUpdateText(next);
    setMentionOpen(false);
    setMentionQuery('');
    // restore caret after insertion
    requestAnimationFrame(() => {
      if (!updateInputRef.current) return;
      const pos = (before + `@${email} `).length;
      updateInputRef.current.focus();
      updateInputRef.current.setSelectionRange(pos, pos);
    });
  };

  const handleRefreshAiSummary = async () => {
    if (!activeItem?.id) return;
    setAiSummaryRefreshing(true);
    setError('');
    try {
      const summary = await refreshTaskItemAiSummary(activeItem.id);
      setAiSummary(summary);
      setAiSummaryMeta((prev) => ({ ...prev, is_stale: false }));
    } catch (err) {
      setError(err.message || 'Unable to refresh AI summary');
    } finally {
      setAiSummaryRefreshing(false);
    }
  };

  const handleAddAssignee = async () => {
    if (!activeItem?.id || !newAssigneeUserId) return;
    setAddingAssignee(true);
    setError('');
    try {
      const assignee = await addTaskItemAssignee(activeItem.id, { user_id: newAssigneeUserId });
      if (assignee?.user_id) {
        setAssignees((prev) => {
          const exists = prev.some((a) => a.user_id === assignee.user_id);
          return exists ? prev : [...prev, assignee];
        });
      }
      setNewAssigneeUserId('');
    } catch (err) {
      setError(err.message || 'Unable to add assignee');
    } finally {
      setAddingAssignee(false);
    }
  };

  const handleRemoveAssignee = async (assigneeUserId) => {
    if (!activeItem?.id || !assigneeUserId) return;
    setError('');
    try {
      await removeTaskItemAssignee(activeItem.id, assigneeUserId);
      setAssignees((prev) => prev.filter((a) => a.user_id !== assigneeUserId));
    } catch (err) {
      setError(err.message || 'Unable to remove assignee');
    }
  };

  const handleCreateSubitem = async () => {
    if (!activeItem?.id || !newSubitemName.trim()) return;
    setCreatingSubitem(true);
    setError('');
    try {
      const sub = await createTaskSubitem(activeItem.id, { name: newSubitemName.trim() });
      setSubitems((prev) => [sub, ...prev]);
      setNewSubitemName('');
    } catch (err) {
      setError(err.message || 'Unable to create subitem');
    } finally {
      setCreatingSubitem(false);
    }
  };

  const handleToggleSubitemDone = async (sub) => {
    if (!sub?.id) return;
    setError('');
    try {
      const nextStatus = sub.status === 'done' ? 'todo' : 'done';
      const updated = await updateTaskSubitem(sub.id, { status: nextStatus });
      setSubitems((prev) => prev.map((s) => (s.id === sub.id ? updated : s)));
    } catch (err) {
      setError(err.message || 'Unable to update subitem');
    }
  };

  const handleDeleteSubitem = async (subitemId) => {
    if (!subitemId) return;
    setError('');
    try {
      await deleteTaskSubitem(subitemId);
      setSubitems((prev) => prev.filter((s) => s.id !== subitemId));
    } catch (err) {
      setError(err.message || 'Unable to delete subitem');
    }
  };

  const handleUploadFile = async (file) => {
    if (!activeItem?.id || !file) return;
    setUploadingFile(true);
    setError('');
    try {
      await uploadTaskItemFile(activeItem.id, file);
      const files = await fetchTaskItemFiles(activeItem.id);
      setItemFiles(files);
    } catch (err) {
      setError(err.message || 'Unable to upload file');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleLogTime = async () => {
    if (!activeItem?.id) return;
    const dur = normalizeHm({ hours: timeHours, minutes: timeMins });
    const minutes = dur.hours * 60 + dur.minutes;
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    setLoggingTime(true);
    setError('');
    try {
      const payload = {
        time_spent_minutes: minutes,
        is_billable: timeBillable,
        work_category: timeCategory,
        description: timeDescription || ''
      };
      if (timeBillable) {
        const bdur = billableTouched ? normalizeHm({ hours: billableHours, minutes: billableMins }) : dur;
        let billableMinutes = bdur.hours * 60 + bdur.minutes;
        if (!Number.isFinite(billableMinutes) || billableMinutes < 0) billableMinutes = minutes;
        // Billable minutes cannot exceed total duration
        billableMinutes = Math.min(minutes, billableMinutes);
        payload.billable_minutes = billableMinutes;
      }
      await createTaskItemTimeEntry(activeItem.id, payload);
      const times = await fetchTaskItemTimeEntries(activeItem.id);
      setTimeEntries(times);
      // Refresh board view so time_totals_by_item updates in the grid immediately.
      if (activeBoardId) await loadBoardView(activeBoardId);
      setTimeHours(0);
      setTimeMins(0);
      setTimeDescription('');
      setBillableHours(0);
      setBillableMins(0);
      setBillableTouched(false);
    } catch (err) {
      setError(err.message || 'Unable to log time');
    } finally {
      setLoggingTime(false);
    }
  };

  const itemsByGroup = useMemo(() => {
    const map = {};
    const items = (boardView?.items || []).filter((it) => {
      if (!boardSearch.trim()) return true;
      return String(it.name || '')
        .toLowerCase()
        .includes(boardSearch.trim().toLowerCase());
    });
    for (const it of items) {
      if (!map[it.group_id]) map[it.group_id] = [];
      map[it.group_id].push(it);
    }
    return map;
  }, [boardView, boardSearch]);

  const renderContent = () => {
    if (pane === 'home') return <HomePane />;

    if (pane === 'automations') return <AutomationsPane />;

    if (pane === 'billing') return <BillingPane />;

    if (pane === 'my-work')
      return (
        <MyWorkPane
          loading={myWorkLoading}
          groups={myWorkGroups}
          itemsByGroup={myWorkItemsByGroup}
          assigneesByItem={myWorkAssigneesByItem}
          updateCountsByItem={myWorkUpdateCounts}
          timeTotalsByItem={myWorkTimeTotals}
          workspaceMembers={myWorkMembers}
          onUpdateItem={updateItemInline}
          onToggleAssignee={toggleAssigneeInline}
          onClickItem={(it, tab) => {
            if (tab) setDrawerTab(tab);
            openItemDrawer(it);
          }}
        />
      );

    // Boards pane
    return (
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, minHeight: 420 }}>
        <Stack spacing={1.5}>
          {!activeBoardId && (
            <Stack spacing={1}>
              <Typography variant="h6">Boards</Typography>
              {workspaceBoardsLoading && <CircularProgress size={18} />}
              {!workspaceBoardsLoading && workspaceBoards.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  Select a workspace to see its boards.
                </Typography>
              )}
              <Stack spacing={0.5}>
                {workspaceBoards.map((b) => (
                  <Button
                    key={b.id}
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.set('workspace', b.workspace_id);
                      next.set('board', b.id);
                      setSearchParams(next, { replace: true });
                    }}
                    variant="outlined"
                    sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                  >
                    {b.name}
                  </Button>
                ))}
              </Stack>
            </Stack>
          )}

          {activeBoardId && (
            <Stack spacing={1}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <TextField
                  fullWidth
                  size="small"
                  label="New group"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                />
                <Button variant="contained" onClick={handleCreateGroup} disabled={creatingGroup || !newGroupName.trim()}>
                  Create group
                </Button>
              </Stack>

              <Divider />

              <BoardTable
                groups={boardView?.groups || []}
                itemsByGroup={itemsByGroup}
                assigneesByItem={boardView?.assignees_by_item || {}}
                workspaceMembers={workspaceMembers}
                updateCountsByItem={boardView?.update_counts_by_item || {}}
                timeTotalsByItem={boardView?.time_totals_by_item || {}}
                statusLabels={statusLabels}
                highlightedItemId={highlightedItemId}
                onUpdateItem={updateItemInline}
                onToggleAssignee={toggleAssigneeInline}
                newItemNameByGroup={newItemNameByGroup}
                creatingItemByGroup={creatingItemByGroup}
                onChangeNewItemName={(groupId, val) =>
                  setNewItemNameByGroup((prev) => ({
                    ...prev,
                    [groupId]: val
                  }))
                }
                onCreateItem={handleCreateItem}
                onClickItem={(it, tab) => {
                  if (tab) setDrawerTab(tab);
                  openItemDrawer(it);
                }}
              />
            </Stack>
          )}
        </Stack>
      </Box>
    );
  };

  return (
    <MainCard title="Task Manager">
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        {pane === 'boards' && activeBoardId && (
          <BoardHeader
            board={boardView?.board}
            view={boardViewType}
            onChangeView={setBoardViewType}
            search={boardSearch}
            onChangeSearch={setBoardSearch}
            onOpenAutomations={(e) => {
              if (!activeBoardId) return;
              setAutomationsAnchorEl(e?.currentTarget || null);
            }}
            onOpenBoardMenu={() => {}}
            onUpdateBoard={async (patch) => {
              if (!boardView?.board?.id) return;
              try {
                const updated = await updateTaskBoard(boardView.board.id, patch);
                setBoardView((prev) => (prev ? { ...prev, board: updated } : prev));
              } catch (err) {
                setError(err.message || 'Unable to update board');
              }
            }}
          />
        )}
        {renderContent()}

        <Popper open={Boolean(automationsAnchorEl)} anchorEl={automationsAnchorEl} placement="bottom-end" sx={{ zIndex: 2000 }}>
          <Paper sx={{ p: 1.5, width: 420 }}>
            <Stack spacing={1.25}>
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                <Typography variant="subtitle1">Automations</Typography>
                <Button size="small" variant="text" onClick={() => setAutomationsAnchorEl(null)}>
                  Close
                </Button>
              </Stack>

              {automationsLoading ? (
                <CircularProgress size={18} />
              ) : (
                <Stack spacing={0.75}>
                  {!automations.length && (
                    <Typography variant="body2" color="text.secondary">
                      No automations yet.
                    </Typography>
                  )}
                  {automations.slice(0, 8).map((r) => (
                    <Box
                      key={r.id}
                      sx={{
                        p: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 2,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <Stack>
                        <Typography variant="body2">{r.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {r.trigger_type} → {r.action_type} {r.is_active ? '(active)' : '(inactive)'}
                        </Typography>
                      </Stack>
                      <Button size="small" variant="outlined" onClick={() => handleToggleAutomation(r)}>
                        {r.is_active ? 'Disable' : 'Enable'}
                      </Button>
                    </Box>
                  ))}
                </Stack>
              )}

              <Button variant="outlined" onClick={handleAddNeedsAttentionAutomation} disabled={creatingAutomation || !activeBoardId}>
                {creatingAutomation ? 'Adding…' : 'Add “Needs Attention” automation'}
              </Button>

              <Divider />

              <Typography variant="subtitle2">Create automation</Typography>
              <Select size="small" value={automationToStatus} onChange={(e) => setAutomationToStatus(e.target.value)}>
                {statusLabels.map((sl) => (
                  <MenuItem key={sl.id} value={sl.label}>
                    {sl.label}
                  </MenuItem>
                ))}
              </Select>
              <Select size="small" value={automationAction} onChange={(e) => setAutomationAction(e.target.value)}>
                <MenuItem value="notify_admins">Notify admins</MenuItem>
                <MenuItem value="notify_assignees">Notify assignees</MenuItem>
              </Select>
              <TextField
                size="small"
                label="Notification title"
                value={automationTitle}
                onChange={(e) => setAutomationTitle(e.target.value)}
              />
              <TextField
                size="small"
                label="Notification body"
                value={automationBody}
                onChange={(e) => setAutomationBody(e.target.value)}
              />
              <Button variant="contained" onClick={handleCreateAutomation} disabled={creatingAutomation || !activeBoardId}>
                {creatingAutomation ? 'Creating…' : 'Create automation'}
              </Button>
            </Stack>
          </Paper>
        </Popper>
      </Stack>

      <Drawer anchor="right" open={itemDrawerOpen} onClose={closeItemDrawer} PaperProps={{ sx: { width: { xs: '100%', sm: 420 } } }}>
        <Box sx={{ p: 2 }}>
          <Stack spacing={1.5}>
            <Typography variant="h3">{activeItem?.name || 'Item'}</Typography>
            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary">
                Status
              </Typography>
              <Select
                size="small"
                value={activeItem?.status || 'To Do'}
                onChange={(e) => updateItemField({ status: e.target.value })}
                sx={{
                  width: '100%',
                  '& .MuiSelect-select': { py: 0.5 },
                  ...(activeItem?.status
                    ? {
                        bgcolor: getStatusColor(activeItem.status, statusLabels).bg,
                        // MUI Select renders text/icon inside nested elements; set them explicitly.
                        color: getStatusColor(activeItem.status, statusLabels).fg,
                        '& .MuiSelect-select': { color: getStatusColor(activeItem.status, statusLabels).fg, py: 0.5 },
                        '& .MuiSvgIcon-root': { color: getStatusColor(activeItem.status, statusLabels).fg },
                        borderRadius: 999,
                        '.MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' }
                      }
                    : {})
                }}
              >
                {statusLabels.map((sl) => (
                  <MenuItem key={sl.id} value={sl.label}>
                    <Box
                      component="span"
                      sx={{
                        display: 'inline-block',
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: sl.color,
                        mr: 1
                      }}
                    />
                    {sl.label}
                  </MenuItem>
                ))}
              </Select>
              {isAdmin && (
                <Button
                  size="small"
                  startIcon={<IconPencil size={14} />}
                  onClick={() => setStatusLabelsDialogOpen(true)}
                  sx={{ mt: 0.5, alignSelf: 'flex-start' }}
                >
                  Edit Labels
                </Button>
              )}
            </Stack>

            <Divider />

            <Tabs value={drawerTab} onChange={(_e, v) => setDrawerTab(v)}>
              <Tab value="updates" label="Updates" />
              <Tab value="files" label="Files" />
              <Tab value="time" label="Time Tracking" />
            </Tabs>

            {drawerTab === 'updates' && (
              <Stack spacing={1}>
                <Stack spacing={1}>
                  <TextField
                    multiline
                    minRows={3}
                    label="Post an update"
                    helperText="Tip: mention a teammate with @email (e.g. @alex@anchorcorps.com) to notify them."
                    value={newUpdateText}
                    inputRef={updateInputRef}
                    onChange={(e) => {
                      const next = e.target.value;
                      setNewUpdateText(next);
                      const caret = e.target.selectionStart ?? next.length;
                      const state = getMentionStateFromText(next, caret);
                      if (state.active) {
                        setMentionOpen(true);
                        setMentionQuery(state.query || '');
                      } else {
                        setMentionOpen(false);
                        setMentionQuery('');
                      }
                    }}
                    onBlur={() => {
                      // allow click selection by delaying close
                      setTimeout(() => setMentionOpen(false), 150);
                    }}
                  />
                  <Popper
                    open={mentionOpen}
                    anchorEl={updateInputRef.current}
                    placement="bottom-start"
                    sx={{ zIndex: 1500, width: updateInputRef.current?.clientWidth || 360 }}
                  >
                    <Paper sx={{ mt: 0.5, maxHeight: 220, overflow: 'auto' }}>
                      {mentionLoading ? (
                        <Box sx={{ p: 1.25 }}>
                          <CircularProgress size={18} />
                        </Box>
                      ) : (
                        <List dense disablePadding>
                          {mentionOptions.length === 0 && (
                            <ListItemText
                              primary={
                                <Typography variant="body2" color="text.secondary">
                                  No matches
                                </Typography>
                              }
                              sx={{ px: 1.5, py: 1 }}
                            />
                          )}
                          {mentionOptions.slice(0, 10).map((m) => {
                            const name = `${m.first_name || ''} ${m.last_name || ''}`.trim();
                            const primary = m.email || m.user_id;
                            const secondary = name ? `${name}${m.user_role ? ` • ${m.user_role}` : ''}` : m.user_role || '';
                            return (
                              <ListItemButton
                                key={m.user_id}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => insertMention(primary)}
                              >
                                <ListItemText primary={primary} secondary={secondary} />
                              </ListItemButton>
                            );
                          })}
                        </List>
                      )}
                    </Paper>
                  </Popper>
                  <Button
                    variant="contained"
                    onClick={handlePostUpdate}
                    disabled={postingUpdate || !newUpdateText.trim() || !activeItem?.id}
                  >
                    Post update
                  </Button>
                </Stack>

                <Typography variant="subtitle2">Feed</Typography>
                {itemUpdatesLoading ? (
                  <CircularProgress size={18} />
                ) : (
                  <Stack spacing={1}>
                    {itemUpdates.length === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        No updates yet.
                      </Typography>
                    )}
                    {itemUpdates.map((u) => {
                      const viewers = updateViews[u.id] || [];
                      return (
                        <Box key={u.id} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                            <Stack>
                              <Typography variant="caption" color="text.secondary">
                                {u.author_name || 'Unknown'}
                                {u.created_at && (
                                  <span style={{ marginLeft: 8, opacity: 0.7 }}>
                                    {new Date(u.created_at).toLocaleString(undefined, {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                )}
                              </Typography>
                              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                {u.content}
                              </Typography>
                            </Stack>
                            {viewers.length > 0 && (
                              <Tooltip
                                title={
                                  <Stack spacing={0.5} sx={{ p: 0.5 }}>
                                    <Typography variant="caption" fontWeight={600}>
                                      Seen by {viewers.length}
                                    </Typography>
                                    {viewers.map((v) => (
                                      <Stack key={v.user_id} direction="row" spacing={1} alignItems="center">
                                        <Avatar src={v.avatar_url} sx={{ width: 20, height: 20, fontSize: 10 }}>
                                          {(v.user_name || '?')[0]}
                                        </Avatar>
                                        <Typography variant="caption">{v.user_name}</Typography>
                                      </Stack>
                                    ))}
                                  </Stack>
                                }
                                placement="left"
                                arrow
                              >
                                <IconButton size="small" sx={{ p: 0.25 }}>
                                  <IconEye size={14} />
                                  <Typography variant="caption" sx={{ ml: 0.5, fontSize: '0.7rem' }}>
                                    {viewers.length}
                                  </Typography>
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </Stack>
            )}

            {drawerTab === 'files' && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">Files</Typography>
                {itemFilesLoading ? (
                  <CircularProgress size={18} />
                ) : (
                  <Stack spacing={1}>
                    {!itemFiles.length && (
                      <Typography variant="body2" color="text.secondary">
                        No files yet.
                      </Typography>
                    )}
                    {itemFiles.map((f) => (
                      <Box key={f.id} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                        <Typography variant="body2">{f.file_name || 'File'}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {f.uploaded_by_name || 'Unknown'}
                        </Typography>
                        <Box sx={{ mt: 0.5 }}>
                          <Button size="small" variant="outlined" component="a" href={f.file_url} target="_blank" rel="noreferrer">
                            Open
                          </Button>
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                )}

                <Button variant="outlined" component="label" disabled={!activeItem?.id || uploadingFile}>
                  {uploadingFile ? 'Uploading…' : 'Upload file'}
                  <input
                    type="file"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) handleUploadFile(file);
                    }}
                  />
                </Button>
              </Stack>
            )}

            {drawerTab === 'time' && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">Time entries</Typography>
                {timeEntriesLoading ? (
                  <CircularProgress size={18} />
                ) : (
                  <Stack spacing={1}>
                    {!timeEntries.length && (
                      <Typography variant="body2" color="text.secondary">
                        No time entries yet.
                      </Typography>
                    )}
                    {timeEntries.map((t) => (
                      <Box key={t.id} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                        <Typography variant="body2">
                          {t.time_spent_minutes}m{t.is_billable ? ` (billable ${t.billable_minutes}m)` : ' (non-billable)'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t.user_name || 'Unknown'}
                          {t.work_category ? ` • ${t.work_category}` : ''}
                        </Typography>
                        {t.description ? (
                          <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                            {t.description}
                          </Typography>
                        ) : null}
                      </Box>
                    ))}
                  </Stack>
                )}

                <Stack spacing={1}>
                  <Select size="small" value={timeCategory} onChange={(e) => setTimeCategory(e.target.value)}>
                    <MenuItem value="Graphics">Graphics</MenuItem>
                    <MenuItem value="Web">Web</MenuItem>
                    <MenuItem value="Project Management">Project Management</MenuItem>
                    <MenuItem value="Other">Other</MenuItem>
                  </Select>
                  <Select
                    size="small"
                    value={timeBillable ? 'billable' : 'non_billable'}
                    onChange={(e) => setTimeBillable(e.target.value === 'billable')}
                  >
                    <MenuItem value="billable">Billable</MenuItem>
                    <MenuItem value="non_billable">Non-billable</MenuItem>
                  </Select>

                  <Stack spacing={0.75}>
                    <Typography variant="caption" color="text.secondary">
                      Duration
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <TextField
                        label="Hours"
                        type="number"
                        value={timeHours}
                        onChange={(e) => {
                          const next = normalizeHm({ hours: e.target.value, minutes: timeMins });
                          setTimeHours(next.hours);
                          setTimeMins(next.minutes);
                        }}
                        inputProps={{ min: 0 }}
                        sx={{ flex: 1 }}
                      />
                      <TextField
                        label="Minutes"
                        type="number"
                        value={timeMins}
                        onChange={(e) => {
                          const next = normalizeHm({ hours: timeHours, minutes: e.target.value });
                          setTimeHours(next.hours);
                          setTimeMins(next.minutes);
                        }}
                        inputProps={{ min: 0, step: 15 }}
                        sx={{ flex: 1 }}
                      />
                    </Stack>
                  </Stack>

                  {timeBillable && (
                    <Stack spacing={0.75}>
                      <Typography variant="caption" color="text.secondary">
                        Billable hours
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        <TextField
                          label="Hours"
                          type="number"
                          value={billableHours}
                          onChange={(e) => {
                            setBillableTouched(true);
                            setBillableHours(clampNonNegInt(e.target.value));
                          }}
                          inputProps={{ min: 0 }}
                          sx={{ flex: 1 }}
                        />
                        <TextField
                          label="Minutes"
                          type="number"
                          value={billableMins}
                          onChange={(e) => {
                            setBillableTouched(true);
                            const next = normalizeHm({ hours: billableHours, minutes: e.target.value });
                            setBillableHours(next.hours);
                            setBillableMins(next.minutes);
                          }}
                          inputProps={{ min: 0, step: 15 }}
                          sx={{ flex: 1 }}
                        />
                      </Stack>
                    </Stack>
                  )}

                  <TextField
                    multiline
                    minRows={2}
                    label="Description (optional)"
                    value={timeDescription}
                    onChange={(e) => setTimeDescription(e.target.value)}
                  />
                  <Button
                    variant="contained"
                    onClick={handleLogTime}
                    disabled={loggingTime || !activeItem?.id || Number(timeHours) * 60 + Number(timeMins) <= 0}
                  >
                    {loggingTime ? 'Logging…' : 'Log time'}
                  </Button>
                </Stack>
              </Stack>
            )}
          </Stack>
        </Box>
      </Drawer>

      {/* Status Labels Editor Dialog */}
      <Dialog open={statusLabelsDialogOpen} onClose={() => setStatusLabelsDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Edit Status Labels
          <Typography variant="body2" color="text.secondary">
            Customize status options for this board
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {/* Check if using defaults */}
            {statusLabels.some((l) => l.id?.toString().startsWith('default-')) && (
              <Alert
                severity="info"
                action={
                  <Button size="small" onClick={handleInitializeLabels} disabled={savingLabel}>
                    Customize
                  </Button>
                }
              >
                This board uses default status labels. Click &quot;Customize&quot; to create editable copies.
              </Alert>
            )}

            {/* Existing labels */}
            {statusLabels.map((sl) => (
              <Box
                key={sl.id}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
              >
                {editingLabel === sl.id ? (
                  <>
                    <input
                      type="color"
                      value={sl.color}
                      onChange={(e) => {
                        setBoardView((prev) => ({
                          ...prev,
                          status_labels: prev.status_labels.map((l) => (l.id === sl.id ? { ...l, color: e.target.value } : l))
                        }));
                      }}
                      style={{ width: 32, height: 32, border: 'none', cursor: 'pointer' }}
                    />
                    <TextField
                      size="small"
                      value={sl.label}
                      onChange={(e) => {
                        setBoardView((prev) => ({
                          ...prev,
                          status_labels: prev.status_labels.map((l) => (l.id === sl.id ? { ...l, label: e.target.value } : l))
                        }));
                      }}
                      sx={{ flex: 1 }}
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={sl.is_done_state}
                          onChange={(e) => {
                            setBoardView((prev) => ({
                              ...prev,
                              status_labels: prev.status_labels.map((l) => (l.id === sl.id ? { ...l, is_done_state: e.target.checked } : l))
                            }));
                          }}
                          size="small"
                        />
                      }
                      label="Done state"
                    />
                    <Button
                      size="small"
                      onClick={() => handleUpdateLabel(sl.id, { label: sl.label, color: sl.color, is_done_state: sl.is_done_state })}
                      disabled={savingLabel || sl.id?.toString().startsWith('default-')}
                    >
                      Save
                    </Button>
                    <IconButton size="small" onClick={() => setEditingLabel(null)}>
                      ✕
                    </IconButton>
                  </>
                ) : (
                  <>
                    <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: sl.color }} />
                    <Typography sx={{ flex: 1 }}>{sl.label}</Typography>
                    {sl.is_done_state && (
                      <Typography variant="caption" color="text.secondary">
                        (marks complete)
                      </Typography>
                    )}
                    <IconButton size="small" onClick={() => setEditingLabel(sl.id)} disabled={sl.id?.toString().startsWith('default-')}>
                      <IconPencil size={16} />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteLabel(sl.id)}
                      disabled={savingLabel || sl.id?.toString().startsWith('default-')}
                    >
                      <IconTrash size={16} />
                    </IconButton>
                  </>
                )}
              </Box>
            ))}

            {/* Add new label */}
            {!statusLabels.some((l) => l.id?.toString().startsWith('default-')) && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                <input
                  type="color"
                  value={newLabelColor}
                  onChange={(e) => setNewLabelColor(e.target.value)}
                  style={{ width: 32, height: 32, border: 'none', cursor: 'pointer' }}
                />
                <TextField
                  size="small"
                  placeholder="New label name"
                  value={newLabelText}
                  onChange={(e) => setNewLabelText(e.target.value)}
                  sx={{ flex: 1 }}
                />
                <Button
                  size="small"
                  startIcon={<IconPlus size={14} />}
                  onClick={handleAddLabel}
                  disabled={savingLabel || !newLabelText.trim()}
                >
                  Add
                </Button>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusLabelsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </MainCard>
  );
}
