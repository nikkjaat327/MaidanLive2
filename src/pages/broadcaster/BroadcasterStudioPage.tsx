import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Camera,
  Check,
  Columns2,
  Grid2X2,
  LayoutGrid,
  LogOut,
  Maximize2,
  Minimize2,
  Mic,
  MicOff,
  PictureInPicture2,
  PlugZap,
  Radio,
  RefreshCw,
  Rows2,
  Square,
  Tv,
  Video,
  WifiOff,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.ts';
import { useObsStudio } from '../../hooks/useObsStudio.ts';
import { useObsOverlay } from '../../hooks/useObsOverlay.ts';
import { obsStudioService } from '../../services/obs/obsStudioService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import type {
  BroadcastCameraData,
  BroadcasterDashboardMatchItem,
  ObsControllerProfileData,
} from '../../types/obs.ts';
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../../types/index.ts';
import type { BroadcastGraphicsStateData } from '../../types/broadcastGraphics.ts';
import {
  MAX_CONTROL_ROOM_CAMERAS,
  type ObsLayoutType,
} from '../../utils/obsLayoutGeometry.ts';
import {
  getPreviewMediaStyles,
  normalizeOrientationMode,
  normalizePreviewFit,
  parseOrientationDegrees,
  resolveCameraLiveWebUrl,
} from '../../utils/obsTransformGeometry.ts';
import { HotstarBroadcastOverlay } from '../../components/obs/HotstarBroadcastOverlay.tsx';
import { BroadcastBrandLogoBug } from '../../components/obs/ObsBrandMark.tsx';
import { ObsGraphicsLayer } from '../../components/obsGraphics/ObsGraphicsLayer.tsx';
import {
  getStickyMatchId,
  setStickyMatchId,
  subscribeStickyMatchId,
} from '../../utils/activeMatchSelection.ts';

type CameraTab = 'connected' | 'disconnected';
type MultiCamLayoutType =
  | 'SPLIT_2_H'
  | 'SPLIT_2_V'
  | 'SPLIT_3'
  | 'GRID_4'
  | 'GRID_5'
  | 'GRID_6'
  | 'GRID_8'
  | 'PIP';

interface LayoutOptionDef {
  type: ObsLayoutType;
  label: string;
  requiredCount: number;
  icon: typeof Square;
}

const LAYOUT_OPTIONS: LayoutOptionDef[] = [
  { type: 'SINGLE', label: '1-Cam Live', requiredCount: 1, icon: Square },
  { type: 'SPLIT_2_H', label: '2 Split (H)', requiredCount: 2, icon: Columns2 },
  { type: 'SPLIT_2_V', label: '2 Split (V)', requiredCount: 2, icon: Rows2 },
  { type: 'SPLIT_3', label: '3 Split', requiredCount: 3, icon: LayoutGrid },
  { type: 'GRID_4', label: '4 Quad', requiredCount: 4, icon: Grid2X2 },
  { type: 'GRID_5', label: '5-Cam', requiredCount: 5, icon: LayoutGrid },
  { type: 'GRID_6', label: '6-Cam', requiredCount: 6, icon: LayoutGrid },
  { type: 'GRID_8', label: '8-Cam', requiredCount: 8, icon: LayoutGrid },
  { type: 'PIP', label: 'PIP', requiredCount: 2, icon: PictureInPicture2 },
];

interface PreviewSnapshot {
  imageData: string;
  capturedAt: string;
}

function isCameraInProgram(
  cam: BroadcastCameraData,
  profile: ObsControllerProfileData | null,
  obsConnected: boolean
): boolean {
  if (!obsConnected || !profile) return false;
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
  profile: ObsControllerProfileData | null,
  obsConnected: boolean
): boolean {
  if (!cam.enabled) return false;
  if (cam.mediamtxRevoked) return false;
  if (cam.status === 'ACTIVE' || cam.status === 'CONNECTED') return true;
  if (cam.sourceType === 'mediamtx' && cam.mediamtxPublisherConnected) return true;
  if (isCameraInProgram(cam, profile, obsConnected)) return true;
  return false;
}

function resolveSourceBadge(cam: BroadcastCameraData): { label: string; badgeClass: string } {
  if (cam.sourceType === 'mediamtx') {
    const proto = cam.streamProtocol === 'srt' ? 'SRT' : 'RTMP';
    return {
      label: `LARIX ${proto}`,
      badgeClass: 'bg-orange-950/90 text-orange-200 border border-orange-500/40',
    };
  }
  if (cam.sourceType === 'vdoninja') {
    return {
      label: 'VDO.NINJA',
      badgeClass: 'bg-sky-950/90 text-sky-200 border border-sky-500/40',
    };
  }
  if (cam.sourceType === 'obs_input') {
    return {
      label: 'OBS INPUT',
      badgeClass: 'bg-slate-900/90 text-slate-200 border border-slate-700',
    };
  }
  return {
    label: cam.sourceType.toUpperCase(),
    badgeClass: 'bg-slate-900/90 text-slate-200 border border-slate-700',
  };
}

function resolveGridLayoutClass(count: number): string {
  if (count <= 1) return 'grid-cols-1 grid-rows-1';
  if (count === 2) return 'grid-cols-1 md:grid-cols-2 grid-rows-2 md:grid-rows-1';
  if (count === 3) return 'grid-cols-1 md:grid-cols-3 grid-rows-3 md:grid-rows-1';
  if (count === 4) return 'grid-cols-2 grid-rows-2';
  if (count === 5) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 lg:grid-rows-2';
  if (count === 6) return 'grid-cols-2 lg:grid-cols-3 grid-rows-3 lg:grid-rows-2';
  return 'grid-cols-2 lg:grid-cols-4 grid-rows-4 lg:grid-rows-2';
}

