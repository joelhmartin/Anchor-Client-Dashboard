import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
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
import { fetchCalls, scoreCall, clearCallScore } from 'api/calls';

const SECTION_CONFIG = [
  { value: 'profile', label: 'Profile' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'leads', label: 'Leads' },
  { value: 'brand', label: 'Brand Assets' },
  { value: 'documents', label: 'Documents' }
];

const fieldLabels = {
  brand_notes: 'Brand Notes',
  website_admin_email: 'Website Admin Email',
  ga_emails: 'GA / GTM Emails',
  meta_bm_email: 'Meta Business Manager Email',
  social_links: 'Social Links',
  pricing_list_url: 'Pricing List URL',
  promo_calendar_url: 'Promo Calendar URL'
};

export default function ClientPortal() {
  const { actingClientId, clearActingClient } = useAuth();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') || 'profile';
  const [activeTab, setActiveTab] = useState(tabParam);
  const [message, setMessage] = useState({ type: '', text: '' });

  const [analyticsUrl, setAnalyticsUrl] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({ display_name: '', email: '', password: '', password_confirm: '' });
  const [profileLoading, setProfileLoading] = useState(false);

  const [brand, setBrand] = useState(null);
  const [brandFields, setBrandFields] = useState({});
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
  const [requestForm, setRequestForm] = useState({ title: '', description: '', due_date: '', rush: false });
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const [calls, setCalls] = useState(null);
  const [callsLoading, setCallsLoading] = useState(false);
  const [callFilters, setCallFilters] = useState({ type: 'all', source: 'all', category: 'all' });

  const [updatesDialog, setUpdatesDialog] = useState({ open: false, task: null });

  useEffect(() => {
    setActiveTab(tabParam);
    setMessage({ type: '', text: '' });
  }, [tabParam]);

  const triggerMessage = (type, text) => setMessage({ type, text });
  const currentSection = useMemo(
    () => SECTION_CONFIG.find((section) => section.value === activeTab) || SECTION_CONFIG[0],
    [activeTab]
  );

  const ensureAnalytics = useCallback(() => {
    if (analyticsUrl !== null || analyticsLoading) return;
    setAnalyticsLoading(true);
    fetchAnalyticsUrl()
      .then((url) => setAnalyticsUrl(url))
      .catch((err) => triggerMessage('error', err.message || 'Unable to load analytics'))
      .finally(() => setAnalyticsLoading(false));
  }, [analyticsUrl, analyticsLoading]);

  const loadProfile = useCallback(() => {
    setProfileLoading(true);
    fetchProfile()
      .then((data) => {
        setProfile(data);
        setProfileForm({
          display_name: [data.first_name, data.last_name].filter(Boolean).join(' ') || data.email,
          email: data.email,
          password: '',
          password_confirm: ''
        });
      })
      .catch((err) => triggerMessage('error', err.message || 'Unable to load profile'))
      .finally(() => setProfileLoading(false));
  }, []);

  const loadBrand = useCallback(() => {
    fetchBrand()
      .then((data) => {
        setBrand(data);
        setBrandFields({
          brand_notes: data.brand_notes || '',
          website_admin_email: data.website_admin_email || '',
          ga_emails: data.ga_emails || '',
          meta_bm_email: data.meta_bm_email || '',
          social_links: typeof data.social_links === 'string' ? data.social_links : JSON.stringify(data.social_links || ''),
          pricing_list_url: data.pricing_list_url || '',
          promo_calendar_url: data.promo_calendar_url || ''
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

  const loadCalls = useCallback(() => {
    setCallsLoading(true);
    fetchCalls()
      .then((data) => setCalls(data))
      .catch((err) => triggerMessage('error', err.message || 'Unable to load calls'))
      .finally(() => setCallsLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === 'analytics') ensureAnalytics();
    if (activeTab === 'profile' && !profile && !profileLoading) loadProfile();
    if (activeTab === 'brand' && !brand) loadBrand();
    if (activeTab === 'documents' && !documents && !docsLoading) loadDocuments();
    if (activeTab === 'tasks' && !requestsData && !tasksLoading) loadRequests();
    if (activeTab === 'leads' && !calls && !callsLoading) loadCalls();
  }, [activeTab, ensureAnalytics, profile, profileLoading, loadProfile, brand, loadBrand, documents, docsLoading, loadDocuments, requestsData, tasksLoading, loadRequests, calls, callsLoading, loadCalls]);

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
        email: profileForm.email
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
        rush: requestForm.rush
      });
      triggerMessage('success', 'Request submitted');
      setRequestForm({ title: '', description: '', due_date: '', rush: false });
      loadRequests();
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to submit request');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleScoreCall = async (id, score) => {
    try {
      await scoreCall(id, score);
      triggerMessage('success', 'Call scored');
      loadCalls();
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to score call');
    }
  };

  const handleClearScore = async (id) => {
    try {
      await clearCallScore(id);
      loadCalls();
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to clear score');
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
              <Stack direction="row" spacing={1}>
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
                <Button size="small" onClick={loadRequests} sx={{ ml: 'auto' }}>
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
            <Divider />
            <Stack spacing={2}>
              <Typography variant="h5">Submit a New Request</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    label="Request Name / Title"
                    fullWidth
                    value={requestForm.title}
                    onChange={(e) => setRequestForm((prev) => ({ ...prev, title: e.target.value }))}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    label="Request Details"
                    fullWidth
                    multiline
                    minRows={4}
                    value={requestForm.description}
                    onChange={(e) => setRequestForm((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    type="date"
                    label="Desired Due Date"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={requestForm.due_date}
                    onChange={(e) => setRequestForm((prev) => ({ ...prev, due_date: e.target.value }))}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Button
                    variant={requestForm.rush ? 'contained' : 'outlined'}
                    onClick={() => setRequestForm((prev) => ({ ...prev, rush: !prev.rush }))}
                    fullWidth
                  >
                    {requestForm.rush ? 'Rush requested' : 'I need this done today'}
                  </Button>
                </Grid>
                <Grid item xs={12}>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={handleRequestSubmit}
                    disabled={submittingRequest}
                  >
                    {submittingRequest ? 'Submitting…' : 'Submit Request'}
                  </Button>
                </Grid>
              </Grid>
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
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle1" sx={{ mb: 1 }}>
                      Logo Files
                    </Typography>
                    <Stack spacing={1}>
                      <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
                        Select Logos
                        <input
                          type="file"
                          hidden
                          multiple
                          onChange={(e) => setLogoUploads(Array.from(e.target.files || []))}
                        />
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
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle1" sx={{ mb: 1 }}>
                      Style Guides
                    </Typography>
                    <Stack spacing={1}>
                      <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
                        Select Style Guides
                        <input
                          type="file"
                          hidden
                          multiple
                          onChange={(e) => setStyleUploads(Array.from(e.target.files || []))}
                        />
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
                  </Grid>
                </Grid>
                <Divider />
                <Grid container spacing={2}>
                  {Object.entries(brandFields).map(([key, value]) => (
                    <Grid key={key} item xs={12} md={6}>
                      <TextField
                        label={fieldLabels[key] || key}
                        fullWidth
                        multiline={key === 'brand_notes'}
                        minRows={key === 'brand_notes' ? 3 : 1}
                        value={value}
                        onChange={(e) => setBrandFields((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </Grid>
                  ))}
                </Grid>
                <Box>
                  <Button variant="contained" onClick={handleBrandSave} disabled={brandSaving}>
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
              <TextField
                select
                label="Category"
                value={callFilters.category}
                onChange={(e) => setCallFilters((prev) => ({ ...prev, category: e.target.value }))}
              >
                <MenuItem value="all">All</MenuItem>
                {['warm', 'very_good', 'voicemail', 'unanswered', 'negative', 'spam', 'neutral', 'unreviewed'].map((cat) => (
                  <MenuItem key={cat} value={cat}>
                    {cat.replace('_', ' ')}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            {callsLoading && <LinearProgress />}
            <Grid container spacing={2}>
              {['warm', 'very_good', 'voicemail', 'unanswered', 'negative', 'spam', 'neutral', 'unreviewed'].map((cat) => (
                <Grid item xs={6} md={3} key={cat}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle2" color="text.secondary">
                        {cat.replace('_', ' ').toUpperCase()}
                      </Typography>
                      <Typography variant="h4">{callCategories[cat] || 0}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
            <Divider />
            <Stack spacing={2}>
              {filteredCalls.map((call) => (
                <Card key={call.id} variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
                        <Chip label={(call.category || 'unreviewed').toUpperCase()} color="primary" variant="outlined" />
                        <Typography sx={{ flex: 1 }}>{call.source || 'Unknown source'}</Typography>
                        <Typography variant="body2">{call.call_time}</Typography>
                      </Stack>
                      <Typography variant="body2">
                        Caller: <strong>{call.caller_name || 'Unknown'}</strong> &nbsp;&nbsp; Number:{' '}
                        {call.caller_number || 'N/A'} &nbsp;&nbsp; Region: {call.region || 'N/A'}
                      </Typography>
                      <Typography variant="body2">{call.classification_summary || call.message || ''}</Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Button
                          variant="outlined"
                          size="small"
                          href={call.transcript_url || call.recording_url}
                          target="_blank"
                          disabled={!call.transcript_url && !call.recording_url}
                        >
                          View Transcript
                        </Button>
                        <Button variant="text" size="small" onClick={() => handleClearScore(call.id)}>
                          Clear Score
                        </Button>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <IconButton
                            key={star}
                            color={call.rating >= star ? 'primary' : 'default'}
                            onClick={() => handleScoreCall(call.id, star)}
                          >
                            ★
                          </IconButton>
                        ))}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
              {!filteredCalls.length && !callsLoading && (
                <Typography variant="body2" color="text.secondary">
                  No calls to display.
                </Typography>
              )}
            </Stack>
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
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Display Name"
                      fullWidth
                      value={profileForm.display_name}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, display_name: e.target.value }))}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Email"
                      type="email"
                      fullWidth
                      value={profileForm.email}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
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
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Confirm Password"
                      type="password"
                      fullWidth
                      value={profileForm.password_confirm}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, password_confirm: e.target.value }))}
                    />
                  </Grid>
                </Grid>
                <Button variant="contained" onClick={handleProfileSave} disabled={profileLoading}>
                  {profileLoading ? 'Saving…' : 'Save Profile'}
                </Button>
              </Stack>
            )}
          </Box>
        )}
      </Stack>

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
    </MainCard>
  );
}
