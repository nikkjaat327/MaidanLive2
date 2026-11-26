export const ACTIVE_MATCH_STORAGE_KEY = 'maidanlive_active_control_room_match_id';
export const ACTIVE_MATCH_CHANGED_EVENT = 'maidanlive:active_match_changed';
export const ACTIVE_MATCH_CHANNEL_NAME = 'maidanlive_active_match_channel';

let cachedBroadcastChannel: BroadcastChannel | null | undefined;
function getMatchBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (cachedBroadcastChannel !== undefined) return cachedBroadcastChannel;
  try {
    cachedBroadcastChannel = new BroadcastChannel(ACTIVE_MATCH_CHANNEL_NAME);
  } catch {
    cachedBroadcastChannel = null;
  }
  return cachedBroadcastChannel;
}

function getSafeStorages(): Storage[] {
  if (typeof window === 'undefined') return [];
  const storages: Storage[] = [];
  try {
    if (window.localStorage) storages.push(window.localStorage);
  } catch {
    // Ignore storage access errors in restricted iframes
  }
  try {
    if (window.sessionStorage) storages.push(window.sessionStorage);
  } catch {
    // Ignore storage access errors in restricted iframes
  }
  return storages;
}

function sanitizeStickyMatchId(raw: string | undefined | null): string {
  const normalized = typeof raw === 'string' ? raw.trim() : '';
  if (!normalized) return '';
  const lower = normalized.toLowerCase();
  if (lower === 'undefined' || lower === 'null' || lower === 'view') return '';
  return normalized;
}

export function getStickyMatchId(): string {
  for (const storage of getSafeStorages()) {
    try {
      const clean = sanitizeStickyMatchId(storage.getItem(ACTIVE_MATCH_STORAGE_KEY));
      if (clean) {
        return clean;
      }
    } catch {
      // Ignore read errors
    }
  }
  return '';
}

export function setStickyMatchId(matchId: string | undefined | null): string {
  const normalized = sanitizeStickyMatchId(matchId);
  if (!normalized) return '';

  const previous = getStickyMatchId();
  for (const storage of getSafeStorages()) {
    try {
      storage.setItem(ACTIVE_MATCH_STORAGE_KEY, normalized);
    } catch {
      // Ignore write errors
    }
  }

  if (typeof window !== 'undefined' && previous !== normalized) {
    try {
      window.dispatchEvent(
        new CustomEvent(ACTIVE_MATCH_CHANGED_EVENT, {
          detail: { matchId: normalized },
        })
      );
    } catch {
      // Ignore event dispatch errors
    }
    try {
      getMatchBroadcastChannel()?.postMessage({ matchId: normalized });
    } catch {
      // Ignore BroadcastChannel post errors
    }
  }

  return normalized;
}

export function clearStickyMatchId(): void {
  const previous = getStickyMatchId();
  for (const storage of getSafeStorages()) {
    try {
      storage.removeItem(ACTIVE_MATCH_STORAGE_KEY);
    } catch {
      // Ignore remove errors
    }
  }

  if (typeof window !== 'undefined' && previous) {
    try {
      window.dispatchEvent(
        new CustomEvent(ACTIVE_MATCH_CHANGED_EVENT, {
          detail: { matchId: '' },
        })
      );
    } catch {
      // Ignore event dispatch errors
    }
    try {
      getMatchBroadcastChannel()?.postMessage({ matchId: '' });
    } catch {
      // Ignore BroadcastChannel post errors
    }
  }
}

export function subscribeStickyMatchId(onChange: (matchId: string) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handleCustom = (ev: Event) => {
    const next = (ev as CustomEvent<{ matchId?: string }>).detail?.matchId ?? getStickyMatchId();
    onChange(next || '');
  };
  const handleStorage = (ev: StorageEvent) => {
    if (!ev.key || ev.key === ACTIVE_MATCH_STORAGE_KEY) {
      onChange((ev.newValue || getStickyMatchId() || '').trim());
    }
  };
  const channel = getMatchBroadcastChannel();
  const handleChannel = (ev: MessageEvent<{ matchId?: string }>) => {
    const incoming = typeof ev.data?.matchId === 'string' ? ev.data.matchId.trim() : '';
    if (incoming) {
      for (const storage of getSafeStorages()) {
        try {
          storage.setItem(ACTIVE_MATCH_STORAGE_KEY, incoming);
        } catch {
          // Ignore storage write errors
        }
      }
    }
    onChange(incoming);
  };

  window.addEventListener(ACTIVE_MATCH_CHANGED_EVENT, handleCustom);
  window.addEventListener('storage', handleStorage);
  channel?.addEventListener('message', handleChannel);

  return () => {
    window.removeEventListener(ACTIVE_MATCH_CHANGED_EVENT, handleCustom);
    window.removeEventListener('storage', handleStorage);
    channel?.removeEventListener('message', handleChannel);
  };
}

export interface StickyMatchCandidate {
  id: string;
  status?: string;
  broadcastPublished?: boolean;
}

/**
 * Resolves the match to show when a workspace loads:
 * 1. Explicit route matchId (if valid and in list, or even before list finishes loading)
 * 2. Previously selected sticky matchId stored across tabs/refreshes (ONLY if present in list)
 * 3. Initial fallback ONLY when user has not selected a match yet: LIVE -> first match
 *
 * Notice: Once a user selects a match, it stays sticky across all tabs and page refreshes
 * even if another match goes LIVE, until the user explicitly selects a different match.
 */
export function resolveStickyOrPreferredMatch<T extends StickyMatchCandidate>(
  routeMatchId: string | undefined,
  list: T[],
  storedMatchId: string = getStickyMatchId()
): string {
  const routeNormalized = typeof routeMatchId === 'string' ? routeMatchId.trim() : '';
  if (routeNormalized) {
    if (list.length === 0 || list.some((m) => m.id === routeNormalized)) {
      return routeNormalized;
    }
  }

  const storedNormalized = typeof storedMatchId === 'string' ? storedMatchId.trim() : '';
  if (storedNormalized && list.some((m) => m.id === storedNormalized)) {
    return storedNormalized;
  }

  if (list.length === 0) {
    return '';
  }

  const fallback =
    list.find((m) => m.status === 'LIVE' && m.broadcastPublished !== false) ||
    list.find((m) => m.status === 'LIVE') ||
    list[0];

  return fallback?.id || '';
}
