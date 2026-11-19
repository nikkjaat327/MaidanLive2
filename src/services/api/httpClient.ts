import axios from 'axios';

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
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

adminApi.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem(ADMIN_TOKEN_KEY) : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function attachRefreshInterceptor(
  instance: typeof customerApi,
  tokenKey: string,
  refreshKey: string
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
              original.headers = original.headers || {};
              original.headers.Authorization = `Bearer ${data.token}`;
              return instance(original);
            }
          } catch {
            // Refresh failed; let original 401 propagate
          }
        }
      }
      return Promise.reject(error);
    }
  );
}

attachRefreshInterceptor(customerApi, CUSTOMER_TOKEN_KEY, CUSTOMER_REFRESH_KEY);
attachRefreshInterceptor(adminApi, ADMIN_TOKEN_KEY, ADMIN_REFRESH_KEY);

export function extractApiError(err: unknown, fallback = 'Something went wrong.'): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (err.message) return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
