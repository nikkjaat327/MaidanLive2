const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function parseValidHttpOrigin(raw?: string): string | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.origin.replace(/\/+$/, '');
    }
  } catch {
    // Invalid URL
  }
  return null;
}

export function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  };
  if (typeof win.Capacitor?.isNativePlatform === 'function') {
    try {
      if (win.Capacitor.isNativePlatform()) return true;
    } catch {
      // Ignore bridge probe failure
    }
  }
  const proto = window.location?.protocol || '';
  return proto === 'capacitor:' || proto === 'ionic:';
}

export function getBackendOrigin(): string {
  const apiOrigin = parseValidHttpOrigin(import.meta.env.VITE_API_URL as string | undefined);
  if (apiOrigin) return apiOrigin;

  const socketOrigin = parseValidHttpOrigin(import.meta.env.VITE_SOCKET_URL as string | undefined);
  if (socketOrigin) return socketOrigin;

  const publicOrigin = parseValidHttpOrigin(import.meta.env.VITE_PUBLIC_APP_URL as string | undefined);
  if (publicOrigin) return publicOrigin;

  if (typeof window !== 'undefined' && window.location?.origin && !isCapacitorNative()) {
    return window.location.origin.replace(/\/+$/, '');
  }

  return '';
}

export function getConfiguredApiBaseUrl(): string {
  const configuredApi = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/+$/, '');
  if (configuredApi) {
    return configuredApi.endsWith('/api') ? configuredApi : `${configuredApi}/api`;
  }

  if (isCapacitorNative()) {
    const fallbackOrigin = getBackendOrigin();
    if (fallbackOrigin) {
      return `${fallbackOrigin}/api`;
    }
  }

  return '/api';
}

export function getSocketOrigin(): string {
  const configuredSocket = parseValidHttpOrigin(
    import.meta.env.VITE_SOCKET_URL as string | undefined
  );
  if (configuredSocket) return configuredSocket;

  const apiOrigin = parseValidHttpOrigin(import.meta.env.VITE_API_URL as string | undefined);
  if (apiOrigin) return apiOrigin;

  if (isCapacitorNative()) {
    const publicOrigin = parseValidHttpOrigin(
      import.meta.env.VITE_PUBLIC_APP_URL as string | undefined
    );
    if (publicOrigin) return publicOrigin;
  }

  return '';
}

export function getPublicWebOrigin(): string {
  const candidates = [
    import.meta.env.VITE_PUBLIC_APP_URL as string | undefined,
    import.meta.env.VITE_API_URL as string | undefined,
    import.meta.env.VITE_SOCKET_URL as string | undefined,
  ];

  for (const raw of candidates) {
    const origin = parseValidHttpOrigin(raw);
    if (!origin) continue;
    try {
      const parsed = new URL(origin);
      if (!LOCALHOST_HOSTS.has(parsed.hostname.toLowerCase())) {
        return origin;
      }
    } catch {
      // Ignore
    }
  }

  if (typeof window !== 'undefined' && window.location?.origin && !isCapacitorNative()) {
    return window.location.origin.replace(/\/+$/, '');
  }

  return 'https://maidanlive.app';
}

export function resolveApiUrl(apiSubPath: string): string {
  const cleanSubPath = apiSubPath.startsWith('/') ? apiSubPath : `/${apiSubPath}`;
  const normalizedSubPath = cleanSubPath.startsWith('/api/')
    ? cleanSubPath.slice(4)
    : cleanSubPath === '/api'
      ? ''
      : cleanSubPath;
  const base = getConfiguredApiBaseUrl().replace(/\/+$/, '');
  if (base.startsWith('http://') || base.startsWith('https://')) {
    return `${base}${normalizedSubPath}`;
  }
  const origin =
    typeof window !== 'undefined' && window.location?.origin && !isCapacitorNative()
      ? window.location.origin.replace(/\/+$/, '')
      : getBackendOrigin();
  return `${origin}${base}${normalizedSubPath}`;
}
