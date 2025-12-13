import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

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
  TextField,
  Typography
} from '@mui/material';

import MainCard from 'ui-component/cards/MainCard';
import useAuth from 'hooks/useAuth';
import {
  createTaskBoard,
  createTaskGroup,
  createTaskItem,
  createTaskBoardAutomation,
  createTaskWorkspace,
  fetchTaskWorkspaceMembers,
  searchTaskWorkspaceMembers,
  addTaskWorkspaceMember,
  updateTaskWorkspaceMember,
  removeTaskWorkspaceMember,
  fetchTaskBoardView,
  fetchTaskBoardAutomations,
  fetchTaskBoardReport,
  fetchTaskBoards,
  fetchTaskWorkspaces,
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
  downloadTaskBoardCsv
  ,
  fetchTaskItemAiSummary,
  refreshTaskItemAiSummary
} from 'api/tasks';

function getEffectiveRole(user) {
  return user?.effective_role || user?.role;
}

export default function TaskManager() {
  const { user } = useAuth();
  const effRole = useMemo(() => getEffectiveRole(user), [user]);
  // used for deep-linking /tasks?board=...&item=...
  useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const canCreateWorkspace = useMemo(() => effRole === 'superadmin' || effRole === 'admin', [effRole]);

  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [error, setError] = useState('');

  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('');
  const [workspaceMembers, setWorkspaceMembers] = useState([]);
  const [workspaceMembersLoading, setWorkspaceMembersLoading] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  const [boards, setBoards] = useState([]);
  const [activeBoardId, setActiveBoardId] = useState('');

  const [boardViewLoading, setBoardViewLoading] = useState(false);
  const [boardView, setBoardView] = useState(null); // { board, groups, items }
  const [automations, setAutomations] = useState([]);
  const [automationsLoading, setAutomationsLoading] = useState(false);
  const [creatingAutomation, setCreatingAutomation] = useState(false);
  const [automationToStatus, setAutomationToStatus] = useState('needs_attention');
  const [automationAction, setAutomationAction] = useState('notify_admins');
  const [automationTitle, setAutomationTitle] = useState('Task needs attention');
  const [automationBody, setAutomationBody] = useState('An item was moved to needs_attention.');
  const [boardReport, setBoardReport] = useState(null);
  const [boardReportLoading, setBoardReportLoading] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  // Create forms
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  const [newBoardName, setNewBoardName] = useState('');
  const [creatingBoard, setCreatingBoard] = useState(false);

  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [newItemNameByGroup, setNewItemNameByGroup] = useState({});
  const [creatingItemByGroup, setCreatingItemByGroup] = useState({});

  // Item drawer
  const [activeItem, setActiveItem] = useState(null);
  const [itemDrawerOpen, setItemDrawerOpen] = useState(false);
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

  const loadWorkspaces = async () => {
    setLoadingWorkspaces(true);
    setError('');
    try {
      const ws = await fetchTaskWorkspaces();
      setWorkspaces(ws);
      if (!activeWorkspaceId && ws.length) setActiveWorkspaceId(ws[0].id);
    } catch (err) {
      setError(err.message || 'Unable to load workspaces');
    } finally {
      setLoadingWorkspaces(false);
    }
  };

  useEffect(() => {
    loadWorkspaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setBoards([]);
      setActiveBoardId('');
      setBoardView(null);
      setWorkspaceMembers([]);
      return;
    }
    setError('');
    fetchTaskBoards(activeWorkspaceId)
      .then((b) => {
        setBoards(b);
        if (!activeBoardId && b.length) setActiveBoardId(b[0].id);
      })
      .catch((err) => setError(err.message || 'Unable to load boards'));
    setWorkspaceMembersLoading(true);
    fetchTaskWorkspaceMembers(activeWorkspaceId)
      .then((m) => setWorkspaceMembers(m))
      .catch(() => setWorkspaceMembers([]))
      .finally(() => setWorkspaceMembersLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    loadBoardView(activeBoardId);
    loadAutomations(activeBoardId);
    loadBoardReport(activeBoardId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoardId]);

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    setCreatingWorkspace(true);
    setError('');
    try {
      const workspace = await createTaskWorkspace({ name: newWorkspaceName.trim() });
      setWorkspaces((prev) => [workspace, ...prev]);
      setActiveWorkspaceId(workspace.id);
      setNewWorkspaceName('');
    } catch (err) {
      setError(err.message || 'Unable to create workspace');
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const handleCreateBoard = async () => {
    if (!activeWorkspaceId || !newBoardName.trim()) return;
    setCreatingBoard(true);
    setError('');
    try {
      const board = await createTaskBoard(activeWorkspaceId, { name: newBoardName.trim() });
      setBoards((prev) => [board, ...prev]);
      setActiveBoardId(board.id);
      setNewBoardName('');
    } catch (err) {
      setError(err.message || 'Unable to create board');
    } finally {
      setCreatingBoard(false);
    }
  };

  const handleAddMember = async () => {
    if (!activeWorkspaceId || !newMemberEmail.trim()) return;
    setAddingMember(true);
    setError('');
    try {
      const member = await addTaskWorkspaceMember(activeWorkspaceId, { email: newMemberEmail.trim(), role: 'member' });
      setWorkspaceMembers((prev) => {
        const existing = prev.find((m) => m.user_id === member.user_id);
        if (existing) return prev.map((m) => (m.user_id === member.user_id ? member : m));
        return [...prev, member];
      });
      setNewMemberEmail('');
    } catch (err) {
      setError(err.message || 'Unable to add member');
    } finally {
      setAddingMember(false);
    }
  };

  const handleChangeMemberRole = async (memberUserId, role) => {
    if (!activeWorkspaceId) return;
    setError('');
    try {
      const updated = await updateTaskWorkspaceMember(activeWorkspaceId, memberUserId, { role });
      setWorkspaceMembers((prev) => prev.map((m) => (m.user_id === memberUserId ? updated : m)));
    } catch (err) {
      setError(err.message || 'Unable to update member role');
    }
  };

  const handleRemoveMember = async (memberUserId) => {
    if (!activeWorkspaceId) return;
    setError('');
    try {
      await removeTaskWorkspaceMember(activeWorkspaceId, memberUserId);
      setWorkspaceMembers((prev) => prev.filter((m) => m.user_id !== memberUserId));
    } catch (err) {
      setError(err.message || 'Unable to remove member');
    }
  };

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

  // Deep link support: /tasks?board=<id>&item=<id>
  useEffect(() => {
    const boardFromUrl = searchParams.get('board') || '';
    if (boardFromUrl && boardFromUrl !== activeBoardId) {
      setActiveBoardId(boardFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    // keep URL in sync when user changes board
    if (!activeBoardId) return;
    const currentBoard = searchParams.get('board');
    if (currentBoard !== activeBoardId) {
      const next = new URLSearchParams(searchParams);
      next.set('board', activeBoardId);
      // don't force item unless already set
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoardId]);

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
    const items = boardView?.items || [];
    for (const it of items) {
      if (!map[it.group_id]) map[it.group_id] = [];
      map[it.group_id].push(it);
    }
    return map;
  }, [boardView]);

  return (
    <MainCard title="Task Manager">
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '320px 1fr' }, gap: 2 }}>
          {/* Left navigator */}
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                <Typography variant="subtitle1">Workspace</Typography>
                {loadingWorkspaces && <CircularProgress size={16} />}
              </Stack>

              <Select
                size="small"
                value={activeWorkspaceId}
                displayEmpty
                onChange={(e) => {
                  setActiveWorkspaceId(e.target.value);
                  setActiveBoardId('');
                }}
              >
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
                  <Button
                    variant="contained"
                    onClick={handleCreateWorkspace}
                    disabled={creatingWorkspace || !newWorkspaceName.trim()}
                  >
                    Create
                  </Button>
                </Stack>
              )}

              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.25 }}>
                <Stack spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography variant="subtitle1">Members</Typography>
                    {workspaceMembersLoading && <CircularProgress size={16} />}
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
                    <Button
                      variant="contained"
                      onClick={handleAddMember}
                      disabled={addingMember || !activeWorkspaceId || !newMemberEmail.trim()}
                    >
                      Add
                    </Button>
                  </Stack>

                  <Stack spacing={0.75}>
                    {!workspaceMembers.length && (
                      <Typography variant="body2" color="text.secondary">
                        No members yet.
                      </Typography>
                    )}
                    {workspaceMembers.map((m) => {
                      const display =
                        `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || m.user_id?.slice?.(0, 8) || 'User';
                      return (
                        <Box
                          key={m.user_id}
                          sx={{
                            p: 1,
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 2,
                            display: 'flex',
                            gap: 1,
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}
                        >
                          <Stack sx={{ minWidth: 0 }}>
                            <Typography variant="body2" noWrap>
                              {display}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {m.email || ''} {m.user_role ? `• ${m.user_role}` : ''}
                            </Typography>
                          </Stack>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Select
                              size="small"
                              value={m.membership_role || 'member'}
                              onChange={(e) => handleChangeMemberRole(m.user_id, e.target.value)}
                            >
                              <MenuItem value="admin">Admin</MenuItem>
                              <MenuItem value="member">Member</MenuItem>
                            </Select>
                            <Button size="small" color="error" variant="outlined" onClick={() => handleRemoveMember(m.user_id)}>
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

              <Typography variant="subtitle1">Boards</Typography>

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

              <List dense sx={{ p: 0, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                {boards.length === 0 && (
                  <ListItemText
                    primary={<Typography variant="body2" color="text.secondary">No boards yet.</Typography>}
                    sx={{ px: 1.5, py: 1 }}
                  />
                )}
                {boards.map((b) => (
                  <ListItemButton key={b.id} selected={b.id === activeBoardId} onClick={() => setActiveBoardId(b.id)}>
                    <ListItemText primary={b.name} secondary={b.description || ''} />
                  </ListItemButton>
                ))}
              </List>
            </Stack>
          </Box>

          {/* Board view */}
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, minHeight: 420 }}>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                <Typography variant="h6">{boardView?.board?.name || 'Board'}</Typography>
                {boardViewLoading && <CircularProgress size={18} />}
              </Stack>

              {!activeBoardId && (
                <Typography variant="body2" color="text.secondary">
                  Select a board to view its groups and items.
                </Typography>
              )}

              {activeBoardId && (
                <Stack spacing={1}>
                  <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.25 }}>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                        <Typography variant="subtitle1">Automations</Typography>
                        {automationsLoading && <CircularProgress size={16} />}
                      </Stack>

                      <Stack spacing={0.75}>
                        {!automations.length && (
                          <Typography variant="body2" color="text.secondary">
                            No automations yet.
                          </Typography>
                        )}
                        {automations.slice(0, 5).map((r) => (
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

                      <Button
                        variant="outlined"
                        onClick={handleAddNeedsAttentionAutomation}
                        disabled={creatingAutomation || !activeBoardId}
                      >
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
                  </Box>

                  <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.25 }}>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                        <Typography variant="subtitle1">Reporting</Typography>
                        {boardReportLoading && <CircularProgress size={16} />}
                      </Stack>
                      {boardReport ? (
                        <Typography variant="body2" color="text.secondary">
                          Total: {boardReport.total} • Todo: {boardReport.todo} • Working: {boardReport.working} • Blocked:{' '}
                          {boardReport.blocked} • Done: {boardReport.done} • Needs-attn(status): {boardReport.needs_attention_status} •
                          Needs-attn(flag): {boardReport.needs_attention_flag} • Voicemail: {boardReport.voicemail}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No report available yet.
                        </Typography>
                      )}
                      <Stack direction="row" spacing={1}>
                        <Button variant="outlined" onClick={() => loadBoardReport(activeBoardId)} disabled={!activeBoardId || boardReportLoading}>
                          Refresh
                        </Button>
                        <Button variant="contained" onClick={handleDownloadCsv} disabled={!activeBoardId || exportingCsv}>
                          {exportingCsv ? 'Exporting…' : 'Export CSV'}
                        </Button>
                      </Stack>
                    </Stack>
                  </Box>

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

                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, 1fr)' }, gap: 1.5 }}>
                    {(boardView?.groups || []).map((g) => (
                      <Box key={g.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.25 }}>
                        <Stack spacing={1}>
                          <Typography variant="subtitle1">{g.name}</Typography>

                          <Stack direction="row" spacing={1} alignItems="center">
                            <TextField
                              fullWidth
                              size="small"
                              label="New item"
                              value={newItemNameByGroup[g.id] || ''}
                              onChange={(e) => setNewItemNameByGroup((prev) => ({ ...prev, [g.id]: e.target.value }))}
                            />
                            <Button
                              variant="outlined"
                              onClick={() => handleCreateItem(g.id)}
                              disabled={creatingItemByGroup[g.id] || !(newItemNameByGroup[g.id] || '').trim()}
                            >
                              Add
                            </Button>
                          </Stack>

                          <Divider />

                          <Stack spacing={0.75}>
                            {(itemsByGroup[g.id] || []).length === 0 && (
                              <Typography variant="body2" color="text.secondary">
                                No items.
                              </Typography>
                            )}
                            {(itemsByGroup[g.id] || []).map((it) => (
                              <Box
                                key={it.id}
                                onClick={() => openItemDrawer(it)}
                                ref={(node) => {
                                  if (node) itemCardRefs.current[it.id] = node;
                                }}
                                sx={{
                                  p: 1,
                                  border: '1px solid',
                                  borderColor: 'divider',
                                  borderRadius: 2,
                                  cursor: 'pointer',
                                  ...(highlightedItemId === it.id && {
                                    borderColor: 'primary.main',
                                    bgcolor: 'action.selected'
                                  }),
                                  '&:hover': { bgcolor: 'action.hover' }
                                }}
                              >
                                <Stack spacing={0.25}>
                                  <Typography variant="subtitle2">{it.name}</Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {it.status}
                                    {it.needs_attention ? ' • needs attention' : ''}
                                    {it.is_voicemail ? ' • voicemail' : ''}
                                  </Typography>
                                </Stack>
                              </Box>
                            ))}
                          </Stack>
                        </Stack>
                      </Box>
                    ))}
                  </Box>
                </Stack>
              )}
            </Stack>
          </Box>
        </Box>
      </Stack>

      <Drawer anchor="right" open={itemDrawerOpen} onClose={() => setItemDrawerOpen(false)} PaperProps={{ sx: { width: { xs: '100%', sm: 420 } } }}>
        <Box sx={{ p: 2 }}>
          <Stack spacing={1.5}>
            <Typography variant="h6">{activeItem?.name || 'Item'}</Typography>
            <Typography variant="caption" color="text.secondary">
              Status: {activeItem?.status || '-'}
            </Typography>
            <Divider />

            <Typography variant="subtitle1">Fields</Typography>
            <Stack spacing={1}>
              <Select
                size="small"
                value={activeItem?.status || 'todo'}
                onChange={(e) => updateItemField({ status: e.target.value })}
              >
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

            <Typography variant="subtitle1">Attachments</Typography>
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

            <Divider />

            <Typography variant="subtitle1">Time tracking</Typography>
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
              <Select size="small" value={timeBillable ? 'billable' : 'non_billable'} onChange={(e) => setTimeBillable(e.target.value === 'billable')}>
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

            <Divider />

            <Typography variant="subtitle1">Updates</Typography>
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
              <Popper open={mentionOpen} anchorEl={updateInputRef.current} placement="bottom-start" sx={{ zIndex: 1500, width: updateInputRef.current?.clientWidth || 360 }}>
                <Paper sx={{ mt: 0.5, maxHeight: 220, overflow: 'auto' }}>
                  {mentionLoading ? (
                    <Box sx={{ p: 1.25 }}>
                      <CircularProgress size={18} />
                    </Box>
                  ) : (
                    <List dense disablePadding>
                      {mentionOptions.length === 0 && (
                        <ListItemText
                          primary={<Typography variant="body2" color="text.secondary">No matches</Typography>}
                          sx={{ px: 1.5, py: 1 }}
                        />
                      )}
                      {mentionOptions.slice(0, 10).map((m) => {
                        const name = `${m.first_name || ''} ${m.last_name || ''}`.trim();
                        const primary = m.email || m.user_id;
                        const secondary = name ? `${name}${m.user_role ? ` • ${m.user_role}` : ''}` : (m.user_role || '');
                        return (
                          <ListItemButton key={m.user_id} onMouseDown={(e) => e.preventDefault()} onClick={() => insertMention(primary)}>
                            <ListItemText primary={primary} secondary={secondary} />
                          </ListItemButton>
                        );
                      })}
                    </List>
                  )}
                </Paper>
              </Popper>
              <Button variant="contained" onClick={handlePostUpdate} disabled={postingUpdate || !newUpdateText.trim() || !activeItem?.id}>
                Post update
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Drawer>
    </MainCard>
  );
}

