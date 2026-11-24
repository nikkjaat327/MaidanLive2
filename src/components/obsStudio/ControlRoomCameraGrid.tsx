import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Maximize2,
  Mic,
  MicOff,
  PlugZap,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  Sliders,
  Video,
  Wifi,
  X,
} from 'lucide-react';
import type {
  BroadcastCameraData,
  ObsControllerProfileData,
  ObsSceneTransformItem,
} from '../../types/obs.ts';
import {
  LAYOUT_METADATA,
  MAX_CONTROL_ROOM_CAMERAS,
  type ObsLayoutType,
} from '../../utils/obsLayoutGeometry.ts';
import {
  detectFrameActiveContentOrientation,
  getPreviewMediaStyles,
  normalizePreviewFit,
  parseOrientationDegrees,
  resolveCameraLiveWebUrl,
  resolveCameraOrientationSummary,
  type DetectedFrameContentInfo,
} from '../../utils/obsTransformGeometry.ts';
import type { CameraPreviewSnapshot } from './CameraPreviewGrid.tsx';

interface ControlRoomCameraGridProps {
  cameras: BroadcastCameraData[];
  profile: ObsControllerProfileData;
  obsConnected: boolean;
  canManageCameras: boolean;
  previewSnapshots: Record<string, CameraPreviewSnapshot>;
  previewErrors?: Record<string, string>;
  switchingKey: string | null;
  mutingCamId: string | null;
  reconnectingCamId?: string | null;
  refreshingAllPreviews: boolean;
  selectedCameraIds: string[];
  mainCameraId: string;
  stagedLayoutType: ObsLayoutType;
  autoFitEnabled: boolean;
  onToggleAutoFit: (val: boolean) => void;
  onSelectMultiViewLayout: (layout: ObsLayoutType) => void;
  onToggleSelectCamera: (cam: BroadcastCameraData) => void;
  onCutCameraLive: (cam: BroadcastCameraData) => Promise<void> | void;
  onToggleAudio: (cam: BroadcastCameraData) => Promise<void> | void;
  onReconnectCamera: (cam: BroadcastCameraData) => Promise<void> | void;
  onRefreshAllPreviews: (
    cams: BroadcastCameraData[],
    options?: { background?: boolean }
  ) => Promise<void> | void;
  onOpenQrWizard: (cam: BroadcastCameraData) => void;
  onOpenLarixWizard?: (cam: BroadcastCameraData) => void;
  onOpenMapSourcesModal: () => void;
  onOpenCamerasTab: () => void;
  obsTransforms?: ObsSceneTransformItem[];
  detectedContentMap?: Record<string, DetectedFrameContentInfo>;
  onFrameContentDetected?: (cameraKey: string, info: DetectedFrameContentInfo) => void;
}

const MULTI_VIEW_OPTIONS: ObsLayoutType[] = [
  'SINGLE',
  'SPLIT_2_H',
  'PIP',
  'SPLIT_3',
  'GRID_4',
  'GRID_5',
  'GRID_6',
  'GRID_8',
];

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

function isCameraConnected(
  cam: BroadcastCameraData,
  profile: ObsControllerProfileData,
  obsConnected: boolean
): boolean {
  if (!cam.enabled || cam.mediamtxRevoked) return false;
  if (cam.status === 'ACTIVE' || cam.status === 'CONNECTED') return true;
  if (cam.sourceType === 'mediamtx' && cam.mediamtxPublisherConnected) return true;
  return isCameraInProgram(cam, profile, obsConnected);
}

/**
 * Dynamic responsive grid supporting 1 to 6 cameras:
 * 1: single tile
 * 2: 2-column grid
 * 3: responsive 2-column arrangement
 * 4: 2x2 grid
 * 5: responsive balanced arrangement (2 on top, 3 on bottom on desktop)
 * 6: 3x2 grid on desktop
 */
function resolveSixCamGridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2';
  if (count === 3) return 'grid-cols-1 sm:grid-cols-2';
  if (count === 4) return 'grid-cols-1 sm:grid-cols-2';
  if (count === 5) return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-6';
  if (count === 6) return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3';
  return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4';
}

function resolveTileSpanClass(count: number, index: number): string {
  if (count === 5) {
    return index < 2 ? 'xl:col-span-3' : 'xl:col-span-2';
  }
  return '';
}

function SignalBars({ bars }: { bars: 0 | 1 | 2 | 3 | 4 }) {
  return (
    <span className="inline-flex items-end gap-[2px] h-3" aria-label={`Signal strength ${bars} of 4`}>
      {[1, 2, 3, 4].map((level) => {
        const active = bars >= level;
        const heightClass =
          level === 1 ? 'h-1' : level === 2 ? 'h-1.5' : level === 3 ? 'h-2.5' : 'h-3';
        return (
          <span
            key={level}
            className={`w-[3px] rounded-[1px] ${heightClass} ${
              active
                ? bars <= 2
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
                : 'bg-slate-600/60'
            }`}
          />
        );
      })}
    </span>
  );
}

function resolveSignalStrength(
  cam: BroadcastCameraData,
  online: boolean
): 0 | 1 | 2 | 3 | 4 {
  if (cam.status === 'ERROR') return 1;
  if (!online) return 0;
  const fps = cam.telemetry?.fpsActual || cam.fps || 30;
  if (fps >= 24) return 4;
  if (fps >= 15) return 3;
  return 2;
}

function resolveAspectLabel(
  ori: ReturnType<typeof resolveCameraOrientationSummary>,
  cam: BroadcastCameraData
): string {
  if (ori.isPortraitFeed) return '9:16';
  if (ori.orientation === 'SQUARE') return '1:1';
  if (ori.orientation === 'LANDSCAPE') return '16:9';
  if (cam.resolution === '640x360' || cam.resolution === '1280x720' || cam.resolution === '1920x1080') {
    return '16:9';
  }
  return cam.resolution || '16:9';
}

function resolveSourceShortLabel(cam: BroadcastCameraData): string {
  if (cam.sourceType === 'vdoninja') return 'VDO.Ninja';
  if (cam.sourceType === 'mediamtx') return 'Larix';
  if (cam.sourceType === 'obs_input') return 'OBS';
  return cam.sourceType.toUpperCase();
}

