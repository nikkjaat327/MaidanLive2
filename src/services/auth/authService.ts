import { AuthUser, SecurityPolicyData, UserSessionData } from '../../types/index.ts';
import {
  ADMIN_REFRESH_KEY,
  ADMIN_TOKEN_KEY,
  ADMIN_USER_CACHE_KEY,
  CUSTOMER_REFRESH_KEY,
  CUSTOMER_TOKEN_KEY,
  CUSTOMER_USER_CACHE_KEY,
  adminApi,
  customerApi,
  ensureFreshPortalToken,
  performSingleFlightRefresh,
  publicApi,
} from '../api/httpClient.ts';

export { CUSTOMER_REFRESH_KEY, ADMIN_REFRESH_KEY };

export interface AuthResponse {
  token: string;
  refreshToken?: string;
  user: AuthUser;
  requires2FA?: boolean;
  challengeToken?: string;
  message?: string;
}

export interface SetupStatusResponse {
  needsSetup: boolean;
  requiresSetupKey: boolean;
}

export const authService = {
  async registerCustomer(payload: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    favoriteSport?: string;
    role?: 'SPECTATOR' | 'CAPTAIN';
  }): Promise<AuthResponse> {
    const { data } = await publicApi.post<AuthResponse>('/auth/register', payload);
    if (data.refreshToken) this.saveCustomerRefreshToken(data.refreshToken);
    if (data.user) this.saveCustomerUserCache(data.user);
    return data;
  },

  async loginCustomer(payload: {
    email: string;
    password: string;
    totpCode?: string;
  }): Promise<AuthResponse> {
    const { data } = await publicApi.post<AuthResponse>('/auth/login', payload);
    if (data.refreshToken) this.saveCustomerRefreshToken(data.refreshToken);
    if (data.user) this.saveCustomerUserCache(data.user);
    return data;
  },

  async fetchCustomerProfile(): Promise<AuthUser> {
    const { data } = await customerApi.get<{ user: AuthUser }>('/auth/me');
    this.saveCustomerUserCache(data.user);
    return data.user;
  },

  async updateCustomerProfile(payload: {
    name?: string;
    phone?: string;
    favoriteSport?: string;
  }): Promise<AuthUser> {
    const { data } = await customerApi.patch<{ user: AuthUser }>('/auth/me', payload);
    this.saveCustomerUserCache(data.user);
    return data.user;
  },

  async changeCustomerPassword(payload: {
    currentPassword: string;
    newPassword: string;
  }): Promise<{ message: string }> {
    const { data } = await customerApi.patch<{ message: string }>('/auth/change-password', payload);
    return data;
  },

  async getAdminSetupStatus(): Promise<SetupStatusResponse> {
    const { data } = await publicApi.get<SetupStatusResponse>('/auth/admin/setup-status');
    return data;
  },

  async bootstrapSuperAdmin(payload: {
    name: string;
    email: string;
    password: string;
    setupKey?: string;
  }): Promise<AuthResponse> {
    const { data } = await publicApi.post<AuthResponse>('/auth/admin/bootstrap', payload);
    if (data.refreshToken) this.saveAdminRefreshToken(data.refreshToken);
    if (data.user) this.saveAdminUserCache(data.user);
    return data;
  },

  async loginAdmin(payload: {
    email: string;
    password: string;
    totpCode?: string;
  }): Promise<AuthResponse> {
    const { data } = await publicApi.post<AuthResponse>('/auth/admin/login', payload);
    if (data.refreshToken) this.saveAdminRefreshToken(data.refreshToken);
    if (data.user) this.saveAdminUserCache(data.user);
    return data;
  },

  async fetchAdminProfile(): Promise<AuthUser> {
    const { data } = await adminApi.get<{ user: AuthUser; portal: string }>('/auth/me');
    if (data.portal !== 'admin') {
      throw new Error('Invalid portal session.');
    }
    this.saveAdminUserCache(data.user);
    return data.user;
  },

  async changeAdminPassword(payload: {
    currentPassword: string;
    newPassword: string;
  }): Promise<{ message: string }> {
    const { data } = await adminApi.patch<{ message: string }>('/auth/change-password', payload);
    return data;
  },

  async refreshAccessToken(portal: 'admin' | 'customer'): Promise<AuthResponse | null> {
    const tokenKey = portal === 'admin' ? ADMIN_TOKEN_KEY : CUSTOMER_TOKEN_KEY;
    const refreshKey = portal === 'admin' ? ADMIN_REFRESH_KEY : CUSTOMER_REFRESH_KEY;
    const result = await performSingleFlightRefresh(tokenKey, refreshKey, portal, { force: true });
    if (!result?.token) return null;
    return {
      token: result.token,
      refreshToken: result.refreshToken,
      user: result.user,
    };
  },

  async ensureFreshCustomerToken(): Promise<string | null> {
    return ensureFreshPortalToken('customer');
  },

  async ensureFreshAdminToken(): Promise<string | null> {
    return ensureFreshPortalToken('admin');
  },

  async logoutSession(portal: 'admin' | 'customer'): Promise<void> {
    const client = portal === 'admin' ? adminApi : customerApi;
    const refreshToken =
      portal === 'admin' ? this.getAdminRefreshToken() : this.getCustomerRefreshToken();
    try {
      await client.post('/auth/logout', { refreshToken });
    } catch {
      // Ignore logout network error when clearing client session
    }
  },

  async logoutAllSessions(portal: 'admin' | 'customer'): Promise<void> {
    const client = portal === 'admin' ? adminApi : customerApi;
    await client.post('/auth/logout-all');
  },

  async listSessions(portal: 'admin' | 'customer' = 'admin'): Promise<UserSessionData[]> {
    const client = portal === 'admin' ? adminApi : customerApi;
    const { data } = await client.get<{ sessions: UserSessionData[] }>('/auth/sessions');
    return data.sessions;
  },

  async revokeSession(sessionId: string, portal: 'admin' | 'customer' = 'admin'): Promise<void> {
    const client = portal === 'admin' ? adminApi : customerApi;
    await client.delete(`/auth/sessions/${sessionId}`);
  },

  async forgotPassword(email: string): Promise<{ message: string; resetToken?: string }> {
    const { data } = await publicApi.post<{ message: string; resetToken?: string }>(
      '/auth/forgot-password',
      { email }
    );
    return data;
  },

  async resetPassword(payload: {
    token: string;
    newPassword: string;
  }): Promise<{ message: string }> {
    const { data } = await publicApi.post<{ message: string }>('/auth/reset-password', payload);
    return data;
  },

  async setup2FA(portal: 'admin' | 'customer' = 'admin'): Promise<{
    manualSecret: string;
    otpAuthUri: string;
    qrDataUrl: string;
  }> {
    const client = portal === 'admin' ? adminApi : customerApi;
    const { data } = await client.post('/auth/2fa/setup');
    return data;
  },

  async verify2FA(
    code: string,
    portal: 'admin' | 'customer' = 'admin'
  ): Promise<{ ok: boolean; user: AuthUser }> {
    const client = portal === 'admin' ? adminApi : customerApi;
    const { data } = await client.post('/auth/2fa/verify-enable', { code });
    return data;
  },

  async disable2FA(
    password: string,
    portal: 'admin' | 'customer' = 'admin'
  ): Promise<{ ok: boolean; user: AuthUser }> {
    const client = portal === 'admin' ? adminApi : customerApi;
    const { data } = await client.post('/auth/2fa/disable', { password });
    return data;
  },

  async getSecurityPolicy(): Promise<{
    policy: SecurityPolicyData;
    availablePermissions: string[];
  }> {
    const { data } = await adminApi.get<{
      policy: SecurityPolicyData;
      availablePermissions: string[];
    }>('/auth/admin/security-policy');
    return data;
  },

  async updateSecurityPolicy(payload: Partial<SecurityPolicyData>): Promise<SecurityPolicyData> {
    const { data } = await adminApi.patch<{ policy: SecurityPolicyData }>(
      '/auth/admin/security-policy',
      payload
    );
    return data.policy;
  },

  async listRoleAssignments(userId?: string): Promise<any[]> {
    const { data } = await adminApi.get<{ assignments: any[] }>('/auth/admin/role-assignments', {
      params: userId ? { userId } : undefined,
    });
    return data.assignments;
  },

  async createRoleAssignment(payload: {
    userId: string;
    role: string;
    scopeType: 'global' | 'tournament' | 'match' | 'team';
    scopeId?: string;
    permissions: string[];
  }): Promise<any> {
    const { data } = await adminApi.post('/auth/admin/role-assignments', payload);
    return data.assignment;
  },

  async deleteRoleAssignment(id: string): Promise<void> {
    await adminApi.delete(`/auth/admin/role-assignments/${id}`);
  },

  saveCustomerToken(token: string) {
    window.localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
  },
  clearCustomerToken() {
    window.localStorage.removeItem(CUSTOMER_TOKEN_KEY);
    window.localStorage.removeItem(CUSTOMER_REFRESH_KEY);
    window.localStorage.removeItem(CUSTOMER_USER_CACHE_KEY);
  },
  getCustomerToken(): string | null {
    return window.localStorage.getItem(CUSTOMER_TOKEN_KEY);
  },
  saveCustomerRefreshToken(token: string) {
    window.localStorage.setItem(CUSTOMER_REFRESH_KEY, token);
  },
  getCustomerRefreshToken(): string | null {
    return window.localStorage.getItem(CUSTOMER_REFRESH_KEY);
  },
  saveCustomerUserCache(user: AuthUser) {
    try {
      window.localStorage.setItem(CUSTOMER_USER_CACHE_KEY, JSON.stringify(user));
    } catch {
      // Ignore storage quota errors
    }
  },
  getCustomerUserCache(): AuthUser | null {
    try {
      const hasSession =
        Boolean(window.localStorage.getItem(CUSTOMER_TOKEN_KEY)) ||
        Boolean(window.localStorage.getItem(CUSTOMER_REFRESH_KEY));
      if (!hasSession) return null;
      const raw = window.localStorage.getItem(CUSTOMER_USER_CACHE_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  },

  saveAdminToken(token: string) {
    window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
  },
  clearAdminToken() {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    window.localStorage.removeItem(ADMIN_REFRESH_KEY);
    window.localStorage.removeItem(ADMIN_USER_CACHE_KEY);
  },
  getAdminToken(): string | null {
    return window.localStorage.getItem(ADMIN_TOKEN_KEY);
  },
  saveAdminRefreshToken(token: string) {
    window.localStorage.setItem(ADMIN_REFRESH_KEY, token);
  },
  getAdminRefreshToken(): string | null {
    return window.localStorage.getItem(ADMIN_REFRESH_KEY);
  },
  saveAdminUserCache(user: AuthUser) {
    try {
      window.localStorage.setItem(ADMIN_USER_CACHE_KEY, JSON.stringify(user));
    } catch {
      // Ignore storage quota errors
    }
  },
  getAdminUserCache(): AuthUser | null {
    try {
      const hasSession =
        Boolean(window.localStorage.getItem(ADMIN_TOKEN_KEY)) ||
        Boolean(window.localStorage.getItem(ADMIN_REFRESH_KEY));
      if (!hasSession) return null;
      const raw = window.localStorage.getItem(ADMIN_USER_CACHE_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  },
};
