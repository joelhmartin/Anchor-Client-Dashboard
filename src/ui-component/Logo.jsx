import { useTheme } from '@mui/material/styles';
import logo from 'assets/images/logo.svg';
import logoDark from 'assets/images/logo-dark.svg';

// ==============================|| LOGO IMAGE ||============================== //

export default function Logo() {
  const theme = useTheme();
  const isDark = theme.palette?.mode === 'dark';

  return <img src={isDark ? logo : logoDark} alt="Logo" width={120} />;
}
