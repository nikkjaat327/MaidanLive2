import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { AuthUser, NotificationData } from '../types/index.ts';
import { authService } from '../services/auth/authService.ts';
import {
  ADMIN_REFRESH_KEY,
  ADMIN_TOKEN_KEY,
  ADMIN_USER_CACHE_KEY,
  CUSTOMER_REFRESH_KEY,
  CUSTOMER_TOKEN_KEY,
  CUSTOMER_USER_CACHE_KEY,
  getJwtRemainingMs,
} from '../services/api/httpClient.ts';
import { platformOpsService } from '../services/platformOps/platformOpsService.ts';
import { getSocketClient } from '../services/socket/socketClient.ts';

interface LoginResult {
  user?: AuthUser;
  requires2FA?: boolean;
  message?: string;
}

interface AuthContextValue {
  customerUser: AuthUser | null;
  customerLoading: boolean;
  adminUser: AuthUser | null;
  adminLoading: boolean;
  authNotice: string | null;
  clearAuthNotice: () => void;
  unreadNotifications: number;
  adminUnreadNotifications: number;
  refreshNotifications: () => Promise<void>;
  refreshAdminNotifications: () => Promise<void>;
  updateCustomerUser: (user: AuthUser) => void;
  loginCustomer: (email: string, password: string, totpCode?: string) => Promise<LoginResult>;
  registerCustomer: (payload: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    favoriteSport?: string;
    role?: 'SPECTATOR' | 'CAPTAIN';
  }) => Promise<AuthUser>;
  logoutCustomer: () => void;
  refreshCustomer: () => Promise<void>;
  loginAdmin: (email: string, password: string, totpCode?: string) => Promise<LoginResult>;
  bootstrapSuperAdmin: (payload: {
    name: string;
    email: string;
    password: string;
    setupKey?: string;
  }) => Promise<AuthUser>;
  logoutAdmin: () => void;
  refreshAdmin: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [customerUser, setCustomerUser] = useState<AuthUser | null>(() =>
    typeof window !== 'undefined' ? authService.getCustomerUserCache() : null
  );
  const [customerLoading, setCustomerLoading] = useState(true);
  const [adminUser, setAdminUser] = useState<AuthUser | null>(() =>
    typeof window !== 'undefined' ? authService.getAdminUserCache() : null
  );
  const [adminLoading, setAdminLoading] = useState(true);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [adminUnreadNotifications, setAdminUnreadNotifications] = useState(0);

  const customerUserRef = useRef<AuthUser | null>(customerUser);
  customerUserRef.current = customerUser;
  const adminUserRef = useRef<AuthUser | null>(adminUser);
  adminUserRef.current = adminUser;

  const customerRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const adminRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const notifRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const adminNotifRefreshInFlightRef = useRef<Promise<void> | null>(null);

  const clearAuthNotice = useCallback(() => setAuthNotice(null), []);

  const refreshNotifications = useCallback(async () => {
    if (notifRefreshInFlightRef.current) return notifRefreshInFlightRef.current;
    const promise = (async () => {
      const hasSession =
        Boolean(authService.getCustomerToken()) || Boolean(authService.getCustomerRefreshToken());
      if (!hasSession) {
        setUnreadNotifications(0);
        return;
      }
      try {
        const res = await platformOpsService.listNotifications('customer');
        setUnreadNotifications(res.unreadCount || 0);
      } catch {
        // Non-blocking
      }
    })().finally(() => {
      notifRefreshInFlightRef.current = null;
    });
    notifRefreshInFlightRef.current = promise;
    return promise;
  }, []);

  const refreshAdminNotifications = useCallback(async () => {
    if (adminNotifRefreshInFlightRef.current) return adminNotifRefreshInFlightRef.current;
    const promise = (async () => {
      const hasSession =
        Boolean(authService.getAdminToken()) || Boolean(authService.getAdminRefreshToken());
      if (!hasSession) {
        setAdminUnreadNotifications(0);
        return;
      }
      try {
        const res = await platformOpsService.listNotifications('admin');
        setAdminUnreadNotifications(res.unreadCount || 0);
      } catch {
        // Non-blocking
      }
    })().finally(() => {
      adminNotifRefreshInFlightRef.current = null;
    });
    adminNotifRefreshInFlightRef.current = promise;
    return promise;
  }, []);

  const refreshCustomer = useCallback(async () => {
    if (customerRefreshInFlightRef.current) return customerRefreshInFlightRef.current;
    const promise = (async () => {
      const token = await authService.ensureFreshCustomerToken();
      const refreshToken = authService.getCustomerRefreshToken();
      if (!token && !refreshToken) {
        setCustomerUser(null);
        setUnreadNotifications(0);
        setCustomerLoading(false);
        return;
      }
      try {
        const user = await authService.fetchCustomerProfile();
        setCustomerUser(user);
        refreshNotifications();
      } catch (err) {
        const stillHasRefresh = Boolean(authService.getCustomerRefreshToken());
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        if (!stillHasRefresh || status === 401 || status === 403) {
          if (!stillHasRefresh) {
            authService.clearCustomerToken();
            setCustomerUser(null);
            setUnreadNotifications(0);
          }
        }
        // On network / 5xx error with an active refreshToken, preserve cached customerUser
      } finally {
        setCustomerLoading(false);
      }
    })().finally(() => {
      customerRefreshInFlightRef.current = null;
    });
    customerRefreshInFlightRef.current = promise;
    return promise;
  }, [refreshNotifications]);

  const refreshAdmin = useCallback(async () => {
    if (adminRefreshInFlightRef.current) return adminRefreshInFlightRef.current;
    const promise = (async () => {
      const token = await authService.ensureFreshAdminToken();
      const refreshToken = authService.getAdminRefreshToken();
      if (!token && !refreshToken) {
        setAdminUser(null);
        setAdminUnreadNotifications(0);
        setAdminLoading(false);
        return;
      }
      try {
        const user = await authService.fetchAdminProfile();
        setAdminUser(user);
        refreshAdminNotifications();
      } catch (err) {
        const stillHasRefresh = Boolean(authService.getAdminRefreshToken());
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        const invalidPortal = err instanceof Error && err.message === 'Invalid portal session.';
        if (invalidPortal || !stillHasRefresh || (status === 401 && !stillHasRefresh) || status === 403) {
          authService.clearAdminToken();
          setAdminUser(null);
          setAdminUnreadNotifications(0);
        }
      } finally {
        setAdminLoading(false);
      }
    })().finally(() => {
      adminRefreshInFlightRef.current = null;
    });
    adminRefreshInFlightRef.current = promise;
    return promise;
  }, [refreshAdminNotifications]);

  useEffect(() => {
    refreshCustomer();
    refreshAdmin();

    const onAuthExpired = (ev: Event) => {
      const portal = (ev as CustomEvent<{ portal?: 'admin' | 'customer' }>)?.detail?.portal;
      if (portal === 'admin') {
        authService.clearAdminToken();
        setAdminUser(null);
        setAdminUnreadNotifications(0);
      } else if (portal === 'customer') {
        authService.clearCustomerToken();
        setCustomerUser(null);
        setUnreadNotifications(0);
        setAuthNotice('Your session expired. Please sign in again to continue.');
      }
    };

    const onWakeOrOnline = () => {
      const custRefresh = authService.getCustomerRefreshToken();
      const custToken = authService.getCustomerToken();
      if (custRefresh && (!custToken || getJwtRemainingMs(custToken) < 5 * 60_000)) {
        refreshCustomer();
      }
      const admRefresh = authService.getAdminRefreshToken();
      const admToken = authService.getAdminToken();
      if (admRefresh && (!admToken || getJwtRemainingMs(admToken) < 5 * 60_000)) {
        refreshAdmin();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        onWakeOrOnline();
      }
    };

    const onStorageSync = (e: StorageEvent) => {
      if (e.key === CUSTOMER_REFRESH_KEY && !e.newValue) {
        setCustomerUser(null);
        setUnreadNotifications(0);
      } else if (e.key === CUSTOMER_USER_CACHE_KEY) {
        setCustomerUser(e.newValue ? (JSON.parse(e.newValue) as AuthUser) : null);
      } else if (e.key === CUSTOMER_TOKEN_KEY && e.newValue && !customerUserRef.current) {
        refreshCustomer();
      }

      if (e.key === ADMIN_REFRESH_KEY && !e.newValue) {
        setAdminUser(null);
        setAdminUnreadNotifications(0);
      } else if (e.key === ADMIN_USER_CACHE_KEY) {
        setAdminUser(e.newValue ? (JSON.parse(e.newValue) as AuthUser) : null);
      } else if (e.key === ADMIN_TOKEN_KEY && e.newValue && !adminUserRef.current) {
        refreshAdmin();
      }
    };

    window.addEventListener('maidanlive:auth-expired', onAuthExpired);
    window.addEventListener('online', onWakeOrOnline);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('storage', onStorageSync);

    return () => {
      window.removeEventListener('maidanlive:auth-expired', onAuthExpired);
      window.removeEventListener('online', onWakeOrOnline);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('storage', onStorageSync);
    };
  }, [refreshCustomer, refreshAdmin]);

  useEffect(() => {
    if (!customerUser) return;

    const socket = getSocketClient();
    const joinCustomerRoom = () => {
      authService.ensureFreshCustomerToken().then((freshToken) => {
        if (freshToken) {
          socket.emit('user:join', freshToken);
        }
      });
    };

    joinCustomerRoom();

    const onNewNotification = (payload: { notification?: NotificationData }) => {
      setUnreadNotifications((c) => c + 1);
      if (
        payload?.notification &&
        customerUser.notificationPreferences?.browserPushEnabled &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        window.Notification.permission === 'granted'
      ) {
        try {
          new window.Notification(payload.notification.title, {
            body: payload.notification.message,
          });
        } catch {
          // Ignore browser notification restrictions
        }
      }
    };

    socket.on('connect', joinCustomerRoom);
    socket.on('notification:new', onNewNotification);
    return () => {
      socket.off('connect', joinCustomerRoom);
      socket.off('notification:new', onNewNotification);
    };
  }, [customerUser?.id, customerUser?.notificationPreferences?.browserPushEnabled]);

  useEffect(() => {
    if (!adminUser) return;

    const socket = getSocketClient();
    const joinAdminRoom = () => {
      authService.ensureFreshAdminToken().then((freshToken) => {
        if (freshToken) {
          socket.emit('user:join', freshToken);
        }
      });
    };

    joinAdminRoom();

    const onNewAdminNotification = () => {
      refreshAdminNotifications();
    };

    socket.on('connect', joinAdminRoom);
    socket.on('notification:new', onNewAdminNotification);
    return () => {
      socket.off('connect', joinAdminRoom);
      socket.off('notification:new', onNewAdminNotification);
    };
  }, [adminUser?.id, refreshAdminNotifications]);

  const updateCustomerUser = useCallback((user: AuthUser) => {
    authService.saveCustomerUserCache(user);
    setCustomerUser(user);
  }, []);

  const loginCustomer = useCallback(
    async (email: string, password: string, totpCode?: string): Promise<LoginResult> => {
      const res = await authService.loginCustomer({ email, password, totpCode });
      if (res.requires2FA) {
        return { requires2FA: true, message: res.message };
      }
      authService.saveCustomerToken(res.token);
      authService.saveCustomerUserCache(res.user);
      setAuthNotice(null);
      setCustomerUser(res.user);
      refreshNotifications();
      return { user: res.user };
    },
    [refreshNotifications]
  );

  const registerCustomer = useCallback(
    async (payload: {
      name: string;
      email: string;
      password: string;
      phone?: string;
      favoriteSport?: string;
      role?: 'SPECTATOR' | 'CAPTAIN';
    }) => {
      const res = await authService.registerCustomer(payload);
      authService.saveCustomerToken(res.token);
      authService.saveCustomerUserCache(res.user);
      setAuthNotice(null);
      setCustomerUser(res.user);
      setUnreadNotifications(0);
      return res.user;
    },
    []
  );

  const logoutCustomer = useCallback(() => {
    authService.logoutSession('customer').catch(() => {});
    authService.clearCustomerToken();
    setAuthNotice(null);
    setCustomerUser(null);
    setUnreadNotifications(0);
  }, []);

  const loginAdmin = useCallback(
    async (email: string, password: string, totpCode?: string): Promise<LoginResult> => {
      const res = await authService.loginAdmin({ email, password, totpCode });
      if (res.requires2FA) {
        return { requires2FA: true, message: res.message };
      }
      authService.saveAdminToken(res.token);
      authService.saveAdminUserCache(res.user);
      setAdminUser(res.user);
      refreshAdminNotifications();
      return { user: res.user };
    },
    [refreshAdminNotifications]
  );

  const bootstrapSuperAdmin = useCallback(
    async (payload: { name: string; email: string; password: string; setupKey?: string }) => {
      const res = await authService.bootstrapSuperAdmin(payload);
      authService.saveAdminToken(res.token);
      authService.saveAdminUserCache(res.user);
      setAdminUser(res.user);
      setAdminUnreadNotifications(0);
      return res.user;
    },
    []
  );

  const logoutAdmin = useCallback(() => {
    authService.logoutSession('admin').catch(() => {});
    authService.clearAdminToken();
    setAdminUser(null);
    setAdminUnreadNotifications(0);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        customerUser,
        customerLoading,
        adminUser,
        adminLoading,
        authNotice,
        clearAuthNotice,
        unreadNotifications,
        adminUnreadNotifications,
        refreshNotifications,
        refreshAdminNotifications,
        updateCustomerUser,
        loginCustomer,
        registerCustomer,
        logoutCustomer,
        refreshCustomer,
        loginAdmin,
        bootstrapSuperAdmin,
        logoutAdmin,
        refreshAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
