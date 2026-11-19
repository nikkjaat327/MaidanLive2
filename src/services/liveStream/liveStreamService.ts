import { LiveStreamData } from '../../types/index.ts';
import { adminApi, publicApi } from '../api/httpClient.ts';

export interface YouTubeVerification {
  validId: boolean;
  videoId: string | null;
  available: boolean;
  embeddable: boolean;
  title?: string;
  authorName?: string;
  message: string;
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
    const { data } = await publicApi.get<{ streams: LiveStreamData[] }>('/live', { params });
    return data.streams;
  },

  async listActiveStreams(): Promise<LiveStreamData[]> {
    const { data } = await publicApi.get<{ streams: LiveStreamData[] }>('/live/active');
    return data.streams;
  },

  async listStreamHistory(): Promise<LiveStreamData[]> {
    const { data } = await publicApi.get<{ streams: LiveStreamData[] }>('/live/history');
    return data.streams;
  },

  async listReplays(all = false, gameName?: string): Promise<LiveStreamData[]> {
    const { data } = await publicApi.get<{ replays: LiveStreamData[] }>('/live/replays', {
      params: {
        ...(all ? { all: 'true' } : {}),
        ...(gameName ? { gameName } : {}),
      },
    });
    return data.replays;
  },

  async getStreamById(id: string): Promise<LiveStreamData> {
    const { data } = await publicApi.get<{ stream: LiveStreamData }>(`/live/${id}`);
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
};
