import { useCallback, useEffect, useRef, useState } from 'react';
import { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../types/index.ts';
import { liveStreamService } from '../services/liveStream/liveStreamService.ts';
import { extractApiError } from '../services/api/httpClient.ts';
import { getSocketClient } from '../services/socket/socketClient.ts';
import { DEFAULT_OVERLAY_CONFIG, normalizeOverlayConfig } from '../utils/overlayConfig.ts';

export function useObsOverlay(matchId?: string) {
  const [stream, setStream] = useState<LiveStreamData | null>(null);
  const [score, setScore] = useState<LiveScoreData | null>(null);
  const [overlayConfig, setOverlayConfig] = useState<BroadcastOverlayConfig>(DEFAULT_OVERLAY_CONFIG);
  const [loading, setLoading] = useState<boolean>(Boolean(matchId));
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(() => getSocketClient().connected);

  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const lastSequenceRef = useRef<number>(0);
  const lastBootIdRef = useRef<string | null>(null);

  const fetchOverlay = useCallback(async () => {
    if (!matchId) return;
    try {
      setError(null);
      const res = await liveStreamService.getOverlayData(matchId);
      setStream(res.stream);
      setScore(res.score);
      setOverlayConfig(normalizeOverlayConfig(res.overlayConfig));
    } catch (err) {
      setError(extractApiError(err, 'Unable to load match broadcast overlay.'));
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    seenEventIdsRef.current.clear();
    lastSequenceRef.current = 0;
    lastBootIdRef.current = null;
    if (!matchId) {
      setStream(null);
      setScore(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchOverlay();
  }, [matchId, fetchOverlay]);

  useEffect(() => {
    if (!matchId) return;
    const socket = getSocketClient();

    const shouldAcceptEvent = (payload: any, enforceOrder = true): boolean => {
      if (payload?.eventId) {
        if (seenEventIdsRef.current.has(payload.eventId)) return false;
        seenEventIdsRef.current.add(payload.eventId);
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

    const handleConnect = () => {
      setConnected(true);
      lastSequenceRef.current = 0;
      socket.emit('match:join', matchId);
      fetchOverlay();
    };

    const handleDisconnect = () => {
      setConnected(false);
    };

    if (socket.connected) {
      setConnected(true);
      socket.emit('match:join', matchId);
    }

    const handleScorePayload = (payload: {
      streamId?: string;
      score?: LiveScoreData;
      eventId?: string;
      sequence?: number;
    }) => {
      if (payload?.streamId !== matchId) return;
      if (!shouldAcceptEvent(payload, true)) return;
      if (payload.score) {
        setScore(payload.score);
      }
    };

    const handleStreamUpdated = (updated: LiveStreamData & { eventId?: string }) => {
      const id = updated?.id || updated?._id;
      if (id !== matchId) return;
      if (!shouldAcceptEvent(updated, false)) return;
      setStream((prev) => (prev ? { ...prev, ...updated } : updated));
      if (updated.score) {
        setScore(updated.score);
      }
      if (updated.overlayConfig) {
        setOverlayConfig(normalizeOverlayConfig(updated.overlayConfig));
      }
    };

    const handleStreamEnded = (ended: LiveStreamData & { eventId?: string }) => {
      const id = ended?.id || ended?._id;
      if (id !== matchId) return;
      if (!shouldAcceptEvent(ended, false)) return;
      setStream((prev) => (prev ? { ...prev, ...ended, status: 'ENDED' } : ended));
      if (ended.score) {
        setScore(ended.score);
      }
    };

    const handleOverlayConfigUpdated = (payload: {
      streamId?: string;
      overlayConfig?: BroadcastOverlayConfig;
      showScoreboardOnYoutube?: boolean;
      eventId?: string;
    }) => {
      if (payload?.streamId !== matchId) return;
      if (!shouldAcceptEvent(payload, false)) return;
      if (payload.overlayConfig) {
        setOverlayConfig(normalizeOverlayConfig(payload.overlayConfig));
      }
      if (typeof payload.showScoreboardOnYoutube === 'boolean') {
        setStream((prev) =>
          prev ? { ...prev, showScoreboardOnYoutube: payload.showScoreboardOnYoutube } : prev
        );
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('score:updated', handleScorePayload);
    socket.on('score:event:created', handleScorePayload);
    socket.on('score:event:corrected', handleScorePayload);
    socket.on('kabaddi:state', handleScorePayload);
    socket.on('kabaddi:timer', handleScorePayload);
    socket.on('kabaddi:settings_updated', handleScorePayload);
    socket.on('kabaddi:match_completed', handleScorePayload);
    socket.on('cricket:innings_completed', handleScorePayload);
    socket.on('cricket:second_innings_started', handleScorePayload);
    socket.on('cricket:match_completed', handleScorePayload);
    socket.on('score:undo', handleScorePayload);
    socket.on('score:reset', handleScorePayload);
    socket.on('match:result:declared', handleScorePayload);
    socket.on('match:result:updated', handleScorePayload);
    socket.on('live:updated', handleStreamUpdated);
    socket.on('live:started', handleStreamUpdated);
    socket.on('live:ended', handleStreamEnded);
    socket.on('overlay:config_updated', handleOverlayConfigUpdated);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('score:updated', handleScorePayload);
      socket.off('score:event:created', handleScorePayload);
      socket.off('score:event:corrected', handleScorePayload);
      socket.off('kabaddi:state', handleScorePayload);
      socket.off('kabaddi:timer', handleScorePayload);
      socket.off('kabaddi:settings_updated', handleScorePayload);
      socket.off('kabaddi:match_completed', handleScorePayload);
      socket.off('cricket:innings_completed', handleScorePayload);
      socket.off('cricket:second_innings_started', handleScorePayload);
      socket.off('cricket:match_completed', handleScorePayload);
      socket.off('score:undo', handleScorePayload);
      socket.off('score:reset', handleScorePayload);
      socket.off('match:result:declared', handleScorePayload);
      socket.off('match:result:updated', handleScorePayload);
      socket.off('live:updated', handleStreamUpdated);
      socket.off('live:started', handleStreamUpdated);
      socket.off('live:ended', handleStreamEnded);
      socket.off('overlay:config_updated', handleOverlayConfigUpdated);
      socket.emit('match:leave', matchId);
    };
  }, [matchId, fetchOverlay]);

  // Reliable background reconciliation polling so OBS Browser Sources never drift even if WebSocket is blocked
  useEffect(() => {
    if (!matchId) return;
    const intervalMs = connected ? 4000 : 2500;
    const timer = window.setInterval(() => {
      fetchOverlay();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [matchId, connected, fetchOverlay]);

  return {
    stream,
    setStream,
    score,
    setScore,
    overlayConfig,
    setOverlayConfig,
    loading,
    error,
    connected,
    refetch: fetchOverlay,
  };
}
