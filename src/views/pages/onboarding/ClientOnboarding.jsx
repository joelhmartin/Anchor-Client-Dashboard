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
  Radio,
  RadioGroup,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography
} from '@mui/material';
import { IconPlus, IconTrash, IconUser } from '@tabler/icons-react';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';

import {
  fetchOnboarding,
  fetchOnboardingMe,
  submitOnboardingMe,
  saveOnboardingDraft,
  saveOnboardingDraftMe,
  activateOnboardingFromToken,
  uploadOnboardingAvatar,
  uploadOnboardingAvatarMe,
  uploadOnboardingBrandAssets,
  uploadOnboardingBrandAssetsMe,
  deleteOnboardingBrandAsset,
  deleteOnboardingBrandAssetMe
} from 'api/onboarding';
import useAuth from 'hooks/useAuth';
import { findClientTypePreset } from 'constants/clientPresets';
import { strengthColor, strengthIndicator } from 'utils/password-strength';
import { useToast } from 'contexts/ToastContext';
import { getErrorMessage } from 'utils/errors';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import FileUploadList from 'ui-component/extended/Form/FileUploadList';
import AnchorStepIcon from 'ui-component/extended/AnchorStepIcon';

const emptyService = () => ({ name: '', active: true, isDefault: false });
const BASE_STEP_CONFIG = [
  { key: 'profile', label: 'Profile & Credentials', description: 'Confirm account basics and set a password.' },
  { key: 'brand', label: 'Brand Assets', description: 'Upload logos/style guides and share brand basics.' },
  { key: 'services', label: 'Services', description: 'Review your services before completing onboarding.' }
];

