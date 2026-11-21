import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import {
  Camera,
  Check,
  Grid,
  Mic,
  MicOff,
  Monitor,
  PlugZap,
  Plus,
  QrCode,
  RefreshCw,
  Smartphone,
  Star,
  Tv,
  Video,
  Zap,
} from 'lucide-react';
import type { BroadcastCameraData, ObsControllerProfileData } from '../../types/obs.ts';
import type { ObsLayoutType } from '../../utils/obsLayoutGeometry.ts';
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
  onPromotePrimary: (cam: BroadcastCameraData, action: GridPromoteAction) => Promise<void> | void;
  onCapturePreview: (cam: BroadcastCameraData) => Promise<void> | void;
  onRefreshAllPreviews: (cams: BroadcastCameraData[]) => Promise<void> | void;
  onToggleAudio: (cam: BroadcastCameraData) => Promise<void> | void;
  onReconnectCamera: (cam: BroadcastCameraData) => Promise<void> | void;
  onOpenQrWizard: (cam: BroadcastCameraData) => void;
  onScaffoldCameras: (count: number) => Promise<void> | void;
  onSyncObsState: () => Promise<void> | void;
  onOpenCamerasTab: () => void;
  onOpenConnectionTab: () => void;
}

function isCameraPrimary(
  cam: BroadcastCameraData,
  profile: ObsControllerProfileData,
  obsConnected: boolean
): boolean {
  if (!obsConnected) return false;
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
  if (
    obsConnected &&
    (profile.activeCameraId === cam.cameraId ||
      (cam.obsSceneName && profile.activeObsScene === cam.obsSceneName))
  ) {
    return true;
  }
  return false;
}

function resolveAutoGridColsClass(count: number, overrideCols: 'auto' | 2 | 3 | 4): string {
  if (overrideCols === 2) return 'grid-cols-1 sm:grid-cols-2';
  if (overrideCols === 3) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  if (overrideCols === 4) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
  if (count <= 1) return 'grid-cols-1 sm:grid-cols-2';
  if (count <= 4) return 'grid-cols-1 sm:grid-cols-2';
  if (count <= 6) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
}

