import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import Autocomplete from '@mui/material/Autocomplete';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';

import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ScheduleIcon from '@mui/icons-material/Schedule';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import TablePagination from '@mui/material/TablePagination';

import MainCard from 'ui-component/cards/MainCard';
import { fetchEmailLogs, fetchEmailLogDetail, fetchEmailStats, EMAIL_TYPE_LABELS, STATUS_COLORS } from 'api/emailLogs';
import useAuth from 'hooks/useAuth';
import useTableSearch from 'hooks/useTableSearch';
import { createClient, fetchClients, updateClient, deleteClient, fetchClientDetail, sendClientOnboardingEmail, activateClient, getClientOnboardingLink } from 'api/clients';
import { requestPasswordReset } from 'api/auth';
import { fetchBoards, fetchGroups, fetchPeople } from 'api/monday';
import { fetchTaskWorkspaces } from 'api/tasks';
import client from 'api/client';
import { CLIENT_TYPE_PRESETS, getAiPromptForClient } from 'constants/clientPresets';
import { fetchClientServices, saveClientServices } from 'api/services';
import { useToast } from 'contexts/ToastContext';
import { getErrorMessage } from 'utils/errors';
import AnchorStepIcon from 'ui-component/extended/AnchorStepIcon';
import Button from '@mui/material/Button';

const EMPTY_SERVICE_LIST = Object.freeze([]);
const CLIENT_PACKAGE_OPTIONS = ['Essentials', 'Growth', 'Accelerate', 'Custom'];
const EMPTY_SUBTYPE_LIST = Object.freeze([]);

const makeLocalServiceId = () => `svc-${Math.random().toString(36).slice(2, 11)}`;
const serviceNameKey = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase();
const formatServiceLabel = (value = '') =>
  String(value || '')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
const mapServiceRecord = (record = {}) => ({
  id: record.id || null,
  localId: record.id || makeLocalServiceId(),
  name: record.name || '',
  description: record.description || '',
  base_price: record.base_price === null || record.base_price === undefined || record.base_price === '' ? '' : String(record.base_price),
  active: record.active !== false,
  isPreset: false
});
const buildNewServiceDraft = (name, options = {}) => ({
  id: null,
  localId: makeLocalServiceId(),
  name,
  description: options.description || '',
  base_price: options.base_price !== undefined ? options.base_price : '0',
  active: true,
  isPreset: options.isPreset || false
});

