import { useCallback, useEffect, useState } from 'react';
import { LiveStreamData } from '../types/index.ts';

const SPOILER_FREE_STORAGE_KEY = 'maidanlive_spoiler_free_mode';
const REMINDERS_STORAGE_KEY = 'maidanlive_match_reminders_v1';

export const SPOILER_FREE_EVENT = 'maidanlive:spoiler-free-changed';
export const MATCH_REMINDERS_EVENT = 'maidanlive:match-reminders-changed';

export interface StoredMatchReminder {
  matchId: string;
  title: string;
  sport: string;
  matchDate: string | null;
  createdAt: string;
  notifiedUpcomingAt?: string;
  notifiedLiveAt?: string;
}

export function getSpoilerFreePreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SPOILER_FREE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setSpoilerFreePreference(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SPOILER_FREE_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage quota / private mode restrictions
  }
  window.dispatchEvent(new CustomEvent(SPOILER_FREE_EVENT, { detail: { enabled } }));
}

export function useSpoilerFreeMode() {
  const [spoilerFree, setSpoilerFreeState] = useState<boolean>(() => getSpoilerFreePreference());

  useEffect(() => {
    const sync = () => setSpoilerFreeState(getSpoilerFreePreference());
    window.addEventListener(SPOILER_FREE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SPOILER_FREE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setSpoilerFree = useCallback((next: boolean) => {
    setSpoilerFreePreference(next);
    setSpoilerFreeState(next);
  }, []);

  const toggleSpoilerFree = useCallback(() => {
    setSpoilerFreePreference(!getSpoilerFreePreference());
  }, []);

  return { spoilerFree, setSpoilerFree, toggleSpoilerFree };
}

export function getStoredMatchReminders(): StoredMatchReminder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(REMINDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StoredMatchReminder =>
        Boolean(item && typeof item === 'object' && typeof item.matchId === 'string')
    );
  } catch {
    return [];
  }
}

function writeStoredMatchReminders(items: StoredMatchReminder[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(items.slice(0, 40)));
  } catch {
    // Ignore storage errors
  }
  window.dispatchEvent(new CustomEvent(MATCH_REMINDERS_EVENT));
}

export function markReminderNotified(
  matchId: string,
  kind: 'upcoming' | 'live'
): void {
  const current = getStoredMatchReminders();
  const nowIso = new Date().toISOString();
  let changed = false;
  const next = current.map((item) => {
    if (item.matchId !== matchId) return item;
    if (kind === 'upcoming' && !item.notifiedUpcomingAt) {
      changed = true;
      return { ...item, notifiedUpcomingAt: nowIso };
    }
    if (kind === 'live' && !item.notifiedLiveAt) {
      changed = true;
      return { ...item, notifiedLiveAt: nowIso };
    }
    return item;
  });
  if (changed) {
    writeStoredMatchReminders(next);
  }
}

export function useMatchReminders() {
  const [reminders, setReminders] = useState<StoredMatchReminder[]>(() =>
    getStoredMatchReminders()
  );

  useEffect(() => {
    const sync = () => setReminders(getStoredMatchReminders());
    window.addEventListener(MATCH_REMINDERS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(MATCH_REMINDERS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const isReminded = useCallback(
    (matchId?: string | null) =>
      Boolean(matchId && reminders.some((item) => item.matchId === matchId)),
    [reminders]
  );

  const toggleReminder = useCallback(
    async (stream: Pick<LiveStreamData, 'id' | 'matchTitle' | 'teamAName' | 'teamBName' | 'gameName' | 'matchDate'>) => {
      const current = getStoredMatchReminders();
      const exists = current.some((item) => item.matchId === stream.id);
      if (exists) {
        writeStoredMatchReminders(current.filter((item) => item.matchId !== stream.id));
        return false;
      }

      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        window.Notification.permission === 'default'
      ) {
        try {
          await window.Notification.requestPermission();
        } catch {
          // Safe fallback to in-app banner
        }
      }

      const title =
        stream.matchTitle ||
        [stream.teamAName, stream.teamBName].filter(Boolean).join(' vs ') ||
        'Upcoming Match';

      const entry: StoredMatchReminder = {
        matchId: stream.id,
        title,
        sport: stream.gameName || 'Match',
        matchDate: stream.matchDate || null,
        createdAt: new Date().toISOString(),
      };
      writeStoredMatchReminders([entry, ...current]);
      return true;
    },
    []
  );

  const removeReminder = useCallback((matchId: string) => {
    const current = getStoredMatchReminders();
    writeStoredMatchReminders(current.filter((item) => item.matchId !== matchId));
  }, []);

  return { reminders, isReminded, toggleReminder, removeReminder };
}
