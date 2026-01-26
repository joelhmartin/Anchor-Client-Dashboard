import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// material-ui
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import OutlinedInput from '@mui/material/OutlinedInput';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

// project imports
import AnimateButton from 'ui-component/extended/AnimateButton';
import CustomFormControl from 'ui-component/extended/Form/CustomFormControl';
import { strengthColor, strengthIndicator } from 'utils/password-strength';
import useAuth from 'hooks/useAuth';
import { useToast } from 'contexts/ToastContext';
import { getErrorMessage } from 'utils/errors';

// assets
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import Button from '@mui/material/Button';

// ===========================|| JWT - REGISTER ||=========================== //

export default function AuthRegister() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [showPassword, setShowPassword] = useState(false);
  const [checked, setChecked] = useState(true);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const [strength, setStrength] = useState(0);
  const [level, setLevel] = useState();

  const handleClickShowPassword = () => {
    setShowPassword(!showPassword);
  };

  const handleMouseDownPassword = (event) => {
    event.preventDefault();
  };

  const changePassword = (value) => {
    const temp = strengthIndicator(value);
    setStrength(temp);
    setLevel(strengthColor(temp));
    setForm((prev) => ({ ...prev, password: value }));
  };

  useEffect(() => {
    changePassword('');
  }, []);

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await register(form);
      navigate('/pages/login', {
        replace: true,
        state: {
          email: form.email,
          resetMessage: 'Account created. Please verify your email before signing in.'
        }
      });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Unable to sign up'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ display: 'grid', gap: 2 }}>
      <Stack sx={{ mb: 2, alignItems: 'center' }}>
        <Typography variant="subtitle1">Sign up with Email address </Typography>
      </Stack>

      <Grid container spacing={{ xs: 0, sm: 2 }}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <CustomFormControl fullWidth>
            <InputLabel htmlFor="outlined-adornment-first-register">First Name</InputLabel>
            <OutlinedInput
              id="outlined-adornment-first-register"
              type="text"
              name="firstName"
              value={form.firstName}
              onChange={handleChange}
              required
              autoComplete="given-name"
            />
          </CustomFormControl>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <CustomFormControl fullWidth>
            <InputLabel htmlFor="outlined-adornment-last-register">Last Name</InputLabel>
            <OutlinedInput
              id="outlined-adornment-last-register"
              type="text"
              name="lastName"
              value={form.lastName}
              onChange={handleChange}
              required
              autoComplete="family-name"
            />
          </CustomFormControl>
        </Grid>
      </Grid>
      <CustomFormControl fullWidth>
        <InputLabel htmlFor="outlined-adornment-email-register">Email Address / Username</InputLabel>
        <OutlinedInput
          id="outlined-adornment-email-register"
          type="email"
          value={form.email}
          name="email"
          onChange={handleChange}
          required
          autoComplete="email"
        />
      </CustomFormControl>

      <CustomFormControl fullWidth>
        <InputLabel htmlFor="outlined-adornment-password-register">Password</InputLabel>
        <OutlinedInput
          id="outlined-adornment-password-register"
          type={showPassword ? 'text' : 'password'}
          value={form.password}
          name="password"
          onChange={(event) => changePassword(event.target.value)}
          label="Password"
          endAdornment={
            <InputAdornment position="end">
              <IconButton
                aria-label="toggle password visibility"
                onClick={handleClickShowPassword}
                onMouseDown={handleMouseDownPassword}
                edge="end"
                size="large"
              >
                {showPassword ? <Visibility /> : <VisibilityOff />}
              </IconButton>
            </InputAdornment>
          }
        />
      </CustomFormControl>

      {strength !== 0 && (
        <FormControl fullWidth>
          <Box sx={{ mb: 2 }}>
            <Stack direction="row" sx={{ gap: 2, alignItems: 'center' }}>
              <Box sx={{ width: 85, height: 8, borderRadius: '7px', bgcolor: level?.color }} />
              <Typography variant="subtitle1" sx={{ fontSize: '0.75rem' }}>
                {level?.label}
              </Typography>
            </Stack>
          </Box>
        </FormControl>
      )}

      <FormControlLabel
        control={<Checkbox checked={checked} onChange={(event) => setChecked(event.target.checked)} name="checked" color="primary" />}
        label={
          <Typography variant="subtitle1">
            Agree with &nbsp;
            <Typography variant="subtitle1" component={Link} to="#">
              Terms & Condition.
            </Typography>
          </Typography>
        }
      />

      <Box sx={{ mt: 2 }}>
        <AnimateButton>
          <Button disableElevation fullWidth size="large" type="submit" variant="contained" color="secondary" disabled={submitting}>
            {submitting ? 'Signing Up...' : 'Sign up'}
          </Button>
        </AnimateButton>
      </Box>
    </Box>
  );
}
