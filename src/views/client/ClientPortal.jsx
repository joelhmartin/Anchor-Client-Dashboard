import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
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
import Typography from '@mui/material/Typography';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/Save';

import MainCard from 'ui-component/cards/MainCard';
import useAuth from 'hooks/useAuth';
import { fetchAnalyticsUrl } from 'api/analytics';
import { fetchProfile, updateProfile, uploadAvatar } from 'api/profile';
import { fetchBrand, saveBrand } from 'api/brand';
import { deleteDocument, fetchDocuments, markDocumentViewed, uploadDocuments } from 'api/documents';
import { fetchTasksAndRequests, submitRequest } from 'api/requests';
import { fetchCalls, scoreCall, clearCallScore, clearAndReloadCalls } from 'api/calls';
import { fetchServices, agreeToService, fetchActiveClients, restoreActiveClient } from 'api/services';
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

const SECTION_CONFIG = [
  { value: 'profile', label: 'Profile' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'leads', label: 'Leads' },
  { value: 'journey', label: 'Client Journey' },
  { value: 'archive', label: 'Archive' },
  { value: 'brand', label: 'Brand Assets' },
  { value: 'documents', label: 'Documents' }
];

const JOURNEY_STATUS_OPTIONS = ['pending', 'in_progress', 'active_client', 'won', 'lost', 'archived'];

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

const BRAND_FIELD_ORDER = [
  'business_name',
  'business_description',
  'brand_notes',
  'website_url'
];

