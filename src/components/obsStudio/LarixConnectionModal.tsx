import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Layers,
  Loader2,
  QrCode,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  Wifi,
} from 'lucide-react';
import { Modal } from '../common/Modal.tsx';
import type {
  BroadcastCameraData,
  MediaMTXBridgeState,
  MediaMTXConfigPayload,
} from '../../types/obs.ts';

interface LarixConnectionModalProps {
  open: boolean;
  onClose: () => void;
  matchId: string;
  matchTitle: string;
  camera: BroadcastCameraData | null;
  obsConnected: boolean;
  mediamtxConfig: MediaMTXConfigPayload | null;
  mediamtxState: MediaMTXBridgeState | null;
  onCreateLarixCamera: (payload: {
    name?: string;
    label: string;
    position?: string;
    streamProtocol: 'rtmp' | 'srt';
    obsSceneName?: string;
    obsInputName?: string;
    resolution?: BroadcastCameraData['resolution'];
    fps?: number;
    bitrateKbps?: number;
  }) => Promise<BroadcastCameraData>;
  onSwitchProtocol: (camera: BroadcastCameraData, protocol: 'rtmp' | 'srt') => Promise<BroadcastCameraData | void>;
  onRotateCredentials: (camera: BroadcastCameraData, syncObs?: boolean) => Promise<BroadcastCameraData | void>;
  onRevokeCredentials: (camera: BroadcastCameraData) => Promise<BroadcastCameraData | void>;
  onAssignToObs: (camera: BroadcastCameraData) => Promise<void>;
  onRestartObsInput: (camera: BroadcastCameraData) => Promise<void>;
  onTestCamera: (camera: BroadcastCameraData) => Promise<void>;
}

function replaceUrlHost(rawUrl: string, hostOverride: string): string {
  if (!rawUrl || !hostOverride) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    parsed.hostname = hostOverride;
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return rawUrl;
  }
}

