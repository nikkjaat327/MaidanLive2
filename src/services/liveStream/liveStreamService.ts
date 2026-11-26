import {
  BroadcastOverlayConfig,
  LiveScoreData,
  LiveStreamData,
  StreamHealthData,
  StreamingProvider,
} from '../../types/index.ts';
import { adminApi, getViewerApi, publicApi } from '../api/httpClient.ts';
import type { BroadcastGraphicsStateData } from '../../types/broadcastGraphics.ts';

export interface YouTubeVerification {
  validId: boolean;
  videoId: string | null;
  available: boolean;
  embeddable: boolean;
  liveBroadcastStatus?: 'LIVE' | 'UPCOMING' | 'VOD' | 'UNKNOWN';
  title?: string;
  authorName?: string;
  message: string;
}

export interface AdminStreamConfigResponse {
  streamId: string;
  streamingProvider: StreamingProvider;
  activeStreamingProvider: StreamingProvider;
  youtubeVideoId: string;
  youtubeStreamStatus: string;
  mediamtxStreamPath: string;
  mediamtxStreamKey: string;
  mediamtxRtmpPublishUrl: string;
  mediamtxRtmpServerUrl: string;
  mediamtxPlaybackUrl: string;
  mediamtxWebrtcUrl: string;
  mediamtxPublishStatus: string;
  streamHealth: StreamHealthData;
  providerSwitchHistory: any[];
  viewerCountVisibility: 'public' | 'admin_only' | 'hidden';
}

