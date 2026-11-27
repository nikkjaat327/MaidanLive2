import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  Camera,
  ExternalLink,
  FlipHorizontal,
  Lock,
  Mic,
  MicOff,
  Power,
  Radio,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Smartphone,
  Wifi,
} from 'lucide-react';
import { obsStudioService } from '../../services/obs/obsStudioService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { resolveApiUrl } from '../../utils/appOrigin.ts';
import { isolateVdoPushUrl } from '../../utils/obsTransformGeometry.ts';

interface CompanionState {
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
}

function readNetworkType(): string {
  if (typeof navigator === 'undefined') return '';
  const conn = (navigator as unknown as { connection?: { effectiveType?: string; type?: string } }).connection;
  return conn?.effectiveType || conn?.type || '';
}

function readViewportOrientation(): {
  deviceOrientation: string;
  orientationAngle: number;
  viewportWidth: number;
  viewportHeight: number;
  isLandscape: boolean;
} {
  if (typeof window === 'undefined') {
    return {
      deviceOrientation: 'landscape-primary',
      orientationAngle: 0,
      viewportWidth: 1280,
      viewportHeight: 720,
      isLandscape: true,
    };
  }
  const vw = Math.round(window.innerWidth || 0);
  const vh = Math.round(window.innerHeight || 0);
  const rawType = window.screen?.orientation?.type || '';
  const angle = Number(window.screen?.orientation?.angle ?? (vw >= vh ? 90 : 0));
  const isLandscape = rawType
    ? rawType.toLowerCase().includes('landscape')
    : vw >= vh;
  const deviceOrientation = rawType || (isLandscape ? 'landscape-primary' : 'portrait-primary');
  return {
    deviceOrientation,
    orientationAngle: Number.isFinite(angle) ? angle : 0,
    viewportWidth: vw,
    viewportHeight: vh,
    isLandscape,
  };
}

