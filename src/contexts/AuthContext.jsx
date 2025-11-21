import PropTypes from 'prop-types';
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import * as authApi from 'api/auth';

export const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [impersonator, setImpersonator] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [actingClientId, setActingClientId] = useState(() => {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem('actingClientId');
  });

  const updateActingClient = useCallback((nextId) => {
    if (typeof window !== 'undefined') {
      if (nextId) {
        window.sessionStorage.setItem('actingClientId', nextId);
      } else {
        window.sessionStorage.removeItem('actingClientId');
      }
    }
    setActingClientId(nextId || null);
  }, []);

  useEffect(() => {
    authApi
      .fetchCurrentUser()
      .then((res) => {
        setUser(res.user);
        setImpersonator(res.impersonator || null);
      })
      .catch(() => setUser(null))
      .finally(() => setInitializing(false));
  }, []);

  const value = useMemo(
    () => ({
      user,
      impersonator,
      initializing,
      actingClientId,
      setActingClient: updateActingClient,
      clearActingClient: () => updateActingClient(null),
      login: async (payload) => {
        const res = await authApi.login(payload);
        setUser(res.user);
        setImpersonator(null);
        updateActingClient(null);
        return res.user;
      },
      register: async (payload) => {
        const res = await authApi.register(payload);
        setUser(res.user);
        setImpersonator(null);
        updateActingClient(null);
        return res.user;
      },
      impersonate: async (userId) => {
        const res = await authApi.impersonate(userId);
        setUser(res.user);
        setImpersonator(res.impersonator || null);
        updateActingClient(null);
        return res.user;
      },
      logout: async () => {
        await authApi.logout();
        setUser(null);
        setImpersonator(null);
        updateActingClient(null);
      }
    }),
    [user, impersonator, initializing, actingClientId, updateActingClient]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node
};
