import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Radio,
  Server,
  Wifi,
  WifiOff,
  Youtube,
} from 'lucide-react';
import { LiveStreamData, StreamHealthData } from '../../types/index.ts';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import type { PlayerPlaybackSignal } from './LiveStreamPlayer.tsx';

export type StreamConnectivityStatus = 'Healthy' | 'Degraded' | 'Offline';

export interface StreamStatusIndicatorProps {
  stream: LiveStreamData;
  socketConnected?: boolean;
  playerSignal?: PlayerPlaybackSignal;
  variant?: 'badge' | 'detailed';
  dark?: boolean;
  className?: string;
}

interface MediaMTXSocketSnapshot {
  mediamtxPublishStatus?: LiveStreamData['mediamtxPublishStatus'];
  youtubeStreamStatus?: LiveStreamData['youtubeStreamStatus'];
  streamHealth?: StreamHealthData;
  latencyMs?: number;
  lastEventAt?: string;
}

export function deriveStreamConnectivity(params: {
  isOnline: boolean;
  socketConnected: boolean;
  stream: LiveStreamData;
  liveSnapshot?: MediaMTXSocketSnapshot | null;
  playerSignal?: PlayerPlaybackSignal;
}): {
  status: StreamConnectivityStatus;
  reason: string;
  provider: 'youtube' | 'mediamtx';
  mediamtxPublishStatus: string;
  latencyMs: number | null;
  checkedAt: string | null;
} {
  const { isOnline, socketConnected, stream, liveSnapshot, playerSignal } = params;
  const provider =
    stream.activeStreamingProvider || stream.streamingProvider || 'youtube';
  const mediamtxPublishStatus =
    liveSnapshot?.mediamtxPublishStatus || stream.mediamtxPublishStatus || 'IDLE';
  const streamHealth = liveSnapshot?.streamHealth || stream.streamHealth;
  const latencyMs =
    typeof liveSnapshot?.latencyMs === 'number'
      ? liveSnapshot.latencyMs
      : typeof streamHealth?.latencyMs === 'number' && streamHealth.latencyMs > 0
        ? streamHealth.latencyMs
        : null;
  const checkedAt = streamHealth?.checkedAt || liveSnapshot?.lastEventAt || null;

  if (!isOnline) {
    return {
      status: 'Offline',
      reason: 'Device network connection lost',
      provider,
      mediamtxPublishStatus,
      latencyMs,
      checkedAt,
    };
  }

  if (stream.status === 'ENDED') {
    return {
      status: 'Offline',
      reason: 'Broadcast has ended',
      provider,
      mediamtxPublishStatus,
      latencyMs,
      checkedAt,
    };
  }

  if (provider === 'mediamtx') {
    if (
      mediamtxPublishStatus === 'OFFLINE' ||
      mediamtxPublishStatus === 'ERROR' ||
      (streamHealth && streamHealth.checkedAt && streamHealth.ok === false && ['OFFLINE', 'ERROR'].includes(streamHealth.status))
    ) {
      return {
        status: 'Offline',
        reason: streamHealth?.detail || 'MediaMTX stream publisher is offline',
        provider,
        mediamtxPublishStatus,
        latencyMs,
        checkedAt,
      };
    }

    if (playerSignal === 'error') {
      return {
        status: 'Offline',
        reason: 'MediaMTX playback unreachable',
        provider,
        mediamtxPublishStatus,
        latencyMs,
        checkedAt,
      };
    }

    if (
      !socketConnected ||
      playerSignal === 'buffering' ||
      playerSignal === 'reconnecting' ||
      mediamtxPublishStatus === 'IDLE' ||
      (latencyMs !== null && latencyMs > 2500)
    ) {
      const reason = !socketConnected
        ? 'Live telemetry reconnecting'
        : playerSignal === 'reconnecting' || playerSignal === 'buffering'
          ? 'Video stream buffering or reconnecting'
          : latencyMs !== null && latencyMs > 2500
            ? `High MediaMTX ingest latency (${latencyMs}ms)`
            : 'Awaiting encoder / MediaMTX health confirmation';

      return {
        status: 'Degraded',
        reason,
        provider,
        mediamtxPublishStatus,
        latencyMs,
        checkedAt,
      };
    }

    return {
      status: 'Healthy',
      reason: streamHealth?.detail || 'MediaMTX feed publishing & live sync active',
      provider,
      mediamtxPublishStatus,
      latencyMs,
      checkedAt,
    };
  }

  // YouTube active provider evaluation
  const ytStatus = liveSnapshot?.youtubeStreamStatus || stream.youtubeStreamStatus;
  if (ytStatus === 'UNAVAILABLE' || playerSignal === 'error') {
    return {
      status: 'Offline',
      reason: streamHealth?.detail || 'YouTube stream unavailable',
      provider,
      mediamtxPublishStatus,
      latencyMs,
      checkedAt,
    };
  }

  if (
    !socketConnected ||
    playerSignal === 'buffering' ||
    playerSignal === 'reconnecting' ||
    (latencyMs !== null && latencyMs > 3000)
  ) {
    return {
      status: 'Degraded',
      reason: !socketConnected
        ? 'Real-time score socket reconnecting'
        : 'Video buffering or high latency',
      provider,
      mediamtxPublishStatus,
      latencyMs,
      checkedAt,
    };
  }

  return {
    status: 'Healthy',
    reason: streamHealth?.detail || 'Live stream & real-time telemetry connected',
    provider,
    mediamtxPublishStatus,
    latencyMs,
    checkedAt,
  };
}

