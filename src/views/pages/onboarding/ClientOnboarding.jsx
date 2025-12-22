import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Container,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  Link,
  List,
  ListItem,
  ListItemText,
  OutlinedInput,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography
} from '@mui/material';
import { IconPlus, IconTrash, IconUser } from '@tabler/icons-react';

import { fetchOnboarding, submitOnboarding, uploadOnboardingAvatar, uploadOnboardingBrandAsset } from 'api/onboarding';
import { login } from 'api/auth';
import { findClientTypePreset } from 'constants/clientPresets';
import { strengthColor, strengthIndicator } from 'utils/password-strength';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

const emptyService = () => ({ name: '', description: '', base_price: 0, active: true, isDefault: false });
const STEP_CONFIG = [
  { key: 'profile', label: 'Profile & Credentials', description: 'Confirm account basics and set a password.' },
  { key: 'brand', label: 'Brand Assets', description: 'Upload logos/style guides and share brand basics.' },
  { key: 'services', label: 'Services & Pricing', description: 'Review offerings before completing onboarding.' },
  { key: 'website_access', label: 'Website Access', description: 'Confirm access to your website platform/hosting/DNS.' },
  { key: 'ga4', label: 'Google Analytics (GA4)', description: 'Confirm Analytics access so we can configure tracking and reporting.' },
  { key: 'google_ads', label: 'Google Ads', description: 'Confirm Google Ads access so we can manage campaigns and conversions.' },
  { key: 'meta', label: 'Facebook Business Manager', description: 'Confirm Meta access so we can manage ads, pixels, and page connections.' },
  {
    key: 'forms',
    label: 'Website Forms & Integrations',
    description: 'Tell us how your website forms are set up so we can ensure tracking and compliance.'
  }
];

const getDefaultServices = (profile) => {
  if (!profile?.client_type) return [];
  const preset = findClientTypePreset(profile.client_type);
  if (!preset) return [];
  const subtype = preset.subtypes?.find((item) => item.value === profile.client_subtype);
  return subtype?.services || [];
};