export function ControlRoomCameraGrid({
  cameras,
  profile,
  obsConnected,
  canManageCameras,
  previewSnapshots,
  previewErrors = {},
  switchingKey,
  mutingCamId,
  reconnectingCamId = null,
  refreshingAllPreviews,
  selectedCameraIds,
  stagedLayoutType,
  autoFitEnabled,
  onToggleAutoFit,
  onSelectMultiViewLayout,
  onToggleSelectCamera,
  onCutCameraLive,
  onToggleAudio,
  onReconnectCamera,
  onRefreshAllPreviews,
  onOpenQrWizard,
  onOpenLarixWizard,
  onOpenMapSourcesModal,
  onOpenCamerasTab,
  obsTransforms = [],
  detectedContentMap = {},
  onFrameContentDetected,
}: ControlRoomCameraGridProps) {
  const [fullscreenCamId, setFullscreenCamId] = useState<string | null>(null);
  const [tabVisible, setTabVisible] = useState<boolean>(
    () => typeof document === 'undefined' || document.visibilityState === 'visible'
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => setTabVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const enabledCameras = useMemo(
    () =>
      cameras
        .filter((c) => c.enabled)
        .sort((a, b) => (a.sortOrder || a.cameraNumber) - (b.sortOrder || b.cameraNumber)),
    [cameras]
  );

  // Maximum 6 cameras displayed/managed in the Control Room grid
  const visibleCameras = useMemo(
    () => enabledCameras.slice(0, MAX_CONTROL_ROOM_CAMERAS),
    [enabledCameras]
  );

  const connectedCount = useMemo(
    () => visibleCameras.filter((cam) => isCameraConnected(cam, profile, obsConnected)).length,
    [visibleCameras, profile, obsConnected]
  );

  const obsTransformLookup = useMemo(() => {
    const map = new Map<string, ObsSceneTransformItem>();
    for (const t of obsTransforms) {
      if (t.sourceName) map.set(t.sourceName, t);
    }
    return map;
  }, [obsTransforms]);

  const snapshotTargets = useMemo(
    () => visibleCameras.filter((cam) => !resolveCameraLiveWebUrl(cam)),
    [visibleCameras]
  );
  const snapshotTargetsRef = useRef(snapshotTargets);
  snapshotTargetsRef.current = snapshotTargets;
  const refreshingRef = useRef(refreshingAllPreviews);
  refreshingRef.current = refreshingAllPreviews;
  const onRefreshRef = useRef(onRefreshAllPreviews);
  onRefreshRef.current = onRefreshAllPreviews;
  const hasSnapshotTargets = snapshotTargets.length > 0;

  useEffect(() => {
    if (!obsConnected || !tabVisible || !hasSnapshotTargets) return;
    const poll = () => {
      if (document.visibilityState !== 'visible' || refreshingRef.current) return;
      if (snapshotTargetsRef.current.length > 0) {
        void onRefreshRef.current(snapshotTargetsRef.current, { background: true });
      }
    };
    poll();
    const id = window.setInterval(poll, 2500);
    return () => window.clearInterval(id);
  }, [obsConnected, tabVisible, hasSnapshotTargets]);

  const fullscreenCam = useMemo(
    () => visibleCameras.find((c) => c.cameraId === fullscreenCamId) || null,
    [visibleCameras, fullscreenCamId]
  );

  return (
    <section className="rounded-xl border border-slate-800/90 bg-[#0B101B] p-3 space-y-3">
      {/* Toolbar Header matching reference screenshot */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Video className="w-4 h-4 text-slate-300 shrink-0" />
          <h2 className="text-xs sm:text-sm font-bold text-white truncate">
            Cameras ({connectedCount > 0 ? connectedCount : visibleCameras.length}{' '}
            {connectedCount > 0 ? 'Connected' : 'Configured'})
          </h2>
          {enabledCameras.length > MAX_CONTROL_ROOM_CAMERAS && (
            <button
              type="button"
              onClick={onOpenCamerasTab}
              className="px-2 py-0.5 rounded bg-purple-500/15 border border-purple-500/40 text-[10px] font-semibold text-purple-200 hover:bg-purple-500/25 whitespace-nowrap"
            >
              Max {MAX_CONTROL_ROOM_CAMERAS} shown ({enabledCameras.length} total)
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Multi-View Layout Dropdown */}
          <select
            aria-label="Multi-View layout selector"
            value={
              MULTI_VIEW_OPTIONS.includes(stagedLayoutType) ? stagedLayoutType : 'GRID_4'
            }
            onChange={(e) => onSelectMultiViewLayout(e.target.value as ObsLayoutType)}
            className="h-8 px-2.5 rounded-lg bg-[#121826] border border-slate-700/90 text-xs font-semibold text-slate-100 focus:outline-none focus:border-purple-500"
          >
            {MULTI_VIEW_OPTIONS.map((opt) => {
              const meta = LAYOUT_METADATA[opt];
              const disabled = opt !== 'SINGLE' && visibleCameras.length < meta.minCameras;
              return (
                <option key={opt} value={opt} disabled={disabled}>
                  Multi-View: {meta.shortLabel}
                </option>
              );
            })}
          </select>

          {/* Auto Fit (Aspect Ratio) Green Toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={autoFitEnabled}
            onClick={() => onToggleAutoFit(!autoFitEnabled)}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer"
          >
            <span className="whitespace-nowrap">Auto Fit (Aspect Ratio)</span>
            <span
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                autoFitEnabled ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  autoFitEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`}
              />
            </span>
          </button>

          {canManageCameras && (
            <button
              type="button"
              onClick={onOpenCamerasTab}
              className="h-8 px-2.5 rounded-lg bg-[#121826] border border-slate-700/90 hover:border-purple-500/70 text-[11px] font-semibold text-slate-200 inline-flex items-center gap-1 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 text-purple-400" />
              <span>Manage</span>
            </button>
          )}
        </div>
      </div>

      {/* Camera Grid (Max 6 Cameras) */}
      {visibleCameras.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 bg-[#070B13] py-8 px-4 text-center space-y-3">
          <Camera className="w-7 h-7 text-slate-500 mx-auto" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-200">No cameras configured yet</p>
            <p className="text-[11px] text-slate-400 max-w-md mx-auto">
              Add smartphone VDO.Ninja feeds, Larix RTMP/SRT cameras, or map OBS inputs (up to {MAX_CONTROL_ROOM_CAMERAS} simultaneous cameras in Control Room).
            </p>
          </div>
          {canManageCameras && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={onOpenMapSourcesModal}
                className="h-8 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Map OBS Sources</span>
              </button>
              <button
                type="button"
                onClick={onOpenCamerasTab}
                className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                Add Cameras
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className={`grid gap-2.5 ${resolveSixCamGridClass(visibleCameras.length)}`}>
          {visibleCameras.map((cam, idx) => {
            const inProgram = isCameraInProgram(cam, profile, obsConnected);
            const online = isCameraConnected(cam, profile, obsConnected);
            const slotIndex = selectedCameraIds.indexOf(cam.cameraId);
            const isSelected = slotIndex >= 0;
            const isMuted = Boolean(
              cam.obsInputMuted ?? cam.audioMuted ?? cam.telemetry?.audioMuted
            );
            const isSwitching = switchingKey === `cam:${cam.cameraId}`;
            const isReconnecting = reconnectingCamId === cam.cameraId;
            const tileVdoUrl = resolveCameraLiveWebUrl(cam);
            const snap = previewSnapshots[cam.cameraId];
            const previewErr = previewErrors[cam.cameraId];

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

            const effectiveFit = autoFitEnabled
              ? normalizePreviewFit(cam.previewFit || 'contain')
              : 'cover';
            const tileRot = parseOrientationDegrees(cam.orientationMode);
            const mediaStyles = getPreviewMediaStyles({
              rotationDeg: tileRot,
              previewFit: effectiveFit,
              isPortraitContent: oriSummary.isPortraitFeed,
              contentAspectRatio: frameInfo?.aspectRatio,
              skipRotation: !tileVdoUrl,
            });
            const signalBars = resolveSignalStrength(cam, online);
            const aspectBadge = resolveAspectLabel(oriSummary, cam);

            const borderClasses = isSelected
              ? 'border-purple-500 ring-2 ring-purple-500/45 shadow-[0_0_16px_rgba(147,51,234,0.22)]'
              : inProgram
                ? 'border-emerald-500 ring-1 ring-emerald-500/40'
                : online
                  ? 'border-emerald-500/60 hover:border-emerald-400'
                  : 'border-slate-800 hover:border-slate-600';

            return (
              <div
                key={cam.cameraId}
                className={`group relative rounded-xl border-2 overflow-hidden bg-[#060911] transition-all ${borderClasses} ${resolveTileSpanClass(
                  visibleCameras.length,
                  idx
                )}`}
              >
                {/* Main Clickable Tile Surface (stages camera into Preview) */}
                <button
                  type="button"
                  disabled={isSwitching}
                  onClick={() => onToggleSelectCamera(cam)}
                  aria-label={`Select CAM ${cam.cameraNumber} ${cam.label || cam.name}`}
                  className="relative block w-full aspect-video bg-black overflow-hidden text-left focus-visible:outline-none cursor-pointer"
                >
                  {tileVdoUrl ? (
                    <iframe
                      key={`tile:${cam.cameraId}:${tileVdoUrl}`}
                      title={`CAM ${cam.cameraNumber} ${cam.label || cam.name}`}
                      src={tileVdoUrl}
                      allow="autoplay; fullscreen; encrypted-media"
                      style={
                        mediaStyles.transform !== 'none'
                          ? { transform: mediaStyles.transform, transformOrigin: 'center center' }
                          : undefined
                      }
                      className="relative z-[1] w-full h-full border-0 pointer-events-none bg-black transition-transform duration-150"
                    />
                  ) : snap ? (
                    <img
                      src={snap.imageData}
                      alt={`CAM ${cam.cameraNumber} ${cam.label || cam.name}`}
                      onLoad={(e) => {
                        if (!onFrameContentDetected) return;
                        const info = detectFrameActiveContentOrientation(e.currentTarget);
                        if (info) onFrameContentDetected(cam.cameraId, info);
                      }}
                      className={`relative z-[1] w-full h-full ${mediaStyles.objectClass} bg-black`}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center space-y-1 bg-[#060911]">
                      <Video className="w-5 h-5 text-slate-600" />
                      <span className="text-[11px] font-semibold text-slate-300 truncate max-w-full">
                        {cam.label || cam.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 truncate max-w-full">
                        {previewErr
                          ? 'Preview unavailable'
                          : obsConnected
                            ? cam.obsInputName || 'Waiting for frame'
                            : 'OBS Disconnected'}
                      </span>
                    </div>
                  )}

                  {/* Top Overlay Header */}
                  <div className="absolute inset-x-0 top-0 z-10 p-2 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0 px-2 py-0.5 rounded-md bg-black/65 backdrop-blur-xs border border-white/10">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          cam.status === 'ERROR'
                            ? 'bg-red-500'
                            : online
                              ? 'bg-emerald-400'
                              : 'bg-slate-500'
                        }`}
                      />
                      <span className="text-[11px] font-semibold text-white truncate">
                        CAM {cam.cameraNumber} – {cam.label || cam.name} ({resolveSourceShortLabel(cam)})
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isSelected && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-600 text-white font-mono text-[10px] font-extrabold">
                          <Check className="w-2.5 h-2.5" />
                          <span>#{slotIndex + 1}</span>
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded font-mono text-[10px] font-extrabold tracking-wide ${
                          inProgram
                            ? 'bg-red-600 text-white'
                            : online
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {inProgram ? 'ON AIR' : online ? 'LIVE' : cam.status}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Metadata Scrim */}
                  <div className="absolute inset-x-0 bottom-0 z-10 px-2.5 py-1.5 bg-gradient-to-t from-black/85 via-black/35 to-transparent flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-black/65 border border-white/10">
                        <SignalBars bars={signalBars} />
                      </span>
                      {cam.telemetry?.fpsActual && (
                        <span className="font-mono text-[10px] text-slate-200 bg-black/65 px-1.5 py-0.5 rounded">
                          {Math.round(cam.telemetry.fpsActual)} fps
                        </span>
                      )}
                    </div>
                    <span className="px-1.5 py-0.5 rounded bg-black/75 border border-white/10 font-mono text-[10px] font-bold text-slate-100">
                      {aspectBadge}
                    </span>
                  </div>
                </button>

                {/* Hover / Compact Quick Controls Strip */}
                <div className="px-2 py-1.5 bg-[#0F1522] border-t border-slate-800/80 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={mutingCamId === cam.cameraId}
                      onClick={() => void onToggleAudio(cam)}
                      title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
                      aria-label={isMuted ? `Unmute CAM ${cam.cameraNumber}` : `Mute CAM ${cam.cameraNumber}`}
                      className={`h-6 px-1.5 rounded border text-[10px] inline-flex items-center gap-1 ${
                        isMuted
                          ? 'bg-red-950/80 border-red-600/60 text-red-200'
                          : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {isMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                    </button>

                    <button
                      type="button"
                      disabled={isReconnecting}
                      onClick={() => void onReconnectCamera(cam)}
                      title="Reconnect source"
                      aria-label={`Reconnect CAM ${cam.cameraNumber}`}
                      className="h-6 px-1.5 rounded border bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500 inline-flex items-center"
                    >
                      {isReconnecting ? (
                        <RefreshCw className="w-3 h-3 animate-spin text-purple-400" />
                      ) : (
                        <PlugZap className="w-3 h-3" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setFullscreenCamId(cam.cameraId)}
                      title="Fullscreen Preview"
                      aria-label={`Fullscreen CAM ${cam.cameraNumber}`}
                      className="h-6 px-1.5 rounded border bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500 inline-flex items-center"
                    >
                      <Maximize2 className="w-3 h-3" />
                    </button>

                    {cam.sourceType === 'mediamtx' ? (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenLarixWizard ? onOpenLarixWizard(cam) : onOpenQrWizard(cam)
                        }
                        title="Larix Setup"
                        aria-label={`Larix setup for CAM ${cam.cameraNumber}`}
                        className="h-6 px-1.5 rounded border bg-slate-900 border-slate-700 text-orange-300 hover:border-orange-500 inline-flex items-center"
                      >
                        <Wifi className="w-3 h-3" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenQrWizard(cam)}
                        title="Smartphone QR"
                        aria-label={`QR setup for CAM ${cam.cameraNumber}`}
                        className="h-6 px-1.5 rounded border bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500 inline-flex items-center"
                      >
                        <QrCode className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={!obsConnected || isSwitching}
                    onClick={() => void onCutCameraLive(cam)}
                    className={`h-6 px-2 rounded text-[10px] font-bold inline-flex items-center gap-1 disabled:opacity-40 ${
                      inProgram
                        ? 'bg-red-600 text-white'
                        : 'bg-purple-600 hover:bg-purple-500 text-white'
                    }`}
                  >
                    <Radio className="w-2.5 h-2.5" />
                    <span>{isSwitching ? '...' : inProgram ? 'ON AIR' : 'Cut Live'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Fullscreen Camera Monitor Lightbox */}
      {fullscreenCam && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xs flex flex-col p-4">
          <div className="flex items-center justify-between gap-3 pb-3">
            <div className="flex items-center gap-2 text-white">
              <span className="px-2 py-0.5 rounded bg-purple-600 font-mono text-xs font-bold">
                CAM {fullscreenCam.cameraNumber}
              </span>
              <span className="text-sm font-bold">{fullscreenCam.label || fullscreenCam.name}</span>
            </div>
            <button
              type="button"
              onClick={() => setFullscreenCamId(null)}
              aria-label="Close fullscreen camera view"
              className="p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <div className="w-full max-w-6xl aspect-video rounded-xl overflow-hidden border border-slate-700 bg-black">
              {resolveCameraLiveWebUrl(fullscreenCam) ? (
                <iframe
                  key={`fs:${fullscreenCam.cameraId}:${resolveCameraLiveWebUrl(fullscreenCam)}`}
                  title={fullscreenCam.label || fullscreenCam.name}
                  src={resolveCameraLiveWebUrl(fullscreenCam)}
                  allow="autoplay; fullscreen; encrypted-media"
                  className="w-full h-full border-0"
                />
              ) : previewSnapshots[fullscreenCam.cameraId] ? (
                <img
                  src={previewSnapshots[fullscreenCam.cameraId].imageData}
                  alt={fullscreenCam.label || fullscreenCam.name}
                  className="w-full h-full object-contain bg-black"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                  Waiting for live feed...
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