export const liveStreamService = {
  async listStreams(params?: {
    status?: string;
    gameName?: string;
    tournamentId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<LiveStreamData[]> {
    const { data } = await getViewerApi().get<{ streams: LiveStreamData[] }>('/live', { params });
    if (!Array.isArray(data?.streams)) {
      throw new Error('Invalid response from server: expected a streams array.');
    }
    return data.streams;
  },

  async listActiveStreams(): Promise<LiveStreamData[]> {
    const { data } = await getViewerApi().get<{ streams: LiveStreamData[] }>('/live/active');
    return data.streams;
  },

  async listStreamHistory(): Promise<LiveStreamData[]> {
    const { data } = await getViewerApi().get<{ streams: LiveStreamData[] }>('/live/history');
    return data.streams;
  },

  async listReplays(all = false, gameName?: string): Promise<LiveStreamData[]> {
    const { data } = await getViewerApi().get<{ replays: LiveStreamData[] }>('/live/replays', {
      params: {
        ...(all ? { all: 'true' } : {}),
        ...(gameName ? { gameName } : {}),
      },
    });
    if (!Array.isArray(data?.replays)) {
      throw new Error('Invalid response from server: expected a replays array.');
    }
    return data.replays;
  },

  async getStreamById(id: string): Promise<LiveStreamData> {
    const { data } = await getViewerApi().get<{ stream: LiveStreamData }>(`/live/${id}`);
    return data.stream;
  },

  async verifyYouTubeVideo(youtubeInput: string): Promise<YouTubeVerification> {
    const { data } = await adminApi.post<YouTubeVerification>('/live/verify-youtube', {
      youtubeInput,
    });
    return data;
  },

  async createStream(payload: Record<string, unknown>): Promise<LiveStreamData> {
    const { data } = await adminApi.post<{ stream: LiveStreamData }>('/live', payload);
    return data.stream;
  },

  async initializeMatch(payload: Record<string, unknown>): Promise<{
    stream: LiveStreamData;
    adminStreamConfig?: AdminStreamConfigResponse;
  }> {
    const { data } = await adminApi.post<{
      stream: LiveStreamData;
      adminStreamConfig?: AdminStreamConfigResponse;
    }>('/live/initialize', payload);
    return data;
  },

  async connectYouTube(
    id: string,
    payload: {
      youtubeInput?: string;
      activeStreamingProvider?: StreamingProvider;
      youtubeStreamStatus?: 'UNKNOWN' | 'READY' | 'LIVE' | 'UNAVAILABLE';
      verify?: boolean;
    }
  ): Promise<{
    stream: LiveStreamData;
    verification?: YouTubeVerification | null;
  }> {
    const { data } = await adminApi.patch<{
      stream: LiveStreamData;
      verification?: YouTubeVerification | null;
    }>(`/live/${id}/youtube`, payload);
    return data;
  },

  async activateBroadcast(
    id: string,
    payload?: {
      youtubeInput?: string;
      activeStreamingProvider?: StreamingProvider;
      showScoreboardOnYoutube?: boolean;
    }
  ): Promise<{ stream: LiveStreamData }> {
    const { data } = await adminApi.post<{ stream: LiveStreamData }>(
      `/live/${id}/activate`,
      payload || {}
    );
    return data;
  },

  async updateStream(id: string, payload: Record<string, unknown>): Promise<LiveStreamData> {
    const { data } = await adminApi.patch<{ stream: LiveStreamData }>(`/live/${id}`, payload);
    return data.stream;
  },

  async endStream(id: string): Promise<{ stream: LiveStreamData; note?: string }> {
    const { data } = await adminApi.patch<{ stream: LiveStreamData; note?: string }>(
      `/live/${id}/end`
    );
    return data;
  },

  async deleteStream(id: string): Promise<{ deleted: boolean; id: string; message: string }> {
    const { data } = await adminApi.delete<{ deleted: boolean; id: string; message: string }>(
      `/live/${id}`
    );
    return data;
  },

  async updateReplay(
    id: string,
    payload: {
      replayInput?: string;
      replayPublished?: boolean;
      replayDescription?: string;
    }
  ): Promise<LiveStreamData> {
    const { data } = await adminApi.patch<{ stream: LiveStreamData }>(
      `/live/${id}/replay`,
      payload
    );
    return data.stream;
  },

  async getAdminStreamConfig(id: string): Promise<AdminStreamConfigResponse> {
    const { data } = await adminApi.get<AdminStreamConfigResponse>(`/live/${id}/stream-config`);
    return data;
  },

  async verifyStreamHealth(
    id: string,
    provider?: StreamingProvider
  ): Promise<{
    provider: StreamingProvider;
    ok: boolean;
    playable: boolean;
    latencyMs?: number;
    checkedAt?: string;
    message: string;
    streamHealth?: StreamHealthData;
  }> {
    const { data } = await adminApi.post(`/live/${id}/verify-health`, { provider });
    return data;
  },

  async switchProvider(
    id: string,
    payload: {
      toProvider: StreamingProvider;
      reason?: string;
      youtubeInput?: string;
      mediamtxStreamPath?: string;
      mediamtxPlaybackUrl?: string;
      mediamtxWebrtcUrl?: string;
    }
  ): Promise<{
    message: string;
    fromProvider: StreamingProvider;
    toProvider: StreamingProvider;
    stream: LiveStreamData;
  }> {
    const { data } = await adminApi.post(`/live/${id}/switch-provider`, payload);
    return data;
  },

  async getOverlayData(id: string): Promise<{
    stream: LiveStreamData;
    score: LiveScoreData | null;
    overlayConfig: BroadcastOverlayConfig;
    graphicsState?: BroadcastGraphicsStateData;
    obsLayout?: {
      activeLayoutType?: string;
      activeCameraId?: string;
      activeCameraIds?: string[];
      activePipPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
      activePipSize?: 'small' | 'medium' | 'large';
      activeObsScene?: string;
    } | null;
    brandLogoUrl?: string;
    serverNowIso?: string;
  }> {
    const { data } = await publicApi.get<{
      stream: LiveStreamData;
      score: LiveScoreData | null;
      overlayConfig: BroadcastOverlayConfig;
      graphicsState?: BroadcastGraphicsStateData;
      obsLayout?: {
        activeLayoutType?: string;
        activeCameraId?: string;
        activeCameraIds?: string[];
        activePipPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
        activePipSize?: 'small' | 'medium' | 'large';
        activeObsScene?: string;
      } | null;
      brandLogoUrl?: string;
      serverNowIso?: string;
    }>(`/live/${id}/overlay`, {
      params: { _t: Date.now() },
      headers: {
        'Cache-Control': 'no-cache, no-store',
        Pragma: 'no-cache',
      },
    });
    return data;
  },

  async updateOverlayConfig(
    id: string,
    overlayConfig: Partial<BroadcastOverlayConfig>
  ): Promise<{
    streamId: string;
    overlayConfig: BroadcastOverlayConfig;
    serverNowIso?: string;
  }> {
    const { data } = await adminApi.patch<{
      streamId: string;
      overlayConfig: BroadcastOverlayConfig;
      serverNowIso?: string;
    }>(`/live/${id}/overlay`, { overlayConfig });
    return data;
  },

  async triggerEventAnimation(
    id: string,
    payload: {
      eventKey: string;
      styleId?: string;
      teamSide?: 'A' | 'B';
      teamName?: string;
      teamColor?: string;
      playerName?: string;
      subtitle?: string;
      pointsLabel?: string;
    }
  ): Promise<{ ok: boolean; eventId: string }> {
    const { data } = await adminApi.post<{ ok: boolean; eventId: string }>(
      `/live/${id}/overlay/trigger-event-animation`,
      payload
    );
    return data;
  },
};
