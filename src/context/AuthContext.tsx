import React, { createContext, useCallback, useEffect, useState } from 'react';
import { AuthUser, NotificationData } from '../types/index.ts';
import { authService } from '../services/auth/authService.ts';
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
  const [customerUser, setCustomerUser] = useState<AuthUser | null>(null);
  const [customerLoading, setCustomerLoading] = useState(true);
  const [adminUser, setAdminUser] = useState<AuthUser | null>(null);
  const [adminLoading, setAdminLoading] = useState(true);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [adminUnreadNotifications, setAdminUnreadNotifications] = useState(0);

  const refreshNotifications = useCallback(async () => {
    const token = authService.getCustomerToken();
    if (!token) {
      setUnreadNotifications(0);
      return;
    }
    try {
      const res = await platformOpsService.listNotifications('customer');
      setUnreadNotifications(res.unreadCount || 0);
    } catch {
      // Non-blocking
    }
  }, []);

  const refreshAdminNotifications = useCallback(async () => {
    const token = authService.getAdminToken();
    if (!token) {
      setAdminUnreadNotifications(0);
      return;
    }
    try {
      const res = await platformOpsService.listNotifications('admin');
      setAdminUnreadNotifications(res.unreadCount || 0);
    } catch {
      // Non-blocking
    }
  }, []);

  const refreshCustomer = useCallback(async () => {
    const token = authService.getCustomerToken();
    if (!token) {
      setCustomerUser(null);
      setUnreadNotifications(0);
      setCustomerLoading(false);
      return;
    }
    try {
      const user = await authService.fetchCustomerProfile();
      setCustomerUser(user);
      refreshNotifications();
    } catch {
      authService.clearCustomerToken();
      setCustomerUser(null);
      setUnreadNotifications(0);
    } finally {
      setCustomerLoading(false);
    }
  }, [refreshNotifications]);

  const refreshAdmin = useCallback(async () => {
    const token = authService.getAdminToken();
    if (!token) {
      setAdminUser(null);
      setAdminUnreadNotifications(0);
      setAdminLoading(false);
      return;
    }
    try {
      const user = await authService.fetchAdminProfile();
      setAdminUser(user);
      refreshAdminNotifications();
    } catch {
      authService.clearAdminToken();
      setAdminUser(null);
      setAdminUnreadNotifications(0);
    } finally {
      setAdminLoading(false);
    }
  }, [refreshAdminNotifications]);

  useEffect(() => {
    refreshCustomer();
    refreshAdmin();
  }, [refreshCustomer, refreshAdmin]);

  useEffect(() => {
    const token = authService.getCustomerToken();
    if (!customerUser || !token) return;

    const socket = getSocketClient();
    socket.emit('user:join', token);

    const onReconnect = () => {
      socket.emit('user:join', token);
    };

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

    socket.on('connect', onReconnect);
    socket.on('notification:new', onNewNotification);
    return () => {
      socket.off('connect', onReconnect);
      socket.off('notification:new', onNewNotification);
    };
  }, [customerUser]);

  useEffect(() => {
    const token = authService.getAdminToken();
    if (!adminUser || !token) return;

    const socket = getSocketClient();
    socket.emit('user:join', token);

    const onReconnect = () => {
      socket.emit('user:join', token);
    };
    const onNewAdminNotification = () => {
      refreshAdminNotifications();
    };

    socket.on('connect', onReconnect);
    socket.on('notification:new', onNewAdminNotification);
    return () => {
      socket.off('connect', onReconnect);
      socket.off('notification:new', onNewAdminNotification);
    };
  }, [adminUser, refreshAdminNotifications]);

  const updateCustomerUser = useCallback((user: AuthUser) => {
    setCustomerUser(user);
  }, []);

  const loginCustomer = useCallback(
    async (email: string, password: string, totpCode?: string): Promise<LoginResult> => {
      const res = await authService.loginCustomer({ email, password, totpCode });
      if (res.requires2FA) {
        return { requires2FA: true, message: res.message };
      }
      authService.saveCustomerToken(res.token);
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
      setCustomerUser(res.user);
      setUnreadNotifications(0);
      return res.user;
    },
    []
  );

  const logoutCustomer = useCallback(() => {
    authService.logoutSession('customer').catch(() => {});
    authService.clearCustomerToken();
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
