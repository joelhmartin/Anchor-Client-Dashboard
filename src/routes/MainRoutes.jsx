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
const SharedDocuments = Loadable(lazy(() => import('views/admin/SharedDocuments')));
const ClientPortal = Loadable(lazy(() => import('views/client/ClientPortal')));
const BlogEditor = Loadable(lazy(() => import('views/client/BlogEditor')));
const TaskManager = Loadable(lazy(() => import('views/tasks/TaskManager')));
const FormsManager = Loadable(lazy(() => import('views/forms/FormsManager')));
const ClientOnboarding = Loadable(lazy(() => import('views/pages/onboarding/ClientOnboarding')));

function AdminRoute({ children }) {
  const { user, initializing } = useAuth();
  if (initializing) return <Loader />;
  const role = user?.effective_role || user?.role;
  return <SuspendedRoute allow={role === 'superadmin' || role === 'admin'}>{children}</SuspendedRoute>;
}

function PortalRoute({ children }) {
  const { user, initializing, actingClientId } = useAuth();
  if (initializing) return <Loader />;
  const role = user?.effective_role || user?.role;
  const isAdmin = role === 'superadmin' || role === 'admin';
  if (isAdmin && !actingClientId) {
    return <Navigate to="/client-hub" replace />;
  }
  // If a client hasn't completed onboarding, always direct them back into it.
  if (role === 'client' && !user?.onboarding_completed_at) {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}

function TaskRoute({ children }) {
  const { user, initializing } = useAuth();
  if (initializing) return <Loader />;
  const role = user?.effective_role || user?.role;
  return (
    <SuspendedRoute allow={role === 'superadmin' || role === 'admin' || role === 'team'}>
      {children}
    </SuspendedRoute>
  );
}

function FormsRoute({ children }) {
  const { user, initializing } = useAuth();
  if (initializing) return <Loader />;
  const role = user?.effective_role || user?.role;
  return (
    <SuspendedRoute allow={role === 'superadmin' || role === 'admin' || role === 'team'}>
      {children}
    </SuspendedRoute>
  );
}

function DefaultLanding() {
  const { user, initializing, actingClientId } = useAuth();
  if (initializing) return <Loader />;
  if (actingClientId) {
    return <Navigate to="/portal" replace />;
  }
  const role = user?.effective_role || user?.role;
  if (role === 'superadmin' || role === 'admin') {
    return <Navigate to="/client-hub" replace />;
  }
  if (role === 'client' && !user?.onboarding_completed_at) {
    return <Navigate to="/onboarding" replace />;
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
      path: 'shared-documents',
      element: (
        <AdminRoute>
          <SharedDocuments />
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
      path: 'onboarding',
      element: <ClientOnboarding />
    },
    {
      path: 'blogs',
      element: <BlogEditor />
    }
    ,
    {
      path: 'tasks',
      element: (
        <TaskRoute>
          <TaskManager />
        </TaskRoute>
      )
    },
    {
      path: 'forms',
      element: (
        <FormsRoute>
          <FormsManager />
        </FormsRoute>
      )
    }
  ]
};

export default MainRoutes;
