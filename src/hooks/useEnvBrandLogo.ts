import { useEffect, useState } from 'react';
import { publicApi } from '../services/api/httpClient.ts';
import { ENV_BRAND_LOGO_URL, sanitizeBrandLogoUrl } from '../utils/overlayConfig.ts';

let cachedServerLogo: string | null = ENV_BRAND_LOGO_URL
  ? sanitizeBrandLogoUrl(ENV_BRAND_LOGO_URL)
  : null;
let inflightPromise: Promise<string> | null = null;
const subscribers = new Set<(url: string) => void>();

function notifyAll(url: string) {
  subscribers.forEach((cb) => cb(url));
}

async function loadEnvBrandLogoFromHealth(): Promise<string> {
  if (ENV_BRAND_LOGO_URL) {
    const safe = sanitizeBrandLogoUrl(ENV_BRAND_LOGO_URL);
    cachedServerLogo = safe;
    return safe;
  }
  if (cachedServerLogo !== null) return cachedServerLogo;
  if (typeof window === 'undefined') return '';
  if (!inflightPromise) {
    inflightPromise = publicApi
      .get<{ brandLogoUrl?: string }>('/health', { params: { lite: 1 } })
      .then((res) => {
        const next = sanitizeBrandLogoUrl(res.data?.brandLogoUrl);
        cachedServerLogo = next;
        notifyAll(next);
        return next;
      })
      .catch(() => {
        cachedServerLogo = '';
        return '';
      })
      .finally(() => {
        inflightPromise = null;
      });
  }
  return inflightPromise;
}

/**
 * Resolves the brand logo URL strictly from .env (VITE_BRAND_LOGO_URL or server BRAND_LOGO_URL).
 * Returns '' if no .env logo is configured — never falls back to hardcoded or custom logos.
 */
export function useEnvBrandLogo(explicitServerLogoUrl?: string | null): string {
  const safeExplicit = sanitizeBrandLogoUrl(explicitServerLogoUrl);
  const safeBuildEnv = sanitizeBrandLogoUrl(ENV_BRAND_LOGO_URL);
  const initial = safeBuildEnv || safeExplicit || cachedServerLogo || '';
  const [logoUrl, setLogoUrl] = useState<string>(initial);

  useEffect(() => {
    if (safeBuildEnv) {
      setLogoUrl(safeBuildEnv);
      return;
    }
    if (safeExplicit) {
      setLogoUrl(safeExplicit);
      return;
    }
    if (cachedServerLogo !== null) {
      setLogoUrl(cachedServerLogo);
      return;
    }

    const listener = (resolved: string) => setLogoUrl(resolved);
    subscribers.add(listener);
    void loadEnvBrandLogoFromHealth().then((resolved) => {
      setLogoUrl(resolved);
    });
    return () => {
      subscribers.delete(listener);
    };
  }, [safeBuildEnv, safeExplicit]);

  return safeBuildEnv || safeExplicit || logoUrl;
}
