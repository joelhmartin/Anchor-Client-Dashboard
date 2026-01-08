import {
  Alert,
  Avatar,
  Box,
  Button,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  OutlinedInput,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { IconUser } from '@tabler/icons-react';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

export default function ProfileStep({
  token,
  data,
  form,
  setForm,
  submitting,
  avatarPreviewUrl,
  setAvatarPreviewUrl,
  uploadAvatar,
  toast,
  getErrorMessage,
  showPassword,
  showConfirmPassword,
  onTogglePassword,
  onToggleConfirmPassword,
  onMouseDownPassword,
  strength,
  level,
  onChangePassword
}) {
  return (
    <Stack spacing={2}>
      <Typography variant="h6">Profile Details</Typography>
      <Typography variant="body2" color="text.secondary">
        Confirm the name we should use in-app and the password you&apos;ll use to log in.
      </Typography>
      <Stack spacing={2}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar
            src={avatarPreviewUrl || form.avatar_url || ''}
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
                // Immediate local preview for UX; revoke previous URL if any.
                if (avatarPreviewUrl && typeof URL !== 'undefined') {
                  URL.revokeObjectURL(avatarPreviewUrl);
                }
                const localUrl = typeof URL !== 'undefined' ? URL.createObjectURL(file) : '';
                setAvatarPreviewUrl(localUrl);
                try {
                  const res = await uploadAvatar(token, file);
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
        {token || !data?.user?.has_password ? (
          <>
            <FormControl fullWidth variant="outlined">
              <InputLabel htmlFor="client-onboarding-password">Password</InputLabel>
              <OutlinedInput
                id="client-onboarding-password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => onChangePassword(e.target.value)}
                endAdornment={
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={onTogglePassword}
                      onMouseDown={onMouseDownPassword}
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
                      onClick={onToggleConfirmPassword}
                      onMouseDown={onMouseDownPassword}
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
            Your account is active. Use “Save &amp; Continue Later” anytime and come back via login — you’ll return right where you left
            off.
          </Alert>
        )}
      </Stack>
    </Stack>
  );
}
