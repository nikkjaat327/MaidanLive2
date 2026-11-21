import axios, { AxiosHeaders } from 'axios';

export const ADMIN_TOKEN_KEY = 'maidanlive_admin_token';
export const CUSTOMER_TOKEN_KEY = 'maidanlive_customer_token';
export const CUSTOMER_REFRESH_KEY = 'maidanlive_customer_refresh_token';
export const ADMIN_REFRESH_KEY = 'maidanlive_admin_refresh_token';
export const CUSTOMER_USER_CACHE_KEY = 'maidanlive_customer_user_cache';
export const ADMIN_USER_CACHE_KEY = 'maidanlive_admin_user_cache';

export const publicApi = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

export const customerApi = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

export const adminApi = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

export function getJwtRemainingMs(token: string | null | undefined): number {
  if (!token || typeof token !== 'string') return 0;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return 0;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(padLen);
    const json = atob(padded);
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== 'number') return 0;
    return payload.exp * 1000 - Date.now();
  } catch {
    return 0;
  }
}

export interface RefreshSessionResult {
  token?: string;
  refreshToken?: string;
  sessionId?: string;
  user?: any;
}

const inFlightRefreshes = new Map<string, Promise<RefreshSessionResult | null>>();

function clearPortalStorage(tokenKey: string, refreshKey: string, portal: 'admin' | 'customer') {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(tokenKey);
  window.localStorage.removeItem(refreshKey);
  window.localStorage.removeItem(
    portal === 'admin' ? ADMIN_USER_CACHE_KEY : CUSTOMER_USER_CACHE_KEY
  );
}

async function runWithCrossTabLock<T>(lockName: string, fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(lockName, fn);
  }
  return fn();
}

export async function performSingleFlightRefresh(
  tokenKey: string,
  refreshKey: string,
  portal: 'admin' | 'customer',
  options?: { force?: boolean }
): Promise<RefreshSessionResult | null> {
  if (typeof window === 'undefined') return null;

  const existing = inFlightRefreshes.get(tokenKey);
  if (existing) return existing;

  const promise = runWithCrossTabLock(`maidanlive_refresh_${portal}`, async () => {
    const currentToken = window.localStorage.getItem(tokenKey);
    const refreshToken = window.localStorage.getItem(refreshKey);
    if (!refreshToken) return null;

    // Another tab may have rotated and stored a fresh token while we waited for the Web Lock
    if (!options?.force && currentToken && getJwtRemainingMs(currentToken) > 120_000) {
      return { token: currentToken, refreshToken };
    }

    try {
      const { data } = await publicApi.post<RefreshSessionResult>('/auth/refresh', {
        refreshToken,
      });
      if (data?.token) {
        window.localStorage.setItem(tokenKey, data.token);
        if (data.refreshToken) {
          window.localStorage.setItem(refreshKey, data.refreshToken);
        }
        if (data.user) {
          try {
            window.localStorage.setItem(
              portal === 'admin' ? ADMIN_USER_CACHE_KEY : CUSTOMER_USER_CACHE_KEY,
              JSON.stringify(data.user)
            );
          } catch {
            // Ignore quota errors
          }
        }
        return data;
      }
      return null;
    } catch (refreshErr) {
      if (
        axios.isAxiosError(refreshErr) &&
        (refreshErr.response?.status === 401 || refreshErr.response?.status === 403)
      ) {
        clearPortalStorage(tokenKey, refreshKey, portal);
        window.dispatchEvent(
          new CustomEvent('maidanlive:auth-expired', { detail: { portal } })
        );
      }
      return null;
    }
  }).finally(() => {
    inFlightRefreshes.delete(tokenKey);
  });

  inFlightRefreshes.set(tokenKey, promise);
  return promise;
}

export async function ensureFreshPortalToken(
  portal: 'admin' | 'customer',
  minRemainingMs = 120_000
): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const tokenKey = portal === 'admin' ? ADMIN_TOKEN_KEY : CUSTOMER_TOKEN_KEY;
  const refreshKey = portal === 'admin' ? ADMIN_REFRESH_KEY : CUSTOMER_REFRESH_KEY;

  const currentToken = window.localStorage.getItem(tokenKey);
  if (currentToken && getJwtRemainingMs(currentToken) > minRemainingMs) {
    return currentToken;
  }
  const refreshToken = window.localStorage.getItem(refreshKey);
  if (!refreshToken) {
    return currentToken;
  }
  const refreshed = await performSingleFlightRefresh(tokenKey, refreshKey, portal);
  return refreshed?.token || window.localStorage.getItem(tokenKey);
}

function attachAuthInterceptors(
  instance: typeof customerApi,
  tokenKey: string,
  refreshKey: string,
  portal: 'admin' | 'customer'
) {
  instance.interceptors.request.use(async (config) => {
    if (typeof window === 'undefined') return config;
    let token = window.localStorage.getItem(tokenKey);
    const refreshToken = window.localStorage.getItem(refreshKey);
    const isLogoutReq = typeof config.url === 'string' && config.url.includes('/auth/logout');

    if (!isLogoutReq && refreshToken && (!token || getJwtRemainingMs(token) < 60_000)) {
      const refreshed = await performSingleFlightRefresh(tokenKey, refreshKey, portal);
      if (refreshed?.token) {
        token = refreshed.token;
      }
    }

    if (token) {
      config.headers = AxiosHeaders.from(config.headers);
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error?.config;
      const isLogoutReq = typeof original?.url === 'string' && original.url.includes('/auth/logout');
      if (
        error?.response?.status === 401 &&
        original &&
        !original._retried &&
        !isLogoutReq &&
        typeof window !== 'undefined'
      ) {
        const refreshToken = window.localStorage.getItem(refreshKey);
        if (refreshToken) {
          original._retried = true;
          const refreshed = await performSingleFlightRefresh(tokenKey, refreshKey, portal, {
            force: true,
          });
          if (refreshed?.token) {
            original.headers = AxiosHeaders.from(original.headers);
            original.headers.set('Authorization', `Bearer ${refreshed.token}`);
            return instance(original);
          }
        }
      }
      return Promise.reject(error);
    }
  );
}

attachAuthInterceptors(customerApi, CUSTOMER_TOKEN_KEY, CUSTOMER_REFRESH_KEY, 'customer');
attachAuthInterceptors(adminApi, ADMIN_TOKEN_KEY, ADMIN_REFRESH_KEY, 'admin');

export function extractApiError(err: unknown, fallback = 'Something went wrong.'): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (err.message) return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
