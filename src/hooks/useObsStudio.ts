import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocketClient } from '../services/socket/socketClient.ts';
import { obsStudioService } from '../services/obs/obsStudioService.ts';
import { ADMIN_TOKEN_KEY, extractApiError } from '../services/api/httpClient.ts';
import type { ObsStudioPayload } from '../types/obs.ts';

export interface SceneSwitchRequestState {
  targetScene: string;
  requestedBy?: string;
}

export function useObsStudio(matchId?: string) {
  const [studio, setStudio] = useState<ObsStudioPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(matchId));
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [liveErrorToast, setLiveErrorToast] = useState<string | null>(null);
  const [switchingSceneRequest, setSwitchingSceneRequest] =
    useState<SceneSwitchRequestState | null>(null);
  const [scheduleRevision, setScheduleRevision] = useState(0);
  const matchIdRef = useRef(matchId);
  matchIdRef.current = matchId;

  const clearError = useCallback(() => {
    setError(null);
    setErrorStatus(null);
  }, []);

  const refetch = useCallback(async () => {
    if (!matchId) {
      setStudio(null);
      setError(null);
      setErrorStatus(null);
      setLoading(false);
      return;
    }
    try {
      const data = await obsStudioService.getStudio(matchId);
      setStudio(data);
      setError(null);
      setErrorStatus(null);
    } catch (err: any) {
      const status = typeof err?.response?.status === 'number' ? err.response.status : null;
      setErrorStatus(status);
      setError(extractApiError(err, 'Failed to load OBS Broadcast Control Studio.'));
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    if (!matchId) {
      setLoading(false);
      setStudio(null);
      setError(null);
      setErrorStatus(null);
      return;
    }
    setError(null);
    setErrorStatus(null);
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
        let nextCameras = prev.cameras;
        if (Array.isArray(payload.cameras)) {
          const prevByKey = new Map(
            prev.cameras.map((c) => [c.cameraId || c.id, c])
          );
          nextCameras = payload.cameras.map((incoming: any) => {
            const existing = prevByKey.get(incoming.cameraId || incoming.id);
            if (!existing) return incoming;
            return {
              ...incoming,
              obsBrowserSourceUrl:
                incoming.obsBrowserSourceUrl || existing.obsBrowserSourceUrl || '',
              vdoPushUrl: incoming.vdoPushUrl || existing.vdoPushUrl || '',
              connectionUrl: incoming.connectionUrl || existing.connectionUrl || '',
              larixConfig: incoming.mediamtxRevoked
                ? null
                : incoming.larixConfig || existing.larixConfig || null,
            };
          });
        }
        return {
          ...prev,
          profile: payload.profile || prev.profile,
          cameras: nextCameras,
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
                  ...(typeof payload.mediamtxPublisherConnected === 'boolean'
                    ? { mediamtxPublisherConnected: payload.mediamtxPublisherConnected }
                    : {}),
                }
              : cam
          ),
        };
      });
    };

    const onSceneChanged = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current) return;
      setSwitchingSceneRequest(null);
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

    const onSceneListUpdated = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current) return;
      setStudio((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          profile: {
            ...prev.profile,
            obsScenes: Array.isArray(payload.obsScenes)
              ? payload.obsScenes
              : prev.profile.obsScenes,
            activeObsScene: payload.activeObsScene || prev.profile.activeObsScene,
          },
        };
      });
    };

    const onBridgeConnected = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current) return;
      setStudio((prev) =>
        prev
          ? {
              ...prev,
              profile: {
                ...prev.profile,
                agentOnline: true,
                bridgeConnectionState: 'CONNECTED',
                manualDisconnect: false,
                missedHeartbeats: 0,
                lastDisconnectReason: '',
                agentLabel: payload.label || prev.profile.agentLabel,
              },
            }
          : prev
      );
    };

    const onBridgeReconnecting = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current) return;
      setStudio((prev) =>
        prev
          ? {
              ...prev,
              profile: {
                ...prev.profile,
                bridgeConnectionState: payload?.bridgeConnectionState || 'RECONNECTING',
                lastDisconnectReason: payload?.reason || prev.profile.lastDisconnectReason,
                connectionStatus:
                  prev.profile.connectionStatus === 'CONNECTED'
                    ? 'RECONNECTING'
                    : prev.profile.connectionStatus,
              },
            }
          : prev
      );
    };

    const onBridgeHealthChanged = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current) return;
      const rawState = payload?.bridgeConnectionState;
      if (!rawState) return;
      const isManual = payload?.manualDisconnect === true;
      const nextState = rawState === 'OFFLINE' && !isManual ? 'CONNECTION_LOST' : rawState;
      setStudio((prev) =>
        prev
          ? {
              ...prev,
              profile: {
                ...prev.profile,
                bridgeConnectionState: nextState,
                missedHeartbeats:
                  typeof payload.missedHeartbeats === 'number'
                    ? payload.missedHeartbeats
                    : prev.profile.missedHeartbeats,
                agentOnline: nextState !== 'OFFLINE',
                connectionStatus:
                  nextState === 'OFFLINE' && isManual
                    ? 'DISCONNECTED'
                    : nextState === 'CONNECTION_LOST'
                      ? 'CONNECTION_LOST'
                      : nextState === 'RECONNECTING' || nextState === 'OFFLINE'
                        ? 'RECONNECTING'
                        : prev.profile.connectionStatus,
                ...(nextState === 'OFFLINE' && isManual
                  ? { obsStreamActive: false, manualDisconnect: true }
                  : {}),
              },
            }
          : prev
      );
    };

    const onBridgeDisconnected = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current) return;
      const isExplicit =
        payload?.manualDisconnect === true ||
        payload?.reason === 'OPERATOR_DISCONNECT' ||
        payload?.reason === 'REVOKED';
      if (!isExplicit) {
        onBridgeReconnecting({
          ...payload,
          bridgeConnectionState:
            payload?.bridgeConnectionState === 'CONNECTION_LOST' ? 'CONNECTION_LOST' : 'RECONNECTING',
        });
        return;
      }
      setSwitchingSceneRequest(null);
      setStudio((prev) =>
        prev
          ? {
              ...prev,
              profile: {
                ...prev.profile,
                agentOnline: false,
                bridgeConnectionState: 'OFFLINE',
                manualDisconnect: payload?.manualDisconnect === true,
                lastDisconnectReason: payload?.reason || prev.profile.lastDisconnectReason,
                connectionStatus: 'DISCONNECTED',
                obsStreamActive: false,
              },
            }
          : prev
      );
    };

    const onObsConnected = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current) return;
      setLiveErrorToast(null);
      setStudio((prev) =>
        prev
          ? {
              ...prev,
              profile: {
                ...prev.profile,
                connectionStatus: 'CONNECTED',
                manualDisconnect: false,
                lastError: '',
                obsScenes: Array.isArray(payload.obsScenes)
                  ? payload.obsScenes
                  : prev.profile.obsScenes,
                activeObsScene: payload.activeObsScene || prev.profile.activeObsScene,
              },
            }
          : prev
      );
    };

    const onObsDisconnected = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current) return;
      const incomingStatus = payload?.connectionStatus;
      const isExplicitDisconnect =
        payload?.manualDisconnect === true ||
        String(payload?.reason || '').toLowerCase().includes('revoked');
      const isTransientReconnect =
        incomingStatus === 'RECONNECTING' ||
        incomingStatus === 'CONNECTION_LOST' ||
        (!isExplicitDisconnect && incomingStatus !== 'DISCONNECTED');
      setSwitchingSceneRequest(null);
      setStudio((prev) =>
        prev
          ? {
              ...prev,
              profile: {
                ...prev.profile,
                connectionStatus: isTransientReconnect
                  ? incomingStatus === 'CONNECTION_LOST'
                    ? 'CONNECTION_LOST'
                    : 'RECONNECTING'
                  : 'DISCONNECTED',
                ...(isExplicitDisconnect
                  ? { manualDisconnect: true, desiredConnected: false, obsStreamActive: false }
                  : {}),
                lastError: payload?.reason || payload?.error || prev.profile.lastError,
              },
            }
          : prev
      );
    };

    const onSceneSwitchRequested = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current) return;
      if (payload?.targetScene) {
        setSwitchingSceneRequest({
          targetScene: String(payload.targetScene),
          requestedBy: payload.requestedBy ? String(payload.requestedBy) : undefined,
        });
      }
    };

    const onSceneSwitchSuccess = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current) return;
      setSwitchingSceneRequest(null);
      if (payload?.activeObsScene) {
        setStudio((prev) =>
          prev
            ? {
                ...prev,
                profile: {
                  ...prev.profile,
                  activeObsScene: String(payload.activeObsScene),
                },
              }
            : prev
        );
      }
    };

    const onSceneSwitchFailed = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current) return;
      setSwitchingSceneRequest(null);
      if (payload?.error) {
        setLiveErrorToast(String(payload.error));
      }
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

    const onControllerPresence = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current) return;
      setStudio((prev) => {
        if (!prev) return prev;
        if (payload.userName && !prev.profile.activeControllerName) {
          return {
            ...prev,
            profile: {
              ...prev.profile,
              activeControllerName: String(payload.userName),
              activeControllerRole: String(payload.role || prev.profile.activeControllerRole || ''),
            },
          };
        }
        return prev;
      });
    };

    const onOverlayConfigUpdated = (payload: any) => {
      if (payload?.streamId !== matchIdRef.current) return;
      if (!payload?.overlayConfig && typeof payload?.showScoreboardOnYoutube !== 'boolean') return;
      setStudio((prev) =>
        prev
          ? {
              ...prev,
              match: {
                ...prev.match,
                ...(payload.overlayConfig ? { overlayConfig: payload.overlayConfig } : {}),
                ...(typeof payload.showScoreboardOnYoutube === 'boolean'
                  ? { showScoreboardOnYoutube: payload.showScoreboardOnYoutube }
                  : {}),
              },
            }
          : prev
      );
    };

    const onGraphicsStateUpdated = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current || !payload?.graphicsState) return;
      setStudio((prev) =>
        prev
          ? {
              ...prev,
              graphicsState: payload.graphicsState,
            }
          : prev
      );
    };

    const onScheduleUpdated = (payload: any) => {
      if (payload?.matchId !== matchIdRef.current) return;
      setScheduleRevision((n) => n + 1);
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
    socket.on('obs:controller_presence', onControllerPresence);
    // Explicit Remote OBS Bridge events
    socket.on('BRIDGE_CONNECTED', onBridgeConnected);
    socket.on('BRIDGE_RECONNECTING', onBridgeReconnecting);
    socket.on('BRIDGE_HEALTH_CHANGED', onBridgeHealthChanged);
    socket.on('BRIDGE_DISCONNECTED', onBridgeDisconnected);
    socket.on('OBS_CONNECTED', onObsConnected);
    socket.on('OBS_DISCONNECTED', onObsDisconnected);
    socket.on('SCENE_LIST_UPDATED', onSceneListUpdated);
    socket.on('SCENE_SWITCH_REQUESTED', onSceneSwitchRequested);
    socket.on('SCENE_SWITCH_SUCCESS', onSceneSwitchSuccess);
    socket.on('SCENE_SWITCH_FAILED', onSceneSwitchFailed);
    socket.on('CURRENT_SCENE_CHANGED', onSceneChanged);
    socket.on('overlay:config_updated', onOverlayConfigUpdated);
    socket.on('graphics:state_updated', onGraphicsStateUpdated);
    socket.on('graphics:schedule_updated', onScheduleUpdated);

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
      socket.off('obs:controller_presence', onControllerPresence);
      socket.off('BRIDGE_CONNECTED', onBridgeConnected);
      socket.off('BRIDGE_RECONNECTING', onBridgeReconnecting);
      socket.off('BRIDGE_HEALTH_CHANGED', onBridgeHealthChanged);
      socket.off('BRIDGE_DISCONNECTED', onBridgeDisconnected);
      socket.off('OBS_CONNECTED', onObsConnected);
      socket.off('OBS_DISCONNECTED', onObsDisconnected);
      socket.off('SCENE_LIST_UPDATED', onSceneListUpdated);
      socket.off('SCENE_SWITCH_REQUESTED', onSceneSwitchRequested);
      socket.off('SCENE_SWITCH_SUCCESS', onSceneSwitchSuccess);
      socket.off('SCENE_SWITCH_FAILED', onSceneSwitchFailed);
      socket.off('CURRENT_SCENE_CHANGED', onSceneChanged);
      socket.off('overlay:config_updated', onOverlayConfigUpdated);
      socket.off('graphics:state_updated', onGraphicsStateUpdated);
      socket.off('graphics:schedule_updated', onScheduleUpdated);
    };
  }, [matchId]);

  return {
    studio,
    setStudio,
    loading,
    error,
    errorStatus,
    notFound: errorStatus === 404,
    socketConnected,
    liveErrorToast,
    switchingSceneRequest,
    scheduleRevision,
    clearError,
    clearLiveErrorToast: () => setLiveErrorToast(null),
    refetch,
  };
}
