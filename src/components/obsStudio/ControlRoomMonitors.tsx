import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Eye,
  Monitor,
  Radio,
  RefreshCw,
} from 'lucide-react';
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../../types/index.ts';
import type {
  BroadcastCameraData,
  ObsControllerProfileData,
  ObsSceneTransformItem,
  ObsStudioMatchSummary,
} from '../../types/obs.ts';
import {
  computeObsLayoutBoxes,
  LAYOUT_METADATA,
  type ObsLayoutType,
  type PipPosition,
  type PipSize,
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
import { HotstarBroadcastOverlay } from '../obs/HotstarBroadcastOverlay.tsx';
import { BroadcastBrandLogoBug } from '../obs/ObsBrandMark.tsx';
import { MultiCamSplitBorders } from './MultiCamSplitBorders.tsx';
import type { CameraPreviewSnapshot } from './CameraPreviewGrid.tsx';
import type { ProgramMonitorMode } from './ProgramAndCompositionWorkspace.tsx';

interface ControlRoomMonitorsProps {
  cameras: BroadcastCameraData[];
  profile: ObsControllerProfileData;
  obsConnected: boolean;
  matchStream: LiveStreamData | ObsStudioMatchSummary | null;
  liveScore: LiveScoreData | null;
  overlayConfig: BroadcastOverlayConfig;
  previewSnapshots: Record<string, CameraPreviewSnapshot>;
  programSnapshotError?: string | null;
  capturingProgramPreview?: boolean;
  programMonitorMode: ProgramMonitorMode;
  onChangeProgramMonitorMode: (mode: ProgramMonitorMode) => void;
  onRefreshProgramPreview: () => Promise<void> | void;
  onOpenSettings: () => void;
  // Staged Preview composition (does NOT affect Program until applied)
  stagedCameraIds: string[];
  stagedMainCameraId: string;
  stagedLayoutType: ObsLayoutType;
  stagedPipPosition: PipPosition;
  stagedPipSize: PipSize;
  autoFitEnabled: boolean;
  obsTransforms?: ObsSceneTransformItem[];
  detectedContentMap?: Record<string, DetectedFrameContentInfo>;
  onFrameContentDetected?: (cameraKey: string, info: DetectedFrameContentInfo) => void;
}

function ScaledScoreboardOverlayLayer({
  stream,
  score,
  config,
}: {
  stream: LiveStreamData | ObsStudioMatchSummary | null;
  score: LiveScoreData | null;
  config: BroadcastOverlayConfig;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setWidth(w);
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!stream || stream.showScoreboardOnYoutube === false) return null;
  const scale = width > 0 ? width / 1920 : 0.35;
  const previewConfig: BroadcastOverlayConfig = {
    ...config,
    visible: config.visible && config.mode !== 'hidden',
  };

  if (!previewConfig.visible) return null;

  const normalizedStream: LiveStreamData = {
    youtubeInput: '',
    teamALogo: '',
    teamBLogo: '',
    location: '',
    matchDescription: '',
    replayVideoId: '',
    replayInput: '',
    replayAvailable: false,
    replayPublished: false,
    createdAt: '',
    updatedAt: '',
    ...(stream as Partial<LiveStreamData>),
    id: stream.id,
    teamAName: stream.teamAName,
    teamBName: stream.teamBName,
    gameName: (stream.gameName || '') as LiveStreamData['gameName'],
    matchTitle: stream.matchTitle,
    tournamentName: stream.tournamentName,
    status: stream.status,
    youtubeVideoId: stream.youtubeVideoId,
  };

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden flex items-center justify-center"
    >
      <div
        style={{
          width: 1920,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
        className="shrink-0 relative pointer-events-none"
      >
        <BroadcastBrandLogoBug config={config} variant="canvas" zIndex={24} />
        <HotstarBroadcastOverlay
          stream={normalizedStream}
          score={score}
          config={previewConfig}
          isPortrait={false}
        />
      </div>
    </div>
  );
}

export function ControlRoomMonitors({
  cameras,
  profile,
  obsConnected,
  matchStream,
  liveScore,
  overlayConfig,
  previewSnapshots,
  programSnapshotError,
  capturingProgramPreview = false,
  programMonitorMode,
  onChangeProgramMonitorMode,
  onRefreshProgramPreview,
  onOpenSettings,
  stagedCameraIds,
  stagedMainCameraId,
  stagedLayoutType,
  stagedPipPosition,
  stagedPipSize,
  autoFitEnabled,
  obsTransforms = [],
  detectedContentMap = {},
  onFrameContentDetected,
}: ControlRoomMonitorsProps) {
  const enabledCameras = useMemo(() => cameras.filter((c) => c.enabled), [cameras]);
  const cameraLookup = useMemo(() => new Map(cameras.map((c) => [c.cameraId, c])), [cameras]);

  const obsTransformLookup = useMemo(() => {
    const map = new Map<string, ObsSceneTransformItem>();
    for (const t of obsTransforms) {
      if (t.sourceName) map.set(t.sourceName, t);
    }
    return map;
  }, [obsTransforms]);

  // Program cameras active on OBS right now
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
    return enabledCameras.filter((c) => Boolean(resolveCameraLiveWebUrl(c))).slice(0, 1);
  }, [programCameras, enabledCameras]);

  const canUseLiveVideoProgram = useMemo(
    () => effectiveProgramCameras.some((c) => Boolean(resolveCameraLiveWebUrl(c))),
    [effectiveProgramCameras]
  );

  const effectiveProgramMode: ProgramMonitorMode =
    canUseLiveVideoProgram && programMonitorMode === 'live_video' ? 'live_video' : 'obs_frame';

  const programBoxes = useMemo(() => {
    if (effectiveProgramMode !== 'live_video' || effectiveProgramCameras.length === 0) return [];
    const ids = effectiveProgramCameras.map((c) => c.cameraId);
    const primary =
      profile.activeCameraId && ids.includes(profile.activeCameraId)
        ? profile.activeCameraId
        : ids[0];
    return computeObsLayoutBoxes(
      obsConnected ? profile.activeLayoutType || 'SINGLE' : 'SINGLE',
      ids,
      primary,
      1920,
      1080,
      {
        pipPosition: profile.activePipPosition,
        pipSize: profile.activePipSize,
      }
    );
  }, [
    effectiveProgramMode,
    effectiveProgramCameras,
    profile.activeCameraId,
    profile.activeLayoutType,
    profile.activePipPosition,
    profile.activePipSize,
    obsConnected,
  ]);

  const programSnapshot = previewSnapshots['__active_scene__'];

  // Staged Preview composition boxes (strictly isolated from Program until Apply/Cut/Transition)
  const stagedBoxes = useMemo(() => {
    if (stagedCameraIds.length === 0) return [];
    return computeObsLayoutBoxes(
      stagedLayoutType,
      stagedCameraIds,
      stagedMainCameraId || stagedCameraIds[0],
      1920,
      1080,
      { pipPosition: stagedPipPosition, pipSize: stagedPipSize }
    );
  }, [stagedLayoutType, stagedCameraIds, stagedMainCameraId, stagedPipPosition, stagedPipSize]);

  const activeLayoutLabel =
    LAYOUT_METADATA[profile.activeLayoutType]?.shortLabel || profile.activeLayoutType || 'Single';
  const stagedLayoutLabel =
    LAYOUT_METADATA[stagedLayoutType]?.shortLabel || stagedLayoutType || 'Single';

  const renderFeedSurface = (
    cam: BroadcastCameraData,
    keyPrefix: string,
    isSingleProgramFrame = false
  ) => {
    const vdoUrl = resolveCameraLiveWebUrl(cam);
    const snap = previewSnapshots[cam.cameraId] || (isSingleProgramFrame ? programSnapshot : undefined);
    const frameInfo =
      detectedContentMap[cam.cameraId] ||
      (isSingleProgramFrame ? detectedContentMap['__active_scene__'] : undefined) ||
      null;
    const transform =
      obsTransformLookup.get(cam.obsInputName || '') ||
      obsTransformLookup.get(cam.obsSceneName || '') ||
      obsTransformLookup.get(cam.name || '') ||
      null;
    const ori = resolveCameraOrientationSummary({
      telemetry: cam.telemetry,
      obsTransform: transform,
      frameContent: frameInfo,
    });
    const fitMode = autoFitEnabled ? normalizePreviewFit(cam.previewFit || 'contain') : 'cover';
    const rotDeg = parseOrientationDegrees(cam.orientationMode);
    const styles = getPreviewMediaStyles({
      rotationDeg: rotDeg,
      previewFit: fitMode,
      isPortraitContent: ori.isPortraitFeed,
      contentAspectRatio: frameInfo?.aspectRatio,
      skipRotation: !vdoUrl,
    });

    if (vdoUrl) {
      return (
        <iframe
          key={`${keyPrefix}:${cam.cameraId}:${vdoUrl}`}
          title={`${cam.label || cam.name}`}
          src={vdoUrl}
          allow="autoplay; fullscreen; encrypted-media"
          style={
            styles.transform !== 'none'
              ? { transform: styles.transform, transformOrigin: 'center center' }
              : undefined
          }
          className="relative z-[1] w-full h-full border-0 pointer-events-none bg-black transition-transform duration-150"
        />
      );
    }

    if (snap) {
      return (
        <img
          src={snap.imageData}
          alt={cam.label || cam.name}
          onLoad={(e) => {
            if (!onFrameContentDetected) return;
            const info = detectFrameActiveContentOrientation(e.currentTarget);
            if (info) onFrameContentDetected(cam.cameraId, info);
          }}
          className={`relative z-[1] w-full h-full ${styles.objectClass} bg-black`}
        />
      );
    }

    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#060911] text-slate-500 p-2 text-center">
        <Monitor className="w-4 h-4 mb-1 opacity-60" />
        <span className="text-[10px] font-mono truncate max-w-full">
          CAM {cam.cameraNumber} · {cam.label || cam.name}
        </span>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
      {/* PROGRAM (ON AIR) — Left Monitor */}
      <div
        className={`lg:col-span-7 rounded-xl p-[1.5px] transition-colors ${
          obsConnected && profile.obsStreamActive
            ? 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 shadow-[0_0_24px_rgba(16,185,129,0.18)]'
            : obsConnected
              ? 'bg-gradient-to-br from-emerald-500/80 to-slate-700'
              : 'bg-slate-800'
        }`}
      >
        <div className="relative aspect-video w-full rounded-[10.5px] bg-black overflow-hidden">
          {effectiveProgramMode === 'live_video' && programBoxes.length > 0 ? (
            <div className="relative w-full h-full bg-black">
              {programBoxes.map((box) => {
                const cam = cameraLookup.get(box.cameraId);
                if (!cam) return null;
                return (
                  <div
                    key={`cr-prog-${box.cameraId}-${box.slotIndex}`}
                    style={{
                      left: `${(box.x / 1920) * 100}%`,
                      top: `${(box.y / 1080) * 100}%`,
                      width: `${(box.width / 1920) * 100}%`,
                      height: `${(box.height / 1080) * 100}%`,
                      zIndex: box.slotIndex + 1,
                    }}
                    className="absolute overflow-hidden bg-black"
                  >
                    {renderFeedSurface(cam, 'prog', programBoxes.length === 1)}
                  </div>
                );
              })}
              <MultiCamSplitBorders
                layoutType={obsConnected ? profile.activeLayoutType || 'SINGLE' : 'SINGLE'}
                boxes={programBoxes}
                zIndex={15}
              />
            </div>
          ) : obsConnected && programSnapshot ? (
            <img
              src={programSnapshot.imageData}
              alt={`OBS Program: ${profile.activeObsScene || 'Active Scene'}`}
              onLoad={(e) => {
                if (!onFrameContentDetected) return;
                const info = detectFrameActiveContentOrientation(e.currentTarget);
                if (info) onFrameContentDetected('__active_scene__', info);
              }}
              className={`w-full h-full ${autoFitEnabled ? 'object-contain' : 'object-cover'} bg-black`}
            />
          ) : !obsConnected ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center space-y-2 bg-[#060911]">
              <Monitor className="w-7 h-7 text-slate-600" />
              <p className="text-xs font-bold text-slate-200">OBS Studio Offline</p>
              <p className="text-[11px] text-slate-400 max-w-xs">
                Connect OBS Studio via Bridge or Direct WebSocket to mirror live program output.
              </p>
              <button
                type="button"
                onClick={onOpenSettings}
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold"
              >
                Configure OBS Connection
              </button>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center space-y-2 bg-[#060911]">
              {programSnapshotError ? (
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              ) : (
                <RefreshCw className="w-6 h-6 text-purple-400 animate-spin" />
              )}
              <p className="text-xs font-semibold text-slate-300">
                {programSnapshotError || 'Waiting for live OBS program frame...'}
              </p>
              <button
                type="button"
                disabled={capturingProgramPreview}
                onClick={() => onRefreshProgramPreview()}
                className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
              >
                Refresh Frame
              </button>
            </div>
          )}

          {/* Live Scoreboard Overlay Preview inside Program Monitor */}
          {(effectiveProgramMode === 'live_video' || !obsConnected) && (
            <ScaledScoreboardOverlayLayer
              stream={matchStream}
              score={liveScore}
              config={overlayConfig}
            />
          )}

          {/* Top Bar Overlays */}
          <div className="absolute inset-x-0 top-0 z-30 p-2 bg-gradient-to-b from-black/80 via-black/35 to-transparent flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-600 text-white text-[11px] font-bold shadow">
                <Radio className="w-3 h-3" />
                <span>Program (ON AIR)</span>
              </span>
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded bg-black/75 border border-white/10 font-mono text-[10px] text-slate-200 truncate">
                {obsConnected
                  ? `${profile.activeObsScene || 'Active'} · ${activeLayoutLabel}`
                  : 'Offline'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <div className="inline-flex items-center rounded-md bg-black/75 border border-white/15 p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => onChangeProgramMonitorMode('live_video')}
                  className={`px-1.5 py-0.5 rounded font-semibold ${
                    effectiveProgramMode === 'live_video'
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Web
                </button>
                <button
                  type="button"
                  onClick={() => onChangeProgramMonitorMode('obs_frame')}
                  className={`px-1.5 py-0.5 rounded font-semibold ${
                    effectiveProgramMode === 'obs_frame'
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  OBS
                </button>
              </div>

              <button
                type="button"
                disabled={!obsConnected || capturingProgramPreview}
                onClick={() => onRefreshProgramPreview()}
                title="Refresh live Program snapshot"
                aria-label="Refresh live Program snapshot"
                className="p-1 rounded-md bg-black/75 border border-white/15 text-slate-200 hover:text-white disabled:opacity-40"
              >
                <RefreshCw
                  className={`w-3 h-3 ${capturingProgramPreview ? 'animate-spin text-purple-400' : ''}`}
                />
              </button>

              {obsConnected && profile.obsStreamActive ? (
                <span className="px-2 py-0.5 rounded bg-red-600 text-white font-mono text-[10px] font-extrabold tracking-wide">
                  LIVE
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-slate-900/90 border border-white/15 text-slate-300 font-mono text-[10px] font-bold">
                  {obsConnected ? 'READY' : 'OFFLINE'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PREVIEW (Next / Staging) — Right Monitor */}
      <div className="lg:col-span-5 rounded-xl border border-slate-700/90 bg-[#0B0F17] overflow-hidden">
        <div className="relative aspect-video w-full bg-black overflow-hidden">
          {stagedBoxes.length > 0 ? (
            <div className="relative w-full h-full bg-black">
              {stagedBoxes.map((box) => {
                const cam = cameraLookup.get(box.cameraId);
                if (!cam) return null;
                return (
                  <div
                    key={`cr-prev-${box.cameraId}-${box.slotIndex}`}
                    style={{
                      left: `${(box.x / 1920) * 100}%`,
                      top: `${(box.y / 1080) * 100}%`,
                      width: `${(box.width / 1920) * 100}%`,
                      height: `${(box.height / 1080) * 100}%`,
                      zIndex: box.slotIndex + 1,
                    }}
                    className="absolute overflow-hidden bg-black"
                  >
                    {renderFeedSurface(cam, 'prev', false)}
                    <span className="pointer-events-none absolute bottom-1 left-1 z-10 px-1.5 py-0.5 rounded bg-black/80 border border-purple-500/40 font-mono text-[9px] font-bold text-purple-200">
                      {box.slotIndex + 1} · CAM {cam.cameraNumber}
                    </span>
                  </div>
                );
              })}
              <MultiCamSplitBorders
                layoutType={stagedLayoutType}
                boxes={stagedBoxes}
                zIndex={15}
              />
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center space-y-1.5 bg-[#060911]">
              <Eye className="w-6 h-6 text-purple-400/70" />
              <p className="text-xs font-semibold text-slate-300">Preview Staging Empty</p>
              <p className="text-[11px] text-slate-500 max-w-[230px]">
                Click camera tiles below or choose a Quick Layout to stage next shot without interrupting ON AIR.
              </p>
            </div>
          )}

          {/* Top Bar Overlays */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 p-2 bg-gradient-to-b from-black/80 via-black/35 to-transparent flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gradient-to-r from-purple-600 to-violet-600 text-white text-[11px] font-bold shadow">
              <Eye className="w-3 h-3" />
              <span>Preview (Next / Staging)</span>
            </span>
            <span className="px-2 py-0.5 rounded bg-black/75 border border-purple-500/40 font-mono text-[10px] text-purple-200 truncate">
              {stagedLayoutLabel} ({stagedCameraIds.length})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
