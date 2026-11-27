import { adminApi, publicApi } from '../api/httpClient.ts';
import type {
  BroadcastAssignmentData,
  BroadcastAuditLogData,
  BroadcastCameraData,
  BroadcasterDashboardPayload,
  BroadcastersManagementPayload,
  BroadcastSceneData,
  CameraOrientationMode,
  CameraPreviewFit,
  LocalBridgeProbeStatus,
  MediaMTXConfigPayload,
  ObsBridgeData,
  ObsBridgeInstallerStatus,
  ObsBridgePairingResponse,
  ObsBridgeTokenResponse,
  ObsControllerProfileData,
  ObsDiscoveredInput,
  ObsSceneItemData,
  ObsSceneTransformItem,
  ObsStudioPayload,
} from '../../types/obs.ts';
import type { ObsLayoutType, PipPosition, PipSize } from '../../utils/obsLayoutGeometry.ts';
import type { StreamingProvider } from '../../types/index.ts';

export const obsStudioService = {
  async getStudio(matchId: string): Promise<ObsStudioPayload> {
    const { data } = await adminApi.get<ObsStudioPayload>(`/obs/matches/${matchId}/studio`);
    return data;
  },

  async updateProfile(
    matchId: string,
    payload: {
      connectionMode?: 'direct_ws' | 'local_agent';
      obsProtocol?: 'ws' | 'wss';
      obsHost?: string;
      obsPort?: number;
      obsPassword?: string;
      clearPassword?: boolean;
      vdoRoomName?: string;
      autoSyncScoreboardSource?: boolean;
      scoreboardSourceName?: string;
      selectedSponsorIds?: string[];
      sceneLabels?: Record<string, string>;
    }
  ): Promise<{ profile: ObsControllerProfileData }> {
    const { data } = await adminApi.patch<{ profile: ObsControllerProfileData }>(
      `/obs/matches/${matchId}/profile`,
      payload
    );
    return data;
  },

  async generateAgentToken(matchId: string): Promise<{
    agentToken: string;
    agentTokenPrefix: string;
    command: string;
    profile: ObsControllerProfileData;
  }> {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/agent-token`);
    return data;
  },

  async testConnection(
    matchId: string,
    candidate?: { obsProtocol?: 'ws' | 'wss'; obsHost?: string; obsPort?: number; obsPassword?: string }
  ): Promise<{
    ok: boolean;
    mode: string;
    obsVersion?: string;
    obsWebSocketVersion?: string;
    sceneCount?: number;
    scenes?: string[];
    latencyMs: number;
    message: string;
  }> {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/test-connection`, candidate || {});
    return data;
  },

  async connectObs(matchId: string, mode?: 'direct_ws' | 'local_agent') {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/connect`, { mode });
    return data;
  },

  async disconnectObs(matchId: string) {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/disconnect`);
    return data;
  },

  async refreshObs(matchId: string) {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/refresh`);
    return data;
  },

  async refreshScenes(matchId: string) {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/scenes/refresh`);
    return data;
  },

  async listBridges(matchId?: string): Promise<{ bridges: ObsBridgeData[] }> {
    const { data } = await adminApi.get<{ bridges: ObsBridgeData[] }>('/obs/bridges', {
      params: matchId ? { matchId } : undefined,
    });
    return data;
  },

  async registerBridge(payload: {
    name: string;
    label?: string;
    ownerUserId?: string;
    tournamentId?: string;
    assignedMatchIds?: string[];
    matchId?: string;
  }): Promise<ObsBridgeTokenResponse> {
    const { data } = await adminApi.post<ObsBridgeTokenResponse>('/obs/bridges', payload);
    return data;
  },

  async updateBridge(
    bridgeId: string,
    payload: {
      name?: string;
      label?: string;
      ownerUserId?: string;
      tournamentId?: string | null;
      assignedMatchIds?: string[];
    }
  ): Promise<{ bridge: ObsBridgeData }> {
    const { data } = await adminApi.patch<{ bridge: ObsBridgeData }>(
      `/obs/bridges/${encodeURIComponent(bridgeId)}`,
      payload
    );
    return data;
  },

  async rotateBridgeToken(bridgeId: string): Promise<ObsBridgeTokenResponse> {
    const { data } = await adminApi.post<ObsBridgeTokenResponse>(
      `/obs/bridges/${encodeURIComponent(bridgeId)}/rotate-token`
    );
    return data;
  },

  async revokeBridge(bridgeId: string, reason = ''): Promise<{ ok: boolean; bridge: ObsBridgeData }> {
    const { data } = await adminApi.post<{ ok: boolean; bridge: ObsBridgeData }>(
      `/obs/bridges/${encodeURIComponent(bridgeId)}/revoke`,
      { reason }
    );
    return data;
  },

  async reactivateBridge(bridgeId: string): Promise<{ ok: boolean; bridge: ObsBridgeData }> {
    const { data } = await adminApi.post<{ ok: boolean; bridge: ObsBridgeData }>(
      `/obs/bridges/${encodeURIComponent(bridgeId)}/reactivate`
    );
    return data;
  },

  async createBridgePairingCode(payload: {
    matchId?: string;
    tournamentId?: string;
    bridgeId?: string;
    label?: string;
  }): Promise<ObsBridgePairingResponse> {
    const { data } = await adminApi.post<ObsBridgePairingResponse>(
      '/obs/bridges/pairing-code',
      payload
    );
    return data;
  },

  async reconnectBridgeObs(bridgeId: string): Promise<{
    ok: boolean;
    bridge: ObsBridgeData;
    result?: { reconnected: boolean; obsUrl?: string; lastError?: string };
  }> {
    const { data } = await adminApi.post(
      `/obs/bridges/${encodeURIComponent(bridgeId)}/reconnect-obs`
    );
    return data;
  },

  async disconnectBridge(bridgeId: string): Promise<{ ok: boolean; bridge: ObsBridgeData }> {
    const { data } = await adminApi.post<{ ok: boolean; bridge: ObsBridgeData }>(
      `/obs/bridges/${encodeURIComponent(bridgeId)}/disconnect`
    );
    return data;
  },

  async triggerBridgeSceneTransition(
    bridgeId: string,
    payload?: {
      previewSceneName?: string;
      sceneName?: string;
      transitionName?: string;
      transitionDurationMs?: number;
      ensureStudioMode?: boolean;
    }
  ): Promise<{ ok: boolean; bridge: ObsBridgeData; result?: any }> {
    const { data } = await adminApi.post<{ ok: boolean; bridge: ObsBridgeData; result?: any }>(
      `/obs/bridges/${encodeURIComponent(bridgeId)}/trigger-transition`,
      payload || {}
    );
    return data;
  },

  async getBridgeInstallerStatus(): Promise<ObsBridgeInstallerStatus> {
    const { data } = await adminApi.get<ObsBridgeInstallerStatus>('/obs/bridge/installer/status');
    return data;
  },

  async probeLocalBridgeStatus(): Promise<LocalBridgeProbeStatus | null> {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 1200);
      const res = await fetch('http://127.0.0.1:44691/status', {
        method: 'GET',
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      if (!res.ok) return null;
      return (await res.json()) as LocalBridgeProbeStatus;
    } catch {
      return null;
    }
  },

  async activateLocalBridge(
    code: string,
    serverUrl: string
  ): Promise<{ ok: boolean; bridgeId?: string; message?: string }> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch('http://127.0.0.1:44691/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, serverUrl }),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, message: json?.message || 'Failed activating local bridge.' };
      }
      return json;
    } catch {
      return { ok: false };
    } finally {
      window.clearTimeout(timer);
    }
  },

  async triggerLocalBridgeTransition(payload?: {
    previewSceneName?: string;
    sceneName?: string;
    transitionName?: string;
    transitionDurationMs?: number;
    ensureStudioMode?: boolean;
  }): Promise<{ ok: boolean; data?: any; message?: string }> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch('http://127.0.0.1:44691/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, message: json?.message || 'Failed to trigger OBS Scene Transition.' };
      }
      return json;
    } catch {
      return { ok: false, message: 'Local OBS Bridge is unreachable on 127.0.0.1:44691.' };
    } finally {
      window.clearTimeout(timer);
    }
  },

  async createCamera(
    matchId: string,
    payload: Partial<BroadcastCameraData> & { expiresInHours?: number }
  ): Promise<{
    camera: BroadcastCameraData;
    mobileConnectUrl: string;
    pushToken: string;
    pushTokenExpiresAt?: string;
    broadcastSessionId?: string;
  }> {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/cameras`, payload);
    return data;
  },

  async scaffoldCameras(
    matchId: string,
    count: number,
    expiresInHours?: number
  ): Promise<{ created: BroadcastCameraData[] }> {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/cameras/scaffold`, {
      count,
      ...(expiresInHours ? { expiresInHours } : {}),
    });
    return data;
  },

  async updateCamera(
    matchId: string,
    cameraId: string,
    payload: Partial<BroadcastCameraData>
  ): Promise<{ camera: BroadcastCameraData }> {
    const { data } = await adminApi.patch(`/obs/matches/${matchId}/cameras/${cameraId}`, payload);
    return data;
  },

  async deleteCamera(matchId: string, cameraId: string, removeFromObs = false): Promise<void> {
    await adminApi.delete(`/obs/matches/${matchId}/cameras/${cameraId}`, {
      params: removeFromObs ? { removeFromObs: 'true' } : undefined,
    });
  },

  async rotateLarixCredentials(
    matchId: string,
    cameraId: string,
    syncObs = true,
    override = false
  ): Promise<{ ok: boolean; camera: BroadcastCameraData }> {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/cameras/${cameraId}/larix/rotate`, {
      syncObs,
      override,
    });
    return data;
  },

  async revokeLarixCredentials(
    matchId: string,
    cameraId: string
  ): Promise<{ ok: boolean; camera: BroadcastCameraData }> {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/cameras/${cameraId}/larix/revoke`);
    return data;
  },

  async assignCameraToObs(
    matchId: string,
    cameraId: string,
    override = false
  ): Promise<{ ok: boolean; detail?: string; obsSynced?: boolean } & Partial<ObsStudioPayload>> {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/cameras/${cameraId}/assign-obs`, {
      override,
    });
    return data;
  },

  async getMediaMTXConfig(matchId: string): Promise<MediaMTXConfigPayload> {
    const { data } = await adminApi.get<MediaMTXConfigPayload>(`/obs/matches/${matchId}/mediamtx/config`);
    return data;
  },

  async controlMediaMTX(
    matchId: string,
    action: 'status' | 'start' | 'stop' | 'restart' | 'sync_config' | 'logs',
    options?: string | { executablePath?: string; configPath?: string; limit?: number }
  ): Promise<{ ok: boolean; result?: any } & Partial<ObsStudioPayload>> {
    const opts = typeof options === 'string' ? { executablePath: options } : options || {};
    const { data } = await adminApi.post(`/obs/matches/${matchId}/mediamtx/control`, {
      action,
      ...(opts.executablePath ? { executablePath: opts.executablePath } : {}),
      ...(opts.configPath ? { configPath: opts.configPath } : {}),
      ...(opts.limit ? { limit: opts.limit } : {}),
    });
    return data;
  },

  async reorderCameras(matchId: string, orderedIds: string[]): Promise<void> {
    await adminApi.patch(`/obs/matches/${matchId}/cameras/reorder`, { orderedIds });
  },

  async rotateCameraToken(
    matchId: string,
    cameraId: string,
    expiresInHours = 12
  ): Promise<{
    pushToken: string;
    pushTokenPrefix: string;
    pushTokenExpiresAt?: string;
    broadcastSessionId?: string;
    mobileConnectUrl: string;
  }> {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/cameras/${cameraId}/rotate-token`, {
      expiresInHours,
    });
    return data;
  },

  async disconnectCamera(matchId: string, cameraId: string) {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/cameras/${cameraId}/disconnect`);
    return data;
  },

  async reconnectCamera(
    matchId: string,
    cameraId: string,
    override = false
  ): Promise<{
    ok: boolean;
    obsSynced: boolean;
    status: string;
    detail: string;
    camera: BroadcastCameraData;
  }> {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/cameras/${cameraId}/reconnect`, {
      override,
    });
    return data;
  },

  async setCameraAudioMute(
    matchId: string,
    cameraId: string,
    muted: boolean,
    override = false
  ): Promise<{
    ok: boolean;
    camera: BroadcastCameraData;
    obsSynced: boolean;
    obsNote: string;
  }> {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/cameras/${cameraId}/audio`, {
      muted,
      override,
    });
    return data;
  },

  async executeObsAction(
    matchId: string,
    action: 'start_stream' | 'stop_stream' | 'start_record' | 'stop_record',
    override = false
  ) {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/obs-action`, {
      action,
      override,
    });
    return data;
  },

  async manageSession(matchId: string, mode: 'start' | 'end' | 'takeover') {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/session`, { mode });
    return data;
  },

  async getBroadcasterDashboard(): Promise<BroadcasterDashboardPayload> {
    const { data } = await adminApi.get<BroadcasterDashboardPayload>('/obs/broadcaster/dashboard');
    return data;
  },

  async listBroadcasters(): Promise<BroadcastersManagementPayload> {
    const { data } = await adminApi.get<BroadcastersManagementPayload>('/obs/broadcasters');
    return data;
  },

  async assignBroadcaster(payload: {
    userId: string;
    scopeType: 'tournament' | 'match';
    tournamentId?: string;
    matchId?: string;
    permissions?: string[];
    notes?: string;
    promoteToBroadcaster?: boolean;
  }): Promise<{ assignment: BroadcastAssignmentData; message?: string }> {
    const { data } = await adminApi.post('/obs/broadcasters/assign', payload);
    return data;
  },

  async updateBroadcasterAssignment(
    id: string,
    payload: {
      status?: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
      permissions?: string[];
      notes?: string;
      revokeReason?: string;
    }
  ): Promise<{ assignment: BroadcastAssignmentData }> {
    const { data } = await adminApi.patch(`/obs/broadcasters/assignments/${id}`, payload);
    return data;
  },

  async testCamera(
    matchId: string,
    cameraId: string
  ): Promise<{ ok: boolean; status: string; detail: string; checkedAt: string }> {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/cameras/${cameraId}/test`);
    return data;
  },

  async switchCamera(matchId: string, cameraId: string, override = false) {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/cameras/${cameraId}/switch`, {
      override,
    });
    return data;
  },

  async disconnectAllCameras(matchId: string) {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/cameras/disconnect-all`);
    return data;
  },

  async refreshCameras(matchId: string) {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/cameras/refresh`);
    return data;
  },

  async executeTransition(
    matchId: string,
    payload: {
      mode: 'cut' | 'fade';
      durationMs?: number;
      layoutType?: ObsLayoutType;
      cameraIds?: string[];
      mainCameraId?: string;
      pipPosition?: PipPosition;
      pipSize?: PipSize;
      sceneName?: string;
      includeScoreboardOverlay?: boolean;
      override?: boolean;
    }
  ) {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/transition`, payload);
    return data;
  },

  async applyLayout(
    matchId: string,
    payload: {
      layoutType: ObsLayoutType;
      cameraIds: string[];
      mainCameraId?: string;
      pipPosition?: PipPosition;
      pipSize?: PipSize;
      sceneName?: string;
      includeScoreboardOverlay?: boolean;
      override?: boolean;
    }
  ) {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/layouts/apply`, payload);
    return data;
  },

  async listObsInputs(matchId: string): Promise<{ ok: boolean; inputs: ObsDiscoveredInput[] }> {
    const { data } = await adminApi.get(`/obs/matches/${matchId}/obs-inputs`);
    return data;
  },

  async mapCameraSources(
    matchId: string,
    mappings: Array<{
      cameraId?: string;
      obsInputName: string;
      displayName: string;
      obsSceneName?: string;
      inputKind?: string;
      isCamera: boolean;
    }>
  ) {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/cameras/map-sources`, { mappings });
    return data;
  },

  async createScene(
    matchId: string,
    payload: {
      name: string;
      label?: string;
      obsSceneName: string;
      layoutType: ObsLayoutType;
      cameraIds: string[];
      mainCameraId?: string;
      pipPosition?: PipPosition;
      pipSize?: PipSize;
      includeScoreboardOverlay?: boolean;
      overlayMode?: string;
    }
  ): Promise<{ scene: BroadcastSceneData }> {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/scenes`, payload);
    return data;
  },

  async deleteScene(matchId: string, sceneId: string): Promise<void> {
    await adminApi.delete(`/obs/matches/${matchId}/scenes/${sceneId}`);
  },

  async switchScene(matchId: string, sceneName: string, override = false) {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/scenes/switch`, {
      sceneName,
      override,
    });
    return data;
  },

  async triggerSceneTransition(
    matchId: string,
    payload?: {
      previewSceneName?: string;
      sceneName?: string;
      transitionName?: string;
      transitionDurationMs?: number;
      ensureStudioMode?: boolean;
      override?: boolean;
    }
  ) {
    const { data } = await adminApi.post(
      `/obs/matches/${matchId}/scenes/trigger-transition`,
      payload || {}
    );
    return data;
  },

  async setStudioMode(matchId: string, studioModeEnabled: boolean, override = false) {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/studio-mode`, {
      studioModeEnabled,
      override,
    });
    return data;
  },

  async setPreviewScene(matchId: string, sceneName: string, override = false) {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/scenes/preview`, {
      sceneName,
      override,
    });
    return data;
  },

  async setPrimaryAudioInput(matchId: string, inputName: string, override = false) {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/audio/primary-input`, {
      inputName,
      override,
    });
    return data;
  },

  async setObsInputMute(matchId: string, inputName: string, muted: boolean, override = false) {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/audio/mute`, {
      inputName,
      muted,
      override,
    });
    return data;
  },

  async getSceneItems(
    matchId: string,
    sceneName = ''
  ): Promise<{ ok: boolean; sceneName: string; items: ObsSceneItemData[] }> {
    const { data } = await adminApi.get(`/obs/matches/${matchId}/scene-items`, {
      params: sceneName ? { sceneName } : undefined,
    });
    return data;
  },

  async toggleSceneItem(
    matchId: string,
    payload: {
      sceneName: string;
      sceneItemId: number;
      sourceName?: string;
      enabled: boolean;
      override?: boolean;
    }
  ): Promise<{ ok: boolean; sceneName: string; sceneItemId: number; sceneItemEnabled: boolean }> {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/scene-items/toggle`, payload);
    return data;
  },

  async getSceneTransforms(
    matchId: string,
    sceneName = ''
  ): Promise<{ ok: boolean; sceneName: string; transforms: ObsSceneTransformItem[] }> {
    const { data } = await adminApi.get(`/obs/matches/${matchId}/scene-transforms`, {
      params: sceneName ? { sceneName } : undefined,
    });
    return data;
  },

  async updateCameraTransform(
    matchId: string,
    cameraId: string,
    payload: {
      orientationMode?: CameraOrientationMode;
      previewFit?: CameraPreviewFit;
      portraitBackdropFill?: boolean;
      override?: boolean;
    }
  ): Promise<{
    ok: boolean;
    obsSynced: boolean;
    obsNote: string;
    updatedScenes: string[];
    camera: BroadcastCameraData;
  }> {
    const { data } = await adminApi.post(
      `/obs/matches/${matchId}/cameras/${cameraId}/transform`,
      payload
    );
    return data;
  },

  async updateYouTubeOutput(
    matchId: string,
    payload: {
      youtubeInput?: string;
      activeStreamingProvider?: StreamingProvider;
      youtubeStreamStatus?: 'UNKNOWN' | 'READY' | 'LIVE' | 'UNAVAILABLE';
    }
  ): Promise<{
    ok: boolean;
    match: {
      id: string;
      youtubeVideoId: string;
      youtubeStreamStatus: string;
      activeStreamingProvider: StreamingProvider;
    };
  }> {
    const { data } = await adminApi.patch(`/obs/matches/${matchId}/youtube`, payload);
    return data;
  },

  async setAdminOverride(
    matchId: string,
    locked: boolean,
    reason = ''
  ): Promise<{ ok: boolean; profile: ObsControllerProfileData }> {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/override`, { locked, reason });
    return data;
  },

  async capturePreview(
    matchId: string,
    sourceName: string,
    fallbackSourceNames: string[] = []
  ): Promise<{ ok: boolean; sourceName: string; imageData: string }> {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/preview`, {
      sourceName,
      ...(fallbackSourceNames.length > 0 ? { fallbackSourceNames } : {}),
    });
    return data;
  },

  async listAuditLogs(
    matchId: string,
    actionType = ''
  ): Promise<{ logs: BroadcastAuditLogData[] }> {
    const { data } = await adminApi.get(`/obs/matches/${matchId}/audit-logs`, {
      params: actionType ? { actionType } : undefined,
    });
    return data;
  },

  // Smartphone Camera Companion public scoped endpoints
  async getCameraCompanionConfig(cameraDocId: string, token: string) {
    const { data } = await publicApi.get(`/obs/camera-connect/${cameraDocId}`, {
      params: { token },
    });
    return data as {
      camera: {
        id: string;
        matchId: string;
        cameraId: string;
        name: string;
        label: string;
        cameraNumber: number;
        position: string;
        sourceType: string;
        resolution: string;
        fps: number;
        bitrateKbps: number;
        lowBandwidthMode: boolean;
        facingMode: 'environment' | 'user';
        vdoCameraSelectionEnabled?: boolean;
        orientationMode?: CameraOrientationMode;
        previewFit?: CameraPreviewFit;
        portraitBackdropFill?: boolean;
        enabled: boolean;
        status: string;
        operatorName: string;
        audioMuted?: boolean;
        broadcastSessionId?: string;
        pushTokenExpiresAt?: string | null;
        vdoPushUrl: string;
        connectionUrl: string;
      };
      match: {
        id: string;
        matchTitle: string;
        gameName: string;
        tournamentName: string;
        status: string;
      } | null;
    };
  },

  async sendCameraHeartbeat(
    cameraDocId: string,
    token: string,
    payload: {
      status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
      facingMode?: 'environment' | 'user';
      error?: string;
      telemetry?: Record<string, unknown>;
    }
  ) {
    const { data } = await publicApi.post(`/obs/camera-connect/${cameraDocId}/heartbeat`, {
      token,
      ...payload,
    });
    return data;
  },

  async getActiveOverlayTarget(bridgeId?: string): Promise<{
    matchId: string | null;
    bridgeId: string | null;
    source: 'bridge_id' | 'online_bridge' | 'live_stream' | 'none';
  }> {
    const { data } = await publicApi.get('/obs/overlay/active-target', {
      params: bridgeId ? { bridgeId } : undefined,
    });
    return data;
  },

  async switchObsMatchBroadcast(
    matchId: string,
    payload: {
      sourceMatchId?: string;
      targetSceneName?: string;
      keepCurrentObsScene?: boolean;
      syncScoreboardSource?: boolean;
      syncCameraLayout?: boolean;
      copyStyleFromSourceMatch?: boolean;
      scoreboardSourceName?: string;
      override?: boolean;
      matchDetails?: {
        matchTitle?: string;
        teamAName?: string;
        teamBName?: string;
        gameName?: string;
        tournamentName?: string;
        status?: 'UPCOMING' | 'LIVE' | 'ENDED';
        broadcastPublished?: boolean;
        showScoreboardOnYoutube?: boolean;
        youtubeInput?: string;
        activeStreamingProvider?: StreamingProvider;
        overlayPatch?: Record<string, unknown>;
      };
    }
  ): Promise<
    {
      ok: boolean;
      matchId: string;
      sourceMatchId: string | null;
      obsSynced: boolean;
      obsConnected: boolean;
      obsNote: string;
      bridgeUpdated: boolean;
      bridge: ObsBridgeData | null;
      switchedScene: string;
      scoreboardOverlayUrl: string;
      updatedSources: string[];
      matchDetailsUpdated: boolean;
    } & Partial<ObsStudioPayload>
  > {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/switch-obs-broadcast`, payload);
    return data;
  },
};
