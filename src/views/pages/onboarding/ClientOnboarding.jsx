import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  Alert,
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
import { IconPlus, IconTrash } from '@tabler/icons-react';

import { fetchOnboarding, submitOnboarding } from 'api/onboarding';
import { login } from 'api/auth';
import { findClientTypePreset } from 'constants/clientPresets';
import { strengthColor, strengthIndicator } from 'utils/password-strength';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

const emptyService = () => ({ name: '', description: '', base_price: 0, active: true, isDefault: false });
const STEP_CONFIG = [
  { key: 'profile', label: 'Profile & Credentials', description: 'Confirm account basics and set a password.' },
  { key: 'brand', label: 'Brand Basics', description: 'Share brand notes and key contact links.' },
  { key: 'services', label: 'Services & Pricing', description: 'Review offerings before completing onboarding.' },
  {
    key: 'dns',
    label: 'DNS Access Commitment',
    description: 'Acknowledge that you will grant Anchor access to your DNS provider.'
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
    brand: {}
  });
  const [serviceList, setServiceList] = useState([]);
  const [successMessage, setSuccessMessage] = useState('');
  const [defaultOptions, setDefaultOptions] = useState([]);
  const [dnsAcknowledged, setDnsAcknowledged] = useState(false);
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
          website_admin_email: payload.brand?.website_admin_email || '',
          website_url: payload.brand?.website_url || '',
          ga_emails: payload.brand?.ga_emails || '',
          meta_bm_email: payload.brand?.meta_bm_email || '',
          pricing_list_url: payload.brand?.pricing_list_url || '',
          promo_calendar_url: payload.brand?.promo_calendar_url || ''
        };
        setForm((prev) => ({
          ...prev,
          display_name: initialName,
          monthly_revenue_goal: payload.profile?.monthly_revenue_goal || '',
          client_identifier_value: payload.profile?.client_identifier_value || '',
          brand: presetBrand
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
    if (key === 'dns') {
      if (!dnsAcknowledged) {
        setError('Please confirm that you will provide DNS access.');
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
        services: sanitizedServices
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
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <TextField
            label="Display Name"
            fullWidth
            value={form.display_name}
            onChange={(e) => setForm((prev) => ({ ...prev, display_name: e.target.value }))}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField label="Email" fullWidth value={data.user.email} InputProps={{ readOnly: true }} />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            label="Client Identifier"
            fullWidth
            value={form.client_identifier_value}
            onChange={(e) => setForm((prev) => ({ ...prev, client_identifier_value: e.target.value }))}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            label="Monthly Revenue Goal"
            type="number"
            fullWidth
            value={form.monthly_revenue_goal}
            onChange={(e) => setForm((prev) => ({ ...prev, monthly_revenue_goal: e.target.value }))}
          />
        </Grid>
        <Grid item xs={12} md={6}>
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
        </Grid>
        <Grid item xs={12} md={6}>
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
        </Grid>
      </Grid>
    </Stack>
  );

  const renderBrandStep = () => (
    <Stack spacing={2}>
      <Typography variant="h6">Brand Basics</Typography>
      <Typography variant="body2" color="text.secondary">
        Share the quick-reference items our team will need for reporting and campaign execution.
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <TextField
            label="Business Name"
            fullWidth
            value={form.brand.business_name || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, brand: { ...prev.brand, business_name: e.target.value } }))}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            label="Website"
            fullWidth
            value={form.brand.website_url || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, brand: { ...prev.brand, website_url: e.target.value } }))}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            label="Brand Notes"
            multiline
            minRows={2}
            fullWidth
            value={form.brand.brand_notes || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, brand: { ...prev.brand, brand_notes: e.target.value } }))}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            label="GA/GTM Emails"
            fullWidth
            value={form.brand.ga_emails || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, brand: { ...prev.brand, ga_emails: e.target.value } }))}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            label="Meta Business Email"
            fullWidth
            value={form.brand.meta_bm_email || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, brand: { ...prev.brand, meta_bm_email: e.target.value } }))}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            label="Pricing List URL"
            fullWidth
            value={form.brand.pricing_list_url || ''}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, brand: { ...prev.brand, pricing_list_url: e.target.value } }))
            }
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            label="Promo Calendar URL"
            fullWidth
            value={form.brand.promo_calendar_url || ''}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, brand: { ...prev.brand, promo_calendar_url: e.target.value } }))
            }
          />
        </Grid>
      </Grid>
      <Typography variant="caption" color="text.secondary">
        You&apos;ll upload logos and files inside the portal after onboarding.
      </Typography>
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
              <Grid item xs={12} md={6}>
                <TextField
                  label="Service Name"
                  fullWidth
                  value={service.name}
                  onChange={(e) => handleServiceChange(index, 'name', e.target.value)}
                  InputProps={{ readOnly: service.isDefault }}
                  helperText={service.isDefault ? 'Default service from your preset' : ''}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Base Price"
                  type="number"
                  fullWidth
                  value={service.base_price}
                  onChange={(e) => handleServiceChange(index, 'base_price', e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                />
              </Grid>
              <Grid item xs={12} md={2} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
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

  const renderDnsStep = () => (
    <Stack spacing={2}>
      <Typography variant="h6">DNS Access Overview</Typography>
      <Typography variant="body2" color="text.secondary">
        DNS (Domain Name System) tells browsers where to find your website. If DNS isn’t configured or transferred, your
        site and email can go offline. We need access to your DNS provider so we can point your domain to Anchor hosting.
        If you&apos;re unsure who manages your DNS, reach out to us immediately.
      </Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          Popular DNS Providers & Access Help
        </Typography>
        <List dense>
          {[
            {
              name: 'GoDaddy',
              url: 'https://www.godaddy.com/help/add-delegate-access-12376',
              label: 'Granting access'
            },
            {
              name: 'Namecheap',
              url: 'https://www.namecheap.com/support/knowledgebase/article.aspx/9642/45/how-can-i-share-access-to-my-domain',
              label: 'Share account access'
            },
            {
              name: 'Cloudflare',
              url: 'https://developers.cloudflare.com/fundamentals/account-and-billing/members/',
              label: 'Member invitations'
            },
            {
              name: 'Google Domains',
              url: 'https://support.google.com/domains/answer/7519956',
              label: 'Share domain management'
            },
            {
              name: 'Bluehost',
              url: 'https://www.bluehost.com/help/article/how-to-grant-access-to-your-account',
              label: 'Grant account access'
            },
            {
              name: 'HostGator',
              url: 'https://www.hostgator.com/help/article/how-do-i-grant-account-access',
              label: 'Grant account access'
            },
            {
              name: 'DigitalOcean',
              url: 'https://docs.digitalocean.com/products/accounts/team/',
              label: 'Team access'
            },
            {
              name: 'Amazon Route 53',
              url: 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/access-control.html',
              label: 'IAM user access'
            }
          ].map((provider) => (
            <ListItem key={provider.name} sx={{ alignItems: 'flex-start', pl: 0 }}>
              <ListItemText
                primary={provider.name}
                secondary={
                  <Link href={provider.url} target="_blank" rel="noreferrer">
                    {provider.label}
                  </Link>
                }
              />
            </ListItem>
          ))}
        </List>
        <Typography variant="body2" color="text.secondary">
          If your provider isn&apos;t listed, let us know so we can walk you through granting access.
        </Typography>
      </Paper>
      <FormControlLabel
        control={<Checkbox checked={dnsAcknowledged} onChange={(e) => setDnsAcknowledged(e.target.checked)} />}
        label="I understand DNS access is required and will provide access or credentials to Anchor."
      />
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
      case 'dns':
        return renderDnsStep();
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
