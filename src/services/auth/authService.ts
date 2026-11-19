import { AuthUser } from '../../types/index.ts';
import {
  ADMIN_TOKEN_KEY,
  CUSTOMER_TOKEN_KEY,
  adminApi,
  customerApi,
  publicApi,
} from '../api/httpClient.ts';

export interface AuthResponse {
  token: string;
  user: AuthUser;
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
  }): Promise<AuthResponse> {
    const { data } = await publicApi.post<AuthResponse>('/auth/register', payload);
    return data;
  },

  async loginCustomer(payload: { email: string; password: string }): Promise<AuthResponse> {
    const { data } = await publicApi.post<AuthResponse>('/auth/login', payload);
    return data;
  },

  async fetchCustomerProfile(): Promise<AuthUser> {
    const { data } = await customerApi.get<{ user: AuthUser }>('/auth/me');
    return data.user;
  },

  async updateCustomerProfile(payload: {
    name?: string;
    phone?: string;
    favoriteSport?: string;
  }): Promise<AuthUser> {
    const { data } = await customerApi.patch<{ user: AuthUser }>('/auth/me', payload);
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
    return data;
  },

  async loginAdmin(payload: { email: string; password: string }): Promise<AuthResponse> {
    const { data } = await publicApi.post<AuthResponse>('/auth/admin/login', payload);
    return data;
  },

  async fetchAdminProfile(): Promise<AuthUser> {
    const { data } = await adminApi.get<{ user: AuthUser; portal: string }>('/auth/me');
    if (data.portal !== 'admin') {
      throw new Error('Invalid portal session.');
    }
    return data.user;
  },

  async changeAdminPassword(payload: {
    currentPassword: string;
    newPassword: string;
  }): Promise<{ message: string }> {
    const { data } = await adminApi.patch<{ message: string }>('/auth/change-password', payload);
    return data;
  },

  saveCustomerToken(token: string) {
    window.localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
  },
  clearCustomerToken() {
    window.localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  },
  getCustomerToken(): string | null {
    return window.localStorage.getItem(CUSTOMER_TOKEN_KEY);
  },

  saveAdminToken(token: string) {
    window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
  },
  clearAdminToken() {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  },
  getAdminToken(): string | null {
    return window.localStorage.getItem(ADMIN_TOKEN_KEY);
  },
};