const ACCESS_STEP_CONFIG = [
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

const DEFAULT_ACCESS_REQUIREMENTS = {
  requires_website_access: true,
  requires_ga4_access: true,
  requires_google_ads_access: true,
  requires_meta_access: true,
  requires_forms_step: true
};

const buildStepConfig = (requirements = DEFAULT_ACCESS_REQUIREMENTS) => {
  const steps = [...BASE_STEP_CONFIG];
  ACCESS_STEP_CONFIG.forEach((step) => {
    const flagKey = step.key === 'forms' ? 'requires_forms_step' : `requires_${step.key}_access`;
    const enabled = requirements?.[flagKey];
    if (enabled !== false) {
      steps.push(step);
    }
  });
  return steps;
};

const getDefaultServices = (profile) => {
  if (!profile?.client_type) return [];
  const preset = findClientTypePreset(profile.client_type);
  if (!preset) return [];
  const subtype = preset.subtypes?.find((item) => item.value === profile.client_subtype);
  return subtype?.services || [];
};

const LOCAL_DRAFT_TTL_MS = 60 * 60 * 1000; // 1 hour
const LOCAL_DRAFT_ME_KEY = 'anchor:onboarding:draft:me';
const localDraftKeyForToken = (token) => `anchor:onboarding:draft:token:${token}`;
const localDraftKeyForUser = (userId) => `anchor:onboarding:draft:user:${userId}`;

export default function ClientOnboardingPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { login: authLogin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [accessRequirements, setAccessRequirements] = useState(DEFAULT_ACCESS_REQUIREMENTS);
  const [stepConfig, setStepConfig] = useState(buildStepConfig(DEFAULT_ACCESS_REQUIREMENTS));
  const [form, setForm] = useState({
    display_name: '',
    monthly_revenue_goal: '',
    call_tracking_main_number: '',
    front_desk_emails: '',
    office_admin_name: '',
    office_admin_email: '',
    office_admin_phone: '',
    form_email_recipients: '',
    password: '',
    password_confirm: '',
    brand: {},
    avatar_url: ''
  });
  const [serviceList, setServiceList] = useState([]);
  const [successMessage, setSuccessMessage] = useState('');
  const [logoUploadError, setLogoUploadError] = useState('');
  const [styleGuideUploadError, setStyleGuideUploadError] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingStyleGuide, setUploadingStyleGuide] = useState(false);
  const [removingBrandAssetId, setRemovingBrandAssetId] = useState('');
  const [defaultOptions, setDefaultOptions] = useState([]);
  const [access, setAccess] = useState({
    website_access_status: '',
    website_access_provided: false,
    website_access_understood: false,
    ga4_access_status: '',
    ga4_access_provided: false,
    ga4_access_understood: false,
    google_ads_access_status: '',
    google_ads_access_provided: false,
    google_ads_access_understood: false,
    meta_access_status: '',
    meta_access_provided: false,
    meta_access_understood: false,
    website_forms_details_status: '',
    website_forms_details_provided: false,
    website_forms_details_understood: false,
    website_forms_uses_third_party: false,
    website_forms_uses_hipaa: false,
    website_forms_connected_crm: false,
    website_forms_custom: false,
    website_forms_notes: ''
  });
  const [customServiceName, setCustomServiceName] = useState('');

  const isLastStep = activeStep === stepConfig.length - 1;
  const currentStep = stepConfig[activeStep];
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [strength, setStrength] = useState(0);
  const [level, setLevel] = useState();

  const readLocalDraft = useCallback((key) => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const savedAt = Number(parsed?.saved_at || 0);
      const draft = parsed?.draft || null;
      if (!savedAt || !draft) return null;
      if (Date.now() - savedAt > LOCAL_DRAFT_TTL_MS) {
        window.localStorage.removeItem(key);
        return null;
      }
      return { draft, saved_at: savedAt };
    } catch {
      return null;
    }
  }, []);

  const writeLocalDraft = useCallback((key, draft) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          saved_at: Date.now(),
          draft
        })
      );
    } catch {
      // ignore quota errors
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    setStrength(strengthIndicator(''));
    setLevel(strengthColor(strengthIndicator('')));
    const fetcher = token ? () => fetchOnboarding(token) : () => fetchOnboardingMe();
    fetcher()
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
          website_url: payload.brand?.website_url || ''
        };
        const baseForm = {
          display_name: initialName,
          monthly_revenue_goal: payload.profile?.monthly_revenue_goal || '',
          call_tracking_main_number: payload.profile?.call_tracking_main_number || '',
          front_desk_emails: payload.profile?.front_desk_emails || '',
          office_admin_name: payload.profile?.office_admin_name || '',
          office_admin_email: payload.profile?.office_admin_email || '',
          office_admin_phone: payload.profile?.office_admin_phone || '',
          form_email_recipients: payload.profile?.form_email_recipients || '',
          brand: presetBrand,
          avatar_url: payload.user?.avatar_url || ''
        };

        const serverDraft = payload.profile?.onboarding_draft_json || null;
        const localCandidates = [];
        if (token) localCandidates.push(readLocalDraft(localDraftKeyForToken(token)));
        if (payload?.user?.id) localCandidates.push(readLocalDraft(localDraftKeyForUser(payload.user.id)));
        localCandidates.push(readLocalDraft(LOCAL_DRAFT_ME_KEY));
        const localBest = localCandidates
          .filter(Boolean)
          .sort((a, b) => Number(b.saved_at || 0) - Number(a.saved_at || 0))[0];
        const draft = localBest?.draft || serverDraft;

        const draftForm = draft?.form ? { ...draft.form } : null;
        if (draftForm) {
          // Never persist passwords in drafts
          delete draftForm.password;
          delete draftForm.password_confirm;
        }

        setForm((prev) => ({
          ...prev,
          ...baseForm,
          ...(draftForm || {})
        }));
        const nextRequirements = {
          requires_website_access: payload.profile?.requires_website_access !== false,
          requires_ga4_access: payload.profile?.requires_ga4_access !== false,
          requires_google_ads_access: payload.profile?.requires_google_ads_access !== false,
          requires_meta_access: payload.profile?.requires_meta_access !== false,
          requires_forms_step: payload.profile?.requires_forms_step !== false
        };
        setAccessRequirements(nextRequirements);
        const nextSteps = buildStepConfig(nextRequirements);
        setStepConfig(nextSteps);
        const draftStep = Number.isFinite(Number(draft?.activeStep)) ? Number(draft.activeStep) : 0;
        setActiveStep(Math.max(0, Math.min(draftStep, nextSteps.length - 1)));
        setAccess((prev) => ({
          ...prev,
          website_access_status: payload.profile?.website_access_status || '',
          website_access_provided: payload.profile?.website_access_provided || false,
          website_access_understood: payload.profile?.website_access_understood || false,
          ga4_access_status: payload.profile?.ga4_access_status || '',
          ga4_access_provided: payload.profile?.ga4_access_provided || false,
          ga4_access_understood: payload.profile?.ga4_access_understood || false,
          google_ads_access_status: payload.profile?.google_ads_access_status || '',
          google_ads_access_provided: payload.profile?.google_ads_access_provided || false,
          google_ads_access_understood: payload.profile?.google_ads_access_understood || false,
          meta_access_status: payload.profile?.meta_access_status || '',
          meta_access_provided: payload.profile?.meta_access_provided || false,
          meta_access_understood: payload.profile?.meta_access_understood || false,
          website_forms_details_status: payload.profile?.website_forms_details_status || '',
          website_forms_details_provided: payload.profile?.website_forms_details_provided || false,
          website_forms_details_understood: payload.profile?.website_forms_details_understood || false,
          website_forms_uses_third_party: payload.profile?.website_forms_uses_third_party || false,
          website_forms_uses_hipaa: payload.profile?.website_forms_uses_hipaa || false,
          website_forms_connected_crm: payload.profile?.website_forms_connected_crm || false,
          website_forms_custom: payload.profile?.website_forms_custom || false,
          website_forms_notes: payload.profile?.website_forms_notes || ''
        }));
        if (draft?.access) {
          setAccess((prev) => ({ ...prev, ...(draft.access || {}) }));
        }
        const initialServices = (payload.services && payload.services.length ? payload.services : []).map((s) => ({
          id: s.id,
          name: s.name || '',
          active: s.active !== false,
          isDefault: defaultNameSet.has((s.name || '').toLowerCase())
        }));
        setServiceList(Array.isArray(draft?.services) ? draft.services : initialServices);
      })
      .catch((err) => {
        const msg = getErrorMessage(err, 'Unable to load onboarding details');
        setError(msg);
        toast.error(msg);
      })
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

  const CheckboxRadio = (props) => <Radio {...props} icon={<CheckBoxOutlineBlankIcon />} checkedIcon={<CheckBoxIcon />} />;

  const setAccessStatus = (statusKey, statusValue, mapping) => {
    setAccess((prev) => ({
      ...prev,
      [statusKey]: statusValue,
      ...(typeof mapping === 'function' ? mapping(statusValue, prev) : {})
    }));
  };

  const validateStep = (stepIndex = activeStep) => {
    const key = stepConfig[stepIndex]?.key;
    if (key === 'profile') {
      if (!form.display_name.trim()) {
        toast.error('Display name is required');
        return false;
      }
      const hasPassword = Boolean(data?.user?.has_password);
      if (!hasPassword) {
        if (!form.password || form.password.length < 8) {
          toast.error('Please choose a password with at least 8 characters');
          return false;
        }
        if (form.password !== form.password_confirm) {
          toast.error('Passwords do not match');
          return false;
        }
      } else if (form.password || form.password_confirm) {
        if (form.password.length < 8) {
          toast.error('Please choose a password with at least 8 characters');
          return false;
        }
        if (form.password !== form.password_confirm) {
          toast.error('Passwords do not match');
          return false;
        }
      }
    }
    if (key === 'services') {
      const hasNamedService = serviceList.some((service) => service.name?.trim());
      if (!hasNamedService) {
        toast.error('Please add at least one service');
        return false;
      }
      if (!allServicesValid) {
        toast.error('Every service must include a name');
        return false;
      }
    }
    if (key === 'website_access') {
      if (!String(access.website_access_status || '').trim()) {
        toast.error('Please confirm website access (provided or understood).');
        return false;
      }
    }
    if (key === 'ga4') {
      if (!String(access.ga4_access_status || '').trim()) {
        toast.error('Please confirm Google Analytics access (provided or understood).');
        return false;
      }
    }
    if (key === 'google_ads') {
      if (!String(access.google_ads_access_status || '').trim()) {
        toast.error('Please confirm Google Ads access (provided or understood).');
        return false;
      }
    }
    if (key === 'meta') {
      if (!String(access.meta_access_status || '').trim()) {
        toast.error('Please confirm Facebook Business Manager access (provided or understood).');
        return false;
      }
    }
    if (key === 'forms') {
      if (!String(access.website_forms_details_status || '').trim()) {
        toast.error('Please confirm forms/integrations details (provided or understood).');
        return false;
      }
      if (access.website_forms_details_status === 'provided' && !String(access.website_forms_notes || '').trim()) {
        toast.error('Please add a short note about your website forms/integrations.');
        return false;
      }
    }
    setError('');
    return true;
  };

  const buildDraft = useCallback(() => {
    const safeForm = { ...form };
    delete safeForm.password;
    delete safeForm.password_confirm;
    return {
      activeStep,
      form: safeForm,
      access,
      services: serviceList
    };
  }, [form, access, serviceList, activeStep]);

  const handleSaveDraft = async () => {
    if (!data?.user?.email) return;
    try {
      const draft = buildDraft();
      // Local cache (1 hour) so user can instantly resume even if network is spotty.
      if (token) {
        writeLocalDraft(localDraftKeyForToken(token), draft);
      } else if (data?.user?.id) {
        writeLocalDraft(localDraftKeyForUser(data.user.id), draft);
      } else {
        writeLocalDraft(LOCAL_DRAFT_ME_KEY, draft);
      }
      if (token) {
        await saveOnboardingDraft(token, draft);
      } else {
        await saveOnboardingDraftMe(draft);
      }
      toast.success('Saved! You can safely come back later.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Unable to save your progress'));
    }
  };

  const handleNext = async () => {
    if (!validateStep()) return;
    const key = stepConfig[activeStep]?.key;
    const hasPassword = Boolean(data?.user?.has_password);

    // Step 1 completion: activate account immediately and disable onboarding links.
    if (key === 'profile' && token && !hasPassword) {
      try {
        setSubmitting(true);
        // Save draft first so we can land back on step 2 after login.
        await saveOnboardingDraft(token, { ...buildDraft(), activeStep: Math.min(activeStep + 1, stepConfig.length - 1) });
        await activateOnboardingFromToken(token, { display_name: form.display_name.trim(), password: form.password });
        await authLogin({ email: data.user.email, password: form.password });
        navigate('/onboarding', { replace: true });
        return;
      } catch (err) {
        toast.error(getErrorMessage(err, 'Unable to activate your account'));
      } finally {
        setSubmitting(false);
      }
    }

    setActiveStep((prev) => Math.min(prev + 1, stepConfig.length - 1));
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
          active: service.active !== false
        }));
      if (token) {
        const hasPassword = Boolean(data?.user?.has_password);
        if (hasPassword) {
          throw new Error('Your account is already activated. Please log in to finish onboarding.');
        }
        throw new Error('Please complete step 1 to activate your account before finishing onboarding.');
      }
      await submitOnboardingMe({
        display_name: form.display_name.trim(),
        password: form.password || undefined,
        monthly_revenue_goal: form.monthly_revenue_goal,
        call_tracking_main_number: form.call_tracking_main_number,
        front_desk_emails: form.front_desk_emails,
        office_admin_name: form.office_admin_name,
        office_admin_email: form.office_admin_email,
        office_admin_phone: form.office_admin_phone,
        form_email_recipients: form.form_email_recipients,
        brand: form.brand,
        services: sanitizedServices,
        ...access
      });
      setSuccessMessage('Information saved!');
      // Clear local cached drafts since onboarding is complete.
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('anchor:onboarding:draft:me');
          if (token) window.localStorage.removeItem(`anchor:onboarding:draft:token:${token}`);
          if (data?.user?.id) window.localStorage.removeItem(`anchor:onboarding:draft:user:${data.user.id}`);
        }
      } catch {}
      navigate('/onboarding/thank-you', { replace: true, state: { email: data.user.email } });
    } catch (err) {
      const msg = getErrorMessage(err, 'Unable to save onboarding information');
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const renderProfileStep = () => (
    <Stack spacing={2}>
      <Typography variant="h6">Profile Details</Typography>
      <Typography variant="body2" color="text.secondary">
        Confirm the name we should use in-app and the password you&apos;ll use to log in.
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
                  const res = token ? await uploadOnboardingAvatar(token, file) : await uploadOnboardingAvatarMe(file);
                  setForm((prev) => ({ ...prev, avatar_url: res.data?.avatar_url || prev.avatar_url }));
                } catch (err) {
                  toast.error(getErrorMessage(err, 'Unable to upload avatar'));
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
            label="Call Tracking Main Phone Number"
            fullWidth
            value={form.call_tracking_main_number}
            onChange={(e) => setForm((prev) => ({ ...prev, call_tracking_main_number: e.target.value }))}
            placeholder="e.g., (555) 123-4567"
          />
          <TextField
            label="Front Desk Email(s)"
            fullWidth
            value={form.front_desk_emails}
            onChange={(e) => setForm((prev) => ({ ...prev, front_desk_emails: e.target.value }))}
            placeholder="e.g., frontdesk@practice.com, scheduling@practice.com"
            helperText="Comma-separated if multiple."
          />
          <TextField
            label="Office Admin (Name)"
            fullWidth
            value={form.office_admin_name}
            onChange={(e) => setForm((prev) => ({ ...prev, office_admin_name: e.target.value }))}
          />
          <TextField
            label="Office Admin (Email)"
            fullWidth
            value={form.office_admin_email}
            onChange={(e) => setForm((prev) => ({ ...prev, office_admin_email: e.target.value }))}
          />
          <TextField
            label="Office Admin (Phone)"
            fullWidth
            value={form.office_admin_phone}
            onChange={(e) => setForm((prev) => ({ ...prev, office_admin_phone: e.target.value }))}
          />
          <TextField
            label="Form Submission Recipient Email(s)"
            fullWidth
            value={form.form_email_recipients}
            onChange={(e) => setForm((prev) => ({ ...prev, form_email_recipients: e.target.value }))}
            placeholder="e.g., leads@practice.com"
            helperText="Where should website form submission emails go? Comma-separated if multiple."
          />
          {!data?.user?.has_password ? (
            <>
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
            </>
          ) : (
            <Alert severity="info">
              Your account is active. Use “Save &amp; Continue Later” anytime and come back via login — you’ll return right
              where you left off.
            </Alert>
          )}
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
        <Stack spacing={2}>
          <FileUploadList
            title="Logos"
            description="Upload one or more logo files (PNG/JPG/WebP/SVG)."
            accept="image/*"
            multiple
            disabled={submitting}
            busy={uploadingLogo}
            errorText={logoUploadError}
            kindLabel="Logo"
            items={(Array.isArray(data?.brand?.logos) ? data.brand.logos : []).filter((a) => (a?.kind || 'logo') === 'logo')}
            onAddFiles={async (files) => {
              setLogoUploadError('');
              setError('');
              setSuccessMessage('');
              setUploadingLogo(true);
              try {
                const res = token
                  ? await uploadOnboardingBrandAssets(token, files, { kind: 'logo' })
                  : await uploadOnboardingBrandAssetsMe(files, { kind: 'logo' });
                const next = res?.data?.logos || res?.data?.assets || [];
                setData((prev) => ({ ...prev, brand: { ...(prev?.brand || {}), logos: next } }));
              } catch (err) {
                const msg = getErrorMessage(err, 'Unable to upload logo(s)');
                setLogoUploadError(msg);
                toast.error(msg);
              } finally {
                setUploadingLogo(false);
              }
            }}
            onRemove={async (asset) => {
              setLogoUploadError('');
              setError('');
              setSuccessMessage('');
              setRemovingBrandAssetId(asset?.id || '');
              try {
                const next = token ? await deleteOnboardingBrandAsset(token, asset.id) : await deleteOnboardingBrandAssetMe(asset.id);
                const logos = next?.logos || next?.assets || [];
                setData((prev) => ({ ...prev, brand: { ...(prev?.brand || {}), logos } }));
              } catch (err) {
                const msg = getErrorMessage(err, 'Unable to remove file');
                setLogoUploadError(msg);
                toast.error(msg);
              } finally {
                setRemovingBrandAssetId('');
              }
            }}
          />

          <FileUploadList
            title="Style Guides"
            description="Upload style guides or brand docs (PDF/DOC/DOCX). You can upload multiple."
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            disabled={submitting}
            busy={uploadingStyleGuide}
            errorText={styleGuideUploadError}
            kindLabel="Style Guide"
            items={(Array.isArray(data?.brand?.logos) ? data.brand.logos : []).filter((a) => a?.kind === 'style_guide')}
            onAddFiles={async (files) => {
              setStyleGuideUploadError('');
              setError('');
              setSuccessMessage('');
              setUploadingStyleGuide(true);
              try {
                const res = token
                  ? await uploadOnboardingBrandAssets(token, files, { kind: 'style_guide' })
                  : await uploadOnboardingBrandAssetsMe(files, { kind: 'style_guide' });
                const next = res?.data?.logos || res?.data?.assets || [];
                setData((prev) => ({ ...prev, brand: { ...(prev?.brand || {}), logos: next } }));
              } catch (err) {
                const msg = getErrorMessage(err, 'Unable to upload style guide(s)');
                setStyleGuideUploadError(msg);
                toast.error(msg);
              } finally {
                setUploadingStyleGuide(false);
              }
            }}
            onRemove={async (asset) => {
              setStyleGuideUploadError('');
              setError('');
              setSuccessMessage('');
              setRemovingBrandAssetId(asset?.id || '');
              try {
                const next = token ? await deleteOnboardingBrandAsset(token, asset.id) : await deleteOnboardingBrandAssetMe(asset.id);
                const logos = next?.logos || next?.assets || [];
                setData((prev) => ({ ...prev, brand: { ...(prev?.brand || {}), logos } }));
              } catch (err) {
                const msg = getErrorMessage(err, 'Unable to remove file');
                setStyleGuideUploadError(msg);
                toast.error(msg);
              } finally {
                setRemovingBrandAssetId('');
              }
            }}
          />

          <Typography variant="caption" color="text.secondary">
            Tip: Uploaded items appear above. Use the X to remove anything incorrect.
          </Typography>
        </Stack>
      </Stack>
    </Stack>
  );

  const renderServicesStep = () => (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6">Services</Typography>
        <Typography variant="body2" color="text.secondary">
          Pick the services that apply to your engagement. You can add more or remove preset ones.
        </Typography>
      </Box>

      {/* Monthly revenue goal (disabled for now) */}
      {/*
      <TextField
        label="Monthly Revenue Goal"
        type="number"
        fullWidth
        value={form.monthly_revenue_goal}
        onChange={(e) => setForm((prev) => ({ ...prev, monthly_revenue_goal: e.target.value }))}
      />
      */}

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
        <Alert severity="info">Select or add at least one service to continue.</Alert>
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
              <Grid item xs={12} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <IconButton color="error" onClick={() => handleRemoveService(index)}>
                  <IconTrash size={18} />
                </IconButton>
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
        We need <strong>Admin access</strong> to your website platform so we can manage updates, tracking,
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
          <Link href="https://wordpress.com/support/invite-people/" target="_blank" rel="noreferrer">
            WordPress: invite people to your site
          </Link>
          <Link href="https://www.godaddy.com/help/invite-a-delegate-to-access-my-godaddy-account-12376" target="_blank" rel="noreferrer">
            GoDaddy: invite a delegate to access your account
          </Link>
        </Stack>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Add: <strong>access@anchorcorps.com</strong> (Admin access)
        </Typography>
      </Paper>
      <RadioGroup
        value={access.website_access_status}
        onChange={(_e, v) =>
          setAccessStatus('website_access_status', v, (val) => ({
            website_access_provided: val === 'provided',
            website_access_understood: val === 'will_provide'
          }))
        }
      >
        <FormControlLabel value="provided" control={<CheckboxRadio />} label="I have provided access" />
        <FormControlLabel
          value="will_provide"
          control={<CheckboxRadio />}
          label="I have access and will be providing to Anchor Corps as soon as possible to ensure a smooth onboarding"
        />
        <FormControlLabel value="need_help" control={<CheckboxRadio />} label="Please help! I don’t know who has administrative access to my website account" />
      </RadioGroup>
    </Stack>
  );

  const renderGa4Step = () => (
    <Stack spacing={2}>
      <Typography variant="h6">Google Analytics (GA4)</Typography>
      <Typography variant="body2" color="text.secondary">
        We need <strong>Admin access</strong> to your Google Analytics property so we can configure tracking, conversions, events, integrations, and reporting.
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle2">How to grant access</Typography>
        <Link href="https://support.google.com/analytics/answer/1009702" target="_blank" rel="noreferrer">
          Google Analytics access instructions
                  </Link>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Please add: <strong>access@anchorcorps.com</strong> (Admin access)
        </Typography>
      </Paper>
      <RadioGroup
        value={access.ga4_access_status}
        onChange={(_e, v) =>
          setAccessStatus('ga4_access_status', v, (val) => ({
            ga4_access_provided: val === 'provided',
            ga4_access_understood: val === 'will_provide'
          }))
        }
      >
        <FormControlLabel value="provided" control={<CheckboxRadio />} label="I have provided access" />
        <FormControlLabel
          value="will_provide"
          control={<CheckboxRadio />}
          label="I have access and will be providing to Anchor Corps as soon as possible to ensure a smooth onboarding"
        />
        <FormControlLabel value="need_help" control={<CheckboxRadio />} label="Please help! I don’t know who has administrative access to my Google Analytics account" />
      </RadioGroup>
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
        <Link href="https://support.google.com/google-ads/answer/6372672?sjid=11176952801985058373-NA" target="_blank" rel="noreferrer">
          Google Ads access instructions
        </Link>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Please add: <strong>access@anchorcorps.com</strong> (Admin access)
        </Typography>
      </Paper>
      <RadioGroup
        value={access.google_ads_access_status}
        onChange={(_e, v) =>
          setAccessStatus('google_ads_access_status', v, (val) => ({
            google_ads_access_provided: val === 'provided',
            google_ads_access_understood: val === 'will_provide'
          }))
        }
      >
        <FormControlLabel value="provided" control={<CheckboxRadio />} label="I have provided access" />
        <FormControlLabel
          value="will_provide"
          control={<CheckboxRadio />}
          label="I have access and will be providing to Anchor Corps as soon as possible to ensure a smooth onboarding"
        />
        <FormControlLabel value="need_help" control={<CheckboxRadio />} label="Please help!  I don’t know who has administrative access to my Google Ads account" />
      </RadioGroup>
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
        <Link href="https://www.facebook.com/business/help/1717412048538897?id=2190812977867143" target="_blank" rel="noreferrer">
          Meta partner access instructions
        </Link>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Give partner access to the <strong>Anchor Business Portfolio</strong> (Business ID <strong>577506357410429</strong>) and ensure <strong>Admin access</strong> is granted.
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          If you also need to add a person by email anywhere in the flow, use <strong>access@anchorcorps.com</strong> (Admin access).
        </Typography>
      </Paper>
      <RadioGroup
        value={access.meta_access_status}
        onChange={(_e, v) =>
          setAccessStatus('meta_access_status', v, (val) => ({
            meta_access_provided: val === 'provided_access',
            meta_access_understood: val === 'will_provide_access'
          }))
        }
      >
        <FormControlLabel value="no_social_accounts" control={<CheckboxRadio />} label="I do not have a Facebook page or Instagram account" />
        <FormControlLabel value="no_meta_ads_history" control={<CheckboxRadio />} label="I have not run Meta Ads before" />
        <FormControlLabel
          value="agency_owns_ad_account"
          control={<CheckboxRadio />}
          label="I am running Meta ads but my agency owns the ad account. We will need to start a new ad account"
        />
        <FormControlLabel value="provided_access" control={<CheckboxRadio />} label="I have provided access" />
        <FormControlLabel
          value="will_provide_access"
          control={<CheckboxRadio />}
          label="I have access and will be providing to Anchor Corps as soon as possible to ensure a smooth onboarding"
        />
        <FormControlLabel value="not_running_meta" control={<CheckboxRadio />} label="Anchor Corps will not be running Meta for my business initially" />
        <FormControlLabel value="need_help" control={<CheckboxRadio />} label="Please help!  I don’t know who has administrative access to my Meta account" />
      </RadioGroup>
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
      <RadioGroup
        value={access.website_forms_details_status}
        onChange={(_e, v) =>
          setAccessStatus('website_forms_details_status', v, (val) => ({
            website_forms_details_provided: val === 'provided',
            website_forms_details_understood: val === 'will_provide'
          }))
        }
      >
        <FormControlLabel value="provided" control={<CheckboxRadio />} label="I have provided details about my website form setup and integrations" />
        <FormControlLabel
          value="will_provide"
          control={<CheckboxRadio />}
          label="I have access and will be providing form/integration details to Anchor Corps as soon as possible to ensure a smooth onboarding"
        />
        <FormControlLabel value="need_help" control={<CheckboxRadio />} label="Please help! I’m not sure what information you need for website forms/integrations" />
      </RadioGroup>
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
          <Typography variant="caption" color="error" sx={{ display: 'block', mb: 2 }}>
            Unable to load onboarding details.
          </Typography>
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

          {/* Errors are toast-only. Keep UI clean during multi-step onboarding. */}
          {successMessage && <Alert severity="success">{successMessage}</Alert>}

          <Stepper
            activeStep={activeStep}
            alternativeLabel
            sx={{
              pt: 1,
              '& .MuiStepLabel-label.Mui-active': { fontWeight: 700, transform: 'scale(1.03)' },
              '& .MuiStepLabel-labelContainer': { transformOrigin: 'center' }
            }}
          >
            {stepConfig.map((step) => (
              <Step key={step.key}>
                <StepLabel StepIconComponent={AnchorStepIcon}>{step.label}</StepLabel>
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
            <Button variant="outlined" onClick={handleSaveDraft} disabled={submitting}>
              Save &amp; Continue Later
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
