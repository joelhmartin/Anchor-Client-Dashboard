import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  Drawer,
  FormControlLabel,
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
  Typography
} from '@mui/material';

import MainCard from 'ui-component/cards/MainCard';
import useAuth from 'hooks/useAuth';
import BoardHeader from './components/BoardHeader';
import BoardTable from './components/BoardTable';
import HomePane from './panes/HomePane';
import MyWorkPane from './panes/MyWorkPane';
import ReportsPane from './panes/ReportsPane';
import AutomationsPane from './panes/AutomationsPane';
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
  fetchMyWork
} from 'api/tasks';

function getEffectiveRole(user) {
  return user?.effective_role || user?.role;
}

export default function TaskManager() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawPane = searchParams.get('pane') || 'home';
  const pane = ['home', 'boards', 'reports', 'my-work', 'automations'].includes(rawPane) ? rawPane : 'home';
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
  const [automationToStatus, setAutomationToStatus] = useState('needs_attention');
  const [automationAction, setAutomationAction] = useState('notify_admins');
  const [automationTitle, setAutomationTitle] = useState('Task needs attention');
  const [automationBody, setAutomationBody] = useState('An item was moved to needs_attention.');
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
  const [itemFiles, setItemFiles] = useState([]);
  const [itemFilesLoading, setItemFilesLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [timeEntries, setTimeEntries] = useState([]);
  const [timeEntriesLoading, setTimeEntriesLoading] = useState(false);
  const [loggingTime, setLoggingTime] = useState(false);
  const [timeMinutes, setTimeMinutes] = useState('');
  const [timeBillable, setTimeBillable] = useState(true);
  const [timeCategory, setTimeCategory] = useState('Other');
  const [timeDescription, setTimeDescription] = useState('');
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

  // Close overlays when pane changes to avoid blocking navigation (e.g., reports)
  useEffect(() => {
    setAutomationsAnchorEl(null);
  }, [pane]);

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
      setBoardView(data);
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoardId, pane]);

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
    fetchMyWork()
      .then((rows) => setMyWorkBoards(rows))
      .catch(() => setMyWorkBoards([]))
      .finally(() => setMyWorkLoading(false));
  }, [pane]);

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
    setTimeMinutes('');
    setTimeBillable(true);
    setTimeCategory('Other');
    setTimeDescription('');
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
      return { ...prev, items: prev.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) };
    });
    try {
      const updated = await updateTaskItem(itemId, patch);
      setBoardView((prev) => {
        if (!prev?.items) return prev;
        return { ...prev, items: prev.items.map((it) => (it.id === itemId ? updated : it)) };
      });
      if (activeItem?.id === itemId) setActiveItem(updated);
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
    const minutes = Number(timeMinutes);
    if (!Number.isFinite(minutes) || minutes < 0) return;
    setLoggingTime(true);
    setError('');
    try {
      await createTaskItemTimeEntry(activeItem.id, {
        time_spent_minutes: minutes,
        is_billable: timeBillable,
        work_category: timeCategory,
        description: timeDescription || ''
      });
      const times = await fetchTaskItemTimeEntries(activeItem.id);
      setTimeEntries(times);
      setTimeMinutes('');
      setTimeDescription('');
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

    if (pane === 'my-work') return <MyWorkPane boards={myWorkBoards} loading={myWorkLoading} />;

    if (pane === 'reports') {
      return (
        <ReportsPane
          reportBoardQuery={reportBoardQuery}
          setReportBoardQuery={setReportBoardQuery}
          reportStartInput={reportStartInput}
          setReportStartInput={setReportStartInput}
          reportEndInput={reportEndInput}
          setReportEndInput={setReportEndInput}
          filteredReportBoards={filteredReportBoards}
          selectedReportBoards={selectedReportBoards}
          toggleReportBoard={toggleReportBoard}
          toggleAllReportBoards={toggleAllReportBoards}
          allBoardsLoading={allBoardsLoading}
          handleRunReport={handleRunReport}
          reportLoading={reportLoading}
          reportRows={reportRows}
          handleExportReportCsv={handleExportReportCsv}
        />
      );
    }

    // Boards pane
    return (
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, minHeight: 420 }}>
        <Stack spacing={1.5}>
          {!activeBoardId && (
            <Typography variant="body2" color="text.secondary">
              Select a board from the left sidebar to view its groups and items.
            </Typography>
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
                highlightedItemId={highlightedItemId}
                onUpdateItem={updateItemInline}
                onToggleAssignee={toggleAssigneeInline}
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
        {pane !== 'reports' && pane !== 'my-work' && pane !== 'home' && (
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
                <MenuItem value="todo">Todo</MenuItem>
                <MenuItem value="working">Working</MenuItem>
                <MenuItem value="blocked">Blocked</MenuItem>
                <MenuItem value="done">Done</MenuItem>
                <MenuItem value="needs_attention">Needs Attention</MenuItem>
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
        {pane === 'reports' ? (
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, minHeight: 420 }}>
            <Stack spacing={1.5}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                alignItems={{ xs: 'stretch', sm: 'center' }}
                justifyContent="space-between"
              >
                <Stack spacing={0.25}>
                  <Typography variant="h6">Select boards</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Choose boards and date range, then run the report.
                  </Typography>
                </Stack>
                {reportLoading && <CircularProgress size={18} />}
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  size="small"
                  placeholder="Search boards..."
                  value={reportBoardQuery}
                  onChange={(e) => setReportBoardQuery(e.target.value)}
                  sx={{ minWidth: 220 }}
                />
                <TextField
                  size="small"
                  label="Start"
                  type="date"
                  value={reportStartInput}
                  onChange={(e) => setReportStartInput(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  size="small"
                  label="End"
                  type="date"
                  value={reportEndInput}
                  onChange={(e) => setReportEndInput(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <Button
                  variant="contained"
                  disableElevation
                  onClick={handleRunReport}
                  disabled={selectedReportBoards.size === 0 || reportLoading}
                >
                  {reportLoading ? 'Running…' : 'Run report'}
                </Button>
              </Stack>

              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                <Box
                  sx={{
                    p: 1,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    bgcolor: 'grey.50'
                  }}
                >
                  <Checkbox
                    size="small"
                    checked={filteredReportBoards.length > 0 && filteredReportBoards.every((b) => selectedReportBoards.has(b.id))}
                    indeterminate={
                      filteredReportBoards.some((b) => selectedReportBoards.has(b.id)) &&
                      !filteredReportBoards.every((b) => selectedReportBoards.has(b.id))
                    }
                    onChange={toggleAllReportBoards}
                    disabled={allBoardsLoading}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Boards ({selectedReportBoards.size})
                  </Typography>
                  {allBoardsLoading && <CircularProgress size={14} />}
                </Box>
                <Box sx={{ maxHeight: 320, overflow: 'auto' }}>
                  {filteredReportBoards.map((b) => (
                    <Box
                      key={b.id}
                      sx={{
                        p: 1,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1
                      }}
                    >
                      <Checkbox
                        size="small"
                        checked={selectedReportBoards.has(b.id)}
                        onChange={() => toggleReportBoard(b.id)}
                        disabled={allBoardsLoading}
                      />
                      <Stack sx={{ minWidth: 0 }}>
                        <Typography variant="body2" noWrap>
                          {b.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {b.workspace_name || ''}
                        </Typography>
                      </Stack>
                    </Box>
                  ))}
                  {!filteredReportBoards.length && !allBoardsLoading && (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                      No boards found.
                    </Typography>
                  )}
                </Box>
              </Box>

              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'auto' }}>
                <Box sx={{ minWidth: 980 }}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    justifyContent="space-between"
                    sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}
                  >
                    <Typography variant="subtitle1">Report preview</Typography>
                    {reportRows.length > 0 && (
                      <Button size="small" variant="outlined" onClick={handleExportReportCsv}>
                        Export to CSV
                      </Button>
                    )}
                  </Stack>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '260px 260px 90px 90px 90px 90px 90px 140px 140px 140px',
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.default'
                    }}
                  >
                    {[
                      'Workspace',
                      'Board',
                      'Total',
                      'Todo',
                      'Working',
                      'Blocked',
                      'Done',
                      'Updates (range)',
                      'Time (min)',
                      'Updated (range)'
                    ].map((h) => (
                      <Box key={h} sx={{ p: 1, fontWeight: 800, fontSize: '0.85rem', borderRight: '1px solid', borderColor: 'divider' }}>
                        {h}
                      </Box>
                    ))}
                  </Box>
                  {reportRows.map((r) => (
                    <Box
                      key={r.board_id}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: '260px 260px 90px 90px 90px 90px 90px 140px 140px 140px',
                        borderBottom: '1px solid',
                        borderColor: 'divider'
                      }}
                    >
                      <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }}>{r.workspace_name}</Box>
                      <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }}>{r.board_name}</Box>
                      <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }}>{r.total_items || 0}</Box>
                      <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }}>{r.todo || 0}</Box>
                      <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }}>{r.working || 0}</Box>
                      <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }}>{r.blocked || 0}</Box>
                      <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }}>{r.done || 0}</Box>
                      <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }}>{r.updates_in_range || 0}</Box>
                      <Box sx={{ p: 1, borderRight: '1px solid', borderColor: 'divider' }}>{r.time_minutes_in_range || 0}</Box>
                      <Box sx={{ p: 1 }}>{r.items_updated_in_range || 0}</Box>
                    </Box>
                  ))}
                  {!reportRows.length && !reportLoading && (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                      Run a report to see preview results.
                    </Typography>
                  )}
                  {reportLoading && (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                      Running report…
                    </Typography>
                  )}
                </Box>
              </Box>
            </Stack>
          </Box>
        ) : (
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, minHeight: 420 }}>
            <Stack spacing={1.5}>
              {!activeBoardId && (
                <Typography variant="body2" color="text.secondary">
                  Select a board from the left sidebar to view its groups and items.
                </Typography>
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
                    highlightedItemId={highlightedItemId}
                    onUpdateItem={updateItemInline}
                    onToggleAssignee={toggleAssigneeInline}
                    onClickItem={(it, tab) => {
                      if (tab) setDrawerTab(tab);
                      openItemDrawer(it);
                    }}
                  />
                </Stack>
              )}
            </Stack>
          </Box>
        )}
      </Stack>

      <Drawer
        anchor="right"
        open={itemDrawerOpen}
        onClose={() => setItemDrawerOpen(false)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 420 } } }}
      >
        <Box sx={{ p: 2 }}>
          <Stack spacing={1.5}>
            <Typography variant="h6">{activeItem?.name || 'Item'}</Typography>
            <Typography variant="caption" color="text.secondary">
              Status: {activeItem?.status || '-'}
            </Typography>
            <Divider />

            <Typography variant="subtitle1">Fields</Typography>
            <Stack spacing={1}>
              <Select size="small" value={activeItem?.status || 'todo'} onChange={(e) => updateItemField({ status: e.target.value })}>
                <MenuItem value="todo">Todo</MenuItem>
                <MenuItem value="working">Working</MenuItem>
                <MenuItem value="blocked">Blocked</MenuItem>
                <MenuItem value="done">Done</MenuItem>
                <MenuItem value="needs_attention">Needs Attention</MenuItem>
              </Select>
              <TextField
                label="Due date"
                type="date"
                value={activeItem?.due_date || ''}
                onChange={(e) => updateItemField({ due_date: e.target.value || null })}
                InputLabelProps={{ shrink: true }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={Boolean(activeItem?.is_voicemail)}
                    onChange={(e) => updateItemField({ is_voicemail: e.target.checked })}
                  />
                }
                label="Voicemail"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={Boolean(activeItem?.needs_attention)}
                    onChange={(e) => updateItemField({ needs_attention: e.target.checked })}
                  />
                }
                label="Needs attention (flag)"
              />
            </Stack>

            <Divider />

            <Typography variant="subtitle1">Assignees</Typography>
            {assigneesLoading ? (
              <CircularProgress size={18} />
            ) : (
              <Stack spacing={1}>
                {!assignees.length && (
                  <Typography variant="body2" color="text.secondary">
                    No assignees yet.
                  </Typography>
                )}
                {assignees.map((a) => {
                  const name = `${a.first_name || ''} ${a.last_name || ''}`.trim();
                  const display = name || a.email || a.user_id;
                  return (
                    <Box
                      key={a.user_id}
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
                          {a.email || ''} {a.user_role ? `• ${a.user_role}` : ''}
                        </Typography>
                      </Stack>
                      <Button size="small" color="error" variant="outlined" onClick={() => handleRemoveAssignee(a.user_id)}>
                        Remove
                      </Button>
                    </Box>
                  );
                })}
                <Stack direction="row" spacing={1}>
                  <Select
                    fullWidth
                    size="small"
                    displayEmpty
                    value={newAssigneeUserId}
                    onChange={(e) => setNewAssigneeUserId(e.target.value)}
                  >
                    <MenuItem value="">
                      <em>Select member…</em>
                    </MenuItem>
                    {(workspaceMembers || []).map((m) => {
                      const name = `${m.first_name || ''} ${m.last_name || ''}`.trim();
                      const label = name ? `${name} (${m.email})` : m.email;
                      return (
                        <MenuItem key={m.user_id} value={m.user_id}>
                          {label}
                        </MenuItem>
                      );
                    })}
                  </Select>
                  <Button variant="contained" onClick={handleAddAssignee} disabled={addingAssignee || !newAssigneeUserId}>
                    Add
                  </Button>
                </Stack>
              </Stack>
            )}

            <Divider />

            <Typography variant="subtitle1">Subitems</Typography>
            {subitemsLoading ? (
              <CircularProgress size={18} />
            ) : (
              <Stack spacing={1}>
                {!subitems.length && (
                  <Typography variant="body2" color="text.secondary">
                    No subitems yet.
                  </Typography>
                )}
                {subitems.map((s) => (
                  <Box
                    key={s.id}
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
                    <FormControlLabel
                      control={<Checkbox checked={s.status === 'done'} onChange={() => handleToggleSubitemDone(s)} />}
                      label={<Typography variant="body2">{s.name}</Typography>}
                      sx={{ m: 0 }}
                    />
                    <Button size="small" color="error" variant="outlined" onClick={() => handleDeleteSubitem(s.id)}>
                      Delete
                    </Button>
                  </Box>
                ))}
                <Stack direction="row" spacing={1}>
                  <TextField
                    fullWidth
                    size="small"
                    label="New subitem"
                    value={newSubitemName}
                    onChange={(e) => setNewSubitemName(e.target.value)}
                  />
                  <Button variant="contained" onClick={handleCreateSubitem} disabled={creatingSubitem || !newSubitemName.trim()}>
                    Add
                  </Button>
                </Stack>
              </Stack>
            )}

            <Divider />

            <Typography variant="subtitle1">AI Summary</Typography>
            {aiSummaryLoading ? (
              <CircularProgress size={18} />
            ) : aiSummary?.summary ? (
              <Box sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Provider: {aiSummary.provider || 'vertex'}
                  {aiSummary.model ? ` • ${aiSummary.model}` : ''}
                  {aiSummaryMeta.is_stale ? ' • stale' : ''}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                  {aiSummary.summary}
                </Typography>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No summary yet.
              </Typography>
            )}

            <Button variant="outlined" onClick={handleRefreshAiSummary} disabled={!activeItem?.id || aiSummaryRefreshing}>
              {aiSummaryRefreshing ? 'Refreshing…' : aiSummary?.summary ? 'Refresh summary' : 'Generate summary'}
            </Button>

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
                    {itemUpdates.map((u) => (
                      <Box key={u.id} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                        <Typography variant="caption" color="text.secondary">
                          {u.author_name || 'Unknown'}
                        </Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {u.content}
                        </Typography>
                      </Box>
                    ))}
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
                  <TextField
                    label="Minutes"
                    type="number"
                    value={timeMinutes}
                    onChange={(e) => setTimeMinutes(e.target.value)}
                    inputProps={{ min: 0 }}
                  />
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
                    disabled={loggingTime || !activeItem?.id || timeMinutes === '' || Number(timeMinutes) < 0}
                  >
                    {loggingTime ? 'Logging…' : 'Log time'}
                  </Button>
                </Stack>
              </Stack>
            )}
          </Stack>
        </Box>
      </Drawer>
    </MainCard>
  );
}
