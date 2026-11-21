import {
  BroadcastOverlayConfig,
  LiveScoreData,
  LiveStreamData,
  StreamHealthData,
  StreamingProvider,
} from '../../types/index.ts';
import { adminApi, getViewerApi, publicApi } from '../api/httpClient.ts';

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
  }> {
    const { data } = await publicApi.get<{
      stream: LiveStreamData;
      score: LiveScoreData | null;
      overlayConfig: BroadcastOverlayConfig;
    }>(`/live/${id}/overlay`);
    return data;
  },

  async updateOverlayConfig(
    id: string,
    overlayConfig: Partial<BroadcastOverlayConfig>
  ): Promise<{
    streamId: string;
    overlayConfig: BroadcastOverlayConfig;
  }> {
    const { data } = await adminApi.patch<{
      streamId: string;
      overlayConfig: BroadcastOverlayConfig;
    }>(`/live/${id}/overlay`, { overlayConfig });
    return data;
  },
};
