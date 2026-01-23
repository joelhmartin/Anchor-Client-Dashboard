import { lazy } from 'react';

// project imports
import Loadable from 'ui-component/Loadable';
import MinimalLayout from 'layout/MinimalLayout';
import ErrorBoundary from './ErrorBoundary';

// maintenance routing
const LoginPage = Loadable(lazy(() => import('views/pages/authentication/Login')));
const RegisterPage = Loadable(lazy(() => import('views/pages/authentication/Register')));
const ForgotPasswordPage = Loadable(lazy(() => import('views/pages/authentication/ForgotPassword')));
const ClientOnboardingPage = Loadable(lazy(() => import('views/pages/onboarding/ClientOnboarding')));
const OnboardingThankYouPage = Loadable(lazy(() => import('views/pages/onboarding/OnboardingThankYou')));

// ==============================|| AUTHENTICATION ROUTING ||============================== //

const AuthenticationRoutes = {
  path: '/',
  element: <MinimalLayout />,
  errorElement: <ErrorBoundary />,
  children: [
    {
      path: '/pages/login',
      element: <LoginPage />
    },
    {
      path: '/pages/forgot-password',
      element: <ForgotPasswordPage />
    },
    {
      path: '/pages/register',
      element: <RegisterPage />
    },
    {
      path: '/onboarding/:token',
      element: <ClientOnboardingPage />
    },
    {
      path: '/onboarding/thank-you',
      element: <OnboardingThankYouPage />
    }
  ]
};

export default AuthenticationRoutes;