function supportsMainSlotSwap(layoutType: ObsLayoutType): boolean {
  return (
    layoutType === 'MAIN_PLUS_SECONDARY' ||
    layoutType === 'SPLIT_3' ||
    layoutType === 'SPORT_BROADCAST'
  );
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
  onPromotePrimary,
  onCapturePreview,
  onRefreshAllPreviews,
  onToggleAudio,
  onReconnectCamera,
  onOpenQrWizard,
  onScaffoldCameras,
  onSyncObsState,
  onOpenCamerasTab,
  onOpenConnectionTab,
}: CameraPreviewGridProps) {
  const enabledCameras = useMemo(() => cameras.filter((c) => c.enabled), [cameras]);

  const activeCameras = useMemo(
    () => enabledCameras.filter((cam) => isCameraActiveOrOnline(cam, profile, obsConnected)),
    [enabledCameras, profile, obsConnected]
  );

  const [filterMode, setFilterMode] = useState<GridFilterMode>('active');
  const [previewMode, setPreviewMode] = useState<GridPreviewMode>('snapshots');
  const [columnMode, setColumnMode] = useState<'auto' | 2 | 3 | 4>('auto');
  const [promoteAction, setPromoteAction] = useState<GridPromoteAction>('cut_live');
  const [pollSeconds, setPollSeconds] = useState<0 | 3 | 5 | 10>(0);

  // Order active primary camera first so promoting any thumbnail smoothly reorders the grid via Framer Motion layout
  const displayedCameras = useMemo(() => {
    const baseList = filterMode === 'active' ? activeCameras : enabledCameras;
    return [...baseList].sort((a, b) => {
      const aPrimary = isCameraPrimary(a, profile, obsConnected);
      const bPrimary = isCameraPrimary(b, profile, obsConnected);
      if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;
      return (a.sortOrder || a.cameraNumber) - (b.sortOrder || b.cameraNumber);
    });
  }, [filterMode, activeCameras, enabledCameras, profile, obsConnected]);

  const primaryCamera = useMemo(() => {
    if (enabledCameras.length === 0) return null;
    if (profile.activeCameraId) {
      const byId = enabledCameras.find((c) => c.cameraId === profile.activeCameraId);
      if (byId) return byId;
    }
    if (obsConnected && profile.activeObsScene) {
      const byScene = enabledCameras.find(
        (c) => c.obsSceneName && c.obsSceneName === profile.activeObsScene
      );
      if (byScene) return byScene;
    }
    return null;
  }, [enabledCameras, profile.activeCameraId, profile.activeObsScene, obsConnected]);

  // Optional auto-polling of genuine OBS source screenshots
  useEffect(() => {
    if (!obsConnected || previewMode !== 'snapshots' || pollSeconds === 0) return;
    if (displayedCameras.length === 0) return;

    const id = window.setInterval(() => {
      if (!refreshingAllPreviews) {
        void onRefreshAllPreviews(displayedCameras);
      }
    }, pollSeconds * 1000);

    return () => window.clearInterval(id);
  }, [obsConnected, previewMode, pollSeconds, displayedCameras, refreshingAllPreviews, onRefreshAllPreviews]);

  const primarySnapshot = primaryCamera ? previewSnapshots[primaryCamera.cameraId] : undefined;
  const primaryMuted = primaryCamera
    ? Boolean(primaryCamera.obsInputMuted ?? primaryCamera.audioMuted ?? primaryCamera.telemetry?.audioMuted)
    : false;
  const canSwapMainLayout = supportsMainSlotSwap(profile.activeLayoutType);

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-5">
      {/* Section Header + Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="min-w-0 space-y-1">
          <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
            <Grid className="w-4 h-4 text-[#EA580C] shrink-0" />
            <span>Dynamic Multiview Camera Grid</span>
          </h2>
          <p className="text-xs text-slate-500">
            Click any active camera thumbnail below to immediately promote it as the primary broadcast feed in OBS Studio.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Active vs All Enabled Segmented Toggle */}
          <div
            className="inline-flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200"
            role="group"
            aria-label="Camera grid filter"
          >
            <button
              type="button"
              onClick={() => setFilterMode('active')}
              className={`min-h-[30px] px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                filterMode === 'active'
                  ? 'bg-[#EA580C] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active Feeds ({activeCameras.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`min-h-[30px] px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                filterMode === 'all'
                  ? 'bg-[#EA580C] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Enabled ({enabledCameras.length})
            </button>
          </div>

          {/* Preview Engine Toggle */}
          <div
            className="inline-flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200"
            role="group"
            aria-label="Preview feed source"
          >
            <button
              type="button"
              onClick={() => setPreviewMode('snapshots')}
              className={`min-h-[30px] px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                previewMode === 'snapshots'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              OBS Snapshots
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('live_vdo')}
              className={`min-h-[30px] px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                previewMode === 'live_vdo'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Live WebRTC
            </button>
          </div>

          {/* Click Behavior Selector */}
          {canSwapMainLayout && (
            <select
              value={promoteAction}
              onChange={(e) => setPromoteAction(e.target.value as GridPromoteAction)}
              aria-label="Click thumbnail action"
              className="min-h-[36px] px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-lg bg-slate-50 text-slate-700"
            >
              <option value="cut_live">Click: Cut Fullscreen Live</option>
              <option value="swap_layout_main">Click: Promote to Layout Main</option>
            </select>
          )}

          {/* Grid Columns */}
          <select
            value={columnMode}
            onChange={(e) => {
              const v = e.target.value;
              setColumnMode(v === 'auto' ? 'auto' : (Number(v) as 2 | 3 | 4));
            }}
            aria-label="Grid columns"
            className="min-h-[36px] px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-lg bg-slate-50 text-slate-700"
          >
            <option value="auto">Grid: Auto</option>
            <option value={2}>Grid: 2 Cols</option>
            <option value={3}>Grid: 3 Cols</option>
            <option value={4}>Grid: 4 Cols</option>
          </select>

          {/* Auto-Poll OBS Previews */}
          {previewMode === 'snapshots' && (
            <select
              value={pollSeconds}
              disabled={!obsConnected}
              onChange={(e) => setPollSeconds(Number(e.target.value) as 0 | 3 | 5 | 10)}
              aria-label="Auto-refresh preview interval"
              className="min-h-[36px] px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-lg bg-slate-50 text-slate-700 disabled:opacity-40"
            >
              <option value={0}>Auto-Poll: Off</option>
              <option value={3}>Auto-Poll: 3s</option>
              <option value={5}>Auto-Poll: 5s</option>
              <option value={10}>Auto-Poll: 10s</option>
            </select>
          )}

          <button
            type="button"
            disabled={!obsConnected || refreshingAllPreviews || displayedCameras.length === 0}
            onClick={() => onRefreshAllPreviews(displayedCameras)}
            className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingAllPreviews ? 'animate-spin' : ''}`} />
            <span>{refreshingAllPreviews ? 'Fetching...' : 'Refresh Previews'}</span>
          </button>

          <button
            type="button"
            disabled={!obsConnected}
            onClick={onSyncObsState}
            className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Sync OBS</span>
          </button>

          {canManageCameras && (
            <button
              type="button"
              onClick={onOpenCamerasTab}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Cameras</span>
            </button>
          )}
        </div>
      </div>

      {/* Empty State when zero cameras configured */}
      {enabledCameras.length === 0 ? (
        <EmptyState
          icon={<Smartphone className="w-6 h-6" />}
          title="No cameras added for this match yet"
          description="Provision 2, 4, 6, or more smartphone or studio cameras to view live thumbnails and switch primary feeds."
          action={
            canManageCameras ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {[2, 4, 6].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    disabled={scaffoldingCount !== null}
                    onClick={() => onScaffoldCameras(cnt)}
                    className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap"
                  >
                    {scaffoldingCount === cnt ? `Adding ${cnt}...` : `+ Quick Add ${cnt} Cameras`}
                  </button>
                ))}
              </div>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Primary Feed Stage */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch border-b border-slate-200 pb-5">
            <div className="lg:col-span-8">
              <div className="relative aspect-video w-full rounded-lg border border-slate-700 bg-slate-950 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={primaryCamera ? primaryCamera.cameraId : 'primary-standby'}
                    initial={{ opacity: 0.65, scale: 0.99 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0.65 }}
                    transition={{ duration: 0.2 }}
                    className="w-full h-full"
                  >
                    {primaryCamera ? (
                      previewMode === 'live_vdo' &&
                      primaryCamera.sourceType === 'vdoninja' &&
                      primaryCamera.obsBrowserSourceUrl ? (
                        <iframe
                          title={`Primary feed ${primaryCamera.name}`}
                          src={primaryCamera.obsBrowserSourceUrl}
                          allow="autoplay; fullscreen"
                          className="w-full h-full border-0 bg-slate-950"
                        />
                      ) : primarySnapshot ? (
                        <img
                          src={primarySnapshot.imageData}
                          alt={`Primary OBS program feed for ${primaryCamera.label || primaryCamera.name}`}
                          className="w-full h-full object-contain bg-slate-950"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
                          <Tv className="w-8 h-8 text-slate-600" />
                          <p className="text-sm font-semibold text-slate-200">
                            {primaryCamera.label || primaryCamera.name}
                          </p>
                          <p className="text-xs text-slate-400 max-w-md">
                            {obsConnected
                              ? 'Click "Fetch Primary Frame" or "Refresh Previews" to pull a live frame from OBS Studio.'
                              : 'OBS Studio is disconnected. Connect OBS to stream and monitor the live primary feed.'}
                          </p>
                          {obsConnected && (
                            <button
                              type="button"
                              disabled={capturingPreviewFor === primaryCamera.cameraId}
                              onClick={() => onCapturePreview(primaryCamera)}
                              className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-40"
                            >
                              <RefreshCw
                                className={`w-3.5 h-3.5 ${
                                  capturingPreviewFor === primaryCamera.cameraId ? 'animate-spin' : ''
                                }`}
                              />
                              <span>
                                {capturingPreviewFor === primaryCamera.cameraId
                                  ? 'Fetching...'
                                  : 'Fetch Primary Frame'}
                              </span>
                            </button>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
                        <Monitor className="w-8 h-8 text-slate-600" />
                        <p className="text-sm font-semibold text-slate-200">
                          {obsConnected
                            ? `Active OBS Scene: ${profile.activeObsScene || 'None Selected'}`
                            : 'Primary Program Feed Offline'}
                        </p>
                        <p className="text-xs text-slate-400 max-w-md">
                          {obsConnected
                            ? 'Click any camera thumbnail below to promote it as the primary feed.'
                            : 'Connect OBS Studio first, then click any active camera thumbnail to promote it live.'}
                        </p>
                        {!obsConnected && (
                          <button
                            type="button"
                            onClick={onOpenConnectionTab}
                            className="min-h-[34px] px-3 py-1.5 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600"
                          >
                            Configure OBS Connection
                          </button>
                        )}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>

                {/* Measured Gradient Scrim Overlay */}
                <div className="pointer-events-none absolute inset-x-0 top-0 p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-mono text-white">
                    <span
                      className={`px-2 py-0.5 rounded font-bold tracking-wide ${
                        obsConnected && primaryCamera
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-800 text-slate-200'
                      }`}
                    >
                      {obsConnected && primaryCamera ? 'PRIMARY PROGRAM' : 'PRIMARY STANDBY'}
                    </span>
                    {primaryCamera && (
                      <span className="font-bold truncate">
                        CAM {primaryCamera.cameraNumber} · {primaryCamera.label || primaryCamera.name}
                      </span>
                    )}
                  </div>
                  {primarySnapshot && (
                    <span className="font-mono tabular-nums text-[11px] text-slate-200">
                      Frame {primarySnapshot.capturedAt}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Primary Feed Metadata & Direct Controls Rail */}
            <div className="lg:col-span-4 flex flex-col justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Active Primary Feed
                  </p>
                  <h3 className="text-base font-bold text-slate-900 truncate">
                    {primaryCamera
                      ? primaryCamera.label || primaryCamera.name
                      : obsConnected
                        ? profile.activeObsScene || 'Custom OBS Scene'
                        : 'No Primary Feed Selected'}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 font-mono tabular-nums">
                    <span>
                      {primaryCamera
                        ? `CAM ${primaryCamera.cameraNumber} · ${primaryCamera.resolution} · ${primaryCamera.fps}fps`
                        : 'Select a thumbnail to promote'}
                    </span>
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 pt-2 border-t border-slate-200 text-xs">
                  <div>
                    <dt className="text-slate-500">OBS Status</dt>
                    <dd className="font-mono font-semibold text-slate-900 mt-0.5">
                      {profile.connectionStatus}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Active Scene</dt>
                    <dd className="font-mono font-semibold text-slate-900 truncate mt-0.5">
                      {obsConnected ? profile.activeObsScene || 'Idle' : 'Unavailable'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Active Layout</dt>
                    <dd className="font-mono font-semibold text-slate-900 mt-0.5">
                      {profile.activeLayoutType}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Online Feeds</dt>
                    <dd className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                      {activeCameras.length} / {enabledCameras.length}
                    </dd>
                  </div>
                </dl>
              </div>

              {primaryCamera && (
                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    disabled={!obsConnected || capturingPreviewFor === primaryCamera.cameraId}
                    onClick={() => onCapturePreview(primaryCamera)}
                    className="flex-1 min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 whitespace-nowrap"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        capturingPreviewFor === primaryCamera.cameraId ? 'animate-spin' : ''
                      }`}
                    />
                    <span>Fetch Frame</span>
                  </button>
                  <button
                    type="button"
                    disabled={mutingCamId === primaryCamera.cameraId}
                    onClick={() => onToggleAudio(primaryCamera)}
                    className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-lg whitespace-nowrap ${
                      primaryMuted
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {primaryMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                    <span>{primaryMuted ? 'Muted' : 'Audio Live'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenQrWizard(primaryCamera)}
                    title="Smartphone Setup QR"
                    className="min-h-[36px] px-2.5 py-1.5 text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Active Camera Thumbnails Grid */}
          {displayedCameras.length === 0 ? (
            <EmptyState
              icon={<Camera className="w-6 h-6" />}
              title="No active cameras reporting online right now"
              description="Cameras appear here automatically once their mobile link connects, OBS attaches to a camera scene, or you switch to view all enabled cameras."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFilterMode('all')}
                    className="min-h-[38px] px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600"
                  >
                    Show All Enabled Cameras ({enabledCameras.length})
                  </button>
                  {canManageCameras && (
                    <button
                      type="button"
                      onClick={onOpenCamerasTab}
                      className="min-h-[38px] px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100"
                    >
                      Open Camera QR Setup
                    </button>
                  )}
                </div>
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
                    const isPrimary = isCameraPrimary(cam, profile, obsConnected);
                    const isOnline = isCameraActiveOrOnline(cam, profile, obsConnected);
                    const snap = previewSnapshots[cam.cameraId];
                    const previewErr = previewErrors[cam.cameraId];
                    const isSwitching = switchingKey === `cam:${cam.cameraId}`;
                    const isReconnecting = reconnectingCamId === cam.cameraId;
                    const isMuted = Boolean(
                      cam.obsInputMuted ?? cam.audioMuted ?? cam.telemetry?.audioMuted
                    );
                    const showLiveVdo =
                      previewMode === 'live_vdo' &&
                      cam.sourceType === 'vdoninja' &&
                      Boolean(cam.obsBrowserSourceUrl);

                    return (
                      <motion.div
                        key={cam.cameraId}
                        layout
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.94 }}
                        transition={{
                          layout: { type: 'spring', stiffness: 360, damping: 30, mass: 0.85 },
                          opacity: { duration: 0.18 },
                          scale: { duration: 0.18 },
                        }}
                        className={`group rounded-xl border overflow-hidden transition-colors bg-white ${
                          isPrimary
                            ? 'border-[#EA580C] ring-2 ring-[#EA580C]/25'
                            : 'border-slate-200 hover:border-[#EA580C]/70'
                        }`}
                      >
                        {/* Clickable Thumbnail Button -> Promote as Primary Feed */}
                        <button
                          type="button"
                          disabled={isSwitching}
                          onClick={() => onPromotePrimary(cam, promoteAction)}
                          aria-label={`Promote ${cam.label || cam.name} as primary feed`}
                          className="relative block w-full aspect-video bg-slate-950 overflow-hidden border-b border-slate-200 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EA580C] cursor-pointer"
                        >
                          {showLiveVdo ? (
                            <iframe
                              title={`Live monitor ${cam.name}`}
                              src={cam.obsBrowserSourceUrl}
                              allow="autoplay"
                              className="w-full h-full border-0 pointer-events-none bg-slate-950"
                            />
                          ) : snap ? (
                            <img
                              src={snap.imageData}
                              alt={`OBS preview for ${cam.label || cam.name}`}
                              className="w-full h-full object-contain bg-slate-950"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center space-y-1.5">
                              <Video className="w-6 h-6 text-slate-600" />
                              <p className="text-[11px] font-medium text-slate-300">
                                {previewErr
                                  ? 'Preview unavailable in OBS'
                                  : obsConnected
                                    ? 'No frame captured yet'
                                    : 'OBS disconnected'}
                              </p>
                              <p className="text-[10px] font-mono text-slate-500">
                                {cam.obsInputName || cam.obsSceneName || cam.name}
                              </p>
                            </div>
                          )}

                          {/* Top Scrim Metadata */}
                          <div className="absolute inset-x-0 top-0 p-2.5 bg-gradient-to-b from-black/80 via-black/35 to-transparent flex items-center justify-between gap-2">
                            <span className="font-mono tabular-nums text-[11px] font-bold text-white">
                              CAM {cam.cameraNumber}
                              <span className="text-slate-300 font-normal"> · {cam.status}</span>
                            </span>
                            {isPrimary ? (
                              <motion.span
                                layoutId="primary-camera-active-badge"
                                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#EA580C] text-white font-mono text-[10px] font-bold tracking-wide"
                              >
                                <Check className="w-3 h-3" />
                                PRIMARY
                              </motion.span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-black/70 text-slate-100 font-mono text-[10px] font-semibold opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                                {isSwitching ? 'Switching...' : 'Promote Primary'}
                              </span>
                            )}
                          </div>

                          {/* Bottom Scrim Status */}
                          <div className="absolute inset-x-0 bottom-0 px-2.5 py-1.5 bg-gradient-to-t from-black/80 via-black/35 to-transparent flex items-center justify-between gap-2 text-[10px] font-mono text-slate-200 tabular-nums">
                            <span className="truncate">
                              {isOnline ? 'Signal Ready' : 'Standby'} · {cam.resolution}@{cam.fps}
                            </span>
                            {snap && <span>{snap.capturedAt}</span>}
                          </div>
                        </button>

                        {/* Tile Metadata & Direct Low-Latency Controls */}
                        <div className="p-3 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-bold text-slate-900 truncate">
                                {cam.label || cam.name}
                              </p>
                              {cam.isDefault && (
                                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 font-mono truncate tabular-nums">
                              {cam.operatorName ? `${cam.operatorName} · ` : ''}
                              {cam.obsSceneName || 'Auto Scene'}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={isReconnecting}
                              onClick={(e) => {
                                e.stopPropagation();
                                onReconnectCamera(cam);
                              }}
                              title="Reconnect camera source"
                              aria-label={`Reconnect ${cam.label || cam.name}`}
                              className="min-h-[30px] min-w-[30px] inline-flex items-center justify-center px-2 py-1 text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40"
                            >
                              {isReconnecting ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#EA580C]" />
                              ) : (
                                <PlugZap className="w-3.5 h-3.5" />
                              )}
                            </button>

                            <button
                              type="button"
                              disabled={mutingCamId === cam.cameraId}
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleAudio(cam);
                              }}
                              title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                              aria-label={`${isMuted ? 'Unmute audio' : 'Mute audio'} for ${cam.label || cam.name}`}
                              className={`min-h-[30px] min-w-[30px] inline-flex items-center justify-center px-2 py-1 rounded-lg border ${
                                isMuted
                                  ? 'bg-red-50 text-red-700 border-red-200'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              } disabled:opacity-40`}
                            >
                              {isMuted ? (
                                <MicOff className="w-3.5 h-3.5" />
                              ) : (
                                <Mic className="w-3.5 h-3.5" />
                              )}
                            </button>

                            <button
                              type="button"
                              disabled={!obsConnected || capturingPreviewFor === cam.cameraId}
                              onClick={(e) => {
                                e.stopPropagation();
                                onCapturePreview(cam);
                              }}
                              title="Refresh OBS preview frame"
                              aria-label={`Refresh preview frame for ${cam.label || cam.name}`}
                              className="min-h-[30px] min-w-[30px] inline-flex items-center justify-center px-2 py-1 text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40"
                            >
                              <Camera
                                className={`w-3.5 h-3.5 ${
                                  capturingPreviewFor === cam.cameraId ? 'animate-pulse text-[#EA580C]' : ''
                                }`}
                              />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenQrWizard(cam);
                              }}
                              title="Smartphone QR Setup"
                              aria-label={`Open QR setup for ${cam.label || cam.name}`}
                              className="min-h-[30px] min-w-[30px] inline-flex items-center justify-center px-2 py-1 text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            </LayoutGroup>
          )}
        </>
      )}
    </section>
  );
}
