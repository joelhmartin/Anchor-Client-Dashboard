import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';

import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Rating from '@mui/material/Rating';
import InputBase from '@mui/material/InputBase';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import ArchiveIcon from '@mui/icons-material/Archive';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CallMadeIcon from '@mui/icons-material/CallMade';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SearchIcon from '@mui/icons-material/Search';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import DownloadIcon from '@mui/icons-material/Download';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PeopleIcon from '@mui/icons-material/People';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import WarningIcon from '@mui/icons-material/Warning';
import RefreshIcon from '@mui/icons-material/Refresh';
import RestoreIcon from '@mui/icons-material/Restore';
import PersonIcon from '@mui/icons-material/Person';

import MainCard from 'ui-component/cards/MainCard';
import FireworksCanvas from 'ui-component/FireworksCanvas';
import ReviewsPanel from './ReviewsPanel';
import useAuth from 'hooks/useAuth';
import { fetchAnalyticsUrl } from 'api/analytics';
import { fetchProfile, updateProfile, uploadAvatar } from 'api/profile';
import { fetchBrand, saveBrand } from 'api/brand';
import { deleteDocument, fetchDocuments, fetchSharedDocuments, markDocumentViewed, uploadDocuments } from 'api/documents';
import { fetchTasksAndRequests, submitRequest } from 'api/requests';
import {
  fetchCalls,
  syncCalls,
  scoreCall,
  clearCallScore,
  clearAndReloadCalls,
  fetchLeadStats,
  fetchLeadDetail,
  exportLeadsCsv,
  fetchPipelineStages,
  moveLeadToStage,
  fetchLeadNotes,
  addLeadNote,
  fetchSavedViews,
  createSavedView,
  deleteSavedView,
  fetchAllTags,
  addTagToCall,
  removeTagFromCall,
  updateCallCategory
} from 'api/calls';
import { fetchServices, agreeToService, fetchActiveClients, archiveActiveClient, restoreActiveClient } from 'api/services';
import {
  fetchJourneys,
  createJourney,
  updateJourney,
  addJourneyNote,
  addJourneyStep,
  updateJourneyStep,
  deleteJourneyStep,
  fetchJourneyTemplate,
  saveJourneyTemplate,
  applyJourneyTemplate,
  archiveJourney,
  restoreJourney
} from 'api/journeys';
import { CLIENT_CONCERN_PRESETS } from 'constants/clientPresets';
import Button from '@mui/material/Button';

const SECTION_CONFIG = [
  { value: 'profile', label: 'Profile' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'leads', label: 'Leads' },
  { value: 'reviews', label: 'Reviews' },
  { value: 'journey', label: 'Client Journey' },
  { value: 'archive', label: 'Archive' },
  { value: 'brand', label: 'Brand Assets' },
  { value: 'documents', label: 'Documents' }
];

const JOURNEY_STATUS_OPTIONS = ['pending', 'in_progress', 'active_client', 'won', 'lost', 'archived'];

// Category color mapping for visual distinction
const CATEGORY_COLORS = {
  converted: { bg: '#d1fae5', text: '#047857', border: '#34d399' }, // Green - successful conversion (manual only)
  active_client: { bg: '#dbeafe', text: '#1e40af', border: '#60a5fa' }, // Blue - existing customer
  returning_customer: { bg: '#e0e7ff', text: '#4338ca', border: '#818cf8' }, // Indigo - past customer returning
  warm: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  very_good: { bg: '#bbf7d0', text: '#065f46', border: '#6ee7b7' },
  applicant: { bg: '#fef3c7', text: '#92400e', border: '#fbbf24' }, // Job applicant
  needs_attention: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  voicemail: { bg: '#f5f5f5', text: '#525252', border: '#d4d4d4' },
  unanswered: { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
  not_a_fit: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  spam: { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
  neutral: { bg: '#f5f5f5', text: '#525252', border: '#d4d4d4' },
  unreviewed: { bg: '#e0e7ff', text: '#3730a3', border: '#a5b4fc' }
};

const getCategoryColor = (category) => CATEGORY_COLORS[category?.toLowerCase()] || CATEGORY_COLORS.unreviewed;

const formatDateInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
};

const formatDateDisplay = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
};

const fieldLabels = {
  business_name: 'Business Name',
  business_description: 'Business Description',
  brand_notes: 'Brand Notes',
  website_url: 'Website URL'
};

const BRAND_FIELD_ORDER = ['business_name', 'business_description', 'brand_notes', 'website_url'];

