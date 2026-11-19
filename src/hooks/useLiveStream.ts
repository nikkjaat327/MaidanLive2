import { useCallback, useEffect, useState } from 'react';
import { LiveStreamData } from '../types/index.ts';
import { liveStreamService } from '../services/liveStream/liveStreamService.ts';
import { extractApiError } from '../services/api/httpClient.ts';
import { getSocketClient } from '../services/socket/socketClient.ts';

export function useLiveStream(streamId?: string) {
  const [stream, setStream] = useState<LiveStreamData | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(streamId));
  const [error, setError] = useState<string | null>(null);

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
  }, [streamId]);

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

    socket.on('live:updated', handleUpdated);
    socket.on('live:started', handleUpdated);
    socket.on('live:ended', handleEnded);

    return () => {
      socket.off('live:updated', handleUpdated);
      socket.off('live:started', handleUpdated);
      socket.off('live:ended', handleEnded);
    };
  }, [streamId]);

  return { stream, setStream, loading, error, refetch: fetchStream };
}
