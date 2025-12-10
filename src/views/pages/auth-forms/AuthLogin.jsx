import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

// material-ui
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import OutlinedInput from '@mui/material/OutlinedInput';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';

// project imports
import AnimateButton from 'ui-component/extended/AnimateButton';
import CustomFormControl from 'ui-component/extended/Form/CustomFormControl';
import useAuth from 'hooks/useAuth';

// assets
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

// ===============================|| JWT - LOGIN ||=============================== //

export default function AuthLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [checked, setChecked] = useState(true);
  const [form, setForm] = useState({
    email: location.state?.email || '',
    password: ''
  });
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState(location.state?.resetMessage || '');
  const [submitting, setSubmitting] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const handleClickShowPassword = () => {
    setShowPassword(!showPassword);
  };

  const handleMouseDownPassword = (event) => {
    event.preventDefault();
  };

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setInfoMessage('');
    setSubmitting(true);
    try {
      await login(form);
      const target = location.state?.from?.pathname || '/';
      navigate(target, { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ display: 'grid', gap: 2 }}>
      {infoMessage && <Alert severity="success">{infoMessage}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      <CustomFormControl fullWidth>
        <InputLabel htmlFor="outlined-adornment-email-login">Email Address / Username</InputLabel>
        <OutlinedInput
          id="outlined-adornment-email-login"
          type="email"
          value={form.email}
          onChange={handleChange}
          name="email"
          autoComplete="email"
          required
        />
      </CustomFormControl>

      <CustomFormControl fullWidth>
        <InputLabel htmlFor="outlined-adornment-password-login">Password</InputLabel>
        <OutlinedInput
          id="outlined-adornment-password-login"
          type={showPassword ? 'text' : 'password'}
          value={form.password}
          name="password"
          onChange={handleChange}
          autoComplete="current-password"
          required
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
          label="Password"
        />
      </CustomFormControl>

      <Grid container sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Grid>
          <FormControlLabel
            control={<Checkbox checked={checked} onChange={(event) => setChecked(event.target.checked)} name="checked" color="primary" />}
            label="Keep me logged in"
          />
        </Grid>
        <Grid>
          <Typography
            variant="subtitle1"
            component={Link}
            to="/pages/forgot-password"
            sx={{ textDecoration: 'none', color: 'secondary.main' }}
          >
            Forgot Password?
          </Typography>
        </Grid>
      </Grid>
      <Box sx={{ mt: 2 }}>
        <AnimateButton>
          <Button color="secondary" fullWidth size="large" type="submit" variant="contained" disabled={submitting}>
            {submitting ? 'Signing In...' : 'Sign In'}
          </Button>
        </AnimateButton>
      </Box>
    </Box>
  );
}
