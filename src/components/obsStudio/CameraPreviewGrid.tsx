import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import {
  Camera,
  Check,
  Grid,
  Layers,
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
  Wifi,
  Zap,
} from 'lucide-react';
import type {
  BroadcastCameraData,
  CameraOrientationMode,
  CameraPreviewFit,
  ObsControllerProfileData,
  ObsSceneTransformItem,
} from '../../types/obs.ts';
import {
  detectFrameActiveContentOrientation,
  getPreviewMediaStyles,
  normalizeOrientationMode,
  normalizePreviewFit,
  parseOrientationDegrees,
  resolveCameraLiveWebUrl,
  resolveCameraOrientationSummary,
} from '../../utils/obsTransformGeometry.ts';
import type { DetectedFrameContentInfo } from '../../utils/obsTransformGeometry.ts';
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
  onOpenLarixWizard?: (cam: BroadcastCameraData) => void;
  onAddLarixCamera?: () => void;
  onAssignCameraToObs?: (cam: BroadcastCameraData) => Promise<void> | void;
  assigningObsCamId?: string | null;
  onOpenMapSourcesModal: () => void;
  onScaffoldCameras: (count: number) => Promise<void> | void;
  onSyncObsState: () => Promise<void> | void;
  onOpenCamerasTab: () => void;
  obsTransforms?: ObsSceneTransformItem[];
  detectedContentMap?: Record<string, DetectedFrameContentInfo>;
  onFrameContentDetected?: (cameraKey: string, info: DetectedFrameContentInfo) => void;
  updatingTransformCamId?: string | null;
  onUpdateCameraFraming?: (
    cam: BroadcastCameraData,
    patch: {
      orientationMode?: CameraOrientationMode;
      previewFit?: CameraPreviewFit;
      portraitBackdropFill?: boolean;
    }
  ) => Promise<void> | void;
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
  onOpenLarixWizard,
  onAddLarixCamera,
  onAssignCameraToObs,
  assigningObsCamId,
  onOpenMapSourcesModal,
  onScaffoldCameras,
  onSyncObsState,
  onOpenCamerasTab,
  obsTransforms = [],
  detectedContentMap = {},
  onFrameContentDetected,
  updatingTransformCamId = null,
  onUpdateCameraFraming,
}: CameraPreviewGridProps) {
  const enabledCameras = useMemo(() => cameras.filter((c) => c.enabled), [cameras]);
  const obsTransformLookup = useMemo(() => {
    const map = new Map<string, ObsSceneTransformItem>();
    for (const t of obsTransforms) {
      if (t.sourceName) map.set(t.sourceName, t);
    }
    return map;
  }, [obsTransforms]);

  const activeCameras = useMemo(
    () => enabledCameras.filter((cam) => isCameraActiveOrOnline(cam, profile, obsConnected)),
    [enabledCameras, profile, obsConnected]
  );

  const hasLiveVdoCameras = useMemo(
    () => enabledCameras.some((c) => Boolean(resolveCameraLiveWebUrl(c))),
    [enabledCameras]
  );

  // Show all enabled cameras by default and default to Live Web Preview
  const [filterMode, setFilterMode] = useState<GridFilterMode>('all');
  const [previewMode, setPreviewMode] = useState<GridPreviewMode>('live_vdo');
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

  const snapshotPollTargets = useMemo(
    () =>
      previewMode === 'snapshots'
        ? displayedCameras
        : displayedCameras.filter((c) => !resolveCameraLiveWebUrl(c)),
    [previewMode, displayedCameras]
  );

  const snapshotPollTargetsRef = useRef(snapshotPollTargets);
  snapshotPollTargetsRef.current = snapshotPollTargets;
  const refreshingAllPreviewsRef = useRef(refreshingAllPreviews);
  refreshingAllPreviewsRef.current = refreshingAllPreviews;
  const onRefreshAllPreviewsRef = useRef(onRefreshAllPreviews);
  onRefreshAllPreviewsRef.current = onRefreshAllPreviews;
  const hasSnapshotTargets = snapshotPollTargets.length > 0;

  // Automatic rate-limited snapshot polling for OBS source tiles; pauses cleanly when tab is hidden
  useEffect(() => {
    if (!obsConnected || !tabVisible || !hasSnapshotTargets) return;

    const runCapture = () => {
      if (document.visibilityState !== 'visible') return;
      if (refreshingAllPreviewsRef.current) return;
      const targets = [...snapshotPollTargetsRef.current];
      if (targets.length > 0) {
        void onRefreshAllPreviewsRef.current(targets, { background: true });
      }
    };

    runCapture();
    if (pollSeconds === 0) return;

    const id = window.setInterval(runCapture, pollSeconds * 1000);
    return () => window.clearInterval(id);
  }, [obsConnected, pollSeconds, tabVisible, hasSnapshotTargets]);

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
                setPreviewMode('live_vdo');
              }}
              className={`min-h-[30px] px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                previewMode === 'live_vdo'
                  ? 'bg-[#EA580C] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Live Web Preview
            </button>
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

          {canManageCameras && onAddLarixCamera && (
            <button
              type="button"
              onClick={onAddLarixCamera}
              className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-slate-900 border border-[#EA580C]/70 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Wifi className="w-3.5 h-3.5 text-[#EA580C]" />
              <span>+ Larix Cam</span>
            </button>
          )}

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
                const tileVdoUrl = resolveCameraLiveWebUrl(cam);
                const showLiveVdo = previewMode === 'live_vdo' && Boolean(tileVdoUrl);
                const obsTransform =
                  obsTransformLookup.get(cam.obsInputName || '') ||
                  obsTransformLookup.get(cam.obsSceneName || '') ||
                  obsTransformLookup.get(cam.name || '') ||
                  null;
                const frameInfo = detectedContentMap[cam.cameraId] || null;
                const oriSummary = resolveCameraOrientationSummary({
                  telemetry: cam.telemetry,
                  obsTransform,
                  frameContent: frameInfo,
                });
                const tileFit = normalizePreviewFit(cam.previewFit);
                const tileOrientationMode = normalizeOrientationMode(cam.orientationMode);
                const tileRotationDeg = parseOrientationDegrees(tileOrientationMode);
                const mediaStyles = getPreviewMediaStyles({
                  rotationDeg: tileRotationDeg,
                  previewFit: tileFit,
                  isPortraitContent: oriSummary.isPortraitFeed,
                  contentAspectRatio: frameInfo?.aspectRatio,
                  skipRotation: !showLiveVdo,
                });
                const showPortraitBlurBackdrop =
                  cam.portraitBackdropFill !== false &&
                  tileFit === 'contain' &&
                  oriSummary.isPortraitFeed;

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
                      {showPortraitBlurBackdrop && snap && (
                        <img
                          src={snap.imageData}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-45 pointer-events-none"
                        />
                      )}
                      {showLiveVdo ? (
                        <iframe
                          key={`tile:${cam.cameraId}:${tileVdoUrl}`}
                          title={`Live monitor ${cam.name}`}
                          src={tileVdoUrl}
                          allow="autoplay; fullscreen; encrypted-media"
                          style={
                            mediaStyles.transform !== 'none'
                              ? { transform: mediaStyles.transform, transformOrigin: 'center center' }
                              : undefined
                          }
                          className="relative z-[1] w-full h-full border-0 pointer-events-none bg-transparent transition-transform duration-150"
                        />
                      ) : snap ? (
                        <img
                          src={snap.imageData}
                          alt={`OBS preview for ${cam.label || cam.name}`}
                          onLoad={(e) => {
                            if (!onFrameContentDetected) return;
                            const detected = detectFrameActiveContentOrientation(e.currentTarget);
                            if (detected) {
                              onFrameContentDetected(cam.cameraId, detected);
                            }
                          }}
                          className={`relative z-[1] w-full h-full ${mediaStyles.objectClass} ${
                            showPortraitBlurBackdrop ? 'bg-transparent' : 'bg-black'
                          }`}
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
                            className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              cam.sourceType === 'mediamtx'
                                ? 'bg-orange-950/90 text-orange-200 border border-orange-500/40'
                                : cam.sourceType === 'vdoninja'
                                  ? 'bg-sky-950/90 text-sky-200 border border-sky-500/40'
                                  : 'bg-slate-900/90 text-slate-200'
                            }`}
                          >
                            {cam.sourceType === 'mediamtx'
                              ? `LARIX ${cam.streamProtocol === 'srt' ? 'SRT' : 'RTMP'}`
                              : cam.sourceType === 'vdoninja'
                                ? 'VDO.NINJA'
                                : cam.sourceType.toUpperCase()}
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
                            {cam.sourceType === 'mediamtx'
                              ? cam.mediamtxRevoked
                                ? 'REVOKED'
                                : cam.mediamtxPublisherConnected
                                  ? 'STREAMING'
                                  : cam.status
                              : cam.status}
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
                      <div className="relative z-10 absolute inset-x-0 bottom-0 px-2.5 py-1.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex items-center justify-between gap-2 text-[10px] font-mono text-slate-200 tabular-nums">
                        <span className="truncate">
                          {cam.obsInputName || cam.obsSceneName || cam.sourceType}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {oriSummary.orientation !== 'UNKNOWN' && (
                            <span
                              title={
                                oriSummary.sourceLabel
                                  ? `Detected via ${oriSummary.sourceLabel}${oriSummary.dimensionText ? ` (${oriSummary.dimensionText})` : ''}`
                                  : undefined
                              }
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                oriSummary.isPortraitFeed
                                  ? 'bg-amber-500/25 text-amber-200 border border-amber-400/40'
                                  : 'bg-slate-900/80 text-slate-200 border border-white/10'
                              }`}
                            >
                              {oriSummary.isPortraitFeed ? 'PORTRAIT' : oriSummary.orientation}
                              {oriSummary.dimensionText ? ` · ${oriSummary.dimensionText}` : ''}
                            </span>
                          )}
                          {snap && <span className="shrink-0">{snap.capturedAt}</span>}
                        </div>
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

                          {cam.sourceType === 'mediamtx' ? (
                            <>
                              {onAssignCameraToObs && (
                                <button
                                  type="button"
                                  disabled={!obsConnected || assigningObsCamId === cam.cameraId || cam.mediamtxRevoked}
                                  onClick={() => onAssignCameraToObs(cam)}
                                  title="Create or sync MediaMTX FFmpeg Media Source in OBS Studio"
                                  aria-label={`Sync ${cam.label || cam.name} to OBS`}
                                  className={`min-h-[28px] inline-flex items-center gap-1 px-2 text-[10px] font-bold rounded border disabled:opacity-40 ${
                                    cam.obsSourceAvailable
                                      ? 'bg-emerald-950 text-emerald-200 border-emerald-700'
                                      : 'bg-slate-950 text-amber-200 border-amber-700/70 hover:border-amber-500'
                                  }`}
                                >
                                  <Layers className="w-3 h-3" />
                                  <span>{assigningObsCamId === cam.cameraId ? '...' : 'Sync OBS'}</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenLarixWizard ? onOpenLarixWizard(cam) : onOpenQrWizard(cam)
                                }
                                title="Larix Broadcaster Setup & Credentials"
                                aria-label={`Open Larix setup for ${cam.label || cam.name}`}
                                className="min-h-[28px] inline-flex items-center gap-1 px-2 text-[10px] font-bold text-orange-200 bg-orange-950/80 border border-orange-500/50 rounded hover:border-[#EA580C]"
                              >
                                <Wifi className="w-3 h-3" />
                                <span>Larix</span>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpenQrWizard(cam)}
                              title="Smartphone QR Setup"
                              aria-label={`Open QR setup for ${cam.label || cam.name}`}
                              className="min-h-[28px] min-w-[28px] inline-flex items-center justify-center px-1.5 text-slate-300 bg-slate-950 border border-slate-800 rounded hover:border-slate-600"
                            >
                              <QrCode className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {onUpdateCameraFraming && (
                        <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-800/80 text-[10px]">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-slate-500 font-semibold uppercase">Fit:</span>
                            <select
                              aria-label={`Preview fit mode for ${cam.label || cam.name}`}
                              value={tileFit}
                              disabled={updatingTransformCamId === cam.cameraId}
                              onChange={(e) =>
                                onUpdateCameraFraming(cam, {
                                  previewFit: e.target.value as CameraPreviewFit,
                                })
                              }
                              className="min-h-[24px] px-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 font-mono text-[10px] disabled:opacity-50"
                            >
                              <option value="contain">Contain</option>
                              <option value="cover">Cover</option>
                              <option value="fill">Fill</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-slate-500 font-semibold uppercase">Rot:</span>
                            <select
                              aria-label={`Rotation correction for ${cam.label || cam.name}`}
                              value={tileOrientationMode}
                              disabled={updatingTransformCamId === cam.cameraId}
                              onChange={(e) =>
                                onUpdateCameraFraming(cam, {
                                  orientationMode: e.target.value as CameraOrientationMode,
                                })
                              }
                              className="min-h-[24px] px-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 font-mono text-[10px] disabled:opacity-50"
                            >
                              <option value="auto">Auto</option>
                              <option value="0">0°</option>
                              <option value="90">90°</option>
                              <option value="180">180°</option>
                              <option value="270">270°</option>
                            </select>
                          </div>
                        </div>
                      )}
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