export function CameraCompanionPage() {
  const { cameraDocId } = useParams<{ cameraDocId: string }>();
  const [searchParams] = useSearchParams();
  const token = (searchParams.get('token') || '').trim();

  const [data, setData] = useState<CompanionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [audioMuted, setAudioMuted] = useState(false);
  const [streamingActive, setStreamingActive] = useState(false);
  const [embedVdoFrame, setEmbedVdoFrame] = useState(false);
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<string | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [batteryCharging, setBatteryCharging] = useState<boolean | null>(null);
  const [networkType, setNetworkType] = useState<string>(readNetworkType());
  const [orientationState, setOrientationState] = useState(() => readViewportOrientation());
  const [orientationLockMsg, setOrientationLockMsg] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    if (!cameraDocId || !token) {
      setError('Missing camera ID or scoped connection token in the link.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await obsStudioService.getCameraCompanionConfig(cameraDocId, token);
      setData(res);
      setFacingMode(res.camera.facingMode || 'environment');
      setAudioMuted(Boolean(res.camera.audioMuted));
    } catch (err) {
      setError(extractApiError(err, 'Invalid, revoked, or expired camera companion link.'));
    } finally {
      setLoading(false);
    }
  }, [cameraDocId, token]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Real browser battery & network telemetry
  useEffect(() => {
    let mounted = true;
    const nav = navigator as unknown as {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        addEventListener?: (ev: string, cb: () => void) => void;
      }>;
    };
    if (typeof nav.getBattery === 'function') {
      nav
        .getBattery()
        .then((bat) => {
          if (!mounted) return;
          const sync = () => {
            setBatteryLevel(Math.round(bat.level * 100));
            setBatteryCharging(bat.charging);
          };
          sync();
          bat.addEventListener?.('levelchange', sync);
          bat.addEventListener?.('chargingchange', sync);
        })
        .catch(() => {});
    }

    const syncOrientation = () => {
      setOrientationState(readViewportOrientation());
    };
    window.addEventListener('resize', syncOrientation);
    window.addEventListener('orientationchange', syncOrientation);
    try {
      window.screen?.orientation?.addEventListener?.('change', syncOrientation);
    } catch {
      // Ignore unsupported orientation event listener
    }

    const interval = window.setInterval(() => {
      setNetworkType(readNetworkType());
      setOrientationState(readViewportOrientation());
    }, 5000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener('resize', syncOrientation);
      window.removeEventListener('orientationchange', syncOrientation);
      try {
        window.screen?.orientation?.removeEventListener?.('change', syncOrientation);
      } catch {
        // Ignore cleanup failure
      }
    };
  }, []);

  const pushHeartbeat = useCallback(
    async (
      status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR',
      errMsg = '',
      overrideMuted?: boolean
    ) => {
      if (!cameraDocId || !token) return;
      try {
        const res = await obsStudioService.sendCameraHeartbeat(cameraDocId, token, {
          status,
          facingMode,
          ...(errMsg ? { error: errMsg } : {}),
          telemetry: {
            networkType,
            batteryLevel,
            batteryCharging,
            resolutionActual: data?.camera.resolution || '',
            fpsActual: data?.camera.fps || null,
            audioMuted: overrideMuted !== undefined ? overrideMuted : audioMuted,
            deviceOrientation: orientationState.deviceOrientation,
            orientationAngle: orientationState.orientationAngle,
            viewportWidth: orientationState.viewportWidth,
            viewportHeight: orientationState.viewportHeight,
          },
        });
        setLastHeartbeatAt(res.lastHeartbeatAt || new Date().toISOString());
      } catch {
        // Ignore transient offline drop; next 10s interval retries
      }
    },
    [
      cameraDocId,
      token,
      facingMode,
      networkType,
      batteryLevel,
      batteryCharging,
      audioMuted,
      orientationState.deviceOrientation,
      orientationState.orientationAngle,
      orientationState.viewportWidth,
      orientationState.viewportHeight,
      data?.camera.resolution,
      data?.camera.fps,
    ]
  );

  // Send periodic 10s heartbeat while companion feed is active
  useEffect(() => {
    if (!streamingActive) return;
    pushHeartbeat('CONNECTED');
    const timer = window.setInterval(() => {
      pushHeartbeat('CONNECTED');
    }, 10_000);

    const onBeforeUnload = () => {
      if (!cameraDocId || !token || typeof navigator.sendBeacon !== 'function') return;
      const body = new Blob(
        [
          JSON.stringify({
            token,
            status: 'DISCONNECTED',
            facingMode,
          }),
        ],
        { type: 'application/json' }
      );
      navigator.sendBeacon(
        resolveApiUrl(`/obs/camera-connect/${cameraDocId}/heartbeat`),
        body
      );
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [streamingActive, pushHeartbeat, cameraDocId, token, facingMode]);

  const includeCameraSelection = Boolean(data?.camera.vdoCameraSelectionEnabled);

  // Adjust camera selection & mute state inside VDO.Ninja URL dynamically while enforcing publisher isolation
  const effectivePushUrl = useMemo(() => {
    const raw = data?.camera.vdoPushUrl || data?.camera.connectionUrl || '';
    if (!raw) return '';
    try {
      const isolated = isolateVdoPushUrl(raw, { includeCameraSelection });
      const u = new URL(isolated);
      if (u.hostname.toLowerCase().includes('vdo.ninja')) {
        u.searchParams.delete('facingmode');
        u.searchParams.delete('facing');
        if (includeCameraSelection) {
          u.searchParams.set('videodevice', facingMode === 'user' ? 'front' : 'back');
        } else {
          u.searchParams.delete('videodevice');
        }
        if (audioMuted) {
          u.searchParams.set('mute', '1');
        } else {
          u.searchParams.delete('mute');
        }
      }
      return u.toString();
    } catch {
      return raw;
    }
  }, [data?.camera.vdoPushUrl, data?.camera.connectionUrl, includeCameraSelection, facingMode, audioMuted]);

  async function handleLockLandscape() {
    setOrientationLockMsg(null);
    try {
      const orientationApi = window.screen?.orientation as unknown as {
        lock?: (mode: string) => Promise<void>;
      };
      if (orientationApi && typeof orientationApi.lock === 'function') {
        await orientationApi.lock('landscape');
        setOrientationState(readViewportOrientation());
        setOrientationLockMsg('Landscape orientation locked.');
        return;
      }
      setOrientationLockMsg(
        'Browser orientation lock is unavailable here (common on iOS Safari). Rotate your phone sideways and enable Landscape in Control Center.'
      );
    } catch {
      setOrientationLockMsg(
        'Could not auto-lock orientation in this mobile browser. Turn phone sideways and ensure Portrait Orientation Lock is OFF.'
      );
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 safe-pt safe-pb">
      <div className="max-w-xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#EA580C]/20 border border-[#EA580C]/40 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5 text-[#EA580C]" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#EA580C]">
                MaidanLive Field Camera
              </p>
              <h1 className="font-display text-lg font-bold text-white truncate">
                {data?.camera ? `${data.camera.name} · ${data.camera.label}` : 'Smartphone Camera Setup'}
              </h1>
            </div>
          </div>

          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border shrink-0 ${
              streamingActive
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            }`}
          >
            {streamingActive ? 'TRANSMITTING' : 'STANDBY'}
          </span>
        </div>

        {loading ? (
          <div className="p-6 rounded-xl border border-slate-800 bg-slate-900 text-xs text-slate-400">
            Verifying camera token &amp; loading match production profile...
          </div>
        ) : error || !data ? (
          <div className="p-5 rounded-xl border border-red-500/40 bg-red-500/10 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-red-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Camera Link Invalid or Revoked</span>
            </div>
            <p className="text-xs text-red-200">{error}</p>
            <button
              type="button"
              onClick={loadConfig}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white border border-slate-700 rounded-lg"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        ) : (
          <>
            {/* Match & Camera Telemetry Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-3">
              {data.match && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {data.match.tournamentName || data.match.gameName || 'Live Match'}
                  </p>
                  <p className="text-sm font-bold text-white">{data.match.matchTitle}</p>
                  {(data.camera.broadcastSessionId || data.camera.pushTokenExpiresAt) && (
                    <p className="text-[11px] font-mono text-slate-400 mt-1">
                      {data.camera.broadcastSessionId
                        ? `Session: ${data.camera.broadcastSessionId} · `
                        : ''}
                      {data.camera.pushTokenExpiresAt
                        ? `Link expires ${new Date(data.camera.pushTokenExpiresAt).toLocaleString()}`
                        : ''}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-xs font-mono">
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <p className="text-[10px] text-slate-400">PROFILE</p>
                  <p className="text-white font-bold mt-0.5">{data.camera.resolution}</p>
                </div>
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <p className="text-[10px] text-slate-400">FPS / RATE</p>
                  <p className="text-white font-bold mt-0.5">
                    {data.camera.fps}fps · {data.camera.bitrateKbps}k
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <p className="text-[10px] text-slate-400">BATTERY</p>
                  <p className="text-white font-bold mt-0.5 flex items-center gap-1">
                    <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
                    {batteryLevel != null ? `${batteryLevel}%` : 'N/A'}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <p className="text-[10px] text-slate-400">NETWORK</p>
                  <p className="text-white font-bold mt-0.5 flex items-center gap-1">
                    <Wifi className="w-3.5 h-3.5 text-blue-400" />
                    {networkType ? networkType.toUpperCase() : 'Online'}
                  </p>
                </div>
              </div>

              {lastHeartbeatAt && (
                <p className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" />
                  Last Studio Heartbeat: {new Date(lastHeartbeatAt).toLocaleTimeString()}
                </p>
              )}
            </div>

            {/* Camera Controls */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-[#EA580C]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Phone Lens &amp; Stream Control
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const nextMuted = !audioMuted;
                      setAudioMuted(nextMuted);
                      if (streamingActive) {
                        pushHeartbeat('CONNECTED', '', nextMuted);
                      }
                    }}
                    className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-lg ${
                      audioMuted
                        ? 'bg-red-500/15 border-red-500/40 text-red-300'
                        : 'bg-slate-950 border-slate-700 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {audioMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
                    <span>{audioMuted ? 'Mic Muted' : 'Mic Live'}</span>
                  </button>

                  {includeCameraSelection ? (
                    <button
                      type="button"
                      onClick={() =>
                        setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
                      }
                      className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-950 border border-slate-700 rounded-lg hover:bg-slate-800"
                    >
                      <FlipHorizontal className="w-3.5 h-3.5 text-[#EA580C]" />
                      <span>Lens: {facingMode === 'environment' ? 'Rear Main' : 'Front Selfie'}</span>
                    </button>
                  ) : (
                    <span className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-950 border border-slate-800 text-slate-300 rounded-lg">
                      <FlipHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Switch Camera Inside VDO.Ninja</span>
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={handleLockLandscape}
                    className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-950 border border-slate-700 rounded-lg hover:bg-slate-800"
                  >
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Lock Landscape</span>
                  </button>
                </div>
              </div>

              <div
                className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs ${
                  orientationState.isLandscape
                    ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-200'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                }`}
              >
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <RotateCw className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {orientationState.isLandscape
                      ? 'Landscape Ready (16:9)'
                      : 'Portrait Detected — Rotate Phone Sideways for Fullscreen 16:9'}
                  </span>
                </span>
                <span className="font-mono text-[11px] opacity-85">
                  {orientationState.viewportWidth}×{orientationState.viewportHeight} · {orientationState.orientationAngle}°
                </span>
              </div>

              {orientationLockMsg && (
                <p className="text-[11px] text-amber-300 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                  {orientationLockMsg}
                </p>
              )}

              {!data.camera.enabled && (
                <div className="p-3 rounded-lg bg-amber-500/15 border border-amber-500/30 text-xs text-amber-300">
                  This camera is currently marked disabled in MaidanLive Studio. Ask the broadcast director to enable it.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {!streamingActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      setStreamingActive(true);
                      setEmbedVdoFrame(true);
                    }}
                    className="min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-[#EA580C] rounded-xl hover:bg-orange-600"
                  >
                    <Radio className="w-4 h-4" />
                    <span>Start Camera Feed &amp; Heartbeat</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setStreamingActive(false);
                      setEmbedVdoFrame(false);
                      pushHeartbeat('DISCONNECTED');
                    }}
                    className="min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700"
                  >
                    <Power className="w-4 h-4" />
                    <span>Stop Camera Feed</span>
                  </button>
                )}

                {effectivePushUrl && (
                  <a
                    href={effectivePushUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setStreamingActive(true)}
                    className="min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-100 bg-slate-950 border border-slate-700 rounded-xl hover:bg-slate-800"
                  >
                    <ExternalLink className="w-4 h-4 text-[#EA580C]" />
                    <span>Open Fullscreen VDO.Ninja Tab</span>
                  </a>
                )}
              </div>

              {embedVdoFrame && effectivePushUrl && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Embedded VDO.Ninja Camera Transport</span>
                    <button
                      type="button"
                      onClick={() => setEmbedVdoFrame(false)}
                      className="text-slate-300 underline"
                    >
                      Hide Frame
                    </button>
                  </div>
                  <iframe
                    src={effectivePushUrl}
                    title={`Camera ${data.camera.cameraNumber} Feed`}
                    allow="camera; microphone; autoplay; fullscreen"
                    className="w-full h-[380px] rounded-xl border border-slate-700 bg-black"
                  />
                </div>
              )}
            </div>

            {/* Ground Tips */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400 space-y-1.5">
              <p className="font-semibold text-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Ground Broadcast Checklist</span>
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px]">
                <li>Rotate your phone to <strong>landscape orientation</strong> before tapping Start.</li>
                <li>Keep this tab open in foreground so studio heartbeat &amp; battery telemetry stay live.</li>
                <li>If video freezes on slow 4G, ask the producer to enable <strong>Low-Bandwidth Mode</strong> on your camera.</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
