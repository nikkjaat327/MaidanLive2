import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import {
  Camera,
  Check,
  Grid,
  Mic,
  MicOff,
  Play,
  PlugZap,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  Sliders,
  Smartphone,
  Star,
  Video,
  Zap,
} from 'lucide-react';
import type { BroadcastCameraData, ObsControllerProfileData } from '../../types/obs.ts';
import { EmptyState } from '../common/EmptyState.tsx';

export type GridPreviewMode = 'snapshots' | 'live_vdo';
export type GridFilterMode = 'active' | 'all';
export type GridPromoteAction = 'cut_live' | 'swap_layout_main';

export interface CameraPreviewSnapshot {
  imageData: string;
  capturedAt: string;
}

interface CameraPreviewGridProps {
  cameras: BroadcastCameraData[];
  profile: ObsControllerProfileData;
  obsConnected: boolean;
  canManageCameras: boolean;
  previewSnapshots: Record<string, CameraPreviewSnapshot>;
  previewErrors?: Record<string, string>;
  capturingPreviewFor: string | null;
  refreshingAllPreviews: boolean;
  switchingKey: string | null;
  mutingCamId: string | null;
  reconnectingCamId?: string | null;
  scaffoldingCount: number | null;
  // Multi-camera staged selection & Quick Switch mode
  selectedCameraIds: string[];
  mainCameraId: string;
  quickSwitchMode: boolean;
  onToggleQuickSwitchMode: (val: boolean) => void;
  onToggleSelectCamera: (cam: BroadcastCameraData) => void;
  onCutCameraLive: (cam: BroadcastCameraData) => Promise<void> | void;
  onCapturePreview: (cam: BroadcastCameraData) => Promise<void> | void;
  onRefreshAllPreviews: (
    cams: BroadcastCameraData[],
    options?: { background?: boolean }
  ) => Promise<void> | void;
  onCaptureActiveScenePreview?: (options?: { background?: boolean }) => Promise<void> | void;
  onToggleAudio: (cam: BroadcastCameraData) => Promise<void> | void;
  onReconnectCamera: (cam: BroadcastCameraData) => Promise<void> | void;
  onOpenQrWizard: (cam: BroadcastCameraData) => void;
  onOpenMapSourcesModal: () => void;
  onScaffoldCameras: (count: number) => Promise<void> | void;
  onSyncObsState: () => Promise<void> | void;
  onOpenCamerasTab: () => void;
}

function isCameraInProgram(
  cam: BroadcastCameraData,
  profile: ObsControllerProfileData,
  obsConnected: boolean
): boolean {
  if (!obsConnected) return false;
  if (Array.isArray(profile.activeCameraIds) && profile.activeCameraIds.includes(cam.cameraId)) {
    return true;
  }
  return Boolean(
    profile.activeCameraId === cam.cameraId ||
      (cam.obsSceneName && profile.activeObsScene === cam.obsSceneName)
  );
}

function isCameraActiveOrOnline(
  cam: BroadcastCameraData,
  profile: ObsControllerProfileData,
  obsConnected: boolean
): boolean {
  if (!cam.enabled) return false;
  if (cam.status === 'ACTIVE' || cam.status === 'CONNECTED') return true;
  return isCameraInProgram(cam, profile, obsConnected);
}

function resolveAutoGridColsClass(count: number, overrideCols: 'auto' | 2 | 3 | 4): string {
  if (overrideCols === 2) return 'grid-cols-1 sm:grid-cols-2';
  if (overrideCols === 3) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  if (overrideCols === 4) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
  if (count <= 2) return 'grid-cols-1 sm:grid-cols-2';
  if (count <= 6) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
}

