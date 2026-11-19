import React, { createContext, useCallback, useEffect, useState } from 'react';
import { AuthUser, NotificationData } from '../types/index.ts';
import { authService } from '../services/auth/authService.ts';
import { platformOpsService } from '../services/platformOps/platformOpsService.ts';
import { getSocketClient } from '../services/socket/socketClient.ts';

interface AuthContextValue {
  customerUser: AuthUser | null;
  customerLoading: boolean;
  adminUser: AuthUser | null;
  adminLoading: boolean;
  unreadNotifications: number;
  refreshNotifications: () => Promise<void>;
  updateCustomerUser: (user: AuthUser) => void;
  loginCustomer: (email: string, password: string) => Promise<AuthUser>;
  registerCustomer: (payload: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    favoriteSport?: string;
  }) => Promise<AuthUser>;
  logoutCustomer: () => void;
  refreshCustomer: () => Promise<void>;
  loginAdmin: (email: string, password: string) => Promise<AuthUser>;
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

  const refreshNotifications = useCallback(async () => {
    const token = authService.getCustomerToken();
    if (!token) {
      setUnreadNotifications(0);
      return;
    }
    try {
      const res = await platformOpsService.listNotifications();
      setUnreadNotifications(res.unreadCount || 0);
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
      setAdminLoading(false);
      return;
    }
    try {
      const user = await authService.fetchAdminProfile();
      setAdminUser(user);
    } catch {
      authService.clearAdminToken();
      setAdminUser(null);
    } finally {
      setAdminLoading(false);
    }
  }, []);

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

  const updateCustomerUser = useCallback((user: AuthUser) => {
    setCustomerUser(user);
  }, []);

  const loginCustomer = useCallback(
    async (email: string, password: string) => {
      const res = await authService.loginCustomer({ email, password });
      authService.saveCustomerToken(res.token);
      setCustomerUser(res.user);
      refreshNotifications();
      return res.user;
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
    authService.clearCustomerToken();
    setCustomerUser(null);
    setUnreadNotifications(0);
  }, []);

  const loginAdmin = useCallback(async (email: string, password: string) => {
    const res = await authService.loginAdmin({ email, password });
    authService.saveAdminToken(res.token);
    setAdminUser(res.user);
    return res.user;
  }, []);

  const bootstrapSuperAdmin = useCallback(
    async (payload: { name: string; email: string; password: string; setupKey?: string }) => {
      const res = await authService.bootstrapSuperAdmin(payload);
      authService.saveAdminToken(res.token);
      setAdminUser(res.user);
      return res.user;
    },
    []
  );

  const logoutAdmin = useCallback(() => {
    authService.clearAdminToken();
    setAdminUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        customerUser,
        customerLoading,
        adminUser,
        adminLoading,
        unreadNotifications,
        refreshNotifications,
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