export default function ClientPortal() {
  const { actingClientId, clearActingClient, refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const tabParam = searchParams.get('tab') || 'profile';
  const [activeTab, setActiveTab] = useState(tabParam);
  const [message, setMessage] = useState({ type: '', text: '' });

  const [analyticsUrl, setAnalyticsUrl] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsFetched, setAnalyticsFetched] = useState(false);

  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({
    display_name: '',
    email: '',
    current_password: '',
    new_password: '',
    new_password_confirm: '',
    monthly_revenue_goal: ''
  });
  const [profileLoading, setProfileLoading] = useState(false);

  const [brand, setBrand] = useState(null);
  const [brandFields, setBrandFields] = useState({});
  const [accessFields, setAccessFields] = useState({
    website_access_provided: false,
    website_access_understood: false,
    ga4_access_provided: false,
    ga4_access_understood: false,
    google_ads_access_provided: false,
    google_ads_access_understood: false,
    meta_access_provided: false,
    meta_access_understood: false,
    website_forms_details_provided: false,
    website_forms_details_understood: false,
    website_forms_uses_third_party: false,
    website_forms_uses_hipaa: false,
    website_forms_connected_crm: false,
    website_forms_custom: false,
    website_forms_notes: ''
  });
  const [logoUploads, setLogoUploads] = useState([]);
  const [styleUploads, setStyleUploads] = useState([]);
  const [logoDeletions, setLogoDeletions] = useState([]);
  const [styleDeletions, setStyleDeletions] = useState([]);
  const [brandSaving, setBrandSaving] = useState(false);

  const [documents, setDocuments] = useState(null);
  const [sharedDocuments, setSharedDocuments] = useState(null);
  const [docUploads, setDocUploads] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const [requestsData, setRequestsData] = useState(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskView, setTaskView] = useState('active');
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({ title: '', description: '', due_date: '', rush: false });
  const [requestAttachment, setRequestAttachment] = useState(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [rushConfirmOpen, setRushConfirmOpen] = useState(false);

  const [calls, setCalls] = useState(null);
  const [callsLoading, setCallsLoading] = useState(false);
  const [callFilters, setCallFilters] = useState({ type: 'all', source: 'all', category: 'all', callerType: 'all' });
  const [clearCallsDialogOpen, setClearCallsDialogOpen] = useState(false);
  const [ratingPending, setRatingPending] = useState({});
  const [reclassifyDialog, setReclassifyDialog] = useState({ open: false, loading: false, limit: 200 });

  // CRM Enhancement State
  const [leadStats, setLeadStats] = useState(null);
  const [leadStatsLoading, setLeadStatsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [viewMode, setViewMode] = useState('card'); // 'card' or 'table'
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0 });
  const [leadDetailDrawer, setLeadDetailDrawer] = useState({ open: false, lead: null, detail: null, loading: false, tab: 0 });
  const [pipelineStages, setPipelineStages] = useState([]);
  const [savedViews, setSavedViews] = useState([]);
  const [activeView, setActiveView] = useState(null);
  const [leadNotes, setLeadNotes] = useState({});
  const [newNoteText, setNewNoteText] = useState('');

  // Tags state
  const [allTags, setAllTags] = useState([]);
  const [callTags, setCallTags] = useState({}); // { callId: [tags] }
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [categoryMenuAnchor, setCategoryMenuAnchor] = useState(null);
  const [categoryMenuCallId, setCategoryMenuCallId] = useState(null);

  const [updatesDialog, setUpdatesDialog] = useState({ open: false, task: null });

  const [services, setServices] = useState([]);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [serviceDialogLead, setServiceDialogLead] = useState(null);
  const [selectedServices, setSelectedServices] = useState([]);
  // IMPORTANT: distinguish "not loaded yet" (null) from "loaded but empty" ([]),
  // otherwise the journey tab can get stuck in a refetch loop when there are zero journeys.
  const [journeys, setJourneys] = useState(null);
  const [journeysLoading, setJourneysLoading] = useState(false);
  const [concernDialog, setConcernDialog] = useState({
    open: false,
    lead: null,
    journeyId: null,
    values: [],
    forceNew: false,
    activeClientId: null
  });
  const [concernSaving, setConcernSaving] = useState(false);
  const [stepDialog, setStepDialog] = useState({
    open: false,
    journeyId: null,
    stepId: null,
    form: { label: '', channel: '', message: '', offset_weeks: 0, due_at: '' }
  });
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateDraft, setTemplateDraft] = useState([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [noteDialog, setNoteDialog] = useState({ open: false, journeyId: null, stepId: null, value: '' });
  const [timelineDialog, setTimelineDialog] = useState({ open: false, journey: null });
  const [journeyDrawer, setJourneyDrawer] = useState({ open: false, journey: null });
  const [expandedSteps, setExpandedSteps] = useState({});
  const [archivedJourneys, setArchivedJourneys] = useState([]);
  const [archivedClients, setArchivedClients] = useState([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveLoaded, setArchiveLoaded] = useState(false);
  const [onboardingModalOpen, setOnboardingModalOpen] = useState(Boolean(location.state?.onboardingComplete));

  // Save View Dialog
  const [saveViewDialog, setSaveViewDialog] = useState({ open: false, name: '' });

  // Archive Confirmation Dialog
  const [archiveConfirmDialog, setArchiveConfirmDialog] = useState({ open: false, type: null, item: null });

  // Clear navigation state after showing the modal so it doesn't re-open on subsequent navigations.
  useEffect(() => {
    if (onboardingModalOpen && location.state?.onboardingComplete) {
      navigate(location.pathname + location.search, { replace: true, state: {} });
    }
  }, [onboardingModalOpen, location.pathname, location.search, location.state, navigate]);

  const handleCloseRequestDialog = () => {
    setRequestDialogOpen(false);
    setRequestAttachment(null);
    setRushConfirmOpen(false);
  };

  useEffect(() => {
    setActiveTab(tabParam);
    setMessage({ type: '', text: '' });
  }, [tabParam]);

  const triggerMessage = useCallback((type, text) => setMessage({ type, text }), []);
  const currentSection = useMemo(() => SECTION_CONFIG.find((section) => section.value === activeTab) || SECTION_CONFIG[0], [activeTab]);

  const ensureAnalytics = useCallback(() => {
    if (analyticsFetched || analyticsLoading) return;
    setAnalyticsLoading(true);
    fetchAnalyticsUrl()
      .then((url) => setAnalyticsUrl(url || null))
      .catch((err) => triggerMessage('error', err.message || 'Unable to load analytics'))
      .finally(() => {
        setAnalyticsFetched(true);
        setAnalyticsLoading(false);
      });
  }, [analyticsFetched, analyticsLoading, triggerMessage]);

  const loadProfile = useCallback(() => {
    setProfileLoading(true);
    fetchProfile()
      .then((data) => {
        setProfile(data);
        setProfileForm({
          display_name: [data.first_name, data.last_name].filter(Boolean).join(' ') || data.email,
          email: data.email,
          current_password: '',
          new_password: '',
          new_password_confirm: '',
          monthly_revenue_goal: data.monthly_revenue_goal || ''
        });
        setAccessFields((prev) => ({
          ...prev,
          website_access_provided: data.website_access_provided || false,
          website_access_understood: data.website_access_understood || false,
          ga4_access_provided: data.ga4_access_provided || false,
          ga4_access_understood: data.ga4_access_understood || false,
          google_ads_access_provided: data.google_ads_access_provided || false,
          google_ads_access_understood: data.google_ads_access_understood || false,
          meta_access_provided: data.meta_access_provided || false,
          meta_access_understood: data.meta_access_understood || false,
          website_forms_details_provided: data.website_forms_details_provided || false,
          website_forms_details_understood: data.website_forms_details_understood || false,
          website_forms_uses_third_party: data.website_forms_uses_third_party || false,
          website_forms_uses_hipaa: data.website_forms_uses_hipaa || false,
          website_forms_connected_crm: data.website_forms_connected_crm || false,
          website_forms_custom: data.website_forms_custom || false,
          website_forms_notes: data.website_forms_notes || ''
        }));
      })
      .catch((err) => triggerMessage('error', err.message || 'Unable to load profile'))
      .finally(() => setProfileLoading(false));
  }, []);

  const loadBrand = useCallback(() => {
    fetchBrand()
      .then((data) => {
        setBrand(data);
        setBrandFields({
          business_name: data.business_name || '',
          business_description: data.business_description || '',
          brand_notes: data.brand_notes || '',
          website_url: data.website_url || ''
        });
      })
      .catch((err) => triggerMessage('error', err.message || 'Unable to load brand profile'));
  }, []);

  const loadDocuments = useCallback(async () => {
    setDocsLoading(true);
    try {
      const [docs, shared] = await Promise.all([fetchDocuments(), fetchSharedDocuments()]);
      setDocuments(docs);
      setSharedDocuments(shared);
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to load documents');
    } finally {
      setDocsLoading(false);
    }
  }, [triggerMessage]);

  const loadRequests = useCallback(() => {
    setTasksLoading(true);
    fetchTasksAndRequests()
      .then((data) => setRequestsData(data))
      .catch((err) => triggerMessage('error', err.message || 'Unable to load tasks'))
      .finally(() => setTasksLoading(false));
  }, []);

  const loadJourneys = useCallback(() => {
    setJourneysLoading(true);
    fetchJourneys()
      .then((data) => setJourneys(Array.isArray(data) ? data : []))
      .catch((err) => triggerMessage('error', err.message || 'Unable to load client journeys'))
      .finally(() => setJourneysLoading(false));
  }, [triggerMessage]);

  const [ctmSyncing, setCtmSyncing] = useState(false);

  const loadCalls = useCallback(
    async (options = {}) => {
      setCallsLoading(true);
      try {
        // Build filter params
        const params = {
          page: options.page || pagination.page,
          limit: options.limit || pagination.limit
        };
        if (searchQuery) params.search = searchQuery;
        if (dateRange.from) params.date_from = dateRange.from;
        if (dateRange.to) params.date_to = dateRange.to;
        if (callFilters.callerType && callFilters.callerType !== 'all') params.caller_type = callFilters.callerType;
        if (callFilters.category && callFilters.category !== 'all') params.category = callFilters.category;

        // Step 1: Instant load from cache (shows immediately)
        const { calls: cachedCalls, pagination: paginationData } = await fetchCalls(params);
        setCalls(cachedCalls);
        if (paginationData) setPagination(paginationData);
        setCallsLoading(false);

        // Step 2: Background sync with CTM (updates DB, then re-fetch with current filters)
        setCtmSyncing(true);
        try {
          const { newCalls, updatedCalls, message } = await syncCalls();

          // After sync, re-fetch with current filters to get updated data
          if (newCalls > 0 || updatedCalls > 0) {
            const { calls: refreshedCalls, pagination: refreshedPagination } = await fetchCalls(params);
            setCalls(refreshedCalls);
            if (refreshedPagination) setPagination(refreshedPagination);
            triggerMessage('success', message || `Synced ${newCalls} new, ${updatedCalls} updated calls`);
          }
        } catch (syncErr) {
          // Sync failure is non-critical since we already have cached data
          console.warn('[CTM Sync]', syncErr.message);
        } finally {
          setCtmSyncing(false);
        }
      } catch (err) {
        triggerMessage('error', err.message || 'Unable to load calls');
        setCallsLoading(false);
      }
    },
    [triggerMessage, searchQuery, dateRange, callFilters, pagination.page, pagination.limit]
  );

  // Load lead statistics for dashboard
  const loadLeadStats = useCallback(async () => {
    setLeadStatsLoading(true);
    try {
      const stats = await fetchLeadStats(30);
      setLeadStats(stats);
    } catch (err) {
      console.warn('[Lead Stats]', err.message);
    } finally {
      setLeadStatsLoading(false);
    }
  }, []);

  // Load pipeline stages
  const loadPipelineStages = useCallback(async () => {
    try {
      const stages = await fetchPipelineStages();
      setPipelineStages(stages);
    } catch (err) {
      console.warn('[Pipeline Stages]', err.message);
    }
  }, []);

  // Open lead detail drawer
  const handleOpenLeadDetail = useCallback(
    async (lead) => {
      // Always open to Overview tab (tab: 0) by default
      setLeadDetailDrawer({ open: true, lead, detail: null, loading: true, tab: 0 });
      try {
        const detail = await fetchLeadDetail(lead.id);
        setLeadDetailDrawer((prev) => ({ ...prev, detail, loading: false }));
        // Load notes for this lead
        const notes = await fetchLeadNotes(lead.id);
        setLeadNotes((prev) => ({ ...prev, [lead.id]: notes }));
      } catch (err) {
        triggerMessage('error', 'Failed to load lead details');
        setLeadDetailDrawer((prev) => ({ ...prev, loading: false }));
      }
    },
    [triggerMessage]
  );

  const handleCloseLeadDetail = useCallback(() => {
    setLeadDetailDrawer({ open: false, lead: null, detail: null, loading: false, tab: 0 });
    setNewNoteText('');
  }, []);

  // Load all tags for the user
  const loadAllTags = useCallback(async () => {
    try {
      const tags = await fetchAllTags();
      setAllTags(tags);
    } catch (err) {
      console.warn('[Tags]', err.message);
    }
  }, []);

  // Add tag to a call
  const handleAddTagToCall = useCallback(
    async (callId, tagName) => {
      if (!tagName?.trim()) return;
      try {
        const tags = await addTagToCall(callId, null, tagName.trim());
        setCallTags((prev) => ({ ...prev, [callId]: tags }));
        // Also update the allTags if it's a new tag
        loadAllTags();
        setNewTagName('');
        setTagDialogOpen(false);
      } catch (err) {
        triggerMessage('error', 'Failed to add tag');
      }
    },
    [loadAllTags, triggerMessage]
  );

  // Remove tag from a call
  const handleRemoveTagFromCall = useCallback(
    async (callId, tagId) => {
      try {
        await removeTagFromCall(callId, tagId);
        setCallTags((prev) => ({
          ...prev,
          [callId]: (prev[callId] || []).filter((t) => t.id !== tagId)
        }));
      } catch (err) {
        triggerMessage('error', 'Failed to remove tag');
      }
    },
    [triggerMessage]
  );

  // Update call category
  const handleUpdateCategory = useCallback(
    async (callId, category) => {
      try {
        await updateCallCategory(callId, category);
        // Update local state - both calls list and drawer if open
        setCalls((prev) => prev?.map((c) => (c.id === callId ? { ...c, category } : c)));
        // Also update the drawer's lead if it's the same call
        setLeadDetailDrawer((prev) => {
          if (prev.lead?.id === callId) {
            return { ...prev, lead: { ...prev.lead, category } };
          }
          return prev;
        });
        setCategoryMenuAnchor(null);
        setCategoryMenuCallId(null);
        triggerMessage('success', 'Classification updated');
      } catch (err) {
        triggerMessage('error', 'Failed to update classification');
      }
    },
    [triggerMessage]
  );

  // Add note to lead
  const handleAddNote = useCallback(async () => {
    if (!newNoteText.trim() || !leadDetailDrawer.lead) return;
    try {
      const note = await addLeadNote(leadDetailDrawer.lead.id, newNoteText.trim());
      setLeadNotes((prev) => ({
        ...prev,
        [leadDetailDrawer.lead.id]: [note, ...(prev[leadDetailDrawer.lead.id] || [])]
      }));
      setNewNoteText('');
      triggerMessage('success', 'Note added');
    } catch (err) {
      triggerMessage('error', 'Failed to add note');
    }
  }, [newNoteText, leadDetailDrawer.lead, triggerMessage]);

  // Export leads to CSV
  const handleExportCsv = useCallback(async () => {
    try {
      const blob = await exportLeadsCsv();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      triggerMessage('success', 'Leads exported successfully');
    } catch (err) {
      triggerMessage('error', 'Failed to export leads');
    }
  }, [triggerMessage]);

  // Manual sync - syncs with CTM then re-fetches with current filters
  const handleManualCtmSync = useCallback(async () => {
    if (ctmSyncing) return;
    setCtmSyncing(true);
    try {
      const { newCalls, updatedCalls, message } = await syncCalls();

      // Re-fetch with current filters to preserve view
      const params = { page: pagination.page, limit: pagination.limit };
      if (searchQuery) params.search = searchQuery;
      if (dateRange.from) params.date_from = dateRange.from;
      if (dateRange.to) params.date_to = dateRange.to;
      if (callFilters.callerType && callFilters.callerType !== 'all') params.caller_type = callFilters.callerType;
      if (callFilters.category && callFilters.category !== 'all') params.category = callFilters.category;

      const { calls: refreshedCalls, pagination: refreshedPagination } = await fetchCalls(params);
      setCalls(refreshedCalls);
      if (refreshedPagination) setPagination(refreshedPagination);

      triggerMessage(
        'success',
        message || (newCalls || updatedCalls ? `Synced ${newCalls} new, ${updatedCalls} updated` : 'Already up to date with CTM')
      );
    } catch (err) {
      triggerMessage('error', err.message || 'Sync with CTM failed');
    } finally {
      setCtmSyncing(false);
    }
  }, [ctmSyncing, triggerMessage, pagination.page, pagination.limit, searchQuery, dateRange, callFilters]);

  const updateLocalCallRating = useCallback((callId, nextRating) => {
    setCalls((prev) => {
      if (!prev) return prev;
      return prev.map((call) => (call.id === callId ? { ...call, rating: nextRating ?? 0 } : call));
    });
  }, []);

  const setRatingPendingState = useCallback((callId, isPending) => {
    setRatingPending((prev) => {
      if (!isPending) {
        if (!prev[callId]) return prev;
        const next = { ...prev };
        delete next[callId];
        return next;
      }
      return { ...prev, [callId]: true };
    });
  }, []);

  // Reclassify leads - admin only function
  const handleReclassifyLeads = useCallback(async () => {
    if (!actingClientId) return;
    setReclassifyDialog((prev) => ({ ...prev, loading: true }));
    try {
      const resp = await client.post(`/hub/clients/${actingClientId}/reclassify-leads`, {
        limit: reclassifyDialog.limit,
        force: true
      });
      triggerMessage('success', resp.data.message || 'Leads reclassified successfully');
      loadCalls(); // Refresh leads list
    } catch (err) {
      triggerMessage('error', err.response?.data?.message || 'Failed to reclassify leads');
    } finally {
      setReclassifyDialog({ open: false, loading: false, limit: 200 });
    }
  }, [actingClientId, reclassifyDialog.limit, triggerMessage, loadCalls]);

  const handleClearAndReloadCalls = useCallback(async () => {
    setClearCallsDialogOpen(false);
    setCallsLoading(true);
    try {
      const data = await clearAndReloadCalls();
      setCalls(data.calls);
      triggerMessage('success', data.message || 'Calls cleared and reloaded successfully');
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to clear and reload calls');
    } finally {
      setCallsLoading(false);
    }
  }, []);

  const loadArchiveData = useCallback(async () => {
    setArchiveLoading(true);
    try {
      const [archivedJourneyList, archivedClientList] = await Promise.all([
        fetchJourneys({ archived: true }),
        fetchActiveClients('archived')
      ]);
      setArchivedJourneys(Array.isArray(archivedJourneyList) ? archivedJourneyList : []);
      setArchivedClients(Array.isArray(archivedClientList) ? archivedClientList : []);
      setArchiveLoaded(true);
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to load archive');
    } finally {
      setArchiveLoading(false);
    }
  }, [triggerMessage]);

  // Open archive confirmation dialog
  const openArchiveConfirm = useCallback((type, item) => {
    setArchiveConfirmDialog({ open: true, type, item });
  }, []);

  // Handle confirmed archive
  const handleConfirmArchive = useCallback(async () => {
    const { type, item } = archiveConfirmDialog;
    setArchiveConfirmDialog({ open: false, type: null, item: null });

    if (type === 'journey' && item?.id) {
      const label = item.client_name || item.client_phone || item.client_email || 'this lead';
      try {
        await archiveJourney(item.id);
        triggerMessage('success', `${label}'s journey archived`);
        await loadJourneys();
        if (activeTab === 'archive') {
          await loadArchiveData();
        } else {
          setArchiveLoaded(false);
        }
      } catch (err) {
        triggerMessage('error', err.message || 'Unable to archive journey');
      }
    } else if (type === 'client' && item?.id) {
      const label = item.client_name || item.client_phone || item.client_email || 'this client';
      try {
        await archiveActiveClient(item.id);
        triggerMessage('success', `${label} archived`);
        // Reload archive data to show updated archived clients
        if (activeTab === 'archive') {
          await loadArchiveData();
        } else {
          setArchiveLoaded(false);
        }
      } catch (err) {
        triggerMessage('error', err.message || 'Unable to archive client');
      }
    }
  }, [archiveConfirmDialog, triggerMessage, activeTab, loadJourneys, loadArchiveData]);

  // Legacy function for backwards compatibility
  const handleArchiveJourney = useCallback(
    (journey) => {
      if (!journey?.id) return;
      openArchiveConfirm('journey', journey);
    },
    [openArchiveConfirm]
  );

  // Archive active client
  const handleArchiveClient = useCallback(
    (client) => {
      if (!client?.id) return;
      openArchiveConfirm('client', client);
    },
    [openArchiveConfirm]
  );

  const handleRestoreJourney = useCallback(
    async (journey) => {
      if (!journey?.id) return;
      try {
        await restoreJourney(journey.id);
        triggerMessage('success', 'Journey restored');
        await loadJourneys();
        await loadArchiveData();
      } catch (err) {
        triggerMessage('error', err.message || 'Unable to restore journey');
      }
    },
    [loadArchiveData, loadJourneys, triggerMessage]
  );

  const handleRestoreClient = useCallback(
    async (client) => {
      if (!client?.id) return;
      const label = client.client_name || client.client_email || client.client_phone || 'this client';
      try {
        await restoreActiveClient(client.id);
        triggerMessage('success', `${label} restored`);
        await loadArchiveData();
      } catch (err) {
        triggerMessage('error', err.message || 'Unable to restore client');
      }
    },
    [loadArchiveData, triggerMessage]
  );

  const loadServices = useCallback(() => {
    fetchServices()
      .then((data) => setServices(data.filter((s) => s.active !== false)))
      .catch((err) => triggerMessage('error', err.message || 'Unable to load services'));
  }, []);

  useEffect(() => {
    if (activeTab === 'analytics') ensureAnalytics();
    if (activeTab === 'profile' && !profile && !profileLoading) loadProfile();
    if (activeTab === 'brand' && !brand) loadBrand();
    if (activeTab === 'documents' && !documents && !docsLoading) loadDocuments();
    if (activeTab === 'tasks' && !requestsData && !tasksLoading) loadRequests();
    if (activeTab === 'leads' && !calls && !callsLoading) {
      loadCalls();
      loadLeadStats();
      loadPipelineStages();
      loadAllTags();
      // Load saved views
      fetchSavedViews()
        .then((views) => setSavedViews(views))
        .catch(() => {});
      if (services.length === 0) loadServices();
    }
    if (activeTab === 'archive' && !archiveLoaded && !archiveLoading) {
      loadArchiveData();
    }
  }, [
    activeTab,
    ensureAnalytics,
    profile,
    profileLoading,
    loadProfile,
    brand,
    loadBrand,
    documents,
    docsLoading,
    loadDocuments,
    requestsData,
    tasksLoading,
    loadRequests,
    calls,
    callsLoading,
    loadCalls,
    services,
    loadServices,
    archiveLoaded,
    archiveLoading,
    loadArchiveData
  ]);

  useEffect(() => {
    if (activeTab === 'journey' && journeys === null && !journeysLoading) {
      loadJourneys();
    }
  }, [activeTab, journeys, journeysLoading, loadJourneys]);

  // Track previous filter values to detect actual changes
  const prevFiltersRef = useRef(null);

  // Reload calls when filters change (only if we already have calls loaded)
  useEffect(() => {
    // Build current filter key
    const currentFilters = `${callFilters.callerType}|${callFilters.category}|${callFilters.type}|${callFilters.source}`;

    // Skip if filters haven't actually changed (prevents double-load on mount)
    if (prevFiltersRef.current === currentFilters) return;

    // Skip if this is the initial mount (calls will be null)
    if (prevFiltersRef.current === null) {
      prevFiltersRef.current = currentFilters;
      return;
    }

    prevFiltersRef.current = currentFilters;

    // Only reload if we're on leads tab and have initial data
    if (activeTab === 'leads' && calls !== null && !callsLoading) {
      loadCalls();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, callFilters.callerType, callFilters.category, callFilters.type, callFilters.source, calls, callsLoading]);

  const handleProfileSave = async () => {
    if (!profileForm.display_name || !profileForm.email) {
      triggerMessage('error', 'Display name and email are required');
      return;
    }
    const wantsPasswordChange = Boolean(profileForm.new_password || profileForm.new_password_confirm || profileForm.current_password);
    if (wantsPasswordChange) {
      if (!profileForm.current_password) {
        triggerMessage('error', 'Current password is required to set a new password');
        return;
      }
      if (!profileForm.new_password) {
        triggerMessage('error', 'New password is required');
        return;
      }
      if (profileForm.new_password !== profileForm.new_password_confirm) {
        triggerMessage('error', 'New passwords do not match');
        return;
      }
    }
    setProfileLoading(true);
    try {
      const payload = {
        first_name: profileForm.display_name.split(' ')[0] || profileForm.display_name,
        last_name: profileForm.display_name.split(' ').slice(1).join(' '),
        email: profileForm.email,
        monthly_revenue_goal: profileForm.monthly_revenue_goal ? parseFloat(profileForm.monthly_revenue_goal) : null
      };
      if (wantsPasswordChange) {
        payload.password = profileForm.current_password;
        payload.new_password = profileForm.new_password;
      }
      const updated = await updateProfile(payload);
      setProfile(updated);
      triggerMessage('success', 'Profile saved');
      // Refresh auth context so header and other components reflect changes
      try {
        await refreshUser();
      } catch {}
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to save profile');
    } finally {
      setProfileLoading(false);
      setProfileForm((prev) => ({ ...prev, current_password: '', new_password: '', new_password_confirm: '' }));
    }
  };

  const handleAvatarUpload = async (file) => {
    if (!file) return;
    try {
      await uploadAvatar(file);
      triggerMessage('success', 'Avatar updated');
      loadProfile();
      // Refresh auth context so header avatar updates everywhere
      try {
        await refreshUser();
      } catch {}
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to upload avatar');
    }
  };

  const handleBrandSave = async () => {
    setBrandSaving(true);
    try {
      const updated = await saveBrand({
        fields: brandFields,
        logoFiles: logoUploads,
        styleGuideFiles: styleUploads,
        deletions: [...logoDeletions, ...styleDeletions]
      });
      setBrand(updated);
      setLogoUploads([]);
      setStyleUploads([]);
      setLogoDeletions([]);
      setStyleDeletions([]);
      // Persist access confirmations alongside brand info
      await updateProfile({ ...accessFields });
      loadProfile();
      triggerMessage('success', 'Brand profile saved');
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to save brand profile');
    } finally {
      setBrandSaving(false);
    }
  };

  const handleDocUpload = async () => {
    if (!docUploads.length) return;
    try {
      const docs = await uploadDocuments(docUploads);
      setDocuments(docs);
      setDocUploads([]);
      triggerMessage('success', 'Document(s) uploaded');
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to upload documents');
    }
  };

  const handleDocDelete = async (docId) => {
    try {
      await deleteDocument(docId);
      loadDocuments();
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to delete document');
    }
  };

  const handleMarkViewed = async (docId) => {
    try {
      await markDocumentViewed(docId);
      loadDocuments();
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to update document');
    }
  };

  const handleRequestSubmit = async () => {
    if (!requestForm.title) {
      triggerMessage('error', 'Request title is required');
      return;
    }
    setSubmittingRequest(true);
    try {
      await submitRequest({
        title: requestForm.title,
        description: requestForm.description,
        due_date: requestForm.due_date,
        rush: requestForm.rush,
        attachment: requestAttachment || undefined
      });
      triggerMessage('success', 'Request submitted');
      setRequestForm({ title: '', description: '', due_date: '', rush: false });
      setRequestAttachment(null);
      setRequestDialogOpen(false);
      loadRequests();
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to submit request');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleRushToggle = () => {
    if (requestForm.rush) {
      setRequestForm((prev) => ({ ...prev, rush: false }));
      return;
    }
    setRushConfirmOpen(true);
  };

  const handleRushConfirm = () => {
    setRequestForm((prev) => ({ ...prev, rush: true }));
    setRushConfirmOpen(false);
  };

  const handleRushCancel = () => {
    setRushConfirmOpen(false);
  };

  // Star rating labels for tooltips
  const STAR_LABELS = {
    1: 'Spam',
    2: 'Not a Fit',
    3: 'Solid Lead',
    4: 'Great Lead',
    5: 'Converted'
  };

  const handleScoreCall = async (id, score) => {
    // If scoring 5 stars, open the service dialog to ask which services
    if (score === 5) {
      const lead = calls?.find((call) => call.id === id);
      if (lead) {
        handleOpenServiceDialog(lead);
        return; // Don't score yet - will be scored when service is confirmed
      }
    }

    const previousRating = calls?.find((call) => call.id === id)?.rating ?? 0;
    setRatingPendingState(id, true);
    updateLocalCallRating(id, score);
    try {
      const res = await scoreCall(id, score);
      const nextRating = typeof res?.rating === 'number' ? res.rating : score;
      updateLocalCallRating(id, nextRating);
      triggerMessage('success', res?.message || 'Call scored');
    } catch (err) {
      updateLocalCallRating(id, previousRating);
      triggerMessage('error', err.message || 'Unable to score call');
    } finally {
      setRatingPendingState(id, false);
    }
  };

  const handleClearScore = async (id) => {
    const previousRating = calls?.find((call) => call.id === id)?.rating ?? 0;
    setRatingPendingState(id, true);
    updateLocalCallRating(id, 0);
    try {
      const res = await clearCallScore(id);
      triggerMessage('success', res?.message || 'Score cleared');
    } catch (err) {
      updateLocalCallRating(id, previousRating);
      triggerMessage('error', err.message || 'Unable to clear score');
    } finally {
      setRatingPendingState(id, false);
    }
  };

  const handleOpenServiceDialog = (lead) => {
    setServiceDialogLead(lead);
    setSelectedServices([]);
    setServiceDialogOpen(true);
  };

  const handleCloseServiceDialog = () => {
    setServiceDialogOpen(false);
    setServiceDialogLead(null);
    setSelectedServices([]);
  };

  const handleToggleService = (serviceId) => {
    setSelectedServices((prev) => {
      const exists = prev.find((s) => s.service_id === serviceId);
      if (exists) {
        return prev.filter((s) => s.service_id !== serviceId);
      } else {
        const service = services.find((s) => s.id === serviceId);
        return [...prev, { service_id: serviceId, agreed_price: service?.base_price || 0 }];
      }
    });
  };

  const handleUpdateServicePrice = (serviceId, price) => {
    setSelectedServices((prev) => prev.map((s) => (s.service_id === serviceId ? { ...s, agreed_price: parseFloat(price) || 0 } : s)));
  };

  const handleAgreeToService = async () => {
    console.log('[handleAgreeToService] Starting', {
      hasLead: !!serviceDialogLead,
      servicesCount: selectedServices.length,
      hasProfile: !!profile
    });

    if (!serviceDialogLead) {
      triggerMessage('error', 'No lead selected');
      return;
    }
    if (selectedServices.length === 0) {
      triggerMessage('error', 'Please select at least one service');
      return;
    }

    setCallsLoading(true);
    try {
      const funnelData = {
        caller_name: serviceDialogLead.caller_name,
        caller_number: serviceDialogLead.caller_number,
        source: serviceDialogLead.source,
        category: serviceDialogLead.category,
        region: serviceDialogLead.region,
        call_id: serviceDialogLead.id,
        call_time: serviceDialogLead.call_time,
        contact_id: serviceDialogLead.contact_id || null
      };

      console.log('[handleAgreeToService] Calling agreeToService API', {
        leadId: serviceDialogLead.id,
        services: selectedServices,
        funnelData
      });

      await agreeToService(serviceDialogLead.id, {
        services: selectedServices,
        source: serviceDialogLead.source || 'CTM',
        funnel_data: funnelData
      });

      console.log('[handleAgreeToService] Service agreement created, now scoring call as 5 stars');

      // Auto-score the lead as 5 stars (booked appointment)
      if (serviceDialogLead.id) {
        try {
          const res = await scoreCall(serviceDialogLead.id, 5);
          const nextRating = typeof res?.rating === 'number' ? res.rating : 5;
          updateLocalCallRating(serviceDialogLead.id, nextRating);
          console.log('[handleAgreeToService] Successfully scored call as 5 stars');
        } catch (err) {
          console.error('[handleAgreeToService] Failed to auto-score lead:', err);
        }
      }

      triggerMessage('success', `Successfully converted ${serviceDialogLead.caller_name || 'lead'} to active client`);
      handleCloseServiceDialog();
    } catch (err) {
      console.error('[handleAgreeToService] Error:', err);
      triggerMessage('error', err.message || 'Unable to process service agreement');
    } finally {
      setCallsLoading(false);
    }
  };

  const upsertJourney = useCallback((journey) => {
    if (!journey) return;
    setJourneys((prev) => {
      // Handle null state (journeys not yet loaded)
      if (!prev) return [journey];
      const index = prev.findIndex((item) => item.id === journey.id);
      if (index === -1) return [journey, ...prev];
      const clone = [...prev];
      clone[index] = journey;
      return clone;
    });
  }, []);

  const handleOpenConcernDialog = (lead, journey = null, options = {}) => {
    setConcernDialog({
      open: true,
      lead: lead || null,
      journeyId: journey?.id || null,
      values: journey?.symptoms || [],
      forceNew: options.forceNew || false,
      activeClientId: options.activeClientId || lead?.active_client_id || null
    });
  };

  const handleCloseConcernDialog = () => {
    setConcernDialog({ open: false, lead: null, journeyId: null, values: [], forceNew: false, activeClientId: null });
  };

  const handleConcernDialogChange = (_event, values) => {
    setConcernDialog((prev) => ({ ...prev, values }));
  };

  const handleConcernDialogSave = async () => {
    const selections = Array.from(new Set(concernDialog.values.map((value) => String(value || '').trim()).filter(Boolean)));
    if (!concernDialog.lead && !concernDialog.journeyId && !concernDialog.activeClientId) {
      handleCloseConcernDialog();
      return;
    }
    setConcernSaving(true);
    try {
      if (concernDialog.journeyId && !concernDialog.forceNew) {
        // Update existing journey
        await updateJourney(concernDialog.journeyId, { symptoms: selections });
      } else {
        // Create new journey
        const payload = {
          lead_call_id: concernDialog.lead?.id,
          client_name: concernDialog.lead?.caller_name || concernDialog.lead?.name || '',
          client_phone: concernDialog.lead?.caller_number || '',
          client_email: concernDialog.lead?.caller_email || '',
          symptoms: selections,
          active_client_id: concernDialog.activeClientId || concernDialog.lead?.active_client_id || null,
          force_new: concernDialog.forceNew || false
        };
        await createJourney(payload);
      }
      // Reload all journeys to ensure we have the complete list
      await loadJourneys();
      triggerMessage('success', concernDialog.forceNew ? 'New client journey created' : 'Client journey updated');
      handleCloseConcernDialog();
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to save journey');
    } finally {
      setConcernSaving(false);
    }
  };

  const handleJourneyStatusChange = async (journeyId, changes) => {
    try {
      const journey = await updateJourney(journeyId, changes);
      upsertJourney(journey);
      updateDrawerJourney(journey);
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to update journey');
    }
  };

  const handleOpenNoteDialog = (journey, stepId = null) => {
    // Pre-populate with existing step note if editing
    let existingNote = '';
    if (stepId && journey.steps) {
      const step = journey.steps.find((s) => s.id === stepId);
      existingNote = step?.notes || '';
    }
    setNoteDialog({ open: true, journeyId: journey.id, stepId, value: existingNote });
  };

  const handleCloseNoteDialog = () => {
    setNoteDialog({ open: false, journeyId: null, stepId: null, value: '' });
  };

  const handleSaveStepNote = async () => {
    const body = noteDialog.value?.trim();
    if (!body || !noteDialog.journeyId || !noteDialog.stepId) return;
    try {
      // Update step notes
      const journey = await updateJourneyStep(noteDialog.journeyId, noteDialog.stepId, {
        notes: body
      });
      upsertJourney(journey);
      // Also update drawer if open
      if (journeyDrawer.open && journeyDrawer.journey?.id === noteDialog.journeyId) {
        setJourneyDrawer((prev) => ({ ...prev, journey }));
      }
      triggerMessage('success', 'Note added to step');
      handleCloseNoteDialog();
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to add note');
    }
  };

  const handleOpenTimelineDialog = (journey) => {
    setTimelineDialog({ open: true, journey });
  };

  const handleCloseTimelineDialog = () => setTimelineDialog({ open: false, journey: null });

  // Journey Drawer handlers
  const handleOpenJourneyDrawer = (journey) => {
    setJourneyDrawer({ open: true, journey });
    setExpandedSteps({});
  };

  const handleCloseJourneyDrawer = () => {
    setJourneyDrawer({ open: false, journey: null });
    setExpandedSteps({});
  };

  const toggleStepExpanded = (stepId) => {
    setExpandedSteps((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  // Update journey in drawer when it changes
  const updateDrawerJourney = useCallback(
    (journey) => {
      if (journeyDrawer.open && journeyDrawer.journey?.id === journey.id) {
        setJourneyDrawer((prev) => ({ ...prev, journey }));
      }
    },
    [journeyDrawer.open, journeyDrawer.journey?.id]
  );

  const handleJourneyAgreedToService = (journey) => {
    const pseudoLead = {
      id: journey.lead_call_key || journey.lead_call_id || `journey-${journey.id}`,
      caller_name: journey.client_name || '',
      caller_number: journey.client_phone || '',
      caller_email: journey.client_email || '',
      source: 'Client Journey',
      region: '',
      category: 'journey',
      call_time: journey.created_at
    };
    setServiceDialogLead(pseudoLead);
    setSelectedServices([]);
    setServiceDialogOpen(true);
  };

  const getJourneyCurrentStep = (journey) => {
    const sorted = (journey.steps || []).slice().sort((a, b) => a.position - b.position);
    return sorted.find((step) => !step.completed_at) || null;
  };

  const handleMarkCurrentStepComplete = (journey) => {
    const current = getJourneyCurrentStep(journey);
    if (!current) return;
    handleToggleStepComplete(journey.id, current);
  };

  const handleApplyTemplateToJourney = async (journeyId) => {
    try {
      const journey = await applyJourneyTemplate(journeyId);
      upsertJourney(journey);
      updateDrawerJourney(journey);
      triggerMessage('success', 'Follow-up template applied');
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to apply template');
    }
  };

  const handleOpenStepDialog = (journey, step = null) => {
    setStepDialog({
      open: true,
      journeyId: journey.id,
      stepId: step?.id || null,
      form: {
        label: step?.label || '',
        channel: step?.channel || '',
        message: step?.message || '',
        offset_weeks: step?.offset_weeks ?? 0,
        due_at: formatDateInputValue(step?.due_at)
      }
    });
  };

  const handleCloseStepDialog = () => {
    setStepDialog({
      open: false,
      journeyId: null,
      stepId: null,
      form: { label: '', channel: '', message: '', offset_weeks: 0, due_at: '' }
    });
  };

  const handleStepFieldChange = (field) => (event) => {
    const value = field === 'offset_weeks' ? event.target.value : event.target.value;
    setStepDialog((prev) => ({
      ...prev,
      form: { ...prev.form, [field]: value }
    }));
  };

  const handleStepDialogSave = async () => {
    if (!stepDialog.form.label.trim()) {
      triggerMessage('error', 'Step label is required');
      return;
    }
    const payload = {
      label: stepDialog.form.label,
      channel: stepDialog.form.channel,
      message: stepDialog.form.message,
      offset_weeks: Number(stepDialog.form.offset_weeks) || 0,
      due_at: stepDialog.form.due_at || null
    };
    try {
      let journey;
      if (stepDialog.stepId) {
        journey = await updateJourneyStep(stepDialog.journeyId, stepDialog.stepId, payload);
      } else {
        journey = await addJourneyStep(stepDialog.journeyId, payload);
      }
      upsertJourney(journey);
      updateDrawerJourney(journey);
      handleCloseStepDialog();
      triggerMessage('success', `Step ${stepDialog.stepId ? 'updated' : 'added'}`);
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to save step');
    }
  };

  const handleToggleStepComplete = async (journeyId, step) => {
    try {
      const journey = await updateJourneyStep(journeyId, step.id, {
        completed_at: step.completed_at ? null : new Date().toISOString()
      });
      upsertJourney(journey);
      updateDrawerJourney(journey);
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to update step');
    }
  };

  const handleDeleteStep = async (journeyId, stepId) => {
    if (!window.confirm('Remove this step from the journey?')) return;
    try {
      const journey = await deleteJourneyStep(journeyId, stepId);
      upsertJourney(journey);
      updateDrawerJourney(journey);
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to delete step');
    }
  };

  const handleOpenTemplateDialog = async () => {
    setTemplateDialogOpen(true);
    if (templateDraft.length === 0 && !templateLoading) {
      setTemplateLoading(true);
      try {
        const template = await fetchJourneyTemplate();
        setTemplateDraft(Array.isArray(template) ? template : []);
      } catch (err) {
        triggerMessage('error', err.message || 'Unable to load template');
      } finally {
        setTemplateLoading(false);
      }
    }
  };

  const handleTemplateFieldChange = (index, field) => (event) => {
    const value = field === 'offset_weeks' ? Number(event.target.value) : event.target.value;
    setTemplateDraft((prev) => {
      const clone = [...prev];
      clone[index] = {
        ...clone[index],
        [field]: field === 'offset_weeks' ? (Number.isNaN(value) ? 0 : value) : value
      };
      return clone;
    });
  };

  const handleAddTemplateStep = () => {
    setTemplateDraft((prev) => [...prev, { id: `template-${prev.length + 1}`, label: '', channel: '', message: '', offset_weeks: 0 }]);
  };

  const handleRemoveTemplateStep = (index) => {
    setTemplateDraft((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleTemplateSave = async () => {
    setTemplateSaving(true);
    try {
      const sanitized = templateDraft
        .map((step) => ({
          ...step,
          label: (step.label || '').trim()
        }))
        .filter((step) => step.label);
      const template = await saveJourneyTemplate(sanitized);
      setTemplateDraft(Array.isArray(template) ? template : []);
      triggerMessage('success', 'Journey template saved');
      setTemplateDialogOpen(false);
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to save template');
    } finally {
      setTemplateSaving(false);
    }
  };

  const filteredTasks = useMemo(() => {
    if (!requestsData?.tasks) return [];
    if (!requestsData.group_meta) return requestsData.tasks;
    const targetGroup = taskView === 'active' ? requestsData.group_meta.active_group_id : requestsData.group_meta.completed_group_id;
    if (!targetGroup) return requestsData.tasks;
    return requestsData.tasks.filter((task) => task.group_id === targetGroup);
  }, [requestsData, taskView]);

  const callCategories = useMemo(() => {
    if (!calls) return {};
    return calls.reduce((acc, call) => {
      const key = (call.category || 'unreviewed').toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      const sourceKey = (call.source_key || 'unknown').toLowerCase();
      acc[`source:${sourceKey}`] = (acc[`source:${sourceKey}`] || 0) + 1;
      return acc;
    }, {});
  }, [calls]);

  const filteredCalls = useMemo(() => {
    if (!calls) return [];
    return calls.filter((call) => {
      const matchesType = callFilters.type === 'all' || (call.activity_type || 'call') === callFilters.type;
      const matchesSource = callFilters.source === 'all' || (call.source_key || 'unknown').toLowerCase() === callFilters.source;
      const matchesCategory = callFilters.category === 'all' || (call.category || 'unreviewed').toLowerCase() === callFilters.category;
      return matchesType && matchesSource && matchesCategory;
    });
  }, [calls, callFilters]);

  const journeyByLeadId = useMemo(() => {
    const map = new Map();
    (Array.isArray(journeys) ? journeys : []).forEach((journey) => {
      if (journey.lead_call_id) {
        map.set(journey.lead_call_id, journey);
      }
    });
    return map;
  }, [journeys]);

  const concernOptions = useMemo(() => {
    // First try client_subtype (e.g., 'hvac', 'dental', 'tmj_sleep')
    if (profile?.client_subtype && CLIENT_CONCERN_PRESETS[profile.client_subtype]) {
      return CLIENT_CONCERN_PRESETS[profile.client_subtype];
    }
    // Then try client_type (e.g., 'food_service', 'other')
    if (profile?.client_type && CLIENT_CONCERN_PRESETS[profile.client_type]) {
      return CLIENT_CONCERN_PRESETS[profile.client_type];
    }
    // Default to general concerns only (not all concerns)
    return CLIENT_CONCERN_PRESETS.other || [];
  }, [profile?.client_subtype, profile?.client_type]);

  // Keyboard shortcuts for power users
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }

      // Ctrl/Cmd + key shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'r':
            e.preventDefault();
            if (activeTab === 'leads') loadCalls();
            if (activeTab === 'journey') loadJourneys();
            break;
          case 's':
            e.preventDefault();
            if (activeTab === 'leads') handleManualCtmSync();
            break;
          case 'e':
            e.preventDefault();
            if (activeTab === 'leads') handleExportCsv();
            break;
          case 'f':
            e.preventDefault();
            // Focus search input
            const searchInput = document.querySelector('[placeholder="Search leads..."]');
            if (searchInput) searchInput.focus();
            break;
          default:
            break;
        }
        return;
      }

      // Number keys for tab navigation (1-7)
      const tabMap = { 1: 'profile', 2: 'brand', 3: 'documents', 4: 'leads', 5: 'journey', 6: 'archive', 7: 'reviews' };
      if (tabMap[e.key]) {
        e.preventDefault();
        navigate(`/portal?tab=${tabMap[e.key]}`);
        return;
      }

      // View mode toggles
      if (e.key === 'v') {
        setViewMode((prev) => (prev === 'card' ? 'table' : prev === 'table' ? 'kanban' : 'card'));
      }

      // Close drawers with Escape
      if (e.key === 'Escape') {
        if (leadDetailDrawer.open) handleCloseLeadDetail();
        if (journeyDrawer.open) handleCloseJourneyDrawer();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeTab,
    loadCalls,
    loadJourneys,
    handleManualCtmSync,
    handleExportCsv,
    navigate,
    leadDetailDrawer.open,
    journeyDrawer.open,
    handleCloseLeadDetail,
    handleCloseJourneyDrawer
  ]);

  return (
    <MainCard title="Client Portal">
      <Stack spacing={2}>
        {actingClientId && (
          <Alert
            severity="info"
            action={
              <Button size="small" color="inherit" onClick={clearActingClient}>
                Exit Client View
              </Button>
            }
          >
            You are currently viewing the portal as a client.
          </Alert>
        )}
        {message.text && <Alert severity={message.type === 'error' ? 'error' : 'success'}>{message.text}</Alert>}

        <Typography variant="h4">{currentSection.label}</Typography>

        {activeTab === 'analytics' && (
          <Box>
            {analyticsLoading && <LinearProgress />}
            {analyticsUrl ? (
              <Box sx={{ borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                <Box component="iframe" src={analyticsUrl} title="Analytics" sx={{ width: '100%', height: 600, border: 'none' }} />
              </Box>
            ) : (
              !analyticsLoading && (
                <Typography variant="body2" color="text.secondary">
                  Analytics dashboard is not configured yet.
                </Typography>
              )
            )}
          </Box>
        )}

        {activeTab === 'tasks' && (
          <Stack spacing={3}>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Button variant="contained" onClick={() => setRequestDialogOpen(true)}>
                  New Request
                </Button>
                <Chip label="Active" color={taskView === 'active' ? 'primary' : 'default'} onClick={() => setTaskView('active')} />
                <Chip label="Completed" color={taskView === 'completed' ? 'primary' : 'default'} onClick={() => setTaskView('completed')} />
                <Box sx={{ flexGrow: 1, display: { xs: 'none', sm: 'block' } }} />
                <Button size="small" onClick={loadRequests}>
                  Refresh
                </Button>
              </Stack>
              {tasksLoading && <LinearProgress />}
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Task</TableCell>
                      <TableCell>Group</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Due Date</TableCell>
                      <TableCell>Files</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredTasks?.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell>{task.name}</TableCell>
                        <TableCell>{task.group || '-'}</TableCell>
                        <TableCell>{task.status || 'N/A'}</TableCell>
                        <TableCell>{task.due_date || '—'}</TableCell>
                        <TableCell>
                          {task.files?.length ? (
                            <Stack spacing={0.5}>
                              {task.files.map((file) => (
                                <Button key={file.asset_id || file.id} href={file.public_url || file.url} target="_blank">
                                  {file.name || 'File'}
                                </Button>
                              ))}
                            </Stack>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              No files
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!filteredTasks?.length && (
                      <TableRow>
                        <TableCell colSpan={5} align="center">
                          No tasks found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Stack>
          </Stack>
        )}

        {activeTab === 'brand' && (
          <>
            {!brand ? (
              <Typography variant="body2" color="text.secondary">
                Brand profile not loaded yet.
              </Typography>
            ) : (
              <Stack spacing={3}>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={12}>
                    <Stack spacing={2}>
                      <Typography variant="h6">Brand Basics</Typography>
                      <Stack spacing={1}>
                        <Typography variant="subtitle2">Logo Files</Typography>
                        <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
                          Select Logos
                          <input type="file" hidden multiple onChange={(e) => setLogoUploads(Array.from(e.target.files || []))} />
                        </Button>
                        {logoUploads.length > 0 && <Typography variant="caption">{logoUploads.length} new file(s) selected</Typography>}
                        {brand.logos?.length ? (
                          brand.logos.map((logo) => (
                            <Stack
                              key={logo.id}
                              direction="row"
                              spacing={1}
                              alignItems="center"
                              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}
                            >
                              <Typography sx={{ flex: 1 }}>{logo.name}</Typography>
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setBrand((prev) => ({ ...prev, logos: prev.logos.filter((l) => l.id !== logo.id) }));
                                  setLogoDeletions((prev) => [...prev, logo.id]);
                                }}
                              >
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Stack>
                          ))
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            No logos uploaded.
                          </Typography>
                        )}
                      </Stack>
                      <Stack spacing={1}>
                        <Typography variant="subtitle2">Style Guides</Typography>
                        <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
                          Select Style Guides
                          <input type="file" hidden multiple onChange={(e) => setStyleUploads(Array.from(e.target.files || []))} />
                        </Button>
                        {styleUploads.length > 0 && <Typography variant="caption">{styleUploads.length} new file(s) selected</Typography>}
                        {brand.style_guides?.length ? (
                          brand.style_guides.map((guide) => (
                            <Stack
                              key={guide.id}
                              direction="row"
                              spacing={1}
                              alignItems="center"
                              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}
                            >
                              <Typography sx={{ flex: 1 }}>{guide.name}</Typography>
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setBrand((prev) => ({
                                    ...prev,
                                    style_guides: prev.style_guides.filter((l) => l.id !== guide.id)
                                  }));
                                  setStyleDeletions((prev) => [...prev, guide.id]);
                                }}
                              >
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Stack>
                          ))
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            No style guides uploaded.
                          </Typography>
                        )}
                      </Stack>
                      <TextField
                        label={fieldLabels.business_name}
                        fullWidth
                        value={brandFields.business_name || ''}
                        onChange={(e) => setBrandFields((prev) => ({ ...prev, business_name: e.target.value }))}
                      />
                      <TextField
                        label={fieldLabels.business_description}
                        fullWidth
                        multiline
                        minRows={4}
                        value={brandFields.business_description || ''}
                        onChange={(e) => setBrandFields((prev) => ({ ...prev, business_description: e.target.value }))}
                      />
                      <TextField
                        label={fieldLabels.brand_notes}
                        fullWidth
                        multiline
                        minRows={4}
                        value={brandFields.brand_notes || ''}
                        onChange={(e) => setBrandFields((prev) => ({ ...prev, brand_notes: e.target.value }))}
                      />
                      <TextField
                        label={fieldLabels.website_url}
                        fullWidth
                        value={brandFields.website_url || ''}
                        onChange={(e) => setBrandFields((prev) => ({ ...prev, website_url: e.target.value }))}
                      />
                    </Stack>
                  </Grid>
                </Grid>
                <Box sx={{ mt: 1 }}>
                  <Button variant="contained" onClick={handleBrandSave} disabled={brandSaving} sx={{ alignSelf: 'flex-start' }}>
                    {brandSaving ? 'Saving…' : 'Save Brand Profile'}
                  </Button>
                </Box>
              </Stack>
            )}
          </>
        )}

        {activeTab === 'documents' && (
          <Stack spacing={3}>
            {/* Helpful Documents (shared by admin with all clients) */}
            {sharedDocuments && sharedDocuments.length > 0 && (
              <>
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  Helpful Documents
                </Typography>
                <Stack spacing={1}>
                  {sharedDocuments.map((doc) => (
                    <Card key={doc.id} variant="outlined" sx={{ bgcolor: 'primary.lighter' }}>
                      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle1" fontWeight={500}>
                              {doc.label || doc.name}
                            </Typography>
                            {doc.description && (
                              <Typography variant="body2" color="text.secondary">
                                {doc.description}
                              </Typography>
                            )}
                          </Box>
                          <Button variant="contained" href={doc.url} target="_blank" rel="noreferrer" size="small">
                            View
                          </Button>
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
                <Divider />
              </>
            )}

            {/* Your Documents section */}
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              Your Documents
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
                Select Files to Upload
                <input type="file" hidden multiple onChange={(e) => setDocUploads(Array.from(e.target.files || []))} />
              </Button>
              {docUploads.length > 0 && <Chip label={`${docUploads.length} file(s) selected`} onDelete={() => setDocUploads([])} />}
              <Button variant="contained" onClick={handleDocUpload} disabled={!docUploads.length}>
                Upload
              </Button>
            </Stack>

            {docsLoading && <LinearProgress />}
            <Stack spacing={1}>
              {documents?.map((doc) => (
                <Card key={doc.id} variant="outlined">
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle1">{doc.label || doc.name}</Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                          <Chip
                            label={(doc.review_status || 'none').toUpperCase()}
                            color={doc.review_status === 'pending' ? 'warning' : doc.review_status === 'viewed' ? 'success' : 'default'}
                            size="small"
                          />
                          {doc.origin === 'admin' && <Chip label="From Admin" size="small" variant="outlined" color="info" />}
                        </Stack>
                      </Box>
                      <Stack direction="row" spacing={1}>
                        <Button variant="outlined" href={doc.url} target="_blank" rel="noreferrer" size="small">
                          View
                        </Button>
                        {doc.origin === 'client' && (
                          <IconButton color="error" onClick={() => handleDocDelete(doc.id)} size="small">
                            <DeleteOutlineIcon />
                          </IconButton>
                        )}
                        {doc.review_status !== 'viewed' && (
                          <Button variant="text" onClick={() => handleMarkViewed(doc.id)} size="small">
                            Mark Viewed
                          </Button>
                        )}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
              {!documents?.length && !docsLoading && (
                <Typography variant="body2" color="text.secondary">
                  No documents uploaded yet.
                </Typography>
              )}
            </Stack>
          </Stack>
        )}

        {activeTab === 'leads' && (
          <Stack spacing={2}>
            {/* Dashboard Summary Cards - DISABLED FOR NOW */}
            {/* To re-enable, change false to leadStats below */}
            {false && leadStats && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 1 }}>
                <Card variant="outlined" sx={{ bgcolor: 'background.paper' }}>
                  <CardContent sx={{ py: 1.5, px: 2 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'primary.lighter' }}>
                        <PeopleIcon color="primary" />
                      </Box>
                      <Box>
                        <Typography variant="h4" fontWeight={600}>
                          {leadStats.total}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Total Leads (30d)
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
                <Card variant="outlined" sx={{ bgcolor: 'background.paper' }}>
                  <CardContent sx={{ py: 1.5, px: 2 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'success.lighter' }}>
                        <TrendingUpIcon color="success" />
                      </Box>
                      <Box>
                        <Typography variant="h4" fontWeight={600}>
                          {leadStats.conversionRate}%
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Conversion Rate
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
                <Card variant="outlined" sx={{ bgcolor: 'background.paper' }}>
                  <CardContent sx={{ py: 1.5, px: 2 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'warning.lighter' }}>
                        <WarningIcon color="warning" />
                      </Box>
                      <Box>
                        <Typography variant="h4" fontWeight={600}>
                          {leadStats.needsAttention}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Need Attention
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
                <Card variant="outlined" sx={{ bgcolor: 'background.paper' }}>
                  <CardContent sx={{ py: 1.5, px: 2 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'info.lighter' }}>
                        <StarIcon color="info" />
                      </Box>
                      <Box>
                        <Typography variant="h4" fontWeight={600}>
                          {leadStats.averageRating}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Avg Rating
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              </Box>
            )}

            {/* Conversion Funnel Visualization - DISABLED FOR NOW */}
            {/* To re-enable, change false to leadStats below */}
            {false && leadStats && leadStats.byCategory && (
              <Card variant="outlined" sx={{ mb: 2 }}>
                <CardContent sx={{ py: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Lead Funnel (30 days)
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 100, mt: 2 }}>
                    {(() => {
                      const funnelStages = [
                        { key: 'total', label: 'Total', value: leadStats.total, color: '#6366f1' },
                        { key: 'warm', label: 'Warm', value: leadStats.byCategory.warm || 0, color: '#22c55e' },
                        { key: 'very_good', label: 'Very Good', value: leadStats.byCategory.very_good || 0, color: '#10b981' },
                        { key: 'converted', label: 'Converted', value: leadStats.converted || 0, color: '#059669' }
                      ];
                      const maxValue = Math.max(...funnelStages.map((s) => s.value), 1);

                      return funnelStages.map((stage, idx) => {
                        const height = Math.max((stage.value / maxValue) * 100, 8);
                        return (
                          <Box
                            key={stage.key}
                            sx={{
                              flex: 1,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 0.5
                            }}
                          >
                            <Typography variant="h6" fontWeight={600}>
                              {stage.value}
                            </Typography>
                            <Box
                              sx={{
                                width: '100%',
                                height: `${height}%`,
                                bgcolor: stage.color,
                                borderRadius: '4px 4px 0 0',
                                minHeight: 8,
                                transition: 'height 0.3s ease'
                              }}
                            />
                            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
                              {stage.label}
                            </Typography>
                          </Box>
                        );
                      });
                    })()}
                  </Box>
                  {/* Category breakdown */}
                  <Divider sx={{ my: 2 }} />
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {Object.entries(leadStats.byCategory).map(([cat, count]) => {
                      const catColor = getCategoryColor(cat);
                      return (
                        <Chip
                          key={cat}
                          label={`${cat.replace(/_/g, ' ')}: ${count}`}
                          size="small"
                          sx={{
                            bgcolor: catColor.bg,
                            color: catColor.text,
                            border: `1px solid ${catColor.border}`,
                            fontSize: '0.7rem'
                          }}
                        />
                      );
                    })}
                  </Stack>
                </CardContent>
              </Card>
            )}

            {/* Search and Action Bar */}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" flexWrap="wrap">
              {/* Search Input */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  bgcolor: 'grey.100',
                  borderRadius: 1,
                  px: 1.5,
                  py: 0.5,
                  minWidth: { xs: '100%', sm: 250 }
                }}
              >
                <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />
                <InputBase
                  placeholder="Search leads..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadCalls()}
                  sx={{ flex: 1 }}
                />
              </Box>

              {/* View Toggle */}
              <ToggleButtonGroup value={viewMode} exclusive onChange={(e, val) => val && setViewMode(val)} size="small">
                <ToggleButton value="card">
                  <Tooltip title="Card View">
                    <ViewModuleIcon />
                  </Tooltip>
                </ToggleButton>
                <ToggleButton value="table">
                  <Tooltip title="Table View">
                    <ViewListIcon />
                  </Tooltip>
                </ToggleButton>
              </ToggleButtonGroup>

              <Box sx={{ flex: 1 }} />

              <Button variant="contained" onClick={() => loadCalls()} disabled={callsLoading || ctmSyncing} size="small">
                {callsLoading ? 'Loading...' : 'Refresh'}
              </Button>
              <Button variant="outlined" onClick={handleManualCtmSync} disabled={ctmSyncing || callsLoading} size="small">
                {ctmSyncing ? 'Syncing...' : 'Sync CTM'}
              </Button>
              <Tooltip title="Export to CSV">
                <IconButton onClick={handleExportCsv} size="small">
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
              <Button variant="outlined" color="error" onClick={() => setClearCallsDialogOpen(true)} size="small">
                Clear All
              </Button>
              {/* Reclassify button - only visible to admins viewing client portal */}
              {actingClientId && (
                <Tooltip title="Re-run AI classification on all leads">
                  <Button
                    variant="outlined"
                    color="secondary"
                    onClick={() => setReclassifyDialog({ open: true, loading: false, limit: 200 })}
                    size="small"
                  >
                    Reclassify
                  </Button>
                </Tooltip>
              )}
              {ctmSyncing && <Chip label="Syncing..." size="small" color="info" variant="outlined" />}
            </Stack>

            {/* Filters Row */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" flexWrap="wrap">
              <TextField
                select
                label="Activity Type"
                value={callFilters.type}
                onChange={(e) => setCallFilters((prev) => ({ ...prev, type: e.target.value }))}
                size="small"
                sx={{ minWidth: 120 }}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="call">Call</MenuItem>
                <MenuItem value="sms">SMS</MenuItem>
                <MenuItem value="form">Form</MenuItem>
              </TextField>
              <TextField
                select
                label="Caller Type"
                value={callFilters.callerType}
                onChange={(e) => setCallFilters((prev) => ({ ...prev, callerType: e.target.value }))}
                size="small"
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="all">All Callers</MenuItem>
                <MenuItem value="new">New</MenuItem>
                <MenuItem value="repeat">Repeat</MenuItem>
                <MenuItem value="returning_customer">Returning</MenuItem>
              </TextField>
              <TextField
                select
                label="Source"
                value={callFilters.source}
                onChange={(e) => setCallFilters((prev) => ({ ...prev, source: e.target.value }))}
                size="small"
                sx={{ minWidth: 140 }}
              >
                <MenuItem value="all">All Sources</MenuItem>
                {Object.keys(callCategories)
                  .filter((key) => key.startsWith('source:'))
                  .map((key) => (
                    <MenuItem key={key} value={key.replace('source:', '')}>
                      {key.replace('source:', '')} ({callCategories[key]})
                    </MenuItem>
                  ))}
              </TextField>
              <TextField
                type="date"
                label="From"
                value={dateRange.from}
                onChange={(e) => setDateRange((prev) => ({ ...prev, from: e.target.value }))}
                size="small"
                sx={{ minWidth: 140 }}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                type="date"
                label="To"
                value={dateRange.to}
                onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value }))}
                size="small"
                sx={{ minWidth: 140 }}
                InputLabelProps={{ shrink: true }}
              />
              {(searchQuery || dateRange.from || dateRange.to || callFilters.callerType !== 'all') && (
                <>
                  <Button
                    size="small"
                    onClick={async () => {
                      // Reset all filter state
                      setSearchQuery('');
                      setDateRange({ from: '', to: '' });
                      setCallFilters({ type: 'all', source: 'all', category: 'all', callerType: 'all' });
                      setActiveView(null);

                      // Always reload with cleared filters (fetch with default params)
                      setCallsLoading(true);
                      try {
                        const { calls: refreshed, pagination: pag } = await fetchCalls({
                          page: 1,
                          limit: pagination.limit
                        });
                        setCalls(refreshed);
                        if (pag) setPagination(pag);
                      } catch (err) {
                        triggerMessage('error', 'Failed to reload calls');
                      } finally {
                        setCallsLoading(false);
                      }
                    }}
                  >
                    Clear Filters
                  </Button>
                  <Button size="small" variant="outlined" onClick={() => setSaveViewDialog({ open: true, name: '' })}>
                    Save View
                  </Button>
                </>
              )}

              {/* Saved Views Dropdown */}
              {savedViews.length > 0 && (
                <TextField
                  select
                  label="Saved Views"
                  value={activeView || ''}
                  onChange={async (e) => {
                    const viewId = e.target.value;
                    if (viewId === '') {
                      setActiveView(null);
                      return;
                    }
                    const view = savedViews.find((v) => v.id === viewId);
                    if (view) {
                      setActiveView(viewId);
                      const f = view.filters || {};

                      // Update state for UI display
                      setSearchQuery(f.search || '');
                      setDateRange({ from: f.dateFrom || '', to: f.dateTo || '' });
                      setCallFilters({
                        callerType: f.callerType || 'all',
                        category: f.category || 'all',
                        type: f.type || 'all',
                        source: f.source || 'all'
                      });

                      // Fetch with the view's filters directly (don't rely on state)
                      setCallsLoading(true);
                      try {
                        const params = { page: 1, limit: pagination.limit };
                        if (f.search) params.search = f.search;
                        if (f.dateFrom) params.date_from = f.dateFrom;
                        if (f.dateTo) params.date_to = f.dateTo;
                        if (f.callerType && f.callerType !== 'all') params.caller_type = f.callerType;
                        if (f.category && f.category !== 'all') params.category = f.category;

                        const { calls: refreshed, pagination: pag } = await fetchCalls(params);
                        setCalls(refreshed);
                        if (pag) setPagination(pag);
                      } catch (err) {
                        triggerMessage('error', 'Failed to apply saved view');
                      } finally {
                        setCallsLoading(false);
                      }
                    }
                  }}
                  size="small"
                  sx={{ minWidth: 140 }}
                >
                  <MenuItem value="">No View</MenuItem>
                  {savedViews.map((view) => (
                    <MenuItem key={view.id} value={view.id}>
                      {view.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Stack>
            {callsLoading && <LinearProgress />}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Button
                variant={callFilters.category === 'all' ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setCallFilters((prev) => ({ ...prev, category: 'all' }))}
                sx={{ textTransform: 'none' }}
              >
                All
              </Button>
              {[
                'converted',
                'warm',
                'very_good',
                'applicant',
                'needs_attention',
                'unanswered',
                'not_a_fit',
                'spam',
                'neutral',
                'unreviewed'
              ].map((cat) => (
                <Button
                  key={cat}
                  variant={callFilters.category === cat ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => setCallFilters((prev) => ({ ...prev, category: prev.category === cat ? 'all' : cat }))}
                  sx={{ textTransform: 'none' }}
                >
                  {cat.replace(/_/g, ' ').toUpperCase()} ({callCategories[cat] || 0})
                </Button>
              ))}
            </Box>
            <Divider />
            {/* Card View */}
            <Stack spacing={2} sx={{ display: viewMode === 'card' ? 'flex' : 'none' }}>
              {callsLoading && !filteredCalls.length && (
                <>
                  {[1, 2, 3, 4, 5].map((idx) => (
                    <Card key={`skeleton-${idx}`} variant="outlined">
                      <CardContent>
                        <Stack spacing={1}>
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
                            <Skeleton variant="rectangular" width={100} height={24} sx={{ borderRadius: 1 }} />
                            <Skeleton variant="text" width="100%" height={24} sx={{ flex: 1 }} />
                            <Skeleton variant="text" width={150} height={20} />
                          </Stack>
                          <Skeleton variant="text" width="80%" height={20} />
                          <Skeleton variant="text" width="100%" height={20} />
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                            <Skeleton variant="rectangular" width={140} height={32} sx={{ borderRadius: 1 }} />
                            <Skeleton variant="rectangular" width={160} height={32} sx={{ borderRadius: 1 }} />
                            <Skeleton variant="rectangular" width={100} height={32} sx={{ borderRadius: 1 }} />
                            <Box sx={{ display: 'flex', gap: 0.5, ml: 'auto' }}>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Skeleton key={star} variant="circular" width={28} height={28} />
                              ))}
                            </Box>
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
              {!callsLoading &&
                filteredCalls.map((call) => {
                  const categoryColor = getCategoryColor(call.category);
                  const tags = callTags[call.id] || [];
                  return (
                    <Tooltip
                      key={call.id}
                      title={
                        call.classification_summary ? (
                          <Box sx={{ maxWidth: 320, p: 0.5 }}>
                            <Typography sx={{ fontWeight: 600, color: 'white', fontSize: '0.75rem', mb: 0.5 }}>
                              {(call.category || 'unreviewed').replace(/_/g, ' ').toUpperCase()}
                            </Typography>
                            <Typography sx={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.75rem' }}>
                              {call.classification_summary}
                            </Typography>
                          </Box>
                        ) : (
                          ''
                        )
                      }
                      arrow
                      placement="top"
                      enterDelay={400}
                    >
                      <Card
                        variant="outlined"
                        sx={{
                          borderLeft: `4px solid ${categoryColor.border}`,
                          '&:hover': { boxShadow: 2, cursor: 'pointer' },
                          transition: 'box-shadow 0.2s'
                        }}
                        onClick={() => handleOpenLeadDetail(call)}
                      >
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Stack direction="row" spacing={2} alignItems="center">
                            {/* Caller Name & Number */}
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="subtitle1" fontWeight={600} noWrap>
                                {call.caller_name || 'Unknown Caller'}
                              </Typography>
                              {call.caller_number && (
                                <Typography variant="body2" color="text.secondary">
                                  {call.caller_number}
                                </Typography>
                              )}
                            </Box>

                            {/* Classification - Clickable to change */}
                            <Tooltip title="Click to change">
                              <Chip
                                label={(call.category || 'unreviewed').replace(/_/g, ' ').toUpperCase()}
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCategoryMenuAnchor(e.currentTarget);
                                  setCategoryMenuCallId(call.id);
                                }}
                                sx={{
                                  bgcolor: categoryColor.bg,
                                  color: categoryColor.text,
                                  border: `1px solid ${categoryColor.border}`,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  '&:hover': { opacity: 0.8 }
                                }}
                              />
                            </Tooltip>

                            {/* Tags */}
                            <Stack direction="row" spacing={0.5} alignItems="center" onClick={(e) => e.stopPropagation()}>
                              {tags.slice(0, 3).map((tag) => (
                                <Chip
                                  key={tag.id}
                                  label={tag.name}
                                  size="small"
                                  deleteIcon={<CloseIcon sx={{ fontSize: '12px !important' }} />}
                                  onDelete={() => handleRemoveTagFromCall(call.id, tag.id)}
                                  sx={{
                                    bgcolor: tag.color || '#6366f1',
                                    color: 'white',
                                    fontSize: '0.7rem',
                                    height: 22,
                                    fontWeight: 500,
                                    '& .MuiChip-deleteIcon': {
                                      color: 'rgba(255,255,255,0.7)',
                                      marginLeft: '-2px',
                                      '&:hover': { color: 'white' }
                                    }
                                  }}
                                />
                              ))}
                              {tags.length > 3 && (
                                <Chip
                                  label={`+${tags.length - 3}`}
                                  size="small"
                                  variant="outlined"
                                  sx={{ height: 22, fontSize: '0.7rem' }}
                                />
                              )}
                              <Tooltip title="Add tag">
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenLeadDetail(call);
                                  }}
                                  sx={{
                                    p: 0.25,
                                    bgcolor: 'action.hover',
                                    '&:hover': { bgcolor: 'action.selected' }
                                  }}
                                >
                                  <LocalOfferIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            </Stack>

                            {/* Star Rating with Clear */}
                            <Stack direction="row" spacing={0} alignItems="center" onClick={(e) => e.stopPropagation()}>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Tooltip key={star} title={STAR_LABELS[star]} arrow>
                                  <IconButton
                                    size="small"
                                    onClick={() => handleScoreCall(call.id, star)}
                                    sx={{
                                      p: 0.25,
                                      color: star <= (call.rating || 0) ? 'warning.main' : 'action.disabled',
                                      '&:hover': { color: 'warning.main' }
                                    }}
                                  >
                                    {star <= (call.rating || 0) ? (
                                      <StarIcon sx={{ fontSize: 18 }} />
                                    ) : (
                                      <StarBorderIcon sx={{ fontSize: 18 }} />
                                    )}
                                  </IconButton>
                                </Tooltip>
                              ))}
                              {call.rating > 0 && (
                                <Tooltip title="Clear rating" arrow>
                                  <IconButton
                                    size="small"
                                    onClick={() => handleClearScore(call.id)}
                                    sx={{
                                      p: 0.25,
                                      ml: 0.5,
                                      color: 'text.disabled',
                                      '&:hover': { color: 'error.main' }
                                    }}
                                  >
                                    <CloseIcon sx={{ fontSize: 18 }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Stack>

                            {/* Action Buttons */}
                            <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => handleOpenConcernDialog(call)}
                                sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: '0.65rem' }}
                              >
                                Start Journey
                              </Button>
                              <Button
                                size="small"
                                variant="contained"
                                color="secondary"
                                onClick={() => handleOpenServiceDialog(call)}
                                sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: '0.65rem' }}
                              >
                                Agreed to Service
                              </Button>
                            </Stack>

                            {/* Time ago */}
                            <Typography variant="caption" color="text.disabled" sx={{ minWidth: 50, textAlign: 'right' }}>
                              {call.time_ago || call.call_time}
                            </Typography>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Tooltip>
                  );
                })}
              {!filteredCalls.length && !callsLoading && (
                <Typography variant="body2" color="text.secondary">
                  No calls to display.
                </Typography>
              )}
            </Stack>

            {/* Table View */}
            {viewMode === 'table' && !callsLoading && filteredCalls.length > 0 && (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                      <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Caller</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Phone</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Source</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Duration</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Rating</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredCalls.map((call) => {
                      const categoryColor = getCategoryColor(call.category);
                      return (
                        <TableRow key={call.id} hover sx={{ cursor: 'pointer' }} onClick={() => handleOpenLeadDetail(call)}>
                          <TableCell>
                            <Tooltip
                              title={
                                call.classification_summary ? (
                                  <Box sx={{ maxWidth: 300 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                                      AI Classification
                                    </Typography>
                                    <Typography variant="caption">{call.classification_summary}</Typography>
                                  </Box>
                                ) : (
                                  ''
                                )
                              }
                              arrow
                            >
                              <Chip
                                label={(call.category || 'unreviewed').replace(/_/g, ' ')}
                                size="small"
                                sx={{
                                  bgcolor: categoryColor.bg,
                                  color: categoryColor.text,
                                  border: `1px solid ${categoryColor.border}`,
                                  fontWeight: 600,
                                  fontSize: '0.7rem'
                                }}
                              />
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              {call.is_inbound ? (
                                <CallReceivedIcon sx={{ fontSize: 14, color: 'success.main' }} />
                              ) : (
                                <CallMadeIcon sx={{ fontSize: 14, color: 'primary.main' }} />
                              )}
                              <Typography variant="body2">{call.caller_name || 'Unknown'}</Typography>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {call.caller_number || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {call.source || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{call.duration_formatted || '-'}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {call.time_ago || call.call_time}
                            </Typography>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Rating value={call.rating || 0} onChange={(e, v) => v && handleScoreCall(call.id, v)} size="small" />
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Stack direction="row" spacing={0.5}>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => handleOpenConcernDialog(call)}
                                sx={{ fontSize: '0.65rem', py: 0.25 }}
                              >
                                Start Journey
                              </Button>
                              <Button
                                size="small"
                                variant="contained"
                                color="secondary"
                                onClick={() => handleOpenServiceDialog(call)}
                                sx={{ fontSize: '0.65rem', py: 0.25 }}
                              >
                                Agreed to Service
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <Stack direction="row" justifyContent="center" alignItems="center" spacing={2} sx={{ mt: 2 }}>
                <Button size="small" disabled={pagination.page <= 1} onClick={() => loadCalls({ page: pagination.page - 1 })}>
                  Previous
                </Button>
                <Typography variant="body2">
                  Page {pagination.page} of {pagination.totalPages}
                </Typography>
                <Button size="small" disabled={!pagination.hasMore} onClick={() => loadCalls({ page: pagination.page + 1 })}>
                  Next
                </Button>
              </Stack>
            )}
          </Stack>
        )}

        {activeTab === 'reviews' && <ReviewsPanel triggerMessage={triggerMessage} />}

        {activeTab === 'journey' && (
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems="center">
              <Button variant="contained" onClick={loadJourneys} disabled={journeysLoading}>
                Refresh
              </Button>
              <Button variant="outlined" onClick={handleOpenTemplateDialog}>
                Edit Follow-Up Template
              </Button>
              {/* Kanban / List View Toggle */}
              <ToggleButtonGroup
                value={viewMode === 'kanban' ? 'kanban' : 'list'}
                exclusive
                onChange={(e, val) => val && setViewMode(val === 'kanban' ? 'kanban' : 'card')}
                size="small"
                sx={{ ml: 1 }}
              >
                <ToggleButton value="list">
                  <Tooltip title="List View">
                    <ViewListIcon />
                  </Tooltip>
                </ToggleButton>
                <ToggleButton value="kanban">
                  <Tooltip title="Kanban Board">
                    <ViewModuleIcon />
                  </Tooltip>
                </ToggleButton>
              </ToggleButtonGroup>
              <Box sx={{ flex: 1 }} />
              <Typography variant="body2" color="text.secondary">
                {Array.isArray(journeys) ? `${journeys.length} active journey${journeys.length !== 1 ? 's' : ''}` : ''}
              </Typography>
            </Stack>
            {journeysLoading && <LinearProgress />}
            {!journeysLoading && Array.isArray(journeys) && journeys.length === 0 && (
              <Alert severity="info">Start a journey for a lead from the Leads tab to begin tracking their progress.</Alert>
            )}

            {/* Kanban Board View */}
            {viewMode === 'kanban' && Array.isArray(journeys) && journeys.length > 0 && (
              <Box
                sx={{
                  display: 'flex',
                  gap: 2,
                  overflowX: 'auto',
                  pb: 2,
                  minHeight: 500
                }}
              >
                {JOURNEY_STATUS_OPTIONS.filter((s) => s !== 'archived').map((status) => {
                  const statusJourneys = journeys.filter((j) => j.status === status);
                  const statusColors = {
                    pending: { bg: '#f3f4f6', border: '#d1d5db', label: 'Pending' },
                    in_progress: { bg: '#dbeafe', border: '#93c5fd', label: 'In Progress' },
                    active_client: { bg: '#dcfce7', border: '#86efac', label: 'Active Client' },
                    won: { bg: '#d1fae5', border: '#6ee7b7', label: 'Won' },
                    lost: { bg: '#fee2e2', border: '#fca5a5', label: 'Lost' }
                  };
                  const colors = statusColors[status] || { bg: '#f5f5f5', border: '#d4d4d4', label: status };

                  return (
                    <Box
                      key={status}
                      sx={{
                        minWidth: 280,
                        maxWidth: 320,
                        bgcolor: colors.bg,
                        borderRadius: 2,
                        border: `2px solid ${colors.border}`,
                        display: 'flex',
                        flexDirection: 'column'
                      }}
                    >
                      {/* Column Header */}
                      <Box
                        sx={{
                          p: 1.5,
                          borderBottom: `1px solid ${colors.border}`,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <Typography variant="subtitle2" fontWeight={600}>
                          {colors.label}
                        </Typography>
                        <Chip label={statusJourneys.length} size="small" sx={{ minWidth: 28 }} />
                      </Box>

                      {/* Column Content */}
                      <Box sx={{ p: 1, flex: 1, overflow: 'auto' }}>
                        <Stack spacing={1}>
                          {statusJourneys.map((journey) => {
                            const currentStep = getJourneyCurrentStep(journey);
                            return (
                              <Paper
                                key={journey.id}
                                variant="outlined"
                                sx={{
                                  p: 1.5,
                                  cursor: 'pointer',
                                  '&:hover': { boxShadow: 1 },
                                  borderLeft: journey.paused ? '3px solid' : 'none',
                                  borderLeftColor: 'warning.main'
                                }}
                                onClick={() => handleOpenJourneyDrawer(journey)}
                              >
                                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                  {journey.client_name || 'Unnamed'}
                                </Typography>
                                {journey.client_phone && (
                                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                    {journey.client_phone}
                                  </Typography>
                                )}
                                {currentStep && (
                                  <Chip label={currentStep.label} size="small" sx={{ mt: 1, fontSize: '0.65rem', height: 20 }} />
                                )}
                                {journey.symptoms?.length > 0 && (
                                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                                    {journey.symptoms.slice(0, 2).map((s) => (
                                      <Chip key={s} label={s} size="small" sx={{ fontSize: '0.6rem', height: 18 }} variant="outlined" />
                                    ))}
                                    {journey.symptoms.length > 2 && (
                                      <Typography variant="caption" color="text.secondary">
                                        +{journey.symptoms.length - 2}
                                      </Typography>
                                    )}
                                  </Stack>
                                )}
                              </Paper>
                            );
                          })}
                          {statusJourneys.length === 0 && (
                            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                              No journeys
                            </Typography>
                          )}
                        </Stack>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}

            {/* List View (Original) */}
            {viewMode !== 'kanban' &&
              (Array.isArray(journeys) ? journeys : []).map((journey) => {
                const steps = journey.steps || [];
                const completedSteps = steps.filter((step) => step.completed_at);
                const currentStep = getJourneyCurrentStep(journey);

                return (
                  <Card
                    key={journey.id}
                    variant="outlined"
                    sx={{
                      transition: 'box-shadow 0.2s',
                      '&:hover': { boxShadow: 2 },
                      borderLeft: journey.paused ? '4px solid' : 'none',
                      borderLeftColor: journey.paused ? 'warning.main' : 'transparent'
                    }}
                  >
                    <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                      <Stack direction="row" alignItems="flex-start" spacing={2}>
                        {/* Left: Lead Info */}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          {/* Top row: Name, Phone, Current Step */}
                          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                              {journey.client_name || 'Unnamed Lead'}
                            </Typography>
                            {journey.client_phone && (
                              <Stack direction="row" spacing={0.5} alignItems="center">
                                <PhoneIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                                <Typography variant="body2" color="text.secondary">
                                  {journey.client_phone}
                                </Typography>
                              </Stack>
                            )}
                            {journey.paused && <Chip label="Paused" color="warning" size="small" />}
                            <Box sx={{ flex: 1 }} />
                            {currentStep ? (
                              <Chip
                                label={`Step: ${currentStep.label}`}
                                size="small"
                                color="primary"
                                variant="outlined"
                                icon={<RadioButtonUncheckedIcon />}
                              />
                            ) : steps.length === 0 ? (
                              <Chip label="No steps" size="small" variant="outlined" />
                            ) : (
                              <Chip label="All complete" size="small" color="success" icon={<CheckCircleIcon />} />
                            )}
                            <Typography variant="caption" color="text.secondary">
                              {completedSteps.length}/{steps.length}
                            </Typography>
                          </Stack>

                          {/* Concerns chips */}
                          {journey.symptoms?.length > 0 && (
                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                              {journey.symptoms.map((concern) => (
                                <Chip
                                  key={`${journey.id}-${concern}`}
                                  label={concern}
                                  size="small"
                                  sx={{ fontSize: '0.75rem', height: 24 }}
                                />
                              ))}
                            </Stack>
                          )}
                          {journey.symptoms_redacted && (
                            <Typography variant="caption" color="text.secondary">
                              Concerns redacted after 90 days.
                            </Typography>
                          )}
                        </Box>

                        {/* Right: Actions */}
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Tooltip title="Archive Journey">
                            <IconButton
                              size="small"
                              color="default"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleArchiveJourney(journey);
                              }}
                              sx={{
                                opacity: 0.6,
                                '&:hover': { opacity: 1, color: 'error.main' }
                              }}
                            >
                              <ArchiveIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Button
                            variant="contained"
                            onClick={() => handleOpenJourneyDrawer(journey)}
                            sx={{ minWidth: 140, whiteSpace: 'nowrap' }}
                          >
                            View Journey
                          </Button>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            {viewMode !== 'kanban' && null}
          </Stack>
        )}
        {activeTab === 'archive' && (
          <Stack spacing={3}>
            {archiveLoading && <LinearProgress />}

            {/* Archived Journeys Section */}
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <ArchiveIcon color="action" />
                      <Typography variant="h6">Archived Journeys</Typography>
                      <Chip label={archivedJourneys.length} size="small" color="default" />
                    </Stack>
                    <Tooltip title="Refresh archive data">
                      <IconButton size="small" onClick={loadArchiveData} disabled={archiveLoading}>
                        <RefreshIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  {archivedJourneys.length === 0 ? (
                    <Box sx={{ py: 3, textAlign: 'center', bgcolor: 'action.hover', borderRadius: 2 }}>
                      <ArchiveIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                      <Typography variant="body2" color="text.secondary">
                        No archived journeys. Archived journeys will appear here.
                      </Typography>
                    </Box>
                  ) : (
                    <Stack spacing={1.5}>
                      {archivedJourneys.map((journey) => (
                        <Card
                          key={journey.id}
                          variant="outlined"
                          sx={{
                            bgcolor: 'grey.50',
                            transition: 'all 0.2s',
                            '&:hover': { bgcolor: 'background.paper', boxShadow: 1 }
                          }}
                        >
                          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Stack
                              direction={{ xs: 'column', sm: 'row' }}
                              spacing={1.5}
                              justifyContent="space-between"
                              alignItems={{ xs: 'flex-start', sm: 'center' }}
                            >
                              <Box sx={{ flex: 1 }}>
                                <Stack direction="row" spacing={1} alignItems="center">
                                  <Typography variant="subtitle1" fontWeight={600}>
                                    {journey.client_name || journey.client_phone || journey.client_email || 'Unnamed Lead'}
                                  </Typography>
                                  {journey.status && (
                                    <Chip
                                      label={journey.status.replace(/_/g, ' ')}
                                      size="small"
                                      variant="outlined"
                                      sx={{ textTransform: 'capitalize', fontSize: '0.7rem' }}
                                    />
                                  )}
                                </Stack>
                                <Typography variant="caption" color="text.secondary">
                                  Archived {journey.archived_at ? formatDateDisplay(journey.archived_at) : 'unknown'}
                                </Typography>
                                {journey.symptoms?.length > 0 && (
                                  <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                                    {journey.symptoms.slice(0, 3).map((concern) => (
                                      <Chip
                                        key={`${journey.id}-archived-${concern}`}
                                        label={concern}
                                        size="small"
                                        sx={{ fontSize: '0.7rem', height: 20 }}
                                      />
                                    ))}
                                    {journey.symptoms.length > 3 && (
                                      <Chip
                                        label={`+${journey.symptoms.length - 3}`}
                                        size="small"
                                        variant="outlined"
                                        sx={{ fontSize: '0.7rem', height: 20 }}
                                      />
                                    )}
                                  </Stack>
                                )}
                              </Box>
                              <Tooltip title="Restore this journey">
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<RestoreIcon />}
                                  onClick={() => handleRestoreJourney(journey)}
                                  sx={{ minWidth: 100 }}
                                >
                                  Restore
                                </Button>
                              </Tooltip>
                            </Stack>
                          </CardContent>
                        </Card>
                      ))}
                    </Stack>
                  )}
                </Stack>
              </CardContent>
            </Card>

            {/* Archived Active Clients Section */}
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <PersonIcon color="action" />
                    <Typography variant="h6">Archived Clients</Typography>
                    <Chip label={archivedClients.length} size="small" color="default" />
                  </Stack>
                  {archivedClients.length === 0 ? (
                    <Box sx={{ py: 3, textAlign: 'center', bgcolor: 'action.hover', borderRadius: 2 }}>
                      <PersonIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                      <Typography variant="body2" color="text.secondary">
                        No archived clients. Archived clients will appear here.
                      </Typography>
                    </Box>
                  ) : (
                    <Stack spacing={1.5}>
                      {archivedClients.map((client) => (
                        <Card
                          key={client.id}
                          variant="outlined"
                          sx={{
                            bgcolor: 'grey.50',
                            transition: 'all 0.2s',
                            '&:hover': { bgcolor: 'background.paper', boxShadow: 1 }
                          }}
                        >
                          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Stack
                              direction={{ xs: 'column', sm: 'row' }}
                              spacing={1.5}
                              justifyContent="space-between"
                              alignItems={{ xs: 'flex-start', sm: 'center' }}
                            >
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="subtitle1" fontWeight={600}>
                                  {client.client_name || 'Unknown Client'}
                                </Typography>
                                <Stack direction="row" spacing={2} alignItems="center">
                                  <Typography variant="caption" color="text.secondary">
                                    Archived {client.archived_at ? formatDateDisplay(client.archived_at) : 'unknown'}
                                  </Typography>
                                  {client.client_phone && (
                                    <Typography variant="caption" color="text.secondary">
                                      {client.client_phone}
                                    </Typography>
                                  )}
                                  {client.client_email && (
                                    <Typography variant="caption" color="text.secondary">
                                      {client.client_email}
                                    </Typography>
                                  )}
                                </Stack>
                                {client.services?.length > 0 && (
                                  <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                                    {client.services
                                      .filter((s) => !s.redacted_at)
                                      .slice(0, 4)
                                      .map((service) => (
                                        <Chip
                                          key={`${client.id}-${service.id}`}
                                          label={service.service_name}
                                          size="small"
                                          color="primary"
                                          variant="outlined"
                                          sx={{ fontSize: '0.7rem', height: 20 }}
                                        />
                                      ))}
                                    {client.services.filter((s) => !s.redacted_at).length > 4 && (
                                      <Chip
                                        label={`+${client.services.filter((s) => !s.redacted_at).length - 4}`}
                                        size="small"
                                        variant="outlined"
                                        sx={{ fontSize: '0.7rem', height: 20 }}
                                      />
                                    )}
                                  </Stack>
                                )}
                              </Box>
                              <Tooltip title="Restore this client">
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<RestoreIcon />}
                                  onClick={() => handleRestoreClient(client)}
                                  sx={{ minWidth: 100 }}
                                >
                                  Restore
                                </Button>
                              </Tooltip>
                            </Stack>
                          </CardContent>
                        </Card>
                      ))}
                    </Stack>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        )}

        {activeTab === 'profile' && (
          <Box>
            {profileLoading && !profile && <LinearProgress />}
            {profile && (
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                  <Avatar src={profile.avatar_url || ''} sx={{ width: 96, height: 96 }} />
                  <Button variant="outlined" component="label">
                    Upload Photo
                    <input type="file" hidden accept="image/*" onChange={(e) => handleAvatarUpload(e.target.files?.[0])} />
                  </Button>
                </Stack>
                <Stack spacing={2}>
                  <TextField
                    label="Display Name"
                    fullWidth
                    value={profileForm.display_name}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, display_name: e.target.value }))}
                  />
                  <TextField
                    label="Email"
                    type="email"
                    fullWidth
                    value={profileForm.email}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                  <TextField
                    label="Current Password"
                    type="password"
                    fullWidth
                    value={profileForm.current_password}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, current_password: e.target.value }))}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">Required to change password</InputAdornment>
                    }}
                  />
                  <TextField
                    label="New Password"
                    type="password"
                    fullWidth
                    value={profileForm.new_password}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, new_password: e.target.value }))}
                  />
                  <TextField
                    label="Confirm New Password"
                    type="password"
                    fullWidth
                    value={profileForm.new_password_confirm}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, new_password_confirm: e.target.value }))}
                  />
                  <TextField
                    label="Monthly Revenue Goal"
                    type="number"
                    fullWidth
                    value={profileForm.monthly_revenue_goal}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, monthly_revenue_goal: e.target.value }))}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">$</InputAdornment>
                    }}
                    inputProps={{ step: '0.01', min: '0' }}
                    helperText="Track progress towards your monthly goal in Active Clients"
                  />
                </Stack>
                <Button variant="contained" onClick={handleProfileSave} disabled={profileLoading} sx={{ alignSelf: 'flex-start' }}>
                  {profileLoading ? 'Saving…' : 'Save Profile'}
                </Button>
              </Stack>
            )}
          </Box>
        )}
      </Stack>

      <Dialog open={requestDialogOpen} onClose={handleCloseRequestDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Submit a New Request</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Request Name / Title"
              fullWidth
              value={requestForm.title}
              onChange={(e) => setRequestForm((prev) => ({ ...prev, title: e.target.value }))}
            />
            <TextField
              label="Request Details"
              fullWidth
              multiline
              minRows={4}
              value={requestForm.description}
              onChange={(e) => setRequestForm((prev) => ({ ...prev, description: e.target.value }))}
            />
            <TextField
              type="date"
              label="Desired Due Date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={requestForm.due_date}
              onChange={(e) => setRequestForm((prev) => ({ ...prev, due_date: e.target.value }))}
            />
            <Stack spacing={1}>
              <Button variant="outlined" startIcon={<UploadFileIcon />} component="label">
                {requestAttachment ? 'Change Attachment' : 'Add Attachment'}
                <input type="file" hidden onChange={(e) => setRequestAttachment(e.target.files?.[0] || null)} />
              </Button>
              {requestAttachment && (
                <Chip
                  label={requestAttachment.name}
                  onDelete={() => setRequestAttachment(null)}
                  variant="outlined"
                  sx={{ alignSelf: 'flex-start' }}
                />
              )}
            </Stack>
            <Button variant={requestForm.rush ? 'contained' : 'outlined'} onClick={handleRushToggle} fullWidth>
              {requestForm.rush ? 'Rush requested' : 'I need this done today'}
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRequestDialog}>Cancel</Button>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleRequestSubmit} disabled={submittingRequest}>
            {submittingRequest ? 'Submitting…' : 'Submit Request'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={rushConfirmOpen} onClose={handleRushCancel} maxWidth="xs" fullWidth>
        <DialogTitle>Confirm Rush Job</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 1 }}>
            Please note that rush jobs require an additional fee. Do you want to proceed?
          </Alert>
          <Typography variant="body2" color="text.secondary">
            Rush requests are prioritized immediately and may incur an additional charge depending on scope.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleRushCancel}>No, go back</Button>
          <Button variant="contained" onClick={handleRushConfirm}>
            Yes, proceed
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={updatesDialog.open} onClose={() => setUpdatesDialog({ open: false, task: null })} maxWidth="sm" fullWidth>
        <DialogTitle>{updatesDialog.task?.name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Updates are not available in this build.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUpdatesDialog({ open: false, task: null })}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Service Selection Dialog */}
      <Dialog open={serviceDialogOpen} onClose={handleCloseServiceDialog} maxWidth="md" fullWidth>
        <DialogTitle>Agree to Service - {serviceDialogLead?.caller_name || serviceDialogLead?.caller_number || 'Lead'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Convert this lead to an active client by selecting the service(s) they agreed to.
            </Typography>
            {serviceDialogLead && (
              <Box sx={{ p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                <Typography variant="subtitle2">Lead Information:</Typography>
                <Typography variant="body2">
                  <strong>Name:</strong> {serviceDialogLead.caller_name || 'Unknown'}
                </Typography>
                <Typography variant="body2">
                  <strong>Phone:</strong> {serviceDialogLead.caller_number || 'N/A'}
                </Typography>
                <Typography variant="body2">
                  <strong>Source:</strong> {serviceDialogLead.source || 'N/A'}
                </Typography>
                <Typography variant="body2">
                  <strong>Region:</strong> {serviceDialogLead.region || 'N/A'}
                </Typography>
              </Box>
            )}
            {services.length === 0 ? (
              <Alert severity="warning">No services configured. Please add services in the Services page first.</Alert>
            ) : (
              <Stack spacing={2}>
                {services.map((service) => {
                  const isSelected = selectedServices.some((s) => s.service_id === service.id);
                  const selectedService = selectedServices.find((s) => s.service_id === service.id);
                  return (
                    <Box
                      key={service.id}
                      sx={{
                        p: 2,
                        border: '1px solid',
                        borderColor: isSelected ? 'primary.main' : 'divider',
                        borderRadius: 1,
                        bgcolor: isSelected ? 'primary.lighter' : 'transparent'
                      }}
                    >
                      <Stack direction="row" spacing={2} alignItems="flex-start">
                        <Checkbox checked={isSelected} onChange={() => handleToggleService(service.id)} />
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="subtitle1">{service.name}</Typography>
                          {service.description && (
                            <Typography variant="body2" color="text.secondary">
                              {service.description}
                            </Typography>
                          )}
                        </Box>
                        {isSelected && (
                          <TextField
                            label="Agreed Price"
                            type="number"
                            size="small"
                            value={selectedService?.agreed_price || 0}
                            onChange={(e) => handleUpdateServicePrice(service.id, e.target.value)}
                            InputProps={{
                              startAdornment: <InputAdornment position="start">$</InputAdornment>
                            }}
                            inputProps={{ step: '0.01', min: '0' }}
                            sx={{ width: 150 }}
                          />
                        )}
                        {!isSelected && service.base_price && (
                          <Typography variant="body2" color="text.secondary">
                            Base: ${parseFloat(service.base_price).toFixed(2)}
                          </Typography>
                        )}
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseServiceDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleAgreeToService} disabled={selectedServices.length === 0}>
            Confirm Agreement ({selectedServices.length} service{selectedServices.length !== 1 ? 's' : ''})
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={concernDialog.open} onClose={handleCloseConcernDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{concernDialog.journeyId ? 'Update Journey' : 'Start Journey'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Select the services or concerns this lead is interested in to start tracking their journey.
            </Typography>
            <Autocomplete
              multiple
              freeSolo
              options={concernOptions}
              value={concernDialog.values}
              onChange={handleConcernDialogChange}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Services / Interests"
                  placeholder="Select or type a custom entry"
                  helperText="Select from suggestions or type a custom entry and press Enter"
                />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseConcernDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleConcernDialogSave} disabled={concernSaving}>
            {concernSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={stepDialog.open} onClose={handleCloseStepDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{stepDialog.stepId ? 'Edit Journey Step' : 'Add Journey Step'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Step Label" value={stepDialog.form.label} onChange={handleStepFieldChange('label')} fullWidth />
            <TextField
              label="Channel (call, text, email)"
              value={stepDialog.form.channel}
              onChange={handleStepFieldChange('channel')}
              fullWidth
            />
            <TextField
              label="Message / Instructions"
              value={stepDialog.form.message}
              onChange={handleStepFieldChange('message')}
              multiline
              minRows={3}
              fullWidth
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                label="Offset (weeks)"
                type="number"
                value={stepDialog.form.offset_weeks}
                onChange={handleStepFieldChange('offset_weeks')}
                fullWidth
              />
              <TextField
                label="Due Date"
                type="datetime-local"
                value={stepDialog.form.due_at}
                onChange={handleStepFieldChange('due_at')}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseStepDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleStepDialogSave}>
            Save Step
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={noteDialog.open} onClose={handleCloseNoteDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{noteDialog.stepId ? 'Add Step Note' : 'Add Journey Note'}</DialogTitle>
        <DialogContent>
          <TextField
            multiline
            minRows={4}
            fullWidth
            value={noteDialog.value}
            onChange={(e) => setNoteDialog((prev) => ({ ...prev, value: e.target.value }))}
            placeholder={
              noteDialog.stepId ? 'Record what happened during this follow-up step.' : 'Record what happened during this outreach.'
            }
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseNoteDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveStepNote} disabled={!noteDialog.value?.trim() || !noteDialog.stepId}>
            Save Note
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={timelineDialog.open} onClose={handleCloseTimelineDialog} maxWidth="md" fullWidth>
        <DialogTitle>Journey Timeline{timelineDialog.journey ? ` · ${timelineDialog.journey.client_name || 'Lead'}` : ''}</DialogTitle>
        <DialogContent dividers>
          {timelineDialog.journey ? (
            <Stack spacing={3}>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Follow-Up Steps
                </Typography>
                <Stack spacing={1}>
                  {(timelineDialog.journey.steps || []).length ? (
                    timelineDialog.journey.steps.map((step) => (
                      <Paper key={step.id} variant="outlined" sx={{ p: 1.5 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip
                            label={step.completed_at ? 'Completed' : 'Pending'}
                            color={step.completed_at ? 'success' : 'default'}
                            size="small"
                          />
                          <Typography variant="subtitle2">{step.label}</Typography>
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {step.channel || 'No channel listed'} · {step.due_at ? formatDateDisplay(step.due_at) : 'No due date'}
                        </Typography>
                        {step.message && (
                          <Typography variant="body2" sx={{ mt: 0.5 }}>
                            {step.message}
                          </Typography>
                        )}
                        {step.completed_at && (
                          <Typography variant="caption" color="text.secondary">
                            Completed {formatDateDisplay(step.completed_at)}
                          </Typography>
                        )}
                      </Paper>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No steps added yet.
                    </Typography>
                  )}
                </Stack>
              </Box>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Notes
                </Typography>
                <Stack spacing={1}>
                  {(timelineDialog.journey.notes || []).length ? (
                    timelineDialog.journey.notes.map((note) => (
                      <Paper key={note.id} variant="outlined" sx={{ p: 1.5 }}>
                        <Typography variant="body2">{note.body}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {note.author_name} · {formatDateDisplay(note.created_at)}
                        </Typography>
                      </Paper>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No notes have been recorded.
                    </Typography>
                  )}
                </Stack>
              </Box>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Select a journey to view its timeline.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseTimelineDialog}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={templateDialogOpen} onClose={() => setTemplateDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Client Journey Template</DialogTitle>
        <DialogContent dividers>
          {templateLoading ? (
            <LinearProgress />
          ) : (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Edit the default follow-up steps that are applied whenever you assign a lead to the Client Journey.
              </Typography>
              {templateDraft.map((step, index) => (
                <Paper key={step.id || index} variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="subtitle2">Step {index + 1}</Typography>
                      <Button size="small" color="error" onClick={() => handleRemoveTemplateStep(index)}>
                        Remove
                      </Button>
                    </Stack>
                    <TextField label="Label" value={step.label} onChange={handleTemplateFieldChange(index, 'label')} fullWidth />
                    <TextField
                      label="Channel"
                      value={step.channel || ''}
                      onChange={handleTemplateFieldChange(index, 'channel')}
                      fullWidth
                    />
                    <TextField
                      label="Message"
                      value={step.message || ''}
                      onChange={handleTemplateFieldChange(index, 'message')}
                      multiline
                      minRows={2}
                      fullWidth
                    />
                    <TextField
                      label="Offset Weeks"
                      type="number"
                      value={step.offset_weeks ?? 0}
                      onChange={handleTemplateFieldChange(index, 'offset_weeks')}
                      fullWidth
                    />
                  </Stack>
                </Paper>
              ))}
              <Button variant="outlined" onClick={handleAddTemplateStep}>
                Add Template Step
              </Button>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplateDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleTemplateSave} disabled={templateSaving}>
            {templateSaving ? 'Saving…' : 'Save Template'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear Calls Confirmation Dialog */}
      <Dialog open={clearCallsDialogOpen} onClose={() => setClearCallsDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Clear All Calls?</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Are you sure you want to clear all calls and reload? This action is non-reversible.
          </Typography>
          <Typography variant="body2" color="error">
            All cached call data will be permanently deleted and fresh data will be loaded from CallTrackingMetrics.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearCallsDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleClearAndReloadCalls}>
            Yes, Clear & Reload
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reclassify Leads Dialog - Admin only */}
      <Dialog
        open={reclassifyDialog.open}
        onClose={() => !reclassifyDialog.loading && setReclassifyDialog({ open: false, loading: false, limit: 200 })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Reclassify Leads</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            This will re-run AI classification on leads in the database. Existing ratings and manual classifications will be preserved.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Only leads without a manual rating (1-5 stars) will be reclassified. This helps correct any AI misclassifications.
          </Typography>
          <TextField
            label="Maximum leads to process"
            type="number"
            value={reclassifyDialog.limit}
            onChange={(e) => setReclassifyDialog((prev) => ({ ...prev, limit: parseInt(e.target.value, 10) || 200 }))}
            size="small"
            fullWidth
            inputProps={{ min: 1, max: 1000 }}
            helperText="Processing many leads may take a few minutes"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReclassifyDialog({ open: false, loading: false, limit: 200 })} disabled={reclassifyDialog.loading}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleReclassifyLeads} disabled={reclassifyDialog.loading}>
            {reclassifyDialog.loading ? 'Reclassifying...' : 'Reclassify Leads'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Save View Dialog */}
      <Dialog open={saveViewDialog.open} onClose={() => setSaveViewDialog({ open: false, name: '' })} maxWidth="xs" fullWidth>
        <DialogTitle>Save Current Filters</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="View Name"
            value={saveViewDialog.name}
            onChange={(e) => setSaveViewDialog((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., New Leads This Week"
            sx={{ mt: 1 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && saveViewDialog.name.trim()) {
                e.preventDefault();
                (async () => {
                  try {
                    const view = await createSavedView(saveViewDialog.name.trim(), {
                      search: searchQuery,
                      dateFrom: dateRange.from,
                      dateTo: dateRange.to,
                      callerType: callFilters.callerType,
                      category: callFilters.category,
                      type: callFilters.type,
                      source: callFilters.source
                    });
                    setSavedViews((prev) => [view, ...prev]);
                    triggerMessage('success', `View "${saveViewDialog.name.trim()}" saved`);
                    setSaveViewDialog({ open: false, name: '' });
                  } catch (err) {
                    triggerMessage('error', 'Failed to save view');
                  }
                })();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveViewDialog({ open: false, name: '' })}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!saveViewDialog.name.trim()}
            onClick={async () => {
              try {
                const view = await createSavedView(saveViewDialog.name.trim(), {
                  search: searchQuery,
                  dateFrom: dateRange.from,
                  dateTo: dateRange.to,
                  callerType: callFilters.callerType,
                  category: callFilters.category,
                  type: callFilters.type,
                  source: callFilters.source
                });
                setSavedViews((prev) => [view, ...prev]);
                triggerMessage('success', `View "${saveViewDialog.name.trim()}" saved`);
                setSaveViewDialog({ open: false, name: '' });
              } catch (err) {
                triggerMessage('error', 'Failed to save view');
              }
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Archive Confirmation Dialog */}
      <Dialog
        open={archiveConfirmDialog.open}
        onClose={() => setArchiveConfirmDialog({ open: false, type: null, item: null })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{archiveConfirmDialog.type === 'journey' ? 'Archive Journey?' : 'Archive Client?'}</DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            Are you sure you want to archive{' '}
            <strong>
              {archiveConfirmDialog.item?.client_name ||
                archiveConfirmDialog.item?.client_phone ||
                archiveConfirmDialog.item?.client_email ||
                (archiveConfirmDialog.type === 'journey' ? 'this journey' : 'this client')}
            </strong>
            ?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            You can restore archived items from the Archive tab at any time.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveConfirmDialog({ open: false, type: null, item: null })}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleConfirmArchive}>
            Archive
          </Button>
        </DialogActions>
      </Dialog>

      {onboardingModalOpen && (
        <Box sx={{ position: 'fixed', inset: 0, zIndex: 2200 }}>
          <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(10, 14, 26, 0.5)', zIndex: 0 }} />
          <FireworksCanvas style={{ zIndex: 1 }} />
          <Box
            sx={{
              position: 'relative',
              zIndex: 2,
              minHeight: '100vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: 2
            }}
          >
            <Paper
              elevation={0}
              sx={{
                width: '100%',
                maxWidth: 560,
                p: { xs: 3, md: 4 },
                borderRadius: 3,
                bgcolor: 'rgba(255,255,255,0.96)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.55)'
              }}
            >
              <Stack spacing={2.25}>
                <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.6 }}>
                  Thank you for completing your onboarding
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Your account is ready for the next steps. We've saved your details.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Next step: schedule a quick kick-off with your Account Manager.
                </Typography>
                <Button
                  component="a"
                  href="https://calendar.app.google/zgRn9gFuVizsnMmM9"
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="contained"
                  size="large"
                  fullWidth
                >
                  Schedule a meeting with your Account Manager
                </Button>
                <Button variant="text" onClick={() => setOnboardingModalOpen(false)} sx={{ alignSelf: 'center' }}>
                  Close
                </Button>
              </Stack>
            </Paper>
          </Box>
        </Box>
      )}

      {/* Journey Management Drawer */}
      <Drawer
        anchor="right"
        open={journeyDrawer.open}
        onClose={handleCloseJourneyDrawer}
        PaperProps={{
          sx: { width: { xs: '100%', sm: '40vw' }, p: 0 }
        }}
      >
        {journeyDrawer.journey &&
          (() => {
            const journey = journeyDrawer.journey;
            const steps = (journey.steps || []).slice().sort((a, b) => a.position - b.position);
            const completedSteps = steps.filter((s) => s.completed_at);
            const currentStep = getJourneyCurrentStep(journey);

            return (
              <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      {journey.client_name || 'Unnamed Lead'}
                    </Typography>
                    <IconButton onClick={handleCloseJourneyDrawer} size="small">
                      <CloseIcon />
                    </IconButton>
                  </Stack>
                  <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                    {journey.client_phone && (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <PhoneIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                        <Typography variant="body2">{journey.client_phone}</Typography>
                      </Stack>
                    )}
                    {journey.client_email && (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <EmailIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                        <Typography variant="body2">{journey.client_email}</Typography>
                      </Stack>
                    )}
                  </Stack>
                  {journey.symptoms?.length > 0 && (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
                      {journey.symptoms.map((concern) => (
                        <Chip key={concern} label={concern} size="small" />
                      ))}
                      <Chip
                        label="Edit"
                        size="small"
                        variant="outlined"
                        onClick={() => handleOpenConcernDialog(null, journey)}
                        icon={<EditIcon sx={{ fontSize: 14 }} />}
                      />
                    </Stack>
                  )}
                  {/* Quick Actions */}
                  <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                    <Tooltip title={journey.paused ? 'Resume Journey' : 'Pause Journey'}>
                      <Button
                        size="small"
                        variant="outlined"
                        color={journey.paused ? 'success' : 'warning'}
                        startIcon={journey.paused ? <PlayArrowIcon /> : <PauseIcon />}
                        onClick={() => handleJourneyStatusChange(journey.id, { paused: !journey.paused })}
                      >
                        {journey.paused ? 'Resume' : 'Pause'}
                      </Button>
                    </Tooltip>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleJourneyAgreedToService(journey)}
                      disabled={!journey.lead_call_key && !journey.lead_call_id}
                    >
                      Convert to Client
                    </Button>
                    <Box sx={{ flex: 1 }} />
                    <Tooltip title="Archive Journey">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => {
                          handleArchiveJourney(journey);
                          handleCloseJourneyDrawer();
                        }}
                      >
                        <ArchiveIcon />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Box>

                {/* Progress Bar */}
                <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Progress
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {completedSteps.length} of {steps.length} steps completed
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={steps.length ? (completedSteps.length / steps.length) * 100 : 0}
                    sx={{ height: 6, borderRadius: 3 }}
                  />
                </Box>

                {/* Timeline Steps */}
                <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                  <Stack spacing={0}>
                    {steps.length === 0 ? (
                      <Box sx={{ textAlign: 'center', py: 4 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          No follow-up steps defined yet.
                        </Typography>
                        <Button variant="outlined" onClick={() => handleApplyTemplateToJourney(journey.id)} sx={{ mr: 1 }}>
                          Apply Template
                        </Button>
                        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => handleOpenStepDialog(journey)}>
                          Add Step
                        </Button>
                      </Box>
                    ) : (
                      steps.map((step, index) => {
                        const isExpanded = expandedSteps[step.id];
                        const isCurrent = currentStep?.id === step.id;
                        const isComplete = Boolean(step.completed_at);

                        return (
                          <Box key={step.id}>
                            {/* Timeline connector */}
                            {index > 0 && (
                              <Box
                                sx={{
                                  width: 2,
                                  height: 16,
                                  bgcolor: steps[index - 1]?.completed_at ? 'success.main' : 'grey.300',
                                  ml: '15px'
                                }}
                              />
                            )}
                            <Paper
                              variant="outlined"
                              sx={{
                                p: 1.5,
                                borderColor: isCurrent ? 'primary.main' : 'divider',
                                borderWidth: isCurrent ? 2 : 1,
                                bgcolor: isComplete ? 'success.50' : isCurrent ? 'primary.50' : 'background.paper'
                              }}
                            >
                              <Stack direction="row" alignItems="flex-start" spacing={1.5}>
                                {/* Status Icon */}
                                <Box
                                  sx={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: isComplete ? 'success.main' : isCurrent ? 'primary.main' : 'grey.200',
                                    color: isComplete || isCurrent ? 'white' : 'grey.600',
                                    flexShrink: 0,
                                    cursor: 'pointer',
                                    '&:hover': { opacity: 0.8 }
                                  }}
                                  onClick={() => handleToggleStepComplete(journey.id, step)}
                                >
                                  {isComplete ? (
                                    <CheckCircleIcon sx={{ fontSize: 20, color: 'inherit' }} />
                                  ) : (
                                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'inherit' }}>
                                      {index + 1}
                                    </Typography>
                                  )}
                                </Box>

                                {/* Step Content */}
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                      {step.label}
                                    </Typography>
                                    <IconButton size="small" onClick={() => toggleStepExpanded(step.id)}>
                                      {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                    </IconButton>
                                  </Stack>
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    {step.channel && <Chip label={step.channel} size="small" sx={{ fontSize: '0.7rem', height: 20 }} />}
                                    {step.due_at && (
                                      <Typography variant="caption" color="text.secondary">
                                        Due: {formatDateDisplay(step.due_at)}
                                      </Typography>
                                    )}
                                    {isComplete && (
                                      <Typography variant="caption" color="success.main">
                                        ✓ {formatDateDisplay(step.completed_at)}
                                      </Typography>
                                    )}
                                  </Stack>

                                  {/* Expanded Content */}
                                  <Collapse in={isExpanded}>
                                    <Box sx={{ mt: 1.5 }}>
                                      {step.message && (
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                          {step.message}
                                        </Typography>
                                      )}
                                      {/* Step Notes */}
                                      {step.notes && (
                                        <Paper variant="outlined" sx={{ p: 1, mb: 1.5, bgcolor: 'grey.50' }}>
                                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                            Notes:
                                          </Typography>
                                          <Typography variant="body2">{step.notes}</Typography>
                                        </Paper>
                                      )}
                                      {/* Step Actions */}
                                      <Stack direction="row" spacing={1}>
                                        <Button
                                          size="small"
                                          variant={isComplete ? 'outlined' : 'contained'}
                                          color={isComplete ? 'inherit' : 'secondary'}
                                          onClick={() => handleToggleStepComplete(journey.id, step)}
                                        >
                                          {isComplete ? 'Mark Incomplete' : 'Mark Complete'}
                                        </Button>
                                        <Button size="small" variant="outlined" onClick={() => handleOpenNoteDialog(journey, step.id)}>
                                          {step.notes ? 'Edit Note' : 'Add Note'}
                                        </Button>
                                        <IconButton size="small" onClick={() => handleOpenStepDialog(journey, step)}>
                                          <EditIcon fontSize="small" />
                                        </IconButton>
                                        <IconButton size="small" color="error" onClick={() => handleDeleteStep(journey.id, step.id)}>
                                          <DeleteOutlineIcon fontSize="small" />
                                        </IconButton>
                                      </Stack>
                                    </Box>
                                  </Collapse>
                                </Box>
                              </Stack>
                            </Paper>
                          </Box>
                        );
                      })
                    )}
                  </Stack>
                </Box>

                {/* Footer Actions */}
                <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }}>
                  <Stack direction="row" spacing={1}>
                    {currentStep && (
                      <Button
                        variant="contained"
                        color="secondary"
                        startIcon={<CheckCircleIcon />}
                        onClick={() => handleMarkCurrentStepComplete(journey)}
                        sx={{ flex: 1 }}
                      >
                        Complete Current Step
                      </Button>
                    )}
                    <Button variant="outlined" startIcon={<AddIcon />} onClick={() => handleOpenStepDialog(journey)}>
                      Add Step
                    </Button>
                  </Stack>
                </Box>
              </Box>
            );
          })()}
      </Drawer>

      {/* Lead Detail Drawer */}
      <Drawer
        anchor="right"
        open={leadDetailDrawer.open}
        onClose={handleCloseLeadDetail}
        PaperProps={{
          sx: { width: { xs: '100%', sm: '50vw' }, p: 0 }
        }}
      >
        {leadDetailDrawer.lead &&
          (() => {
            const lead = leadDetailDrawer.lead;
            const detail = leadDetailDrawer.detail;
            const categoryColor = getCategoryColor(lead.category);
            const notes = leadNotes[lead.id] || [];
            const tags = callTags[lead.id] || [];
            const leadJourney = journeyByLeadId.get(lead.id);

            return (
              <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <Box sx={{ p: 2, bgcolor: categoryColor.bg, borderBottom: `3px solid ${categoryColor.border}` }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="h5" fontWeight={600}>
                        {lead.caller_name || 'Unknown Caller'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        <PhoneIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                        {lead.caller_number || 'No number'}
                      </Typography>
                    </Box>
                    <IconButton onClick={handleCloseLeadDetail}>
                      <CloseIcon />
                    </IconButton>
                  </Stack>
                  {/* Tags in header */}
                  {tags.length > 0 && (
                    <Stack direction="row" spacing={0.5} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
                      {tags.map((tag) => (
                        <Chip
                          key={tag.id}
                          label={tag.name}
                          size="small"
                          deleteIcon={<CloseIcon sx={{ fontSize: '14px !important' }} />}
                          onDelete={() => handleRemoveTagFromCall(lead.id, tag.id)}
                          sx={{
                            bgcolor: tag.color || '#6366f1',
                            color: 'white',
                            fontWeight: 500,
                            '& .MuiChip-deleteIcon': {
                              color: 'rgba(255,255,255,0.7)',
                              '&:hover': { color: 'white' }
                            }
                          }}
                        />
                      ))}
                    </Stack>
                  )}
                </Box>

                {/* Tabs */}
                <Tabs
                  value={leadDetailDrawer.tab}
                  onChange={(e, v) => setLeadDetailDrawer((prev) => ({ ...prev, tab: v }))}
                  sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
                >
                  <Tab label="Overview" />
                  <Tab label="Transcript" />
                </Tabs>

                {/* Tab Content */}
                <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                  {leadDetailDrawer.loading ? (
                    <Stack spacing={2}>
                      <Skeleton variant="rectangular" height={100} />
                      <Skeleton variant="rectangular" height={200} />
                    </Stack>
                  ) : leadDetailDrawer.tab === 0 ? (
                    /* Overview Tab */
                    <Stack spacing={3}>
                      {/* Actions Section */}
                      <Box>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          Actions
                        </Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          <Button variant="contained" color="primary" onClick={() => handleOpenConcernDialog(lead, leadJourney)}>
                            {leadJourney ? 'Update Journey' : 'Start Journey'}
                          </Button>
                          <Button variant="contained" color="secondary" onClick={() => handleOpenServiceDialog(lead)}>
                            Agreed to Service
                          </Button>
                        </Stack>
                      </Box>

                      {/* Classification Section */}
                      <Box>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          Classification
                        </Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          {[
                            'converted',
                            'warm',
                            'very_good',
                            'applicant',
                            'needs_attention',
                            'unanswered',
                            'not_a_fit',
                            'spam',
                            'neutral',
                            'unreviewed'
                          ].map((cat) => {
                            const catColor = getCategoryColor(cat);
                            const isSelected = (lead.category || 'unreviewed') === cat;
                            return (
                              <Chip
                                key={cat}
                                label={cat.replace(/_/g, ' ').toUpperCase()}
                                size="small"
                                onClick={() => handleUpdateCategory(lead.id, cat)}
                                sx={{
                                  bgcolor: isSelected ? catColor.bg : 'transparent',
                                  color: isSelected ? catColor.text : 'text.secondary',
                                  border: `1px solid ${isSelected ? catColor.border : 'divider'}`,
                                  fontWeight: isSelected ? 600 : 400,
                                  cursor: 'pointer',
                                  '&:hover': { bgcolor: catColor.bg, color: catColor.text }
                                }}
                              />
                            );
                          })}
                        </Stack>
                      </Box>

                      {/* Tags Section */}
                      <Box>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          Tags
                        </Typography>
                        {/* Current tags as chips */}
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                          {tags.map((tag) => (
                            <Chip
                              key={tag.id}
                              label={tag.name}
                              size="small"
                              deleteIcon={<CloseIcon sx={{ fontSize: '14px !important' }} />}
                              onDelete={() => handleRemoveTagFromCall(lead.id, tag.id)}
                              sx={{
                                bgcolor: tag.color || '#6366f1',
                                color: 'white',
                                fontWeight: 500,
                                '& .MuiChip-deleteIcon': {
                                  color: 'rgba(255,255,255,0.7)',
                                  '&:hover': { color: 'white' }
                                }
                              }}
                            />
                          ))}
                        </Stack>
                        {/* Add tag input */}
                        <Autocomplete
                          freeSolo
                          size="small"
                          options={allTags.filter((t) => !tags.some((existingTag) => existingTag.id === t.id)).map((t) => t.name)}
                          inputValue={newTagName}
                          onInputChange={(e, value, reason) => {
                            if (reason !== 'reset') {
                              setNewTagName(value);
                            }
                          }}
                          onChange={(e, value, reason) => {
                            if (value && (reason === 'selectOption' || reason === 'createOption')) {
                              // Ignore "already added" message
                              if (value === '— Already on this lead') return;
                              // Strip "+ Create " prefix if present
                              const cleanName = value.startsWith('+ Create "') && value.endsWith('"') ? value.slice(10, -1) : value;
                              handleAddTagToCall(lead.id, cleanName);
                              setNewTagName('');
                            }
                          }}
                          filterOptions={(options, { inputValue }) => {
                            const trimmedInput = inputValue.trim();
                            // If empty input, show nothing - user must type to see options
                            if (!trimmedInput) {
                              return [];
                            }
                            const lowerInput = trimmedInput.toLowerCase();
                            // Filter existing tags that match (case-insensitive)
                            const filtered = options.filter((option) => option.toLowerCase().includes(lowerInput));
                            // Check if it matches a tag already on this lead
                            const alreadyOnLead = tags.some((t) => t.name.toLowerCase() === lowerInput);
                            if (alreadyOnLead) {
                              filtered.push('— Already on this lead');
                              return filtered;
                            }
                            // Check if it matches an existing tag (that's not on this lead)
                            const exactMatch = options.some((o) => o.toLowerCase() === lowerInput);
                            if (!exactMatch) {
                              // Also check allTags in case it exists but is filtered from options
                              const existsInAllTags = allTags.some((t) => t.name.toLowerCase() === lowerInput);
                              if (!existsInAllTags) {
                                filtered.push(`+ Create "${trimmedInput}"`);
                              }
                            }
                            return filtered;
                          }}
                          renderOption={(props, option) => {
                            const isCreateOption = option.startsWith('+ Create "') && option.endsWith('"');
                            const isAlreadyAdded = option === '— Already on this lead';
                            const existingTag = allTags.find((t) => t.name === option);
                            return (
                              <Box
                                component="li"
                                {...props}
                                onClick={isAlreadyAdded ? undefined : props.onClick}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  ...(isCreateOption && { fontStyle: 'italic', color: 'primary.main' }),
                                  ...(isAlreadyAdded && {
                                    fontStyle: 'italic',
                                    color: 'text.disabled',
                                    cursor: 'default',
                                    '&:hover': { bgcolor: 'transparent' }
                                  })
                                }}
                              >
                                {!isCreateOption && !isAlreadyAdded && existingTag && (
                                  <Box
                                    sx={{
                                      width: 12,
                                      height: 12,
                                      borderRadius: '50%',
                                      bgcolor: existingTag.color || '#6366f1',
                                      flexShrink: 0
                                    }}
                                  />
                                )}
                                {option}
                              </Box>
                            );
                          }}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              placeholder={tags.length ? 'Add another tag...' : 'Add a tag...'}
                              variant="outlined"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newTagName.trim()) {
                                  e.preventDefault();
                                  // Strip "+ Create " prefix if present
                                  const cleanName =
                                    newTagName.startsWith('+ Create "') && newTagName.endsWith('"')
                                      ? newTagName.slice(10, -1)
                                      : newTagName.trim();
                                  handleAddTagToCall(lead.id, cleanName);
                                  setNewTagName('');
                                }
                              }}
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  bgcolor: 'background.paper'
                                }
                              }}
                            />
                          )}
                          sx={{ width: '100%' }}
                          selectOnFocus
                          clearOnBlur={false}
                          handleHomeEndKeys
                          noOptionsText="Type to search or create a tag"
                        />
                      </Box>

                      {/* Rating */}
                      <Box>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          Rating
                        </Typography>
                        <Stack direction="row" alignItems="center" spacing={2}>
                          <Rating
                            value={lead.rating || 0}
                            onChange={(e, newValue) => {
                              if (newValue !== null) {
                                handleScoreCall(lead.id, newValue);
                              }
                            }}
                            size="large"
                          />
                          {lead.rating > 0 && (
                            <Button size="small" onClick={() => handleClearScore(lead.id)}>
                              Clear
                            </Button>
                          )}
                        </Stack>
                      </Box>

                      {/* Summary */}
                      <Box>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          Summary
                        </Typography>
                        <Paper variant="outlined" sx={{ p: 2 }}>
                          <Typography variant="body2">{lead.classification_summary || 'No summary available.'}</Typography>
                        </Paper>
                      </Box>

                      {/* Call Details */}
                      <Box>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          Call Details
                        </Typography>
                        <Paper variant="outlined" sx={{ p: 2 }}>
                          <Grid container spacing={2}>
                            <Grid item xs={6}>
                              <Typography variant="caption" color="text.secondary">
                                Date/Time
                              </Typography>
                              <Typography variant="body2">{lead.call_time || lead.time_ago}</Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="caption" color="text.secondary">
                                Duration
                              </Typography>
                              <Typography variant="body2">{lead.duration_formatted || 'N/A'}</Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="caption" color="text.secondary">
                                Source
                              </Typography>
                              <Typography variant="body2">{lead.source || 'Unknown'}</Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="caption" color="text.secondary">
                                Region
                              </Typography>
                              <Typography variant="body2">{lead.region || 'N/A'}</Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="caption" color="text.secondary">
                                Direction
                              </Typography>
                              <Typography variant="body2">{lead.is_inbound ? 'Inbound' : 'Outbound'}</Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="caption" color="text.secondary">
                                Caller Type
                              </Typography>
                              <Typography variant="body2">
                                {lead.caller_type === 'returning_customer'
                                  ? 'Returning Customer'
                                  : lead.caller_type === 'repeat'
                                    ? `Repeat (#${lead.call_sequence})`
                                    : 'New'}
                              </Typography>
                            </Grid>
                          </Grid>
                        </Paper>
                      </Box>

                      {/* Notes */}
                      <Box>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          Notes ({notes.length})
                        </Typography>
                        <Paper variant="outlined" sx={{ p: 2 }}>
                          <Stack spacing={2}>
                            <Stack direction="row" spacing={1}>
                              <TextField
                                fullWidth
                                size="small"
                                placeholder="Add a note..."
                                value={newNoteText}
                                onChange={(e) => setNewNoteText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                              />
                              <Button variant="contained" onClick={handleAddNote} disabled={!newNoteText.trim()}>
                                Add
                              </Button>
                            </Stack>
                            {notes.length === 0 ? (
                              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                                No notes yet.
                              </Typography>
                            ) : (
                              notes.map((note) => (
                                <Box key={note.id} sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1.5 }}>
                                  <Typography variant="body2">{note.body}</Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {note.author_name} · {new Date(note.created_at).toLocaleString()}
                                  </Typography>
                                </Box>
                              ))
                            )}
                          </Stack>
                        </Paper>
                      </Box>

                      {/* Associated Journey */}
                      {(detail?.journey || leadJourney) && (
                        <Box>
                          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            Associated Journey
                          </Typography>
                          <Paper
                            variant="outlined"
                            sx={{ p: 2, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                            onClick={() => {
                              handleCloseLeadDetail();
                              handleOpenJourneyDrawer(detail?.journey || leadJourney);
                            }}
                          >
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Box>
                                <Typography variant="subtitle2">{(detail?.journey || leadJourney).client_name}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {(detail?.journey || leadJourney).service_name || 'General Journey'}
                                </Typography>
                              </Box>
                              <Chip
                                label={(detail?.journey || leadJourney).status}
                                color={(detail?.journey || leadJourney).status === 'won' ? 'success' : 'default'}
                                size="small"
                              />
                            </Stack>
                          </Paper>
                        </Box>
                      )}
                    </Stack>
                  ) : (
                    /* Transcript Tab */
                    <Stack spacing={2}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Call Transcript
                      </Typography>

                      {/* External Links */}
                      <Stack direction="row" spacing={1}>
                        {lead.transcript_url && (
                          <Button variant="outlined" href={lead.transcript_url} target="_blank" size="small">
                            View in CTM
                          </Button>
                        )}
                        {lead.recording_url && (
                          <Button variant="outlined" href={lead.recording_url} target="_blank" size="small">
                            Play Recording
                          </Button>
                        )}
                      </Stack>

                      {/* Transcript Content */}
                      {(() => {
                        // Check multiple possible sources for transcript
                        const transcriptContent =
                          lead.transcript || lead.transcription_text || lead.transcription?.text || lead.meta?.transcript || null;

                        if (transcriptContent) {
                          return (
                            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50', maxHeight: 500, overflow: 'auto' }}>
                              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                {transcriptContent}
                              </Typography>
                            </Paper>
                          );
                        }

                        // If no transcript but there's a message (form submission or voicemail)
                        if (lead.message && !lead.message.includes('Call from') && lead.message.length > 20) {
                          return (
                            <Box>
                              <Typography variant="caption" color="text.secondary" gutterBottom>
                                {lead.is_voicemail ? 'Voicemail Message' : 'Call Notes'}
                              </Typography>
                              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                  {lead.message}
                                </Typography>
                              </Paper>
                            </Box>
                          );
                        }

                        // No transcript available
                        return (
                          <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
                            <Typography variant="body2" color="text.secondary">
                              {lead.is_voicemail
                                ? 'This was a voicemail. No transcript available.'
                                : lead.duration_sec && lead.duration_sec < 10
                                  ? 'Call was too short to generate transcript.'
                                  : 'No transcript available for this call.'}
                            </Typography>
                            {lead.transcript_url && (
                              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                Try viewing in CTM for more details.
                              </Typography>
                            )}
                          </Paper>
                        );
                      })()}

                      {/* AI Summary */}
                      {lead.classification_summary && (
                        <Box sx={{ mt: 2 }}>
                          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            AI Summary
                          </Typography>
                          <Paper variant="outlined" sx={{ p: 2 }}>
                            <Typography variant="body2">{lead.classification_summary}</Typography>
                          </Paper>
                        </Box>
                      )}

                      {/* Call History in Transcript Tab */}
                      {detail?.callHistory?.length > 0 && (
                        <Box sx={{ mt: 2 }}>
                          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            Previous Calls from this Number ({detail.callHistory.length})
                          </Typography>
                          <Paper variant="outlined" sx={{ p: 0, overflow: 'hidden' }}>
                            {detail.callHistory.map((histCall, idx) => (
                              <Box
                                key={histCall.call_id}
                                sx={{
                                  p: 1.5,
                                  borderBottom: idx < detail.callHistory.length - 1 ? '1px solid' : 'none',
                                  borderColor: 'divider'
                                }}
                              >
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    <Chip label={histCall.category || 'unreviewed'} size="small" sx={{ fontSize: '0.7rem' }} />
                                    <Typography variant="caption" color="text.secondary">
                                      {histCall.duration_sec
                                        ? `${Math.floor(histCall.duration_sec / 60)}m ${histCall.duration_sec % 60}s`
                                        : 'N/A'}
                                    </Typography>
                                  </Stack>
                                  <Typography variant="caption" color="text.secondary">
                                    {new Date(histCall.started_at).toLocaleDateString()}
                                  </Typography>
                                </Stack>
                                {histCall.summary && (
                                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                    {histCall.summary}
                                  </Typography>
                                )}
                              </Box>
                            ))}
                          </Paper>
                        </Box>
                      )}
                    </Stack>
                  )}
                </Box>
              </Box>
            );
          })()}
      </Drawer>

      {/* Category Selection Menu */}
      <Menu
        anchorEl={categoryMenuAnchor}
        open={Boolean(categoryMenuAnchor)}
        onClose={() => {
          setCategoryMenuAnchor(null);
          setCategoryMenuCallId(null);
        }}
      >
        {['converted', 'warm', 'very_good', 'applicant', 'needs_attention', 'unanswered', 'not_a_fit', 'spam', 'neutral', 'unreviewed'].map(
          (cat) => {
            const catColor = getCategoryColor(cat);
            return (
              <MenuItem
                key={cat}
                onClick={() => {
                  if (categoryMenuCallId) {
                    handleUpdateCategory(categoryMenuCallId, cat);
                  }
                }}
                sx={{ gap: 1 }}
              >
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: catColor.border }} />
                {cat.replace(/_/g, ' ').toUpperCase()}
              </MenuItem>
            );
          }
        )}
      </Menu>
    </MainCard>
  );
}
