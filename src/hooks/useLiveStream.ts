import { useCallback, useEffect, useState } from 'react';
import { LiveStreamData } from '../types/index.ts';
import { liveStreamService } from '../services/liveStream/liveStreamService.ts';
import { extractApiError } from '../services/api/httpClient.ts';
import { getSocketClient } from '../services/socket/socketClient.ts';

export function useLiveStream(streamId?: string, authKey = '') {
  const [stream, setStream] = useState<LiveStreamData | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(streamId));
  const [error, setError] = useState<string | null>(null);
  const [switchingBanner, setSwitchingBanner] = useState(false);

  const fetchStream = useCallback(async () => {
    if (!streamId) return;
    try {
      setError(null);
      const data = await liveStreamService.getStreamById(streamId);
      setStream(data);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load stream.'));
    } finally {
      setLoading(false);
    }
  }, [streamId, authKey]);

  useEffect(() => {
    if (!streamId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchStream();
  }, [streamId, fetchStream]);

  useEffect(() => {
    if (!streamId) return;
    const socket = getSocketClient();

    const handleUpdated = (updated: LiveStreamData) => {
      if (updated.id === streamId || updated._id === streamId) {
        setStream((prev) => (prev ? { ...prev, ...updated } : updated));
      }
    };

    const handleEnded = (ended: LiveStreamData) => {
      if (ended.id === streamId || ended._id === streamId) {
        setStream((prev) => (prev ? { ...prev, ...ended, status: 'ENDED' } : ended));
      }
    };

    const handleProviderChanged = (payload: any) => {
      if (payload?.streamId !== streamId) return;
      setSwitchingBanner(true);
      setStream((prev) =>
        prev
          ? {
              ...prev,
              streamingProvider: payload.activeStreamingProvider || payload.toProvider,
              activeStreamingProvider: payload.activeStreamingProvider || payload.toProvider,
              youtubeVideoId: payload.youtubeVideoId || prev.youtubeVideoId,
              mediamtxPlaybackUrl: payload.mediamtxPlaybackUrl ?? prev.mediamtxPlaybackUrl,
              mediamtxWebrtcUrl: payload.mediamtxWebrtcUrl ?? prev.mediamtxWebrtcUrl,
            }
          : prev
      );
      window.setTimeout(() => setSwitchingBanner(false), 3500);
    };

    const handleViewerUpdate = (payload: {
      streamId?: string;
      targetId?: string;
      viewers: number | null;
      visibility?: string;
    }) => {
      const target = payload?.streamId || payload?.targetId;
      if (target !== streamId) return;
      setStream((prev) =>
        prev
          ? {
              ...prev,
              activeViewers: payload.viewers,
              viewerCountVisibility: (payload.visibility as any) || prev.viewerCountVisibility,
            }
          : prev
      );
    };

    const handleHealthUpdated = (payload: {
      streamId?: string;
      provider?: 'youtube' | 'mediamtx';
      mediamtxPublishStatus?: LiveStreamData['mediamtxPublishStatus'];
      youtubeStreamStatus?: LiveStreamData['youtubeStreamStatus'];
      streamHealth?: LiveStreamData['streamHealth'];
    }) => {
      if (payload?.streamId !== streamId) return;
      setStream((prev) =>
        prev
          ? {
              ...prev,
              mediamtxPublishStatus: payload.mediamtxPublishStatus ?? prev.mediamtxPublishStatus,
              youtubeStreamStatus: payload.youtubeStreamStatus ?? prev.youtubeStreamStatus,
              streamHealth: payload.streamHealth ?? prev.streamHealth,
            }
          : prev
      );
    };

    let hasConnectedOnce = socket.connected;
    const handleConnect = () => {
      if (hasConnectedOnce) {
        fetchStream();
      }
      hasConnectedOnce = true;
    };

    socket.on('live:updated', handleUpdated);
    socket.on('live:started', handleUpdated);
    socket.on('live:ended', handleEnded);
    socket.on('streaming_provider_changed', handleProviderChanged);
    socket.on('mediamtx:status_changed', handleHealthUpdated);
    socket.on('stream:health_updated', handleHealthUpdated);
    socket.on('stream:viewers', handleViewerUpdate);
    socket.on('viewer:count_updated', handleViewerUpdate);
    socket.on('connect', handleConnect);

    return () => {
      socket.off('live:updated', handleUpdated);
      socket.off('live:started', handleUpdated);
      socket.off('live:ended', handleEnded);
      socket.off('streaming_provider_changed', handleProviderChanged);
      socket.off('mediamtx:status_changed', handleHealthUpdated);
      socket.off('stream:health_updated', handleHealthUpdated);
      socket.off('stream:viewers', handleViewerUpdate);
      socket.off('viewer:count_updated', handleViewerUpdate);
      socket.off('connect', handleConnect);
    };
  }, [streamId, fetchStream]);

  return { stream, setStream, loading, error, switchingBanner, refetch: fetchStream };
}