export default function ClientPortal() {
  const { actingClientId, clearActingClient } = useAuth();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') || 'profile';
  const [activeTab, setActiveTab] = useState(tabParam);
  const [message, setMessage] = useState({ type: '', text: '' });

  const [analyticsUrl, setAnalyticsUrl] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsFetched, setAnalyticsFetched] = useState(false);

  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({ display_name: '', email: '', password: '', password_confirm: '', monthly_revenue_goal: '' });
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
  const [callFilters, setCallFilters] = useState({ type: 'all', source: 'all', category: 'all' });
  const [clearCallsDialogOpen, setClearCallsDialogOpen] = useState(false);
  const [ratingPending, setRatingPending] = useState({});

  const [updatesDialog, setUpdatesDialog] = useState({ open: false, task: null });
  
  const [services, setServices] = useState([]);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [serviceDialogLead, setServiceDialogLead] = useState(null);
  const [selectedServices, setSelectedServices] = useState([]);
  const [journeys, setJourneys] = useState([]);
  const [journeysLoading, setJourneysLoading] = useState(false);
  const [concernDialog, setConcernDialog] = useState({ open: false, lead: null, journeyId: null, values: [] });
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
  const [noteDialog, setNoteDialog] = useState({ open: false, journeyId: null, value: '' });
  const [timelineDialog, setTimelineDialog] = useState({ open: false, journey: null });
  const [archivedJourneys, setArchivedJourneys] = useState([]);
  const [archivedClients, setArchivedClients] = useState([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveLoaded, setArchiveLoaded] = useState(false);

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
  const currentSection = useMemo(
    () => SECTION_CONFIG.find((section) => section.value === activeTab) || SECTION_CONFIG[0],
    [activeTab]
  );

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
          password: '',
          password_confirm: '',
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

  const loadDocuments = useCallback(() => {
    setDocsLoading(true);
    fetchDocuments()
      .then((docs) => setDocuments(docs))
      .catch((err) => triggerMessage('error', err.message || 'Unable to load documents'))
      .finally(() => setDocsLoading(false));
  }, []);

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

  const loadCalls = useCallback(() => {
    setCallsLoading(true);
    fetchCalls()
      .then((data) => setCalls(data))
      .catch((err) => triggerMessage('error', err.message || 'Unable to load calls'))
      .finally(() => setCallsLoading(false));
  }, []);

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

  const handleArchiveJourney = useCallback(
    async (journey) => {
      if (!journey?.id) return;
      const label = journey.client_name || journey.client_phone || journey.client_email || 'this lead';
      if (!window.confirm(`Move ${label}'s journey to the archive?`)) return;
      try {
        await archiveJourney(journey.id);
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
    },
    [activeTab, loadArchiveData, loadJourneys, triggerMessage]
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
    if (activeTab === 'journey' && !journeys.length && !journeysLoading) {
      loadJourneys();
    }
  }, [activeTab, journeys.length, journeysLoading, loadJourneys]);

  const handleProfileSave = async () => {
    if (!profileForm.display_name || !profileForm.email) {
      triggerMessage('error', 'Display name and email are required');
      return;
    }
    if (profileForm.password !== profileForm.password_confirm) {
      triggerMessage('error', 'Passwords do not match');
      return;
    }
    setProfileLoading(true);
    try {
      const payload = {
        first_name: profileForm.display_name.split(' ')[0] || profileForm.display_name,
        last_name: profileForm.display_name.split(' ').slice(1).join(' '),
        email: profileForm.email,
        monthly_revenue_goal: profileForm.monthly_revenue_goal ? parseFloat(profileForm.monthly_revenue_goal) : null
      };
      if (profileForm.password) {
        payload.password = profileForm.password;
        payload.new_password = profileForm.password;
      }
      const updated = await updateProfile(payload);
      setProfile(updated);
      triggerMessage('success', 'Profile saved');
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to save profile');
    } finally {
      setProfileLoading(false);
      setProfileForm((prev) => ({ ...prev, password: '', password_confirm: '' }));
    }
  };

  const handleAvatarUpload = async (file) => {
    if (!file) return;
    try {
      await uploadAvatar(file);
      triggerMessage('success', 'Avatar updated');
      loadProfile();
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

  const handleScoreCall = async (id, score) => {
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
    setSelectedServices((prev) =>
      prev.map((s) => (s.service_id === serviceId ? { ...s, agreed_price: parseFloat(price) || 0 } : s))
    );
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
      const index = prev.findIndex((item) => item.id === journey.id);
      if (index === -1) return [journey, ...prev];
      const clone = [...prev];
      clone[index] = journey;
      return clone;
    });
  }, []);

  const handleOpenConcernDialog = (lead, journey = null) => {
    setConcernDialog({
      open: true,
      lead: lead || null,
      journeyId: journey?.id || null,
      values: journey?.symptoms || []
    });
  };

  const handleCloseConcernDialog = () => {
    setConcernDialog({ open: false, lead: null, journeyId: null, values: [] });
  };

  const handleConcernDialogChange = (_event, values) => {
    setConcernDialog((prev) => ({ ...prev, values }));
  };

  const handleConcernDialogSave = async () => {
    const selections = Array.from(
      new Set(concernDialog.values.map((value) => String(value || '').trim()).filter(Boolean))
    );
    if (!concernDialog.lead && !concernDialog.journeyId) {
      handleCloseConcernDialog();
      return;
    }
    setConcernSaving(true);
    try {
      let journey;
      if (concernDialog.journeyId) {
        journey = await updateJourney(concernDialog.journeyId, { symptoms: selections });
      } else {
        const payload = {
          lead_call_id: concernDialog.lead?.id,
          client_name: concernDialog.lead?.caller_name || concernDialog.lead?.name || '',
          client_phone: concernDialog.lead?.caller_number || '',
          client_email: concernDialog.lead?.caller_email || '',
          symptoms: selections
        };
        journey = await createJourney(payload);
      }
      upsertJourney(journey);
      triggerMessage('success', 'Client journey updated');
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
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to update journey');
    }
  };

  const handleOpenNoteDialog = (journey) => {
    setNoteDialog({ open: true, journeyId: journey.id, value: '' });
  };

  const handleCloseNoteDialog = () => {
    setNoteDialog({ open: false, journeyId: null, value: '' });
  };

  const handleSaveJourneyNote = async () => {
    const body = noteDialog.value?.trim();
    if (!body || !noteDialog.journeyId) return;
    try {
      const journey = await addJourneyNote(noteDialog.journeyId, body);
      upsertJourney(journey);
      triggerMessage('success', 'Note added');
      handleCloseNoteDialog();
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to add note');
    }
  };

  const handleOpenTimelineDialog = (journey) => {
    setTimelineDialog({ open: true, journey });
  };

  const handleCloseTimelineDialog = () => setTimelineDialog({ open: false, journey: null });

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
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to update step');
    }
  };

  const handleDeleteStep = async (journeyId, stepId) => {
    if (!window.confirm('Remove this step from the journey?')) return;
    try {
      const journey = await deleteJourneyStep(journeyId, stepId);
      upsertJourney(journey);
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
    setTemplateDraft((prev) => [
      ...prev,
      { id: `template-${prev.length + 1}`, label: '', channel: '', message: '', offset_weeks: 0 }
    ]);
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
    const targetGroup =
      taskView === 'active' ? requestsData.group_meta.active_group_id : requestsData.group_meta.completed_group_id;
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
      const matchesSource =
        callFilters.source === 'all' || (call.source_key || 'unknown').toLowerCase() === callFilters.source;
      const matchesCategory = callFilters.category === 'all' || (call.category || 'unreviewed').toLowerCase() === callFilters.category;
      return matchesType && matchesSource && matchesCategory;
    });
  }, [calls, callFilters]);

  const journeyByLeadId = useMemo(() => {
    const map = new Map();
    journeys.forEach((journey) => {
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
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                alignItems={{ xs: 'stretch', sm: 'center' }}
              >
                <Button variant="contained" onClick={() => setRequestDialogOpen(true)}>
                  New Request
                </Button>
                <Chip
                  label="Active"
                  color={taskView === 'active' ? 'primary' : 'default'}
                  onClick={() => setTaskView('active')}
                />
                <Chip
                  label="Completed"
                  color={taskView === 'completed' ? 'primary' : 'default'}
                  onClick={() => setTaskView('completed')}
                />
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
                        {logoUploads.length > 0 && (
                          <Typography variant="caption">{logoUploads.length} new file(s) selected</Typography>
                        )}
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
                        {styleUploads.length > 0 && (
                          <Typography variant="caption">{styleUploads.length} new file(s) selected</Typography>
                        )}
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
          <Stack spacing={2}>
            <Typography variant="subtitle1">Your Documents</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
                Select Files to Upload
                <input type="file" hidden multiple onChange={(e) => setDocUploads(Array.from(e.target.files || []))} />
              </Button>
              {docUploads.length > 0 && (
                <Chip label={`${docUploads.length} file(s) selected`} onDelete={() => setDocUploads([])} />
              )}
              <Button variant="contained" onClick={handleDocUpload} disabled={!docUploads.length}>
                Upload
              </Button>
            </Stack>
            <Divider />
            <Typography variant="subtitle1">Shared Documents</Typography>
            {docsLoading && <LinearProgress />}
            <Stack spacing={1}>
              {documents?.map((doc) => (
                <Card key={doc.id} variant="outlined">
                  <CardContent>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle1">{doc.label || doc.name}</Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                          <Chip
                            label={(doc.review_status || 'none').toUpperCase()}
                            color={doc.review_status === 'pending' ? 'warning' : doc.review_status === 'viewed' ? 'success' : 'default'}
                            size="small"
                          />
                          {doc.origin === 'admin' && (
                            <Chip label="Shared" size="small" variant="outlined" color="info" sx={{ textTransform: 'capitalize' }} />
                          )}
                        </Stack>
                      </Box>
                      <Stack direction="row" spacing={1}>
                        <Button variant="outlined" href={doc.url} target="_blank" rel="noreferrer">
                          View
                        </Button>
                        {doc.origin === 'client' && (
                          <IconButton color="error" onClick={() => handleDocDelete(doc.id)}>
                            <DeleteOutlineIcon />
                          </IconButton>
                        )}
                        {doc.review_status !== 'viewed' && (
                          <Button variant="text" onClick={() => handleMarkViewed(doc.id)}>
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
                  No documents yet.
                </Typography>
              )}
            </Stack>
          </Stack>
        )}

        {activeTab === 'leads' && (
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
              <Button variant="contained" onClick={loadCalls}>
                Reload Calls
              </Button>
              <Button variant="outlined" color="error" onClick={() => setClearCallsDialogOpen(true)}>
                Clear & Reload All
              </Button>
              <TextField
                select
                label="Activity Type"
                value={callFilters.type}
                onChange={(e) => setCallFilters((prev) => ({ ...prev, type: e.target.value }))}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="call">Call</MenuItem>
                <MenuItem value="sms">SMS</MenuItem>
                <MenuItem value="form">Form</MenuItem>
              </TextField>
              <TextField
                select
                label="Source"
                value={callFilters.source}
                onChange={(e) => setCallFilters((prev) => ({ ...prev, source: e.target.value }))}
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
              {['warm', 'very_good', 'applicant', 'needs_attention', 'unanswered', 'negative', 'spam', 'neutral', 'unreviewed'].map((cat) => (
                <Button
                  key={cat}
                  variant={callFilters.category === cat ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => setCallFilters((prev) => ({ ...prev, category: prev.category === cat ? 'all' : cat }))}
                  sx={{ textTransform: 'none' }}
                >
                  {cat.replace('_', ' ').toUpperCase()} ({callCategories[cat] || 0})
                </Button>
              ))}
            </Box>
            <Divider />
            <Stack spacing={2}>
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
                  const leadJourney = journeyByLeadId.get(call.id);
                  return (
                    <Card key={call.id} variant="outlined">
                      <CardContent>
                        <Stack spacing={1}>
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Chip label={(call.category || 'unreviewed').toUpperCase()} color="primary" variant="outlined" />
                              {call.is_voicemail && (
                                <Chip label="VOICEMAIL" color="warning" variant="outlined" size="small" />
                              )}
                            </Stack>
                            <Typography sx={{ flex: 1 }}>{call.source || 'Unknown source'}</Typography>
                            <Typography variant="body2">{call.call_time}</Typography>
                          </Stack>
                          <Typography variant="body2">
                            Caller: <strong>{call.caller_name || 'Unknown'}</strong> &nbsp;&nbsp; Number:{' '}
                            {call.caller_number || 'N/A'} &nbsp;&nbsp; Region: {call.region || 'N/A'}
                          </Typography>
                          <Typography variant="body2">{call.classification_summary || call.message || ''}</Typography>
                          {leadJourney && (
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                              <Chip
                                label={`Journey · ${(leadJourney.status || 'pending').replace('_', ' ')}`}
                                size="small"
                                color={leadJourney.paused ? 'warning' : 'success'}
                              />
                              {leadJourney.symptoms?.slice(0, 3).map((concern) => (
                                <Chip key={concern} label={concern} size="small" variant="outlined" />
                              ))}
                              {leadJourney.symptoms?.length > 3 && (
                                <Chip label={`+${leadJourney.symptoms.length - 3}`} size="small" variant="outlined" />
                              )}
                              <Typography variant="caption" color="text.secondary">
                                Next action:{' '}
                                {leadJourney.next_action_at ? formatDateDisplay(leadJourney.next_action_at) : 'Not scheduled'}
                              </Typography>
                            </Stack>
                          )}
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                            <Button
                              variant="outlined"
                              size="small"
                              href={call.transcript_url || call.recording_url}
                              target="_blank"
                              disabled={!call.transcript_url && !call.recording_url}
                            >
                              View Transcript
                            </Button>
                            <Button
                              variant="text"
                              size="small"
                              onClick={() => handleOpenConcernDialog(call, leadJourney)}
                            >
                              {leadJourney ? 'Update Journey' : 'Assign Concerns'}
                            </Button>
                            <Button 
                              variant="contained" 
                              size="small" 
                              color="success"
                              onClick={() => handleOpenServiceDialog(call)}
                            >
                              Agreed to Service
                            </Button>
                            <Button variant="text" size="small" onClick={() => handleClearScore(call.id)} disabled={Boolean(ratingPending[call.id])}>
                              Clear Score
                            </Button>
                            {ratingPending[call.id] ? (
                              <Box sx={{ display: 'flex', gap: 0.5, ml: 'auto' }}>
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Skeleton key={star} variant="circular" width={28} height={28} />
                                ))}
                              </Box>
                            ) : (
                              <Box sx={{ display: 'flex', gap: 0.5, ml: 'auto' }}>
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <IconButton
                                    key={star}
                                    size="small"
                                    color={call.rating >= star ? 'primary' : 'default'}
                                    onClick={() => handleScoreCall(call.id, star)}
                                    sx={{ p: 0.5 }}
                                  >
                                    ★
                                  </IconButton>
                                ))}
                              </Box>
                            )}
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}
              {!filteredCalls.length && !callsLoading && (
                <Typography variant="body2" color="text.secondary">
                  No calls to display.
                </Typography>
              )}
            </Stack>
          </Stack>
        )}

        {activeTab === 'journey' && (
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <Button variant="contained" onClick={loadJourneys} disabled={journeysLoading}>
                Refresh Journeys
              </Button>
              <Button variant="outlined" onClick={handleOpenTemplateDialog}>
                Edit Follow-Up Template
              </Button>
            </Stack>
            {journeysLoading && <LinearProgress />}
            {!journeysLoading && !journeys.length && (
              <Alert severity="info">Assign concerns to a lead from the Leads tab to begin a client journey.</Alert>
            )}
            {journeys.map((journey) => {
              const steps = journey.steps || [];
              const completedSteps = steps.filter((step) => step.completed_at);
              const currentStep = getJourneyCurrentStep(journey);
              const nextActionDate = journey.next_action_at
                ? formatDateDisplay(journey.next_action_at)
                : currentStep?.due_at
                ? formatDateDisplay(currentStep.due_at)
                : 'Not scheduled';

              return (
                <Card key={journey.id} variant="outlined">
                  <CardContent>
                    <Stack spacing={2}>
                      <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        spacing={1}
                        alignItems={{ xs: 'flex-start', md: 'center' }}
                      >
                        <Typography variant="h6">
                          {journey.client_name || journey.client_phone || journey.client_email || 'Unnamed Lead'}
                        </Typography>
                      {journey.paused && (
                        <Chip label="Paused" color="warning" size="small" />
                      )}
                        <Stack direction="row" spacing={1} sx={{ ml: { md: 'auto' } }}>
                          <Button size="small" onClick={() => handleOpenConcernDialog(null, journey)}>
                            Edit Concerns
                          </Button>
                          <Button
                            size="small"
                            onClick={() => handleJourneyStatusChange(journey.id, { paused: !journey.paused })}
                          >
                            {journey.paused ? 'Resume Journey' : 'Pause Journey'}
                          </Button>
                          <Button size="small" onClick={() => handleOpenTimelineDialog(journey)}>
                            View Client Journey
                          </Button>
                        </Stack>
                      </Stack>
                      {(journey.client_phone || journey.client_email) && (
                        <Typography variant="body2" color="text.secondary">
                          {[journey.client_phone, journey.client_email].filter(Boolean).join(' · ')}
                        </Typography>
                      )}
            {journey.symptoms?.length > 0 && (
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {journey.symptoms.map((concern) => (
                  <Chip key={`${journey.id}-${concern}`} label={concern} size="small" variant="outlined" />
                ))}
              </Stack>
            )}
            {journey.symptoms_redacted && (
              <Typography variant="caption" color="text.secondary">
                Concerns redacted after 90 days.
              </Typography>
            )}
                      <Box
                        sx={{
                          border: '1px dashed',
                          borderColor: 'divider',
                          borderRadius: 2,
                          p: 2,
                          bgcolor: currentStep ? 'background.paper' : 'grey.50'
                        }}
                      >
                        <Typography variant="subtitle2" gutterBottom>
                          {currentStep ? 'Current Follow-Up Step' : 'No Steps Defined'}
                        </Typography>
                        {currentStep ? (
                          <Stack spacing={0.5}>
                            <Typography variant="body1">{currentStep.label}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              Channel: {currentStep.channel || 'Not specified'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Due: {currentStep.due_at ? formatDateDisplay(currentStep.due_at) : 'No due date'}
                            </Typography>
                            {currentStep.message && (
                              <Typography variant="body2" color="text.secondary">
                                Instructions: {currentStep.message}
                              </Typography>
                            )}
                          </Stack>
                        ) : (
                          <Stack spacing={1}>
                            <Typography variant="body2" color="text.secondary">
                              No steps yet. Apply your follow-up template to generate the outreach plan.
                            </Typography>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => handleApplyTemplateToJourney(journey.id)}
                            >
                              Apply Follow-Up Template
                            </Button>
                          </Stack>
                        )}
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                          Next contact: {nextActionDate} · Completed {completedSteps.length}/{steps.length} steps
                        </Typography>
                      </Box>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <Button
                          variant="contained"
                          color="success"
                          disabled={!currentStep}
                          onClick={() => handleMarkCurrentStepComplete(journey)}
                        >
                          Mark Step Complete
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={() => handleJourneyAgreedToService(journey)}
                          disabled={!journey.lead_call_key && !journey.lead_call_id}
                        >
                          Agreed to Service
                        </Button>
                        <Button variant="outlined" onClick={() => handleOpenStepDialog(journey)}>
                          Add Step
                        </Button>
                        <Button variant="outlined" onClick={() => handleOpenNoteDialog(journey)}>
                          Add Note
                        </Button>
                        <Button variant="outlined" color="error" onClick={() => handleArchiveJourney(journey)}>
                          Archive Journey
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        )}
        {activeTab === 'archive' && (
          <Stack spacing={3}>
            {archiveLoading && <LinearProgress />}
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6">Archived Journeys</Typography>
                    <Button variant="text" size="small" onClick={loadArchiveData} disabled={archiveLoading}>
                      Refresh
                    </Button>
                  </Stack>
                  {archivedJourneys.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No archived journeys.
                    </Typography>
                  ) : (
                    archivedJourneys.map((journey) => (
                      <Box
                        key={journey.id}
                        sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}
                      >
                        <Stack
                          direction={{ xs: 'column', sm: 'row' }}
                          spacing={1}
                          justifyContent="space-between"
                          alignItems={{ xs: 'flex-start', sm: 'center' }}
                        >
                          <Box>
                            <Typography variant="subtitle1">
                              {journey.client_name || journey.client_phone || journey.client_email || 'Unnamed Lead'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Archived {journey.archived_at ? formatDateDisplay(journey.archived_at) : 'unknown'}
                            </Typography>
                          </Box>
                          <Stack direction="row" spacing={1}>
                            <Button size="small" onClick={() => handleRestoreJourney(journey)}>
                              Restore
                            </Button>
                          </Stack>
                        </Stack>
                        {journey.symptoms?.length > 0 && (
                          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                            {journey.symptoms.map((concern) => (
                              <Chip key={`${journey.id}-archived-${concern}`} label={concern} size="small" variant="outlined" />
                            ))}
                          </Stack>
                        )}
                        {journey.status && (
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            Status before archive: {journey.status.replace('_', ' ')}
                          </Typography>
                        )}
                      </Box>
                    ))
                  )}
                </Stack>
              </CardContent>
            </Card>
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="h6">Archived Active Clients</Typography>
                  {archivedClients.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No archived clients.
                    </Typography>
                  ) : (
                    archivedClients.map((client) => (
                      <Box
                        key={client.id}
                        sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}
                      >
                        <Stack
                          direction={{ xs: 'column', sm: 'row' }}
                          spacing={1}
                          justifyContent="space-between"
                          alignItems={{ xs: 'flex-start', sm: 'center' }}
                        >
                          <Box>
                            <Typography variant="subtitle1">{client.client_name || 'Unknown Client'}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              Archived {client.archived_at ? formatDateDisplay(client.archived_at) : 'unknown'}
                            </Typography>
                            {[client.client_phone, client.client_email]
                              .filter(Boolean)
                              .map((value) => (
                                <Typography key={value} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                  {value}
                                </Typography>
                              ))}
                          </Box>
                          <Stack direction="row" spacing={1}>
                            <Button size="small" onClick={() => handleRestoreClient(client)}>
                              Restore
                            </Button>
                          </Stack>
                        </Stack>
                        {client.services?.length > 0 && (
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 1 }}>
                            {client.services
                              .filter((s) => !s.redacted_at)
                              .slice(0, 4)
                              .map((service) => (
                                <Chip key={`${client.id}-${service.id}`} label={service.service_name} size="small" />
                              ))}
                          </Stack>
                        )}
                      </Box>
                    ))
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
                    <input
                      type="file"
                      hidden
                      accept="image/*"
                      onChange={(e) => handleAvatarUpload(e.target.files?.[0])}
                    />
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
                    label="New Password"
                    type="password"
                    fullWidth
                    value={profileForm.password}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, password: e.target.value }))}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">Optional</InputAdornment>
                    }}
                  />
                  <TextField
                    label="Confirm Password"
                    type="password"
                    fullWidth
                    value={profileForm.password_confirm}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, password_confirm: e.target.value }))}
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
                <input
                  type="file"
                  hidden
                  onChange={(e) => setRequestAttachment(e.target.files?.[0] || null)}
                />
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
            <Button
              variant={requestForm.rush ? 'contained' : 'outlined'}
              onClick={handleRushToggle}
              fullWidth
            >
              {requestForm.rush ? 'Rush requested' : 'I need this done today'}
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRequestDialog}>Cancel</Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleRequestSubmit}
            disabled={submittingRequest}
          >
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
        <DialogTitle>
          Agree to Service - {serviceDialogLead?.caller_name || serviceDialogLead?.caller_number || 'Lead'}
        </DialogTitle>
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
              <Alert severity="warning">
                No services configured. Please add services in the Services page first.
              </Alert>
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
                        <Checkbox
                          checked={isSelected}
                          onChange={() => handleToggleService(service.id)}
                        />
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
          <Button
            variant="contained"
            onClick={handleAgreeToService}
            disabled={selectedServices.length === 0}
          >
            Confirm Agreement ({selectedServices.length} service{selectedServices.length !== 1 ? 's' : ''})
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={concernDialog.open} onClose={handleCloseConcernDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{concernDialog.journeyId ? 'Update Journey Concerns' : 'Assign Concerns to Lead'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Select the concerns this lead mentioned to start or update their Client Journey.
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
                  label="Concerns"
                  placeholder="Select or type a custom concern"
                  helperText="Select from suggestions or type a custom concern and press Enter"
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
            <TextField
              label="Step Label"
              value={stepDialog.form.label}
              onChange={handleStepFieldChange('label')}
              fullWidth
            />
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
        <DialogTitle>Add Journey Note</DialogTitle>
        <DialogContent>
          <TextField
            multiline
            minRows={4}
            fullWidth
            value={noteDialog.value}
            onChange={(e) => setNoteDialog((prev) => ({ ...prev, value: e.target.value }))}
            placeholder="Record what happened during this outreach."
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseNoteDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveJourneyNote} disabled={!noteDialog.value?.trim()}>
            Save Note
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={timelineDialog.open} onClose={handleCloseTimelineDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          Journey Timeline{timelineDialog.journey ? ` · ${timelineDialog.journey.client_name || 'Lead'}` : ''}
        </DialogTitle>
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
                          {step.channel || 'No channel listed'} ·{' '}
                          {step.due_at ? formatDateDisplay(step.due_at) : 'No due date'}
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
                      <Button
                        size="small"
                        color="error"
                        onClick={() => handleRemoveTemplateStep(index)}
                      >
                        Remove
                      </Button>
                    </Stack>
                    <TextField
                      label="Label"
                      value={step.label}
                      onChange={handleTemplateFieldChange(index, 'label')}
                      fullWidth
                    />
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
    </MainCard>
  );
}
