import { adminApi, publicApi } from '../api/httpClient.ts';
import type {
  BroadcastAuditLogData,
  BroadcastCameraData,
  BroadcastSceneData,
  ObsControllerProfileData,
  ObsStudioPayload,
} from '../../types/obs.ts';
import type { ObsLayoutType } from '../../utils/obsLayoutGeometry.ts';

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

  async createCamera(
    matchId: string,
    payload: Partial<BroadcastCameraData>
  ): Promise<{
    camera: BroadcastCameraData;
    mobileConnectUrl: string;
    pushToken: string;
  }> {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/cameras`, payload);
    return data;
  },

  async scaffoldCameras(matchId: string, count: number): Promise<{ created: BroadcastCameraData[] }> {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/cameras/scaffold`, { count });
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

  async deleteCamera(matchId: string, cameraId: string): Promise<void> {
    await adminApi.delete(`/obs/matches/${matchId}/cameras/${cameraId}`);
  },

  async reorderCameras(matchId: string, orderedIds: string[]): Promise<void> {
    await adminApi.patch(`/obs/matches/${matchId}/cameras/reorder`, { orderedIds });
  },

  async rotateCameraToken(
    matchId: string,
    cameraId: string
  ): Promise<{ pushToken: string; pushTokenPrefix: string; mobileConnectUrl: string }> {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/cameras/${cameraId}/rotate-token`);
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

  async applyLayout(
    matchId: string,
    payload: {
      layoutType: ObsLayoutType;
      cameraIds: string[];
      mainCameraId?: string;
      sceneName?: string;
      includeScoreboardOverlay?: boolean;
      override?: boolean;
    }
  ) {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/layouts/apply`, payload);
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
    sourceName: string
  ): Promise<{ ok: boolean; sourceName: string; imageData: string }> {
    const { data } = await adminApi.post(`/obs/matches/${matchId}/preview`, { sourceName });
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
        enabled: boolean;
        status: string;
        operatorName: string;
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
};
