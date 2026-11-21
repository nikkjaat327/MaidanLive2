import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { LiveStreamData } from '../types/index.ts';
import { liveStreamService } from '../services/liveStream/liveStreamService.ts';
import { useAuth } from '../hooks/useAuth.ts';

interface LiveMonitorContextValue {
  isOpen: boolean;
  minimized: boolean;
  expanded: boolean;
  selectedStreamId: string;
  streams: LiveStreamData[];
  loadingStreams: boolean;
  openMonitor: (streamId?: string, streamSnapshot?: LiveStreamData) => void;
  closeMonitor: () => void;
  toggleMonitor: (streamId?: string, streamSnapshot?: LiveStreamData) => void;
  setSelectedStreamId: (streamId: string) => void;
  setMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  refreshStreams: () => Promise<void>;
}

const LiveMonitorContext = createContext<LiveMonitorContextValue | null>(null);

function upsertStreamSnapshot(
  prev: LiveStreamData[],
  snapshot?: LiveStreamData
): LiveStreamData[] {
  if (!snapshot) return prev;
  const sid = String(snapshot.id || snapshot._id || '');
  if (!sid) return prev;
  const exists = prev.some((s) => String(s.id || s._id || '') === sid);
  if (exists) {
    return prev.map((s) => (String(s.id || s._id || '') === sid ? snapshot : s));
  }
  return [snapshot, ...prev];
}

export function LiveMonitorProvider({ children }: { children: React.ReactNode }) {
  const { adminUser } = useAuth();
  const hasAdminSession = Boolean(adminUser);

  const [isOpen, setIsOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedStreamId, setSelectedStreamId] = useState('');
  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [loadingStreams, setLoadingStreams] = useState(false);

  const refreshStreams = useCallback(async () => {
    if (!hasAdminSession) {
      setStreams([]);
      return;
    }
    try {
      setLoadingStreams(true);
      const list = await liveStreamService.listStreams({ limit: 40 });
      const liveFirst = [...list].sort((a, b) => {
        const order: Record<string, number> = { LIVE: 0, UPCOMING: 1, ENDED: 2 };
        return (order[a.status] ?? 3) - (order[b.status] ?? 3);
      });
      setStreams((prev) => {
        if (liveFirst.length === 0 && prev.length > 0) return prev;
        return liveFirst;
      });
      setSelectedStreamId((prev) => {
        if (prev && liveFirst.some((s) => (s.id || s._id) === prev)) return prev;
        const firstLive = liveFirst.find((s) => s.status === 'LIVE') || liveFirst[0];
        return firstLive ? String(firstLive.id || firstLive._id || '') : prev;
      });
    } catch {
      // Keep prior snapshot cleanly on transient fetch failure
    } finally {
      setLoadingStreams(false);
    }
  }, [hasAdminSession]);

  useEffect(() => {
    if (!hasAdminSession && isOpen) {
      setIsOpen(false);
    }
  }, [hasAdminSession, isOpen]);

  useEffect(() => {
    if (isOpen && hasAdminSession) {
      refreshStreams();
    }
  }, [isOpen, hasAdminSession, refreshStreams]);

  const openMonitor = useCallback(
    (streamId?: string, streamSnapshot?: LiveStreamData) => {
      if (streamSnapshot) {
        setStreams((prev) => upsertStreamSnapshot(prev, streamSnapshot));
      }
      if (streamId) {
        setSelectedStreamId(streamId);
      }
      setMinimized(false);
      setIsOpen(true);
    },
    []
  );

  const closeMonitor = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleMonitor = useCallback(
    (streamId?: string, streamSnapshot?: LiveStreamData) => {
      if (streamSnapshot) {
        setStreams((prev) => upsertStreamSnapshot(prev, streamSnapshot));
      }
      if (streamId && streamId !== selectedStreamId) {
        setSelectedStreamId(streamId);
        setMinimized(false);
        setIsOpen(true);
        return;
      }
      setIsOpen((prev) => {
        if (!prev) setMinimized(false);
        return !prev;
      });
    },
    [selectedStreamId]
  );

  return (
    <LiveMonitorContext.Provider
      value={{
        isOpen,
        minimized,
        expanded,
        selectedStreamId,
        streams,
        loadingStreams,
        openMonitor,
        closeMonitor,
        toggleMonitor,
        setSelectedStreamId,
        setMinimized,
        setExpanded,
        refreshStreams,
      }}
    >
      {children}
    </LiveMonitorContext.Provider>
  );
}

export function useLiveMonitor(): LiveMonitorContextValue {
  const ctx = useContext(LiveMonitorContext);
  if (!ctx) {
    throw new Error('useLiveMonitor must be used inside LiveMonitorProvider');
  }
  return ctx;
}
