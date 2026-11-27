import type { CorsOptions, CorsOptionsDelegate } from 'cors';
import type { Request } from 'express';

const CAPACITOR_ALLOWED_ORIGINS = new Set([
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'https://localhost',
]);

const LOCAL_DEV_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

function normalizeOrigin(raw: string): string | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  if (CAPACITOR_ALLOWED_ORIGINS.has(trimmed.toLowerCase())) {
    return trimmed.toLowerCase();
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

export function getAllowedOriginsList(): string[] {
  const explicit = (process.env.ALLOWED_ORIGINS || '').trim();
  if (!explicit) return [];

  const rawEntries = [
    ...explicit.split(','),
    process.env.PUBLIC_APP_URL || '',
    process.env.VITE_PUBLIC_APP_URL || '',
    process.env.APP_URL || '',
    process.env.SHARED_APP_URL || '',
  ];

  const out = new Set<string>();
  for (const entry of rawEntries) {
    const norm = normalizeOrigin(entry);
    if (norm) out.add(norm);
  }
  return Array.from(out);
}

export function isOriginAllowed(origin?: string, requestHost?: string): boolean {
  // Requests without Origin header (same-origin navigation, curl, native apps, OBS Bridge)
  if (!origin) return true;

  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;

  if (CAPACITOR_ALLOWED_ORIGINS.has(normalized)) return true;
  if (LOCAL_DEV_ORIGIN_RE.test(normalized)) return true;

  // Always allow same-host browser requests (e.g. POST/PATCH from the hosted web app itself)
  if (requestHost) {
    try {
      const originHost = new URL(normalized).host.toLowerCase();
      const cleanReqHost = requestHost.split(',')[0].trim().toLowerCase();
      if (cleanReqHost && originHost === cleanReqHost) {
        return true;
      }
    } catch {
      // Fall through
    }
  }

  const configured = getAllowedOriginsList();
  if (configured.length > 0) {
    return configured.includes(normalized);
  }

  // If ALLOWED_ORIGINS is not explicitly pinned, allow HTTPS/HTTP web origins
  // while reflecting the specific origin (never wildcard '*')
  return normalized.startsWith('https://') || normalized.startsWith('http://');
}

export const corsOriginDelegate: CorsOptions['origin'] = (origin, callback) => {
  if (isOriginAllowed(origin)) {
    callback(null, true);
  } else {
    callback(new Error(`Origin not allowed by CORS policy: ${origin || 'unknown'}`));
  }
};

export const expressCorsOptionsDelegate: CorsOptionsDelegate<Request> = (req, callback) => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  const rawHost =
    (typeof req.headers['x-forwarded-host'] === 'string' && req.headers['x-forwarded-host']) ||
    (typeof req.headers.host === 'string' && req.headers.host) ||
    '';

  if (isOriginAllowed(origin, rawHost)) {
    callback(null, { origin: true, credentials: true });
  } else {
    callback(new Error(`Origin not allowed by CORS policy: ${origin || 'unknown'}`));
  }
};
