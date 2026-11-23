import { adminApi } from '../api/httpClient.ts';
import type {
  BroadcastAdDesignData,
  BroadcastAdQueueItem,
  BroadcastGraphicEventRule,
  BroadcastGraphicEventTrigger,
  BroadcastGraphicsAssetData,
  BroadcastGraphicsStateData,
  GraphicsAnimationStyle,
  GraphicsAssetType,
  GraphicsDesignType,
  GraphicsElement,
  GraphicsOverlapPolicy,
  GraphicsScope,
} from '../../types/broadcastGraphics.ts';

export const broadcastGraphicsService = {
  // Assets
  async listAssets(params?: {
    matchId?: string;
    tournamentId?: string;
    assetType?: GraphicsAssetType;
  }): Promise<BroadcastGraphicsAssetData[]> {
    const { data } = await adminApi.get<{ assets: BroadcastGraphicsAssetData[] }>(
      '/obs/graphics/assets',
      { params }
    );
    return data.assets || [];
  },

  async uploadAsset(params: {
    file: File;
    name?: string;
    assetType: GraphicsAssetType;
    scope: GraphicsScope;
    matchId?: string;
    tournamentId?: string | null;
    width?: number;
    height?: number;
  }): Promise<BroadcastGraphicsAssetData> {
    const form = new FormData();
    form.append('file', params.file);
    if (params.name) form.append('name', params.name);
    form.append('assetType', params.assetType);
    form.append('scope', params.scope);
    if (params.matchId) form.append('matchId', params.matchId);
    if (params.tournamentId) form.append('tournamentId', params.tournamentId);
    if (params.width) form.append('width', String(params.width));
    if (params.height) form.append('height', String(params.height));

    const { data } = await adminApi.post<{ asset: BroadcastGraphicsAssetData }>(
      '/obs/graphics/assets',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data.asset;
  },

  async replaceAsset(
    assetId: string,
    file: File,
    dims?: { width?: number; height?: number }
  ): Promise<BroadcastGraphicsAssetData> {
    const form = new FormData();
    form.append('file', file);
    if (dims?.width) form.append('width', String(dims.width));
    if (dims?.height) form.append('height', String(dims.height));

    const { data } = await adminApi.put<{ asset: BroadcastGraphicsAssetData }>(
      `/obs/graphics/assets/${assetId}/replace`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data.asset;
  },

  async deleteAsset(assetId: string): Promise<void> {
    await adminApi.delete(`/obs/graphics/assets/${assetId}`);
  },

  // Saved Advertisements & Templates
  async listDesigns(params?: {
    matchId?: string;
    tournamentId?: string | null;
    scope?: 'all' | GraphicsScope;
    isTemplate?: boolean;
    search?: string;
  }): Promise<BroadcastAdDesignData[]> {
    const { data } = await adminApi.get<{ designs: BroadcastAdDesignData[] }>(
      '/obs/graphics/designs',
      {
        params: {
          ...(params?.matchId ? { matchId: params.matchId } : {}),
          ...(params?.tournamentId ? { tournamentId: params.tournamentId } : {}),
          ...(params?.scope ? { scope: params.scope } : {}),
          ...(params?.isTemplate !== undefined
            ? { isTemplate: String(params.isTemplate) }
            : {}),
          ...(params?.search ? { search: params.search } : {}),
        },
      }
    );
    return data.designs || [];
  },

  async saveDesign(payload: {
    name: string;
    designType?: GraphicsDesignType;
    isTemplate?: boolean;
    scope: GraphicsScope;
    tournamentId?: string | null;
    matchId?: string | null;
    canvasWidth: number;
    canvasHeight: number;
    layoutPreset?: string;
    elements: GraphicsElement[];
    entryAnimation: GraphicsAnimationStyle;
    exitAnimation: GraphicsAnimationStyle;
    defaultDurationSeconds: number;
    thumbnailDataUrl?: string;
  }): Promise<BroadcastAdDesignData> {
    const { data } = await adminApi.post<{ design: BroadcastAdDesignData }>(
      '/obs/graphics/designs',
      payload
    );
    return data.design;
  },

  async updateDesign(
    designId: string,
    payload: Partial<{
      name: string;
      designType: GraphicsDesignType;
      isTemplate: boolean;
      scope: GraphicsScope;
      tournamentId: string | null;
      matchId: string | null;
      canvasWidth: number;
      canvasHeight: number;
      layoutPreset: string;
      elements: GraphicsElement[];
      entryAnimation: GraphicsAnimationStyle;
      exitAnimation: GraphicsAnimationStyle;
      defaultDurationSeconds: number;
      thumbnailDataUrl: string;
    }>
  ): Promise<BroadcastAdDesignData> {
    const { data } = await adminApi.patch<{ design: BroadcastAdDesignData }>(
      `/obs/graphics/designs/${designId}`,
      payload
    );
    return data.design;
  },

  async duplicateDesign(designId: string, name?: string): Promise<BroadcastAdDesignData> {
    const { data } = await adminApi.post<{ design: BroadcastAdDesignData }>(
      `/obs/graphics/designs/${designId}/duplicate`,
      { name }
    );
    return data.design;
  },

  async deleteDesign(designId: string): Promise<void> {
    await adminApi.delete(`/obs/graphics/designs/${designId}`);
  },

  // Live Broadcast Playback, Queue & Event Triggers
  async getMatchState(matchId: string): Promise<BroadcastGraphicsStateData> {
    const { data } = await adminApi.get<{ graphicsState: BroadcastGraphicsStateData }>(
      `/obs/graphics/matches/${matchId}/state`
    );
    return data.graphicsState;
  },

  async applyLive(
    matchId: string,
    payload: {
      designId?: string | null;
      name: string;
      canvasWidth: number;
      canvasHeight: number;
      elements: GraphicsElement[];
      entryAnimation: GraphicsAnimationStyle;
      exitAnimation: GraphicsAnimationStyle;
      durationSeconds: number;
      overlapPolicy?: GraphicsOverlapPolicy;
    }
  ): Promise<BroadcastGraphicsStateData> {
    const { data } = await adminApi.post<{ graphicsState: BroadcastGraphicsStateData }>(
      `/obs/graphics/matches/${matchId}/apply-live`,
      payload
    );
    return data.graphicsState;
  },

  async showSavedLive(
    matchId: string,
    designId: string,
    opts?: {
      durationSecondsOverride?: number | null;
      overlapPolicy?: GraphicsOverlapPolicy;
    }
  ): Promise<{ graphicsState: BroadcastGraphicsStateData; design: BroadcastAdDesignData }> {
    const { data } = await adminApi.post<{
      graphicsState: BroadcastGraphicsStateData;
      design: BroadcastAdDesignData;
    }>(`/obs/graphics/matches/${matchId}/designs/${designId}/show-live`, opts || {});
    return data;
  },

  async hideLive(matchId: string, instanceId?: string): Promise<BroadcastGraphicsStateData> {
    const { data } = await adminApi.post<{ graphicsState: BroadcastGraphicsStateData }>(
      `/obs/graphics/matches/${matchId}/hide`,
      { instanceId }
    );
    return data.graphicsState;
  },

  async clearLive(matchId: string): Promise<BroadcastGraphicsStateData> {
    const { data } = await adminApi.post<{ graphicsState: BroadcastGraphicsStateData }>(
      `/obs/graphics/matches/${matchId}/clear`
    );
    return data.graphicsState;
  },

  async pauseAnimations(matchId: string, paused: boolean): Promise<BroadcastGraphicsStateData> {
    const { data } = await adminApi.post<{ graphicsState: BroadcastGraphicsStateData }>(
      `/obs/graphics/matches/${matchId}/pause-animation`,
      { paused }
    );
    return data.graphicsState;
  },

  async updateSettings(
    matchId: string,
    payload: {
      overlapPolicy?: GraphicsOverlapPolicy;
      eventRules?: BroadcastGraphicEventRule[];
    }
  ): Promise<BroadcastGraphicsStateData> {
    const { data } = await adminApi.put<{ graphicsState: BroadcastGraphicsStateData }>(
      `/obs/graphics/matches/${matchId}/settings`,
      payload
    );
    return data.graphicsState;
  },

  async updateQueue(
    matchId: string,
    payload: {
      queue: BroadcastAdQueueItem[];
      queueAutoAdvance?: boolean;
    }
  ): Promise<BroadcastGraphicsStateData> {
    const { data } = await adminApi.put<{ graphicsState: BroadcastGraphicsStateData }>(
      `/obs/graphics/matches/${matchId}/queue`,
      payload
    );
    return data.graphicsState;
  },

  async controlQueue(
    matchId: string,
    action: 'start' | 'play_next' | 'pause' | 'stop'
  ): Promise<BroadcastGraphicsStateData> {
    const { data } = await adminApi.post<{ graphicsState: BroadcastGraphicsStateData }>(
      `/obs/graphics/matches/${matchId}/queue/control`,
      { action }
    );
    return data.graphicsState;
  },

  async testEventTrigger(
    matchId: string,
    trigger: BroadcastGraphicEventTrigger
  ): Promise<{ triggered: boolean; graphicsState: BroadcastGraphicsStateData }> {
    const { data } = await adminApi.post<{
      triggered: boolean;
      graphicsState: BroadcastGraphicsStateData;
    }>(`/obs/graphics/matches/${matchId}/event-rules/test`, { trigger });
    return data;
  },
};
