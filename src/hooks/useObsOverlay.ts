import { useCallback, useEffect, useRef, useState } from 'react';
import { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../types/index.ts';
import { liveStreamService } from '../services/liveStream/liveStreamService.ts';
import { extractApiError } from '../services/api/httpClient.ts';
import { getSocketClient } from '../services/socket/socketClient.ts';
import { DEFAULT_OVERLAY_CONFIG, normalizeOverlayConfig } from '../utils/overlayConfig.ts';
import type { BroadcastGraphicsStateData } from '../types/broadcastGraphics.ts';
import type { ObsLayoutType, PipPosition, PipSize } from '../utils/obsLayoutGeometry.ts';

export interface ObsOverlayLayoutState {
  activeLayoutType: ObsLayoutType;
  activeCameraId: string;
  activeCameraIds: string[];
  activePipPosition: PipPosition;
  activePipSize: PipSize;
  activeObsScene: string;
}

export function useObsOverlay(matchId?: string) {
  const [stream, setStream] = useState<LiveStreamData | null>(null);
  const [score, setScore] = useState<LiveScoreData | null>(null);
  const [overlayConfig, setOverlayConfig] = useState<BroadcastOverlayConfig>(DEFAULT_OVERLAY_CONFIG);
  const [graphicsState, setGraphicsState] = useState<BroadcastGraphicsStateData | null>(null);
  const [obsLayout, setObsLayout] = useState<ObsOverlayLayoutState | null>(null);
  const [brandLogoUrl, setBrandLogoUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(Boolean(matchId));
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [connected, setConnected] = useState<boolean>(() => getSocketClient().connected);
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState<number>(0);

  const clearError = useCallback(() => {
    setError(null);
    setErrorStatus(null);
  }, []);

  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const lastSequenceRef = useRef<number>(0);
  const lastBootIdRef = useRef<string | null>(null);

  const syncServerClock = useCallback((iso?: unknown) => {
    if (typeof iso !== 'string' || !iso) return;
    const parsed = Date.parse(iso);
    if (!Number.isFinite(parsed)) return;
    const nextOffset = parsed - Date.now();
    // Smooth tiny jitter (<300ms) while adjusting promptly for larger clock skews
    setServerClockOffsetMs((prev) =>
      Math.abs(nextOffset - prev) >= 300 ? nextOffset : prev
    );
  }, []);

  const fetchOverlay = useCallback(async () => {
    if (!matchId) {
      setStream(null);
      setError(null);
      setErrorStatus(null);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      setErrorStatus(null);
      const res = await liveStreamService.getOverlayData(matchId);
      syncServerClock(res.serverNowIso);
      setStream(res.stream);
      setScore(res.score);
      setOverlayConfig(normalizeOverlayConfig(res.overlayConfig));
      if (res.graphicsState) {
        setGraphicsState(res.graphicsState);
      }
      if (res.obsLayout) {
        setObsLayout({
          activeLayoutType: (res.obsLayout.activeLayoutType as ObsLayoutType) || 'SINGLE',
          activeCameraId: res.obsLayout.activeCameraId || '',
          activeCameraIds: Array.isArray(res.obsLayout.activeCameraIds)
            ? res.obsLayout.activeCameraIds
            : [],
          activePipPosition: res.obsLayout.activePipPosition || 'bottom-right',
          activePipSize: res.obsLayout.activePipSize || 'medium',
          activeObsScene: res.obsLayout.activeObsScene || '',
        });
      }
      if (typeof res.brandLogoUrl === 'string' && res.brandLogoUrl.trim()) {
        setBrandLogoUrl(res.brandLogoUrl.trim());
      }
    } catch (err: any) {
      const status = typeof err?.response?.status === 'number' ? err.response.status : null;
      setErrorStatus(status);
      setError(extractApiError(err, 'Unable to load match broadcast overlay.'));
    } finally {
      setLoading(false);
    }
  }, [matchId, syncServerClock]);

  useEffect(() => {
    seenEventIdsRef.current.clear();
    lastSequenceRef.current = 0;
    lastBootIdRef.current = null;
    if (!matchId) {
      setStream(null);
      setScore(null);
      setGraphicsState(null);
      setObsLayout(null);
      setError(null);
      setErrorStatus(null);
      setLoading(false);
      return;
    }
    setError(null);
    setErrorStatus(null);
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
      serverNowIso?: string;
      emittedAt?: string;
    }) => {
      if (payload?.streamId !== matchId) return;
      if (!shouldAcceptEvent(payload, true)) return;
      syncServerClock(payload.serverNowIso || payload.emittedAt);
      if (payload.score) {
        setScore(payload.score);
      }
    };

    const handleStreamUpdated = (
      updated: LiveStreamData & { eventId?: string; serverNowIso?: string; emittedAt?: string }
    ) => {
      const id = updated?.id || updated?._id;
      if (id !== matchId) return;
      if (!shouldAcceptEvent(updated, false)) return;
      syncServerClock(updated.serverNowIso || updated.emittedAt);
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
      serverNowIso?: string;
      emittedAt?: string;
    }) => {
      if (payload?.streamId !== matchId) return;
      if (!shouldAcceptEvent(payload, false)) return;
      syncServerClock(payload.serverNowIso || payload.emittedAt);
      if (payload.overlayConfig) {
        setOverlayConfig(normalizeOverlayConfig(payload.overlayConfig));
      }
      if (typeof payload.showScoreboardOnYoutube === 'boolean') {
        setStream((prev) =>
          prev ? { ...prev, showScoreboardOnYoutube: payload.showScoreboardOnYoutube } : prev
        );
      }
    };

    const handleGraphicsStateUpdated = (payload: {
      matchId?: string;
      streamId?: string;
      graphicsState?: BroadcastGraphicsStateData;
      eventId?: string;
      serverNowIso?: string;
      emittedAt?: string;
    }) => {
      const targetId = payload?.matchId || payload?.streamId;
      if (targetId !== matchId) return;
      if (!shouldAcceptEvent(payload, false)) return;
      syncServerClock(payload.serverNowIso || payload.emittedAt);
      if (payload.graphicsState) {
        setGraphicsState(payload.graphicsState);
      }
    };

    const handleObsLayoutUpdated = (payload: {
      matchId?: string;
      layoutType?: ObsLayoutType;
      activeLayoutType?: ObsLayoutType;
      cameraId?: string;
      cameraIds?: string[];
      activeCameraId?: string;
      activeCameraIds?: string[];
      pipPosition?: PipPosition;
      pipSize?: PipSize;
      sceneName?: string;
      activeObsScene?: string;
      eventId?: string;
      serverNowIso?: string;
      emittedAt?: string;
    }) => {
      if (payload?.matchId !== matchId) return;
      if (!shouldAcceptEvent(payload, false)) return;
      syncServerClock(payload.serverNowIso || payload.emittedAt);
      const nextLayout = payload.layoutType || payload.activeLayoutType || 'SINGLE';
      const nextCamIds = Array.isArray(payload.activeCameraIds)
        ? payload.activeCameraIds
        : Array.isArray(payload.cameraIds)
          ? payload.cameraIds
          : payload.activeCameraId || payload.cameraId
            ? [String(payload.activeCameraId || payload.cameraId)]
            : [];
      setObsLayout((prev) => ({
        activeLayoutType: nextLayout,
        activeCameraId: payload.activeCameraId || payload.cameraId || prev?.activeCameraId || nextCamIds[0] || '',
        activeCameraIds: nextCamIds,
        activePipPosition: payload.pipPosition || prev?.activePipPosition || 'bottom-right',
        activePipSize: payload.pipSize || prev?.activePipSize || 'medium',
        activeObsScene: payload.activeObsScene || payload.sceneName || prev?.activeObsScene || '',
      }));
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
    socket.on('volleyball:rules_updated', handleScorePayload);
    socket.on('volleyball:match_completed', handleScorePayload);
    socket.on('volleyball:match_reopened', handleScorePayload);
    socket.on('score:undo', handleScorePayload);
    socket.on('score:reset', handleScorePayload);
    socket.on('match:result:declared', handleScorePayload);
    socket.on('match:result:updated', handleScorePayload);
    socket.on('live:updated', handleStreamUpdated);
    socket.on('live:started', handleStreamUpdated);
    socket.on('live:ended', handleStreamEnded);
    socket.on('overlay:config_updated', handleOverlayConfigUpdated);
    socket.on('graphics:state_updated', handleGraphicsStateUpdated);
    socket.on('obs:layout_updated', handleObsLayoutUpdated);

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
      socket.off('volleyball:rules_updated', handleScorePayload);
      socket.off('volleyball:match_completed', handleScorePayload);
      socket.off('volleyball:match_reopened', handleScorePayload);
      socket.off('score:undo', handleScorePayload);
      socket.off('score:reset', handleScorePayload);
      socket.off('match:result:declared', handleScorePayload);
      socket.off('match:result:updated', handleScorePayload);
      socket.off('live:updated', handleStreamUpdated);
      socket.off('live:started', handleStreamUpdated);
      socket.off('live:ended', handleStreamEnded);
      socket.off('overlay:config_updated', handleOverlayConfigUpdated);
      socket.off('graphics:state_updated', handleGraphicsStateUpdated);
      socket.off('obs:layout_updated', handleObsLayoutUpdated);
      socket.emit('match:leave', matchId);
    };
  }, [matchId, fetchOverlay, syncServerClock]);

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
    graphicsState,
    setGraphicsState,
    obsLayout,
    brandLogoUrl,
    serverClockOffsetMs,
    loading,
    error,
    errorStatus,
    notFound: errorStatus === 404,
    clearError,
    connected,
    refetch: fetchOverlay,
  };
}
