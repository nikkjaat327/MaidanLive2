import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  Grid2x2,
  Layers,
  Loader2,
  Monitor,
  Play,
  Radio,
  RefreshCw,
  Tv,
  X,
} from 'lucide-react';
import {
  computeObsLayoutBoxes,
  LAYOUT_METADATA,
  ObsLayoutType,
  PipPosition,
  PipSize,
} from '../../utils/obsLayoutGeometry.ts';
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
import type { CameraPreviewSnapshot } from './CameraPreviewGrid.tsx';

export type ProgramMonitorMode = 'live_video' | 'obs_frame';

interface ProgramAndCompositionWorkspaceProps {
  cameras: BroadcastCameraData[];
  profile: ObsControllerProfileData;
  obsConnected: boolean;
  previewSnapshots: Record<string, CameraPreviewSnapshot>;
  programSnapshotError?: string | null;
  capturingProgramPreview?: boolean;
  programMonitorMode: ProgramMonitorMode;
  onChangeProgramMonitorMode: (mode: ProgramMonitorMode) => void;
  // Staged / Preview composition state lifted to parent so Camera Grid & Composition stay 100% synced
  selectedCameraIds: string[];
  mainCameraId: string;
  layoutType: ObsLayoutType;
  pipPosition: PipPosition;
  pipSize: PipSize;
  customSceneName: string;
  includeScoreboardOverlay: boolean;
  applying: boolean;
  onChangeSelectedCameraIds: (ids: string[]) => void;
  onChangeMainCameraId: (id: string) => void;
  onChangeLayoutType: (layout: ObsLayoutType) => void;
  onChangePipPosition: (pos: PipPosition) => void;
  onChangePipSize: (size: PipSize) => void;
  onChangeCustomSceneName: (name: string) => void;
  onChangeIncludeScoreboardOverlay: (val: boolean) => void;
  onRefreshProgramPreview: () => Promise<void> | void;
  onApplyLive: () => Promise<void> | void;
  onSavePreset: (payload: {
    name: string;
    obsSceneName: string;
    layoutType: ObsLayoutType;
    cameraIds: string[];
    mainCameraId?: string;
    pipPosition?: PipPosition;
    pipSize?: PipSize;
    includeScoreboardOverlay: boolean;
  }) => Promise<void>;
  onOpenConnectionTab: () => void;
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

function buildVdoProgramMonitorUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.includes('vdo.ninja') || parsed.searchParams.has('view')) {
      parsed.searchParams.set('muted', '1');
      parsed.searchParams.set('autoplay', '1');
      parsed.searchParams.set('noaudio', '1');
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

const LAYOUT_TYPES: ObsLayoutType[] = [
  'SINGLE',
  'SPLIT_2_H',
  'SPLIT_2_V',
  'SPLIT_3',
  'GRID_4',
  'PIP',
  'MAIN_PLUS_SECONDARY',
  'DYNAMIC_GRID',
  'SPORT_BROADCAST',
];

function LayoutSchematicIcon({ type, active }: { type: ObsLayoutType; active: boolean }) {
  const stroke = active ? '#FFFFFF' : '#94A3B8';
  const accent = active ? '#FDBA74' : '#EA580C';
  return (
    <svg viewBox="0 0 40 24" className="w-8 h-5 shrink-0" aria-hidden="true">
      <rect
        x="1"
        y="1"
        width="38"
        height="22"
        rx="2"
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        opacity="0.7"
      />
      {type === 'SINGLE' && (
        <rect x="3" y="3" width="34" height="18" rx="1" fill={accent} opacity="0.45" />
      )}
      {type === 'SPLIT_2_H' && (
        <>
          <rect x="3" y="3" width="16" height="18" rx="1" fill={accent} opacity="0.5" />
          <rect x="21" y="3" width="16" height="18" rx="1" fill={stroke} opacity="0.35" />
        </>
      )}
      {type === 'SPLIT_2_V' && (
        <>
          <rect x="3" y="3" width="34" height="8.5" rx="1" fill={accent} opacity="0.5" />
          <rect x="3" y="12.5" width="34" height="8.5" rx="1" fill={stroke} opacity="0.35" />
        </>
      )}
      {type === 'SPLIT_3' && (
        <>
          <rect x="3" y="3" width="22" height="18" rx="1" fill={accent} opacity="0.5" />
          <rect x="26.5" y="3" width="10.5" height="8.5" rx="1" fill={stroke} opacity="0.35" />
          <rect x="26.5" y="12.5" width="10.5" height="8.5" rx="1" fill={stroke} opacity="0.35" />
        </>
      )}
      {type === 'GRID_4' && (
        <>
          <rect x="3" y="3" width="16" height="8.5" rx="1" fill={accent} opacity="0.5" />
          <rect x="21" y="3" width="16" height="8.5" rx="1" fill={stroke} opacity="0.35" />
          <rect x="3" y="12.5" width="16" height="8.5" rx="1" fill={stroke} opacity="0.35" />
          <rect x="21" y="12.5" width="16" height="8.5" rx="1" fill={stroke} opacity="0.35" />
        </>
      )}
      {type === 'PIP' && (
        <>
          <rect x="3" y="3" width="34" height="18" rx="1" fill={stroke} opacity="0.25" />
          <rect
            x="23"
            y="11.5"
            width="12"
            height="7.5"
            rx="1"
            fill={accent}
            stroke="#FFFFFF"
            strokeWidth="1"
          />
        </>
      )}
      {type === 'MAIN_PLUS_SECONDARY' && (
        <>
          <rect x="3" y="3" width="25" height="18" rx="1" fill={accent} opacity="0.5" />
          <rect x="29.5" y="3" width="7.5" height="5" rx="0.8" fill={stroke} opacity="0.4" />
          <rect x="29.5" y="9.5" width="7.5" height="5" rx="0.8" fill={stroke} opacity="0.4" />
          <rect x="29.5" y="16" width="7.5" height="5" rx="0.8" fill={stroke} opacity="0.4" />
        </>
      )}
      {type === 'DYNAMIC_GRID' && (
        <>
          <rect x="3" y="3" width="10.5" height="8.5" rx="0.8" fill={accent} opacity="0.5" />
          <rect x="14.7" y="3" width="10.5" height="8.5" rx="0.8" fill={stroke} opacity="0.35" />
          <rect x="26.5" y="3" width="10.5" height="8.5" rx="0.8" fill={stroke} opacity="0.35" />
          <rect x="3" y="12.5" width="10.5" height="8.5" rx="0.8" fill={stroke} opacity="0.35" />
          <rect x="14.7" y="12.5" width="10.5" height="8.5" rx="0.8" fill={stroke} opacity="0.35" />
          <rect x="26.5" y="12.5" width="10.5" height="8.5" rx="0.8" fill={stroke} opacity="0.35" />
        </>
      )}
      {type === 'SPORT_BROADCAST' && (
        <>
          <rect x="3" y="3" width="34" height="14" rx="1" fill={accent} opacity="0.4" />
          <rect x="3" y="18" width="34" height="3" rx="0.8" fill="#10B981" opacity="0.8" />
        </>
      )}
    </svg>
  );
}

export function ProgramAndCompositionWorkspace({
  cameras,
  profile,
  obsConnected,
  previewSnapshots,
  programSnapshotError,
  capturingProgramPreview = false,
  programMonitorMode,
  onChangeProgramMonitorMode,
  selectedCameraIds,
  mainCameraId,
  layoutType,
  pipPosition,
  pipSize,
  customSceneName,
  includeScoreboardOverlay,
  applying,
  onChangeSelectedCameraIds,
  onChangeMainCameraId,
  onChangeLayoutType,
  onChangePipPosition,
  onChangePipSize,
  onChangeCustomSceneName,
  onChangeIncludeScoreboardOverlay,
  onRefreshProgramPreview,
  onApplyLive,
  onSavePreset,
  onOpenConnectionTab,
  obsTransforms = [],
  detectedContentMap = {},
  onFrameContentDetected,
  updatingTransformCamId = null,
  onUpdateCameraFraming,
}: ProgramAndCompositionWorkspaceProps) {
  const [savingPreset, setSavingPreset] = useState(false);
  const [stagedPreviewMode, setStagedPreviewMode] = useState<'live_vdo' | 'snapshots'>('live_vdo');

  const enabledCameras = useMemo(() => cameras.filter((c) => c.enabled), [cameras]);
  const cameraLookup = useMemo(() => new Map(cameras.map((c) => [c.cameraId, c])), [cameras]);
  const obsTransformLookup = useMemo(() => {
    const map = new Map<string, ObsSceneTransformItem>();
    for (const t of obsTransforms) {
      if (t.sourceName) map.set(t.sourceName, t);
    }
    return map;
  }, [obsTransforms]);

  // Determine actual live cameras currently on OBS Program, with staged/enabled fallback for web preview when OBS is offline
  const programCameras = useMemo(() => {
    if (!obsConnected) return [];
    const activeIds = new Set<string>(profile.activeCameraIds || []);
    if (profile.activeCameraId) activeIds.add(profile.activeCameraId);
    return enabledCameras.filter(
      (c) =>
        activeIds.has(c.cameraId) ||
        (c.obsSceneName && profile.activeObsScene && c.obsSceneName === profile.activeObsScene)
    );
  }, [obsConnected, profile.activeCameraIds, profile.activeCameraId, profile.activeObsScene, enabledCameras]);

  const effectiveProgramCameras = useMemo(() => {
    if (programCameras.length > 0) return programCameras;
    const staged = selectedCameraIds
      .map((id) => cameraLookup.get(id))
      .filter((c): c is BroadcastCameraData => Boolean(c));
    if (staged.length > 0) return staged;
    return enabledCameras.filter((c) => Boolean(resolveCameraLiveWebUrl(c))).slice(0, 1);
  }, [programCameras, selectedCameraIds, cameraLookup, enabledCameras]);

  const canUseLiveVideoMonitor = useMemo(
    () => effectiveProgramCameras.some((c) => Boolean(resolveCameraLiveWebUrl(c))),
    [effectiveProgramCameras]
  );

  const effectiveProgramMode: ProgramMonitorMode =
    canUseLiveVideoMonitor && programMonitorMode === 'live_video' ? 'live_video' : 'obs_frame';

  const programBoxes = useMemo(() => {
    if (effectiveProgramMode !== 'live_video' || effectiveProgramCameras.length === 0) return [];
    const programIds = effectiveProgramCameras.map((c) => c.cameraId);
    const activePrimary =
      profile.activeCameraId && programIds.includes(profile.activeCameraId)
        ? profile.activeCameraId
        : mainCameraId && programIds.includes(mainCameraId)
          ? mainCameraId
          : programIds[0];
    const activeLayout = obsConnected ? profile.activeLayoutType || 'SINGLE' : layoutType || 'SINGLE';
    return computeObsLayoutBoxes(activeLayout, programIds, activePrimary, 1920, 1080, {
      pipPosition: obsConnected ? profile.activePipPosition : pipPosition,
      pipSize: obsConnected ? profile.activePipSize : pipSize,
    });
  }, [
    effectiveProgramMode,
    effectiveProgramCameras,
    obsConnected,
    profile.activeLayoutType,
    profile.activeCameraId,
    profile.activePipPosition,
    profile.activePipSize,
    mainCameraId,
    layoutType,
    pipPosition,
    pipSize,
  ]);

  const programSnapshot = previewSnapshots['__active_scene__'];

  const framingTargetCam = useMemo(() => {
    if (programCameras.length > 0) {
      return (
        programCameras.find((c) => c.cameraId === profile.activeCameraId) || programCameras[0]
      );
    }
    if (mainCameraId && cameraLookup.has(mainCameraId)) {
      return cameraLookup.get(mainCameraId) || null;
    }
    if (selectedCameraIds[0] && cameraLookup.has(selectedCameraIds[0])) {
      return cameraLookup.get(selectedCameraIds[0]) || null;
    }
    return enabledCameras[0] || null;
  }, [programCameras, profile.activeCameraId, mainCameraId, selectedCameraIds, cameraLookup, enabledCameras]);

  const framingObsTransform = useMemo(() => {
    if (!framingTargetCam) return null;
    return (
      obsTransformLookup.get(framingTargetCam.obsInputName || '') ||
      obsTransformLookup.get(framingTargetCam.obsSceneName || '') ||
      obsTransformLookup.get(framingTargetCam.name || '') ||
      null
    );
  }, [framingTargetCam, obsTransformLookup]);

  const framingOrientationSummary = useMemo(() => {
    if (!framingTargetCam) {
      return resolveCameraOrientationSummary({
        frameContent: detectedContentMap['__active_scene__'] || null,
      });
    }
    return resolveCameraOrientationSummary({
      telemetry: framingTargetCam.telemetry,
      obsTransform: framingObsTransform,
      frameContent:
        detectedContentMap['__active_scene__'] ||
        detectedContentMap[framingTargetCam.cameraId] ||
        null,
    });
  }, [framingTargetCam, framingObsTransform, detectedContentMap]);

  const boxes = useMemo(
    () =>
      computeObsLayoutBoxes(layoutType, selectedCameraIds, mainCameraId, 1920, 1080, {
        pipPosition,
        pipSize,
      }),
    [layoutType, selectedCameraIds, mainCameraId, pipPosition, pipSize]
  );

  const meta = LAYOUT_METADATA[layoutType] || LAYOUT_METADATA.SINGLE;
  const resolvedSceneName =
    customSceneName.trim() ||
    (layoutType === 'DYNAMIC_GRID' ? `MULTI CAM ${Math.max(1, boxes.length)}X` : meta.defaultSceneName);

  // Check if staged composition differs from active live OBS state
  const hasUnappliedChanges = useMemo(() => {
    if (!obsConnected) return selectedCameraIds.length > 0;
    if (profile.activeLayoutType !== layoutType) return true;
    const rawLiveIds = profile.activeCameraIds?.length
      ? profile.activeCameraIds
      : profile.activeCameraId
        ? [profile.activeCameraId]
        : programCameras.map((c) => c.cameraId);
    const liveIds = new Set(rawLiveIds);
    if (liveIds.size !== selectedCameraIds.length) return true;
    for (const id of selectedCameraIds) {
      if (!liveIds.has(id)) return true;
    }
    if (
      layoutType === 'PIP' &&
      (profile.activePipPosition !== pipPosition || profile.activePipSize !== pipSize)
    ) {
      return true;
    }
    return false;
  }, [
    obsConnected,
    profile.activeLayoutType,
    profile.activeCameraIds,
    profile.activeCameraId,
    profile.activePipPosition,
    profile.activePipSize,
    programCameras,
    layoutType,
    selectedCameraIds,
    pipPosition,
    pipSize,
  ]);

  const secondaryPipCamId = useMemo(() => {
    if (selectedCameraIds.length < 2) return '';
    return selectedCameraIds.find((id) => id !== mainCameraId) || selectedCameraIds[1] || '';
  }, [selectedCameraIds, mainCameraId]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
      {/* =================================================================== */}
      {/* B. MAIN PROGRAM OUTPUT (ACTUAL LIVE OBS OUTPUT — NEVER FAKED)       */}
      {/* =================================================================== */}
      <section className="xl:col-span-6 rounded-xl border-2 border-slate-800 bg-slate-950 text-slate-100 p-4 space-y-3.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-[11px] font-bold uppercase tracking-wider shrink-0 ${
                obsConnected && profile.obsStreamActive
                  ? 'bg-red-600 text-white'
                  : obsConnected
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-300'
              }`}
            >
              <Radio className="w-3 h-3" />
              <span>
                {obsConnected
                  ? profile.obsStreamActive
                    ? 'LIVE ON AIR'
                    : 'OBS PROGRAM READY'
                  : 'OBS OFFLINE'}
              </span>
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white truncate">
                PROGRAM OUTPUT
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Actual live scene currently active in OBS Studio
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <div
              className="inline-flex items-center p-0.5 bg-slate-900 rounded-lg border border-slate-800"
              role="group"
              aria-label="Program preview feed mode"
            >
              <button
                type="button"
                onClick={() => onChangeProgramMonitorMode('live_video')}
                className={`min-h-[28px] px-2 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                  effectiveProgramMode === 'live_video'
                    ? 'bg-[#EA580C] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Live Web Preview
              </button>
              <button
                type="button"
                onClick={() => onChangeProgramMonitorMode('obs_frame')}
                className={`min-h-[28px] px-2 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                  effectiveProgramMode === 'obs_frame'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                OBS Frame
              </button>
            </div>

            <button
              type="button"
              disabled={!obsConnected || capturingProgramPreview}
              onClick={() => onRefreshProgramPreview()}
              className="min-h-[32px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${capturingProgramPreview ? 'animate-spin text-[#EA580C]' : ''}`} />
              <span>{capturingProgramPreview ? 'Capturing...' : 'Refresh Program'}</span>
            </button>
          </div>
        </div>

        {/* Genuine 16:9 Program Preview Stage */}
        <div className="relative aspect-video w-full rounded-lg border border-slate-800 bg-black overflow-hidden">
          {effectiveProgramMode === 'live_video' && programBoxes.length > 0 ? (
            <div className="relative w-full h-full bg-black">
              {!obsConnected && (
                <div className="pointer-events-none absolute top-2 right-2 z-20 px-2 py-0.5 rounded bg-slate-950/85 border border-amber-500/40 font-mono text-[10px] font-bold text-amber-300">
                  LIVE WEB PREVIEW · OBS OFFLINE
                </div>
              )}
              {programBoxes.map((box) => {
                const cam = cameraLookup.get(box.cameraId);
                const vdoUrl = resolveCameraLiveWebUrl(cam) || buildVdoProgramMonitorUrl(cam?.obsBrowserSourceUrl);
                if (!cam) return null;
                const boxTransform =
                  obsTransformLookup.get(cam.obsInputName || '') ||
                  obsTransformLookup.get(cam.obsSceneName || '') ||
                  obsTransformLookup.get(cam.name || '') ||
                  null;
                const boxFrameInfo =
                  detectedContentMap[cam.cameraId] ||
                  (programBoxes.length === 1 ? detectedContentMap['__active_scene__'] : undefined) ||
                  null;
                const boxOri = resolveCameraOrientationSummary({
                  telemetry: cam.telemetry,
                  obsTransform: boxTransform,
                  frameContent: boxFrameInfo,
                });
                const boxFit = normalizePreviewFit(cam.previewFit);
                const boxRot = parseOrientationDegrees(cam.orientationMode);
                const boxMediaStyles = getPreviewMediaStyles({
                  rotationDeg: boxRot,
                  previewFit: boxFit,
                  isPortraitContent: boxOri.isPortraitFeed,
                  contentAspectRatio: boxFrameInfo?.aspectRatio,
                });
                const boxBackdropSnap = previewSnapshots[cam.cameraId] || (programBoxes.length === 1 ? programSnapshot : undefined);
                const showBoxBlur =
                  cam.portraitBackdropFill !== false &&
                  boxFit === 'contain' &&
                  boxOri.isPortraitFeed;

                return (
                  <div
                    key={`prog-live-${box.cameraId}-${box.slotIndex}`}
                    style={{
                      left: `${(box.x / 1920) * 100}%`,
                      top: `${(box.y / 1080) * 100}%`,
                      width: `${(box.width / 1920) * 100}%`,
                      height: `${(box.height / 1080) * 100}%`,
                      zIndex: box.slotIndex + 1,
                    }}
                    className="absolute overflow-hidden bg-black"
                  >
                    {showBoxBlur && (
                      boxBackdropSnap ? (
                        <img
                          src={boxBackdropSnap.imageData}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-45 pointer-events-none"
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-800/40 to-slate-900 pointer-events-none"
                        />
                      )
                    )}
                    {vdoUrl ? (
                      <iframe
                        key={`prog-iframe-${cam.cameraId}:${vdoUrl}`}
                        title={`Live program feed ${cam.label || cam.name}`}
                        src={vdoUrl}
                        allow="autoplay; fullscreen; encrypted-media"
                        style={
                          boxMediaStyles.transform !== 'none'
                            ? {
                                transform: boxMediaStyles.transform,
                                transformOrigin: 'center center',
                              }
                            : undefined
                        }
                        className="relative z-[1] w-full h-full border-0 pointer-events-none bg-transparent transition-transform duration-150"
                      />
                    ) : boxBackdropSnap ? (
                      <img
                        src={boxBackdropSnap.imageData}
                        alt={cam.label || cam.name}
                        className={`relative z-[1] w-full h-full ${boxMediaStyles.objectClass} bg-black`}
                      />
                    ) : (
                      <div className="relative z-[1] w-full h-full flex items-center justify-center text-xs text-slate-400">
                        Waiting for camera feed...
                      </div>
                    )}
                    {programBoxes.length > 1 && (
                      <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded bg-black/75 border border-white/15 font-mono text-[10px] font-bold text-white">
                        CAM {cam.cameraNumber} · {cam.label || cam.name}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : !obsConnected ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-2.5">
              <Monitor className="w-8 h-8 text-slate-600" />
              <p className="text-sm font-bold text-slate-200">OBS Studio Disconnected</p>
              <p className="text-xs text-slate-400 max-w-sm">
                Connect OBS Studio via Windows Bridge or Direct WebSocket to view OBS snapshots, or switch cameras with a Live Web Preview URL.
              </p>
              <button
                type="button"
                onClick={onOpenConnectionTab}
                className="min-h-[34px] px-3.5 py-1.5 rounded-lg bg-[#EA580C] text-white text-xs font-semibold hover:bg-orange-600"
              >
                Connect OBS Studio
              </button>
            </div>
          ) : programSnapshot ? (
            <div className="relative w-full h-full bg-black">
              {framingTargetCam?.portraitBackdropFill !== false &&
                normalizePreviewFit(framingTargetCam?.previewFit) === 'contain' &&
                framingOrientationSummary.isPortraitFeed && (
                  <img
                    src={programSnapshot.imageData}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-45 pointer-events-none"
                  />
                )}
              <img
                src={programSnapshot.imageData}
                alt={`OBS Program Output: ${profile.activeObsScene || 'Active Scene'}`}
                onLoad={(e) => {
                  if (!onFrameContentDetected) return;
                  const detected = detectFrameActiveContentOrientation(e.currentTarget);
                  if (detected) {
                    onFrameContentDetected('__active_scene__', detected);
                  }
                }}
                className={`relative z-[1] w-full h-full ${
                  getPreviewMediaStyles({
                    rotationDeg: parseOrientationDegrees(framingTargetCam?.orientationMode),
                    previewFit: normalizePreviewFit(framingTargetCam?.previewFit),
                    isPortraitContent: framingOrientationSummary.isPortraitFeed,
                    skipRotation: true,
                  }).objectClass
                } bg-transparent`}
              />
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
              {programSnapshotError ? (
                <AlertTriangle className="w-7 h-7 text-amber-400" />
              ) : (
                <Loader2 className="w-7 h-7 text-[#EA580C] animate-spin" />
              )}
              <p className="text-xs font-bold text-slate-200">
                {programSnapshotError
                  ? 'Program snapshot unavailable'
                  : `Reading live program frame for "${profile.activeObsScene || 'Program'}"...`}
              </p>
              {programSnapshotError && (
                <p className="text-[11px] text-amber-300 max-w-sm">{programSnapshotError}</p>
              )}
              <button
                type="button"
                disabled={capturingProgramPreview}
                onClick={() => onRefreshProgramPreview()}
                className="min-h-[32px] px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-white hover:bg-slate-700"
              >
                Retry Program Capture
              </button>
            </div>
          )}

          {/* Top Scrim Metadata */}
          <div
            style={{ zIndex: 30 }}
            className="pointer-events-none absolute inset-x-0 top-0 p-2.5 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-center justify-between gap-2 text-[11px] font-mono"
          >
            <span className="px-2 py-0.5 rounded bg-black/75 border border-white/10 text-white font-bold truncate">
              SCENE: {obsConnected ? profile.activeObsScene || 'Idle' : 'Offline'}
            </span>
            <div className="flex items-center gap-2 shrink-0 text-slate-200 tabular-nums">
              {obsConnected && framingOrientationSummary.orientation !== 'UNKNOWN' && (
                <span
                  className={`px-2 py-0.5 rounded font-bold ${
                    framingOrientationSummary.isPortraitFeed
                      ? 'bg-amber-500/85 text-slate-950'
                      : 'bg-slate-900/90 border border-white/15 text-emerald-300'
                  }`}
                >
                  {framingOrientationSummary.orientation}
                  {framingOrientationSummary.dimensionText
                    ? ` · ${framingOrientationSummary.dimensionText}`
                    : ''}
                </span>
              )}
              {obsConnected && effectiveProgramMode === 'live_video' && (
                <span className="px-2 py-0.5 rounded bg-emerald-600/90 text-white font-bold">
                  LIVE WEBRTC
                </span>
              )}
              {obsConnected && effectiveProgramMode === 'obs_frame' && (
                <span className="px-2 py-0.5 rounded bg-slate-900/90 border border-white/15 text-orange-300 font-bold">
                  OBS LIVE (AUTO 1s)
                </span>
              )}
              {profile.obsStreamTimecode && profile.obsStreamActive && (
                <span className="px-2 py-0.5 rounded bg-red-600/90 text-white font-bold">
                  {profile.obsStreamTimecode}
                </span>
              )}
              {effectiveProgramMode === 'obs_frame' && programSnapshot && (
                <span className="px-2 py-0.5 rounded bg-black/70 text-slate-200">
                  {programSnapshot.capturedAt}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Genuine Program Metadata Strip */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-3 space-y-2.5 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Active Program Scene
              </p>
              <p className="font-mono font-bold text-white truncate mt-0.5">
                {obsConnected ? profile.activeObsScene || 'Connected' : 'Unavailable'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Active Program Layout
              </p>
              <p className="font-mono font-bold text-orange-300 truncate mt-0.5">
                {LAYOUT_METADATA[profile.activeLayoutType]?.shortLabel || profile.activeLayoutType}
                {profile.activeLayoutType === 'PIP' && profile.activePipPosition
                  ? ` (${profile.activePipPosition})`
                  : ''}
              </p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                OBS Stream Health
              </p>
              <p className="font-mono tabular-nums font-semibold text-slate-200 mt-0.5 truncate">
                {obsConnected && profile.obsStats
                  ? `${Math.round(profile.obsStats.activeFps)} FPS · ${profile.obsStats.outputSkippedFrames} dropped`
                  : obsConnected
                    ? 'Connected'
                    : 'Disconnected'}
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
              Live Cameras in Program:
            </span>
            {programCameras.length === 0 ? (
              <span className="text-[11px] text-slate-400">
                {obsConnected
                  ? 'Custom OBS scene active (no mapped camera slot attached)'
                  : 'Connect OBS to inspect active program feeds'}
              </span>
            ) : (
              programCameras.map((cam) => (
                <span
                  key={cam.cameraId}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/15 border border-red-500/35 text-[11px] font-mono font-bold text-red-200"
                >
                  <span>CAM {cam.cameraNumber}</span>
                  <span className="text-white font-sans font-semibold">{cam.label || cam.name}</span>
                </span>
              ))
            )}
          </div>

          {framingTargetCam && onUpdateCameraFraming && (
            <div className="pt-2.5 border-t border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Camera Framing &amp; Orientation ·{' '}
                  <span className="text-white">
                    CAM {framingTargetCam.cameraNumber} ({framingTargetCam.label || framingTargetCam.name})
                  </span>
                </span>
                {framingOrientationSummary.sourceLabel && (
                  <span className="font-mono text-[10px] text-slate-400">
                    {framingOrientationSummary.sourceLabel}: {framingOrientationSummary.dimensionText || framingOrientationSummary.orientation}
                  </span>
                )}
              </div>

              {framingOrientationSummary.isPortraitFeed &&
                parseOrientationDegrees(framingTargetCam.orientationMode) === 0 && (
                  <div className="px-2.5 py-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200">
                    Portrait phone feed detected inside 16:9 canvas. Rotate phone sideways to landscape, or apply 90°/270° rotation, Cover fit, or Backdrop Blur below.
                  </div>
                )}

              <div className="flex flex-wrap items-center gap-2">
                {/* Preview & OBS Fit Mode */}
                <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="px-1.5 text-[10px] font-bold uppercase text-slate-500">Fit</span>
                  {(['contain', 'cover', 'fill'] as const).map((fitOpt) => {
                    const active = normalizePreviewFit(framingTargetCam.previewFit) === fitOpt;
                    return (
                      <button
                        key={fitOpt}
                        type="button"
                        disabled={updatingTransformCamId === framingTargetCam.cameraId}
                        onClick={() => onUpdateCameraFraming(framingTargetCam, { previewFit: fitOpt })}
                        className={`min-h-[26px] px-2 py-0.5 rounded text-[10px] font-semibold uppercase transition-colors ${
                          active
                            ? 'bg-[#EA580C] text-white'
                            : 'text-slate-300 hover:bg-slate-800'
                        } disabled:opacity-50`}
                      >
                        {fitOpt}
                      </button>
                    );
                  })}
                </div>

                {/* Orientation / Rotation Correction */}
                <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="px-1.5 text-[10px] font-bold uppercase text-slate-500">Rot</span>
                  {(['auto', '0', '90', '180', '270'] as const).map((rotOpt) => {
                    const active = normalizeOrientationMode(framingTargetCam.orientationMode) === rotOpt;
                    return (
                      <button
                        key={rotOpt}
                        type="button"
                        disabled={updatingTransformCamId === framingTargetCam.cameraId}
                        onClick={() =>
                          onUpdateCameraFraming(framingTargetCam, { orientationMode: rotOpt })
                        }
                        className={`min-h-[26px] px-2 py-0.5 rounded font-mono text-[10px] font-semibold transition-colors ${
                          active
                            ? 'bg-amber-500 text-slate-950'
                            : 'text-slate-300 hover:bg-slate-800'
                        } disabled:opacity-50`}
                      >
                        {rotOpt === 'auto' ? 'Auto' : `${rotOpt}°`}
                      </button>
                    );
                  })}
                </div>

                {/* Portrait Backdrop Blur Toggle */}
                <button
                  type="button"
                  disabled={updatingTransformCamId === framingTargetCam.cameraId}
                  onClick={() =>
                    onUpdateCameraFraming(framingTargetCam, {
                      portraitBackdropFill: framingTargetCam.portraitBackdropFill === false,
                    })
                  }
                  className={`min-h-[28px] px-2.5 py-0.5 rounded-lg border text-[10px] font-semibold transition-colors ${
                    framingTargetCam.portraitBackdropFill !== false
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  } disabled:opacity-50`}
                >
                  Blur Backdrop: {framingTargetCam.portraitBackdropFill !== false ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* =================================================================== */}
      {/* C. CAMERA COMPOSITION (STAGED PREVIEW) + LAYOUT & PIP CONTROLS      */}
      {/* =================================================================== */}
      <section className="xl:col-span-6 rounded-xl border border-amber-500/40 bg-slate-900/95 text-slate-100 p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-[11px] font-bold uppercase tracking-wider bg-amber-500/20 border border-amber-500/40 text-amber-200 shrink-0">
              <Grid2x2 className="w-3 h-3" />
              <span>PREVIEW / STAGED</span>
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white truncate">
                CAMERA COMPOSITION
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Stage 1 or multiple cameras, pick layout/PIP, then Apply Live
              </p>
            </div>
          </div>

          <span
            className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase whitespace-nowrap ${
              hasUnappliedChanges
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35'
                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
            }`}
          >
            {hasUnappliedChanges ? 'Unapplied Changes' : 'Synced With Live'}
          </span>
        </div>

        {/* Staged Camera Chips Tray */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/90 p-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="font-bold uppercase tracking-wider text-slate-300 font-mono tabular-nums">
              Selected Cameras ({selectedCameraIds.length} / {enabledCameras.length})
            </span>
            <div className="flex items-center gap-2">
              {enabledCameras.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const allIds = enabledCameras.map((c) => c.cameraId);
                    onChangeSelectedCameraIds(allIds);
                    if (!mainCameraId && allIds[0]) onChangeMainCameraId(allIds[0]);
                  }}
                  className="text-[11px] font-semibold text-orange-400 hover:text-orange-300"
                >
                  Select All
                </button>
              )}
              {selectedCameraIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChangeSelectedCameraIds([])}
                  className="text-[11px] font-semibold text-slate-400 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {selectedCameraIds.length === 0 ? (
            <p className="text-xs text-slate-400 py-1">
              Click any camera tile below to select it here without cutting live viewers.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {selectedCameraIds.map((camId, idx) => {
                const cam = cameraLookup.get(camId);
                if (!cam) return null;
                const isMain = mainCameraId === camId || (idx === 0 && !mainCameraId);
                return (
                  <div
                    key={camId}
                    className={`inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md border text-[11px] ${
                      isMain
                        ? 'border-[#EA580C] bg-[#EA580C]/20 text-white'
                        : 'border-slate-700 bg-slate-900 text-slate-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onChangeMainCameraId(camId)}
                      title="Set as Main Camera"
                      className="inline-flex items-center gap-1 font-semibold hover:text-orange-300"
                    >
                      <span className="font-mono text-[10px] text-orange-300">
                        {isMain ? 'MAIN' : `#${cam.cameraNumber}`}
                      </span>
                      <span className="max-w-[110px] truncate">{cam.label || cam.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = selectedCameraIds.filter((id) => id !== camId);
                        onChangeSelectedCameraIds(next);
                        if (mainCameraId === camId) onChangeMainCameraId(next[0] || '');
                      }}
                      aria-label={`Remove ${cam.label || cam.name} from selection`}
                      className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Visual Layout Picker with Mini Schematics */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold uppercase tracking-wider text-slate-400">
              Select Layout Mode
            </span>
            <span className="font-mono text-slate-400">{meta.recommendedCameras}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {LAYOUT_TYPES.map((type) => {
              const item = LAYOUT_METADATA[type];
              const active = layoutType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onChangeLayoutType(type)}
                  className={`p-2 rounded-lg border text-left transition-colors flex items-center gap-2 ${
                    active
                      ? 'border-[#EA580C] bg-[#EA580C]/20 text-white'
                      : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <LayoutSchematicIcon type={type} active={active} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold leading-tight truncate">{item.shortLabel}</p>
                    <p className="text-[9px] text-slate-400 truncate mt-0.5">
                      {item.recommendedCameras}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dedicated PIP Controls when PIP Layout Selected */}
        {layoutType === 'PIP' && (
          <div className="rounded-lg border border-[#EA580C]/45 bg-slate-950 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-orange-300">
                Picture-in-Picture (PIP) Settings
              </span>
              {selectedCameraIds.length >= 2 && (
                <button
                  type="button"
                  onClick={() => {
                    if (secondaryPipCamId) {
                      onChangeMainCameraId(secondaryPipCamId);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-semibold text-slate-200 hover:border-[#EA580C]"
                >
                  <ArrowLeftRight className="w-3 h-3 text-[#EA580C]" />
                  <span>Swap Main / Inset</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  Main Background Camera
                </label>
                <select
                  value={mainCameraId}
                  onChange={(e) => {
                    const nextMain = e.target.value;
                    onChangeMainCameraId(nextMain);
                    if (nextMain && !selectedCameraIds.includes(nextMain)) {
                      onChangeSelectedCameraIds([nextMain, ...selectedCameraIds]);
                    }
                  }}
                  className="w-full min-h-[34px] px-2.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white"
                >
                  {enabledCameras.map((c) => (
                    <option key={c.cameraId} value={c.cameraId}>
                      CAM {c.cameraNumber} · {c.label || c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  Secondary Inset Camera
                </label>
                <select
                  value={secondaryPipCamId}
                  onChange={(e) => {
                    const nextInset = e.target.value;
                    if (!nextInset) return;
                    const primary = mainCameraId || enabledCameras[0]?.cameraId || '';
                    onChangeSelectedCameraIds(
                      primary && primary !== nextInset ? [primary, nextInset] : [nextInset]
                    );
                  }}
                  className="w-full min-h-[34px] px-2.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white"
                >
                  <option value="">Select inset camera...</option>
                  {enabledCameras
                    .filter((c) => c.cameraId !== mainCameraId)
                    .map((c) => (
                      <option key={c.cameraId} value={c.cameraId}>
                        CAM {c.cameraNumber} · {c.label || c.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  Inset Corner Position
                </label>
                <div className="grid grid-cols-2 gap-1">
                  {(
                    [
                      { id: 'top-left', label: 'Top-Left' },
                      { id: 'top-right', label: 'Top-Right' },
                      { id: 'bottom-left', label: 'Bottom-Left' },
                      { id: 'bottom-right', label: 'Bottom-Right' },
                    ] as const
                  ).map((pos) => (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => onChangePipPosition(pos.id)}
                      className={`min-h-[28px] px-2 py-1 rounded text-[10px] font-semibold border ${
                        pipPosition === pos.id
                          ? 'bg-[#EA580C] text-white border-[#EA580C]'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  Inset Box Size
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: 'small', label: 'Small' },
                      { id: 'medium', label: 'Medium' },
                      { id: 'large', label: 'Large' },
                    ] as const
                  ).map((sz) => (
                    <button
                      key={sz.id}
                      type="button"
                      onClick={() => onChangePipSize(sz.id)}
                      className={`min-h-[28px] px-2 py-1 rounded text-[10px] font-semibold border ${
                        pipSize === sz.id
                          ? 'bg-[#EA580C] text-white border-[#EA580C]'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {sz.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Proportional 16:9 Preview Blueprint of What Viewers Will See */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <span className="font-semibold uppercase tracking-wider">
              Staged 16:9 Viewer Preview ({boxes.length} slot{boxes.length === 1 ? '' : 's'})
            </span>
            <div className="flex items-center gap-2">
              <div
                className="inline-flex items-center p-0.5 bg-slate-900 rounded-lg border border-slate-800"
                role="group"
                aria-label="Staged composition preview feed mode"
              >
                <button
                  type="button"
                  onClick={() => setStagedPreviewMode('live_vdo')}
                  className={`min-h-[26px] px-2 py-0.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                    stagedPreviewMode === 'live_vdo'
                      ? 'bg-[#EA580C] text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Live Web Preview
                </button>
                <button
                  type="button"
                  onClick={() => setStagedPreviewMode('snapshots')}
                  className={`min-h-[26px] px-2 py-0.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                    stagedPreviewMode === 'snapshots'
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  OBS Snapshots
                </button>
              </div>
              <span className="font-mono text-slate-300 truncate max-w-[160px]">
                {resolvedSceneName}
              </span>
            </div>
          </div>

          <div className="relative w-full aspect-video rounded-lg border border-slate-700 bg-slate-950 overflow-hidden">
            {boxes.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-xs text-slate-400">
                <p className="font-semibold text-slate-200">No cameras selected yet</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Click one or more camera tiles below to compose your next shot.
                </p>
              </div>
            ) : (
              boxes.map((box) => {
                const cam = cameraLookup.get(box.cameraId);
                const snap = previewSnapshots[box.cameraId];
                const liveWebUrl = resolveCameraLiveWebUrl(cam);
                const showLiveWeb = stagedPreviewMode === 'live_vdo' && Boolean(liveWebUrl);
                const boxFit = normalizePreviewFit(cam?.previewFit);
                const boxRot = parseOrientationDegrees(cam?.orientationMode);
                const boxFrameInfo = detectedContentMap[box.cameraId] || null;
                const boxOri = resolveCameraOrientationSummary({
                  telemetry: cam?.telemetry,
                  frameContent: boxFrameInfo,
                });
                const boxMediaStyles = getPreviewMediaStyles({
                  rotationDeg: boxRot,
                  previewFit: boxFit,
                  isPortraitContent: boxOri.isPortraitFeed,
                  contentAspectRatio: boxFrameInfo?.aspectRatio,
                  skipRotation: !showLiveWeb,
                });
                const showBoxBlur =
                  cam?.portraitBackdropFill !== false &&
                  boxFit === 'contain' &&
                  boxOri.isPortraitFeed;
                const leftPct = (box.x / 1920) * 100;
                const topPct = (box.y / 1080) * 100;
                const widthPct = (box.width / 1920) * 100;
                const heightPct = (box.height / 1080) * 100;
                const isMain = box.role === 'main';

                return (
                  <div
                    key={`${box.cameraId}-${box.slotIndex}`}
                    style={{
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      width: `${widthPct}%`,
                      height: `${heightPct}%`,
                      zIndex: box.slotIndex + 1,
                    }}
                    className="absolute p-0.5 transition-all duration-150"
                  >
                    <div
                      className={`relative w-full h-full rounded overflow-hidden border flex flex-col justify-between p-1.5 ${
                        isMain
                          ? 'border-[#EA580C] bg-black'
                          : 'border-amber-400/70 bg-black shadow-lg'
                      }`}
                    >
                      {showBoxBlur && snap && (
                        <img
                          src={snap.imageData}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-45 pointer-events-none"
                        />
                      )}
                      {showLiveWeb ? (
                        <iframe
                          key={`staged-live-${box.cameraId}:${liveWebUrl}`}
                          title={`Staged live preview ${cam?.label || cam?.name || box.cameraId}`}
                          src={liveWebUrl}
                          allow="autoplay; fullscreen; encrypted-media"
                          style={
                            boxMediaStyles.transform !== 'none'
                              ? {
                                  transform: boxMediaStyles.transform,
                                  transformOrigin: 'center center',
                                }
                              : undefined
                          }
                          className="absolute inset-0 z-[1] w-full h-full border-0 pointer-events-none bg-transparent transition-transform duration-150"
                        />
                      ) : snap ? (
                        <img
                          src={snap.imageData}
                          alt={cam?.label || cam?.name || box.cameraId}
                          className={`absolute inset-0 z-[1] w-full h-full ${boxMediaStyles.objectClass} ${
                            showBoxBlur ? 'bg-transparent' : 'bg-black'
                          }`}
                        />
                      ) : null}
                      <div className="relative z-10 flex items-center justify-between gap-1 pointer-events-none">
                        <span
                          className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            isMain ? 'bg-[#EA580C] text-white' : 'bg-slate-950/90 text-amber-200'
                          }`}
                        >
                          {layoutType === 'PIP' ? (isMain ? 'MAIN' : 'INSET') : `CAM ${cam?.cameraNumber || box.slotIndex + 1}`}
                        </span>
                        <span className="font-mono text-[9px] px-1 rounded bg-black/75 text-slate-200">
                          {box.width}×{box.height}
                        </span>
                      </div>
                      <p className="relative z-10 text-[10px] font-bold text-white truncate bg-black/75 px-1.5 py-0.5 rounded pointer-events-none">
                        {cam?.label || cam?.name || box.cameraId}
                      </p>
                    </div>
                  </div>
                );
              })
            )}

            {includeScoreboardOverlay && boxes.length > 0 && (
              <div
                style={{ zIndex: 20 }}
                className="absolute bottom-2 left-2.5 right-2.5 h-6 rounded border border-emerald-500/50 bg-emerald-950/80 px-2 flex items-center justify-between pointer-events-none"
              >
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-300 truncate">
                  <Tv className="w-3 h-3 shrink-0" />
                  Scoreboard Overlay Layer (Top z-index)
                </span>
                <span className="font-mono text-[8px] text-emerald-200 shrink-0">1920×1080</span>
              </div>
            )}
          </div>
        </div>

        {/* Target OBS Scene & Apply CTA */}
        <div className="space-y-2.5 pt-2 border-t border-slate-800">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
            <div>
              <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                Target OBS Scene (Reuses existing if matched)
              </label>
              <input
                type="text"
                value={customSceneName}
                onChange={(e) => onChangeCustomSceneName(e.target.value)}
                placeholder={resolvedSceneName}
                className="w-full min-h-[34px] px-2.5 text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg text-white"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer pt-4">
              <input
                type="checkbox"
                checked={includeScoreboardOverlay}
                onChange={(e) => onChangeIncludeScoreboardOverlay(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 text-[#EA580C]"
              />
              <span>Keep Scoreboard Overlay on Top</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!obsConnected || selectedCameraIds.length === 0 || applying}
              onClick={() => onApplyLive()}
              className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-40 whitespace-nowrap"
            >
              {applying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : hasUnappliedChanges ? (
                <Play className="w-4 h-4" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>
                {applying
                  ? 'Confirming Switch in OBS...'
                  : 'APPLY TO LIVE BROADCAST'}
              </span>
            </button>

            <button
              type="button"
              disabled={selectedCameraIds.length === 0 || savingPreset}
              onClick={async () => {
                try {
                  setSavingPreset(true);
                  await onSavePreset({
                    name: `${meta.shortLabel} (${selectedCameraIds.length} Cams)`,
                    obsSceneName: resolvedSceneName,
                    layoutType,
                    cameraIds: selectedCameraIds,
                    mainCameraId: mainCameraId || selectedCameraIds[0],
                    pipPosition: layoutType === 'PIP' ? pipPosition : undefined,
                    pipSize: layoutType === 'PIP' ? pipSize : undefined,
                    includeScoreboardOverlay,
                  });
                } finally {
                  setSavingPreset(false);
                }
              }}
              className="min-h-[42px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-950 border border-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{savingPreset ? 'Saving...' : 'Save Preset'}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