function resolveTileSpanClass(totalCount: number, idx: number): string {
  if (totalCount !== 5) return '';
  return idx < 2 ? 'lg:col-span-3' : 'lg:col-span-2';
}

function LiveCameraScoreboardLayer({
  stream,
  score,
  overlayConfig,
  graphicsState,
  matchId,
  containerWidth,
}: {
  stream: LiveStreamData | null;
  score: LiveScoreData | null;
  overlayConfig: BroadcastOverlayConfig;
  graphicsState: BroadcastGraphicsStateData | null;
  matchId: string;
  containerWidth: number;
}) {
  if (!stream || containerWidth <= 0) return null;
  const scale = containerWidth / 1920;
  const tileConfig: BroadcastOverlayConfig = {
    ...overlayConfig,
    visible: true,
    mode: overlayConfig.mode === 'hidden' ? 'compact' : overlayConfig.mode || 'full',
  };

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 z-10 pointer-events-none overflow-hidden flex items-center justify-center"
    >
      <div
        style={{
          width: 1920,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
        className="shrink-0 relative bg-transparent overflow-hidden pointer-events-none"
      >
        <BroadcastBrandLogoBug config={tileConfig} variant="canvas" zIndex={24} />
        <HotstarBroadcastOverlay
          stream={stream}
          score={score}
          config={tileConfig}
          isPortrait={false}
        />
        {graphicsState && (
          <ObsGraphicsLayer
            graphicsState={graphicsState}
            canvasWidth={1920}
            canvasHeight={1080}
            matchId={matchId}
            tournamentId={stream.tournamentId || null}
          />
        )}
      </div>
    </div>
  );
}

function ConnectedCameraTile({
  cam,
  index,
  inProgram,
  stagingMode,
  slotIndex,
  isPipLayout,
  isSwitching,
  isMuting,
  obsConnected,
  autoFitEnabled,
  tileSpanClass,
  snapshot,
  previewError,
  stream,
  score,
  overlayConfig,
  graphicsState,
  matchId,
  onTileClick,
  onToggleAudio,
}: {
  cam: BroadcastCameraData;
  index: number;
  inProgram: boolean;
  stagingMode: MultiCamLayoutType | null;
  slotIndex: number; // -1 if not staged
  isPipLayout: boolean;
  isSwitching: boolean;
  isMuting: boolean;
  obsConnected: boolean;
  autoFitEnabled: boolean;
  tileSpanClass?: string;
  snapshot?: PreviewSnapshot;
  previewError?: string;
  stream: LiveStreamData | null;
  score: LiveScoreData | null;
  overlayConfig: BroadcastOverlayConfig;
  graphicsState: BroadcastGraphicsStateData | null;
  matchId: string;
  onTileClick: (cam: BroadcastCameraData) => void;
  onToggleAudio: (cam: BroadcastCameraData) => void;
}) {
  const frameBoxRef = useRef<HTMLDivElement | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);

  useEffect(() => {
    const el = frameBoxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) setFrameWidth(rect.width);
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isSelected = slotIndex >= 0;
  const isMuted = Boolean(cam.obsInputMuted ?? cam.audioMuted ?? cam.telemetry?.audioMuted);
  const sourceBadge = resolveSourceBadge(cam);
  const liveWebUrl = resolveCameraLiveWebUrl(cam);
  const tileFit = autoFitEnabled ? normalizePreviewFit(cam.previewFit || 'contain') : 'cover';
  const tileRot = parseOrientationDegrees(normalizeOrientationMode(cam.orientationMode));
  const mediaStyles = getPreviewMediaStyles({
    rotationDeg: tileRot,
    previewFit: tileFit,
    isPortraitContent: false,
    skipRotation: !liveWebUrl,
  });

  const slotLabel = isSelected
    ? isPipLayout
      ? slotIndex === 0
        ? 'MAIN'
        : 'INSET'
      : `SLOT ${slotIndex + 1}`
    : null;

  const statusText =
    cam.sourceType === 'mediamtx' && cam.mediamtxPublisherConnected
      ? 'STREAMING'
      : cam.status === 'ACTIVE'
        ? 'LIVE'
        : 'CONNECTED';

  const resolutionLabel =
    cam.telemetry?.videoWidth && cam.telemetry?.videoHeight
      ? `${cam.telemetry.videoWidth}×${cam.telemetry.videoHeight}`
      : cam.telemetry?.resolutionActual || cam.resolution || '';

  return (
    <div
      className={`group relative min-h-0 h-full flex flex-col rounded-xl border-2 overflow-hidden transition-all bg-[#0B0F17] ${tileSpanClass || ''} ${
        isSelected && inProgram
          ? 'border-purple-400 ring-2 ring-red-500/70'
          : isSelected
            ? 'border-purple-500 ring-2 ring-purple-500/40'
            : inProgram
              ? 'border-red-500 ring-2 ring-red-500/45 shadow-lg shadow-red-950/40'
              : 'border-slate-800 hover:border-slate-500'
      }`}
    >
      {/* Clickable Full-Bleed Preview Frame */}
      <div
        role="button"
        tabIndex={0}
        aria-label={
          stagingMode
            ? `Select ${cam.label || cam.name} for ${stagingMode}`
            : `Switch ON AIR to ${cam.label || cam.name}`
        }
        onClick={() => !isSwitching && onTileClick(cam)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isSwitching) {
            e.preventDefault();
            onTileClick(cam);
          }
        }}
        className="relative flex-1 min-h-0 w-full bg-black flex items-center justify-center overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EA580C]"
      >
        <div
          ref={frameBoxRef}
          className="relative w-full h-full max-w-full max-h-full aspect-video bg-black overflow-hidden flex items-center justify-center"
        >
          {liveWebUrl ? (
            <iframe
              key={`bcast-tile:${cam.cameraId}:${liveWebUrl}`}
              title={`Camera ${cam.cameraNumber} ${cam.name}`}
              src={liveWebUrl}
              allow="autoplay; fullscreen; encrypted-media"
              style={
                mediaStyles.transform !== 'none'
                  ? { transform: mediaStyles.transform, transformOrigin: 'center center' }
                  : undefined
              }
              className="relative z-[1] w-full h-full border-0 pointer-events-none bg-black"
            />
          ) : snapshot ? (
            <img
              src={snapshot.imageData}
              alt={`${cam.label || cam.name} live preview`}
              className={`relative z-[1] w-full h-full ${mediaStyles.objectClass} bg-black`}
            />
          ) : (
            <div className="relative z-[1] w-full h-full flex flex-col items-center justify-center p-3 text-center gap-1.5 bg-slate-950">
              <Video className="w-6 h-6 text-slate-500" />
              <p className="text-xs font-semibold text-slate-300">
                {previewError
                  ? 'Preview waiting for OBS frame'
                  : obsConnected
                    ? 'Fetching camera preview...'
                    : 'Camera connected — OBS offline'}
              </p>
              <p className="text-[10px] font-mono text-slate-500 truncate max-w-full">
                {cam.obsInputName || cam.name}
              </p>
            </div>
          )}

          {/* Live Match Scoreboard + Active Graphics Scaled Inside Preview */}
          <LiveCameraScoreboardLayer
            stream={stream}
            score={score}
            overlayConfig={overlayConfig}
            graphicsState={graphicsState}
            matchId={matchId}
            containerWidth={frameWidth}
          />
        </div>

        {/* Top Bar Overlay */}
        <div className="absolute inset-x-0 top-0 z-20 px-2.5 py-2 bg-gradient-to-b from-black/85 via-black/45 to-transparent flex items-center justify-between gap-2 pointer-events-none">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono tabular-nums text-[11px] font-bold px-1.5 py-0.5 rounded bg-black/80 text-white border border-white/15 shrink-0">
              {index < 9 ? `[${index + 1}] ` : ''}CAM {cam.cameraNumber}
            </span>
            <span className="text-xs font-bold text-white truncate drop-shadow">
              {cam.label || cam.name}
            </span>
            <span
              className={`hidden sm:inline-flex font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${sourceBadge.badgeClass}`}
            >
              {sourceBadge.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {resolutionLabel && (
              <span className="hidden xl:inline-flex font-mono tabular-nums text-[10px] px-1.5 py-0.5 rounded bg-black/75 text-slate-200 border border-white/10">
                {resolutionLabel}
                {cam.telemetry?.fpsActual ? ` · ${Math.round(cam.telemetry.fpsActual)}fps` : ''}
              </span>
            )}
            <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-500/40">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {statusText}
            </span>
            {inProgram && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-600 text-white font-mono text-[10px] font-extrabold tracking-wide shadow">
                <Radio className="w-3 h-3" />
                ON AIR
              </span>
            )}
            {slotLabel && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-mono text-[10px] font-extrabold tracking-wide shadow">
                <Check className="w-3 h-3" />
                {slotLabel}
              </span>
            )}
          </div>
        </div>

        {/* Switching Spinner Overlay */}
        {isSwitching && (
          <div className="absolute inset-0 z-30 bg-black/55 backdrop-blur-[1px] flex items-center justify-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#EA580C] text-white text-xs font-bold shadow-xl">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Switching ON AIR...</span>
            </div>
          </div>
        )}
      </div>

      {/* Ultra-Slim Operator Footer Bar */}
      <div className="shrink-0 h-9 px-2.5 bg-[#0F172A] border-t border-slate-800/90 flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono text-slate-300 truncate">
          {stagingMode
            ? isSelected
              ? `Selected (${slotLabel}) — Click to remove`
              : `Click tile to add to ${stagingMode.replace(/_/g, ' ')}`
            : inProgram
              ? 'Currently ON AIR in OBS Program'
              : 'Click camera to cut ON AIR'}
        </span>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={isMuting || !obsConnected}
            onClick={(e) => {
              e.stopPropagation();
              onToggleAudio(cam);
            }}
            title={isMuted ? 'Unmute audio in OBS' : 'Mute audio in OBS'}
            aria-label={isMuted ? `Unmute ${cam.name}` : `Mute ${cam.name}`}
            className={`h-7 px-2 inline-flex items-center gap-1 rounded border text-[10px] font-bold transition-colors disabled:opacity-40 ${
              isMuted
                ? 'bg-red-950/90 text-red-200 border-red-700/70'
                : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-slate-500'
            }`}
          >
            {isMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
            <span className="hidden sm:inline">{isMuted ? 'Muted' : 'Mic'}</span>
          </button>

          {!stagingMode && (
            <button
              type="button"
              disabled={!obsConnected || isSwitching}
              onClick={() => onTileClick(cam)}
              className={`h-7 px-2.5 inline-flex items-center gap-1 rounded text-[10px] font-bold uppercase tracking-wide whitespace-nowrap transition-colors disabled:opacity-40 ${
                inProgram
                  ? 'bg-red-600 text-white'
                  : 'bg-[#EA580C] hover:bg-orange-600 text-white'
              }`}
            >
              <Radio className="w-3 h-3" />
              <span>{inProgram ? 'ON AIR' : 'Cut Live'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function BroadcasterStudioPage() {
  const { matchId: routeMatchId } = useParams<{ matchId?: string }>();
  const { adminUser, logoutAdmin } = useAuth();

  const [matches, setMatches] = useState<BroadcasterDashboardMatchItem[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>(() => routeMatchId || getStickyMatchId());
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [matchListError, setMatchListError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<CameraTab>('connected');
  const [stagingLayout, setStagingLayout] = useState<MultiCamLayoutType | null>(null);
  const [stagedCameraIds, setStagedCameraIds] = useState<string[]>([]);

  const [switchingCamId, setSwitchingCamId] = useState<string | null>(null);
  const [applyingLayout, setApplyingLayout] = useState(false);
  const [transitioningMode, setTransitioningMode] = useState<'cut' | 'fade' | null>(null);
  const [mutingCamId, setMutingCamId] = useState<string | null>(null);
  const [reconnectingCamId, setReconnectingCamId] = useState<string | null>(null);
  const [autoFitEnabled, setAutoFitEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [actionBanner, setActionBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [previewSnapshots, setPreviewSnapshots] = useState<Record<string, PreviewSnapshot>>({});
  const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({});
  const [refreshingPreviews, setRefreshingPreviews] = useState(false);
  const [tabVisible, setTabVisible] = useState<boolean>(
    () => typeof document === 'undefined' || document.visibilityState === 'visible'
  );

  // Load assigned matches for broadcaster
  const loadAssignedMatches = useCallback(async () => {
    try {
      setLoadingMatches(true);
      setMatchListError(null);
      const data = await obsStudioService.getBroadcasterDashboard();
      const list = data.matches || [];
      setMatches(list);

      if (routeMatchId && list.some((m) => m.id === routeMatchId)) {
        setSelectedMatchId(routeMatchId);
        setStickyMatchId(routeMatchId);
      } else {
        setSelectedMatchId((prev) => {
          const sticky = getStickyMatchId();
          if (sticky && list.some((m) => m.id === sticky)) return sticky;
          if (prev && list.some((m) => m.id === prev)) return prev;
          const liveFirst =
            list.find((m) => m.status === 'LIVE') ||
            list.find((m) => m.obsConnectionStatus === 'CONNECTED') ||
            list[0];
          const chosen = liveFirst ? liveFirst.id : '';
          if (chosen) setStickyMatchId(chosen);
          return chosen;
        });
      }
    } catch (err) {
      setMatchListError(extractApiError(err, 'Unable to load assigned broadcast matches.'));
    } finally {
      setLoadingMatches(false);
    }
  }, [routeMatchId]);

  useEffect(() => {
    void loadAssignedMatches();
  }, [loadAssignedMatches]);

  // Sync sticky match changes initiated explicitly by the user in another tab/window
  useEffect(() => {
    return subscribeStickyMatchId((nextId) => {
      if (!nextId) return;
      if (matches.length === 0 || matches.some((m) => m.id === nextId)) {
        setSelectedMatchId((prev) => (prev === nextId ? prev : nextId));
      }
    });
  }, [matches]);

  const activeMatchId = selectedMatchId || '';
  const {
    studio,
    loading: loadingStudio,
    error: studioError,
    liveErrorToast,
    clearLiveErrorToast,
    refetch,
  } = useObsStudio(activeMatchId || undefined);

  const {
    stream: overlayStream,
    score: overlayScore,
    overlayConfig,
    graphicsState,
  } = useObsOverlay(activeMatchId || undefined);

  const profile = studio?.profile || null;
  const obsConnected = Boolean(profile && profile.connectionStatus === 'CONNECTED');
  const cameras = useMemo(
    () =>
      [...(studio?.cameras || [])].sort(
        (a, b) => (a.sortOrder || a.cameraNumber) - (b.sortOrder || b.cameraNumber)
      ),
    [studio?.cameras]
  );

  const connectedCameras = useMemo(
    () => cameras.filter((cam) => isCameraConnected(cam, profile, obsConnected)),
    [cameras, profile, obsConnected]
  );

  const displayedConnectedCameras = useMemo(
    () => connectedCameras.slice(0, MAX_CONTROL_ROOM_CAMERAS),
    [connectedCameras]
  );

  const disconnectedCameras = useMemo(
    () => cameras.filter((cam) => !isCameraConnected(cam, profile, obsConnected)),
    [cameras, profile, obsConnected]
  );

  // Remove any staged camera that went offline or outside max-6 window
  useEffect(() => {
    const onlineSet = new Set(displayedConnectedCameras.map((c) => c.cameraId));
    setStagedCameraIds((prev) => {
      const next = prev.filter((id) => onlineSet.has(id)).slice(0, MAX_CONTROL_ROOM_CAMERAS);
      return next.length === prev.length ? prev : next;
    });
  }, [displayedConnectedCameras]);

  // Reset staging when switching matches
  useEffect(() => {
    setStagingLayout(null);
    setStagedCameraIds([]);
    setPreviewSnapshots({});
    setPreviewErrors({});
    setActionBanner(null);
  }, [activeMatchId]);

  // Track document visibility & fullscreen state
  useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState === 'visible');
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, []);

  // Poll OBS snapshots ONLY for connected cameras that don't have a live WebRTC/VDO iframe
  const snapshotTargets = useMemo(
    () => displayedConnectedCameras.filter((cam) => !resolveCameraLiveWebUrl(cam)),
    [displayedConnectedCameras]
  );
  const snapshotTargetsRef = useRef(snapshotTargets);
  snapshotTargetsRef.current = snapshotTargets;
  const refreshingRef = useRef(false);

  const refreshCameraPreviews = useCallback(
    async (targets: BroadcastCameraData[], background = false) => {
      if (!activeMatchId || !obsConnected || targets.length === 0) return;
      if (refreshingRef.current && background) return;
      refreshingRef.current = true;
      if (!background) setRefreshingPreviews(true);

      try {
        for (const cam of targets) {
          const primarySource = cam.obsInputName || cam.obsSceneName || cam.name;
          if (!primarySource) continue;
          const fallbacks = [cam.obsSceneName, cam.name].filter(
            (s): s is string => Boolean(s && s !== primarySource)
          );
          try {
            const res = await obsStudioService.capturePreview(activeMatchId, primarySource, fallbacks);
            if (res.imageData) {
              setPreviewSnapshots((prev) => ({
                ...prev,
                [cam.cameraId]: {
                  imageData: res.imageData,
                  capturedAt: new Date().toLocaleTimeString(),
                },
              }));
              setPreviewErrors((prev) => {
                if (!prev[cam.cameraId]) return prev;
                const copy = { ...prev };
                delete copy[cam.cameraId];
                return copy;
              });
            }
          } catch (err) {
            setPreviewErrors((prev) => ({
              ...prev,
              [cam.cameraId]: extractApiError(err, 'Preview unavailable'),
            }));
          }
        }
      } finally {
        refreshingRef.current = false;
        if (!background) setRefreshingPreviews(false);
      }
    },
    [activeMatchId, obsConnected]
  );

  useEffect(() => {
    if (!obsConnected || !tabVisible || snapshotTargets.length === 0) return;
    void refreshCameraPreviews(snapshotTargets, true);
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' && snapshotTargetsRef.current.length > 0) {
        void refreshCameraPreviews(snapshotTargetsRef.current, true);
      }
    }, 2500);
    return () => window.clearInterval(id);
  }, [obsConnected, tabVisible, snapshotTargets.length, refreshCameraPreviews]);

  // Clear banner automatically after 4s
  useEffect(() => {
    if (!actionBanner) return;
    const t = window.setTimeout(() => setActionBanner(null), 4000);
    return () => window.clearTimeout(t);
  }, [actionBanner]);

  const handleCutCameraLive = useCallback(
    async (cam: BroadcastCameraData) => {
      if (!activeMatchId) return;
      if (!obsConnected) {
        setActionBanner({ type: 'error', message: 'OBS Studio is currently disconnected.' });
        return;
      }
      try {
        setSwitchingCamId(cam.cameraId);
        setActionBanner(null);
        await obsStudioService.switchCamera(activeMatchId, cam.cameraId, false);
        setActionBanner({
          type: 'success',
          message: `ON AIR: ${cam.label || cam.name}`,
        });
        await refetch();
      } catch (err) {
        setActionBanner({
          type: 'error',
          message: extractApiError(err, `Failed to switch ON AIR to ${cam.label || cam.name}.`),
        });
      } finally {
        setSwitchingCamId(null);
      }
    },
    [activeMatchId, obsConnected, refetch]
  );

  const activeStagingMeta = useMemo(
    () => LAYOUT_OPTIONS.find((l) => l.type === stagingLayout) || null,
    [stagingLayout]
  );

  const handleSelectLayoutOption = (opt: LayoutOptionDef) => {
    if (opt.type === 'SINGLE') {
      setStagingLayout(null);
      setStagedCameraIds([]);
      return;
    }
    const multiType = opt.type as MultiCamLayoutType;
    if (displayedConnectedCameras.length < opt.requiredCount) {
      setActionBanner({
        type: 'error',
        message: `${opt.label} requires ${opt.requiredCount} connected cameras (only ${displayedConnectedCameras.length} connected right now).`,
      });
      return;
    }
    if (stagingLayout === multiType) {
      setStagingLayout(null);
      setStagedCameraIds([]);
      return;
    }
    setStagingLayout(multiType);
    setStagedCameraIds(
      displayedConnectedCameras.slice(0, opt.requiredCount).map((c) => c.cameraId)
    );
    setActiveTab('connected');
    setActionBanner(null);
  };

  const handleTileClick = (cam: BroadcastCameraData) => {
    if (!stagingLayout || !activeStagingMeta) {
      void handleCutCameraLive(cam);
      return;
    }

    const reqCount = Math.min(MAX_CONTROL_ROOM_CAMERAS, activeStagingMeta.requiredCount);
    setStagedCameraIds((prev) => {
      if (prev.includes(cam.cameraId)) {
        return prev.filter((id) => id !== cam.cameraId);
      }
      if (prev.length >= reqCount) {
        return [...prev.slice(0, reqCount - 1), cam.cameraId];
      }
      return [...prev, cam.cameraId];
    });
  };

  const handleApplyStagedLayout = async () => {
    if (!activeMatchId || !stagingLayout || !activeStagingMeta) return;
    if (!obsConnected) {
      setActionBanner({ type: 'error', message: 'OBS Studio is disconnected.' });
      return;
    }
    if (stagedCameraIds.length < activeStagingMeta.requiredCount) {
      setActionBanner({
        type: 'error',
        message: `Select ${activeStagingMeta.requiredCount} connected cameras before applying ${activeStagingMeta.label}.`,
      });
      return;
    }

    try {
      setApplyingLayout(true);
      setActionBanner(null);
      await obsStudioService.applyLayout(activeMatchId, {
        layoutType: stagingLayout,
        cameraIds: stagedCameraIds.slice(0, MAX_CONTROL_ROOM_CAMERAS),
        mainCameraId: stagedCameraIds[0],
        includeScoreboardOverlay: true,
        override: false,
      });
      setActionBanner({
        type: 'success',
        message: `Applied ${activeStagingMeta.label} ON AIR with scoreboard overlay.`,
      });
      setStagingLayout(null);
      setStagedCameraIds([]);
      await refetch();
    } catch (err) {
      setActionBanner({
        type: 'error',
        message: extractApiError(err, `Failed to apply ${activeStagingMeta.label} layout.`),
      });
    } finally {
      setApplyingLayout(false);
    }
  };

  const handleQuickTransition = async (mode: 'cut' | 'fade') => {
    if (!activeMatchId) return;
    if (!obsConnected) {
      setActionBanner({ type: 'error', message: 'OBS Studio is disconnected.' });
      return;
    }
    try {
      setTransitioningMode(mode);
      setActionBanner(null);
      await obsStudioService.executeTransition(activeMatchId, {
        mode,
        durationMs: mode === 'fade' ? 500 : 0,
        layoutType: stagingLayout || 'SINGLE',
        cameraIds: stagedCameraIds.slice(0, MAX_CONTROL_ROOM_CAMERAS),
        mainCameraId: stagedCameraIds[0],
        includeScoreboardOverlay: true,
        override: false,
      });
      setActionBanner({
        type: 'success',
        message: mode === 'cut' ? 'Executed instant Cut to Program.' : 'Executed 0.5s Fade transition.',
      });
      if (stagingLayout) {
        setStagingLayout(null);
        setStagedCameraIds([]);
      }
      await refetch();
    } catch (err) {
      setActionBanner({
        type: 'error',
        message: extractApiError(err, 'Transition failed.'),
      });
    } finally {
      setTransitioningMode(null);
    }
  };

  const handleRefreshAll = async () => {
    if (!activeMatchId) return;
    setRefreshingPreviews(true);
    try {
      await obsStudioService.refreshCameras(activeMatchId).catch(() => null);
      await refetch();
      if (snapshotTargets.length > 0) {
        await refreshCameraPreviews(snapshotTargets, false);
      }
    } finally {
      setRefreshingPreviews(false);
    }
  };

  const handleToggleAudio = async (cam: BroadcastCameraData) => {
    if (!activeMatchId) return;
    const currentlyMuted = Boolean(cam.obsInputMuted ?? cam.audioMuted ?? cam.telemetry?.audioMuted);
    try {
      setMutingCamId(cam.cameraId);
      await obsStudioService.setCameraAudioMute(activeMatchId, cam.cameraId, !currentlyMuted, false);
      await refetch();
    } catch (err) {
      setActionBanner({
        type: 'error',
        message: extractApiError(err, `Failed to toggle mic for ${cam.label || cam.name}.`),
      });
    } finally {
      setMutingCamId(null);
    }
  };

  const handleReconnectOfflineCamera = async (cam: BroadcastCameraData) => {
    if (!activeMatchId) return;
    try {
      setReconnectingCamId(cam.cameraId);
      const res = await obsStudioService.reconnectCamera(activeMatchId, cam.cameraId, false);
      setActionBanner({
        type: res.ok ? 'success' : 'error',
        message: `${cam.label || cam.name}: ${res.detail}`,
      });
      await refetch();
    } catch (err) {
      setActionBanner({
        type: 'error',
        message: extractApiError(err, `Reconnect failed for ${cam.label || cam.name}.`),
      });
    } finally {
      setReconnectingCamId(null);
    }
  };

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen denial
    }
  };

  // Number keys 1..8 quick switch when in 1-Click Live mode on Connected tab
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (stagingLayout || activeTab !== 'connected') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (/^[1-8]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const targetCam = displayedConnectedCameras[idx];
        if (targetCam && obsConnected && !switchingCamId) {
          void handleCutCameraLive(targetCam);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stagingLayout, activeTab, displayedConnectedCameras, obsConnected, switchingCamId, handleCutCameraLive]);

  const activeLayoutInObs = profile?.activeLayoutType || 'SINGLE';
  const neededCount = activeStagingMeta?.requiredCount || 0;
  const canApplyLayout =
    Boolean(stagingLayout) &&
    obsConnected &&
    stagedCameraIds.length === neededCount &&
    !applyingLayout;

  return (
    <div
      data-admin-theme="dark"
      className="h-screen w-screen overflow-hidden flex flex-col bg-[#070A10] text-slate-100 select-none"
    >
      {/* Minimal Camera-First Top Broadcast Bar */}
      <header className="shrink-0 border-b border-slate-800/90 bg-[#0B0F17] px-3 py-2 flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Match Switcher & Live Status */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-[#EA580C] text-white flex items-center justify-center shrink-0">
            <Radio className="w-4 h-4" />
          </span>

          {matches.length > 1 ? (
            <select
              aria-label="Select assigned match"
              value={activeMatchId}
              onChange={(e) => {
                setSelectedMatchId(e.target.value);
                setStickyMatchId(e.target.value);
              }}
              className="h-8 max-w-[260px] px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-white truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EA580C]"
            >
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.status === 'LIVE' ? 'LIVE · ' : ''}
                  {m.matchTitle}
                </option>
              ))}
            </select>
          ) : (
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-white truncate max-w-[240px]">
                {studio?.match?.matchTitle || matches[0]?.matchTitle || 'Broadcaster Live Desk'}
              </p>
            </div>
          )}

          <span
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono font-bold border whitespace-nowrap shrink-0 ${
              obsConnected
                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40'
                : 'bg-red-950/60 text-red-300 border-red-500/40'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${obsConnected ? 'bg-emerald-400' : 'bg-red-400'}`}
            />
            <span>{obsConnected ? 'OBS LIVE' : 'OBS OFFLINE'}</span>
          </span>

          {profile?.obsStreamActive && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-600 text-white font-mono text-[10px] font-extrabold whitespace-nowrap shrink-0">
              <Tv className="w-3 h-3" />
              ON AIR
            </span>
          )}
        </div>

        {/* Center: Layout Mode Bar + Apply Controls */}
        {activeMatchId && (
          <div className="flex flex-wrap items-center gap-1.5">
            <div
              role="group"
              aria-label="Broadcast Layout Selector"
              className="inline-flex flex-wrap items-center p-0.5 rounded-lg bg-slate-950 border border-slate-800 gap-0.5"
            >
              {LAYOUT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isStagingThis =
                  opt.type === 'SINGLE' ? stagingLayout === null : stagingLayout === opt.type;
                const isLiveInObs = activeLayoutInObs === opt.type && obsConnected;
                const insufficient =
                  opt.type !== 'SINGLE' && displayedConnectedCameras.length < opt.requiredCount;

                return (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => handleSelectLayoutOption(opt)}
                    title={
                      opt.type === 'SINGLE'
                        ? '1-Click Camera Live Switch Mode'
                        : `${opt.label} — Select ${opt.requiredCount} cameras then click Apply`
                    }
                    className={`h-8 px-2.5 rounded-md text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                      isStagingThis
                        ? 'bg-purple-600 text-white shadow'
                        : insufficient
                          ? 'text-slate-600 hover:text-slate-400'
                          : isLiveInObs
                            ? 'bg-slate-800 text-emerald-300 border border-emerald-500/40'
                            : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {stagingLayout && activeStagingMeta && (
              <div className="inline-flex flex-wrap items-center gap-1.5 pl-1">
                <span className="px-2 py-1 rounded-md bg-purple-500/15 border border-purple-400/40 text-purple-200 font-mono tabular-nums text-[11px] font-bold whitespace-nowrap">
                  {stagedCameraIds.length}/{neededCount} Selected
                </span>
                <button
                  type="button"
                  disabled={!canApplyLayout || transitioningMode !== null}
                  onClick={() => void handleApplyStagedLayout()}
                  className="h-8 px-3.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-extrabold inline-flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap shadow"
                >
                  {applyingLayout ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>{applyingLayout ? 'Applying...' : 'Apply'}</span>
                </button>
                <button
                  type="button"
                  disabled={!canApplyLayout || transitioningMode !== null}
                  onClick={() => void handleQuickTransition('cut')}
                  title="Instant Cut"
                  className="h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-bold inline-flex items-center gap-1 disabled:opacity-40 whitespace-nowrap"
                >
                  <Zap className="w-3 h-3 text-purple-400" />
                  <span>Cut</span>
                </button>
                <button
                  type="button"
                  disabled={!canApplyLayout || transitioningMode !== null}
                  onClick={() => void handleQuickTransition('fade')}
                  title="0.5s Fade Transition"
                  className="h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-bold inline-flex items-center gap-1 disabled:opacity-40 whitespace-nowrap"
                >
                  <span>0.5s</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStagingLayout(null);
                    setStagedCameraIds([]);
                  }}
                  className="h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Right: Connected / Disconnected Tabs + Auto Fit + Utilities + Sign Out */}
        <div className="flex items-center gap-2 shrink-0">
          {activeMatchId && (
            <>
              <button
                type="button"
                role="switch"
                aria-checked={autoFitEnabled}
                onClick={() => setAutoFitEnabled((v) => !v)}
                title="Toggle Auto Fit (Aspect Ratio)"
                className={`hidden md:inline-flex h-8 px-2.5 items-center gap-1.5 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  autoFitEnabled
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900 border-slate-700 text-slate-300'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    autoFitEnabled ? 'bg-emerald-400' : 'bg-slate-500'
                  }`}
                />
                <span>Auto Fit</span>
              </button>

              <div
                role="tablist"
                aria-label="Camera Connection Status Tabs"
                className="inline-flex items-center p-0.5 rounded-lg bg-slate-950 border border-slate-800"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'connected'}
                  onClick={() => setActiveTab('connected')}
                  className={`h-7 px-2.5 rounded-md text-[11px] font-bold tabular-nums whitespace-nowrap transition-colors ${
                    activeTab === 'connected'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Connected ({displayedConnectedCameras.length}
                  {connectedCameras.length > MAX_CONTROL_ROOM_CAMERAS ? `/${MAX_CONTROL_ROOM_CAMERAS}` : ''})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'disconnected'}
                  onClick={() => setActiveTab('disconnected')}
                  className={`h-7 px-2.5 rounded-md text-[11px] font-bold tabular-nums whitespace-nowrap transition-colors ${
                    activeTab === 'disconnected'
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Offline ({disconnectedCameras.length})
                </button>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => void handleRefreshAll()}
            disabled={refreshingPreviews || !activeMatchId}
            title="Refresh live camera feeds"
            aria-label="Refresh live camera feeds"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingPreviews ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => void handleToggleFullscreen()}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {adminUser && (
            <span className="hidden xl:inline text-[11px] font-mono text-slate-400 max-w-[130px] truncate">
              {adminUser.name}
            </span>
          )}

          <button
            type="button"
            onClick={logoutAdmin}
            aria-label="Sign Out"
            className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800 text-xs font-semibold whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Inline Status / Warning Toast Bar (only rendered when needed) */}
      {(actionBanner || liveErrorToast || studioError || matchListError) && (
        <div className="shrink-0 px-3 pt-2">
          <div
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-between gap-2 ${
              actionBanner?.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
                : 'bg-red-950/75 border-red-500/50 text-red-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {actionBanner?.message || liveErrorToast || studioError || matchListError}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setActionBanner(null);
                clearLiveErrorToast();
              }}
              className="text-[11px] underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Full-Screen Camera Stage */}
      <main className="flex-1 min-h-0 p-2.5 sm:p-3 overflow-hidden flex flex-col">
        {loadingMatches || (activeMatchId && loadingStudio && !studio) ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm font-semibold text-slate-200">
              <RefreshCw className="w-4 h-4 animate-spin text-[#EA580C]" />
              <span>Loading assigned broadcast cameras...</span>
            </div>
          </div>
        ) : !activeMatchId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-6">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center">
              <Camera className="w-6 h-6 text-slate-400" />
            </div>
            <div className="space-y-1 max-w-md">
              <h1 className="text-base font-bold text-white">No Match Assigned Yet</h1>
              <p className="text-xs text-slate-400">
                Ask your Super Admin or Tournament Organizer to assign your Broadcaster account to an upcoming or live match.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadAssignedMatches()}
              className="h-9 px-4 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Check Again</span>
            </button>
          </div>
        ) : activeTab === 'connected' ? (
          displayedConnectedCameras.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-6">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center">
                <WifiOff className="w-6 h-6 text-amber-400" />
              </div>
              <div className="space-y-1 max-w-md">
                <h1 className="text-base font-bold text-white">No Connected Cameras Online</h1>
                <p className="text-xs text-slate-400">
                  {disconnectedCameras.length > 0
                    ? `${disconnectedCameras.length} configured camera(s) are currently offline. Check the Offline tab or wait for camera feeds to connect.`
                    : 'No cameras are configured for this match yet.'}
                </p>
              </div>
              {disconnectedCameras.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('disconnected')}
                  className="h-9 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold"
                >
                  View Offline Cameras ({disconnectedCameras.length})
                </button>
              )}
            </div>
          ) : (
            <div
              className={`flex-1 min-h-0 grid gap-2.5 sm:gap-3 ${resolveGridLayoutClass(
                displayedConnectedCameras.length
              )}`}
            >
              {displayedConnectedCameras.map((cam, idx) => (
                <ConnectedCameraTile
                  key={cam.cameraId}
                  cam={cam}
                  index={idx}
                  inProgram={isCameraInProgram(cam, profile, obsConnected)}
                  stagingMode={stagingLayout}
                  slotIndex={stagedCameraIds.indexOf(cam.cameraId)}
                  isPipLayout={stagingLayout === 'PIP'}
                  isSwitching={switchingCamId === cam.cameraId}
                  isMuting={mutingCamId === cam.cameraId}
                  obsConnected={obsConnected}
                  autoFitEnabled={autoFitEnabled}
                  tileSpanClass={resolveTileSpanClass(displayedConnectedCameras.length, idx)}
                  snapshot={previewSnapshots[cam.cameraId]}
                  previewError={previewErrors[cam.cameraId]}
                  stream={overlayStream}
                  score={overlayScore}
                  overlayConfig={overlayConfig}
                  graphicsState={graphicsState}
                  matchId={activeMatchId}
                  onTileClick={handleTileClick}
                  onToggleAudio={(target) => void handleToggleAudio(target)}
                />
              ))}
            </div>
          )
        ) : (
          /* Disconnected / Offline Cameras Tab */
          <div className="flex-1 min-h-0 overflow-y-auto">
            {disconnectedCameras.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-2 p-6">
                <Check className="w-7 h-7 text-emerald-400" />
                <p className="text-sm font-bold text-white">All Configured Cameras Are Connected</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('connected')}
                  className="mt-1 h-8 px-3.5 rounded-lg bg-[#EA580C] text-white text-xs font-bold"
                >
                  Back to Connected Cameras
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {disconnectedCameras.map((cam) => {
                  const badge = resolveSourceBadge(cam);
                  const isReconnecting = reconnectingCamId === cam.cameraId;
                  const statusLabel = cam.mediamtxRevoked ? 'REVOKED' : cam.status || 'DISCONNECTED';

                  return (
                    <div
                      key={cam.cameraId}
                      className="rounded-xl border border-slate-800 bg-[#0B0F17] p-4 flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono tabular-nums text-[11px] font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                            CAM {cam.cameraNumber}
                          </span>
                          <span
                            className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                              statusLabel === 'ERROR' || statusLabel === 'REVOKED'
                                ? 'bg-red-950/90 text-red-300 border border-red-500/40'
                                : 'bg-slate-900 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {statusLabel}
                          </span>
                        </div>

                        <div>
                          <p className="text-sm font-bold text-white truncate">
                            {cam.label || cam.name}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.badgeClass}`}>
                              {badge.label}
                            </span>
                            {cam.resolution && (
                              <span className="text-[10px] font-mono text-slate-400">
                                {cam.resolution}
                              </span>
                            )}
                          </div>
                        </div>

                        {cam.lastError && (
                          <p className="text-[11px] text-red-300 bg-red-950/40 border border-red-900/50 rounded px-2 py-1 truncate">
                            {cam.lastError}
                          </p>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-500">Offline — unavailable for ON AIR</span>
                        <button
                          type="button"
                          disabled={isReconnecting || !obsConnected}
                          onClick={() => void handleReconnectOfflineCamera(cam)}
                          className="h-7 px-2.5 inline-flex items-center gap-1 rounded bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-200 text-[11px] font-semibold disabled:opacity-40 whitespace-nowrap"
                        >
                          {isReconnecting ? (
                            <RefreshCw className="w-3 h-3 animate-spin text-[#EA580C]" />
                          ) : (
                            <PlugZap className="w-3 h-3 text-[#EA580C]" />
                          )}
                          <span>Check</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