export function LarixConnectionModal({
  open,
  onClose,
  matchId,
  matchTitle,
  camera,
  obsConnected,
  mediamtxConfig,
  mediamtxState,
  onCreateLarixCamera,
  onSwitchProtocol,
  onRotateCredentials,
  onRevokeCredentials,
  onAssignToObs,
  onRestartObsInput,
  onTestCamera,
}: LarixConnectionModalProps) {
  const [activeCam, setActiveCam] = useState<BroadcastCameraData | null>(camera);

  // Create form fields (when camera === null)
  const [name, setName] = useState('');
  const [label, setLabel] = useState('Larix Mobile Camera');
  const [position, setPosition] = useState('Boundary Line');
  const [protocol, setProtocol] = useState<'rtmp' | 'srt'>('rtmp');
  const [obsSceneName, setObsSceneName] = useState('');
  const [obsInputName, setObsInputName] = useState('');
  const [resolution, setResolution] = useState<BroadcastCameraData['resolution']>('1280x720');
  const [fps, setFps] = useState('30');
  const [bitrateKbps, setBitrateKbps] = useState('3500');

  // Manage UI state
  const [selectedHost, setSelectedHost] = useState<string>('');
  const [qrMode, setQrMode] = useState<'larix_deeplink' | 'raw_url'>('larix_deeplink');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    setConfirmRevoke(false);
    setActiveCam(camera);
    if (!camera) {
      setName('');
      setLabel('Larix Mobile Camera');
      setPosition('Boundary Line');
      setProtocol('rtmp');
      setObsSceneName('');
      setObsInputName('');
      setResolution('1280x720');
      setFps('30');
      setBitrateKbps('3500');
    } else {
      setProtocol(camera.streamProtocol === 'srt' ? 'srt' : 'rtmp');
    }
  }, [open, camera]);

  const lanIps = useMemo(() => {
    const merged = [
      ...(mediamtxState?.lanIps || []),
      ...(mediamtxConfig?.lanIps || []),
    ].filter(Boolean);
    return Array.from(new Set(merged));
  }, [mediamtxState?.lanIps, mediamtxConfig?.lanIps]);

  useEffect(() => {
    if (!open) return;
    const usesLocal = activeCam?.larixConfig?.usesLocalhostIngest;
    if (usesLocal && lanIps.length > 0 && !selectedHost) {
      setSelectedHost(lanIps[0]);
    } else if (!usesLocal) {
      setSelectedHost('');
    }
  }, [open, activeCam?.larixConfig?.usesLocalhostIngest, lanIps, selectedHost]);

  const larixConfig = activeCam?.larixConfig || null;
  const activeProtocol: 'rtmp' | 'srt' =
    activeCam?.streamProtocol === 'srt' || larixConfig?.protocol === 'srt' ? 'srt' : 'rtmp';

  const resolvedUrls = useMemo(() => {
    if (!larixConfig) {
      return {
        serverUrl: '',
        streamKeyOrId: '',
        fullUrl: '',
        deepLinkUrl: '',
        obsPullUrl: '',
      };
    }
    const hostToUse =
      selectedHost && larixConfig.usesLocalhostIngest ? selectedHost.trim() : '';

    const rtmpServer = hostToUse
      ? replaceUrlHost(larixConfig.rtmpServerUrl, hostToUse)
      : larixConfig.rtmpServerUrl;
    const rtmpFull = hostToUse
      ? `${rtmpServer}${larixConfig.rtmpStreamKeyParam}`
      : larixConfig.rtmpFullUrl;

    const srtServer = hostToUse
      ? replaceUrlHost(larixConfig.srtServerUrl, hostToUse)
      : larixConfig.srtServerUrl;
    const srtFull = hostToUse
      ? `${srtServer}?streamid=${encodeURIComponent(larixConfig.srtStreamId)}&latency=300000`
      : larixConfig.srtFullUrl;

    const fullUrl = activeProtocol === 'srt' ? srtFull : rtmpFull;
    const connName = (activeCam?.label || activeCam?.name || 'MaidanLive Cam').slice(0, 48);
    const deepLinkUrl = `larix://set/v1?conn[][url]=${encodeURIComponent(
      fullUrl
    )}&conn[][name]=${encodeURIComponent(connName)}&conn[][mode]=va`;

    return {
      serverUrl: activeProtocol === 'srt' ? srtServer : rtmpServer,
      streamKeyOrId:
        activeProtocol === 'srt' ? larixConfig.srtStreamId : larixConfig.streamKey,
      fullUrl,
      deepLinkUrl,
      obsPullUrl: larixConfig.obsPullUrl,
    };
  }, [larixConfig, selectedHost, activeProtocol, activeCam?.label, activeCam?.name]);

  const qrPayload =
    qrMode === 'raw_url' ? resolvedUrls.fullUrl : resolvedUrls.deepLinkUrl;

  useEffect(() => {
    let cancelled = false;
    if (!open || !qrPayload || activeCam?.mediamtxRevoked) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(qrPayload, {
      width: 240,
      margin: 2,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [open, qrPayload, activeCam?.mediamtxRevoked]);

  function copyValue(key: string, value: string) {
    if (!value) return;
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1800);
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setBusyAction('create');
      setLocalError(null);
      const created = await onCreateLarixCamera({
        ...(name.trim() ? { name: name.trim() } : {}),
        label: label.trim() || 'Larix Mobile Camera',
        position: position.trim(),
        streamProtocol: protocol,
        ...(obsSceneName.trim() ? { obsSceneName: obsSceneName.trim() } : {}),
        ...(obsInputName.trim() ? { obsInputName: obsInputName.trim() } : {}),
        resolution,
        fps: Number(fps) || 30,
        bitrateKbps: Number(bitrateKbps) || 3500,
      });
      setActiveCam(created);
    } catch (err: any) {
      setLocalError(err?.response?.data?.message || err?.message || 'Failed to add Larix camera.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleProtocolToggle(nextProtocol: 'rtmp' | 'srt') {
    if (!activeCam || activeProtocol === nextProtocol) return;
    try {
      setBusyAction('protocol');
      setLocalError(null);
      const updated = await onSwitchProtocol(activeCam, nextProtocol);
      if (updated) setActiveCam(updated);
      setProtocol(nextProtocol);
    } catch (err: any) {
      setLocalError(err?.response?.data?.message || err?.message || 'Failed to switch protocol.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRotate() {
    if (!activeCam) return;
    try {
      setBusyAction('rotate');
      setLocalError(null);
      const updated = await onRotateCredentials(activeCam, obsConnected);
      if (updated) setActiveCam(updated);
      setConfirmRevoke(false);
    } catch (err: any) {
      setLocalError(err?.response?.data?.message || err?.message || 'Failed to regenerate stream key.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRevoke() {
    if (!activeCam) return;
    try {
      setBusyAction('revoke');
      setLocalError(null);
      const updated = await onRevokeCredentials(activeCam);
      if (updated) setActiveCam(updated);
      setConfirmRevoke(false);
    } catch (err: any) {
      setLocalError(err?.response?.data?.message || err?.message || 'Failed to revoke credentials.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAssignObs() {
    if (!activeCam) return;
    try {
      setBusyAction('assign_obs');
      setLocalError(null);
      await onAssignToObs(activeCam);
    } catch (err: any) {
      setLocalError(err?.response?.data?.message || err?.message || 'Failed to sync OBS source.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRestartInput() {
    if (!activeCam) return;
    try {
      setBusyAction('restart_obs');
      setLocalError(null);
      await onRestartObsInput(activeCam);
    } catch (err: any) {
      setLocalError(err?.response?.data?.message || err?.message || 'Failed to restart OBS input.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleTest() {
    if (!activeCam) return;
    try {
      setBusyAction('test');
      setLocalError(null);
      await onTestCamera(activeCam);
    } catch (err: any) {
      setLocalError(err?.response?.data?.message || err?.message || 'MediaMTX probe failed.');
    } finally {
      setBusyAction(null);
    }
  }

  const mtxRunning = Boolean(mediamtxState?.running);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        activeCam
          ? `Larix Broadcaster — ${activeCam.label || activeCam.name}`
          : 'Add Camera → Larix Broadcaster (MediaMTX)'
      }
      subtitle={`Match-scoped mobile RTMP / SRT camera ingest (${matchTitle}) · VDO.Ninja cameras remain untouched.`}
      maxWidthClass="max-w-4xl"
    >
      <div className="space-y-4">
        {localError && (
          <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{localError}</span>
          </div>
        )}

        {/* Local MediaMTX Receiver Status Banner (non-blocking) */}
        <div
          className={`p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
            mtxRunning
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Server className="w-4 h-4 shrink-0" />
            <div>
              <p className="font-bold">
                {mtxRunning
                  ? 'MediaMTX Receiver Online on Broadcasting PC'
                  : 'MediaMTX Receiver Not Detected Yet (Optional for Larix)'}
              </p>
              <p className="text-[11px] opacity-85">
                {mtxRunning
                  ? `RTMP :1935 ${mediamtxState?.rtmpPortOpen ? 'OPEN' : 'READY'} · SRT :8890 ${
                      mediamtxState?.srtPortOpen ? 'OPEN' : 'READY'
                    } · Active streams: ${mediamtxState?.activePathCount ?? 0}`
                  : 'You can generate Larix credentials now. Start MediaMTX via Docker or Windows Bridge before tapping Record in Larix.'}
              </p>
            </div>
          </div>
          {mediamtxConfig?.envConfig && (
            <span className="font-mono text-[10px] px-2 py-1 rounded bg-white/80 border border-black/10">
              {activeProtocol === 'srt'
                ? mediamtxConfig.envConfig.srtBase
                : mediamtxConfig.envConfig.rtmpBase}
            </span>
          )}
        </div>

        {/* CREATE MODE: Configure new Larix camera */}
        {!activeCam ? (
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Camera Name (Optional)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Auto e.g. Camera 3"
                  className="w-full min-h-[40px] px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Camera Angle Label *
                </label>
                <input
                  type="text"
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Deep Fine Leg Larix Cam"
                  className="w-full min-h-[40px] px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ground Position
                </label>
                <input
                  type="text"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="e.g. North Boundary"
                  className="w-full min-h-[40px] px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Larix Stream Protocol
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setProtocol('rtmp')}
                    className={`p-2.5 rounded-lg border text-left transition-colors ${
                      protocol === 'rtmp'
                        ? 'border-[#EA580C] bg-orange-50 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <p className="text-xs font-bold">Larix / RTMP (Recommended)</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Fastest local Wi-Fi setup · Port 1935
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProtocol('srt')}
                    className={`p-2.5 rounded-lg border text-left transition-colors ${
                      protocol === 'srt'
                        ? 'border-[#EA580C] bg-orange-50 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <p className="text-xs font-bold">Larix / SRT</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Resilient on unstable 4G/5G · Port 8890
                    </p>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    OBS Source Name
                  </label>
                  <input
                    type="text"
                    value={obsInputName}
                    onChange={(e) => setObsInputName(e.target.value)}
                    placeholder="Auto (ML_CAM_X)"
                    className="w-full min-h-[40px] px-3 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    OBS Scene Name
                  </label>
                  <input
                    type="text"
                    value={obsSceneName}
                    onChange={(e) => setObsSceneName(e.target.value)}
                    placeholder="Auto (CAM X FULL)"
                    className="w-full min-h-[40px] px-3 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Resolution
                </label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as BroadcastCameraData['resolution'])}
                  className="w-full min-h-[40px] px-2.5 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                >
                  <option value="1920x1080">1920x1080 (1080p)</option>
                  <option value="1280x720">1280x720 (720p)</option>
                  <option value="854x480">854x480 (480p)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target FPS</label>
                <select
                  value={fps}
                  onChange={(e) => setFps(e.target.value)}
                  className="w-full min-h-[40px] px-2.5 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                >
                  <option value="60">60 fps</option>
                  <option value="30">30 fps</option>
                  <option value="24">24 fps</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bitrate (kbps)
                </label>
                <input
                  type="number"
                  min={500}
                  max={12000}
                  value={bitrateKbps}
                  onChange={(e) => setBitrateKbps(e.target.value)}
                  className="w-full min-h-[40px] px-3 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center justify-between gap-2">
              <span>
                Match Isolation ID: <strong className="font-mono text-slate-900">{matchId}</strong> ·
                Credentials created here can only publish to this match.
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyAction === 'create'}
                className="min-h-[40px] inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50"
              >
                {busyAction === 'create' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <QrCode className="w-4 h-4" />
                )}
                <span>
                  {busyAction === 'create'
                    ? 'Generating Credentials...'
                    : 'Generate Larix Credentials & QR'}
                </span>
              </button>
            </div>
          </form>
        ) : (
          /* MANAGE / CONNECT MODE */
          <div className="space-y-4">
            {/* 4-Stage Pipeline Status Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div
                className={`p-2.5 rounded-lg border text-xs ${
                  activeCam.mediamtxRevoked
                    ? 'border-red-200 bg-red-50 text-red-800'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                  1. Credentials
                </p>
                <p className="font-bold mt-0.5 flex items-center gap-1">
                  {activeCam.mediamtxRevoked ? (
                    <>
                      <Ban className="w-3.5 h-3.5" /> Revoked
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" /> Scoped &amp; Ready
                    </>
                  )}
                </p>
              </div>

              <div
                className={`p-2.5 rounded-lg border text-xs ${
                  activeCam.mediamtxPublisherConnected
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                  2. Phone Ingest
                </p>
                <p className="font-bold mt-0.5 flex items-center gap-1">
                  <Wifi className="w-3.5 h-3.5" />
                  {activeCam.mediamtxPublisherConnected ? 'Larix Streaming' : 'Waiting for Larix'}
                </p>
              </div>

              <div
                className={`p-2.5 rounded-lg border text-xs ${
                  activeCam.obsSourceAvailable || activeCam.obsSourceConfigured
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                  3. OBS Media Source
                </p>
                <p className="font-bold mt-0.5 flex items-center gap-1 truncate">
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {activeCam.obsSourceAvailable
                      ? activeCam.obsMediaState || 'Ready in OBS'
                      : activeCam.obsSourceConfigured
                        ? 'Configured'
                        : 'Needs Sync'}
                  </span>
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-xs">
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                  4. Match Target
                </p>
                <p className="font-mono font-bold mt-0.5 truncate">
                  {activeCam.mediamtxStreamPath || '—'}
                </p>
              </div>
            </div>

            {/* Protocol Switch + LAN Host Override */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Stream Protocol
                </label>
                <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
                  {(['rtmp', 'srt'] as const).map((proto) => (
                    <button
                      key={proto}
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => handleProtocolToggle(proto)}
                      className={`min-h-[32px] px-3 py-1 rounded-md text-xs font-bold uppercase transition-colors ${
                        activeProtocol === proto
                          ? 'bg-[#EA580C] text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Larix / {proto}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Phone Connection Host (Wi-Fi LAN IP vs .env URL)
                </label>
                {larixConfig?.usesLocalhostIngest ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={selectedHost}
                      onChange={(e) => setSelectedHost(e.target.value)}
                      placeholder="e.g. 192.168.1.42 (PC LAN IP)"
                      className="flex-1 min-h-[34px] px-2.5 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                    />
                    {lanIps.length > 0 && (
                      <select
                        value={selectedHost}
                        onChange={(e) => setSelectedHost(e.target.value)}
                        className="min-h-[34px] px-2 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="">localhost</option>
                        {lanIps.map((ip) => (
                          <option key={ip} value={ip}>
                            {ip}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : (
                  <p className="text-xs font-mono text-emerald-700 pt-1.5">
                    Using central .env host ({resolvedUrls.serverUrl})
                  </p>
                )}
              </div>
            </div>

            {activeCam.mediamtxRevoked ? (
              <div className="p-5 rounded-xl border border-red-200 bg-red-50 text-center space-y-3">
                <Ban className="w-8 h-8 text-red-600 mx-auto" />
                <div>
                  <p className="text-sm font-bold text-red-900">
                    Larix Credentials Revoked
                  </p>
                  <p className="text-xs text-red-700 mt-0.5">
                    This camera&apos;s stream key has been revoked and MediaMTX rejects any publish attempts. Click Regenerate Key below to issue new credentials.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                {/* QR Panel */}
                <div className="md:col-span-4 flex flex-col items-center p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setQrMode('larix_deeplink')}
                      className={`px-2.5 py-1 rounded-md ${
                        qrMode === 'larix_deeplink'
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600'
                      }`}
                    >
                      Larix One-Tap QR
                    </button>
                    <button
                      type="button"
                      onClick={() => setQrMode('raw_url')}
                      className={`px-2.5 py-1 rounded-md ${
                        qrMode === 'raw_url' ? 'bg-slate-900 text-white' : 'text-slate-600'
                      }`}
                    >
                      Raw URL QR
                    </button>
                  </div>

                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt={`Larix QR setup for ${activeCam.name}`}
                      className="w-48 h-48 rounded-lg border border-slate-200 bg-white p-2"
                    />
                  ) : (
                    <div className="w-48 h-48 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-xs text-slate-400">
                      Generating QR...
                    </div>
                  )}

                  {resolvedUrls.deepLinkUrl && (
                    <a
                      href={resolvedUrls.deepLinkUrl}
                      className="w-full min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EA580C] text-white text-xs font-bold hover:bg-orange-600"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Open in Larix App</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <p className="text-[11px] text-center text-slate-500">
                    Scan with Android/iOS camera or Larix QR importer to auto-load connection.
                  </p>
                </div>

                {/* Copyable Credentials */}
                <div className="md:col-span-8 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      1. Full One-Paste Larix Connection URL ({activeProtocol.toUpperCase()})
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={resolvedUrls.fullUrl}
                        onFocus={(e) => e.currentTarget.select()}
                        className="flex-1 min-h-[38px] px-3 text-xs font-mono border border-slate-300 rounded-lg bg-slate-50"
                      />
                      <button
                        type="button"
                        onClick={() => copyValue('fullUrl', resolvedUrls.fullUrl)}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 shrink-0"
                      >
                        {copiedKey === 'fullUrl' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedKey === 'fullUrl' ? 'Copied' : 'Copy URL'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        2. Server URL
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          readOnly
                          value={resolvedUrls.serverUrl}
                          onFocus={(e) => e.currentTarget.select()}
                          className="flex-1 min-h-[36px] px-2.5 text-xs font-mono border border-slate-300 rounded-lg bg-slate-50"
                        />
                        <button
                          type="button"
                          onClick={() => copyValue('serverUrl', resolvedUrls.serverUrl)}
                          className="min-h-[36px] px-2.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-100"
                        >
                          {copiedKey === 'serverUrl' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        3. {activeProtocol === 'srt' ? 'SRT StreamID' : 'Stream Key'}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          readOnly
                          value={resolvedUrls.streamKeyOrId}
                          onFocus={(e) => e.currentTarget.select()}
                          className="flex-1 min-h-[36px] px-2.5 text-xs font-mono border border-slate-300 rounded-lg bg-slate-50"
                        />
                        <button
                          type="button"
                          onClick={() => copyValue('streamKey', resolvedUrls.streamKeyOrId)}
                          className="min-h-[36px] px-2.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-100"
                        >
                          {copiedKey === 'streamKey' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      4. OBS Studio Media Source Pull URL (Auto-Configured on Sync)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={resolvedUrls.obsPullUrl}
                        onFocus={(e) => e.currentTarget.select()}
                        className="flex-1 min-h-[36px] px-3 text-xs font-mono border border-slate-300 rounded-lg bg-slate-50 text-slate-600"
                      />
                      <button
                        type="button"
                        onClick={() => copyValue('obsPull', resolvedUrls.obsPullUrl)}
                        className="min-h-[36px] inline-flex items-center gap-1 px-2.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-100 shrink-0"
                      >
                        {copiedKey === 'obsPull' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>Copy</span>
                      </button>
                    </div>
                  </div>

                  {/* Operator Instructions */}
                  <div className="p-3 rounded-xl bg-orange-50/70 border border-orange-200 text-xs text-slate-700 space-y-1">
                    <p className="font-bold text-slate-900">Phone Operator Quick Guide:</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-[11px]">
                      <li>Install <strong>Larix Broadcaster</strong> (Android / iOS).</li>
                      <li>
                        Ensure phone &amp; PC are on the same Wi-Fi (if local MediaMTX, select the PC&apos;s{' '}
                        <span className="font-mono">192.168.x.x</span> LAN IP above).
                      </li>
                      <li>
                        Scan the QR code (or paste the <strong>Full Larix URL</strong> under Settings → Connections → New Connection).
                      </li>
                      <li>Tap Record / Broadcast in Larix. Confirm step <strong>2. Phone Ingest</strong> turns green.</li>
                      <li>
                        Click <strong>Create / Sync OBS Media Source</strong> below so OBS receives it immediately.
                      </li>
                    </ol>
                  </div>
                </div>
              </div>
            )}

            {/* Action Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                {!activeCam.mediamtxRevoked && (
                  <>
                    <button
                      type="button"
                      disabled={!obsConnected || busyAction !== null}
                      onClick={handleAssignObs}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#EA580C] text-white text-xs font-bold hover:bg-orange-600 disabled:opacity-45"
                    >
                      {busyAction === 'assign_obs' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      <span>Create / Sync OBS Media Source</span>
                    </button>

                    <button
                      type="button"
                      disabled={!obsConnected || busyAction !== null}
                      onClick={handleRestartInput}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-45"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${busyAction === 'restart_obs' ? 'animate-spin' : ''}`}
                      />
                      <span>Restart OBS Media Input</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={handleTest}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 disabled:opacity-45"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>{busyAction === 'test' ? 'Probing...' : 'Check Stream'}</span>
                    </button>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handleRotate}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 disabled:opacity-45"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${busyAction === 'rotate' ? 'animate-spin' : ''}`} />
                  <span>{activeCam.mediamtxRevoked ? 'Issue Fresh Key' : 'Regenerate Key'}</span>
                </button>

                {!activeCam.mediamtxRevoked && (
                  confirmRevoke ? (
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={handleRevoke}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-45"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>{busyAction === 'revoke' ? 'Revoking...' : 'Confirm Revoke'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => setConfirmRevoke(true)}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-semibold hover:bg-red-100 disabled:opacity-45"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Revoke Key</span>
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