function buildVdoPreviewUrl(rawUrl?: string, options: { noAudio?: boolean } = {}): string {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.includes('vdo.ninja') || parsed.searchParams.has('view')) {
      parsed.searchParams.set('muted', '1');
      parsed.searchParams.set('autoplay', '1');
      if (options.noAudio) {
        parsed.searchParams.set('noaudio', '1');
      }
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

export function CameraPreviewGrid({
  cameras,
  profile,
  obsConnected,
  canManageCameras,
  previewSnapshots,
  previewErrors = {},
  capturingPreviewFor,
  refreshingAllPreviews,
  switchingKey,
  mutingCamId,
  reconnectingCamId = null,
  scaffoldingCount,
  selectedCameraIds,
  mainCameraId,
  quickSwitchMode,
  onToggleQuickSwitchMode,
  onToggleSelectCamera,
  onCutCameraLive,
  onCapturePreview,
  onRefreshAllPreviews,
  onCaptureActiveScenePreview,
  onToggleAudio,
  onReconnectCamera,
  onOpenQrWizard,
  onOpenMapSourcesModal,
  onScaffoldCameras,
  onSyncObsState,
  onOpenCamerasTab,
}: CameraPreviewGridProps) {
  const enabledCameras = useMemo(() => cameras.filter((c) => c.enabled), [cameras]);

  const activeCameras = useMemo(
    () => enabledCameras.filter((cam) => isCameraActiveOrOnline(cam, profile, obsConnected)),
    [enabledCameras, profile, obsConnected]
  );

  const hasLiveVdoCameras = useMemo(
    () => enabledCameras.some((c) => c.sourceType === 'vdoninja' && Boolean(c.obsBrowserSourceUrl)),
    [enabledCameras]
  );

  // Show all enabled cameras by default so configured OBS capture sources are immediately visible
  const [filterMode, setFilterMode] = useState<GridFilterMode>('all');
  const [previewMode, setPreviewMode] = useState<GridPreviewMode>(() =>
    hasLiveVdoCameras ? 'live_vdo' : 'snapshots'
  );
  const userSelectedPreviewModeRef = useRef(false);
  const [columnMode, setColumnMode] = useState<'auto' | 2 | 3 | 4>('auto');
  const [pollSeconds, setPollSeconds] = useState<0 | 1 | 2 | 3 | 5 | 10>(2);
  const [tabVisible, setTabVisible] = useState<boolean>(
    () => typeof document === 'undefined' || document.visibilityState === 'visible'
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      setTabVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!userSelectedPreviewModeRef.current && hasLiveVdoCameras) {
      setPreviewMode('live_vdo');
    }
  }, [hasLiveVdoCameras]);

  // Sort IN PROGRAM cameras first, then SELECTED cameras, then cameraNumber order
  const displayedCameras = useMemo(() => {
    const baseList = filterMode === 'active' ? activeCameras : enabledCameras;
    return [...baseList].sort((a, b) => {
      const aInProg = isCameraInProgram(a, profile, obsConnected);
      const bInProg = isCameraInProgram(b, profile, obsConnected);
      if (aInProg !== bInProg) return aInProg ? -1 : 1;
      return (a.sortOrder || a.cameraNumber) - (b.sortOrder || b.cameraNumber);
    });
  }, [filterMode, activeCameras, enabledCameras, profile, obsConnected]);

  const displayedCamerasRef = useRef(displayedCameras);
  displayedCamerasRef.current = displayedCameras;
  const refreshingAllPreviewsRef = useRef(refreshingAllPreviews);
  refreshingAllPreviewsRef.current = refreshingAllPreviews;
  const onRefreshAllPreviewsRef = useRef(onRefreshAllPreviews);
  onRefreshAllPreviewsRef.current = onRefreshAllPreviews;
  const onCaptureActiveScenePreviewRef = useRef(onCaptureActiveScenePreview);
  onCaptureActiveScenePreviewRef.current = onCaptureActiveScenePreview;
  const hasDisplayedCameras = displayedCameras.length > 0;
  const hasActiveScene = Boolean(obsConnected && profile.activeObsScene);

  // Automatic rate-limited snapshot polling; pauses cleanly when tab is hidden
  useEffect(() => {
    if (!obsConnected || previewMode !== 'snapshots' || !tabVisible) return;
    if (!hasDisplayedCameras && !hasActiveScene) return;

    const runCapture = () => {
      if (document.visibilityState !== 'visible') return;
      if (refreshingAllPreviewsRef.current) return;
      const targets = [...displayedCamerasRef.current];
      if (targets.length > 0) {
        void onRefreshAllPreviewsRef.current(targets, { background: true });
      }
      if (onCaptureActiveScenePreviewRef.current) {
        void onCaptureActiveScenePreviewRef.current({ background: true });
      }
    };

    runCapture();
    if (pollSeconds === 0) return;

    const id = window.setInterval(runCapture, pollSeconds * 1000);
    return () => window.clearInterval(id);
  }, [obsConnected, previewMode, pollSeconds, tabVisible, hasDisplayedCameras, hasActiveScene]);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950 text-slate-100 p-4 sm:p-5 space-y-4">
      {/* Section Header + Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Grid className="w-4 h-4 text-[#EA580C] shrink-0" />
            <h2 className="font-display text-sm sm:text-base font-bold uppercase tracking-wide text-white">
              CONNECTED CAMERAS ({enabledCameras.length})
            </h2>
            {!tabVisible && (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-amber-300">
                Polling Paused (Tab Hidden)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            {quickSwitchMode
              ? 'Quick Switch ON: Clicking a camera tile immediately cuts it fullscreen live in OBS.'
              : 'Staging Mode: Click tiles to select 1 or multiple cameras for Composition, or press "Cut Live" on any tile.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Switch Mode Toggle (OFF by default) */}
          <button
            type="button"
            onClick={() => onToggleQuickSwitchMode(!quickSwitchMode)}
            title="When OFF, clicking a tile stages it safely without cutting the broadcast. When ON, clicking a tile cuts fullscreen live immediately."
            className={`min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
              quickSwitchMode
                ? 'bg-red-600/20 border-red-500/60 text-red-200'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${quickSwitchMode ? 'text-red-400' : 'text-slate-400'}`} />
            <span>Quick Switch: {quickSwitchMode ? 'ON' : 'OFF'}</span>
          </button>

          {/* All Enabled vs Active Feeds Toggle */}
          <div
            className="inline-flex items-center p-0.5 bg-slate-900 rounded-lg border border-slate-800"
            role="group"
            aria-label="Camera filter"
          >
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`min-h-[30px] px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                filterMode === 'all'
                  ? 'bg-[#EA580C] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({enabledCameras.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('active')}
              className={`min-h-[30px] px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                filterMode === 'active'
                  ? 'bg-[#EA580C] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Online ({activeCameras.length})
            </button>
          </div>

          {/* Preview Engine Toggle */}
          <div
            className="inline-flex items-center p-0.5 bg-slate-900 rounded-lg border border-slate-800"
            role="group"
            aria-label="Preview feed source"
          >
            <button
              type="button"
              onClick={() => {
                userSelectedPreviewModeRef.current = true;
                setPreviewMode('snapshots');
              }}
              className={`min-h-[30px] px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                previewMode === 'snapshots'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              OBS Snapshots
            </button>
            <button
              type="button"
              onClick={() => {
                userSelectedPreviewModeRef.current = true;
                setPreviewMode('live_vdo');
              }}
              className={`min-h-[30px] px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                previewMode === 'live_vdo'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Live WebRTC
            </button>
          </div>

          {/* Grid Columns */}
          <select
            value={columnMode}
            onChange={(e) => {
              const v = e.target.value;
              setColumnMode(v === 'auto' ? 'auto' : (Number(v) as 2 | 3 | 4));
            }}
            aria-label="Grid columns"
            className="min-h-[34px] px-2.5 py-1 text-xs font-semibold border border-slate-700 rounded-lg bg-slate-900 text-slate-200"
          >
            <option value="auto">Cols: Auto</option>
            <option value={2}>2 Cols</option>
            <option value={3}>3 Cols</option>
            <option value={4}>4 Cols</option>
          </select>

          {/* Auto-Poll OBS Previews */}
          {previewMode === 'snapshots' && (
            <select
              value={pollSeconds}
              disabled={!obsConnected}
              onChange={(e) => setPollSeconds(Number(e.target.value) as 0 | 1 | 2 | 3 | 5 | 10)}
              aria-label="Auto-refresh preview interval"
              className="min-h-[34px] px-2.5 py-1 text-xs font-semibold border border-slate-700 rounded-lg bg-slate-900 text-slate-200 disabled:opacity-40"
            >
              <option value={1}>Poll: 1s</option>
              <option value={2}>Poll: 2s</option>
              <option value={3}>Poll: 3s</option>
              <option value={5}>Poll: 5s</option>
              <option value={10}>Poll: 10s</option>
              <option value={0}>Poll: Off</option>
            </select>
          )}

          <button
            type="button"
            disabled={!obsConnected || refreshingAllPreviews || displayedCameras.length === 0}
            onClick={() => onRefreshAllPreviews(displayedCameras)}
            className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingAllPreviews ? 'animate-spin' : ''}`} />
            <span>{refreshingAllPreviews ? 'Fetching...' : 'Refresh Frames'}</span>
          </button>

          {canManageCameras && (
            <button
              type="button"
              onClick={onOpenMapSourcesModal}
              className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-slate-100 bg-slate-900 border border-slate-700 rounded-lg hover:border-[#EA580C] whitespace-nowrap shrink-0"
            >
              <Sliders className="w-3.5 h-3.5 text-[#EA580C]" />
              <span>Map OBS Sources</span>
            </button>
          )}

          <button
            type="button"
            disabled={!obsConnected}
            onClick={onSyncObsState}
            className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-300 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Sync OBS</span>
          </button>

          {canManageCameras && (
            <button
              type="button"
              onClick={onOpenCamerasTab}
              className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-300 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Manage</span>
            </button>
          )}
        </div>
      </div>

      {/* Empty State when zero cameras configured */}
      {enabledCameras.length === 0 ? (
        <EmptyState
          icon={<Smartphone className="w-6 h-6 text-[#EA580C]" />}
          title="No cameras mapped or added yet"
          description="Map existing OBS Studio inputs (USB/HDMI/Browser) or quick-add smartphone QR cameras below."
          action={
            canManageCameras ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={onOpenMapSourcesModal}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 whitespace-nowrap"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Map OBS Camera Sources</span>
                </button>
                {[2, 4].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    disabled={scaffoldingCount !== null}
                    onClick={() => onScaffoldCameras(cnt)}
                    className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-200 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                  >
                    {scaffoldingCount === cnt ? `Adding ${cnt}...` : `+ Quick Add ${cnt} Mobile Cams`}
                  </button>
                ))}
              </div>
            ) : undefined
          }
        />
      ) : displayedCameras.length === 0 ? (
        <EmptyState
          icon={<Camera className="w-6 h-6 text-slate-400" />}
          title="No online cameras in filtered view"
          description="Switch filter to All Cameras to view configured OBS or offline mobile sources."
          action={
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className="min-h-[38px] px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600"
            >
              Show All Configured ({enabledCameras.length})
            </button>
          }
        />
      ) : (
        <LayoutGroup id="camera-multiview-grid">
          <motion.div
            layout
            className={`grid ${resolveAutoGridColsClass(displayedCameras.length, columnMode)} gap-4`}
          >
            <AnimatePresence mode="popLayout">
              {displayedCameras.map((cam) => {
                const inProgram = isCameraInProgram(cam, profile, obsConnected);
                const isSelected = selectedCameraIds.includes(cam.cameraId);
                const isMainStaged = mainCameraId === cam.cameraId && isSelected;
                const snap = previewSnapshots[cam.cameraId];
                const previewErr = previewErrors[cam.cameraId];
                const isSwitching = switchingKey === `cam:${cam.cameraId}`;
                const isReconnecting = reconnectingCamId === cam.cameraId;
                const isMuted = Boolean(
                  cam.obsInputMuted ?? cam.audioMuted ?? cam.telemetry?.audioMuted
                );
                const tileVdoUrl =
                  cam.sourceType === 'vdoninja' && cam.obsBrowserSourceUrl
                    ? buildVdoPreviewUrl(cam.obsBrowserSourceUrl, { noAudio: true })
                    : '';
                const showLiveVdo = previewMode === 'live_vdo' && Boolean(tileVdoUrl);

                return (
                  <motion.div
                    key={cam.cameraId}
                    layout
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{
                      layout: { type: 'spring', stiffness: 360, damping: 30, mass: 0.85 },
                      opacity: { duration: 0.16 },
                      scale: { duration: 0.16 },
                    }}
                    className={`group rounded-xl border-2 overflow-hidden transition-colors bg-slate-900 ${
                      inProgram && isSelected
                        ? 'border-red-500 ring-2 ring-amber-400/40'
                        : inProgram
                          ? 'border-red-500'
                          : isSelected
                            ? 'border-amber-400'
                            : 'border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    {/* Clickable Preview Surface */}
                    <button
                      type="button"
                      disabled={isSwitching}
                      onClick={() => {
                        if (quickSwitchMode) {
                          void onCutCameraLive(cam);
                        } else {
                          onToggleSelectCamera(cam);
                        }
                      }}
                      aria-label={
                        quickSwitchMode
                          ? `Cut live to ${cam.label || cam.name}`
                          : `Select ${cam.label || cam.name} for composition`
                      }
                      className="relative block w-full aspect-video bg-black overflow-hidden border-b border-slate-800 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EA580C] cursor-pointer"
                    >
                      {showLiveVdo ? (
                        <iframe
                          key={`tile:${cam.cameraId}:${tileVdoUrl}`}
                          title={`Live monitor ${cam.name}`}
                          src={tileVdoUrl}
                          allow="autoplay; fullscreen; encrypted-media"
                          className="w-full h-full border-0 pointer-events-none bg-black"
                        />
                      ) : snap ? (
                        <img
                          src={snap.imageData}
                          alt={`OBS preview for ${cam.label || cam.name}`}
                          className="w-full h-full object-contain bg-black"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center space-y-1.5">
                          <Video className="w-6 h-6 text-slate-600" />
                          <p className="text-[11px] font-semibold text-slate-300">
                            {previewErr
                              ? 'Preview unavailable in OBS'
                              : obsConnected
                                ? 'Waiting for OBS frame...'
                                : 'OBS disconnected'}
                          </p>
                          <p className="text-[10px] font-mono text-slate-500 truncate max-w-full">
                            {cam.obsInputName || cam.obsSceneName || cam.name}
                          </p>
                        </div>
                      )}

                      {/* Top Scrim Metadata: IN PROGRAM vs SELECTED */}
                      <div className="absolute inset-x-0 top-0 p-2 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/75 text-white">
                            CAM {cam.cameraNumber}
                          </span>
                          <span
                            className={`font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              cam.status === 'ERROR'
                                ? 'bg-red-900/90 text-red-200'
                                : cam.status === 'ACTIVE' || cam.status === 'CONNECTED'
                                  ? 'bg-emerald-950/90 text-emerald-300'
                                  : 'bg-slate-900/90 text-slate-300'
                            }`}
                          >
                            {cam.status}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {inProgram && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-600 text-white font-mono text-[10px] font-bold tracking-wide">
                              <Radio className="w-2.5 h-2.5" />
                              IN PROGRAM
                            </span>
                          )}
                          {isSelected && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-mono text-[10px] font-bold tracking-wide">
                              <Check className="w-2.5 h-2.5" />
                              {isMainStaged ? 'MAIN' : 'SELECTED'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Bottom Scrim Metadata */}
                      <div className="absolute inset-x-0 bottom-0 px-2.5 py-1.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex items-center justify-between gap-2 text-[10px] font-mono text-slate-200 tabular-nums">
                        <span className="truncate">
                          {cam.obsInputName || cam.obsSceneName || cam.sourceType}
                        </span>
                        {snap && <span className="shrink-0">{snap.capturedAt}</span>}
                      </div>
                    </button>

                    {/* Tile Metadata & Direct Actions */}
                    <div className="p-3 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-bold text-white truncate">
                              {cam.label || cam.name}
                            </p>
                            {cam.isDefault && (
                              <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono truncate">
                            {cam.obsInputName
                              ? `OBS Input: ${cam.obsInputName}`
                              : cam.obsSceneName || 'Auto Scene'}
                          </p>
                        </div>

                        {/* Quick Single Cut Button (works even when Quick Switch is OFF) */}
                        <button
                          type="button"
                          disabled={!obsConnected || isSwitching}
                          onClick={() => onCutCameraLive(cam)}
                          title="Cut fullscreen live to this camera immediately"
                          className={`min-h-[28px] inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border whitespace-nowrap shrink-0 ${
                            inProgram
                              ? 'bg-red-600 text-white border-red-500'
                              : 'bg-[#EA580C] text-white border-[#EA580C] hover:bg-orange-600'
                          } disabled:opacity-40`}
                        >
                          <Play className="w-2.5 h-2.5" />
                          <span>{isSwitching ? 'Cutting...' : inProgram ? 'On Air' : 'Cut Live'}</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800">
                        <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelectCamera(cam)}
                            className="w-3.5 h-3.5 rounded border-slate-600 text-amber-500"
                          />
                          <span>{isSelected ? 'Staged' : 'Select'}</span>
                        </label>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={isReconnecting}
                            onClick={() => onReconnectCamera(cam)}
                            title="Reconnect camera source"
                            aria-label={`Reconnect ${cam.label || cam.name}`}
                            className="min-h-[28px] min-w-[28px] inline-flex items-center justify-center px-1.5 text-slate-300 bg-slate-950 border border-slate-800 rounded hover:border-slate-600 disabled:opacity-40"
                          >
                            {isReconnecting ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-[#EA580C]" />
                            ) : (
                              <PlugZap className="w-3 h-3" />
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={mutingCamId === cam.cameraId}
                            onClick={() => onToggleAudio(cam)}
                            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                            aria-label={`${isMuted ? 'Unmute audio' : 'Mute audio'} for ${cam.label || cam.name}`}
                            className={`min-h-[28px] min-w-[28px] inline-flex items-center justify-center px-1.5 rounded border ${
                              isMuted
                                ? 'bg-red-950 text-red-300 border-red-700'
                                : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                            } disabled:opacity-40`}
                          >
                            {isMuted ? (
                              <MicOff className="w-3 h-3" />
                            ) : (
                              <Mic className="w-3 h-3" />
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={!obsConnected || capturingPreviewFor === cam.cameraId}
                            onClick={() => onCapturePreview(cam)}
                            title="Refresh OBS preview frame"
                            aria-label={`Refresh preview frame for ${cam.label || cam.name}`}
                            className="min-h-[28px] min-w-[28px] inline-flex items-center justify-center px-1.5 text-slate-300 bg-slate-950 border border-slate-800 rounded hover:border-slate-600 disabled:opacity-40"
                          >
                            <Camera
                              className={`w-3 h-3 ${
                                capturingPreviewFor === cam.cameraId ? 'text-[#EA580C]' : ''
                              }`}
                            />
                          </button>

                          <button
                            type="button"
                            onClick={() => onOpenQrWizard(cam)}
                            title="Smartphone QR Setup"
                            aria-label={`Open QR setup for ${cam.label || cam.name}`}
                            className="min-h-[28px] min-w-[28px] inline-flex items-center justify-center px-1.5 text-slate-300 bg-slate-950 border border-slate-800 rounded hover:border-slate-600"
                          >
                            <QrCode className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        </LayoutGroup>
      )}
    </section>
  );
}
