import axios, { AxiosHeaders } from 'axios';

export const ADMIN_TOKEN_KEY = 'maidanlive_admin_token';
export const CUSTOMER_TOKEN_KEY = 'maidanlive_customer_token';
const CUSTOMER_REFRESH_KEY = 'maidanlive_customer_refresh_token';
const ADMIN_REFRESH_KEY = 'maidanlive_admin_refresh_token';

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

customerApi.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem(CUSTOMER_TOKEN_KEY) : null;
  if (token) {
    config.headers = AxiosHeaders.from(config.headers);
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

adminApi.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem(ADMIN_TOKEN_KEY) : null;
  if (token) {
    config.headers = AxiosHeaders.from(config.headers);
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

const inFlightRefreshes = new Map<string, Promise<string | null>>();

async function performSingleFlightRefresh(
  tokenKey: string,
  refreshKey: string,
  portal: 'admin' | 'customer'
): Promise<string | null> {
  const existing = inFlightRefreshes.get(tokenKey);
  if (existing) return existing;

  const promise = (async () => {
    const refreshToken = window.localStorage.getItem(refreshKey);
    if (!refreshToken) return null;

    try {
      const { data } = await publicApi.post<{ token?: string; refreshToken?: string }>(
        '/auth/refresh',
        { refreshToken }
      );
      if (data?.token) {
        window.localStorage.setItem(tokenKey, data.token);
        if (data.refreshToken) {
          window.localStorage.setItem(refreshKey, data.refreshToken);
        }
        return data.token;
      }
      return null;
    } catch (refreshErr) {
      if (axios.isAxiosError(refreshErr) && refreshErr.response?.status === 401) {
        window.localStorage.removeItem(tokenKey);
        window.localStorage.removeItem(refreshKey);
        window.dispatchEvent(
          new CustomEvent('maidanlive:auth-expired', { detail: { portal } })
        );
      }
      return null;
    } finally {
      inFlightRefreshes.delete(tokenKey);
    }
  })();

  inFlightRefreshes.set(tokenKey, promise);
  return promise;
}

function attachRefreshInterceptor(
  instance: typeof customerApi,
  tokenKey: string,
  refreshKey: string,
  portal: 'admin' | 'customer'
) {
  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error?.config;
      if (
        error?.response?.status === 401 &&
        original &&
        !original._retried &&
        typeof window !== 'undefined'
      ) {
        const refreshToken = window.localStorage.getItem(refreshKey);
        if (refreshToken) {
          original._retried = true;
          const nextToken = await performSingleFlightRefresh(tokenKey, refreshKey, portal);
          if (nextToken) {
            original.headers = AxiosHeaders.from(original.headers);
            original.headers.set('Authorization', `Bearer ${nextToken}`);
            return instance(original);
          }
        }
      }
      return Promise.reject(error);
    }
  );
}

attachRefreshInterceptor(customerApi, CUSTOMER_TOKEN_KEY, CUSTOMER_REFRESH_KEY, 'customer');
attachRefreshInterceptor(adminApi, ADMIN_TOKEN_KEY, ADMIN_REFRESH_KEY, 'admin');

export function extractApiError(err: unknown, fallback = 'Something went wrong.'): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (err.message) return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