export default function AdminHub() {
  const { user, initializing, setActingClient } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [newClient, setNewClient] = useState({ email: '', name: '', role: 'client' });
  const [savingNew, setSavingNew] = useState(false);

  const [editing, setEditing] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const [boards, setBoards] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [people, setPeople] = useState([]);
  const [loadingPeople, setLoadingPeople] = useState(false);

  const [brandData, setBrandData] = useState(null);
  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docUpload, setDocUpload] = useState({ label: '', forReview: false, files: [] });
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [clientServices, setClientServices] = useState([]);
  const [clientServicesLoading, setClientServicesLoading] = useState(false);
  const [clientServicesReady, setClientServicesReady] = useState(false);
  const presetSubtypeAppliedRef = useRef(null);
  const lastAppliedPromptRef = useRef('');
  const fileInputRef = useRef(null);
  const [deletingClientId, setDeletingClientId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, clientId: null, label: '', hasBoard: false, deleteBoard: false });
  const [selectedClientIds, setSelectedClientIds] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkSendingOnboarding, setBulkSendingOnboarding] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState('');
  const [onboardingWizardOpen, setOnboardingWizardOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const ONBOARDING_WIZARD_LAST_STEP = 2;
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [sendOnboardingEmailFlag, setSendOnboardingEmailFlag] = useState(true);
  const [sendingOnboardingEmail, setSendingOnboardingEmail] = useState(false);
  const [sendingOnboardingForId, setSendingOnboardingForId] = useState('');
  const [activatingClientId, setActivatingClientId] = useState('');
  const [copyingLinkForId, setCopyingLinkForId] = useState('');
  const [taskWorkspaces, setTaskWorkspaces] = useState([]);
  const [taskWorkspacesLoading, setTaskWorkspacesLoading] = useState(false);

  // Hub Section Tabs (0 = Users & Clients, 1 = Email Logs)
  const [hubSection, setHubSection] = useState(0);

  // Email Logs State
  const [emailLogs, setEmailLogs] = useState([]);
  const [emailLogsLoading, setEmailLogsLoading] = useState(false);
  const [emailLogsPagination, setEmailLogsPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [emailLogsFilters, setEmailLogsFilters] = useState({ emailType: 'all', status: 'all', search: '' });
  const [emailLogDetail, setEmailLogDetail] = useState({ open: false, log: null, loading: false });
  const [emailStats, setEmailStats] = useState(null);

  const effectiveRole = user?.effective_role || user?.role;
  const isSuperAdmin = effectiveRole === 'superadmin';
  const isAdmin = effectiveRole === 'superadmin' || effectiveRole === 'admin';
  const canAccessHub = isAdmin;

  const reportError = useCallback(
    (err, fallback) => {
      const msg = getErrorMessage(err, fallback);
      setError(msg);
      toast.error(msg);
    },
    [toast]
  );

  useEffect(() => {
    if (!canAccessHub) return;
    let active = true;
    setLoading(true);
    fetchClients()
      .then((data) => {
        if (active) setClients(data);
      })
      .catch((err) => {
        if (active) reportError(err, 'Unable to load clients');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canAccessHub]);

  useEffect(() => {
    if (!editing?.monday_board_id) {
      setGroups([]);
    }
  }, [editing?.monday_board_id]);

  useEffect(() => {
    if (!canAccessHub) return;
    setLoadingPeople(true);
    fetchPeople()
      .then((p) => setPeople(p))
      .catch((err) => reportError(err, 'Unable to load Monday users'))
      .finally(() => setLoadingPeople(false));
  }, [canAccessHub]);

  useEffect(() => {
    if (!canAccessHub) return;
    let active = true;
    setTaskWorkspacesLoading(true);
    fetchTaskWorkspaces()
      .then((rows) => {
        if (!active) return;
        setTaskWorkspaces(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!active) return;
        setTaskWorkspaces([]);
      })
      .finally(() => {
        if (!active) return;
        setTaskWorkspacesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canAccessHub]);

  useEffect(() => {
    if (!editing?.id) return;
    const userId = editing.id;
    client
      .get(`/hub/brand/admin/${userId}`)
      .then((res) => setBrandData(res.data.brand))
      .catch(() => {});
    refreshDocs(userId);
    setDocUpload({ label: '', forReview: false, files: [] });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [editing?.id]);

  useEffect(() => {
    if (!editing?.id) {
      setClientServices([]);
      setClientServicesLoading(false);
      setClientServicesReady(false);
      return;
    }
    let active = true;
    setClientServicesLoading(true);
    setClientServicesReady(false);
    fetchClientServices(editing.id)
      .then((services) => {
        if (!active) return;
        const normalized = Array.isArray(services) ? services : [];
        setClientServices(normalized.map((service) => mapServiceRecord(service)));
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Unable to load client services');
        setClientServices([]);
      })
      .finally(() => {
        if (!active) return;
        setClientServicesLoading(false);
        setClientServicesReady(true);
      });
    return () => {
      active = false;
    };
  }, [editing?.id]);

  useEffect(() => {
    presetSubtypeAppliedRef.current = null;
  }, [editing?.id]);

  const selectedTypePreset = useMemo(() => CLIENT_TYPE_PRESETS.find((type) => type.value === editing?.client_type), [editing?.client_type]);
  const selectedSubtypePreset = useMemo(
    () => selectedTypePreset?.subtypes?.find((sub) => sub.value === editing?.client_subtype),
    [selectedTypePreset, editing?.client_subtype]
  );
  const availablePresetServices = selectedSubtypePreset?.services || EMPTY_SERVICE_LIST;
  const subtypeOptions = selectedTypePreset?.subtypes || EMPTY_SUBTYPE_LIST;

  useEffect(() => {
    if (!clientServicesReady) return;
    if (!editing?.client_subtype || availablePresetServices.length === 0) return;
    if (presetSubtypeAppliedRef.current === editing.client_subtype) return;
    // Hard replace: switching subtype should replace the service preset list (prevents accidental appends).
    setClientServices(
      availablePresetServices.filter((name) => name).map((name) => buildNewServiceDraft(formatServiceLabel(name), { isPreset: true }))
    );
    presetSubtypeAppliedRef.current = editing.client_subtype;
  }, [clientServicesReady, editing?.client_subtype, availablePresetServices]);

  useEffect(() => {
    if (!isAdmin || !editing) return;
    if (!editing.client_type) {
      lastAppliedPromptRef.current = '';
      if (editing.ai_prompt) {
        setEditing((prev) => (prev ? { ...prev, ai_prompt: '' } : prev));
      }
      return;
    }

    const prompt = getAiPromptForClient(editing.client_type, editing.client_subtype);
    const shouldApplyPreset = !editing.ai_prompt || editing.ai_prompt === lastAppliedPromptRef.current;
    if (shouldApplyPreset || editing.ai_prompt === prompt) {
      lastAppliedPromptRef.current = prompt;
      setEditing((prev) => (prev ? { ...prev, ai_prompt: prompt } : prev));
    }
  }, [editing?.client_type, editing?.client_subtype, editing?.ai_prompt, isAdmin]);

  const sortedClients = useMemo(() => {
    return [...clients].sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''));
  }, [clients]);

  const sortedEditors = useMemo(
    () => sortedClients.filter((c) => c.role === 'admin' || c.role === 'superadmin' || c.role === 'team'),
    [sortedClients]
  );
  const sortedClientOnly = useMemo(() => sortedClients.filter((c) => c.role === 'client'), [sortedClients]);

  const {
    query: adminsQuery,
    setQuery: setAdminsQuery,
    filtered: filteredAdmins
  } = useTableSearch(sortedEditors, ['email', 'first_name', 'last_name', 'role']);
  const {
    query: clientsQuery,
    setQuery: setClientsQuery,
    filtered: filteredClients
  } = useTableSearch(sortedClientOnly, ['email', 'first_name', 'last_name', 'role', 'monday_board_id']);

  useEffect(() => {
    // Keep selection valid as the client list changes.
    setSelectedClientIds((prev) => prev.filter((id) => sortedClientOnly.some((c) => c.id === id)));
  }, [sortedClientOnly]);

  // Load email logs when hubSection switches to Email Logs tab
  const loadEmailLogs = useCallback(async () => {
    if (!canAccessHub) return;
    setEmailLogsLoading(true);
    try {
      const result = await fetchEmailLogs({
        page: emailLogsPagination.page,
        limit: emailLogsPagination.limit,
        emailType: emailLogsFilters.emailType,
        status: emailLogsFilters.status,
        search: emailLogsFilters.search
      });
      setEmailLogs(result.logs || []);
      setEmailLogsPagination((prev) => ({ ...prev, ...result.pagination }));
    } catch (err) {
      reportError(err, 'Unable to load email logs');
    } finally {
      setEmailLogsLoading(false);
    }
  }, [canAccessHub, emailLogsPagination.page, emailLogsPagination.limit, emailLogsFilters, reportError]);

  const loadEmailStats = useCallback(async () => {
    try {
      const result = await fetchEmailStats(30);
      setEmailStats(result.stats || []);
    } catch (err) {
      console.error('Failed to load email stats', err);
    }
  }, []);

  useEffect(() => {
    if (hubSection === 1 && canAccessHub) {
      loadEmailLogs();
      loadEmailStats();
    }
  }, [hubSection, canAccessHub, loadEmailLogs, loadEmailStats]);

  // Reload email logs when filters/pagination change
  useEffect(() => {
    if (hubSection === 1 && canAccessHub) {
      loadEmailLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailLogsFilters, emailLogsPagination.page, emailLogsPagination.limit]);

  const handleViewEmailLog = async (log) => {
    setEmailLogDetail({ open: true, log: null, loading: true });
    try {
      const detail = await fetchEmailLogDetail(log.id);
      setEmailLogDetail({ open: true, log: detail, loading: false });
    } catch (err) {
      reportError(err, 'Unable to load email detail');
      setEmailLogDetail({ open: false, log: null, loading: false });
    }
  };

  const handleEmailLogsFilterChange = (key, value) => {
    setEmailLogsFilters((prev) => ({ ...prev, [key]: value }));
    setEmailLogsPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleEmailLogsPageChange = (event, newPage) => {
    setEmailLogsPagination((prev) => ({ ...prev, page: newPage + 1 }));
  };

  const handleEmailLogsRowsPerPageChange = (event) => {
    setEmailLogsPagination((prev) => ({ ...prev, limit: parseInt(event.target.value, 10), page: 1 }));
  };

  const toggleSelectClient = (clientId) => {
    setSelectedClientIds((prev) => {
      if (prev.includes(clientId)) return prev.filter((id) => id !== clientId);
      return [...prev, clientId];
    });
  };

  const toggleSelectAllFilteredClients = () => {
    const ids = filteredClients.map((c) => c.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedClientIds.includes(id));
    setSelectedClientIds((prev) => {
      if (allSelected) return prev.filter((id) => !ids.includes(id));
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };

  const handleBulkSendOnboarding = async () => {
    if (!selectedClientIds.length) return;
    setBulkSendingOnboarding(true);
    setError('');
    setSuccess('');
    try {
      await Promise.all(selectedClientIds.map((id) => sendClientOnboardingEmail(id)));
      setSuccess(`Onboarding email sent to ${selectedClientIds.length} client(s).`);
    } catch (err) {
      reportError(err, 'Unable to send onboarding emails');
    } finally {
      setBulkSendingOnboarding(false);
    }
  };

  const handleApplyBulkAction = async () => {
    if (!selectedClientIds.length || !bulkAction) return;
    if (bulkAction === 'send_onboarding') {
      await handleBulkSendOnboarding();
      setBulkAction('');
      return;
    }
    if (bulkAction === 'delete') {
      setBulkDeleteConfirmOpen(true);
      return;
    }
  };

  const handleBulkDeleteClients = async () => {
    if (!selectedClientIds.length) return;
    setBulkDeleting(true);
    setError('');
    setSuccess('');
    try {
      await Promise.all(selectedClientIds.map((id) => deleteClient(id)));
      setClients((prev) => prev.filter((c) => !selectedClientIds.includes(c.id)));
      if (editing?.id && selectedClientIds.includes(editing.id)) setEditing(null);
      setSelectedClientIds([]);
      setSuccess(`Deleted ${selectedClientIds.length} client(s).`);
    } catch (err) {
      reportError(err, 'Unable to delete selected clients');
    } finally {
      setBulkDeleting(false);
      setBulkDeleteConfirmOpen(false);
    }
  };

  if (initializing) return null;
  if (!canAccessHub) return <Navigate to="/" replace />;

  const handleAddClient = async () => {
    setSavingNew(true);
    setError('');
    setSuccess('');
    try {
      const res = await createClient(newClient);
      setSuccess(res.created ? 'Client created' : 'Client updated');
      setClients((prev) => {
        const others = prev.filter((c) => c.id !== res.client.id);
        return [...others, res.client];
      });
      setNewClient({ email: '', name: '', role: 'client' });
      if (res.client.role === 'client') {
      await startOnboardingFlow(res.client.id);
      } else if (res.client.role === 'admin' || res.client.role === 'team') {
        try {
          await requestPasswordReset(res.client.email);
          setSuccess(`${res.client.role === 'team' ? 'Team user' : 'Admin'} created. Password reset email sent.`);
        } catch (resetErr) {
          reportError(resetErr, 'User created, but failed to send reset email.');
        }
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 409) {
        const normalizedEmail = String(newClient?.email || '')
          .trim()
          .toLowerCase();
        const existingIdFromApi = err?.response?.data?.existing_user_id || null;
        const existingClient =
          clients.find((c) => c.id === existingIdFromApi) ||
          clients.find((c) => String(c.email || '').trim().toLowerCase() === normalizedEmail) ||
          null;

        if (existingClient?.id) {
          setSuccess('Client already exists — opening onboarding wizard');
          setNewClient({ email: '', name: '', role: 'client' });
          await startOnboardingFlow(existingClient.id);
          return;
        }
      }

      reportError(err, 'Unable to save client');
    } finally {
      setSavingNew(false);
    }
  };

  const addGroupKeys = (list = []) =>
    list.map((group, idx) => ({
      ...group,
      __optionKey: `${group.id || group.title || 'group'}-${idx}`
    }));

  const renderGroupOption = (props, option) => {
    const { key, ...rest } = props;
    const optionKey = option.__optionKey || option.id || key;
    return (
      <li {...rest} key={optionKey}>
        {option?.title || option?.id || ''}
      </li>
    );
  };

  const loadBoards = async (search = '') => {
    setLoadingBoards(true);
    try {
      const b = await fetchBoards(search);
      setBoards(b);
    } catch (err) {
      reportError(err, 'Unable to load Monday boards');
    } finally {
      setLoadingBoards(false);
    }
  };

  const loadGroups = async (boardId) => {
    if (!boardId) {
      setGroups([]);
      return;
    }
    try {
      const g = await fetchGroups(boardId);
      setGroups(addGroupKeys(g));
    } catch (err) {
      reportError(err, 'Unable to load Monday groups');
    }
  };

  const refreshDocs = async (userId = editing?.id) => {
    if (!userId) return;
    setDocsLoading(true);
    try {
      const docsResp = await client.get(`/hub/docs/admin/${userId}`).then((res) => res.data.docs || []);
      setDocs(docsResp);
    } catch (err) {
      reportError(err, 'Unable to load documents');
    } finally {
      setDocsLoading(false);
    }
  };

  const startEdit = (clientData) => {
    const displayName = [clientData.first_name, clientData.last_name].filter(Boolean).join(' ').trim();
    const accessRequirements = {
      requires_website_access: clientData.requires_website_access !== false,
      requires_ga4_access: clientData.requires_ga4_access !== false,
      requires_google_ads_access: clientData.requires_google_ads_access !== false,
      requires_meta_access: clientData.requires_meta_access !== false,
      requires_forms_step: clientData.requires_forms_step !== false
    };
    setEditing({ ...clientData, ...accessRequirements, display_name: clientData.display_name || displayName });
    loadBoards();
    if (clientData.monday_board_id) {
      loadGroups(clientData.monday_board_id);
    }
    setActiveTab(0);
    setSuccess('');
    setError('');
  };

  const handleEditChange = (key) => (event) => {
    setEditing((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const handleSaveEdit = async ({ exitAfterSave = true, silent = false } = {}) => {
    if (!editing) return false;
    setSavingEdit(true);
    setError('');
    if (!silent) setSuccess('');
    let saved = false;
    try {
      const updated = await updateClient(editing.id, {
        display_name: editing.display_name,
        user_email: editing.email,
        role: editing.role,
        client_type: editing.client_type,
        client_subtype: editing.client_subtype,
        client_package: editing.client_package,
        requires_website_access: editing.requires_website_access !== false,
        requires_ga4_access: editing.requires_ga4_access !== false,
        requires_google_ads_access: editing.requires_google_ads_access !== false,
        requires_meta_access: editing.requires_meta_access !== false,
        requires_forms_step: editing.requires_forms_step !== false,
        website_access_provided: editing.website_access_provided,
        website_access_understood: editing.website_access_understood,
        ga4_access_provided: editing.ga4_access_provided,
        ga4_access_understood: editing.ga4_access_understood,
        google_ads_access_provided: editing.google_ads_access_provided,
        google_ads_access_understood: editing.google_ads_access_understood,
        meta_access_provided: editing.meta_access_provided,
        meta_access_understood: editing.meta_access_understood,
        website_forms_details_provided: editing.website_forms_details_provided,
        website_forms_details_understood: editing.website_forms_details_understood,
        website_forms_uses_third_party: editing.website_forms_uses_third_party,
        website_forms_uses_hipaa: editing.website_forms_uses_hipaa,
        website_forms_connected_crm: editing.website_forms_connected_crm,
        website_forms_custom: editing.website_forms_custom,
        website_forms_notes: editing.website_forms_notes,
        looker_url: editing.looker_url,
        monday_board_id: editing.monday_board_id,
        monday_group_id: editing.monday_group_id,
        monday_active_group_id: editing.monday_active_group_id,
        monday_completed_group_id: editing.monday_completed_group_id,
        client_identifier_value: editing.client_identifier_value,
        task_workspace_id: editing.task_workspace_id,
        board_prefix: editing.board_prefix,
        account_manager_person_id: editing.account_manager_person_id,
        ai_prompt: editing.ai_prompt,
        ctm_account_number: editing.ctm_account_number,
        ctm_api_key: editing.ctm_api_key,
        ctm_api_secret: editing.ctm_api_secret,
        auto_star_enabled: editing.auto_star_enabled || false
      });
      let servicesSynced = false;
      if (clientServicesReady && editing.id) {
        const payload = clientServices
          .filter((service) => service.active !== false)
          .map((service) => {
            const parsedPrice =
              service.base_price === '' || service.base_price === null || service.base_price === undefined
                ? null
                : Number.parseFloat(service.base_price);
            const safePrice = Number.isNaN(parsedPrice) ? null : parsedPrice;
            return {
              id: service.id,
              name: service.name,
              description: service.description || '',
              base_price: safePrice,
              active: true
            };
          });
        const latestServices = await saveClientServices(editing.id, payload);
        setClientServices(latestServices.map((service) => mapServiceRecord(service)));
        servicesSynced = true;
      }
      setClients((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
      if (!silent) {
        setSuccess(servicesSynced ? 'Client details & services saved' : 'Client updated');
      }
      if (exitAfterSave) {
        setEditing(null);
      } else {
        setEditing((prev) => (prev ? { ...prev, ...updated } : prev));
      }
      saved = true;
    } catch (err) {
      // In the wizard we often save with `silent: true`; still show an actionable error.
      reportError(err, 'Unable to update client');
    } finally {
      setSavingEdit(false);
    }
    return saved;
  };

  const confirmDeleteClient = (clientId) => {
    const target = clients.find((c) => c.id === clientId);
    const label = target ? target.email || `${target.first_name || ''} ${target.last_name || ''}`.trim() : 'this client';
    const hasBoard = Boolean(target?.task_board_id);
    setDeleteConfirm({ open: true, clientId, label, hasBoard, deleteBoard: false });
  };

  const handleDeleteClient = async () => {
    const clientId = deleteConfirm.clientId;
    if (!clientId) return;
    setDeletingClientId(clientId);
    setError('');
    setSuccess('');
    try {
      const result = await deleteClient(clientId, { deleteBoard: deleteConfirm.deleteBoard });
      setClients((prev) => prev.filter((c) => c.id !== clientId));
      if (editing?.id === clientId) {
        setEditing(null);
      }
      setSuccess(result.boardDeleted ? 'Client and associated board deleted' : 'Client deleted');
    } catch (err) {
      setError(err.message || 'Unable to delete client');
    } finally {
      setDeletingClientId(null);
      setDeleteConfirm({ open: false, clientId: null, label: '', hasBoard: false, deleteBoard: false });
    }
  };

  const newRolesOptions = isSuperAdmin ? ['client', 'admin', 'team'] : ['client', 'team'];

  const handleDocUpload = async () => {
    if (!editing?.id || !docUpload.files.length) return;
    setUploadingDocs(true);
    setError('');
    setSuccess('');
    try {
      const formData = new FormData();
      formData.append('user_id', editing.id);
      if (docUpload.label) formData.append('doc_label', docUpload.label);
      formData.append('for_review', docUpload.forReview ? 'true' : 'false');
      docUpload.files.forEach((file) => formData.append('client_doc', file));
      await client.post('/hub/docs/admin/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      await refreshDocs(editing.id);
      setDocUpload({ label: '', forReview: false, files: [] });
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSuccess('Document uploaded');
    } catch (err) {
      setError(err.message || 'Unable to upload document');
    } finally {
      setUploadingDocs(false);
    }
  };

  const handleDocDelete = async (docId) => {
    if (!editing?.id) return;
    setError('');
    setSuccess('');
    try {
      await client.delete(`/hub/docs/admin/${docId}`, { data: { user_id: editing.id } });
      await refreshDocs(editing.id);
      setSuccess('Document deleted');
    } catch (err) {
      setError(err.message || 'Unable to delete document');
    }
  };

  const startOnboardingFlow = async (clientId) => {
    setOnboardingLoading(true);
    setError('');
    try {
      const detail = await fetchClientDetail(clientId);
      startEdit(detail);
      setOnboardingWizardOpen(true);
      setOnboardingStep(0);
      setSendOnboardingEmailFlag(true);
    } catch (err) {
      setError(err.message || 'Unable to load client for onboarding');
    } finally {
      setOnboardingLoading(false);
    }
  };

  const handleClientTypeSelect = (event) => {
    const nextType = event.target.value;
    presetSubtypeAppliedRef.current = null;
    lastAppliedPromptRef.current = '';
    setEditing((prev) => ({ ...prev, client_type: nextType, client_subtype: '', ai_prompt: '' }));
  };

  const handleClientSubtypeSelect = (event) => {
    const nextSubtype = event.target.value;
    presetSubtypeAppliedRef.current = null;
    setEditing((prev) => ({ ...prev, client_subtype: nextSubtype }));
  };

  const handleWizardClose = () => {
    setOnboardingWizardOpen(false);
    setOnboardingStep(0);
    setSendOnboardingEmailFlag(true);
    setEditing(null);
  };

  const handleWizardNext = async () => {
    const saved = await handleSaveEdit({ exitAfterSave: false, silent: true });
    if (saved) {
      setOnboardingStep((prev) => Math.min(prev + 1, ONBOARDING_WIZARD_LAST_STEP));
    }
  };

  const handleWizardBack = () => {
    setOnboardingStep((prev) => Math.max(prev - 1, 0));
  };

  const handleWizardFinish = async () => {
    if (!editing?.id) {
      handleWizardClose();
      return;
    }
    if (!sendOnboardingEmailFlag) {
      setSuccess('Client onboarding saved');
      handleWizardClose();
      return;
    }
    setSendingOnboardingEmail(true);
    setError('');
    try {
      await sendClientOnboardingEmail(editing.id);
      setSuccess('Client onboarding email sent');
      handleWizardClose();
    } catch (err) {
      setError(err.message || 'Unable to send onboarding email');
    } finally {
      setSendingOnboardingEmail(false);
    }
  };

  const ACCESS_STEP_OPTIONS = [
    { key: 'requires_website_access', label: 'Website / hosting / DNS access' },
    { key: 'requires_ga4_access', label: 'Google Analytics (GA4)' },
    { key: 'requires_google_ads_access', label: 'Google Ads' },
    { key: 'requires_meta_access', label: 'Facebook / Instagram (Meta)' },
    { key: 'requires_forms_step', label: 'Website forms & integrations' }
  ];

  const toggleAccessRequirement = (key) => (event) => {
    const checked = Boolean(event.target.checked);
    setEditing((prev) => ({ ...prev, [key]: checked }));
  };

  const handleSendOnboardingEmailNow = async (clientId) => {
    if (!clientId) return;
    setSendingOnboardingForId(clientId);
    setError('');
    setSuccess('');
    try {
      await sendClientOnboardingEmail(clientId);
      setSuccess('Client onboarding email sent');
    } catch (err) {
      setError(err.message || 'Unable to send onboarding email');
    } finally {
      setSendingOnboardingForId('');
    }
  };

  const handleCopyOnboardingLink = async (clientId) => {
    if (!clientId) return;
    setCopyingLinkForId(clientId);
    setError('');
    setSuccess('');
    try {
      const result = await getClientOnboardingLink(clientId);
      await navigator.clipboard.writeText(result.url);
      setSuccess('Onboarding link copied to clipboard');
      toast.success('Onboarding link copied!');
    } catch (err) {
      setError(err.message || 'Unable to generate onboarding link');
    } finally {
      setCopyingLinkForId('');
    }
  };

  const handleActivateClient = async (clientId) => {
    if (!clientId) return;
    setActivatingClientId(clientId);
    setError('');
    setSuccess('');
    try {
      const result = await activateClient(clientId);
      setSuccess(result.message || 'Account activated successfully');
      // Update the client in the list with the new activated_at
      setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, activated_at: new Date().toISOString() } : c)));
      // Also update editing if this client is being edited
      if (editing?.id === clientId) {
        setEditing((prev) => ({ ...prev, activated_at: new Date().toISOString() }));
      }
    } catch (err) {
      setError(err.message || 'Unable to activate account');
    } finally {
      setActivatingClientId('');
    }
  };
 
  const renderDetailsTab = () => (
    <Stack spacing={2} sx={{ mt: 2 }}>
      {editing?.role === 'client' && (
        <>
          <Typography variant="subtitle1">Internal Task Board</Typography>
          <TextField
            label="Package"
            value={editing.client_package || ''}
            onChange={handleEditChange('client_package')}
            select
            fullWidth
            InputLabelProps={{ shrink: true }}
            SelectProps={{
              displayEmpty: true,
              renderValue: (selected) => {
                if (!selected) return 'Not set';
                return selected;
              }
            }}
          >
            <MenuItem value="">
              <em>Not set</em>
              </MenuItem>
            {CLIENT_PACKAGE_OPTIONS.map((pkg) => (
              <MenuItem key={pkg} value={pkg}>
                {pkg}
              </MenuItem>
            ))}
          </TextField>
          <Autocomplete
            options={taskWorkspaces}
            getOptionLabel={(option) => option?.name || ''}
            value={taskWorkspaces.find((w) => String(w.id) === String(editing.task_workspace_id)) || null}
            onChange={(_e, val) => setEditing((prev) => ({ ...prev, task_workspace_id: val?.id || '' }))}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Task Workspace"
                placeholder="Select a workspace"
                required
                error={!editing.task_workspace_id && editing.client_identifier_value}
                helperText={
                  !editing.task_workspace_id && editing.client_identifier_value ? 'Workspace is required when Client Identifier is set' : ''
                }
              />
            )}
            loading={taskWorkspacesLoading}
          />
          <TextField
            label="Board Prefix"
            value={editing.board_prefix || ''}
            onChange={handleEditChange('board_prefix')}
            helperText="Prepended to every item created on this client board (ex: ACME - Fix homepage)."
          />
          {editing.task_board_id && (
            <Alert severity="success" sx={{ borderRadius: 1 }}>
              Task board is provisioned for this client.
            </Alert>
          )}
        </>
      )}
      <Typography variant="subtitle1">Monday.com & Looker</Typography>
      <Autocomplete
        options={boards}
        getOptionLabel={(option) => option?.name || ''}
        value={boards.find((b) => String(b.id) === String(editing.monday_board_id)) || null}
        onChange={(_e, val) => {
          setEditing((prev) => ({
            ...prev,
            monday_board_id: val?.id || '',
            monday_group_id: '',
            monday_active_group_id: '',
            monday_completed_group_id: ''
          }));
          loadGroups(val?.id);
        }}
        onInputChange={(_, value) => {
          loadBoards(value);
        }}
        renderInput={(params) => <TextField {...params} label="Monday Board" placeholder="Search boards" />}
        loading={loadingBoards}
      />
      <Autocomplete
        options={groups}
        getOptionLabel={(option) => option?.title || option?.id || ''}
        value={groups.find((g) => String(g.id) === String(editing.monday_group_id)) || null}
        onChange={(_e, val) => setEditing((prev) => ({ ...prev, monday_group_id: val?.id || '' }))}
        renderOption={renderGroupOption}
        renderInput={(params) => <TextField {...params} label="New Request Group" placeholder="Select a group" />}
        disabled={!editing.monday_board_id}
      />
      <Autocomplete
        options={groups}
        getOptionLabel={(option) => option?.title || option?.id || ''}
        value={groups.find((g) => String(g.id) === String(editing.monday_active_group_id)) || null}
        onChange={(_e, val) => setEditing((prev) => ({ ...prev, monday_active_group_id: val?.id || '' }))}
        renderOption={renderGroupOption}
        renderInput={(params) => <TextField {...params} label="Active Tasks Group" placeholder="Select a group" />}
        disabled={!editing.monday_board_id}
      />
      <Autocomplete
        options={groups}
        getOptionLabel={(option) => option?.title || option?.id || ''}
        value={groups.find((g) => String(g.id) === String(editing.monday_completed_group_id)) || null}
        onChange={(_e, val) => setEditing((prev) => ({ ...prev, monday_completed_group_id: val?.id || '' }))}
        renderOption={renderGroupOption}
        renderInput={(params) => <TextField {...params} label="Completed Tasks Group" placeholder="Select a group" />}
        disabled={!editing.monday_board_id}
      />
      <TextField label="Looker URL" value={editing.looker_url || ''} onChange={handleEditChange('looker_url')} />
      <TextField
        label="Informal Business Name"
        value={editing.client_identifier_value || ''}
        onChange={handleEditChange('client_identifier_value')}
      />
      <Autocomplete
        options={people}
        getOptionLabel={(option) => option?.name || option?.email || ''}
        value={people.find((p) => String(p.id) === String(editing.account_manager_person_id)) || null}
        onChange={(_e, val) => setEditing((prev) => ({ ...prev, account_manager_person_id: val?.id || '' }))}
        renderInput={(params) => <TextField {...params} label="Account Manager" placeholder="Select a person" />}
        loading={loadingPeople}
      />
      <Typography variant="subtitle1">Client Type & Services</Typography>
      <Grid
        container
        spacing={2}
        sx={{
          width: '100%',
          '& > .MuiGrid-item': { pl: 0, pr: 0 }
        }}
      >
        <Grid item xs={12} md={6}>
          <TextField
            label="Client Type"
            value={editing.client_type || ''}
            onChange={handleClientTypeSelect}
            select
            fullWidth
            InputLabelProps={{ shrink: true }}
            SelectProps={{
              displayEmpty: true,
              renderValue: (selected) => {
                if (!selected) return 'Not set';
                return CLIENT_TYPE_PRESETS.find((type) => type.value === selected)?.label || selected;
              }
            }}
          >
            <MenuItem value="">
              <em>Not set</em>
            </MenuItem>
            {CLIENT_TYPE_PRESETS.map((type) => (
              <MenuItem key={type.value} value={type.value}>
                {type.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            label="Client Subtype"
            value={editing.client_subtype || ''}
            onChange={handleClientSubtypeSelect}
            select
            fullWidth
            disabled={!subtypeOptions.length}
            InputLabelProps={{ shrink: true }}
            SelectProps={{
              displayEmpty: true,
              renderValue: (selected) => {
                if (!selected) {
                  return subtypeOptions.length ? 'Not set' : 'No presets yet';
                }
                return subtypeOptions.find((sub) => sub.value === selected)?.label || selected;
              }
            }}
          >
            <MenuItem value="">
              <em>{subtypeOptions.length ? 'Not set' : 'No presets yet'}</em>
            </MenuItem>
            {subtypeOptions.map((sub) => (
              <MenuItem key={sub.value} value={sub.value}>
                {sub.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
      </Grid>
      {clientServicesLoading && <LinearProgress />}
      {isAdmin && editing.client_type && (
        <TextField
          label="AI Prompt"
          value={editing.ai_prompt || ''}
          onChange={handleEditChange('ai_prompt')}
          multiline
          minRows={4}
          helperText="Prompt used for CTM lead classification"
        />
      )}
      <FormControlLabel
        control={
          <Switch
            checked={editing.auto_star_enabled || false}
            onChange={(e) => setEditing((prev) => ({ ...prev, auto_star_enabled: e.target.checked }))}
          />
        }
        label="Auto-Star Leads"
      />
      <Typography variant="caption" color="text.secondary" sx={{ mt: -1, mb: 1 }}>
        When enabled, AI will automatically assign star ratings based on classification (never 4 or 5 stars).
        <br />
        1★ = Spam | 2★ = Not a fit | 3★ = Solid lead | 0★ = Voicemail/Unanswered/Neutral | 5★ = Manual only (booked appointment)
      </Typography>
      <TextField label="CTM Account Number" value={editing.ctm_account_number || ''} onChange={handleEditChange('ctm_account_number')} />
      <TextField label="CTM API Key" value={editing.ctm_api_key || ''} onChange={handleEditChange('ctm_api_key')} />
      <TextField label="CTM API Secret" value={editing.ctm_api_secret || ''} onChange={handleEditChange('ctm_api_secret')} />
    </Stack>
  );

  const renderBrandAssetsTab = () => (
    <Stack spacing={2} sx={{ mt: 2 }}>
      <Typography variant="subtitle1">Brand Assets</Typography>
      {docsLoading && <CircularProgress size={20} />}{' '}
      {brandData?.logos?.length ? (
        <Stack spacing={1}>
          {brandData.logos.map((logo) => (
            <Box
              key={logo.id}
              sx={{
                p: 1,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <Typography>{logo.name}</Typography>
              <Button size="small" href={logo.url} target="_blank" rel="noreferrer">
                View
              </Button>
            </Box>
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No brand assets uploaded.
        </Typography>
      )}
      <Divider />
      <Typography variant="subtitle2">Brand Basics</Typography>
      <TextField
        label="Business Name"
        value={brandData?.business_name || ''}
        onChange={(e) => setBrandData((p) => ({ ...(p || {}), business_name: e.target.value }))}
      />
      <TextField
        label="Business Description"
        value={brandData?.business_description || ''}
        onChange={(e) => setBrandData((p) => ({ ...(p || {}), business_description: e.target.value }))}
        multiline
        minRows={3}
      />
      <TextField
        label="Brand Notes"
        value={brandData?.brand_notes || ''}
        onChange={(e) => setBrandData((p) => ({ ...(p || {}), brand_notes: e.target.value }))}
        multiline
        rows={3}
      />
      <TextField
        label="Website URL"
        value={brandData?.website_url || ''}
        onChange={(e) => setBrandData((p) => ({ ...(p || {}), website_url: e.target.value }))}
      />
    </Stack>
  );

  const renderDocumentsTab = () => (
    <Stack spacing={2} sx={{ mt: 2 }}>
      <Typography variant="subtitle1">Upload Documents</Typography>
      <Stack spacing={2}>
        <TextField
          label="Document Label"
          value={docUpload.label}
          onChange={(e) => setDocUpload((p) => ({ ...p, label: e.target.value }))}
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
          <Button variant="outlined" component="label">
            Select Files
            <input
              ref={fileInputRef}
              type="file"
              accept="*/*"
              multiple
              hidden
              onChange={(e) => setDocUpload((p) => ({ ...p, files: Array.from(e.target.files || []) }))}
            />
          </Button>
          {docUpload.files.length ? (
            <Stack spacing={0.5} sx={{ width: '100%' }}>
              {docUpload.files.map((file) => (
                <Typography variant="body2" key={file.name}>
                  {file.name}
                </Typography>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No files selected
            </Typography>
          )}
        </Stack>
        <FormControlLabel
          control={
            <Checkbox checked={docUpload.forReview} onChange={(e) => setDocUpload((p) => ({ ...p, forReview: e.target.checked }))} />
          }
          label='Mark as "For Review" and notify client'
        />
        <Button variant="contained" disableElevation onClick={handleDocUpload} disabled={!docUpload.files.length || uploadingDocs}>
          {uploadingDocs ? 'Uploading…' : 'Upload Document'}
        </Button>
      </Stack>
      <Divider />
      <Typography variant="subtitle1">Documents</Typography>
      {docsLoading && <CircularProgress size={20} />}{' '}
      {docs.length ? (
        <Stack spacing={1}>
          {docs.map((doc) => (
            <Box
              key={doc.id}
              sx={{
                p: 1,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <Box sx={{ flex: 1, pr: 2 }}>
                <Typography>{doc.label || doc.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {doc.origin === 'admin' ? 'Admin upload' : 'Client upload'}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="flex-end">
                <Button size="small" href={doc.url} target="_blank" rel="noreferrer">
                  View
                </Button>
                {doc.review_status === 'pending' ? (
                  <Button size="small" variant="outlined" onClick={() => updateReview(doc.id, 'clear')}>
                    Clear Review
                  </Button>
                ) : (
                  <Button size="small" variant="contained" onClick={() => updateReview(doc.id, 'pending')}>
                    Mark For Review
                  </Button>
                )}
                {doc.type !== 'default' && (
                  <Button size="small" color="error" onClick={() => handleDocDelete(doc.id)}>
                    Delete
                  </Button>
                )}
              </Stack>
            </Box>
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No documents yet.
        </Typography>
      )}
    </Stack>
  );

  const updateReview = async (docId, action) => {
    if (!editing) return;
    try {
      await client.post('/hub/docs/admin/review', { user_id: editing.id, doc_id: docId, review_action: action });
      await refreshDocs(editing.id);
    } catch (err) {
      reportError(err, 'Unable to update review status');
    }
  };

  const saveBrand = async () => {
    if (!editing || !brandData) return;
    try {
      await client.put(`/hub/brand/admin/${editing.id}`, brandData);
      setSuccess('Brand saved');
    } catch (err) {
      reportError(err, 'Unable to save brand');
    }
  };

  // Format date for display
  const formatEmailDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Compute email stats summary
  const emailStatsSummary = useMemo(() => {
    if (!emailStats || !emailStats.length) return { sent: 0, failed: 0, pending: 0, byType: {} };
    const summary = { sent: 0, failed: 0, pending: 0, byType: {} };
    emailStats.forEach((row) => {
      const count = parseInt(row.count, 10);
      if (row.status === 'sent') summary.sent += count;
      else if (row.status === 'failed') summary.failed += count;
      else if (row.status === 'pending') summary.pending += count;
      if (!summary.byType[row.email_type]) summary.byType[row.email_type] = 0;
      summary.byType[row.email_type] += count;
    });
    return summary;
  }, [emailStats]);

  return (
    <MainCard title="Client Hub">
      <Stack spacing={3}>
        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}

        {/* Top-level Hub Navigation */}
        <Tabs
          value={hubSection}
          onChange={(e, v) => setHubSection(v)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab icon={<PeopleOutlineIcon />} iconPosition="start" label="Users & Clients" />
          <Tab icon={<MailOutlineIcon />} iconPosition="start" label="Email Logs" />
        </Tabs>

        {/* Users & Clients Section */}
        {hubSection === 0 && (
          <>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
          <Box sx={{ flex: 1, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Typography variant="h5" sx={{ mb: 2 }}>
              Add User
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel htmlFor="new-email">Email</InputLabel>
                  <OutlinedInput
                    id="new-email"
                    value={newClient.email}
                    onChange={(e) => setNewClient((p) => ({ ...p, email: e.target.value }))}
                    label="Email"
                    type="email"
                  />
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel htmlFor="new-name">Name</InputLabel>
                  <OutlinedInput
                    id="new-name"
                    value={newClient.name}
                    onChange={(e) => setNewClient((p) => ({ ...p, name: e.target.value }))}
                    label="Name"
                  />
                </FormControl>
              </Grid>
              <Grid item xs={12} md={2}>
                <FormControl fullWidth>
                  <InputLabel id="new-role-label">Role</InputLabel>
                  <Select
                    labelId="new-role-label"
                    value={newClient.role}
                    label="Role"
                    onChange={(e) => setNewClient((p) => ({ ...p, role: e.target.value }))}
                  >
                    {newRolesOptions.map((r) => (
                      <MenuItem key={r} value={r}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={2} sx={{ display: 'flex', alignItems: 'center' }}>
                <Button variant="contained" fullWidth disableElevation onClick={handleAddClient} disabled={savingNew || !newClient.email}>
                  {savingNew ? 'Saving…' : 'Save'}
                </Button>
              </Grid>
            </Grid>
          </Box>
        </Box>

        {isAdmin && (
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2 }}>
            <Box sx={{ p: 2 }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                alignItems={{ xs: 'stretch', sm: 'center' }}
                justifyContent="space-between"
              >
                <Typography variant="h5">Staff</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  {loading && <CircularProgress size={20} />}
                  <TextField
                    size="small"
                    placeholder="Search staff…"
                    value={adminsQuery}
                    onChange={(e) => setAdminsQuery(e.target.value)}
                  />
                </Stack>
              </Stack>
            </Box>
            <Divider />
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Display Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredAdmins.map((c) => (
                    <TableRow key={c.id} hover>
                      <TableCell>{`${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email}</TableCell>
                      <TableCell>{c.email}</TableCell>
                      <TableCell sx={{ textTransform: 'capitalize' }}>{c.role || 'admin'}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => startEdit(c)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {isAdmin && (
                            <Tooltip title="Delete">
                              <span>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => confirmDeleteClient(c.id)}
                                  disabled={deletingClientId === c.id}
                                >
                                  {deletingClientId === c.id ? (
                                    <CircularProgress size={18} color="inherit" />
                                  ) : (
                                    <DeleteOutlineIcon fontSize="small" />
                                  )}
                                </IconButton>
                              </span>
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!filteredAdmins.length && !loading && (
                    <TableRow>
                      <TableCell colSpan={4} align="center">
                        No staff yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Box sx={{ p: 2 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              alignItems={{ xs: 'stretch', sm: 'center' }}
              justifyContent="space-between"
            >
            <Typography variant="h5">Clients</Typography>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" justifyContent="flex-end">
            {loading && <CircularProgress size={20} />}
                <TextField
                  size="small"
                  placeholder="Search clients…"
                  value={clientsQuery}
                  onChange={(e) => setClientsQuery(e.target.value)}
                />
                {isAdmin && (
                  <>
                    <Select
                      size="small"
                      value={bulkAction}
                      onChange={(e) => setBulkAction(e.target.value)}
                      displayEmpty
                      renderValue={(v) => (v ? (v === 'send_onboarding' ? 'Send onboarding email' : 'Delete') : 'Bulk Actions')}
                      sx={{ minWidth: 220 }}
                      disabled={!selectedClientIds.length}
                    >
                      <MenuItem value="">
                        <em>Bulk Actions</em>
                      </MenuItem>
                      <MenuItem value="send_onboarding">Send onboarding email</MenuItem>
                      <MenuItem value="delete">Delete</MenuItem>
                    </Select>
                    <Button
                      size="small"
                      variant="contained"
                      disableElevation
                      onClick={handleApplyBulkAction}
                      disabled={!selectedClientIds.length || !bulkAction || bulkDeleting || bulkSendingOnboarding}
                    >
                      Apply
                    </Button>
                  </>
                )}
              </Stack>
            </Stack>
            {selectedClientIds.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                Selected: {selectedClientIds.length}
              </Typography>
            )}
          </Box>
          <Divider />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={filteredClients.length > 0 && filteredClients.every((c) => selectedClientIds.includes(c.id))}
                      indeterminate={
                        filteredClients.some((c) => selectedClientIds.includes(c.id)) &&
                        !filteredClients.every((c) => selectedClientIds.includes(c.id))
                      }
                      onChange={toggleSelectAllFilteredClients}
                      disabled={!isAdmin}
                    />
                  </TableCell>
                  <TableCell>Display Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Onboarding</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredClients.map((c) => (
                    <TableRow key={c.id} hover>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={selectedClientIds.includes(c.id)}
                        onChange={() => toggleSelectClient(c.id)}
                        disabled={!isAdmin}
                      />
                    </TableCell>
                      <TableCell>{`${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email}</TableCell>
                      <TableCell>{c.email}</TableCell>
                    <TableCell sx={{ textTransform: 'capitalize' }}>{c.role || 'client'}</TableCell>
                      <TableCell>
                      {c.role === 'client' ? (
                        c.onboarding_completed_at ? (
                          c.activated_at ? (
                            <Typography
                              variant="caption"
                              sx={{ fontWeight: 600, color: 'success.main' }}
                              title={`Activated: ${new Date(c.activated_at).toLocaleString()}`}
                            >
                              Active
                            </Typography>
                          ) : (
                            <Typography
                              variant="caption"
                              sx={{ fontWeight: 600, color: 'info.main' }}
                              title={`Onboarding completed: ${new Date(c.onboarding_completed_at).toLocaleString()}`}
                            >
                              Pending Activation
                            </Typography>
                          )
                        ) : (
                          <Typography variant="caption" sx={{ fontWeight: 600, color: 'warning.main' }}>
                            Onboarding
                          </Typography>
                        )
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                          —
                          </Typography>
                        )}
                      </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => startEdit(c)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {isAdmin && (
                          <Tooltip title="Delete">
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => confirmDeleteClient(c.id)}
                                disabled={deletingClientId === c.id}
                              >
                                {deletingClientId === c.id ? (
                                  <CircularProgress size={18} color="inherit" />
                                ) : (
                                  <DeleteOutlineIcon fontSize="small" />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                        {c.role === 'client' && !c.onboarding_completed_at && (
                          <>
                            <Tooltip title="Copy onboarding link">
                              <span>
                                <IconButton
                                  size="small"
                                  onClick={() => handleCopyOnboardingLink(c.id)}
                                  disabled={copyingLinkForId === c.id}
                                >
                                  {copyingLinkForId === c.id ? (
                                    <CircularProgress size={18} color="inherit" />
                                  ) : (
                                    <ContentCopyIcon fontSize="small" />
                                  )}
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => handleSendOnboardingEmailNow(c.id)}
                              disabled={sendingOnboardingForId === c.id}
                            >
                              {sendingOnboardingForId === c.id ? 'Sending…' : 'Send onboarding email'}
                            </Button>
                          </>
                        )}
                        {c.role === 'client' && c.onboarding_completed_at && !c.activated_at && (
                          <Button
                            size="small"
                            variant="contained"
                            color="secondary"
                            onClick={() => handleActivateClient(c.id)}
                            disabled={activatingClientId === c.id}
                          >
                            {activatingClientId === c.id ? 'Activating…' : 'Activate'}
                          </Button>
                        )}
                        {(c.role !== 'client' || Boolean(c.onboarding_completed_at)) && (
                          <Button
                            size="small"
                            variant="contained"
                            disableElevation
                            onClick={() => {
                              if (c.role === 'client' && !c.onboarding_completed_at) return;
                              setActingClient(c.id);
                              navigate('/portal');
                            }}
                          >
                            Jump to View
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredClients.length && !loading && (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      No clients yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
          </>
        )}

        {/* Email Logs Section */}
        {hubSection === 1 && (
          <Stack spacing={3}>
            {/* Stats Summary */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Card variant="outlined" sx={{ minWidth: 140, flex: 1 }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CheckCircleIcon color="success" />
                    <Box>
                      <Typography variant="h4" color="success.main">{emailStatsSummary.sent}</Typography>
                      <Typography variant="caption" color="text.secondary">Sent (30d)</Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
              <Card variant="outlined" sx={{ minWidth: 140, flex: 1 }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <ErrorIcon color="error" />
                    <Box>
                      <Typography variant="h4" color="error.main">{emailStatsSummary.failed}</Typography>
                      <Typography variant="caption" color="text.secondary">Failed (30d)</Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
              <Card variant="outlined" sx={{ minWidth: 140, flex: 1 }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <ScheduleIcon color="warning" />
                    <Box>
                      <Typography variant="h4" color="warning.main">{emailStatsSummary.pending}</Typography>
                      <Typography variant="caption" color="text.secondary">Pending</Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Box>

            {/* Filters */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
              <TextField
                size="small"
                placeholder="Search emails..."
                value={emailLogsFilters.search}
                onChange={(e) => handleEmailLogsFilterChange('search', e.target.value)}
                sx={{ minWidth: 200 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <MailOutlineIcon fontSize="small" />
                    </InputAdornment>
                  )
                }}
              />
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Type</InputLabel>
                <Select
                  value={emailLogsFilters.emailType}
                  label="Type"
                  onChange={(e) => handleEmailLogsFilterChange('emailType', e.target.value)}
                >
                  <MenuItem value="all">All Types</MenuItem>
                  {Object.entries(EMAIL_TYPE_LABELS).map(([key, label]) => (
                    <MenuItem key={key} value={key}>{label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={emailLogsFilters.status}
                  label="Status"
                  onChange={(e) => handleEmailLogsFilterChange('status', e.target.value)}
                >
                  <MenuItem value="all">All Statuses</MenuItem>
                  <MenuItem value="sent">Sent</MenuItem>
                  <MenuItem value="failed">Failed</MenuItem>
                  <MenuItem value="pending">Pending</MenuItem>
                </Select>
              </FormControl>
              <Button variant="outlined" size="small" onClick={loadEmailLogs} disabled={emailLogsLoading}>
                {emailLogsLoading ? 'Loading...' : 'Refresh'}
              </Button>
            </Stack>

            {/* Email Logs Table */}
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              {emailLogsLoading && <LinearProgress />}
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Recipient</TableCell>
                      <TableCell>Subject</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {emailLogs.map((log) => (
                      <TableRow key={log.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Typography variant="body2">{formatEmailDate(log.created_at)}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={EMAIL_TYPE_LABELS[log.email_type] || log.email_type}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>
                            {log.recipient_name || log.recipient_email}
                          </Typography>
                          {log.recipient_name && (
                            <Typography variant="caption" color="text.secondary">
                              {log.recipient_email}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 300 }}>
                          <Typography variant="body2" noWrap>
                            {log.subject}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            icon={
                              log.status === 'sent' ? <CheckCircleIcon /> :
                              log.status === 'failed' ? <ErrorIcon /> :
                              <ScheduleIcon />
                            }
                            label={STATUS_COLORS[log.status]?.label || log.status}
                            size="small"
                            color={STATUS_COLORS[log.status]?.color || 'default'}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="View Details">
                            <IconButton size="small" onClick={() => handleViewEmailLog(log)}>
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!emailLogs.length && !emailLogsLoading && (
                      <TableRow>
                        <TableCell colSpan={6} align="center">
                          <Typography color="text.secondary" sx={{ py: 3 }}>
                            No email logs found
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={emailLogsPagination.total}
                page={emailLogsPagination.page - 1}
                onPageChange={handleEmailLogsPageChange}
                rowsPerPage={emailLogsPagination.limit}
                onRowsPerPageChange={handleEmailLogsRowsPerPageChange}
                rowsPerPageOptions={[10, 25, 50, 100]}
              />
            </Box>
          </Stack>
        )}
      </Stack>

      {/* Email Detail Dialog */}
      <Dialog
        open={emailLogDetail.open}
        onClose={() => setEmailLogDetail({ open: false, log: null, loading: false })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h5">Email Details</Typography>
            {emailLogDetail.log && (
              <Chip
                icon={
                  emailLogDetail.log.status === 'sent' ? <CheckCircleIcon /> :
                  emailLogDetail.log.status === 'failed' ? <ErrorIcon /> :
                  <ScheduleIcon />
                }
                label={STATUS_COLORS[emailLogDetail.log.status]?.label || emailLogDetail.log.status}
                size="small"
                color={STATUS_COLORS[emailLogDetail.log.status]?.color || 'default'}
              />
            )}
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {emailLogDetail.loading ? (
            <Stack alignItems="center" sx={{ py: 4 }}>
              <CircularProgress />
              <Typography sx={{ mt: 2 }}>Loading email details...</Typography>
            </Stack>
          ) : emailLogDetail.log ? (
            <Stack spacing={3}>
              {/* Basic Info */}
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>Email Type</Typography>
                <Chip
                  label={EMAIL_TYPE_LABELS[emailLogDetail.log.email_type] || emailLogDetail.log.email_type}
                  size="small"
                  variant="outlined"
                />
              </Box>
              <Divider />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">Recipient</Typography>
                  <Typography>{emailLogDetail.log.recipient_name || '—'}</Typography>
                  <Typography variant="body2" color="text.secondary">{emailLogDetail.log.recipient_email}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">Sent At</Typography>
                  <Typography>{formatEmailDate(emailLogDetail.log.sent_at || emailLogDetail.log.created_at)}</Typography>
                </Grid>
              </Grid>
              {emailLogDetail.log.cc_emails?.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">CC</Typography>
                  <Typography variant="body2">{emailLogDetail.log.cc_emails.join(', ')}</Typography>
                </Box>
              )}
              <Divider />
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>Subject</Typography>
                <Typography>{emailLogDetail.log.subject}</Typography>
              </Box>

              {/* Error Message if failed */}
              {emailLogDetail.log.status === 'failed' && emailLogDetail.log.error_message && (
                <Alert severity="error">
                  <Typography variant="subtitle2">Error Message</Typography>
                  <Typography variant="body2">{emailLogDetail.log.error_message}</Typography>
                </Alert>
              )}

              {/* Mailgun Info */}
              {emailLogDetail.log.mailgun_id && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">Mailgun ID</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {emailLogDetail.log.mailgun_id}
                  </Typography>
                </Box>
              )}

              <Divider />

              {/* Email Content */}
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>Email Content</Typography>
                {emailLogDetail.log.html_body ? (
                  <Paper variant="outlined" sx={{ p: 2, maxHeight: 400, overflow: 'auto' }}>
                    <div dangerouslySetInnerHTML={{ __html: emailLogDetail.log.html_body }} />
                  </Paper>
                ) : emailLogDetail.log.text_body ? (
                  <Paper variant="outlined" sx={{ p: 2, maxHeight: 400, overflow: 'auto' }}>
                    <Typography
                      variant="body2"
                      component="pre"
                      sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', m: 0 }}
                    >
                      {emailLogDetail.log.text_body}
                    </Typography>
                  </Paper>
                ) : (
                  <Typography color="text.secondary" fontStyle="italic">
                    No content available
                  </Typography>
                )}
              </Box>

              {/* Metadata */}
              {emailLogDetail.log.metadata && Object.keys(emailLogDetail.log.metadata).length > 0 && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>Metadata</Typography>
                  <Paper variant="outlined" sx={{ p: 1.5 }}>
                    <Typography
                      variant="body2"
                      component="pre"
                      sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', m: 0, fontSize: '0.75rem' }}
                    >
                      {JSON.stringify(emailLogDetail.log.metadata, null, 2)}
                    </Typography>
                  </Paper>
                </Box>
              )}

              {/* Triggered By / Client Info */}
              <Divider />
              <Grid container spacing={2}>
                {emailLogDetail.log.triggered_by_email && (
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="text.secondary">Triggered By</Typography>
                    <Typography>
                      {emailLogDetail.log.triggered_by_first_name} {emailLogDetail.log.triggered_by_last_name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">{emailLogDetail.log.triggered_by_email}</Typography>
                  </Grid>
                )}
                {emailLogDetail.log.client_email && (
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="text.secondary">Related Client</Typography>
                    <Typography>
                      {emailLogDetail.log.client_first_name} {emailLogDetail.log.client_last_name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">{emailLogDetail.log.client_email}</Typography>
                  </Grid>
                )}
              </Grid>
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailLogDetail({ open: false, log: null, loading: false })}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Drawer
        anchor="right"
        open={Boolean(editing) && !onboardingWizardOpen}
        onClose={() => setEditing(null)}
        sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', sm: '40vw' }, p: 2 } }}
      >
        {editing && (
          <Stack spacing={2} sx={{ height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="h5">Editing: {editing.first_name || editing.email}</Typography>
              <IconButton onClick={() => setEditing(null)} aria-label="close">
                ×
              </IconButton>
            </Box>
            <Button variant="text" onClick={() => setEditing(null)} sx={{ alignSelf: 'flex-start' }}>
              Back to All Clients
            </Button>
            <Tabs value={activeTab} onChange={(_e, v) => setActiveTab(v)} variant="scrollable" allowScrollButtonsMobile>
              <Tab label="Client Details" />
              <Tab label="Client Assets" />
              <Tab label="Client Documents" />
            </Tabs>
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              {activeTab === 0 && renderDetailsTab()}
              {activeTab === 1 && renderBrandAssetsTab()}
              {activeTab === 2 && renderDocumentsTab()}
            </Box>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              {editing?.role === 'client' && !editing?.onboarding_completed_at && (
                <>
                  <Tooltip title="Copy onboarding link to clipboard">
                    <Button
                      variant="text"
                      onClick={() => handleCopyOnboardingLink(editing.id)}
                      disabled={copyingLinkForId === editing.id}
                      startIcon={copyingLinkForId === editing.id ? <CircularProgress size={16} /> : <ContentCopyIcon />}
                    >
                      {copyingLinkForId === editing.id ? 'Copying…' : 'Copy Link'}
                    </Button>
                  </Tooltip>
                  <Button
                    variant="outlined"
                    onClick={() => handleSendOnboardingEmailNow(editing.id)}
                    disabled={sendingOnboardingForId === editing.id}
                  >
                    {sendingOnboardingForId === editing.id ? 'Sending…' : 'Send onboarding email'}
                  </Button>
                </>
              )}
              {editing?.role === 'client' && editing?.onboarding_completed_at && !editing?.activated_at && (
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={() => handleActivateClient(editing.id)}
                  disabled={activatingClientId === editing.id}
                >
                  {activatingClientId === editing.id ? 'Activating…' : 'Activate Account'}
                </Button>
              )}
              <Button onClick={() => setEditing(null)} color="secondary">
                Cancel
              </Button>
              {activeTab === 1 && (
                <Button variant="outlined" onClick={saveBrand} disabled={!brandData}>
                  Save Assets
                </Button>
              )}
              {activeTab === 0 && (
                <Button variant="contained" disableElevation onClick={handleSaveEdit} disabled={savingEdit}>
                  {savingEdit ? 'Saving…' : 'Save Changes'}
                </Button>
              )}
            </Stack>
          </Stack>
        )}
      </Drawer>

      <Dialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, clientId: null, label: '', hasBoard: false, deleteBoard: false })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete Client</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone.
          </Alert>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Are you sure you want to delete {deleteConfirm.label || 'this client'}?
          </Typography>
          {deleteConfirm.hasBoard && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={deleteConfirm.deleteBoard}
                  onChange={(e) => setDeleteConfirm((prev) => ({ ...prev, deleteBoard: e.target.checked }))}
                />
              }
              label="Also delete associated task board"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm({ open: false, clientId: null, label: '', hasBoard: false, deleteBoard: false })}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={handleDeleteClient} disabled={Boolean(deletingClientId)}>
            {deletingClientId ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={bulkDeleteConfirmOpen} onClose={() => setBulkDeleteConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Clients</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 1 }}>
            This action cannot be undone.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to delete {selectedClientIds.length} client(s)?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDeleteConfirmOpen(false)} disabled={bulkDeleting}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={handleBulkDeleteClients} disabled={bulkDeleting || !selectedClientIds.length}>
            {bulkDeleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={onboardingWizardOpen} onClose={handleWizardClose} fullWidth maxWidth="md">
        <DialogTitle sx={{ pb: 1 }}>
          <Stack spacing={0.5}>
            <Typography variant="h5">New Client Onboarding</Typography>
            <Typography variant="body2" color="text.secondary">
              Capture the core client details, then decide whether to trigger their onboarding email.
            </Typography>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3}>
            <Stepper
              activeStep={onboardingStep}
              alternativeLabel
              sx={{
                '& .MuiStepLabel-label.Mui-active': { fontWeight: 700, transform: 'scale(1.03)' },
                '& .MuiStepLabel-labelContainer': { transformOrigin: 'center' }
              }}
            >
              <Step>
                <StepLabel StepIconComponent={AnchorStepIcon}>Client Details</StepLabel>
              </Step>
              <Step>
                <StepLabel StepIconComponent={AnchorStepIcon}>Access Scope</StepLabel>
              </Step>
              <Step>
                <StepLabel StepIconComponent={AnchorStepIcon}>Onboarding Email</StepLabel>
              </Step>
            </Stepper>
            {onboardingStep === 0 && editing && (
              <Card variant="outlined" sx={{ boxShadow: 'none', borderRadius: 2 }}>
                <CardContent>
                  <Stack spacing={1.5} sx={{ mb: 2 }}>
                    <Typography variant="subtitle1">Client Details</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Confirm the account metadata and workflow settings before inviting the client.
                    </Typography>
                  </Stack>
                  <Box sx={{ maxHeight: { xs: '60vh', md: '55vh' }, overflowY: 'auto', pr: 1 }}>{renderDetailsTab()}</Box>
                </CardContent>
              </Card>
            )}
            {onboardingStep === 1 && editing && (
              <Card variant="outlined" sx={{ boxShadow: 'none', borderRadius: 2 }}>
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant="subtitle1">Access Steps</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Pick which access steps this client should see in their onboarding. Unchecked items won&apos;t appear in the
                      client-facing flow.
                    </Typography>
                    <Grid container spacing={1}>
                      {ACCESS_STEP_OPTIONS.map((option) => (
                        <Grid item xs={12} sm={6} key={option.key}>
                    <FormControlLabel
                      control={
                              <Checkbox
                                checked={editing?.[option.key] !== false}
                                onChange={toggleAccessRequirement(option.key)}
                                color="primary"
                              />
                            }
                            label={option.label}
                          />
                        </Grid>
                      ))}
                    </Grid>
                    <Alert severity="info" sx={{ borderRadius: 1 }}>
                      These settings only affect the client onboarding form. You can update them anytime.
                    </Alert>
                  </Stack>
                </CardContent>
              </Card>
            )}
            {onboardingStep === 2 && editing && (
              <Card variant="outlined" sx={{ boxShadow: 'none', borderRadius: 2 }}>
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant="subtitle1">Send Client Onboarding Email?</Typography>
                    <Typography variant="body2" color="text.secondary">
                      We&apos;ll email <strong>{editing.email}</strong> a secure link so they can set a password, confirm services, and
                      provide brand details.
                    </Typography>
                    <FormControlLabel
                      control={<Switch checked={sendOnboardingEmailFlag} onChange={(e) => setSendOnboardingEmailFlag(e.target.checked)} />}
                      label="Send onboarding email immediately"
                    />
                    {!sendOnboardingEmailFlag && (
                      <Alert severity="info" sx={{ borderRadius: 1 }}>
                        You can send the onboarding email later from the client hub if you need to finish configuration first.
                      </Alert>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          {onboardingStep === 0 ? (
            <>
              <Button onClick={handleWizardClose}>Cancel</Button>
              <Button variant="contained" onClick={handleWizardNext} disabled={savingEdit || onboardingLoading}>
                {savingEdit ? 'Saving…' : 'Continue'}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={handleWizardBack} disabled={savingEdit || onboardingLoading || sendingOnboardingEmail}>
                Back
              </Button>
              <Button
                variant="contained"
                onClick={onboardingStep === ONBOARDING_WIZARD_LAST_STEP ? handleWizardFinish : handleWizardNext}
                disabled={sendingOnboardingEmail || onboardingLoading}
              >
                {onboardingStep === ONBOARDING_WIZARD_LAST_STEP
                  ? sendingOnboardingEmail
                    ? 'Sending…'
                    : 'Finish'
                  : savingEdit || onboardingLoading
                    ? 'Saving…'
                    : 'Continue'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </MainCard>
  );
}
