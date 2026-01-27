import PropTypes from 'prop-types';
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import * as authApi from 'api/auth';
import { clearAccessToken, setAccessToken } from 'api/tokenStore';

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
      .refreshSession()
      .then((res) => {
        if (res?.accessToken) {
          setAccessToken(res.accessToken);
          setUser(res.user || null);
        } else {
          setUser(null);
        }
      })
      .catch(() => {
        clearAccessToken();
        setUser(null);
      })
      .finally(() => setInitializing(false));
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await authApi.fetchCurrentUser();
    setUser(res.user);
    setImpersonator(res.impersonator || null);
    return res.user;
  }, []);

  const value = useMemo(
    () => ({
      user,
      impersonator,
      initializing,
      actingClientId,
      setActingClient: updateActingClient,
      clearActingClient: () => updateActingClient(null),
      refreshUser,
      login: async (payload) => {
        const res = await authApi.login(payload);
        if (res?.requiresMfa) {
          return res;
        }
        if (res?.accessToken) {
          setAccessToken(res.accessToken);
        }
        setUser(res.user || null);
        setImpersonator(null);
        updateActingClient(null);
        return res.user;
      },
      // Set auth state directly (used after onboarding activation when tokens are returned without MFA)
      setAuthState: ({ user: newUser, accessToken }) => {
        if (accessToken) {
          setAccessToken(accessToken);
        }
        setUser(newUser || null);
        setImpersonator(null);
        updateActingClient(null);
      },
      register: async (payload) => {
        const res = await authApi.register(payload);
        if (res?.accessToken) {
          setAccessToken(res.accessToken);
        }
        setUser(res.user || null);
        setImpersonator(null);
        updateActingClient(null);
        return res.user;
      },
      impersonate: async (userId) => {
        const res = await authApi.impersonate(userId);
        if (res?.accessToken) {
          setAccessToken(res.accessToken);
        }
        setUser(res.user);
        setImpersonator(res.impersonator || null);
        updateActingClient(null);
        return res.user;
      },
      verifyMfa: async (payload) => {
        const res = await authApi.verifyMfa(payload);
        if (res?.accessToken) {
          setAccessToken(res.accessToken);
        }
        setUser(res.user || null);
        setImpersonator(null);
        updateActingClient(null);
        return res.user;
      },
      logout: async () => {
        await authApi.logout();
        clearAccessToken();
        setUser(null);
        setImpersonator(null);
        updateActingClient(null);
      }
    }),
    [user, impersonator, initializing, actingClientId, updateActingClient, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node
};
