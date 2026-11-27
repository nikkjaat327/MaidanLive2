import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveScoreData, ScoreHistoryItem, StreamingProvider } from '../types/index.ts';
import { scoreboardService } from '../services/scoreboard/scoreboardService.ts';
import { extractApiError } from '../services/api/httpClient.ts';
import {
  recordSocketDiagEvent,
  type ScoreDiagTraceServer,
} from '../utils/realtimeDiagnostics.ts';
import { useSocket } from './useSocket.ts';

export interface ProviderSwitchEventPayload {
  streamId: string;
  fromProvider: StreamingProvider;
  toProvider: StreamingProvider;
  activeStreamingProvider: StreamingProvider;
  youtubeVideoId?: string;
  mediamtxPlaybackUrl?: string;
  mediamtxWebrtcUrl?: string;
  switchedAt?: string;
  switchedByName?: string;
  reason?: string;
  stream?: any;
  eventId?: string;
  sequence?: number;
}

export function useScoreboard(
  streamId?: string,
  options?: {
    skipInitialFetch?: boolean;
    onProviderChanged?: (payload: ProviderSwitchEventPayload) => void;
    onViewerCountUpdated?: (viewers: number | null, visibility: string) => void;
  }
) {
  const [score, setScore] = useState<LiveScoreData | null>(null);
  const [history, setHistory] = useState<ScoreHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(streamId));
  const [error, setError] = useState<string | null>(null);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const lastSequenceRef = useRef<number>(0);
  const lastBootIdRef = useRef<string | null>(null);

  const onProviderChangedRef = useRef(options?.onProviderChanged);
  const onViewerCountUpdatedRef = useRef(options?.onViewerCountUpdated);
  onProviderChangedRef.current = options?.onProviderChanged;
  onViewerCountUpdatedRef.current = options?.onViewerCountUpdated;
  const skipInitialFetch = Boolean(options?.skipInitialFetch);

  const fetchScoreAndHistory = useCallback(async () => {
    if (!streamId) return;
    try {
      setError(null);
      const [scoreData, historyData] = await Promise.all([
        scoreboardService.getScore(streamId),
        scoreboardService.getScoreHistory(streamId),
      ]);
      setScore(scoreData);
      setHistory(historyData);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load scoreboard.'));
    } finally {
      setLoading(false);
    }
  }, [streamId]);

  const refreshHistoryOnly = useCallback(async () => {
    if (!streamId) return;
    try {
      const historyData = await scoreboardService.getScoreHistory(streamId);
      setHistory(historyData);
    } catch {
      // Non-blocking fallback
    }
  }, [streamId]);

  const addHistoryItem = useCallback((item?: ScoreHistoryItem) => {
    if (!item || !item._id) return;
    setHistory((prev) => {
      if (prev.some((h) => h._id === item._id)) return prev;
      return [item, ...prev].slice(0, 100);
    });
  }, []);

  const applyUndoHistory = useCallback(
    (payload?: {
      revertedHistoryId?: string;
      deletedHistoryId?: string | null;
      undoHistoryItem?: ScoreHistoryItem | null;
    }) => {
      if (!payload) return false;
      const { revertedHistoryId, deletedHistoryId, undoHistoryItem } = payload;
      if (!revertedHistoryId && !deletedHistoryId && !undoHistoryItem) {
        return false;
      }
      setHistory((prev) => {
        let next = prev;
        if (deletedHistoryId) {
          next = next.filter((h) => h._id !== deletedHistoryId);
        } else if (revertedHistoryId) {
          next = next.map((h) => (h._id === revertedHistoryId ? { ...h, reverted: true } : h));
        }
        if (undoHistoryItem && undoHistoryItem._id && !next.some((h) => h._id === undoHistoryItem._id)) {
          next = [undoHistoryItem, ...next];
        }
        return next.slice(0, 100);
      });
      return true;
    },
    []
  );

  const { connected, socket } = useSocket(streamId, fetchScoreAndHistory);
  const wasDisconnectedRef = useRef(false);

  useEffect(() => {
    if (!connected) {
      wasDisconnectedRef.current = true;
    }
  }, [connected]);

  useEffect(() => {
    if (!streamId || typeof document === 'undefined') return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && (!socket.connected || wasDisconnectedRef.current)) {
        wasDisconnectedRef.current = false;
        void fetchScoreAndHistory();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [streamId, socket, fetchScoreAndHistory]);

  useEffect(() => {
    seenEventIdsRef.current.clear();
    lastSequenceRef.current = 0;
    lastBootIdRef.current = null;
    if (!streamId) {
      setScore(null);
      setHistory([]);
      setLoading(false);
      return;
    }
    if (skipInitialFetch) {
      return;
    }
    setLoading(true);
    fetchScoreAndHistory();
  }, [streamId, fetchScoreAndHistory, skipInitialFetch]);

  // 25s viewer heartbeat for accurate active session tracking
  useEffect(() => {
    if (!streamId) return;
    let sessionKey = '';
    try {
      sessionKey = window.sessionStorage.getItem('maidanlive_viewer_session') || '';
      if (!sessionKey) {
        sessionKey = `v_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        window.sessionStorage.setItem('maidanlive_viewer_session', sessionKey);
      }
    } catch {
      sessionKey = `v_${Date.now()}`;
    }

    socket.emit('viewer:join', { targetType: 'stream', targetId: streamId, sessionKey });
    const hb = window.setInterval(() => {
      if (socket.connected) {
        socket.emit('viewer:heartbeat', { targetType: 'stream', targetId: streamId, sessionKey });
      }
    }, 25_000);

    return () => {
      window.clearInterval(hb);
      socket.emit('viewer:leave', { targetType: 'stream', targetId: streamId, sessionKey });
    };
  }, [streamId, socket]);

  // REST polling fallback (every 7s) ONLY when socket disconnected AND tab is visible
  useEffect(() => {
    if (!streamId || connected) return;
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchScoreAndHistory();
      }
    }, 7000);
    return () => window.clearInterval(poll);
  }, [streamId, connected, fetchScoreAndHistory]);

  useEffect(() => {
    if (!streamId) return;

    const shouldAcceptEvent = (payload: any, enforceOrder = true): boolean => {
      const dedupeId = payload?.logicalEventId || payload?.eventId;
      if (dedupeId) {
        if (seenEventIdsRef.current.has(dedupeId)) return false;
        seenEventIdsRef.current.add(dedupeId);
        if (seenEventIdsRef.current.size > 400) {
          const first = seenEventIdsRef.current.values().next().value;
          if (first) seenEventIdsRef.current.delete(first);
        }
      }
      if (payload?.serverBootId && payload.serverBootId !== lastBootIdRef.current) {
        lastBootIdRef.current = payload.serverBootId;
        lastSequenceRef.current = 0;
      }
      if (enforceOrder && typeof payload?.sequence === 'number') {
        if (payload.sequence < lastSequenceRef.current) return false;
        lastSequenceRef.current = payload.sequence;
      }
      return true;
    };

    const handleScoreUpdated = (payload: {
      streamId: string;
      score: LiveScoreData;
      historyItem?: ScoreHistoryItem;
      correctedEventId?: string;
      logicalEventId?: string;
      eventId?: string;
      sequence?: number;
      emittedAt?: string;
      diag?: ScoreDiagTraceServer;
    }) => {
      if (payload.streamId !== streamId) return;
      if (!shouldAcceptEvent(payload, true)) return;
      recordSocketDiagEvent(payload, 'client');
      setScore(payload.score);
      if (payload.historyItem) {
        setHistory((prev) => {
          const updatedPrev = payload.correctedEventId
            ? prev.map((item) =>
                item._id === payload.correctedEventId ? { ...item, reverted: true } : item
              )
            : prev;
          if (updatedPrev.some((h) => h._id === payload.historyItem!._id)) return updatedPrev;
          return [payload.historyItem!, ...updatedPrev].slice(0, 100);
        });
      }
    };

    const handleScoreUndo = (payload: {
      streamId: string;
      score: LiveScoreData;
      revertedHistoryId?: string;
      deletedHistoryId?: string | null;
      undoHistoryItem?: ScoreHistoryItem | null;
      logicalEventId?: string;
      eventId?: string;
      sequence?: number;
      emittedAt?: string;
      diag?: ScoreDiagTraceServer;
    }) => {
      if (payload.streamId !== streamId) return;
      if (!shouldAcceptEvent(payload, true)) return;
      recordSocketDiagEvent(payload, 'client');
      setScore(payload.score);
      if (!applyUndoHistory(payload)) {
        scoreboardService.getScoreHistory(streamId).then(setHistory).catch(() => {});
      }
    };

    const handleScoreReset = (payload: {
      streamId: string;
      score: LiveScoreData;
      resetHistoryItem?: ScoreHistoryItem;
      logicalEventId?: string;
      eventId?: string;
      sequence?: number;
    }) => {
      if (payload.streamId !== streamId) return;
      if (!shouldAcceptEvent(payload, true)) return;
      setScore(payload.score);
      if (payload.resetHistoryItem) {
        addHistoryItem(payload.resetHistoryItem);
      } else {
        scoreboardService.getScoreHistory(streamId).then(setHistory).catch(() => {});
      }
    };

    const handleCommentaryAdded = (payload: {
      streamId: string;
      commentary?: ScoreHistoryItem;
      eventId?: string;
    }) => {
      if (payload.streamId !== streamId || !payload.commentary) return;
      if (!shouldAcceptEvent(payload, false)) return;
      setHistory((prev) => {
        if (prev.some((h) => h._id === payload.commentary!._id)) return prev;
        return [payload.commentary!, ...prev].slice(0, 100);
      });
    };

    const handleCommentaryDeleted = (payload: {
      streamId?: string;
      commentaryId?: string;
    }) => {
      if (payload?.streamId !== streamId || !payload.commentaryId) return;
      setHistory((prev) => prev.filter((h) => h._id !== payload.commentaryId));
    };

    const handleTimelineUpdated = (payload: {
      streamId: string;
      historyItem?: ScoreHistoryItem;
      deletedCommentaryId?: string;
    }) => {
      if (payload.streamId !== streamId) return;
      if (payload.deletedCommentaryId) {
        setHistory((prev) => prev.filter((h) => h._id !== payload.deletedCommentaryId));
        return;
      }
      if (!payload.historyItem?._id) return;
      addHistoryItem(payload.historyItem);
    };

    const handleResultEvent = (payload: {
      streamId: string;
      score: LiveScoreData;
      historyItem?: ScoreHistoryItem;
      eventId?: string;
      sequence?: number;
      emittedAt?: string;
      diag?: ScoreDiagTraceServer;
    }) => {
      if (payload.streamId !== streamId) return;
      if (!shouldAcceptEvent(payload, true)) return;
      recordSocketDiagEvent(payload, 'client');
      setScore(payload.score);
      if (payload.historyItem) {
        setHistory((prev) => {
          if (prev.some((h) => h._id === payload.historyItem!._id)) return prev;
          return [payload.historyItem!, ...prev].slice(0, 100);
        });
      }
    };

    const handleProviderChanged = (payload: ProviderSwitchEventPayload) => {
      if (payload.streamId !== streamId) return;
      if (!shouldAcceptEvent(payload, false)) return;
      onProviderChangedRef.current?.(payload);
    };

    const handleViewersUpdated = (payload: {
      streamId?: string;
      targetId?: string;
      viewers: number | null;
      visibility?: string;
    }) => {
      const target = payload.streamId || payload.targetId;
      if (target !== streamId) return;
      onViewerCountUpdatedRef.current?.(payload.viewers, payload.visibility || 'public');
    };

    socket.on('score:updated', handleScoreUpdated);
    socket.on('score:event:created', handleScoreUpdated);
    socket.on('score:event:corrected', handleScoreUpdated);
    socket.on('kabaddi:state', handleScoreUpdated);
    socket.on('kabaddi:timer', handleScoreUpdated);
    socket.on('kabaddi:settings_updated', handleScoreUpdated);
    socket.on('kabaddi:match_completed', handleResultEvent);
    socket.on('cricket:innings_completed', handleScoreUpdated);
    socket.on('cricket:second_innings_started', handleScoreUpdated);
    socket.on('cricket:match_completed', handleResultEvent);
    socket.on('volleyball:rules_updated', handleScoreUpdated);
    socket.on('volleyball:match_completed', handleResultEvent);
    socket.on('volleyball:match_reopened', handleResultEvent);
    socket.on('score:undo', handleScoreUndo);
    socket.on('score:reset', handleScoreReset);
    socket.on('commentary:added', handleCommentaryAdded);
    socket.on('commentary:deleted', handleCommentaryDeleted);
    socket.on('match:timeline:updated', handleTimelineUpdated);
    socket.on('match:result:declared', handleResultEvent);
    socket.on('match:result:updated', handleResultEvent);
    socket.on('streaming_provider_changed', handleProviderChanged);
    socket.on('stream:viewers', handleViewersUpdated);
    socket.on('viewer:count_updated', handleViewersUpdated);

    return () => {
      socket.off('score:updated', handleScoreUpdated);
      socket.off('score:event:created', handleScoreUpdated);
      socket.off('score:event:corrected', handleScoreUpdated);
      socket.off('kabaddi:state', handleScoreUpdated);
      socket.off('kabaddi:timer', handleScoreUpdated);
      socket.off('kabaddi:settings_updated', handleScoreUpdated);
      socket.off('kabaddi:match_completed', handleResultEvent);
      socket.off('cricket:innings_completed', handleScoreUpdated);
      socket.off('cricket:second_innings_started', handleScoreUpdated);
      socket.off('cricket:match_completed', handleResultEvent);
      socket.off('volleyball:rules_updated', handleScoreUpdated);
      socket.off('volleyball:match_completed', handleResultEvent);
      socket.off('volleyball:match_reopened', handleResultEvent);
      socket.off('score:undo', handleScoreUndo);
      socket.off('score:reset', handleScoreReset);
      socket.off('commentary:added', handleCommentaryAdded);
      socket.off('commentary:deleted', handleCommentaryDeleted);
      socket.off('match:timeline:updated', handleTimelineUpdated);
      socket.off('match:result:declared', handleResultEvent);
      socket.off('match:result:updated', handleResultEvent);
      socket.off('streaming_provider_changed', handleProviderChanged);
      socket.off('stream:viewers', handleViewersUpdated);
      socket.off('viewer:count_updated', handleViewersUpdated);
    };
  }, [streamId, socket, applyUndoHistory, addHistoryItem]);

  return {
    score,
    setScore,
    history,
    setHistory,
    loading,
    setLoading,
    error,
    connected,
    refetch: fetchScoreAndHistory,
    refreshHistoryOnly,
    addHistoryItem,
    applyUndoHistory,
  };
}
