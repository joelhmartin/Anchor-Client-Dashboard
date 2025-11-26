import { lazy } from 'react';
import { Navigate } from 'react-router-dom';

// project imports
import MainLayout from 'layout/MainLayout';
import Loadable from 'ui-component/Loadable';
import RequireAuth from './RequireAuth';
import SuspendedRoute from 'ui-component/SuspendedRoute';
import useAuth from 'hooks/useAuth';
import Loader from 'ui-component/Loader';

const AdminHub = Loadable(lazy(() => import('views/admin/AdminHub')));
const ClientView = Loadable(lazy(() => import('views/admin/ClientView')));
const ProfileSettings = Loadable(lazy(() => import('views/admin/ProfileSettings')));
const ServicesManagement = Loadable(lazy(() => import('views/admin/ServicesManagement')));
const ActiveClients = Loadable(lazy(() => import('views/admin/ActiveClients')));
const ClientPortal = Loadable(lazy(() => import('views/client/ClientPortal')));
const BlogEditor = Loadable(lazy(() => import('views/client/BlogEditor')));

function AdminRoute({ children }) {
  const { user, initializing } = useAuth();
  if (initializing) return <Loader />;
  return <SuspendedRoute allow={user?.role === 'admin' || user?.role === 'editor'}>{children}</SuspendedRoute>;
}

function PortalRoute({ children }) {
  const { user, initializing, actingClientId } = useAuth();
  if (initializing) return <Loader />;
  const isAdmin = user?.role === 'admin' || user?.role === 'editor';
  if (isAdmin && !actingClientId) {
    return <Navigate to="/client-hub" replace />;
  }
  return children;
}

function DefaultLanding() {
  const { user, initializing, actingClientId } = useAuth();
  if (initializing) return <Loader />;
  if (actingClientId) {
    return <Navigate to="/portal" replace />;
  }
  if (user?.role === 'admin' || user?.role === 'editor') {
    return <Navigate to="/client-hub" replace />;
  }
  return <Navigate to="/portal" replace />;
}

// ==============================|| MAIN ROUTING ||============================== //

const MainRoutes = {
  path: '/',
  element: (
    <RequireAuth>
      <MainLayout />
    </RequireAuth>
  ),
  children: [
    {
      path: '/',
      element: <DefaultLanding />
    },
    {
      path: 'client-hub',
      element: (
        <AdminRoute>
          <AdminHub />
        </AdminRoute>
      )
    },
    {
      path: 'client-view',
      element: (
        <AdminRoute>
          <ClientView />
        </AdminRoute>
      )
    },
    {
      path: 'profile',
      element: (
        <AdminRoute>
          <ProfileSettings />
        </AdminRoute>
      )
    },
    {
      path: 'services',
      element: <ServicesManagement />
    },
    {
      path: 'active-clients',
      element: <ActiveClients />
    },
    {
      path: 'portal',
      element: (
        <PortalRoute>
          <ClientPortal />
        </PortalRoute>
      )
    },
    {
      path: 'blogs',
      element: <BlogEditor />
    }
  ]
};

export default MainRoutes;
