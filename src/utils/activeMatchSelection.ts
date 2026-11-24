export const ACTIVE_MATCH_STORAGE_KEY = 'maidanlive_active_control_room_match_id';
export const ACTIVE_MATCH_CHANGED_EVENT = 'maidanlive:active_match_changed';

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

export function getStickyMatchId(): string {
  for (const storage of getSafeStorages()) {
    try {
      const value = storage.getItem(ACTIVE_MATCH_STORAGE_KEY);
      if (value && value.trim()) {
        return value.trim();
      }
    } catch {
      // Ignore read errors
    }
  }
  return '';
}

export function setStickyMatchId(matchId: string | undefined | null): string {
  const normalized = typeof matchId === 'string' ? matchId.trim() : '';
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
  }
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
