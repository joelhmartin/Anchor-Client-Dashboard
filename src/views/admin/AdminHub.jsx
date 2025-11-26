import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
import { IconTrash } from '@tabler/icons-react';

import MainCard from 'ui-component/cards/MainCard';
import useAuth from 'hooks/useAuth';
import { createClient, fetchClients, updateClient, fetchClientDetail, sendClientOnboardingEmail } from 'api/clients';
import { fetchBoards, fetchGroups, fetchPeople } from 'api/monday';
import client from 'api/client';
import { CLIENT_TYPE_PRESETS } from 'constants/clientPresets';
import { fetchClientServices, saveClientServices } from 'api/services';

const EMPTY_SERVICE_LIST = Object.freeze([]);
const EMPTY_SUBTYPE_LIST = Object.freeze([]);

const makeLocalServiceId = () => `svc-${Math.random().toString(36).slice(2, 11)}`;
const serviceNameKey = (value = '') => String(value || '').trim().toLowerCase();
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
  base_price:
    record.base_price === null || record.base_price === undefined || record.base_price === ''
      ? ''
      : String(record.base_price),
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
  const [customServiceName, setCustomServiceName] = useState('');
  const presetSubtypeAppliedRef = useRef(null);
  const fileInputRef = useRef(null);
  const [onboardingWizardOpen, setOnboardingWizardOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [sendOnboardingEmailFlag, setSendOnboardingEmailFlag] = useState(true);
  const [sendingOnboardingEmail, setSendingOnboardingEmail] = useState(false);

  const isAdmin = user?.role === 'admin';
  const isEditor = user?.role === 'editor';
  const canAccessHub = isAdmin || isEditor;

  useEffect(() => {
    if (!canAccessHub) return;
    let active = true;
    setLoading(true);
    fetchClients()
      .then((data) => {
        if (active) setClients(data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Unable to load clients');
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
      .catch((err) => setError(err.message || 'Unable to load Monday users'))
      .finally(() => setLoadingPeople(false));
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
      setCustomServiceName('');
      setClientServicesLoading(false);
      setClientServicesReady(false);
      return;
    }
    let active = true;
    setClientServicesLoading(true);
    setClientServicesReady(false);
    setCustomServiceName('');
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
    setClientServices((prev) => {
      const existingNames = new Set(prev.map((service) => serviceNameKey(service.name)));
      const additions = availablePresetServices
        .filter((name) => name)
        .filter((name) => !existingNames.has(serviceNameKey(name)))
        .map((name) => buildNewServiceDraft(formatServiceLabel(name), { isPreset: true }));
      if (!additions.length) {
        return prev;
      }
      return [...prev, ...additions];
    });
    presetSubtypeAppliedRef.current = editing.client_subtype;
  }, [clientServicesReady, editing?.client_subtype, availablePresetServices]);

  const sortedClients = useMemo(() => {
    return [...clients].sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''));
  }, [clients]);

  const activeServices = useMemo(() => clientServices.filter((service) => service.active !== false), [clientServices]);

  const isPresetChecked = (name) => activeServices.some((service) => serviceNameKey(service.name) === serviceNameKey(name));

  const handleTogglePresetService = (name) => {
    const formatted = formatServiceLabel(name);
    if (!formatted) return;
    const key = serviceNameKey(formatted);
    setClientServices((prev) => {
      const idx = prev.findIndex((service) => serviceNameKey(service.name) === key);
      if (idx >= 0) {
        const next = [...prev];
        const target = next[idx];
        const isActive = target.active !== false;
        next[idx] = { ...target, active: !isActive, name: formatted };
        return next;
      }
      return [...prev, buildNewServiceDraft(formatted, { isPreset: true })];
    });
  };

  const handleAddCustomService = () => {
    const formatted = formatServiceLabel(customServiceName);
    if (!formatted) return;
    const key = serviceNameKey(formatted);
    setClientServices((prev) => {
      const idx = prev.findIndex((service) => serviceNameKey(service.name) === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], active: true, name: formatted };
        return next;
      }
      return [...prev, buildNewServiceDraft(formatted)];
    });
    setCustomServiceName('');
  };

  const handleCustomServiceKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddCustomService();
    }
  };

  const handleServiceFieldChange = (localId, key) => (event) => {
    const value = event.target.value;
    setClientServices((prev) =>
      prev.map((service) => {
        if (service.localId !== localId) return service;
        return { ...service, [key]: value };
      })
    );
  };

  const handleServiceRemove = (localId) => {
    setClientServices((prev) =>
      prev
        .map((service) => {
          if (service.localId !== localId) return service;
          if (service.id) {
            return { ...service, active: false };
          }
          return null;
        })
        .filter(Boolean)
    );
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
      await startOnboardingFlow(res.client.id);
    } catch (err) {
      setError(err.message || 'Unable to save client');
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
      setError(err.message || 'Unable to load Monday boards');
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
      setError(err.message || 'Unable to load Monday groups');
    }
  };

  const refreshDocs = async (userId = editing?.id) => {
    if (!userId) return;
    setDocsLoading(true);
    try {
      const docsResp = await client.get(`/hub/docs/admin/${userId}`).then((res) => res.data.docs || []);
      setDocs(docsResp);
    } catch (err) {
      setError(err.message || 'Unable to load documents');
    } finally {
      setDocsLoading(false);
    }
  };

  const startEdit = (clientData) => {
    const displayName = [clientData.first_name, clientData.last_name].filter(Boolean).join(' ').trim();
    setEditing({ ...clientData, display_name: clientData.display_name || displayName });
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
        looker_url: editing.looker_url,
        monday_board_id: editing.monday_board_id,
        monday_group_id: editing.monday_group_id,
        monday_active_group_id: editing.monday_active_group_id,
        monday_completed_group_id: editing.monday_completed_group_id,
        client_identifier_value: editing.client_identifier_value,
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
      setError(err.message || 'Unable to update client');
    } finally {
      setSavingEdit(false);
    }
    return saved;
  };

  const newRolesOptions = isAdmin ? ['client', 'editor'] : ['client'];

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
    setEditing((prev) => ({ ...prev, client_type: nextType, client_subtype: '' }));
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
      setOnboardingStep(1);
    }
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
 
  const renderDetailsTab = () => (
    <Stack spacing={2} sx={{ mt: 2 }}>
      <Typography variant="subtitle1">Account</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <FormControl fullWidth>
            <InputLabel>Email</InputLabel>
            <OutlinedInput value={editing.email || ''} onChange={handleEditChange('email')} label="Email" />
          </FormControl>
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField label="Display Name" value={editing.display_name || ''} onChange={handleEditChange('display_name')} fullWidth />
        </Grid>
        <Grid item xs={12} md={6}>
          <FormControl fullWidth>
            <InputLabel>Role</InputLabel>
            <Select value={editing.role || 'client'} onChange={handleEditChange('role')} disabled={!isAdmin} label="Role">
              <MenuItem value="client">Client</MenuItem>
              <MenuItem value="editor">Editor</MenuItem>
              <MenuItem value="admin" disabled>
                Admin
              </MenuItem>
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      <Typography variant="subtitle1">Monday.com & Looker</Typography>
      <Autocomplete
        options={boards}
        getOptionLabel={(option) => option?.name || ''}
        value={boards.find((b) => String(b.id) === String(editing.monday_board_id)) || null}
        onChange={(_e, val) => {
          setEditing((prev) => ({ ...prev, monday_board_id: val?.id || '', monday_group_id: '', monday_active_group_id: '', monday_completed_group_id: '' }));
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
      <TextField label="Client Identifier Value" value={editing.client_identifier_value || ''} onChange={handleEditChange('client_identifier_value')} />
      <Autocomplete
        options={people}
        getOptionLabel={(option) => option?.name || option?.email || ''}
        value={people.find((p) => String(p.id) === String(editing.account_manager_person_id)) || null}
        onChange={(_e, val) => setEditing((prev) => ({ ...prev, account_manager_person_id: val?.id || '' }))}
        renderInput={(params) => <TextField {...params} label="Account Manager" placeholder="Select a person" />}
        loading={loadingPeople}
      />
      <Typography variant="subtitle1">Client Type & Services</Typography>
      <Grid container spacing={2}>
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
      <Stack spacing={1}>
        <Typography variant="subtitle2">Preset Services</Typography>
        {availablePresetServices.length ? (
          <FormGroup row sx={{ gap: 1, flexWrap: 'wrap' }}>
            {availablePresetServices.map((serviceName) => (
              <FormControlLabel
                key={serviceName}
                control={
                  <Checkbox
                    size="small"
                    checked={isPresetChecked(serviceName)}
                    onChange={() => handleTogglePresetService(serviceName)}
                  />
                }
                label={<Typography variant="body2">{serviceName}</Typography>}
                sx={{
                  m: 0,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  px: 1.25,
                  py: 0.5
                }}
              />
            ))}
          </FormGroup>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Select a subtype to see recommended services.
          </Typography>
        )}
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField
          label="Add custom service"
          placeholder="e.g., Campaign Management"
          value={customServiceName}
          onChange={(e) => setCustomServiceName(e.target.value)}
          onKeyDown={handleCustomServiceKeyDown}
          fullWidth
        />
        <Button
          variant="contained"
          onClick={handleAddCustomService}
          disabled={!customServiceName.trim()}
          sx={{ minWidth: { sm: 180 } }}
        >
          Add Service
        </Button>
      </Stack>
      {clientServicesLoading ? (
        <LinearProgress />
      ) : activeServices.length ? (
        <Stack spacing={1}>
          {activeServices.map((service) => {
            const isPresetService =
              service.isPreset ||
              availablePresetServices.some((name) => serviceNameKey(name) === serviceNameKey(service.name));
            return (
              <Paper key={service.localId} variant="outlined" sx={{ p: 2 }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} md={4}>
                    <Typography variant="subtitle2">{service.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {isPresetService ? 'Preset service' : 'Custom service'}
                    </Typography>
                  </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Base Price"
                    type="number"
                    value={service.base_price}
                    onChange={handleServiceFieldChange(service.localId, 'base_price')}
                    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4} sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                  <Button
                    color="error"
                    size="small"
                    startIcon={<IconTrash size={16} />}
                    onClick={() => handleServiceRemove(service.localId)}
                  >
                    Remove
                  </Button>
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    label="Description (optional)"
                    multiline
                    minRows={2}
                    value={service.description}
                    onChange={handleServiceFieldChange(service.localId, 'description')}
                    fullWidth
                  />
                </Grid>
              </Grid>
              </Paper>
            );
          })}
        </Stack>
      ) : (
        <Alert severity="info">Select or add services to configure pricing.</Alert>
      )}
      <Typography variant="caption" color="text.secondary">
        Services sync with the client&apos;s portal when you save changes above. Unchecked presets will be deactivated automatically.
      </Typography>
      <TextField
        label="AI Prompt"
        value={editing.ai_prompt || ''}
        onChange={handleEditChange('ai_prompt')}
        multiline
        minRows={4}
        helperText="Prompt used for CTM lead classification"
      />
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
      {docsLoading && <CircularProgress size={20} />} {brandData?.logos?.length ? (
        <Stack spacing={1}>
          {brandData.logos.map((logo) => (
            <Box key={logo.id} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
      <Typography variant="subtitle2">Brand Notes and Links</Typography>
      <TextField label="Brand Notes" value={brandData?.brand_notes || ''} onChange={(e) => setBrandData((p) => ({ ...(p || {}), brand_notes: e.target.value }))} multiline rows={3} />
      <TextField label="Website Admin Email" value={brandData?.website_admin_email || ''} onChange={(e) => setBrandData((p) => ({ ...(p || {}), website_admin_email: e.target.value }))} />
      <TextField label="Website URL" value={brandData?.website_url || ''} onChange={(e) => setBrandData((p) => ({ ...(p || {}), website_url: e.target.value }))} />
      <TextField label="GA/GTM Emails" value={brandData?.ga_emails || ''} onChange={(e) => setBrandData((p) => ({ ...(p || {}), ga_emails: e.target.value }))} />
      <TextField label="Meta Business Email" value={brandData?.meta_bm_email || ''} onChange={(e) => setBrandData((p) => ({ ...(p || {}), meta_bm_email: e.target.value }))} />
      <TextField label="Pricing List URL" value={brandData?.pricing_list_url || ''} onChange={(e) => setBrandData((p) => ({ ...(p || {}), pricing_list_url: e.target.value }))} />
      <TextField label="Promo Calendar URL" value={brandData?.promo_calendar_url || ''} onChange={(e) => setBrandData((p) => ({ ...(p || {}), promo_calendar_url: e.target.value }))} />
    </Stack>
  );

  const renderDocumentsTab = () => (
    <Stack spacing={2} sx={{ mt: 2 }}>
      <Typography variant="subtitle1">Upload Documents</Typography>
      <Stack spacing={2}>
        <TextField label="Document Label" value={docUpload.label} onChange={(e) => setDocUpload((p) => ({ ...p, label: e.target.value }))} />
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
          control={<Checkbox checked={docUpload.forReview} onChange={(e) => setDocUpload((p) => ({ ...p, forReview: e.target.checked }))} />}
          label='Mark as "For Review" and notify client'
        />
        <Button variant="contained" disableElevation onClick={handleDocUpload} disabled={!docUpload.files.length || uploadingDocs}>
          {uploadingDocs ? 'Uploading…' : 'Upload Document'}
        </Button>
      </Stack>

      <Divider />

      <Typography variant="subtitle1">Documents</Typography>
      {docsLoading && <CircularProgress size={20} />} {docs.length ? (
        <Stack spacing={1}>
          {docs.map((doc) => (
            <Box key={doc.id} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
      setError(err.message || 'Unable to update review status');
    }
  };

  const saveBrand = async () => {
    if (!editing || !brandData) return;
    try {
      await client.put(`/hub/brand/admin/${editing.id}`, brandData);
      setSuccess('Brand saved');
    } catch (err) {
      setError(err.message || 'Unable to save brand');
    }
  };

  return (
    <MainCard title="Client Hub">
      <Stack spacing={3}>
        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
          <Box sx={{ flex: 1, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Typography variant="h5" sx={{ mb: 2 }}>
              Add Client
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
                  <OutlinedInput id="new-name" value={newClient.name} onChange={(e) => setNewClient((p) => ({ ...p, name: e.target.value }))} label="Name" />
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

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h5">Clients</Typography>
            {loading && <CircularProgress size={20} />}
          </Box>
          <Divider />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Display Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Analytics</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Board</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedClients.map((c) => (
                    <TableRow key={c.id} hover>
                      <TableCell>{`${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email}</TableCell>
                      <TableCell>{c.email}</TableCell>
                      <TableCell>
                        {c.looker_url ? (
                          <Button size="small" href={c.looker_url} target="_blank" rel="noreferrer">
                            Open
                          </Button>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Not set
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ textTransform: 'capitalize' }}>{c.role || 'client'}</TableCell>
                      <TableCell>{c.monday_board_id || '-'}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap">
                        <Button size="small" variant="outlined" onClick={() => startEdit(c)}>
                          Edit
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          disableElevation
                          onClick={() => {
                            setActingClient(c.id);
                            navigate('/portal');
                          }}
                        >
                          Jump to View
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {!sortedClients.length && !loading && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      No clients yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Stack>

      <Drawer anchor="right" open={Boolean(editing) && !onboardingWizardOpen} onClose={() => setEditing(null)} sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', sm: 480 }, p: 2 } }}>
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
            <Stepper activeStep={onboardingStep} alternativeLabel>
              <Step>
                <StepLabel>Client Details</StepLabel>
              </Step>
              <Step>
                <StepLabel>Onboarding Email</StepLabel>
              </Step>
            </Stepper>
            {onboardingStep === 0 && editing && (
              <Card variant="outlined" sx={{ boxShadow: 'none', borderRadius: 2 }}>
                <CardContent>
                  <Stack spacing={1.5} sx={{ mb: 2 }}>
                    <Typography variant="subtitle1">Client Profile & Workflow</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Confirm the Monday board, account metadata, and any preset services before inviting the client.
                    </Typography>
                  </Stack>
                  <Box sx={{ maxHeight: { xs: '60vh', md: '55vh' }, overflowY: 'auto', pr: 1 }}>
                    {renderDetailsTab()}
                  </Box>
                </CardContent>
              </Card>
            )}
            {onboardingStep === 1 && editing && (
              <Card variant="outlined" sx={{ boxShadow: 'none', borderRadius: 2 }}>
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant="subtitle1">Send Client Onboarding Email?</Typography>
                    <Typography variant="body2" color="text.secondary">
                      We&apos;ll email <strong>{editing.email}</strong> a secure link so they can set a password,
                      confirm services, and provide brand details.
                    </Typography>
                    <FormControlLabel
                      control={
                        <Switch checked={sendOnboardingEmailFlag} onChange={(e) => setSendOnboardingEmailFlag(e.target.checked)} />
                      }
                      label="Send onboarding email immediately"
                    />
                    {!sendOnboardingEmailFlag && (
                      <Alert severity="info" sx={{ borderRadius: 1 }}>
                        You can send the onboarding email later from the client hub if you need to finish configuration
                        first.
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
              <Button onClick={() => setOnboardingStep(0)} disabled={sendingOnboardingEmail}>
                Back
              </Button>
              <Button variant="contained" onClick={handleWizardFinish} disabled={sendingOnboardingEmail}>
                {sendingOnboardingEmail ? 'Sending…' : 'Finish'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </MainCard>
  );
}
