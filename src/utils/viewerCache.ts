import type { LiveScoreData } from '../types/index.ts';

const CACHE_PREFIX = 'ml_vcache_v1:';
const INDEX_KEY = 'ml_vcache_v1_index';
const MAX_CACHE_ENTRIES = 24;
const DEFAULT_TTL_MS = 5 * 60 * 1000;

interface CacheEnvelope<T> {
  storedAt: number;
  data: T;
}

function readIndex(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function writeIndex(keys: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(keys.slice(-MAX_CACHE_ENTRIES)));
  } catch {
    // Ignore storage quota errors
  }
}

export function getCachedViewerData<T>(key: string, maxAgeMs = DEFAULT_TTL_MS): T | null {
  if (typeof window === 'undefined' || !key) return null;
  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.storedAt !== 'number') return null;
    if (Date.now() - parsed.storedAt > maxAgeMs) {
      window.localStorage.removeItem(`${CACHE_PREFIX}${key}`);
      return null;
    }
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export function setCachedViewerData<T>(key: string, data: T): void {
  if (typeof window === 'undefined' || !key) return;
  try {
    const envelope: CacheEnvelope<T> = {
      storedAt: Date.now(),
      data,
    };
    window.localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(envelope));
    const idx = readIndex().filter((k) => k !== key);
    idx.push(key);
    while (idx.length > MAX_CACHE_ENTRIES) {
      const oldest = idx.shift();
      if (oldest) {
        window.localStorage.removeItem(`${CACHE_PREFIX}${oldest}`);
      }
    }
    writeIndex(idx);
  } catch {
    // Ignore storage quota errors
  }
}

export function removeCachedViewerData(key: string): void {
  if (typeof window === 'undefined' || !key) return;
  try {
    window.localStorage.removeItem(`${CACHE_PREFIX}${key}`);
    writeIndex(readIndex().filter((k) => k !== key));
  } catch {
    // Ignore errors
  }
}

function parseTimestampMs(val: unknown): number {
  if (typeof val !== 'string' || !val) return 0;
  const parsed = Date.parse(val);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Ensures stale cached snapshots never overwrite fresher live WebSocket or API score updates.
 */
export function pickFresherScore(
  current: LiveScoreData | null,
  incoming: LiveScoreData | null,
  options?: { allowOlder?: boolean }
): LiveScoreData | null {
  if (!incoming) return current;
  if (!current) return incoming;
  if (options?.allowOlder) return incoming;

  const currentTs = parseTimestampMs(current.lastUpdatedAt);
  const incomingTs = parseTimestampMs(incoming.lastUpdatedAt);
  if (currentTs > 0 && incomingTs > 0 && incomingTs < currentTs) {
    return current;
  }
  return incoming;
}
