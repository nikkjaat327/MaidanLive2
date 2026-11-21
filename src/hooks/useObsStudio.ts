import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocketClient } from '../services/socket/socketClient.ts';
import { obsStudioService } from '../services/obs/obsStudioService.ts';
import { ADMIN_TOKEN_KEY, extractApiError } from '../services/api/httpClient.ts';
import type { ObsStudioPayload } from '../types/obs.ts';

export function useObsStudio(matchId?: string) {
  const [studio, setStudio] = useState<ObsStudioPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(matchId));
  const [error, setError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [liveErrorToast, setLiveErrorToast] = useState<string | null>(null);
  const matchIdRef = useRef(matchId);
  matchIdRef.current = matchId;

  const refetch = useCallback(async () => {
    if (!matchId) {
      setStudio(null);
      setLoading(false);
      return;
    }
    try {
      const data = await obsStudioService.getStudio(matchId);
      setStudio(data);
      setError(null);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load OBS Broadcast Control Studio.'));
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    if (!matchId) {
      setLoading(false);
      setStudio(null);
      return;
    }
    setLoading(true);
    refetch();
  }, [matchId, refetch]);

  useEffect(() => {
    if (!matchId) return;
    const socket = getSocketClient();

    const joinStudio = () => {
      setSocketConnected(true);
      const token =
        typeof window !== 'undefined' ? window.localStorage.getItem(ADMIN_TOKEN_KEY) : null;
      if (token) {
        socket.emit('broadcast-studio:join', { token, matchId });
      }
    };

    const onDisconnect = () => setSocketConnected(false);

    const onObsState = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current) return;
      setStudio((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          profile: payload.profile || prev.profile,
          cameras: Array.isArray(payload.cameras) ? payload.cameras : prev.cameras,
          scenes: Array.isArray(payload.scenes) ? payload.scenes : prev.scenes,
        };
      });
    };

    const onCameraStatus = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current) return;
      setStudio((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          cameras: prev.cameras.map((cam) =>
            cam.cameraId === payload.cameraId
              ? {
                  ...cam,
                  status: payload.status || cam.status,
                  lastHeartbeatAt: payload.lastHeartbeatAt || cam.lastHeartbeatAt,
                  telemetry: payload.telemetry || cam.telemetry,
                  lastError: payload.lastError !== undefined ? payload.lastError : cam.lastError,
                }
              : cam
          ),
        };
      });
    };

    const onSceneChanged = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current) return;
      setStudio((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          profile: {
            ...prev.profile,
            activeObsScene: payload.activeObsScene || prev.profile.activeObsScene,
            activeCameraId:
              payload.activeCameraId !== undefined
                ? payload.activeCameraId
                : prev.profile.activeCameraId,
            activeLayoutType: payload.activeLayoutType || prev.profile.activeLayoutType,
          },
        };
      });
    };

    const onAdminOverride = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current) return;
      setStudio((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          profile: {
            ...prev.profile,
            adminOverrideLocked: Boolean(payload.adminOverrideLocked),
            adminOverrideByName: payload.adminOverrideByName || '',
            adminOverrideReason: payload.adminOverrideReason || '',
          },
        };
      });
    };

    const onAuditEvent = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current || !payload?.log) return;
      setStudio((prev) => {
        if (!prev) return prev;
        const exists = prev.auditLogs.some((l) => l.id === payload.log.id);
        if (exists) return prev;
        return {
          ...prev,
          auditLogs: [payload.log, ...prev.auditLogs].slice(0, 80),
        };
      });
    };

    const onObsError = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current) return;
      if (payload?.message) setLiveErrorToast(String(payload.message));
    };

    if (socket.connected) joinStudio();

    socket.on('connect', joinStudio);
    socket.on('disconnect', onDisconnect);
    socket.on('obs:state', onObsState);
    socket.on('obs:camera_status', onCameraStatus);
    socket.on('obs:scene_changed', onSceneChanged);
    socket.on('obs:admin_override', onAdminOverride);
    socket.on('obs:audit_event', onAuditEvent);
    socket.on('obs:error', onObsError);

    return () => {
      socket.emit('broadcast-studio:leave', matchId);
      socket.off('connect', joinStudio);
      socket.off('disconnect', onDisconnect);
      socket.off('obs:state', onObsState);
      socket.off('obs:camera_status', onCameraStatus);
      socket.off('obs:scene_changed', onSceneChanged);
      socket.off('obs:admin_override', onAdminOverride);
      socket.off('obs:audit_event', onAuditEvent);
      socket.off('obs:error', onObsError);
    };
  }, [matchId]);

  return {
    studio,
    setStudio,
    loading,
    error,
    socketConnected,
    liveErrorToast,
    clearLiveErrorToast: () => setLiveErrorToast(null),
    refetch,
  };
}