export default function ClientOnboardingPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState({
    display_name: '',
    monthly_revenue_goal: '',
    client_identifier_value: '',
    password: '',
    password_confirm: '',
    brand: {},
    avatar_url: ''
  });
  const [serviceList, setServiceList] = useState([]);
  const [successMessage, setSuccessMessage] = useState('');
  const [defaultOptions, setDefaultOptions] = useState([]);
  const [access, setAccess] = useState({
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
  const [customServiceName, setCustomServiceName] = useState('');

  const isLastStep = activeStep === STEP_CONFIG.length - 1;
  const currentStep = STEP_CONFIG[activeStep];
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [strength, setStrength] = useState(0);
  const [level, setLevel] = useState();

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError('');
    setStrength(strengthIndicator(''));
    setLevel(strengthColor(strengthIndicator('')));
    fetchOnboarding(token)
      .then((payload) => {
        setData(payload);
        const defaultServiceNames = getDefaultServices(payload.profile);
        setDefaultOptions(defaultServiceNames);
        const defaultNameSet = new Set(defaultServiceNames.map((name) => name.toLowerCase()));
        const initialName =
          [payload.user.first_name, payload.user.last_name].filter(Boolean).join(' ').trim() || payload.user.email;
        const presetBrand = {
          business_name: payload.brand?.business_name || '',
          business_description: payload.brand?.business_description || '',
          brand_notes: payload.brand?.brand_notes || '',
          website_url: payload.brand?.website_url || '',
          website_url: payload.brand?.website_url || ''
        };
        setForm((prev) => ({
          ...prev,
          display_name: initialName,
          monthly_revenue_goal: payload.profile?.monthly_revenue_goal || '',
          client_identifier_value: payload.profile?.client_identifier_value || '',
          brand: presetBrand,
          avatar_url: payload.user?.avatar_url || ''
        }));
        setAccess((prev) => ({
          ...prev,
          website_access_provided: payload.profile?.website_access_provided || false,
          website_access_understood: payload.profile?.website_access_understood || false,
          ga4_access_provided: payload.profile?.ga4_access_provided || false,
          ga4_access_understood: payload.profile?.ga4_access_understood || false,
          google_ads_access_provided: payload.profile?.google_ads_access_provided || false,
          google_ads_access_understood: payload.profile?.google_ads_access_understood || false,
          meta_access_provided: payload.profile?.meta_access_provided || false,
          meta_access_understood: payload.profile?.meta_access_understood || false,
          website_forms_details_provided: payload.profile?.website_forms_details_provided || false,
          website_forms_details_understood: payload.profile?.website_forms_details_understood || false,
          website_forms_uses_third_party: payload.profile?.website_forms_uses_third_party || false,
          website_forms_uses_hipaa: payload.profile?.website_forms_uses_hipaa || false,
          website_forms_connected_crm: payload.profile?.website_forms_connected_crm || false,
          website_forms_custom: payload.profile?.website_forms_custom || false,
          website_forms_notes: payload.profile?.website_forms_notes || ''
        }));
        const initialServices = (payload.services && payload.services.length ? payload.services : []).map((s) => ({
          id: s.id,
          name: s.name || '',
          description: s.description || '',
          base_price: s.base_price || 0,
          active: s.active !== false,
          isDefault: defaultNameSet.has((s.name || '').toLowerCase())
        }));
        setServiceList(initialServices);
      })
      .catch((err) => setError(err.message || 'Unable to load onboarding details'))
      .finally(() => setLoading(false));
  }, [token]);

  const allServicesValid = useMemo(
    () => serviceList.every((service) => !service.name || service.name.trim().length > 0),
    [serviceList]
  );

  const addServiceByName = useCallback((name, options = {}) => {
    const clean = String(name || '').trim();
    if (!clean) return;
    setServiceList((prev) => {
      if (prev.some((service) => (service.name || '').toLowerCase() === clean.toLowerCase())) {
        return prev;
      }
      return [
        ...prev,
        {
          ...emptyService(),
          name: clean,
          isDefault: options.isDefault || false
        }
      ];
    });
  }, []);

  const removeServiceByName = useCallback((name) => {
    const target = String(name || '').toLowerCase();
    setServiceList((prev) => prev.filter((service) => (service.name || '').toLowerCase() !== target));
  }, []);

  const handleServiceChange = (index, key, value) => {
    setServiceList((prev) =>
      prev.map((service, idx) => {
        if (idx !== index) return service;
        if (key === 'name' && service.isDefault) {
          return service;
        }
        if (key === 'base_price') {
          return { ...service, base_price: value };
        }
        return { ...service, [key]: value };
      })
    );
  };

  const changePassword = (value) => {
    const temp = strengthIndicator(value);
    setStrength(temp);
    setLevel(strengthColor(temp));
    setForm((prev) => ({ ...prev, password: value }));
  };

  const handleRemoveService = (index) => {
    setServiceList((prev) => prev.filter((_, idx) => idx !== index));
  };

  const isDefaultChecked = useCallback(
    (name) => serviceList.some((service) => (service.name || '').toLowerCase() === String(name || '').toLowerCase()),
    [serviceList]
  );

  const handleToggleDefaultService = (name) => {
    const clean = String(name || '').trim();
    if (!clean) return;
    if (isDefaultChecked(clean)) {
      removeServiceByName(clean);
    } else {
      addServiceByName(clean, { isDefault: true });
    }
  };

  const handleCustomServiceAdd = () => {
    const clean = customServiceName.trim();
    if (!clean) return;
    addServiceByName(clean);
    setCustomServiceName('');
  };

  const handleCustomServiceKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleCustomServiceAdd();
    }
  };

  const handleTogglePassword = () => setShowPassword((prev) => !prev);
  const handleToggleConfirmPassword = () => setShowConfirmPassword((prev) => !prev);
  const handleMouseDownPassword = (event) => event.preventDefault();

  const validateStep = (stepIndex = activeStep) => {
    const key = STEP_CONFIG[stepIndex]?.key;
    if (key === 'profile') {
      if (!form.display_name.trim()) {
        setError('Display name is required');
        return false;
      }
      if (!form.password || form.password.length < 8) {
        setError('Please choose a password with at least 8 characters');
        return false;
      }
      if (form.password !== form.password_confirm) {
        setError('Passwords do not match');
        return false;
      }
    }
    if (key === 'services') {
      const hasNamedService = serviceList.some((service) => service.name?.trim());
      if (!hasNamedService) {
        setError('Please add at least one service');
        return false;
      }
      if (!allServicesValid) {
        setError('Every service must include a name');
        return false;
      }
    }
    if (key === 'website_access') {
      if (!access.website_access_provided && !access.website_access_understood) {
        setError('Please confirm website access (provided or understood).');
        return false;
      }
    }
    if (key === 'ga4') {
      if (!access.ga4_access_provided && !access.ga4_access_understood) {
        setError('Please confirm Google Analytics access (provided or understood).');
        return false;
      }
    }
    if (key === 'google_ads') {
      if (!access.google_ads_access_provided && !access.google_ads_access_understood) {
        setError('Please confirm Google Ads access (provided or understood).');
        return false;
      }
    }
    if (key === 'meta') {
      if (!access.meta_access_provided && !access.meta_access_understood) {
        setError('Please confirm Facebook Business Manager access (provided or understood).');
        return false;
      }
    }
    if (key === 'forms') {
      if (!access.website_forms_details_provided && !access.website_forms_details_understood) {
        setError('Please confirm forms/integrations details (provided or understood).');
        return false;
      }
      if (access.website_forms_details_provided && !String(access.website_forms_notes || '').trim()) {
        setError('Please add a short note about your website forms/integrations.');
        return false;
      }
    }
    setError('');
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setActiveStep((prev) => Math.min(prev + 1, STEP_CONFIG.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setError('');
    setActiveStep((prev) => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    if (!data?.user?.email) return;
    setError('');
    setSuccessMessage('');
    setSubmitting(true);
    try {
      const sanitizedServices = serviceList
        .filter((service) => service.name?.trim())
        .map((service) => ({
          name: service.name.trim(),
          description: service.description || '',
          base_price: service.base_price ? parseFloat(service.base_price) || 0 : 0,
          active: service.active !== false
        }));
      await submitOnboarding(token, {
        display_name: form.display_name.trim(),
        password: form.password,
        monthly_revenue_goal: form.monthly_revenue_goal,
        client_identifier_value: form.client_identifier_value,
        brand: form.brand,
        services: sanitizedServices,
        ...access
      });
      setSuccessMessage('Information saved! Setting up your account...');
      await login({ email: data.user.email, password: form.password });
      navigate('/portal');
    } catch (err) {
      setError(err.message || 'Unable to save onboarding information');
    } finally {
      setSubmitting(false);
    }
  };

  const renderProfileStep = () => (
    <Stack spacing={2}>
      <Typography variant="h6">Profile Details</Typography>
      <Typography variant="body2" color="text.secondary">
        Confirm the name we should use in-app, your client identifier, and the password you&apos;ll use to log in.
      </Typography>
      <Stack spacing={2}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar
            src={form.avatar_url || ''}
            alt="Avatar"
            sx={{ width: 96, height: 96, bgcolor: 'grey.200', color: 'grey.600' }}
          >
            {!form.avatar_url && <IconUser size={36} />}
          </Avatar>
          <Button variant="outlined" component="label">
            Upload Avatar
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const res = await uploadOnboardingAvatar(token, file);
                  setForm((prev) => ({ ...prev, avatar_url: res.data?.avatar_url || prev.avatar_url }));
                } catch (err) {
                  setError(err.message || 'Unable to upload avatar');
                }
              }}
            />
          </Button>
        </Stack>
          <TextField
            label="Display Name"
            fullWidth
            value={form.display_name}
            onChange={(e) => setForm((prev) => ({ ...prev, display_name: e.target.value }))}
          />
          <TextField label="Email" fullWidth value={data.user.email} InputProps={{ readOnly: true }} />
          <TextField
            label="Client Identifier"
            fullWidth
            value={form.client_identifier_value}
            onChange={(e) => setForm((prev) => ({ ...prev, client_identifier_value: e.target.value }))}
          />
          <TextField
            label="Monthly Revenue Goal"
            type="number"
            fullWidth
            value={form.monthly_revenue_goal}
            onChange={(e) => setForm((prev) => ({ ...prev, monthly_revenue_goal: e.target.value }))}
          />
          <FormControl fullWidth variant="outlined">
            <InputLabel htmlFor="client-onboarding-password">Password</InputLabel>
            <OutlinedInput
              id="client-onboarding-password"
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => changePassword(e.target.value)}
              endAdornment={
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle password visibility"
                    onClick={handleTogglePassword}
                    onMouseDown={handleMouseDownPassword}
                    edge="end"
                    size="large"
                  >
                    {showPassword ? <Visibility /> : <VisibilityOff />}
                  </IconButton>
                </InputAdornment>
              }
              label="Password"
            />
          </FormControl>
          {strength !== 0 && (
            <Box sx={{ mt: 1 }}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 90, height: 8, borderRadius: '7px', bgcolor: level?.color }} />
                <Typography variant="caption" color="text.secondary">
                  {level?.label}
                </Typography>
              </Stack>
            </Box>
          )}
          <FormControl fullWidth variant="outlined">
            <InputLabel htmlFor="client-onboarding-password-confirm">Confirm Password</InputLabel>
            <OutlinedInput
              id="client-onboarding-password-confirm"
              type={showConfirmPassword ? 'text' : 'password'}
              value={form.password_confirm}
              onChange={(e) => setForm((prev) => ({ ...prev, password_confirm: e.target.value }))}
              endAdornment={
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle confirm password visibility"
                    onClick={handleToggleConfirmPassword}
                    onMouseDown={handleMouseDownPassword}
                    edge="end"
                    size="large"
                  >
                    {showConfirmPassword ? <Visibility /> : <VisibilityOff />}
                  </IconButton>
                </InputAdornment>
              }
              label="Confirm Password"
            />
          </FormControl>
      </Stack>
    </Stack>
  );

  const renderBrandStep = () => (
    <Stack spacing={2}>
      <Typography variant="h6">Brand Assets</Typography>
      <Typography variant="body2" color="text.secondary">
        Upload logo/style guide files and share your business basics so we can build consistent creative and tracking.
      </Typography>
      <Stack spacing={2}>
          <TextField
            label="Business Name"
            fullWidth
            value={form.brand.business_name || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, brand: { ...prev.brand, business_name: e.target.value } }))}
          />
          <TextField
          label="Business Description"
          fullWidth
          multiline
          minRows={3}
          value={form.brand.business_description || ''}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, brand: { ...prev.brand, business_description: e.target.value } }))
          }
        />
        <TextField
          label="Website URL"
            fullWidth
            value={form.brand.website_url || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, brand: { ...prev.brand, website_url: e.target.value } }))}
          />
          <TextField
            label="Brand Notes"
            multiline
          minRows={3}
            fullWidth
            value={form.brand.brand_notes || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, brand: { ...prev.brand, brand_notes: e.target.value } }))}
          />
        <Stack spacing={1}>
          <Typography variant="subtitle2">Brand Assets (logos, files)</Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            {Array.isArray(data?.brand?.logos) &&
              data.brand.logos.map((logo) => (
                <Button key={logo.id} href={logo.url} target="_blank" rel="noreferrer" size="small" variant="outlined">
                  {logo.name || 'Logo'}
                </Button>
              ))}
          </Stack>
          <Button variant="outlined" component="label">
            Upload Logo / Style Guide
            <input
              type="file"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const res = await uploadOnboardingBrandAsset(token, file);
                  setData((prev) => ({
                    ...prev,
                    brand: { ...(prev?.brand || {}), logos: res.data?.logos || prev?.brand?.logos || [] }
                  }));
                } catch (err) {
                  setError(err.message || 'Unable to upload brand asset');
                }
              }}
            />
          </Button>
      <Typography variant="caption" color="text.secondary">
            You can upload logos and style guides here. If you need to share additional assets, upload them as well.
      </Typography>
        </Stack>
      </Stack>
    </Stack>
  );

  const renderServicesStep = () => (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6">Services & Pricing</Typography>
        <Typography variant="body2" color="text.secondary">
          Pick the services that apply to your engagement, then set the pricing for each.
        </Typography>
      </Box>

      {defaultOptions.length ? (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Recommended Services
          </Typography>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {defaultOptions.map((option) => (
              <FormControlLabel
                key={option}
                control={
                  <Checkbox
                    checked={isDefaultChecked(option)}
                    onChange={() => handleToggleDefaultService(option)}
                    color="primary"
                  />
                }
                label={option}
              />
            ))}
          </Stack>
        </Paper>
      ) : (
        <Alert severity="info">No preset services configured yet. Add your own below.</Alert>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField
          fullWidth
          label="Add another service"
          placeholder="e.g., Campaign Management"
          value={customServiceName}
          onChange={(e) => setCustomServiceName(e.target.value)}
          onKeyDown={handleCustomServiceKeyDown}
        />
        <Button
          variant="contained"
          startIcon={<IconPlus />}
          onClick={handleCustomServiceAdd}
          disabled={!customServiceName.trim()}
          sx={{ minWidth: { xs: '100%', sm: 160 } }}
        >
          Add Service
        </Button>
      </Stack>

      {!serviceList.length ? (
        <Alert severity="info">Select or add at least one service to configure pricing.</Alert>
      ) : (
        serviceList.map((service, index) => (
          <Paper key={service.id || `${service.name}-${index}`} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  label="Service Name"
                  fullWidth
                  value={service.name}
                  onChange={(e) => handleServiceChange(index, 'name', e.target.value)}
                  InputProps={{ readOnly: service.isDefault }}
                  helperText={service.isDefault ? 'Default service from your preset' : ''}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Base Price"
                  type="number"
                  fullWidth
                  value={service.base_price}
                  onChange={(e) => handleServiceChange(index, 'base_price', e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                />
              </Grid>
              <Grid item xs={12} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <IconButton color="error" onClick={() => handleRemoveService(index)}>
                  <IconTrash size={18} />
                </IconButton>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Description (optional)"
                  fullWidth
                  multiline
                  minRows={2}
                  value={service.description}
                  onChange={(e) => handleServiceChange(index, 'description', e.target.value)}
                />
              </Grid>
            </Grid>
          </Paper>
        ))
      )}
    </Stack>
  );

  const renderWebsiteAccessStep = () => (
    <Stack spacing={2}>
      <Typography variant="h6">Website Access</Typography>
      <Typography variant="body2" color="text.secondary">
        We need administrative or developer-level access to your website platform so we can manage updates, tracking,
        integrations, performance optimization, and ongoing support.
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle2">This may include</Typography>
        <List dense>
          {['WordPress admin access (preferred)', 'Hosting provider access (Kinsta, WP Engine, etc.)', 'DNS access (if required)', 'FTP or SFTP access (if applicable)'].map(
            (t) => (
              <ListItem key={t} sx={{ pl: 0 }}>
                <ListItemText primary={t} />
              </ListItem>
            )
          )}
        </List>
        <Typography variant="subtitle2" sx={{ mt: 1 }}>
          How to grant access
        </Typography>
        <Stack spacing={0.5}>
          <Link href="https://wordpress.org/support/article/roles-and-capabilities/" target="_blank" rel="noreferrer">
            WordPress roles & capabilities
          </Link>
          <Link href="https://kinsta.com/help/add-user/" target="_blank" rel="noreferrer">
            Kinsta: add a new company user
          </Link>
        </Stack>
      </Paper>
      <Stack>
        <FormControlLabel
          control={
            <Checkbox
              checked={access.website_access_provided}
              onChange={(e) => setAccess((p) => ({ ...p, website_access_provided: e.target.checked }))}
            />
          }
          label="I have provided website access"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={access.website_access_understood}
              onChange={(e) => setAccess((p) => ({ ...p, website_access_understood: e.target.checked }))}
            />
          }
          label="I understand that I need to provide website access to Anchor Corps as soon as possible to ensure a smooth onboarding"
        />
      </Stack>
    </Stack>
  );

  const renderGa4Step = () => (
    <Stack spacing={2}>
      <Typography variant="h6">Google Analytics (GA4)</Typography>
      <Typography variant="body2" color="text.secondary">
        We need Admin or Editor access to your Google Analytics property so we can configure tracking, conversions, events, integrations, and reporting.
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle2">How to grant access</Typography>
        <Link href="https://support.google.com/analytics/answer/1009702" target="_blank" rel="noreferrer">
          Google Analytics access instructions
                  </Link>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Please add: jmartin@anchorcorps.com, zcundiff@anchorcorps.com, mshover@anchorcorps.com (Admin or Editor)
        </Typography>
      </Paper>
      <Stack>
        <FormControlLabel
          control={<Checkbox checked={access.ga4_access_provided} onChange={(e) => setAccess((p) => ({ ...p, ga4_access_provided: e.target.checked }))} />}
          label="I have provided Google Analytics access"
        />
        <FormControlLabel
          control={<Checkbox checked={access.ga4_access_understood} onChange={(e) => setAccess((p) => ({ ...p, ga4_access_understood: e.target.checked }))} />}
          label="I understand that I need to provide Google Analytics access to Anchor Corps as soon as possible to ensure a smooth onboarding"
        />
      </Stack>
    </Stack>
  );

  const renderGoogleAdsStep = () => (
    <Stack spacing={2}>
      <Typography variant="h6">Google Ads</Typography>
      <Typography variant="body2" color="text.secondary">
        We need administrative access to your Google Ads account so we can manage campaigns, conversions, budgets, and integrations with analytics.
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle2">How to grant access</Typography>
        <Link href="https://support.google.com/google-ads/answer/9978556" target="_blank" rel="noreferrer">
          Google Ads access instructions
        </Link>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Please add: <strong>jmartin@anchorcorps.com</strong> (Administrator)
        </Typography>
      </Paper>
      <Stack>
        <FormControlLabel
          control={
            <Checkbox
              checked={access.google_ads_access_provided}
              onChange={(e) => setAccess((p) => ({ ...p, google_ads_access_provided: e.target.checked }))}
            />
          }
          label="I have provided Google Ads access"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={access.google_ads_access_understood}
              onChange={(e) => setAccess((p) => ({ ...p, google_ads_access_understood: e.target.checked }))}
            />
          }
          label="I understand that I need to provide Google Ads access to Anchor Corps as soon as possible to ensure a smooth onboarding"
        />
      </Stack>
    </Stack>
  );

  const renderMetaStep = () => (
    <Stack spacing={2}>
      <Typography variant="h6">Facebook Business Manager (Meta)</Typography>
        <Typography variant="body2" color="text.secondary">
        We need access through Facebook Business Manager to manage ads, pixels, conversion events, and page connections.
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle2">How to grant access</Typography>
        <Link href="https://www.facebook.com/business/help/2169003770027706" target="_blank" rel="noreferrer">
          Facebook Business Manager access instructions
        </Link>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Please add: jmartin@anchorcorps.com, zcundiff@anchorcorps.com, mshover@anchorcorps.com
        </Typography>
      </Paper>
      <Stack>
      <FormControlLabel
          control={<Checkbox checked={access.meta_access_provided} onChange={(e) => setAccess((p) => ({ ...p, meta_access_provided: e.target.checked }))} />}
          label="I have provided Facebook Business Manager access"
        />
        <FormControlLabel
          control={<Checkbox checked={access.meta_access_understood} onChange={(e) => setAccess((p) => ({ ...p, meta_access_understood: e.target.checked }))} />}
          label="I understand that I need to provide Facebook access to Anchor Corps as soon as possible to ensure a smooth onboarding"
        />
      </Stack>
    </Stack>
  );

  const renderFormsStep = () => (
    <Stack spacing={2}>
      <Typography variant="h6">Website Forms & Integrations</Typography>
      <Typography variant="body2" color="text.secondary">
        Tell us how your website forms are set up so we can ensure lead tracking, compliance, and integrations work correctly.
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle2">Check all that apply</Typography>
        <Stack>
          <FormControlLabel
            control={
              <Checkbox
                checked={access.website_forms_uses_third_party}
                onChange={(e) => setAccess((p) => ({ ...p, website_forms_uses_third_party: e.target.checked }))}
              />
            }
            label="Third-party form tools (Jotform, Formstack, Typeform, etc.)"
          />
          <FormControlLabel
            control={<Checkbox checked={access.website_forms_uses_hipaa} onChange={(e) => setAccess((p) => ({ ...p, website_forms_uses_hipaa: e.target.checked }))} />}
            label="HIPAA-compliant or secure intake forms"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={access.website_forms_connected_crm}
                onChange={(e) => setAccess((p) => ({ ...p, website_forms_connected_crm: e.target.checked }))}
              />
            }
            label="Forms connected to a CRM or practice management system"
          />
          <FormControlLabel
            control={<Checkbox checked={access.website_forms_custom} onChange={(e) => setAccess((p) => ({ ...p, website_forms_custom: e.target.checked }))} />}
            label="Custom-built or developer-managed forms"
          />
        </Stack>
        <TextField
          label="Notes"
          fullWidth
          multiline
          minRows={3}
          value={access.website_forms_notes}
          onChange={(e) => setAccess((p) => ({ ...p, website_forms_notes: e.target.value }))}
          sx={{ mt: 1 }}
        />
      </Paper>
      <Stack>
        <FormControlLabel
          control={
            <Checkbox
              checked={access.website_forms_details_provided}
              onChange={(e) => setAccess((p) => ({ ...p, website_forms_details_provided: e.target.checked }))}
            />
          }
          label="I have provided details about my website form setup and integrations"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={access.website_forms_details_understood}
              onChange={(e) => setAccess((p) => ({ ...p, website_forms_details_understood: e.target.checked }))}
            />
          }
          label="I understand that additional access or information related to website forms and integrations may be required"
        />
      </Stack>
    </Stack>
  );

  const renderStepContent = () => {
    switch (currentStep?.key) {
      case 'profile':
        return renderProfileStep();
      case 'brand':
        return renderBrandStep();
      case 'services':
        return renderServicesStep();
      case 'website_access':
        return renderWebsiteAccessStep();
      case 'ga4':
        return renderGa4Step();
      case 'google_ads':
        return renderGoogleAdsStep();
      case 'meta':
        return renderMetaStep();
      case 'forms':
        return renderFormsStep();
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Paper elevation={1} sx={{ p: 4, textAlign: 'center' }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>Loading onboarding information…</Typography>
        </Paper>
      </Container>
    );
  }

  if (error && !data) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Paper elevation={1} sx={{ p: 4, textAlign: 'center' }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
          <Button variant="contained" onClick={() => navigate('/pages/login')}>
            Go to Login
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ my: 6 }}>
      <Paper elevation={2} sx={{ p: { xs: 3, md: 4 } }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h4" gutterBottom>
              Welcome to Anchor
            </Typography>
            <Typography variant="body1" color="text.secondary">
              We&apos;ll take you through a few quick steps to personalize your dashboard. You can always revisit these
              details later in the client portal.
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" onClose={() => setError('')}>
              {error}
            </Alert>
          )}
          {successMessage && <Alert severity="success">{successMessage}</Alert>}

          <Stepper activeStep={activeStep} alternativeLabel sx={{ pt: 1 }}>
            {STEP_CONFIG.map((step) => (
              <Step key={step.key}>
                <StepLabel>{step.label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          <Typography variant="body2" color="text.secondary">
            {currentStep?.description}
          </Typography>

          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: { xs: 2, md: 3 } }}>
            {renderStepContent()}
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
            <Button onClick={handleBack} disabled={activeStep === 0 || submitting}>
              Back
            </Button>
            <Button
              variant="contained"
              size="large"
              onClick={isLastStep ? handleSubmit : handleNext}
              disabled={submitting}
            >
              {isLastStep ? (submitting ? 'Saving…' : 'Complete Onboarding') : 'Continue'}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Container>
  );
}