export function StreamStatusIndicator({
  stream,
  socketConnected: socketConnectedProp,
  playerSignal,
  variant = 'badge',
  dark = false,
  className = '',
}: StreamStatusIndicatorProps) {
  const isOnline = useOnlineStatus();
  const [liveSnapshot, setLiveSnapshot] = useState<MediaMTXSocketSnapshot | null>(null);
  const [internalSocketConnected, setInternalSocketConnected] = useState<boolean>(() => {
    try {
      return getSocketClient().connected;
    } catch {
      return false;
    }
  });
  const [detailsOpen, setDetailsOpen] = useState(false);

  const socketConnected =
    socketConnectedProp !== undefined ? socketConnectedProp : internalSocketConnected;

  useEffect(() => {
    const streamId = stream.id || stream._id;
    if (!streamId) return;

    let mounted = true;
    const socket = getSocketClient();
    setInternalSocketConnected(socket.connected);
    socket.emit('stream:join', streamId);

    const onConnect = () => {
      if (mounted) setInternalSocketConnected(true);
    };
    const onDisconnect = () => {
      if (mounted) setInternalSocketConnected(false);
    };
    const onMediaMTXStatus = (payload: any) => {
      if (!mounted || payload?.streamId !== streamId) return;
      setLiveSnapshot({
        mediamtxPublishStatus: payload.mediamtxPublishStatus,
        youtubeStreamStatus: payload.youtubeStreamStatus,
        streamHealth: payload.streamHealth,
        latencyMs: payload.latencyMs,
        lastEventAt: payload.checkedAt || new Date().toISOString(),
      });
    };
    const onProviderChanged = (payload: any) => {
      if (!mounted || payload?.streamId !== streamId) return;
      setLiveSnapshot((prev) => ({
        ...prev,
        lastEventAt: payload.switchedAt || new Date().toISOString(),
      }));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('mediamtx:status_changed', onMediaMTXStatus);
    socket.on('stream:health_updated', onMediaMTXStatus);
    socket.on('streaming_provider_changed', onProviderChanged);

    return () => {
      mounted = false;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('mediamtx:status_changed', onMediaMTXStatus);
      socket.off('stream:health_updated', onMediaMTXStatus);
      socket.off('streaming_provider_changed', onProviderChanged);
    };
  }, [stream.id, stream._id]);

  // Reset snapshot when switching to another stream
  useEffect(() => {
    setLiveSnapshot(null);
    setDetailsOpen(false);
  }, [stream.id, stream._id]);

  const assessment = useMemo(
    () =>
      deriveStreamConnectivity({
        isOnline,
        socketConnected,
        stream,
        liveSnapshot,
        playerSignal,
      }),
    [isOnline, socketConnected, stream, liveSnapshot, playerSignal]
  );

  const toneClasses =
    assessment.status === 'Healthy'
      ? dark
        ? 'bg-slate-950/85 border-emerald-500/40 text-emerald-300'
        : 'bg-emerald-50 border-emerald-200 text-emerald-800'
      : assessment.status === 'Degraded'
        ? dark
          ? 'bg-slate-950/85 border-amber-500/50 text-amber-300'
          : 'bg-amber-50 border-amber-300 text-amber-900'
        : dark
          ? 'bg-red-950/90 border-red-500/50 text-red-200'
          : 'bg-red-50 border-red-200 text-red-800';

  const dotClass =
    assessment.status === 'Healthy'
      ? 'bg-emerald-400'
      : assessment.status === 'Degraded'
        ? 'bg-amber-400 animate-pulse'
        : 'bg-red-500';

  const StatusIcon =
    assessment.status === 'Healthy'
      ? Wifi
      : assessment.status === 'Degraded'
        ? AlertTriangle
        : WifiOff;

  if (variant === 'detailed') {
    return (
      <div
        className={`rounded-xl border p-3.5 text-xs ${toneClasses} ${className}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold">
            <span className={`h-2 w-2 rounded-full ${dotClass}`} />
            <StatusIcon className="w-4 h-4" />
            <span>Stream Status: {assessment.status}</span>
            <span className="inline-flex items-center gap-1 opacity-80 font-normal">
              · {assessment.provider === 'mediamtx' ? 'MediaMTX' : 'YouTube'}
            </span>
          </div>
          {assessment.latencyMs !== null && (
            <span className="font-mono tabular-nums font-semibold">
              {assessment.latencyMs}ms
            </span>
          )}
        </div>
        <p className="mt-1 opacity-85">{assessment.reason}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] opacity-80">
          <span>Socket: {socketConnected ? 'Connected' : 'Reconnecting'}</span>
          {assessment.provider === 'mediamtx' && (
            <span>MediaMTX Ingest: {assessment.mediamtxPublishStatus}</span>
          )}
          {assessment.checkedAt && (
            <span>Updated: {new Date(assessment.checkedAt).toLocaleTimeString()}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setDetailsOpen((o) => !o)}
        title={`${assessment.status}: ${assessment.reason}`}
        aria-expanded={detailsOpen}
        aria-label={`Stream connectivity ${assessment.status}: ${assessment.reason}`}
        className={`pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] sm:text-[11px] font-semibold backdrop-blur-md transition cursor-pointer ${toneClasses}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
        <StatusIcon className="w-3 h-3 shrink-0" />
        <span>{assessment.status}</span>
        <span className="opacity-70 hidden sm:inline">
          · {assessment.provider === 'mediamtx' ? 'MediaMTX' : 'YouTube'}
        </span>
        {assessment.latencyMs !== null && assessment.status !== 'Offline' && (
          <span className="hidden md:inline font-mono tabular-nums opacity-75">
            {assessment.latencyMs}ms
          </span>
        )}
        <ChevronDown
          className={`w-3 h-3 opacity-60 transition-transform ${detailsOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {detailsOpen && (
        <div
          className={`pointer-events-auto absolute left-0 top-full mt-1.5 z-50 w-64 rounded-xl border p-3 shadow-xl text-[11px] ${
            dark
              ? 'bg-slate-950/95 border-slate-700 text-slate-200'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-current/10">
            <span className="inline-flex items-center gap-1.5 font-bold">
              <Activity className="w-3.5 h-3.5 text-[#EA580C]" />
              <span>{assessment.status}</span>
            </span>
            <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide text-[10px]">
              {assessment.provider === 'mediamtx' ? (
                <>
                  <Server className="w-3 h-3 text-orange-400" />
                  <span>MediaMTX</span>
                </>
              ) : (
                <>
                  <Youtube className="w-3 h-3 text-red-400" />
                  <span>YouTube</span>
                </>
              )}
            </span>
          </div>

          <p className="mt-2 leading-relaxed opacity-90">{assessment.reason}</p>

          <dl className="mt-2.5 space-y-1 text-[10px]">
            <div className="flex justify-between gap-2">
              <dt className="opacity-65">Network</dt>
              <dd className="font-semibold">{isOnline ? 'Online' : 'Offline'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="opacity-65">Live Socket</dt>
              <dd className="font-semibold inline-flex items-center gap-1">
                <Radio className="w-2.5 h-2.5" />
                {socketConnected ? 'Connected' : 'Reconnecting'}
              </dd>
            </div>
            {assessment.provider === 'mediamtx' && (
              <div className="flex justify-between gap-2">
                <dt className="opacity-65">MediaMTX Feed</dt>
                <dd className="font-mono font-semibold">{assessment.mediamtxPublishStatus}</dd>
              </div>
            )}
            {assessment.latencyMs !== null && (
              <div className="flex justify-between gap-2">
                <dt className="opacity-65">Probe Latency</dt>
                <dd className="font-mono font-semibold tabular-nums">{assessment.latencyMs}ms</dd>
              </div>
            )}
            {assessment.checkedAt && (
              <div className="flex justify-between gap-2">
                <dt className="opacity-65">Last Event</dt>
                <dd className="font-mono tabular-nums">
                  {new Date(assessment.checkedAt).toLocaleTimeString()}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
