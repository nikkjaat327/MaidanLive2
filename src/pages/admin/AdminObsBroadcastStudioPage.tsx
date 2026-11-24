import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Ban,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  ClipboardList,
  Copy,
  Download,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  Layers,
  Loader2,
  Lock,
  Mic,
  MicOff,
  Monitor,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  RotateCcw,
  Server,
  Shield,
  ShieldAlert,
  Sliders,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Square,
  Star,
  Terminal,
  Trash2,
  Tv,
  Unlock,
  Unplug,
  UserCheck,
  Video,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.ts';
import {
  liveStreamService,
  type YouTubeVerification,
} from '../../services/liveStream/liveStreamService.ts';
import { obsStudioService } from '../../services/obs/obsStudioService.ts';
import { broadcastGraphicsService } from '../../services/obs/broadcastGraphicsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { useObsStudio } from '../../hooks/useObsStudio.ts';
import { useScoreboard } from '../../hooks/useScoreboard.ts';
import { useLiveMonitor } from '../../context/LiveMonitorContext.tsx';
import { isMatchPreparedDraft } from '../../utils/broadcastWorkflow.ts';
import { offlineScoreQueue } from '../../utils/offlineScoreQueue.ts';
import type { LiveStreamData, StreamingProvider } from '../../types/index.ts';
import type {
  BroadcastAdDesignData,
  BroadcastGraphicsStateData,
} from '../../types/broadcastGraphics.ts';
import type {
  BroadcastCameraData,
  CameraConnectionStatus,
  CameraOrientationMode,
  CameraPreviewFit,
  LocalBridgeProbeStatus,
  MediaMTXConfigPayload,
  ObsBridgeData,
  ObsBridgeInstallerStatus,
  ObsBridgePairingResponse,
  ObsBridgeTokenResponse,
  ObsConnectionStatus,
  ObsDiscoveredInput,
  ObsSceneItemData,
  ObsSceneTransformItem,
} from '../../types/obs.ts';
import {
  OVERLAY_MODES,
  OVERLAY_POSITIONS,
  OVERLAY_SCALES,
  OVERLAY_SLIDER_BOUNDS,
  OVERLAY_THEMES,
  OverlayMode,
  OverlayPosition,
  OverlayScale,
  OverlayTheme,
  PRESET_SCALE_MULTIPLIERS,
  computeOverlayMetrics,
  normalizeOverlayConfig,
} from '../../utils/overlayConfig.ts';
import { OBS_THEME_MAP } from '../../components/obs/obsTheme.ts';
import type { ObsLayoutType, PipPosition, PipSize } from '../../utils/obsLayoutGeometry.ts';
import type { DetectedFrameContentInfo } from '../../utils/obsTransformGeometry.ts';
import { CameraFormModal, SmartphoneWizardModal } from '../../components/obsStudio/CameraSetupModal.tsx';
import { LarixConnectionModal } from '../../components/obsStudio/LarixConnectionModal.tsx';
import { CameraPreviewGrid } from '../../components/obsStudio/CameraPreviewGrid.tsx';
import {
  ProgramAndCompositionWorkspace,
  ProgramMonitorMode,
} from '../../components/obsStudio/ProgramAndCompositionWorkspace.tsx';
import { ControlRoomWorkflowPanel } from '../../components/obsStudio/ControlRoomWorkflowPanel.tsx';
import { BroadcastGuideDrawer, GuideJumpTarget } from '../../components/obsStudio/BroadcastGuideDrawer.tsx';
import { CameraSourceMappingModal } from '../../components/obsStudio/CameraSourceMappingModal.tsx';
import { SavedAdsLibraryPanel } from '../../components/obsGraphics/SavedAdsLibraryPanel.tsx';
import { MatchSetupFormModal } from '../../components/broadcast/MatchSetupFormModal.tsx';
import { LiveStreamPlayer } from '../../components/broadcast/LiveStreamPlayer.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';
import { Modal } from '../../components/common/Modal.tsx';

const LazyGraphicsStudioEditor = React.lazy(
  () => import('../../components/obsGraphics/GraphicsStudioEditor.tsx')
);

type StudioTab = 'live' | 'graphics' | 'cameras' | 'overlay' | 'connection' | 'audit';

function obsStatusBadgeClass(status: ObsConnectionStatus) {
  switch (status) {
    case 'CONNECTED':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'CONNECTING':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'ERROR':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

function cameraStatusBadgeClass(status: CameraConnectionStatus) {
  switch (status) {
    case 'ACTIVE':
      return 'bg-[#EA580C] text-white border-[#EA580C]';
    case 'CONNECTED':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'CONNECTING':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'ERROR':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

export function AdminObsBroadcastStudioPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { adminUser } = useAuth();

  const isBroadcasterPortal = location.pathname.startsWith('/broadcaster');
  const isBroadcasterRole = adminUser?.role === 'BROADCASTER';
  const studioBaseRoute = isBroadcasterPortal ? '/broadcaster/control-room' : '/admin/broadcast-studio';

  const { refreshStreams } = useLiveMonitor();
  const { score: liveMatchScore } = useScoreboard(matchId);

  const [matches, setMatches] = useState<
    Array<
      Pick<
        LiveStreamData,
        'id' | 'matchTitle' | 'teamAName' | 'teamBName' | 'status' | 'broadcastPublished'
      >
    >
  >([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [activeTab, setActiveTab] = useState<StudioTab>('live');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const {
    studio,
    setStudio,
    loading,
    error,
    socketConnected,
    liveErrorToast,
    switchingSceneRequest,
    scheduleRevision,
    clearLiveErrorToast,
    refetch,
  } = useObsStudio(matchId);

  // Busy states
  const [switchingKey, setSwitchingKey] = useState<string | null>(null);
  const [applyingLayout, setApplyingLayout] = useState(false);
  const [testingCamId, setTestingCamId] = useState<string | null>(null);
  const [mutingCamId, setMutingCamId] = useState<string | null>(null);
  const [reconnectingCamId, setReconnectingCamId] = useState<string | null>(null);
  const [disconnectingCamId, setDisconnectingCamId] = useState<string | null>(null);
  const [executingObsAction, setExecutingObsAction] = useState<string | null>(null);
  const [managingSession, setManagingSession] = useState<string | null>(null);
  const [previewSnapshots, setPreviewSnapshots] = useState<Record<string, { imageData: string; capturedAt: string }>>({});
  const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({});
  const [capturingPreviewFor, setCapturingPreviewFor] = useState<string | null>(null);
  const [refreshingAllPreviews, setRefreshingAllPreviews] = useState(false);
  const [capturingProgramPreview, setCapturingProgramPreview] = useState(false);
  const [programSnapshotError, setProgramSnapshotError] = useState<string | null>(null);
  const pollingInFlightRef = useRef(false);
  const programPollingInFlightRef = useRef(false);
  const overlaySliderDebounceRef = useRef<number | null>(null);
  const pendingOverlaySliderRef = useRef<Record<string, unknown>>({});

  // Staged Multi-Cam Composition & Production Desk state (explicit Preview vs Program separation)
  const [stagedCameraIds, setStagedCameraIds] = useState<string[]>([]);
  const [stagedMainCameraId, setStagedMainCameraId] = useState<string>('');
  const [stagedLayoutType, setStagedLayoutType] = useState<ObsLayoutType>('SINGLE');
  const [stagedPipPosition, setStagedPipPosition] = useState<PipPosition>('bottom-right');
  const [stagedPipSize, setStagedPipSize] = useState<PipSize>('medium');
  const [stagedSceneName, setStagedSceneName] = useState<string>('');
  const [stagedIncludeScoreboard, setStagedIncludeScoreboard] = useState<boolean>(true);
  const [quickSwitchMode, setQuickSwitchMode] = useState<boolean>(false);
  const [programMonitorMode, setProgramMonitorMode] = useState<ProgramMonitorMode>('live_video');
  const stagedInitMatchRef = useRef<string | null>(null);

  // Guide Drawer, Source Mapping Modal & Collapsible Advanced OBS Controls
  const [guideOpen, setGuideOpen] = useState(false);
  const [mapSourcesModalOpen, setMapSourcesModalOpen] = useState(false);
  const [discoveredObsInputs, setDiscoveredObsInputs] = useState<ObsDiscoveredInput[]>([]);
  const [showAdvancedObsControls, setShowAdvancedObsControls] = useState(false);

  // Camera modals & Larix/MediaMTX state
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState<BroadcastCameraData | null>(null);
  const [wizardCamera, setWizardCamera] = useState<BroadcastCameraData | null>(null);
  const [wizardConnectUrl, setWizardConnectUrl] = useState<string | null>(null);
  const [larixModalOpen, setLarixModalOpen] = useState(false);
  const [larixTargetCamera, setLarixTargetCamera] = useState<BroadcastCameraData | null>(null);
  const [assigningObsCamId, setAssigningObsCamId] = useState<string | null>(null);
  const [mediamtxConfig, setMediamtxConfig] = useState<MediaMTXConfigPayload | null>(null);
  const [busyMediamtxAction, setBusyMediamtxAction] = useState<string | null>(null);
  const [deleteCameraTarget, setDeleteCameraTarget] = useState<BroadcastCameraData | null>(null);
  const [deletingCamera, setDeletingCamera] = useState(false);
  const [scaffoldingCount, setScaffoldingCount] = useState<number | null>(null);

  // Admin Override modal
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [togglingOverride, setTogglingOverride] = useState(false);

  // Connection tab state
  const [connMode, setConnMode] = useState<'direct_ws' | 'local_agent'>('local_agent');
  const [obsProtocol, setObsProtocol] = useState<'ws' | 'wss'>('ws');
  const [obsHost, setObsHost] = useState('127.0.0.1');
  const [obsPort, setObsPort] = useState('4455');
  const [obsPassword, setObsPassword] = useState('');
  const [vdoRoomName, setVdoRoomName] = useState('');
  const [scoreboardSourceName, setScoreboardSourceName] = useState('MaidanLive Scoreboard');
  const [autoSyncScoreboard, setAutoSyncScoreboard] = useState(true);
  const [savingConn, setSavingConn] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [connectingObs, setConnectingObs] = useState(false);
  const [generatedAgentInfo, setGeneratedAgentInfo] = useState<{
    agentToken: string;
    command: string;
  } | null>(null);
  const [generatingAgentToken, setGeneratingAgentToken] = useState(false);

  // Registered Windows Local OBS Bridges
  const [bridges, setBridges] = useState<ObsBridgeData[]>([]);
  const [loadingBridges, setLoadingBridges] = useState(false);
  const [bridgeNameDraft, setBridgeNameDraft] = useState('');
  const [bridgeLabelDraft, setBridgeLabelDraft] = useState('');
  const [bridgeOwnerDraft, setBridgeOwnerDraft] = useState('');
  const [assignBridgeToCurrentMatch, setAssignBridgeToCurrentMatch] = useState(true);
  const [registeringBridge, setRegisteringBridge] = useState(false);
  const [createdBridgeSecret, setCreatedBridgeSecret] = useState<ObsBridgeTokenResponse | null>(null);
  const [busyBridgeId, setBusyBridgeId] = useState<string | null>(null);
  const [installerStatus, setInstallerStatus] = useState<ObsBridgeInstallerStatus | null>(null);
  const [localBridgeProbe, setLocalBridgeProbe] = useState<LocalBridgeProbeStatus | null>(null);
  const [probingLocalBridge, setProbingLocalBridge] = useState(false);
  const [pairingInfo, setPairingInfo] = useState<ObsBridgePairingResponse | null>(null);
  const [generatingPairing, setGeneratingPairing] = useState(false);
  const [pairingRemainingSec, setPairingRemainingSec] = useState(0);
  const [showAdvancedBridgeSetup, setShowAdvancedBridgeSetup] = useState(false);

  // Overlay & Sponsor tab state
  const [savingOverlay, setSavingOverlay] = useState(false);
  const [savingSponsors, setSavingSponsors] = useState(false);

  // Audit log filter
  const [auditFilter, setAuditFilter] = useState('');

  // Dynamic Scene Items & Friendly Scene Labels
  const [sceneItems, setSceneItems] = useState<ObsSceneItemData[]>([]);
  const [sceneItemsSceneName, setSceneItemsSceneName] = useState('');
  const [loadingSceneItems, setLoadingSceneItems] = useState(false);
  const [refreshingScenes, setRefreshingScenes] = useState(false);
  const [togglingItemId, setTogglingItemId] = useState<number | null>(null);
  const [editingSceneLabels, setEditingSceneLabels] = useState(false);
  const [sceneLabelDrafts, setSceneLabelDrafts] = useState<Record<string, string>>({});
  const [savingSceneLabels, setSavingSceneLabels] = useState(false);

  // Camera Orientation, Preview Fit & OBS SceneItemTransform telemetry
  const [obsTransforms, setObsTransforms] = useState<ObsSceneTransformItem[]>([]);
  const [detectedContentMap, setDetectedContentMap] = useState<Record<string, DetectedFrameContentInfo>>({});
  const [updatingTransformCamId, setUpdatingTransformCamId] = useState<string | null>(null);

  // YouTube Live Output Association, Activation & Match Lifecycle in Control Room
  const [ytInputDraft, setYtInputDraft] = useState('');
  const [ytProviderDraft, setYtProviderDraft] = useState<StreamingProvider>('youtube');
  const [savingYtOutput, setSavingYtOutput] = useState(false);
  const [verifyingYtOutput, setVerifyingYtOutput] = useState(false);
  const [ytVerification, setYtVerification] = useState<YouTubeVerification | null>(null);
  const [showInlineYtPreview, setShowInlineYtPreview] = useState(false);

  const [activatingBroadcast, setActivatingBroadcast] = useState(false);
  const [endingBroadcast, setEndingBroadcast] = useState(false);
  const [togglingScoreboardOnYoutube, setTogglingScoreboardOnYoutube] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [setupModalMode, setSetupModalMode] = useState<'create' | 'edit' | null>(null);
  const [setupEditStream, setSetupEditStream] = useState<LiveStreamData | null>(null);

  // Live Graphics Studio & Saved Advertisement Library state
  const [savedAdDesigns, setSavedAdDesigns] = useState<BroadcastAdDesignData[]>([]);
  const [loadingAdDesigns, setLoadingAdDesigns] = useState(false);
  const [graphicsStudioView, setGraphicsStudioView] = useState<'library' | 'editor'>('library');
  const [editingAdDesign, setEditingAdDesign] = useState<BroadcastAdDesignData | null>(null);
  const [showLiveQuickAds, setShowLiveQuickAds] = useState(false);
  const workspaceTabsRef = useRef<HTMLDivElement | null>(null);

  const jumpToAdsAndGraphics = useCallback(() => {
    setActiveTab('graphics');
    setGraphicsStudioView('library');
    window.setTimeout(() => {
      workspaceTabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, []);

  const loadSavedAdDesigns = useCallback(async () => {
    if (!matchId) return;
    try {
      setLoadingAdDesigns(true);
      const designs = await broadcastGraphicsService.listDesigns({
        matchId,
        tournamentId: studio?.match?.tournamentId || undefined,
        scope: 'all',
      });
      setSavedAdDesigns(designs);
    } catch {
      // Non-blocking initial load
    } finally {
      setLoadingAdDesigns(false);
    }
  }, [matchId, studio?.match?.tournamentId]);

  useEffect(() => {
    loadSavedAdDesigns();
  }, [loadSavedAdDesigns]);

  const handleGraphicsStateChange = useCallback(
    (next: BroadcastGraphicsStateData) => {
      setStudio((prev) => (prev ? { ...prev, graphicsState: next } : prev));
    },
    [setStudio]
  );

  const handleOpenGraphicsEditorNew = useCallback(() => {
    setEditingAdDesign(null);
    setGraphicsStudioView('editor');
    setActiveTab('graphics');
  }, []);

  const handleOpenGraphicsEditorEdit = useCallback((design: BroadcastAdDesignData) => {
    setEditingAdDesign(design);
    setGraphicsStudioView('editor');
    setActiveTab('graphics');
  }, []);

  // Load match selector list (strictly scoped for Broadcasters)
  const loadMatches = useCallback(async () => {
    try {
      setLoadingMatches(true);
      let list: Array<
        Pick<
          LiveStreamData,
          'id' | 'matchTitle' | 'teamAName' | 'teamBName' | 'status' | 'broadcastPublished'
        >
      > = [];
      if (isBroadcasterRole || isBroadcasterPortal) {
        const dash = await obsStudioService.getBroadcasterDashboard();
        list = (dash.matches || []).map((m) => ({
          id: m.id,
          matchTitle: m.matchTitle,
          teamAName: m.teamAName,
          teamBName: m.teamBName,
          status: m.status,
          broadcastPublished: m.broadcastPublished,
        }));
      } else {
        list = await liveStreamService.listStreams();
      }
      setMatches(list);
      if (!matchId && list.length > 0) {
        const preferred =
          list.find((s) => s.status === 'LIVE') ||
          list.find((s) => isMatchPreparedDraft(s)) ||
          list.find((s) => s.status === 'UPCOMING') ||
          list[0];
        navigate(`${studioBaseRoute}/${preferred.id}`, { replace: true });
      }
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to load matches list.'));
    } finally {
      setLoadingMatches(false);
    }
  }, [matchId, navigate, isBroadcasterRole, isBroadcasterPortal, studioBaseRoute]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  const loadBridges = useCallback(async () => {
    try {
      setLoadingBridges(true);
      const res = await obsStudioService.listBridges();
      setBridges(res.bridges || []);
    } catch {
      // Non-blocking
    } finally {
      setLoadingBridges(false);
    }
  }, []);

  const checkInstallerAndLocalBridge = useCallback(async () => {
    try {
      setProbingLocalBridge(true);
      const [inst, probe] = await Promise.all([
        obsStudioService.getBridgeInstallerStatus().catch(() => null),
        obsStudioService.probeLocalBridgeStatus().catch(() => null),
      ]);
      if (inst) setInstallerStatus(inst);
      setLocalBridgeProbe(probe);
    } finally {
      setProbingLocalBridge(false);
    }
  }, []);

  const loadMediaMTXConfig = useCallback(async () => {
    if (!matchId) {
      setMediamtxConfig(null);
      return;
    }
    try {
      const cfg = await obsStudioService.getMediaMTXConfig(matchId);
      setMediamtxConfig(cfg);
    } catch {
      // Non-blocking: VDO.Ninja works independently if MediaMTX is unused
    }
  }, [matchId]);

  useEffect(() => {
    loadBridges();
  }, [loadBridges, studio?.profile?.agentOnline, studio?.profile?.connectionStatus]);

  useEffect(() => {
    checkInstallerAndLocalBridge();
    void loadMediaMTXConfig();
  }, [checkInstallerAndLocalBridge, loadMediaMTXConfig, activeTab]);

  useEffect(() => {
    if (!pairingInfo?.expiresAt) {
      setPairingRemainingSec(0);
      return;
    }
    const updateTick = () => {
      const rem = Math.max(
        0,
        Math.floor((new Date(pairingInfo.expiresAt).getTime() - Date.now()) / 1000)
      );
      setPairingRemainingSec(rem);
    };
    updateTick();
    const id = window.setInterval(updateTick, 1000);
    return () => window.clearInterval(id);
  }, [pairingInfo?.expiresAt]);

  // Sync profile form fields when profile updates
  useEffect(() => {
    const p = studio?.profile;
    if (!p) return;
    setConnMode(p.connectionMode || 'local_agent');
    setObsProtocol(p.obsProtocol || 'ws');
    setObsHost(p.obsHost || '127.0.0.1');
    setObsPort(String(p.obsPort || 4455));
    setVdoRoomName(p.vdoRoomName || '');
    setScoreboardSourceName(p.scoreboardSourceName || 'MaidanLive Scoreboard');
    setAutoSyncScoreboard(p.autoSyncScoreboardSource !== false);
    setSceneLabelDrafts(p.sceneLabels || {});
    if (Array.isArray(p.obsInputs)) {
      setDiscoveredObsInputs(p.obsInputs);
    }
  }, [studio?.profile]);

  // Reset staged initializer when switching matches
  useEffect(() => {
    stagedInitMatchRef.current = null;
    setPreviewSnapshots({});
    setPreviewErrors({});
    setProgramSnapshotError(null);
    setObsTransforms([]);
    setDetectedContentMap({});
  }, [matchId]);

  // Seed staged composition once per match without clobbering user edits during background ticks
  useEffect(() => {
    if (!matchId || !studio?.profile) return;
    if (stagedInitMatchRef.current === matchId) return;
    const p = studio.profile;
    const enabled = (studio.cameras || []).filter((c) => c.enabled);
    if (enabled.length === 0) return;

    const matchedByScene = p.activeObsScene
      ? enabled.filter((c) => c.obsSceneName === p.activeObsScene).map((c) => c.cameraId)
      : [];
    const rawIds =
      p.activeCameraIds && p.activeCameraIds.length > 0
        ? p.activeCameraIds
        : p.activeCameraId
          ? [p.activeCameraId]
          : matchedByScene.length > 0
            ? matchedByScene
            : [enabled[0].cameraId];
    const validIds = rawIds.filter((id) => enabled.some((c) => c.cameraId === id));
    const seedIds = validIds.length > 0 ? validIds : [enabled[0].cameraId];
    setStagedCameraIds(seedIds);
    setStagedMainCameraId(
      p.activeCameraId && seedIds.includes(p.activeCameraId) ? p.activeCameraId : seedIds[0] || ''
    );
    setStagedLayoutType(p.activeLayoutType || 'SINGLE');
    setStagedPipPosition(p.activePipPosition || 'bottom-right');
    setStagedPipSize(p.activePipSize || 'medium');
    setStagedIncludeScoreboard(p.autoSyncScoreboardSource !== false);
    stagedInitMatchRef.current = matchId;
  }, [matchId, studio?.profile, studio?.cameras]);

  useEffect(() => {
    if (!studio?.match) return;
    setYtInputDraft(studio.match.youtubeVideoId || '');
    setYtProviderDraft(studio.match.activeStreamingProvider || 'youtube');
    setYtVerification(null);
  }, [studio?.match?.id, studio?.match?.youtubeVideoId, studio?.match?.activeStreamingProvider]);

  function notifySuccess(msg: string) {
    setActionError(null);
    setActionSuccess(msg);
    window.setTimeout(() => setActionSuccess(null), 4000);
  }

  function copyText(key: string, val: string) {
    if (!val) return;
    navigator.clipboard?.writeText(val).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1800);
  }

  const profile = studio?.profile || null;
  const cameras = studio?.cameras || [];
  const scenes = studio?.scenes || [];
  const obsConnected = profile?.connectionStatus === 'CONNECTED';
  const canManageCameras = studio?.permissions?.canManageCameras !== false;
  const canManageOverlays = studio?.permissions?.canManageOverlays !== false;
  const canControlStream = studio?.permissions?.canControlStream !== false;
  const canControlRecord = studio?.permissions?.canControlRecord !== false;
  const enabledCameras = useMemo(() => cameras.filter((c) => c.enabled), [cameras]);
  const onlineCameraCount = useMemo(
    () => cameras.filter((c) => c.enabled && (c.status === 'CONNECTED' || c.status === 'ACTIVE')).length,
    [cameras]
  );

  // Camera CRUD handlers
  async function handleSaveCamera(payload: Partial<BroadcastCameraData> & { expiresInHours?: number }) {
    if (!matchId) return;
    try {
      setActionError(null);
      if (editingCamera) {
        await obsStudioService.updateCamera(matchId, editingCamera.cameraId, payload);
        notifySuccess(`Updated ${editingCamera.name}.`);
      } else {
        const res = await obsStudioService.createCamera(matchId, payload);
        if (res.camera.sourceType === 'mediamtx') {
          setLarixTargetCamera(res.camera);
          setLarixModalOpen(true);
          notifySuccess(`Created Larix camera ${res.camera.name} — scan QR or copy RTMP/SRT credentials.`);
        } else {
          setWizardCamera(res.camera);
          setWizardConnectUrl(res.mobileConnectUrl);
          notifySuccess(`Created ${res.camera.name} — scan QR or copy mobile setup link.`);
        }
      }
      await refetch();
      void loadMediaMTXConfig();
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to save camera.'));
      throw err;
    }
  }

  async function handleCreateLarixCamera(payload: {
    name?: string;
    label: string;
    position?: string;
    streamProtocol: 'rtmp' | 'srt';
    obsSceneName?: string;
    obsInputName?: string;
    resolution?: BroadcastCameraData['resolution'];
    fps?: number;
    bitrateKbps?: number;
  }): Promise<BroadcastCameraData> {
    if (!matchId) throw new Error('Match ID is missing.');
    const res = await obsStudioService.createCamera(matchId, {
      ...payload,
      cameraType: 'rtmp_mediamtx',
      sourceType: 'mediamtx',
    });
    notifySuccess(
      `Provisioned Larix camera "${res.camera.label || res.camera.name}" (${payload.streamProtocol.toUpperCase()}).`
    );
    await refetch();
    void loadMediaMTXConfig();
    return res.camera;
  }

  async function handleSwitchLarixProtocol(
    cam: BroadcastCameraData,
    protocol: 'rtmp' | 'srt'
  ): Promise<BroadcastCameraData> {
    if (!matchId) throw new Error('Match ID is missing.');
    const res = await obsStudioService.updateCamera(matchId, cam.cameraId, {
      streamProtocol: protocol,
    });
    notifySuccess(`Switched ${cam.name} to Larix ${protocol.toUpperCase()}.`);
    await refetch();
    void loadMediaMTXConfig();
    return res.camera;
  }

  async function handleRotateLarixCredentials(
    cam: BroadcastCameraData,
    syncObs = true
  ): Promise<BroadcastCameraData> {
    if (!matchId) throw new Error('Match ID is missing.');
    const res = await obsStudioService.rotateLarixCredentials(
      matchId,
      cam.cameraId,
      syncObs,
      Boolean(profile?.adminOverrideLocked)
    );
    notifySuccess(`Regenerated Larix stream key for ${cam.name}.`);
    await refetch();
    void loadMediaMTXConfig();
    return res.camera;
  }

  async function handleRevokeLarixCredentials(
    cam: BroadcastCameraData
  ): Promise<BroadcastCameraData> {
    if (!matchId) throw new Error('Match ID is missing.');
    const res = await obsStudioService.revokeLarixCredentials(matchId, cam.cameraId);
    notifySuccess(`Revoked Larix stream key for ${cam.name}.`);
    await refetch();
    void loadMediaMTXConfig();
    return res.camera;
  }

  async function handleAssignCameraToObs(cam: BroadcastCameraData) {
    if (!matchId) return;
    try {
      setAssigningObsCamId(cam.cameraId);
      setActionError(null);
      const res = await obsStudioService.assignCameraToObs(
        matchId,
        cam.cameraId,
        Boolean(profile?.adminOverrideLocked)
      );
      notifySuccess(res.detail || `Synced ${cam.name} source into OBS Studio.`);
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, `Failed to create/sync OBS source for ${cam.name}.`));
    } finally {
      setAssigningObsCamId(null);
    }
  }

  async function handleControlMediaMTX(action: 'status' | 'start' | 'stop' | 'sync_config') {
    if (!matchId) return;
    try {
      setBusyMediamtxAction(action);
      setActionError(null);
      await obsStudioService.controlMediaMTX(matchId, action);
      const labels: Record<typeof action, string> = {
        status: 'Checked local MediaMTX status via OBS Bridge.',
        start: 'Started local MediaMTX receiver via OBS Bridge.',
        stop: 'Stopped local MediaMTX receiver.',
        sync_config: 'Synced MediaMTX configuration from server.',
      };
      notifySuccess(labels[action]);
      await refetch();
      await loadMediaMTXConfig();
    } catch (err) {
      setActionError(extractApiError(err, `MediaMTX action (${action}) failed.`));
    } finally {
      setBusyMediamtxAction(null);
    }
  }

  async function handleScaffoldCameras(count: number) {
    if (!matchId) return;
    try {
      setScaffoldingCount(count);
      setActionError(null);
      const res = await obsStudioService.scaffoldCameras(matchId, count);
      notifySuccess(`Added ${res.created.length} smartphone cameras.`);
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to add multiple cameras.'));
    } finally {
      setScaffoldingCount(null);
    }
  }

  async function handleDeleteCamera() {
    if (!matchId || !deleteCameraTarget) return;
    try {
      setDeletingCamera(true);
      await obsStudioService.deleteCamera(matchId, deleteCameraTarget.cameraId);
      setDeleteCameraTarget(null);
      notifySuccess(`Removed ${deleteCameraTarget.name}.`);
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to remove camera.'));
    } finally {
      setDeletingCamera(false);
    }
  }

  async function handleMoveCamera(index: number, delta: -1 | 1) {
    if (!matchId) return;
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= cameras.length) return;
    const reordered = [...cameras];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(nextIdx, 0, moved);
    try {
      await obsStudioService.reorderCameras(
        matchId,
        reordered.map((c) => c.cameraId)
      );
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to reorder cameras.'));
    }
  }

  async function handleToggleCameraField(
    cam: BroadcastCameraData,
    patch: Partial<BroadcastCameraData>,
    message: string
  ) {
    if (!matchId) return;
    try {
      await obsStudioService.updateCamera(matchId, cam.cameraId, patch);
      notifySuccess(message);
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to update camera.'));
    }
  }

  async function handleRotatePhoneLink(cameraId: string, expiresInHours = 12) {
    if (!matchId) return;
    try {
      const res = await obsStudioService.rotateCameraToken(matchId, cameraId, expiresInHours);
      setWizardConnectUrl(res.mobileConnectUrl);
      notifySuccess('Generated fresh scoped smartphone setup QR link.');
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to generate smartphone link.'));
    }
  }

  async function handleToggleCameraAudio(cam: BroadcastCameraData) {
    if (!matchId) return;
    const currentlyMuted = Boolean(cam.obsInputMuted ?? cam.audioMuted ?? cam.telemetry?.audioMuted);
    try {
      setMutingCamId(cam.cameraId);
      setActionError(null);
      const res = await obsStudioService.setCameraAudioMute(
        matchId,
        cam.cameraId,
        !currentlyMuted,
        Boolean(profile?.adminOverrideLocked)
      );
      notifySuccess(
        res.obsSynced
          ? `${cam.name} audio ${!currentlyMuted ? 'muted' : 'unmuted'} in OBS Studio.`
          : `${cam.name} audio preference saved (${res.obsNote || 'OBS not synced'}).`
      );
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, `Failed to toggle audio for ${cam.name}.`));
    } finally {
      setMutingCamId(null);
    }
  }

  async function handleDisconnectCamera(cam: BroadcastCameraData) {
    if (!matchId) return;
    try {
      setDisconnectingCamId(cam.cameraId);
      setActionError(null);
      await obsStudioService.disconnectCamera(matchId, cam.cameraId);
      notifySuccess(`Disconnected ${cam.name}.`);
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, `Failed to disconnect ${cam.name}.`));
    } finally {
      setDisconnectingCamId(null);
    }
  }

  async function handleReconnectCamera(cam: BroadcastCameraData) {
    if (!matchId) return;
    try {
      setReconnectingCamId(cam.cameraId);
      setActionError(null);
      const res = await obsStudioService.reconnectCamera(
        matchId,
        cam.cameraId,
        Boolean(profile?.adminOverrideLocked)
      );
      if (res.ok) {
        notifySuccess(`${cam.label || cam.name}: ${res.detail}`);
      } else {
        setActionError(`${cam.label || cam.name}: ${res.detail}`);
      }
      await refetch();
      if (obsConnected) {
        await handleCaptureSourcePreview(cam, { silent: true });
      }
    } catch (err) {
      setActionError(extractApiError(err, `Failed to reconnect ${cam.name}.`));
    } finally {
      setReconnectingCamId(null);
    }
  }

  async function handleObsOutputAction(action: 'start_stream' | 'stop_stream' | 'start_record' | 'stop_record') {
    if (!matchId) return;
    try {
      setExecutingObsAction(action);
      setActionError(null);
      await obsStudioService.executeObsAction(matchId, action, Boolean(profile?.adminOverrideLocked));
      const labels: Record<typeof action, string> = {
        start_stream: 'OBS Stream started.',
        stop_stream: 'OBS Stream stopped.',
        start_record: 'OBS Recording started.',
        stop_record: 'OBS Recording stopped.',
      };
      notifySuccess(labels[action]);
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, `OBS refused command: ${action}.`));
    } finally {
      setExecutingObsAction(null);
    }
  }

  async function handleManageSession(mode: 'start' | 'end' | 'takeover') {
    if (!matchId) return;
    try {
      setManagingSession(mode);
      setActionError(null);
      await obsStudioService.manageSession(matchId, mode);
      notifySuccess(
        mode === 'start'
          ? 'Broadcast production session started.'
          : mode === 'end'
            ? 'Broadcast production session ended.'
            : 'Active controller presence updated.'
      );
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to update broadcast session.'));
    } finally {
      setManagingSession(null);
    }
  }

  async function handleTestCamera(cam: BroadcastCameraData) {
    if (!matchId) return;
    try {
      setTestingCamId(cam.cameraId);
      setActionError(null);
      const res = await obsStudioService.testCamera(matchId, cam.cameraId);
      if (res.ok) {
        notifySuccess(`${cam.name}: ${res.detail}`);
      } else {
        setActionError(`${cam.name}: ${res.detail}`);
      }
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, `Failed to test ${cam.name}.`));
    } finally {
      setTestingCamId(null);
    }
  }

  // Live OBS switching
  async function handleSwitchCamera(cam: BroadcastCameraData) {
    if (!matchId) return;
    try {
      setSwitchingKey(`cam:${cam.cameraId}`);
      setActionError(null);
      await obsStudioService.switchCamera(matchId, cam.cameraId, Boolean(profile?.adminOverrideLocked));
      notifySuccess(`OBS switched live program to ${cam.name} (${cam.label}).`);
      await refetch();
      void loadSceneTransforms(cam.obsSceneName || '');
      void handleCaptureActiveScenePreview({ background: true });
    } catch (err) {
      setActionError(extractApiError(err, `OBS refused camera switch for ${cam.name}.`));
    } finally {
      setSwitchingKey(null);
    }
  }

  async function handleSwitchSceneName(sceneName: string) {
    if (!matchId) return;
    try {
      setSwitchingKey(`scene:${sceneName}`);
      setActionError(null);
      await obsStudioService.switchScene(matchId, sceneName, Boolean(profile?.adminOverrideLocked));
      notifySuccess(`OBS Program scene set to "${sceneName}".`);
      await refetch();
      void loadSceneTransforms(sceneName);
      void handleCaptureActiveScenePreview({ background: true });
    } catch (err) {
      setActionError(extractApiError(err, `Failed to switch OBS scene to "${sceneName}".`));
    } finally {
      setSwitchingKey(null);
    }
  }

  async function handleApplyLayout(payload: {
    layoutType: ObsLayoutType;
    cameraIds: string[];
    mainCameraId?: string;
    pipPosition?: PipPosition;
    pipSize?: PipSize;
    sceneName?: string;
    includeScoreboardOverlay: boolean;
  }) {
    if (!matchId) return;
    try {
      setApplyingLayout(true);
      setActionError(null);
      const res = await obsStudioService.applyLayout(matchId, {
        ...payload,
        override: Boolean(profile?.adminOverrideLocked),
      });
      notifySuccess(
        `Applied ${payload.layoutType} across ${payload.cameraIds.length} cameras in OBS (${res.sceneName || payload.sceneName || ''}).`
      );
      await refetch();
      void loadSceneTransforms(res.sceneName || payload.sceneName || '');
      void handleCaptureActiveScenePreview({ background: true });
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to apply multi-camera layout in OBS.'));
    } finally {
      setApplyingLayout(false);
    }
  }

  async function handleSaveScenePreset(payload: {
    name: string;
    obsSceneName: string;
    layoutType: ObsLayoutType;
    cameraIds: string[];
    mainCameraId?: string;
    pipPosition?: PipPosition;
    pipSize?: PipSize;
    includeScoreboardOverlay: boolean;
  }) {
    if (!matchId) return;
    try {
      setActionError(null);
      await obsStudioService.createScene(matchId, payload);
      notifySuccess(`Saved scene preset "${payload.name}".`);
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to save scene preset.'));
    }
  }

  async function handleCaptureSourcePreview(
    cam: BroadcastCameraData,
    options: { silent?: boolean; background?: boolean } = {}
  ) {
    if (!matchId) return;
    const isPrimary =
      profile?.activeCameraId === cam.cameraId ||
      Boolean(cam.obsSceneName && profile?.activeObsScene === cam.obsSceneName);
    const candidates = Array.from(
      new Set(
        [
          cam.obsInputName,
          cam.obsSceneName,
          cam.name,
          isPrimary ? profile?.activeObsScene : '',
        ]
          .map((s) => String(s || '').trim())
          .filter(Boolean)
      )
    );
    const sourceName = candidates[0] || cam.name;
    const fallbackSourceNames = candidates.slice(1);
    try {
      if (!options.background) setCapturingPreviewFor(cam.cameraId);
      if (!options.silent) setActionError(null);
      const res = await obsStudioService.capturePreview(matchId, sourceName, fallbackSourceNames);
      setPreviewSnapshots((prev) => ({
        ...prev,
        [cam.cameraId]: {
          imageData: res.imageData,
          capturedAt: new Date().toLocaleTimeString(),
        },
      }));
      setPreviewErrors((prev) => {
        if (!prev[cam.cameraId]) return prev;
        const next = { ...prev };
        delete next[cam.cameraId];
        return next;
      });
    } catch (err) {
      const msg = extractApiError(err, `OBS could not capture frame for "${sourceName}".`);
      setPreviewErrors((prev) => ({ ...prev, [cam.cameraId]: msg }));
      if (!options.silent) setActionError(msg);
    } finally {
      if (!options.background) setCapturingPreviewFor(null);
    }
  }

  async function handleCaptureActiveScenePreview(options: { background?: boolean } = {}) {
    if (!matchId || !obsConnected || !profile?.activeObsScene) return;
    if (options.background && (programPollingInFlightRef.current || document.visibilityState === 'hidden')) {
      return;
    }
    programPollingInFlightRef.current = true;
    try {
      if (!options.background) setCapturingProgramPreview(true);
      const res = await obsStudioService.capturePreview(matchId, profile.activeObsScene);
      setPreviewSnapshots((prev) => ({
        ...prev,
        __active_scene__: {
          imageData: res.imageData,
          capturedAt: new Date().toLocaleTimeString(),
        },
      }));
      setProgramSnapshotError(null);
    } catch (err) {
      setProgramSnapshotError(
        extractApiError(err, `Could not capture program preview for "${profile.activeObsScene}".`)
      );
    } finally {
      programPollingInFlightRef.current = false;
      if (!options.background) setCapturingProgramPreview(false);
    }
  }

  const captureProgramPreviewRef = useRef(handleCaptureActiveScenePreview);
  captureProgramPreviewRef.current = handleCaptureActiveScenePreview;

  const programUsesLiveWebRtc = useMemo(() => {
    if (!obsConnected || !profile || programMonitorMode !== 'live_video') return false;
    const activeIds = new Set<string>(profile.activeCameraIds || []);
    if (profile.activeCameraId) activeIds.add(profile.activeCameraId);
    const activeCams = enabledCameras.filter(
      (c) =>
        activeIds.has(c.cameraId) ||
        (c.obsSceneName && profile.activeObsScene && c.obsSceneName === profile.activeObsScene)
    );
    return (
      activeCams.length > 0 &&
      activeCams.every((c) => Boolean(c.obsBrowserSourceUrl || (c.connectionUrl && /^https?:\/\//i.test(c.connectionUrl))))
    );
  }, [obsConnected, profile, enabledCameras, programMonitorMode]);

  // Independent continuous auto-polling for PROGRAM OUTPUT (never disabled by grid preview mode)
  useEffect(() => {
    if (!matchId || !obsConnected || !profile?.activeObsScene || activeTab !== 'live') return;

    let timerId: number | null = null;
    const intervalMs = programUsesLiveWebRtc ? 4500 : 1000;

    const triggerCapture = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void captureProgramPreviewRef.current({ background: true });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerCapture();
      }
    };

    triggerCapture();
    timerId = window.setInterval(triggerCapture, intervalMs);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      if (timerId !== null) window.clearInterval(timerId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [matchId, obsConnected, profile?.activeObsScene, activeTab, programUsesLiveWebRtc]);

  async function handleRefreshAllPreviews(
    targetCameras: BroadcastCameraData[],
    options: { background?: boolean } = {}
  ) {
    if (!matchId || !obsConnected || targetCameras.length === 0) return;
    if (options.background && (pollingInFlightRef.current || document.visibilityState === 'hidden')) {
      return;
    }
    pollingInFlightRef.current = true;
    try {
      if (!options.background) setRefreshingAllPreviews(true);
      const queue = [...targetCameras];
      const concurrency = Math.min(2, queue.length);
      const workers = Array.from({ length: concurrency }, async () => {
        while (queue.length > 0) {
          if (options.background && document.visibilityState === 'hidden') break;
          const cam = queue.shift();
          if (!cam) break;
          await handleCaptureSourcePreview(cam, { silent: true, background: options.background });
        }
      });
      await Promise.all(workers);
    } finally {
      pollingInFlightRef.current = false;
      if (!options.background) setRefreshingAllPreviews(false);
    }
  }

  function handleToggleSelectCamera(cam: BroadcastCameraData) {
    setStagedCameraIds((prev) => {
      const exists = prev.includes(cam.cameraId);
      const next = exists ? prev.filter((id) => id !== cam.cameraId) : [...prev, cam.cameraId];
      setStagedMainCameraId((currMain) => {
        if (!exists && !currMain) return cam.cameraId;
        if (exists && currMain === cam.cameraId) return next[0] || '';
        return currMain;
      });
      if (!exists && next.length === 2 && stagedLayoutType === 'SINGLE') {
        setStagedLayoutType('SPLIT_2_H');
      } else if (next.length <= 1 && stagedLayoutType !== 'SINGLE' && stagedLayoutType !== 'SPORT_BROADCAST') {
        setStagedLayoutType('SINGLE');
      }
      return next;
    });
  }

  async function handleApplyStagedComposition() {
    if (stagedCameraIds.length === 0) return;
    await handleApplyLayout({
      layoutType: stagedLayoutType,
      cameraIds: stagedCameraIds,
      mainCameraId: stagedMainCameraId || stagedCameraIds[0],
      pipPosition: stagedLayoutType === 'PIP' ? stagedPipPosition : undefined,
      pipSize: stagedLayoutType === 'PIP' ? stagedPipSize : undefined,
      sceneName: stagedSceneName.trim() || undefined,
      includeScoreboardOverlay: stagedIncludeScoreboard,
    });
  }

  async function handleRefreshObsInputs(): Promise<ObsDiscoveredInput[]> {
    if (!matchId) return [];
    try {
      const res = await obsStudioService.listObsInputs(matchId);
      const list = res.inputs || [];
      setDiscoveredObsInputs(list);
      return list;
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to discover OBS inputs.'));
      return discoveredObsInputs;
    }
  }

  async function handleSaveCameraMappings(
    mappings: Array<{
      cameraId?: string;
      obsInputName: string;
      displayName: string;
      obsSceneName?: string;
      inputKind?: string;
      isCamera: boolean;
    }>
  ) {
    if (!matchId) return;
    try {
      setActionError(null);
      const res = await obsStudioService.mapCameraSources(matchId, mappings);
      notifySuccess(
        `Saved camera mappings (${res.mappedCount} mapped, ${res.createdCount} created).`
      );
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to save OBS camera source mappings.'));
      throw err;
    }
  }

  function handleGuideJump(target: GuideJumpTarget) {
    if (target === 'map_sources') {
      setActiveTab('live');
      setMapSourcesModalOpen(true);
      return;
    }
    setActiveTab(target);
  }

  const loadSceneTransforms = useCallback(
    async (targetScene = '') => {
      if (!matchId || !obsConnected) {
        setObsTransforms([]);
        return;
      }
      try {
        const res = await obsStudioService.getSceneTransforms(matchId, targetScene);
        setObsTransforms(res.transforms || []);
      } catch {
        // Keep last known transforms silently if bridge temporarily skips
      }
    },
    [matchId, obsConnected]
  );

  const handleFrameContentDetected = useCallback(
    (cameraKey: string, info: DetectedFrameContentInfo) => {
      setDetectedContentMap((prev) => {
        const existing = prev[cameraKey];
        if (
          existing &&
          existing.orientation === info.orientation &&
          Math.abs(existing.activeWidth - info.activeWidth) < 8 &&
          Math.abs(existing.activeHeight - info.activeHeight) < 8 &&
          existing.frameWidth === info.frameWidth &&
          existing.frameHeight === info.frameHeight
        ) {
          return prev;
        }
        return { ...prev, [cameraKey]: info };
      });
    },
    []
  );

  async function handleUpdateCameraFraming(
    cam: BroadcastCameraData,
    patch: {
      orientationMode?: CameraOrientationMode;
      previewFit?: CameraPreviewFit;
      portraitBackdropFill?: boolean;
    }
  ) {
    if (!matchId) return;
    try {
      setUpdatingTransformCamId(cam.cameraId);
      setActionError(null);
      const res = await obsStudioService.updateCameraTransform(matchId, cam.cameraId, {
        ...patch,
        override: Boolean(profile?.adminOverrideLocked),
      });
      notifySuccess(
        res.obsSynced
          ? `Updated ${cam.name} framing & synced OBS scene transform (${res.updatedScenes?.join(', ') || 'active scene'}).`
          : `Saved ${cam.name} framing preference (syncs to OBS when connected).`
      );
      await refetch();
      void loadSceneTransforms(profile?.activeObsScene || '');
      void handleCaptureActiveScenePreview({ background: true });
      if (obsConnected) {
        void handleCaptureSourcePreview(cam, { silent: true, background: true });
      }
    } catch (err) {
      setActionError(extractApiError(err, `Failed to update camera framing for ${cam.name}.`));
    } finally {
      setUpdatingTransformCamId(null);
    }
  }

  async function handleSyncObsState() {
    if (!matchId) return;
    try {
      setRefreshingScenes(true);
      setActionError(null);
      await obsStudioService.refreshScenes(matchId);
      notifySuccess('Refreshed live OBS scenes and telemetry.');
      await refetch();
      await loadSceneItems(profile?.activeObsScene || '');
      void loadSceneTransforms(profile?.activeObsScene || '');
    } catch (err) {
      setActionError(extractApiError(err, 'OBS Studio is not connected.'));
    } finally {
      setRefreshingScenes(false);
    }
  }

  const loadSceneItems = useCallback(
    async (targetScene = '') => {
      if (!matchId || !obsConnected) {
        setSceneItems([]);
        return;
      }
      try {
        setLoadingSceneItems(true);
        const res = await obsStudioService.getSceneItems(matchId, targetScene);
        setSceneItems(res.items || []);
        setSceneItemsSceneName(res.sceneName || targetScene);
      } catch {
        setSceneItems([]);
      } finally {
        setLoadingSceneItems(false);
      }
    },
    [matchId, obsConnected]
  );

  useEffect(() => {
    if (obsConnected && activeTab === 'live') {
      loadSceneItems(profile?.activeObsScene || '');
      loadSceneTransforms(profile?.activeObsScene || '');
    } else if (!obsConnected) {
      setSceneItems([]);
      setObsTransforms([]);
    }
  }, [obsConnected, activeTab, profile?.activeObsScene, loadSceneItems, loadSceneTransforms]);

  async function handleToggleSceneItem(item: ObsSceneItemData) {
    if (!matchId || !sceneItemsSceneName) return;
    try {
      setTogglingItemId(item.sceneItemId);
      setActionError(null);
      const nextEnabled = !item.sceneItemEnabled;
      const res = await obsStudioService.toggleSceneItem(matchId, {
        sceneName: sceneItemsSceneName,
        sceneItemId: item.sceneItemId,
        sourceName: item.sourceName,
        enabled: nextEnabled,
        override: Boolean(profile?.adminOverrideLocked),
      });
      setSceneItems((prev) =>
        prev.map((s) =>
          s.sceneItemId === item.sceneItemId ? { ...s, sceneItemEnabled: res.sceneItemEnabled } : s
        )
      );
      notifySuccess(`Source "${item.sourceName}" ${res.sceneItemEnabled ? 'shown' : 'hidden'} in OBS.`);
    } catch (err) {
      setActionError(extractApiError(err, `Failed to toggle source "${item.sourceName}".`));
    } finally {
      setTogglingItemId(null);
    }
  }

  async function handleSaveSceneLabels() {
    if (!matchId) return;
    try {
      setSavingSceneLabels(true);
      setActionError(null);
      await obsStudioService.updateProfile(matchId, { sceneLabels: sceneLabelDrafts });
      setEditingSceneLabels(false);
      notifySuccess('Friendly OBS scene labels saved.');
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to save scene labels.'));
    } finally {
      setSavingSceneLabels(false);
    }
  }

  async function handleSaveYouTubeOutput(e?: React.FormEvent, verifyAfterSave = true) {
    e?.preventDefault();
    if (!matchId) return;
    try {
      setSavingYtOutput(true);
      setVerifyingYtOutput(verifyAfterSave && ytProviderDraft === 'youtube');
      setActionError(null);
      const res = await liveStreamService.connectYouTube(matchId, {
        ...(ytInputDraft.trim() ? { youtubeInput: ytInputDraft.trim() } : { youtubeInput: '' }),
        activeStreamingProvider: ytProviderDraft,
        verify: verifyAfterSave && ytProviderDraft === 'youtube' && Boolean(ytInputDraft.trim()),
      });
      setYtVerification(res.verification || null);
      notifySuccess(
        `Broadcast output updated (${res.stream.activeStreamingProvider === 'youtube' ? 'YouTube Live' : 'MediaMTX Direct'}${res.stream.youtubeVideoId ? ` · ID: ${res.stream.youtubeVideoId}` : ''}).`
      );
      await Promise.all([refetch(), loadMatches()]);
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to save YouTube Live output settings.'));
    } finally {
      setSavingYtOutput(false);
      setVerifyingYtOutput(false);
    }
  }

  async function handleToggleScoreboardOnYoutube(nextVal: boolean) {
    if (!matchId || !studio?.match) return;
    const prevVal = studio.match.showScoreboardOnYoutube !== false;
    setStudio((prev) =>
      prev ? { ...prev, match: { ...prev.match, showScoreboardOnYoutube: nextVal } } : prev
    );
    try {
      setTogglingScoreboardOnYoutube(true);
      setActionError(null);
      await liveStreamService.updateStream(matchId, { showScoreboardOnYoutube: nextVal });
      notifySuccess(
        nextVal
          ? 'Scoreboard on YouTube enabled — visible in OBS/YouTube Live and MaidanLive.'
          : 'Scoreboard on YouTube disabled — scoreboard now renders only inside MaidanLive embedded video.'
      );
      await Promise.all([refetch(), refreshStreams()]);
    } catch (err) {
      setStudio((prev) =>
        prev ? { ...prev, match: { ...prev.match, showScoreboardOnYoutube: prevVal } } : prev
      );
      setActionError(extractApiError(err, 'Failed to update Scoreboard on YouTube setting.'));
    } finally {
      setTogglingScoreboardOnYoutube(false);
    }
  }

  async function handleActivateBroadcast() {
    if (!matchId) return;
    try {
      setActivatingBroadcast(true);
      setActionError(null);
      await liveStreamService.activateBroadcast(matchId, {
        activeStreamingProvider: ytProviderDraft,
        ...(ytInputDraft.trim() ? { youtubeInput: ytInputDraft.trim() } : {}),
      });
      notifySuccess('MaidanLive Broadcast activated and published to the Player Portal!');
      await Promise.all([refetch(), loadMatches(), refreshStreams()]);
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to activate broadcast.'));
    } finally {
      setActivatingBroadcast(false);
    }
  }

  async function handleConfirmEndBroadcast() {
    if (!matchId) return;
    try {
      setEndingBroadcast(true);
      setActionError(null);
      const res = await liveStreamService.endStream(matchId);
      await offlineScoreQueue.clearStream(matchId).catch(() => {});
      setEndConfirmOpen(false);
      notifySuccess(
        res.note ||
          'MaidanLive broadcast ended cleanly. Final scores preserved — click Initialize Next Match to start a new match.'
      );
      await Promise.all([refetch(), loadMatches(), refreshStreams()]);
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to end broadcast.'));
    } finally {
      setEndingBroadcast(false);
    }
  }

  async function openEditMatchSetupModal() {
    if (!matchId) return;
    try {
      const full = await liveStreamService.getStreamById(matchId);
      setSetupEditStream(full);
      setSetupModalMode('edit');
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to load match metadata for editing.'));
    }
  }

  function openNewMatchSetupModal() {
    setSetupEditStream(null);
    setSetupModalMode('create');
  }

  // Connection handlers
  async function handleSaveConnectionSettings(e?: React.FormEvent) {
    e?.preventDefault();
    if (!matchId) return;
    try {
      setSavingConn(true);
      setActionError(null);
      await obsStudioService.updateProfile(matchId, {
        connectionMode: connMode,
        obsProtocol,
        obsHost: obsHost.trim() || '127.0.0.1',
        obsPort: Number(obsPort) || 4455,
        ...(obsPassword ? { obsPassword } : {}),
        vdoRoomName: vdoRoomName.trim(),
        scoreboardSourceName: scoreboardSourceName.trim() || 'MaidanLive Scoreboard',
        autoSyncScoreboardSource: autoSyncScoreboard,
      });
      setObsPassword('');
      notifySuccess('OBS Studio connection & room settings saved.');
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to save OBS connection settings.'));
    } finally {
      setSavingConn(false);
    }
  }

  async function handleTestObsConnection() {
    if (!matchId) return;
    try {
      setTestingConn(true);
      setActionError(null);
      const res = await obsStudioService.testConnection(matchId, {
        obsProtocol,
        obsHost: obsHost.trim() || '127.0.0.1',
        obsPort: Number(obsPort) || 4455,
        ...(obsPassword ? { obsPassword } : {}),
      });
      if (res.ok) {
        notifySuccess(res.message);
      } else {
        setActionError(res.message);
      }
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, 'OBS connection test failed.'));
    } finally {
      setTestingConn(false);
    }
  }

  async function handleConnectObs() {
    if (!matchId) return;
    try {
      setConnectingObs(true);
      setActionError(null);
      await obsStudioService.updateProfile(matchId, {
        connectionMode: connMode,
        obsProtocol,
        obsHost: obsHost.trim() || '127.0.0.1',
        obsPort: Number(obsPort) || 4455,
        ...(obsPassword ? { obsPassword } : {}),
      });
      setObsPassword('');
      await obsStudioService.connectObs(matchId, connMode);
      notifySuccess(
        connMode === 'local_agent'
          ? 'Synced live state from Local OBS Controller Agent.'
          : 'Connected to OBS Studio via WebSocket v5.'
      );
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, 'Could not connect to OBS Studio.'));
      await refetch();
    } finally {
      setConnectingObs(false);
    }
  }

  async function handleDisconnectObs() {
    if (!matchId) return;
    try {
      setConnectingObs(true);
      await obsStudioService.disconnectObs(matchId);
      notifySuccess('Disconnected from OBS Studio.');
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to disconnect OBS.'));
    } finally {
      setConnectingObs(false);
    }
  }

  async function handleGenerateAgentToken() {
    if (!matchId) return;
    try {
      setGeneratingAgentToken(true);
      setActionError(null);
      const res = await obsStudioService.generateAgentToken(matchId);
      setGeneratedAgentInfo({ agentToken: res.agentToken, command: res.command });
      setConnMode('local_agent');
      notifySuccess('New Local OBS Agent token generated. Run the command on your OBS laptop.');
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to generate agent token.'));
    } finally {
      setGeneratingAgentToken(false);
    }
  }

  function downloadBridgeConfigJson(resp: ObsBridgeTokenResponse) {
    try {
      const blob = new Blob([JSON.stringify(resp.configJson, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'config.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      copyText('bridgeConfigJson', JSON.stringify(resp.configJson, null, 2));
    }
  }

  async function handleRegisterBridge(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = bridgeNameDraft.trim() || 'Windows OBS Bridge';
    try {
      setRegisteringBridge(true);
      setActionError(null);
      const res = await obsStudioService.registerBridge({
        name: cleanName,
        label: bridgeLabelDraft.trim() || cleanName,
        ownerUserId: bridgeOwnerDraft || undefined,
        tournamentId: studio?.match?.tournamentId || undefined,
        assignedMatchIds: assignBridgeToCurrentMatch && matchId ? [matchId] : [],
      });
      setCreatedBridgeSecret(res);
      setBridgeNameDraft('');
      setBridgeLabelDraft('');
      setConnMode('local_agent');
      notifySuccess(`Registered Bridge ${res.bridge.bridgeId}. Save or download config.json on your OBS laptop.`);
      await loadBridges();
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to register Windows OBS bridge.'));
    } finally {
      setRegisteringBridge(false);
    }
  }

  async function handleToggleBridgeMatch(bridge: ObsBridgeData) {
    if (!matchId) return;
    const assigned = bridge.assignedMatchIds.includes(matchId);
    const nextMatchIds = assigned
      ? bridge.assignedMatchIds.filter((id) => id !== matchId)
      : [...bridge.assignedMatchIds, matchId];
    try {
      setBusyBridgeId(bridge.bridgeId);
      setActionError(null);
      await obsStudioService.updateBridge(bridge.bridgeId, { assignedMatchIds: nextMatchIds });
      notifySuccess(
        assigned
          ? `Detached ${bridge.bridgeId} from this match.`
          : `Assigned ${bridge.bridgeId} to this match.`
      );
      await loadBridges();
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, `Failed updating match assignment for ${bridge.bridgeId}.`));
    } finally {
      setBusyBridgeId(null);
    }
  }

  async function handleRotateBridgeToken(bridge: ObsBridgeData) {
    try {
      setBusyBridgeId(bridge.bridgeId);
      setActionError(null);
      const res = await obsStudioService.rotateBridgeToken(bridge.bridgeId);
      setCreatedBridgeSecret(res);
      notifySuccess(`Rotated token for ${bridge.bridgeId}. Reconnect Windows Bridge with updated config.json.`);
      await loadBridges();
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, `Failed rotating token for ${bridge.bridgeId}.`));
    } finally {
      setBusyBridgeId(null);
    }
  }

  async function handleRevokeBridge(bridge: ObsBridgeData) {
    try {
      setBusyBridgeId(bridge.bridgeId);
      setActionError(null);
      await obsStudioService.revokeBridge(bridge.bridgeId, 'Revoked from MaidanLive Broadcast Studio');
      notifySuccess(`Revoked ${bridge.bridgeId} and disconnected any active session.`);
      await loadBridges();
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, `Failed revoking ${bridge.bridgeId}.`));
    } finally {
      setBusyBridgeId(null);
    }
  }

  async function handleReactivateBridge(bridge: ObsBridgeData) {
    try {
      setBusyBridgeId(bridge.bridgeId);
      setActionError(null);
      await obsStudioService.reactivateBridge(bridge.bridgeId);
      notifySuccess(`Reactivated ${bridge.bridgeId}.`);
      await loadBridges();
    } catch (err) {
      setActionError(extractApiError(err, `Failed reactivating ${bridge.bridgeId}.`));
    } finally {
      setBusyBridgeId(null);
    }
  }

  async function handleOpenOrPairBridge(existingBridgeId?: string) {
    try {
      setGeneratingPairing(true);
      setActionError(null);
      const res = await obsStudioService.createBridgePairingCode({
        matchId: matchId || undefined,
        tournamentId: studio?.match?.tournamentId || undefined,
        bridgeId: existingBridgeId,
        label: 'Windows OBS Bridge',
      });
      setPairingInfo(res);
      setConnMode('local_agent');

      const probe = await obsStudioService.probeLocalBridgeStatus();
      setLocalBridgeProbe(probe);
      if (probe?.running) {
        const activated = await obsStudioService.activateLocalBridge(res.pairingCode, res.serverUrl);
        if (activated.ok) {
          setPairingInfo(null);
          notifySuccess(
            `Windows OBS Bridge paired (${activated.bridgeId || 'connected'}) and syncing with OBS Studio!`
          );
          await loadBridges();
          await refetch();
          await checkInstallerAndLocalBridge();
          return;
        }
      }

      // Trigger custom Windows URI protocol without opening a blank tab
      try {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = res.protocolUrl;
        document.body.appendChild(iframe);
        window.setTimeout(() => {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        }, 2500);
      } catch {
        // User can copy the fallback pairing code shown below
      }
      notifySuccess(
        `Pairing code ${res.pairingCode} generated (valid 5 min). Opening MaidanLive OBS Bridge app...`
      );
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to generate Windows Bridge pairing code.'));
    } finally {
      setGeneratingPairing(false);
    }
  }

  async function handleReconnectBridgeObs(bridge: ObsBridgeData) {
    try {
      setBusyBridgeId(bridge.bridgeId);
      setActionError(null);
      const res = await obsStudioService.reconnectBridgeObs(bridge.bridgeId);
      if (res.result?.reconnected) {
        notifySuccess(`OBS Studio reconnected on ${bridge.bridgeId}.`);
      } else {
        setActionError(
          res.result?.lastError ||
            'Reconnect requested, but OBS Studio is still offline on port 4455.'
        );
      }
      await loadBridges();
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, `Failed reconnecting OBS on ${bridge.bridgeId}.`));
    } finally {
      setBusyBridgeId(null);
    }
  }

  async function handleDisconnectBridge(bridge: ObsBridgeData) {
    try {
      setBusyBridgeId(bridge.bridgeId);
      setActionError(null);
      await obsStudioService.disconnectBridge(bridge.bridgeId);
      notifySuccess(`Disconnected active bridge session for ${bridge.bridgeId}.`);
      await loadBridges();
      await refetch();
      await checkInstallerAndLocalBridge();
    } catch (err) {
      setActionError(extractApiError(err, `Failed disconnecting ${bridge.bridgeId}.`));
    } finally {
      setBusyBridgeId(null);
    }
  }

  // Admin Override toggle
  async function handleConfirmOverride(locked: boolean) {
    if (!matchId) return;
    try {
      setTogglingOverride(true);
      setActionError(null);
      await obsStudioService.setAdminOverride(matchId, locked, overrideReason.trim());
      setOverrideModalOpen(false);
      setOverrideReason('');
      notifySuccess(locked ? 'Admin Override Lock ENGAGED — only Admins can switch OBS scenes.' : 'Admin Override Lock released.');
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to toggle Admin Override Lock.'));
    } finally {
      setTogglingOverride(false);
    }
  }

  // Quick Scoreboard Overlay & Sponsor sync
  async function handleUpdateOverlay(patch: Record<string, unknown>) {
    if (!matchId || !studio?.match) return;
    const current = normalizeOverlayConfig(studio.match.overlayConfig);
    const apiPatch: Record<string, unknown> = { ...patch };
    if (patch.mode === 'hidden') apiPatch.visible = false;
    else if (patch.mode && patch.visible === undefined) apiPatch.visible = true;
    if (patch.visible === true && (patch.mode ?? current.mode) === 'hidden') {
      apiPatch.mode = 'full';
    }
    const next = normalizeOverlayConfig({ ...current, ...apiPatch });

    setStudio((prev) =>
      prev ? { ...prev, match: { ...prev.match, overlayConfig: next } } : prev
    );
    try {
      setSavingOverlay(true);
      const res = await liveStreamService.updateOverlayConfig(matchId, apiPatch);
      if (res?.overlayConfig) {
        setStudio((prev) =>
          prev ? { ...prev, match: { ...prev.match, overlayConfig: normalizeOverlayConfig(res.overlayConfig) } } : prev
        );
      }
      notifySuccess('Scoreboard overlay synced live to OBS Browser Source.');
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to update scoreboard overlay.'));
      await refetch();
    } finally {
      setSavingOverlay(false);
    }
  }

  function handleOverlaySliderChange(key: 'customScale', val: number) {
    if (!matchId || !studio?.match) return;
    const current = normalizeOverlayConfig(studio.match.overlayConfig);
    const next = normalizeOverlayConfig({ ...current, [key]: val });
    pendingOverlaySliderRef.current = { ...pendingOverlaySliderRef.current, [key]: val };
    setStudio((prev) =>
      prev ? { ...prev, match: { ...prev.match, overlayConfig: next } } : prev
    );
    if (overlaySliderDebounceRef.current !== null) {
      window.clearTimeout(overlaySliderDebounceRef.current);
    }
    overlaySliderDebounceRef.current = window.setTimeout(async () => {
      overlaySliderDebounceRef.current = null;
      const patchToSend = { ...pendingOverlaySliderRef.current };
      pendingOverlaySliderRef.current = {};
      if (Object.keys(patchToSend).length === 0) return;
      try {
        setSavingOverlay(true);
        const res = await liveStreamService.updateOverlayConfig(matchId, patchToSend);
        if (res?.overlayConfig) {
          setStudio((prev) =>
            prev
              ? {
                  ...prev,
                  match: {
                    ...prev.match,
                    overlayConfig: normalizeOverlayConfig(res.overlayConfig),
                  },
                }
              : prev
          );
        }
        notifySuccess('Scoreboard overlay size synced live to OBS.');
      } catch (err) {
        setActionError(extractApiError(err, 'Failed to update scoreboard size.'));
        await refetch();
      } finally {
        setSavingOverlay(false);
      }
    }, 160);
  }

  async function handleToggleSponsor(sponsorId: string) {
    if (!matchId || !profile) return;
    const current = profile.selectedSponsorIds || [];
    const next = current.includes(sponsorId)
      ? current.filter((id) => id !== sponsorId)
      : [...current, sponsorId];
    try {
      setSavingSponsors(true);
      await obsStudioService.updateProfile(matchId, { selectedSponsorIds: next });
      notifySuccess('Broadcast sponsor selection updated.');
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to update sponsors.'));
    } finally {
      setSavingSponsors(false);
    }
  }

  const filteredAuditLogs = useMemo(() => {
    const logs = studio?.auditLogs || [];
    if (!auditFilter) return logs;
    return logs.filter((l) => l.actionType === auditFilter);
  }, [studio?.auditLogs, auditFilter]);

  const currentOverlay = normalizeOverlayConfig(studio?.match?.overlayConfig);
  const currentOverlayMetrics = computeOverlayMetrics(currentOverlay, false);

  return (
    <div className="space-y-5">
      {/* Studio Header Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Video className="w-5 h-5 text-[#EA580C] shrink-0" />
              <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 truncate">
                Multi-Camera OBS Broadcast Studio
              </h1>
              {profile && (
                <>
                  {profile.connectionMode === 'local_agent' && (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold border whitespace-nowrap shrink-0 ${
                        profile.agentOnline
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-700 border-slate-300'
                      }`}
                    >
                      <Laptop className="w-3 h-3" />
                      {profile.agentOnline ? 'BRIDGE ONLINE' : 'BRIDGE OFFLINE'}
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold border whitespace-nowrap shrink-0 ${obsStatusBadgeClass(
                      profile.connectionStatus
                    )}`}
                  >
                    {profile.connectionStatus === 'CONNECTED'
                      ? 'OBS CONNECTED'
                      : profile.connectionStatus === 'CONNECTING'
                        ? 'OBS CONNECTING'
                        : profile.connectionStatus === 'ERROR'
                          ? 'OBS ERROR'
                          : 'OBS DISCONNECTED'}
                  </span>
                  {studio?.match && (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold border whitespace-nowrap shrink-0 ${
                        obsConnected && profile.obsStreamActive
                          ? 'bg-red-600 text-white border-red-600'
                          : studio.match.youtubeVideoId ||
                              studio.match.activeStreamingProvider === 'mediamtx'
                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      <Radio className="w-3 h-3" />
                      {obsConnected && profile.obsStreamActive
                        ? `STREAM LIVE${profile.obsStreamTimecode ? ` · ${profile.obsStreamTimecode}` : ''}`
                        : studio.match.activeStreamingProvider === 'mediamtx'
                          ? 'MEDIAMTX READY'
                          : studio.match.youtubeVideoId
                            ? 'YOUTUBE READY'
                            : 'STREAM OFFLINE'}
                    </span>
                  )}
                </>
              )}
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold border whitespace-nowrap shrink-0 ${
                  socketConnected
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                {socketConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {socketConnected ? 'Sync Live' : 'Reconnecting...'}
              </span>
              {profile?.lastSyncedAt && (
                <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap tabular-nums">
                  Synced {new Date(profile.lastSyncedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Visual Multi-Camera Production Desk — select cameras, preview Split / Grid / PIP compositions, and switch OBS scenes cleanly without interrupting live viewers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              value={matchId || ''}
              disabled={loadingMatches}
              onChange={(e) => {
                if (e.target.value) navigate(`${studioBaseRoute}/${e.target.value}`);
              }}
              aria-label="Select broadcast match"
              className="min-h-[38px] px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white max-w-[240px]"
            >
              {matches.length === 0 && <option value="">No matches available</option>}
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  [{isMatchPreparedDraft(m) ? 'PREPARED' : m.status}]{' '}
                  {m.matchTitle || `${m.teamAName || 'Team A'} vs ${m.teamBName || 'Team B'}`}
                </option>
              ))}
            </select>

            {!isBroadcasterRole && (
              <button
                type="button"
                onClick={openNewMatchSetupModal}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Match Setup</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#EA580C] bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Control Room Guide</span>
            </button>

            {matchId && (
              <>
                <button
                  type="button"
                  onClick={jumpToAdsAndGraphics}
                  className={`min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === 'graphics'
                      ? 'bg-[#EA580C] text-white border-[#EA580C]'
                      : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                  }`}
                >
                  <Sparkles
                    className={`w-3.5 h-3.5 ${
                      activeTab === 'graphics' ? 'text-white' : 'text-[#EA580C]'
                    }`}
                  />
                  <span>
                    Run Ads / Graphics
                    {(studio?.graphicsState?.activeSlots?.length || 0) > 0
                      ? ` (${studio!.graphicsState!.activeSlots.length} LIVE)`
                      : ''}
                  </span>
                </button>
                <Link
                  to={`/broadcast/overlay/${matchId}`}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  <Tv className="w-3.5 h-3.5 text-[#EA580C]" />
                  <span>Overlay Studio</span>
                </Link>
                {!isBroadcasterRole && (
                  <Link
                    to={`/admin/scoreboard/${matchId}`}
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 whitespace-nowrap shrink-0"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Scoreboard</span>
                  </Link>
                )}
              </>
            )}

            {profile && studio?.permissions?.canOverride && (
              <button
                type="button"
                onClick={() => {
                  if (profile.adminOverrideLocked) {
                    handleConfirmOverride(false);
                  } else {
                    setOverrideModalOpen(true);
                  }
                }}
                disabled={togglingOverride}
                className={`min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  profile.adminOverrideLocked
                    ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                    : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                }`}
              >
                {profile.adminOverrideLocked ? (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Release Override Lock</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Admin Override</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Match Context Strip */}
        {studio?.match && (
          <div className="pt-3 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tournament</p>
              <p className="font-semibold text-slate-900 truncate">
                {studio.match.tournamentName || 'Open / Standalone'}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Match</p>
              <p className="font-semibold text-slate-900 truncate">
                {studio.match.matchTitle ||
                  [studio.match.teamAName, studio.match.teamBName].filter(Boolean).join(' vs ')}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Match ID</p>
              <button
                type="button"
                onClick={() => copyText('matchId', studio.match.id)}
                title="Copy Match ID"
                className="inline-flex items-center gap-1 font-mono font-semibold text-slate-700 hover:text-[#EA580C] max-w-full"
              >
                <span className="truncate">{studio.match.id.slice(-8)}</span>
                {copiedKey === 'matchId' ? (
                  <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                ) : (
                  <Copy className="w-3 h-3 shrink-0" />
                )}
              </button>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Match Status</p>
              <p className="font-mono font-bold text-slate-900">
                {studio.match.status} · {studio.match.gameName || 'Sport'}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">YouTube Output</p>
              <p className="font-mono font-semibold text-slate-900 truncate">
                {obsConnected && profile?.obsStreamActive
                  ? 'STREAMING LIVE'
                  : studio.match.activeStreamingProvider === 'mediamtx'
                    ? 'MediaMTX Direct'
                    : studio.match.youtubeVideoId
                      ? `Linked (${studio.match.youtubeVideoId})`
                      : 'Not Linked'}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Duration</p>
              <p className="font-mono tabular-nums font-semibold text-slate-900 truncate">
                {obsConnected && profile?.obsStreamActive
                  ? profile.obsStreamTimecode || '00:00:00'
                  : 'Offline'}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Program Scene</p>
              <p className="font-mono font-bold text-[#EA580C] truncate">
                {obsConnected
                  ? profile?.sceneLabels?.[profile.activeObsScene] || profile?.activeObsScene || 'Connected'
                  : 'OBS DISCONNECTED'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Banners */}
      <FeedbackBanner
        type="error"
        message={actionError || liveErrorToast || error}
        onDismiss={() => {
          setActionError(null);
          clearLiveErrorToast();
        }}
      />
      <FeedbackBanner
        type="success"
        message={actionSuccess}
        onDismiss={() => setActionSuccess(null)}
      />

      {/* Admin Override Warning Banner */}
      {profile?.adminOverrideLocked && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex flex-wrap items-center justify-between gap-3 text-xs text-red-900">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
            <div>
              <strong>ADMIN OVERRIDE LOCK ACTIVE</strong> — Locked by{' '}
              <strong>{profile.adminOverrideByName || 'Admin'}</strong>
              {profile.adminOverrideReason ? ` (${profile.adminOverrideReason})` : ''}. Non-admin operators cannot switch OBS scenes.
            </div>
          </div>
          {studio?.permissions?.canOverride && (
            <button
              type="button"
              onClick={() => handleConfirmOverride(false)}
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700"
            >
              Unlock Now
            </button>
          )}
        </div>
      )}

      {/* Real OBS Error Banner */}
      {profile?.connectionStatus !== 'CONNECTED' && profile?.lastError && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>OBS Studio disconnected:</strong> {profile.lastError}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('connection')}
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700"
          >
            Configure OBS Connection
          </button>
        </div>
      )}

      {!matchId && !loadingMatches && matches.length === 0 ? (
        <EmptyState
          icon={<Video className="w-6 h-6" />}
          title="No match broadcasts found"
          description="Initialize a match first (no YouTube link required yet), prepare OBS cameras & overlays, then connect YouTube and activate."
          action={
            !isBroadcasterRole ? (
              <button
                type="button"
                onClick={openNewMatchSetupModal}
                className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600"
              >
                <Plus className="w-4 h-4" />
                <span>New Match Setup</span>
              </button>
            ) : (
              <Link
                to="/admin/live-streams"
                className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600"
              >
                <Radio className="w-4 h-4" />
                <span>Go to Broadcasts</span>
              </Link>
            )
          }
        />
      ) : loading || !studio || !profile ? (
        <TableSkeleton rows={5} />
      ) : (
        <>
          {/* Separated Status Matrix + 7-Step Control Room Workflow */}
          <ControlRoomWorkflowPanel
            match={studio.match}
            profile={profile}
            cameras={cameras}
            score={liveMatchScore}
            scoreboardOverlayUrl={studio.scoreboardOverlayUrl}
            isBroadcasterRole={isBroadcasterRole}
            ytInputDraft={ytInputDraft}
            ytProviderDraft={ytProviderDraft}
            onChangeYtInputDraft={setYtInputDraft}
            onChangeYtProviderDraft={setYtProviderDraft}
            savingYtOutput={savingYtOutput}
            verifyingYtOutput={verifyingYtOutput}
            ytVerification={ytVerification}
            onSaveYouTubeOutput={handleSaveYouTubeOutput}
            togglingScoreboardOnYoutube={togglingScoreboardOnYoutube}
            onToggleScoreboardOnYoutube={handleToggleScoreboardOnYoutube}
            activatingBroadcast={activatingBroadcast}
            endingBroadcast={endingBroadcast}
            onActivateBroadcast={handleActivateBroadcast}
            onRequestEndBroadcast={() => setEndConfirmOpen(true)}
            onOpenNextMatchSetup={openNewMatchSetupModal}
            onEditMatchSetup={openEditMatchSetupModal}
            onOpenConnection={() => setActiveTab('connection')}
            onOpenMapSources={() => setMapSourcesModalOpen(true)}
            onOpenCamerasTab={() => setActiveTab('cameras')}
            onOpenOverlayTab={() => setActiveTab('overlay')}
            onOpenGuide={() => setGuideOpen(true)}
          />

          {/* Active Session & Controller Presence Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:px-5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 font-mono font-bold text-slate-900">
                <UserCheck className="w-4 h-4 text-[#EA580C]" />
                <span>
                  Controller:{' '}
                  {profile.activeControllerName
                    ? `${profile.activeControllerName} (${profile.activeControllerRole || 'Operator'})`
                    : 'Unclaimed'}
                </span>
              </span>
              <span className="font-mono text-slate-500">
                Session: {profile.broadcastSessionId || 'No active session'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!profile.broadcastSessionId ? (
                <button
                  type="button"
                  disabled={managingSession !== null}
                  onClick={() => handleManageSession('start')}
                  className="min-h-[32px] px-3 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {managingSession === 'start' ? 'Starting...' : 'Start Broadcast Session'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={managingSession !== null}
                    onClick={() => handleManageSession('takeover')}
                    className="min-h-[32px] px-3 py-1 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 disabled:opacity-50"
                  >
                    {managingSession === 'takeover' ? 'Claiming...' : 'Take Active Control'}
                  </button>
                  <button
                    type="button"
                    disabled={managingSession !== null}
                    onClick={() => handleManageSession('end')}
                    className="min-h-[32px] px-3 py-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
                  >
                    {managingSession === 'end' ? 'Ending...' : 'End Session'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 4-Cell Studio KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Active OBS Scene
              </p>
              <p className="font-mono text-base sm:text-lg font-bold text-slate-900 truncate mt-1">
                {obsConnected ? profile.activeObsScene || 'Connected (Idle)' : 'OBS Not Connected'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                Layout: <span className="font-mono">{profile.activeLayoutType}</span>
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Configured Cameras
              </p>
              <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
                {onlineCameraCount}{' '}
                <span className="text-sm font-normal text-slate-500">
                  online / {cameras.length} total
                </span>
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {enabledCameras.length} enabled · Unlimited slots
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                OBS Performance
              </p>
              <p className="font-mono tabular-nums text-lg font-bold text-slate-900 mt-1">
                {obsConnected && profile.obsStats
                  ? `${Math.round(profile.obsStats.activeFps)} FPS · ${profile.obsStats.cpuUsage.toFixed(1)}% CPU`
                  : 'Unavailable'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                {obsConnected && profile.obsStats
                  ? `Dropped: ${profile.obsStats.outputSkippedFrames} frames`
                  : 'Connect OBS to read live telemetry'}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  OBS Stream &amp; Recording
                </p>
                {obsConnected && profile.obsRecordActive && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-mono font-bold">
                    <Circle className="w-2.5 h-2.5 fill-current" />
                    REC
                  </span>
                )}
              </div>
              <p
                className={`font-mono text-sm sm:text-base font-bold ${
                  obsConnected && profile.obsStreamActive ? 'text-red-500' : 'text-slate-700'
                }`}
              >
                {obsConnected
                  ? profile.obsStreamActive
                    ? `OBS LIVE ${profile.obsStreamTimecode || ''}`
                    : 'OBS Output Idle'
                  : studio.match.status}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {canControlStream && (
                  <button
                    type="button"
                    disabled={!obsConnected || executingObsAction !== null}
                    onClick={() =>
                      handleObsOutputAction(profile.obsStreamActive ? 'stop_stream' : 'start_stream')
                    }
                    className={`min-h-[28px] inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded border disabled:opacity-40 ${
                      profile.obsStreamActive
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-slate-900 text-white border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    {profile.obsStreamActive ? <Square className="w-3 h-3" /> : <Radio className="w-3 h-3" />}
                    <span>{profile.obsStreamActive ? 'Stop Stream' : 'Start Stream'}</span>
                  </button>
                )}
                {canControlRecord && (
                  <button
                    type="button"
                    disabled={!obsConnected || executingObsAction !== null}
                    onClick={() =>
                      handleObsOutputAction(profile.obsRecordActive ? 'stop_record' : 'start_record')
                    }
                    className={`min-h-[28px] inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded border disabled:opacity-40 ${
                      profile.obsRecordActive
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    <Circle className="w-3 h-3" />
                    <span>{profile.obsRecordActive ? 'Stop Rec' : 'Record'}</span>
                  </button>
                )}
              </div>
              <p className="text-[10px] font-mono text-slate-500 truncate">
                {profile.obsStreamBytes && profile.obsStreamBytes > 0
                  ? `${(profile.obsStreamBytes / (1024 * 1024)).toFixed(1)} MB sent`
                  : `Provider: ${studio.match.activeStreamingProvider.toUpperCase()}`}
              </p>
            </div>
          </div>

          {/* 6 Workspace Tabs */}
          <div
            ref={workspaceTabsRef}
            className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl overflow-x-auto"
          >
            {[
              { id: 'live' as const, label: 'Live Switching & Layouts', icon: Monitor },
              {
                id: 'graphics' as const,
                label: `Live Graphics Studio${
                  (studio.graphicsState?.activeSlots?.length || 0) > 0
                    ? ` (${studio.graphicsState!.activeSlots.length} LIVE)`
                    : ''
                }`,
                icon: Sparkles,
              },
              { id: 'cameras' as const, label: `Cameras & Smartphones (${cameras.length})`, icon: Camera },
              { id: 'overlay' as const, label: 'Scoreboard & Sponsors', icon: Tv },
              { id: 'connection' as const, label: 'OBS Connection & Agent', icon: Server },
              { id: 'audit' as const, label: `Audit Logs (${studio.auditLogs.length})`, icon: ClipboardList },
            ].map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`min-h-[40px] inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#EA580C] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* ============================================================== */}
          {/* TAB 1: LIVE CAMERA PRODUCTION DESK (PROGRAM + COMPOSITION)     */}
          {/* ============================================================== */}
          {activeTab === 'live' && (
            <div className="space-y-5">
              {/* Dual-Pane Program Output (Live) vs Camera Composition (Preview / Staged) */}
              <ProgramAndCompositionWorkspace
                cameras={cameras}
                profile={profile}
                obsConnected={obsConnected}
                previewSnapshots={previewSnapshots}
                programSnapshotError={programSnapshotError}
                capturingProgramPreview={capturingProgramPreview}
                programMonitorMode={programMonitorMode}
                onChangeProgramMonitorMode={setProgramMonitorMode}
                selectedCameraIds={stagedCameraIds}
                mainCameraId={stagedMainCameraId}
                layoutType={stagedLayoutType}
                pipPosition={stagedPipPosition}
                pipSize={stagedPipSize}
                customSceneName={stagedSceneName}
                includeScoreboardOverlay={stagedIncludeScoreboard}
                applying={applyingLayout}
                onChangeSelectedCameraIds={setStagedCameraIds}
                onChangeMainCameraId={setStagedMainCameraId}
                onChangeLayoutType={setStagedLayoutType}
                onChangePipPosition={setStagedPipPosition}
                onChangePipSize={setStagedPipSize}
                onChangeCustomSceneName={setStagedSceneName}
                onChangeIncludeScoreboardOverlay={setStagedIncludeScoreboard}
                onRefreshProgramPreview={() => handleCaptureActiveScenePreview()}
                onApplyLive={handleApplyStagedComposition}
                onSavePreset={handleSaveScenePreset}
                onOpenConnectionTab={() => setActiveTab('connection')}
                obsTransforms={obsTransforms}
                detectedContentMap={detectedContentMap}
                onFrameContentDetected={handleFrameContentDetected}
                updatingTransformCamId={updatingTransformCamId}
                onUpdateCameraFraming={handleUpdateCameraFraming}
              />

              {/* Visual Connected Camera Panel */}
              <CameraPreviewGrid
                cameras={cameras}
                profile={profile}
                obsConnected={obsConnected}
                canManageCameras={canManageCameras}
                previewSnapshots={previewSnapshots}
                previewErrors={previewErrors}
                capturingPreviewFor={capturingPreviewFor}
                refreshingAllPreviews={refreshingAllPreviews}
                switchingKey={switchingKey}
                mutingCamId={mutingCamId}
                reconnectingCamId={reconnectingCamId}
                scaffoldingCount={scaffoldingCount}
                selectedCameraIds={stagedCameraIds}
                mainCameraId={stagedMainCameraId}
                quickSwitchMode={quickSwitchMode}
                onToggleQuickSwitchMode={setQuickSwitchMode}
                onToggleSelectCamera={handleToggleSelectCamera}
                onCutCameraLive={handleSwitchCamera}
                onCapturePreview={(cam) => handleCaptureSourcePreview(cam)}
                onRefreshAllPreviews={handleRefreshAllPreviews}
                onCaptureActiveScenePreview={handleCaptureActiveScenePreview}
                onToggleAudio={handleToggleCameraAudio}
                onReconnectCamera={handleReconnectCamera}
                onOpenQrWizard={(cam) => {
                  setWizardCamera(cam);
                  setWizardConnectUrl(null);
                }}
                onOpenLarixWizard={(cam) => {
                  setLarixTargetCamera(cam);
                  setLarixModalOpen(true);
                  void loadMediaMTXConfig();
                }}
                onAddLarixCamera={() => {
                  setLarixTargetCamera(null);
                  setLarixModalOpen(true);
                  void loadMediaMTXConfig();
                }}
                onAssignCameraToObs={handleAssignCameraToObs}
                assigningObsCamId={assigningObsCamId}
                onOpenMapSourcesModal={() => setMapSourcesModalOpen(true)}
                onScaffoldCameras={handleScaffoldCameras}
                onSyncObsState={handleSyncObsState}
                onOpenCamerasTab={() => setActiveTab('cameras')}
                obsTransforms={obsTransforms}
                detectedContentMap={detectedContentMap}
                onFrameContentDetected={handleFrameContentDetected}
                updatingTransformCamId={updatingTransformCamId}
                onUpdateCameraFraming={handleUpdateCameraFraming}
              />

              {/* Collapsible Advanced OBS Scenes, Scene Sources Visibility, Saved Presets & YouTube Output */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvancedObsControls((v) => !v)}
                  className="w-full px-4 sm:px-5 py-3.5 bg-slate-50 hover:bg-slate-100/80 flex flex-wrap items-center justify-between gap-2 text-left transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Layers className="w-4 h-4 text-[#EA580C] shrink-0" />
                    <div className="min-w-0">
                      <p className="font-display text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
                        Advanced OBS Controls, Native Scenes &amp; Saved Presets
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {profile.obsScenes.length} OBS scenes · {sceneItems.length} active sources · {scenes.length} saved presets · YouTube Live monitor
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 shrink-0">
                    <span>{showAdvancedObsControls ? 'Hide Panel' : 'Expand Panel'}</span>
                    {showAdvancedObsControls ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </span>
                </button>

                {showAdvancedObsControls && (
                  <div className="p-4 sm:p-5 border-t border-slate-200">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display text-sm font-bold text-slate-900 uppercase tracking-wide">
                        Live OBS Studio Scenes ({profile.obsScenes.length})
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Dynamically discovered from your local OBS — click any scene to switch live without restarting YouTube.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleSyncObsState}
                        disabled={!profile.agentOnline && profile.connectionMode === 'local_agent' ? true : refreshingScenes}
                        className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 whitespace-nowrap shrink-0"
                      >
                        <RefreshCw className={`w-3 h-3 ${refreshingScenes ? 'animate-spin' : ''}`} />
                        <span>{refreshingScenes ? 'Refreshing...' : 'Refresh Scenes'}</span>
                      </button>
                      {profile.obsScenes.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (editingSceneLabels) {
                              handleSaveSceneLabels();
                            } else {
                              setEditingSceneLabels(true);
                            }
                          }}
                          disabled={savingSceneLabels}
                          className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>
                            {savingSceneLabels
                              ? 'Saving...'
                              : editingSceneLabels
                                ? 'Save Labels'
                                : 'Rename Labels'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  {profile.obsScenes.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      {obsConnected
                        ? 'No scenes reported by OBS Studio yet. Add scenes in OBS and click Refresh Scenes.'
                        : 'OBS DISCONNECTED — Start OBS Studio on Windows and connect your Local OBS Bridge to load scenes dynamically.'}
                    </p>
                  ) : editingSceneLabels ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {profile.obsScenes.map((sceneName) => (
                        <div key={sceneName} className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-slate-500 w-36 truncate" title={sceneName}>
                            {sceneName}
                          </span>
                          <input
                            type="text"
                            value={sceneLabelDrafts[sceneName] ?? ''}
                            onChange={(e) =>
                              setSceneLabelDrafts((prev) => ({ ...prev, [sceneName]: e.target.value }))
                            }
                            placeholder={`Label for ${sceneName}`}
                            className="flex-1 min-h-[34px] px-2.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                      ))}
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingSceneLabels(false)}
                          className="min-h-[30px] px-3 text-xs font-semibold border border-slate-200 rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {profile.obsScenes.map((sceneName) => {
                        const active = obsConnected && profile.activeObsScene === sceneName;
                        const isSwitchingThis =
                          switchingKey === `scene:${sceneName}` ||
                          switchingSceneRequest?.targetScene === sceneName;
                        const isAnySwitching =
                          switchingKey !== null || Boolean(switchingSceneRequest);
                        const friendly = profile.sceneLabels?.[sceneName]?.trim();
                        return (
                          <button
                            key={sceneName}
                            type="button"
                            disabled={!obsConnected || isAnySwitching}
                            onClick={() => handleSwitchSceneName(sceneName)}
                            title={friendly ? `OBS Scene: ${sceneName}` : sceneName}
                            className={`min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                              active
                                ? 'bg-[#EA580C] text-white border-[#EA580C] shadow-xs'
                                : isSwitchingThis
                                  ? 'bg-orange-50 text-[#EA580C] border-[#EA580C]'
                                  : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                            } disabled:opacity-55`}
                          >
                            {isSwitchingThis && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            <span>{friendly || sceneName}</span>
                            {friendly && (
                              <span
                                className={`font-mono text-[10px] ${
                                  active ? 'text-orange-100' : 'text-slate-400'
                                }`}
                              >
                                ({sceneName})
                              </span>
                            )}
                            {active && !isSwitchingThis && (
                              <span className="ml-1 px-1.5 py-0.5 rounded bg-white/20 text-[9px] font-mono font-bold uppercase tracking-wider">
                                LIVE
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Active Scene Source Visibility Control (GetSceneItemList / SetSceneItemEnabled) */}
                  <div className="pt-3 mt-2 border-t border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                        Active Scene Sources {sceneItemsSceneName ? `(${sceneItemsSceneName})` : ''}
                      </span>
                      <button
                        type="button"
                        disabled={!obsConnected || loadingSceneItems}
                        onClick={() => loadSceneItems(profile.activeObsScene || '')}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-40"
                      >
                        <RefreshCw className={`w-3 h-3 ${loadingSceneItems ? 'animate-spin' : ''}`} />
                        <span>Refresh Sources</span>
                      </button>
                    </div>
                    {!obsConnected ? (
                      <p className="text-[11px] text-slate-500">
                        Connect OBS Studio to inspect and toggle individual sources (cameras, scoreboard, overlays).
                      </p>
                    ) : loadingSceneItems ? (
                      <p className="text-[11px] text-slate-500">Reading scene sources from OBS...</p>
                    ) : sceneItems.length === 0 ? (
                      <p className="text-[11px] text-slate-500">No sources reported in current program scene.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {sceneItems.map((item) => (
                          <div
                            key={`${item.sceneItemId}-${item.sourceName}`}
                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 truncate">{item.sourceName}</p>
                              <p className="text-[10px] font-mono text-slate-500 truncate">
                                {item.inputKind || item.sourceType || 'source'}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={togglingItemId === item.sceneItemId}
                              onClick={() => handleToggleSceneItem(item)}
                              className={`min-h-[28px] inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border whitespace-nowrap shrink-0 ${
                                item.sceneItemEnabled
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-slate-200 text-slate-600 border-slate-300 hover:bg-slate-300'
                              } disabled:opacity-50`}
                            >
                              {item.sceneItemEnabled ? (
                                <>
                                  <Eye className="w-3 h-3" />
                                  <span>Visible</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3 h-3" />
                                  <span>Hidden</span>
                                </>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <div className="space-y-5">
                  {/* Saved Layout Presets */}
                  <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-sm font-bold text-slate-900 uppercase tracking-wide">
                        Saved Layout Presets ({scenes.length})
                      </h3>
                      <span className="text-[11px] text-slate-500">One-click multi-cam recall</span>
                    </div>

                    {scenes.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Use &ldquo;Save Preset&rdquo; in the Dynamic Layout Builder above to store reusable split-screen scenes.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {scenes.map((sc) => {
                          const isActive = obsConnected && profile.activeObsScene === sc.obsSceneName;
                          return (
                            <div
                              key={sc.id}
                              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900 truncate">{sc.name}</p>
                                <p className="text-[11px] font-mono text-slate-500 truncate">
                                  {sc.obsSceneName} · {sc.layoutType} · {sc.cameraIds.length} cams
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  disabled={!obsConnected || applyingLayout}
                                  onClick={() =>
                                    handleApplyLayout({
                                      layoutType: sc.layoutType,
                                      cameraIds: sc.cameraIds,
                                      mainCameraId: sc.mainCameraId || undefined,
                                      pipPosition: sc.pipPosition || undefined,
                                      pipSize: sc.pipSize || undefined,
                                      sceneName: sc.obsSceneName,
                                      includeScoreboardOverlay: sc.includeScoreboardOverlay,
                                    })
                                  }
                                  className={`min-h-[32px] px-3 py-1 rounded text-xs font-semibold ${
                                    isActive
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-[#EA580C] text-white hover:bg-orange-600'
                                  } disabled:opacity-40`}
                                >
                                  {isActive ? 'Live' : 'Go Live'}
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await obsStudioService.deleteScene(matchId!, sc.id);
                                      await refetch();
                                    } catch (err) {
                                      setActionError(extractApiError(err, 'Failed to delete preset.'));
                                    }
                                  }}
                                  title="Delete preset"
                                  className="min-h-[32px] px-2 text-slate-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* YouTube Live Broadcast Output & Live Monitor Preview */}
                  <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-display text-sm font-bold text-slate-900 uppercase tracking-wide">
                          YouTube Live &amp; Broadcast Monitor
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          Associate the ongoing YouTube Live URL / ID for spectators without restarting OBS.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowInlineYtPreview((v) => !v)}
                        className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                      >
                        <Tv className="w-3 h-3 text-[#EA580C]" />
                        <span>{showInlineYtPreview ? 'Hide Player' : 'Preview Live Feed'}</span>
                      </button>
                    </div>

                    <form onSubmit={handleSaveYouTubeOutput} className="space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={ytInputDraft}
                          onChange={(e) => setYtInputDraft(e.target.value)}
                          placeholder="YouTube Live URL or 11-char ID"
                          className="sm:col-span-2 min-h-[36px] px-3 text-xs font-mono border border-slate-300 rounded-lg"
                        />
                        <select
                          value={ytProviderDraft}
                          onChange={(e) => setYtProviderDraft(e.target.value as StreamingProvider)}
                          className="min-h-[36px] px-2.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white"
                        >
                          <option value="youtube">YouTube Live</option>
                          <option value="mediamtx">MediaMTX Direct</option>
                        </select>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-500">
                          Stream keys stay private inside OBS Studio — never stored in browser code.
                        </span>
                        <button
                          type="submit"
                          disabled={savingYtOutput}
                          className="min-h-[32px] px-3.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          {savingYtOutput ? 'Saving...' : 'Update Output'}
                        </button>
                      </div>
                    </form>

                    {showInlineYtPreview && (
                      <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-slate-800 bg-black">
                        <LiveStreamPlayer
                          provider={studio.match.activeStreamingProvider}
                          youtubeVideoId={studio.match.youtubeVideoId || ''}
                          title={studio.match.matchTitle}
                        />
                      </div>
                    )}
                  </section>
                </div>
              </div>
                  </div>
                )}
              </div>

              {/* Collapsible One-Click Saved Ads & Live Graphics Strip right inside Live Desk */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowLiveQuickAds((v) => !v)}
                  className="w-full px-4 sm:px-5 py-3.5 bg-slate-50 hover:bg-slate-100/80 flex flex-wrap items-center justify-between gap-2 text-left transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="w-4 h-4 text-[#EA580C] shrink-0" />
                    <div className="min-w-0">
                      <p className="font-display text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
                        Saved Broadcast Ads &amp; One-Click Live Sponsor Overlays
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {savedAdDesigns.filter((d) => !d.isTemplate).length} saved ads ·{' '}
                        {studio.graphicsState?.activeSlots?.length || 0} live on OBS ·{' '}
                        {studio.graphicsState?.queue?.length || 0} queued
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 shrink-0">
                    <span>{showLiveQuickAds ? 'Hide Ads Desk' : 'Open Quick Ads'}</span>
                    {showLiveQuickAds ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </span>
                </button>

                {showLiveQuickAds && matchId && (
                  <div className="p-4 sm:p-5 border-t border-slate-200">
                    <SavedAdsLibraryPanel
                      compactMode
                      matchId={matchId}
                      tournamentId={studio.match.tournamentId}
                      graphicsState={studio.graphicsState}
                      designs={savedAdDesigns}
                      loadingDesigns={loadingAdDesigns}
                      bridgeOnline={Boolean(profile.agentOnline)}
                      scheduleRevision={scheduleRevision}
                      onRefreshDesigns={loadSavedAdDesigns}
                      onGraphicsStateChange={handleGraphicsStateChange}
                      onOpenStudioNew={handleOpenGraphicsEditorNew}
                      onOpenStudioEdit={handleOpenGraphicsEditorEdit}
                      onNotifySuccess={notifySuccess}
                      onNotifyError={(msg) => setActionError(msg)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 1B: LIVE GRAPHICS & ADVERTISING STUDIO (LAZY EDITOR)       */}
          {/* ============================================================== */}
          {activeTab === 'graphics' && matchId && (
            <div className="space-y-4">
              {graphicsStudioView === 'library' ? (
                <SavedAdsLibraryPanel
                  matchId={matchId}
                  tournamentId={studio.match.tournamentId}
                  graphicsState={studio.graphicsState}
                  designs={savedAdDesigns}
                  loadingDesigns={loadingAdDesigns}
                  bridgeOnline={Boolean(profile.agentOnline)}
                  scheduleRevision={scheduleRevision}
                  onRefreshDesigns={loadSavedAdDesigns}
                  onGraphicsStateChange={handleGraphicsStateChange}
                  onOpenStudioNew={handleOpenGraphicsEditorNew}
                  onOpenStudioEdit={handleOpenGraphicsEditorEdit}
                  onNotifySuccess={notifySuccess}
                  onNotifyError={(msg) => setActionError(msg)}
                />
              ) : (
                <React.Suspense
                  fallback={
                    <div className="rounded-xl border border-slate-200 bg-white p-10 text-center space-y-2">
                      <Loader2 className="w-6 h-6 animate-spin text-[#EA580C] mx-auto" />
                      <p className="text-xs font-semibold text-slate-700">
                        Loading Live Broadcast Graphics Studio...
                      </p>
                    </div>
                  }
                >
                  <LazyGraphicsStudioEditor
                    key={editingAdDesign?.id || 'new'}
                    matchId={matchId}
                    tournamentId={studio.match.tournamentId}
                    initialDesign={editingAdDesign}
                    graphicsState={studio.graphicsState}
                    designs={savedAdDesigns}
                    sponsors={studio.sponsors || []}
                    obsConnected={obsConnected}
                    bridgeOnline={Boolean(profile.agentOnline)}
                    socketConnected={socketConnected}
                    onBackToLibrary={() => setGraphicsStudioView('library')}
                    onRefreshDesigns={loadSavedAdDesigns}
                    onGraphicsStateChange={handleGraphicsStateChange}
                    onNotifySuccess={notifySuccess}
                    onNotifyError={(msg) => setActionError(msg)}
                  />
                </React.Suspense>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: UNLIMITED CAMERA & SMARTPHONE MANAGEMENT                 */}
          {/* ============================================================== */}
          {activeTab === 'cameras' && (
            <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Dynamic Camera Registry ({cameras.length} Cameras)
                  </h2>
                  <p className="text-xs text-slate-500">
                    No fixed camera limit — configure 2, 4, 6, 8, or more smartphone (VDO.Ninja), RTMP/MediaMTX, USB capture, or OBS sources.
                  </p>
                </div>

                {canManageCameras && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMapSourcesModalOpen(true)}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-900 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100"
                    >
                      <Sliders className="w-3.5 h-3.5 text-[#EA580C]" />
                      <span>Map OBS Sources</span>
                    </button>
                    {[2, 4, 6].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        disabled={scaffoldingCount !== null}
                        onClick={() => handleScaffoldCameras(cnt)}
                        className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50"
                      >
                        {scaffoldingCount === cnt ? `Adding ${cnt}...` : `+ Add ${cnt} Mobile Cams`}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setLarixTargetCamera(null);
                        setLarixModalOpen(true);
                        void loadMediaMTXConfig();
                      }}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800"
                    >
                      <Wifi className="w-3.5 h-3.5 text-[#EA580C]" />
                      <span>Add Camera → Larix Broadcaster</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCamera(null);
                        setCameraModalOpen(true);
                      }}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Camera</span>
                    </button>
                  </div>
                )}
              </div>

              {cameras.length === 0 ? (
                <EmptyState
                  icon={<Camera className="w-6 h-6" />}
                  title="No cameras configured for this match"
                  description="Add smartphone cameras individually or use Quick Add buttons above to provision multiple cameras immediately."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                        <th className="py-2.5 pr-3">Order</th>
                        <th className="py-2.5 pr-3">Camera / Angle</th>
                        <th className="py-2.5 pr-3">Transport &amp; Profile</th>
                        <th className="py-2.5 pr-3">OBS Scene / Source</th>
                        <th className="py-2.5 pr-3">Real Status</th>
                        <th className="py-2.5 pr-3">Operator</th>
                        <th className="py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {cameras.map((cam, idx) => (
                        <tr key={cam.cameraId} className={!cam.enabled ? 'opacity-55' : ''}>
                          <td className="py-3 pr-3 whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <span className="font-mono font-bold text-slate-700 w-6">
                                #{cam.cameraNumber}
                              </span>
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveCamera(idx, -1)}
                                className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-25"
                                title="Move Up"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === cameras.length - 1}
                                onClick={() => handleMoveCamera(idx, 1)}
                                className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-25"
                                title="Move Down"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>

                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900">{cam.label || cam.name}</span>
                              {cam.isDefault && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                  DEFAULT
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-mono text-slate-500">
                              {cam.name} · {cam.position || 'Unassigned position'}
                            </p>
                          </td>

                          <td className="py-3 pr-3 whitespace-nowrap">
                            <span className="font-mono font-semibold text-slate-800">
                              {cam.sourceType === 'mediamtx'
                                ? `LARIX / ${(cam.streamProtocol || 'rtmp').toUpperCase()}`
                                : cam.sourceType.toUpperCase()}
                            </span>
                            <p className="text-[11px] font-mono text-slate-500">
                              {cam.sourceType === 'mediamtx' && cam.mediamtxStreamPath
                                ? `Path: ${cam.mediamtxStreamPath}`
                                : `${cam.resolution} · ${cam.fps}fps · ${cam.bitrateKbps}kbps${
                                    cam.lowBandwidthMode ? ' · 4G Safe' : ''
                                  }`}
                            </p>
                          </td>

                          <td className="py-3 pr-3 font-mono text-[11px]">
                            <p className="text-slate-800">{cam.obsSceneName || '—'}</p>
                            <p className="text-slate-500">
                              {cam.obsInputName || '—'}
                              {cam.sourceType === 'mediamtx' && (
                                <span
                                  className={`ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    cam.obsSourceAvailable
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-amber-50 text-amber-800'
                                  }`}
                                >
                                  {cam.obsSourceAvailable ? 'OBS READY' : 'NEEDS SYNC'}
                                </span>
                              )}
                            </p>
                          </td>

                          <td className="py-3 pr-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-mono font-bold ${cameraStatusBadgeClass(
                                cam.status
                              )}`}
                            >
                              {cam.sourceType === 'mediamtx' && cam.mediamtxRevoked
                                ? 'REVOKED'
                                : cam.sourceType === 'mediamtx' && cam.mediamtxPublisherConnected
                                  ? 'LARIX STREAMING'
                                  : cam.status}
                            </span>
                            {cam.lastError && (
                              <p className="text-[10px] text-red-600 mt-1 max-w-[180px] truncate" title={cam.lastError}>
                                {cam.lastError}
                              </p>
                            )}
                          </td>

                          <td className="py-3 pr-3 text-slate-700">
                            {cam.operatorName || <span className="text-slate-400">Unassigned</span>}
                          </td>

                          <td className="py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              {cam.sourceType === 'mediamtx' ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={!obsConnected || assigningObsCamId === cam.cameraId || cam.mediamtxRevoked}
                                    onClick={() => handleAssignCameraToObs(cam)}
                                    title="Create or update FFmpeg Media Source in OBS Studio"
                                    className="min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-45"
                                  >
                                    <Layers className="w-3.5 h-3.5" />
                                    <span>{assigningObsCamId === cam.cameraId ? 'Syncing...' : 'Sync OBS'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLarixTargetCamera(cam);
                                      setLarixModalOpen(true);
                                      void loadMediaMTXConfig();
                                    }}
                                    title="Larix Server URL, Stream Key & Setup QR"
                                    className="min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#EA580C] bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100"
                                  >
                                    <Wifi className="w-3.5 h-3.5" />
                                    <span>Larix Setup</span>
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setWizardCamera(cam);
                                    setWizardConnectUrl(null);
                                  }}
                                  title="Smartphone Setup QR & OBS URL"
                                  className="min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#EA580C] bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100"
                                >
                                  <QrCode className="w-3.5 h-3.5" />
                                  <span>Setup QR</span>
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={testingCamId === cam.cameraId}
                                onClick={() => handleTestCamera(cam)}
                                className="min-h-[32px] px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100"
                              >
                                {testingCamId === cam.cameraId ? '...' : 'Test'}
                              </button>
                              <button
                                type="button"
                                disabled={mutingCamId === cam.cameraId}
                                onClick={() => handleToggleCameraAudio(cam)}
                                title="Toggle Camera Audio Mute"
                                className="min-h-[32px] px-2 py-1 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg"
                              >
                                {Boolean(cam.obsInputMuted ?? cam.audioMuted ?? cam.telemetry?.audioMuted) ? (
                                  <MicOff className="w-3.5 h-3.5 text-red-600" />
                                ) : (
                                  <Mic className="w-3.5 h-3.5" />
                                )}
                              </button>
                              {canManageCameras && (cam.status === 'CONNECTED' || cam.status === 'ACTIVE') && (
                                <button
                                  type="button"
                                  disabled={disconnectingCamId === cam.cameraId}
                                  onClick={() => handleDisconnectCamera(cam)}
                                  title="Disconnect Camera Session"
                                  className="min-h-[32px] px-2 py-1 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100"
                                >
                                  <Unplug className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canManageCameras && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleCameraField(
                                        cam,
                                        { enabled: !cam.enabled },
                                        `${cam.name} ${cam.enabled ? 'disabled' : 'enabled'}.`
                                      )
                                    }
                                    className="min-h-[32px] px-2 py-1 text-[11px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100"
                                  >
                                    {cam.enabled ? 'Disable' : 'Enable'}
                                  </button>
                                  {!cam.isDefault && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleToggleCameraField(
                                          cam,
                                          { isDefault: true },
                                          `${cam.name} set as primary default camera.`
                                        )
                                      }
                                      title="Set as Default Primary Camera"
                                      className="min-h-[32px] px-2 py-1 text-slate-500 hover:text-amber-600 border border-slate-200 rounded-lg"
                                    >
                                      <Star className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCamera(cam);
                                      setCameraModalOpen(true);
                                    }}
                                    title="Edit camera"
                                    className="min-h-[32px] px-2 py-1 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteCameraTarget(cam)}
                                    title="Delete camera"
                                    className="min-h-[32px] px-2 py-1 text-slate-500 hover:text-red-600 border border-slate-200 rounded-lg"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* ============================================================== */}
          {/* TAB 3: SCOREBOARD OVERLAY & SPONSORS SYNC                       */}
          {/* ============================================================== */}
          {activeTab === 'overlay' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900">
                      MaidanLive Scoreboard Browser Source
                    </h2>
                    <p className="text-xs text-slate-500">
                      Automatically injected above cameras in multi-cam scenes, synced live via Socket.IO.
                    </p>
                  </div>
                  <Link
                    to={`/broadcast/overlay/${matchId}`}
                    className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600"
                  >
                    <Tv className="w-3.5 h-3.5" />
                    <span>Open Full 16:9 Overlay Customizer</span>
                  </Link>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    OBS Scoreboard Browser Source URL (1920×1080 Transparent)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={studio.scoreboardOverlayUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 min-h-[38px] px-3 text-xs font-mono border border-slate-300 rounded-lg bg-slate-50"
                    />
                    <button
                      type="button"
                      onClick={() => copyText('sbUrl', studio.scoreboardOverlayUrl)}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3 text-xs font-semibold bg-slate-900 text-white rounded-lg"
                    >
                      {copiedKey === 'sbUrl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'sbUrl' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700 cursor-pointer hover:bg-slate-100/70">
                  <input
                    type="checkbox"
                    checked={studio.match.showScoreboardOnYoutube !== false}
                    disabled={togglingScoreboardOnYoutube || studio.match.status === 'ENDED'}
                    onChange={(e) => handleToggleScoreboardOnYoutube(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-slate-300 text-[#EA580C] shrink-0"
                  />
                  <span className="leading-snug">
                    <strong className="text-slate-900 block">
                      Scoreboard on YouTube (OBS Broadcast Output){' '}
                      {togglingScoreboardOnYoutube ? '· Saving...' : ''}
                    </strong>
                    {studio.match.showScoreboardOnYoutube !== false
                      ? 'Checked: OBS Browser Source renders the live scoreboard onto YouTube Live and MaidanLive.'
                      : 'Unchecked: OBS Browser Source stays blank so YouTube stays clean; scoreboard shows only inside MaidanLive embedded video.'}
                  </span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Scoreboard Visibility &amp; Mode
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {OVERLAY_MODES.map((m: OverlayMode) => {
                        const active = (currentOverlay.visible ? currentOverlay.mode : 'hidden') === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            disabled={savingOverlay}
                            onClick={() =>
                              handleUpdateOverlay({ mode: m, visible: m !== 'hidden' })
                            }
                            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                              active
                                ? 'bg-[#EA580C] text-white border-[#EA580C]'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {m === 'hidden' ? (
                              <span className="inline-flex items-center gap-1">
                                <EyeOff className="w-3.5 h-3.5" /> Hidden
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <Eye className="w-3.5 h-3.5" /> {m.replace('_', ' ').toUpperCase()}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Overlay Position
                    </label>
                    <select
                      value={currentOverlay.position}
                      disabled={savingOverlay}
                      onChange={(e) =>
                        handleUpdateOverlay({ position: e.target.value as OverlayPosition })
                      }
                      className="w-full min-h-[38px] px-3 text-xs font-semibold border border-slate-300 rounded-lg bg-white"
                    >
                      {OVERLAY_POSITIONS.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>

                    <label className="block text-xs font-semibold text-slate-700 mt-3 mb-1.5">
                      Broadcast Theme
                    </label>
                    <select
                      value={currentOverlay.theme}
                      disabled={savingOverlay}
                      onChange={(e) =>
                        handleUpdateOverlay({ theme: e.target.value as OverlayTheme })
                      }
                      className="w-full min-h-[38px] px-3 text-xs font-semibold border border-slate-300 rounded-lg bg-white"
                    >
                      {OVERLAY_THEMES.map((th) => (
                        <option key={th} value={th}>
                          {OBS_THEME_MAP[th].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* OBS Scoreboard Size & Scale Control */}
                <div className="pt-3 border-t border-slate-200 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-slate-700">
                      OBS Scoreboard Size Preset &amp; Scale
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-slate-500">
                        Width {currentOverlayMetrics.barWidthPct}% · Scale{' '}
                        {Math.round(currentOverlayMetrics.overallScale * 100)}%
                      </span>
                      <button
                        type="button"
                        disabled={savingOverlay}
                        onClick={() =>
                          handleUpdateOverlay({ scale: 'medium', customScale: 1 })
                        }
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-300 rounded hover:bg-slate-200"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset</span>
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {OVERLAY_SCALES.map((sc: OverlayScale) => {
                      const active = currentOverlay.scale === sc;
                      return (
                        <button
                          key={sc}
                          type="button"
                          disabled={savingOverlay}
                          onClick={() => handleUpdateOverlay({ scale: sc })}
                          className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-semibold border capitalize transition-colors ${
                            active
                              ? 'bg-[#EA580C] text-white border-[#EA580C]'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {sc} ({Math.round(PRESET_SCALE_MULTIPLIERS[sc] * 100)}%)
                        </button>
                      );
                    })}
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">Fine Size Slider</span>
                      <span className="font-mono font-bold text-[#EA580C]">
                        {Math.round(currentOverlay.customScale * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={OVERLAY_SLIDER_BOUNDS.customScale.min}
                      max={OVERLAY_SLIDER_BOUNDS.customScale.max}
                      step={OVERLAY_SLIDER_BOUNDS.customScale.step}
                      value={currentOverlay.customScale}
                      aria-label="OBS Scoreboard Size Slider"
                      onChange={(e) =>
                        handleOverlaySliderChange('customScale', Number(e.target.value))
                      }
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#EA580C]"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSyncScoreboard}
                      onChange={(e) => setAutoSyncScoreboard(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#EA580C]"
                    />
                    <span>
                      Auto-create &amp; keep Scoreboard Browser Source on top when creating dynamic OBS scenes
                    </span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={scoreboardSourceName}
                      onChange={(e) => setScoreboardSourceName(e.target.value)}
                      placeholder="OBS Scoreboard Source Name"
                      className="flex-1 min-h-[36px] px-3 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      disabled={savingConn}
                      onClick={() => handleSaveConnectionSettings()}
                      className="min-h-[36px] px-4 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800"
                    >
                      Save OBS Overlay Rule
                    </button>
                  </div>
                </div>
              </section>

              {/* Active Broadcast Sponsors */}
              <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900">
                      Broadcast Sponsors ({profile.selectedSponsorIds.length} active)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Select tournament sponsors linked to this match broadcast.
                    </p>
                  </div>
                  {!isBroadcasterRole && (
                    <Link
                      to="/admin/sponsors"
                      className="text-xs font-semibold text-[#EA580C] hover:underline"
                    >
                      Manage Sponsors
                    </Link>
                  )}
                </div>

                {studio.sponsors.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No active sponsors configured yet. Add sponsors in Admin → Sponsors.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {studio.sponsors.map((sp) => {
                      const checked = profile.selectedSponsorIds.includes(sp.id);
                      return (
                        <label
                          key={sp.id}
                          className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border cursor-pointer ${
                            checked
                              ? 'border-[#EA580C] bg-orange-50/50'
                              : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {sp.logoUrl ? (
                              <img
                                src={sp.logoUrl}
                                alt={sp.name}
                                className="w-8 h-8 rounded object-contain bg-white border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded bg-slate-200 flex items-center justify-center text-[11px] font-bold text-slate-600 shrink-0">
                                {sp.name.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 truncate">{sp.name}</p>
                              <p className="text-[11px] text-slate-500 truncate">{sp.sponsorshipType}</p>
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={savingSponsors}
                            onChange={() => handleToggleSponsor(sp.id)}
                            className="w-4 h-4 rounded border-slate-300 text-[#EA580C] shrink-0"
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: ONE-CLICK WINDOWS OBS BRIDGE & CONNECTION STUDIO         */}
          {/* ============================================================== */}
          {activeTab === 'connection' && (() => {
            const activeMatchBridge =
              bridges.find(
                (b) =>
                  b.status === 'ACTIVE' &&
                  ((matchId && b.assignedMatchIds.includes(matchId)) || b.connectionStatus === 'ONLINE')
              ) || bridges.find((b) => b.status === 'ACTIVE') || null;
            const bridgeIsOnline = Boolean(
              profile.agentOnline || activeMatchBridge?.connectionStatus === 'ONLINE'
            );
            const installerSizeMb =
              installerStatus?.sizeBytes && installerStatus.sizeBytes > 0
                ? `${(installerStatus.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
                : 'Windows x64 Installer';
            const countdownMin = String(Math.floor(pairingRemainingSec / 60)).padStart(2, '0');
            const countdownSec = String(pairingRemainingSec % 60).padStart(2, '0');

            return (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* BEGINNER-FRIENDLY ONE-CLICK WINDOWS BRIDGE SETUP CARD */}
              <section className="lg:col-span-12 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Laptop className="w-4 h-4 text-[#EA580C]" />
                      <h2 className="font-display text-base font-bold text-slate-900">
                        MaidanLive Windows OBS Bridge (One-Click Desktop App)
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      No Node.js, terminal commands, or JSON editing required. Install once on your streaming PC, pair in one click, and switch OBS scenes remotely while YouTube Live stays continuous.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={checkInstallerAndLocalBridge}
                      disabled={probingLocalBridge}
                      className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${probingLocalBridge ? 'animate-spin' : ''}`} />
                      <span>Check Local App</span>
                    </button>
                    <button
                      type="button"
                      onClick={loadBridges}
                      disabled={loadingBridges}
                      className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingBridges ? 'animate-spin' : ''}`} />
                      <span>Refresh Status</span>
                    </button>
                  </div>
                </div>

                {/* Clear Real-Time Bridge & OBS Status Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                    <p className="text-[11px] font-semibold text-slate-500">Desktop Bridge App</p>
                    <div className="mt-1 flex items-center gap-2">
                      {localBridgeProbe?.running ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                          <CheckCircle2 className="w-4 h-4" />
                          Running Locally on PC
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                          <Circle className="w-3.5 h-3.5 text-slate-400" />
                          Not Detected in Browser
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {localBridgeProbe?.running
                        ? localBridgeProbe.paired
                          ? `Paired (${localBridgeProbe.bridgeId || 'Active'})`
                          : 'Ready to pair in 1 click'
                        : 'Download & launch setup if not installed'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                    <p className="text-[11px] font-semibold text-slate-500">Bridge Connection</p>
                    <div className="mt-1 flex items-center gap-2">
                      {bridgeIsOnline ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                          <Wifi className="w-4 h-4" />
                          ONLINE ({activeMatchBridge?.bridgeId || profile.agentLabel || 'Connected'})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                          <WifiOff className="w-4 h-4 text-slate-400" />
                          OFFLINE
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Outbound secure tunnel (zero router ports)
                    </p>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                    <p className="text-[11px] font-semibold text-slate-500">OBS Studio (Local PC)</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${obsStatusBadgeClass(
                          profile.connectionStatus
                        )}`}
                      >
                        OBS {profile.connectionStatus}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {obsConnected
                        ? `${profile.obsVersion || 'OBS'} · ${profile.obsScenes.length} scenes`
                        : profile.lastError || 'Waiting for OBS port 4455'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                    <p className="text-[11px] font-semibold text-slate-500">Assigned Match</p>
                    <p className="mt-1 text-xs font-bold text-slate-900 truncate" title={studio?.match?.matchTitle}>
                      {studio?.match?.matchTitle || 'Current Match'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Active Scene: <strong className="text-[#EA580C]">{profile.activeObsScene || 'None'}</strong>
                    </p>
                  </div>
                </div>

                {/* Primary Beginner Action Row */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {installerStatus?.available ? (
                    <a
                      href="/api/obs/bridge/installer/download"
                      download={installerStatus.fileName || 'MaidanLive OBS Bridge Setup.exe'}
                      className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-slate-900 rounded-xl hover:bg-slate-800 whitespace-nowrap shrink-0"
                    >
                      <Download className="w-4 h-4 text-[#EA580C]" />
                      <span>Download Windows Bridge ({installerSizeMb})</span>
                    </a>
                  ) : (
                    <span className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-xl">
                      <Download className="w-4 h-4" />
                      <span>Windows Installer Preparing...</span>
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => handleOpenOrPairBridge(activeMatchBridge?.bridgeId)}
                    disabled={generatingPairing}
                    className="min-h-[42px] inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-[#EA580C] rounded-xl hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    {generatingPairing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Laptop className="w-4 h-4" />
                    )}
                    <span>
                      {localBridgeProbe?.running
                        ? localBridgeProbe.paired
                          ? 'Re-Pair / Link This Match'
                          : 'Pair Running Bridge Now'
                        : 'Open / Pair Bridge'}
                    </span>
                  </button>

                  {obsConnected && (
                    <button
                      type="button"
                      onClick={handleSyncObsState}
                      disabled={refreshingScenes}
                      className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${refreshingScenes ? 'animate-spin' : ''}`} />
                      <span>Refresh Scenes</span>
                    </button>
                  )}

                  {activeMatchBridge && activeMatchBridge.connectionStatus === 'ONLINE' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleReconnectBridgeObs(activeMatchBridge)}
                        disabled={busyBridgeId === activeMatchBridge.bridgeId}
                        className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Reconnect OBS</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDisconnectBridge(activeMatchBridge)}
                        disabled={busyBridgeId === activeMatchBridge.bridgeId}
                        className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        <Unplug className="w-3.5 h-3.5" />
                        <span>Disconnect Bridge</span>
                      </button>
                    </>
                  )}
                </div>

                {/* Live 5-Minute Single-Use Pairing Code Box (Fallback if browser blocks protocol) */}
                {pairingInfo && (
                  <div className="p-4 rounded-xl bg-slate-950 text-slate-100 border border-slate-800 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-emerald-400">
                          One-Time Pairing Code Ready (Single-Use · Expires in{' '}
                          <span className="font-mono tabular-nums">
                            {countdownMin}:{countdownSec}
                          </span>
                          )
                        </p>
                        <p className="text-[11px] text-slate-300 mt-0.5">
                          If MaidanLive OBS Bridge did not open automatically, open it from your Windows Desktop shortcut and enter this Pairing Code:
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPairingInfo(null)}
                        className="text-xs text-slate-400 hover:text-white px-2 py-1"
                      >
                        Dismiss
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xl font-extrabold tracking-[0.18em] text-amber-300 tabular-nums">
                        {pairingInfo.pairingCode}
                      </div>
                      <button
                        type="button"
                        onClick={() => copyText('pairCode', pairingInfo.pairingCode)}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EA580C] text-white text-xs font-bold hover:bg-orange-600"
                      >
                        {copiedKey === 'pairCode' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>Copy Code</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => copyText('pairServer', pairingInfo.serverUrl)}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-100 text-xs font-semibold hover:bg-slate-700"
                      >
                        {copiedKey === 'pairServer' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>Copy Server URL</span>
                      </button>
                      <a
                        href={pairingInfo.protocolUrl}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-100 text-xs font-semibold hover:bg-slate-700"
                      >
                        <Laptop className="w-3.5 h-3.5" />
                        <span>Launch App Protocol</span>
                      </a>
                    </div>
                  </div>
                )}

                {/* Dynamic OBS Scenes Quick Switcher (Zero Hardcoded Scenes) */}
                {profile.obsScenes.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-800">
                        Discovered OBS Studio Scenes ({profile.obsScenes.length}) — Click to Switch Live
                      </p>
                      <span className="text-[11px] font-mono text-slate-500">
                        Active Program Scene: <strong className="text-[#EA580C]">{profile.activeObsScene || 'None'}</strong>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {profile.obsScenes.map((sceneName) => {
                        const isActive = profile.activeObsScene === sceneName;
                        const label = profile.sceneLabels?.[sceneName] || sceneName;
                        return (
                          <button
                            key={sceneName}
                            type="button"
                            onClick={() => handleSwitchSceneName(sceneName)}
                            disabled={!obsConnected || switchingKey === sceneName}
                            className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                              isActive
                                ? 'bg-[#EA580C] text-white border-[#EA580C]'
                                : 'bg-slate-50 text-slate-800 border-slate-300 hover:border-[#EA580C]'
                            } disabled:opacity-50`}
                          >
                            <Layers className="w-3.5 h-3.5" />
                            <span>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              {/* Registered Windows Local OBS Bridges Panel (Paired Devices List + Advanced Toggle) */}
              <section className="lg:col-span-12 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-[#EA580C]" />
                      <h2 className="font-display text-base font-bold text-slate-900">
                        Paired Bridges &amp; Match Assignments
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Manage authorized OBS Bridge devices, switch assigned matches, reconnect OBS, or revoke access at any time.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedBridgeSetup((v) => !v)}
                    className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>
                      {showAdvancedBridgeSetup
                        ? 'Hide Advanced / Manual Setup'
                        : 'Advanced: Manual Registration & Direct WS'}
                    </span>
                  </button>
                </div>

                {/* Register New Bridge Form (Shown inside Advanced Manual Setup) */}
                {showAdvancedBridgeSetup && (
                <form
                  onSubmit={handleRegisterBridge}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end bg-slate-50 border border-slate-200 rounded-xl p-3.5"
                >
                  <div className="lg:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Bridge Name
                    </label>
                    <input
                      type="text"
                      value={bridgeNameDraft}
                      onChange={(e) => setBridgeNameDraft(e.target.value)}
                      placeholder="e.g. Ground Laptop OBS"
                      className="w-full min-h-[38px] px-3 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Device / Operator Label
                    </label>
                    <input
                      type="text"
                      value={bridgeLabelDraft}
                      onChange={(e) => setBridgeLabelDraft(e.target.value)}
                      placeholder="e.g. Stadium Pitch-1 Windows PC"
                      className="w-full min-h-[38px] px-3 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Bridge Owner
                    </label>
                    <select
                      value={bridgeOwnerDraft}
                      onChange={(e) => setBridgeOwnerDraft(e.target.value)}
                      className="w-full min-h-[38px] px-3 text-xs bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="">Current User ({adminUser?.name || 'Me'})</option>
                      {(studio?.operators || []).map((op) => (
                        <option key={op.id} value={op.id}>
                          {op.name} ({op.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="lg:col-span-3 flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={assignBridgeToCurrentMatch}
                        onChange={(e) => setAssignBridgeToCurrentMatch(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-[#EA580C]"
                      />
                      <span>Assign to match</span>
                    </label>
                    <button
                      type="submit"
                      disabled={registeringBridge}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{registeringBridge ? 'Registering...' : 'Register Windows Bridge'}</span>
                    </button>
                  </div>
                </form>
                )}

                {/* One-Time Generated Bridge Token & Downloadable config.json */}
                {createdBridgeSecret && (
                  <div className="p-4 rounded-xl bg-slate-950 text-slate-100 border border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-emerald-400">
                          Bridge Credentials Ready (Token shown once — store locally on your OBS laptop):
                        </p>
                        <p className="text-[11px] font-mono text-slate-300 mt-0.5">
                          Bridge ID: <strong className="text-white">{createdBridgeSecret.bridge.bridgeId}</strong> · Token Prefix: {createdBridgeSecret.bridge.tokenPrefix}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => downloadBridgeConfigJson(createdBridgeSecret)}
                          className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EA580C] text-white text-xs font-bold hover:bg-orange-600 whitespace-nowrap shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download config.json</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => copyText('bridgeCmd', createdBridgeSecret.command)}
                          className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-xs font-semibold hover:bg-slate-700 whitespace-nowrap shrink-0"
                        >
                          {copiedKey === 'bridgeCmd' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>Copy CLI</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCreatedBridgeSecret(null)}
                          className="min-h-[34px] px-2.5 py-1 text-xs text-slate-400 hover:text-white"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                    <pre className="text-[11px] font-mono whitespace-pre-wrap break-all bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-slate-200">
                      {createdBridgeSecret.command}
                    </pre>
                    <p className="text-[11px] text-slate-400">
                      Tip: Open the downloaded <span className="font-mono text-slate-200">config.json</span> inside <span className="font-mono text-slate-200">deploy/obs-agent/</span> and replace <span className="font-mono text-amber-300">YOUR_OBS_WEBSOCKET_PASSWORD</span> with your local OBS Studio port 4455 password, then run <span className="font-mono text-slate-200">start-windows-bridge.bat</span>.
                    </p>
                  </div>
                )}

                {/* Registered Bridges Table / Cards */}
                {bridges.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2">
                    No registered Windows OBS bridges yet. Click <strong>Register Windows Bridge</strong> above to generate your persistent Bridge ID and <span className="font-mono">config.json</span>.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {bridges.map((br) => {
                      const isAssigned = matchId ? br.assignedMatchIds.includes(matchId) : false;
                      const isRevoked = br.status === 'REVOKED';
                      const isOnline = br.connectionStatus === 'ONLINE' && !isRevoked;
                      const busy = busyBridgeId === br.bridgeId;
                      return (
                        <div
                          key={br.bridgeId}
                          className={`p-3.5 rounded-xl border space-y-2.5 ${
                            isRevoked
                              ? 'border-red-200 bg-red-50/40'
                              : isOnline && isAssigned
                                ? 'border-emerald-300 bg-emerald-50/30'
                                : 'border-slate-200 bg-slate-50/70'
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-mono text-xs font-bold text-slate-900">
                                  {br.bridgeId}
                                </span>
                                <span className="text-xs font-bold text-slate-800 truncate">
                                  · {br.name}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                Owner: <strong>{br.ownerName || 'Admin'}</strong>
                                {br.label && br.label !== br.name ? ` · ${br.label}` : ''}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                  isRevoked
                                    ? 'bg-red-100 text-red-800 border-red-200'
                                    : isOnline
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                      : 'bg-slate-200 text-slate-700 border-slate-300'
                                }`}
                              >
                                {isRevoked ? 'REVOKED' : isOnline ? 'ONLINE' : 'OFFLINE'}
                              </span>
                              {!isRevoked && (
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${obsStatusBadgeClass(
                                    br.obsStatus
                                  )}`}
                                >
                                  OBS {br.obsStatus}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-[11px] font-mono text-slate-600 space-y-0.5">
                            <p>
                              Token: {br.tokenPrefix || '—'} · Matches: {br.assignedMatchIds.length}
                              {br.obsVersion ? ` · OBS ${br.obsVersion}` : ''}
                            </p>
                            {br.activeObsScene && isOnline && (
                              <p className="text-[#EA580C] font-semibold">
                                Active Scene: {br.activeObsScene} ({br.obsScenes.length} scenes)
                              </p>
                            )}
                            {br.lastConnectedAt && (
                              <p className="text-slate-500">
                                Last Connected: {new Date(br.lastConnectedAt).toLocaleString()}
                              </p>
                            )}
                            {br.lastError && (
                              <p className="text-red-700 truncate" title={br.lastError}>
                                {br.lastError}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200/80">
                            {matchId && !isRevoked && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleToggleBridgeMatch(br)}
                                className={`min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border whitespace-nowrap shrink-0 ${
                                  isAssigned
                                    ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                                    : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                                } disabled:opacity-50`}
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>{isAssigned ? 'Assigned to Match' : 'Attach to Match'}</span>
                              </button>
                            )}
                            {!isRevoked ? (
                              <>
                                {isOnline && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => handleReconnectBridgeObs(br)}
                                      className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap shrink-0"
                                    >
                                      <RefreshCw className="w-3 h-3" />
                                      <span>Reconnect OBS</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => handleDisconnectBridge(br)}
                                      className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 disabled:opacity-50 whitespace-nowrap shrink-0"
                                    >
                                      <Unplug className="w-3 h-3" />
                                      <span>Disconnect</span>
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleRotateBridgeToken(br)}
                                  className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap shrink-0"
                                >
                                  <KeyRound className="w-3 h-3" />
                                  <span>Rotate Token</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleRevokeBridge(br)}
                                  className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50 whitespace-nowrap shrink-0"
                                >
                                  <Ban className="w-3 h-3" />
                                  <span>Revoke</span>
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleReactivateBridge(br)}
                                className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Reactivate Bridge</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {showAdvancedBridgeSetup && (
              <>
              <form
                onSubmit={handleSaveConnectionSettings}
                className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900">
                      OBS Studio Connection Architecture
                    </h2>
                    <p className="text-xs text-slate-500">
                      Use <strong>Local OBS Controller Agent</strong> when OBS runs on a ground laptop behind NAT/router, or <strong>Direct WebSocket</strong> on LAN/VPS.
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border ${obsStatusBadgeClass(
                      profile.connectionStatus
                    )}`}
                  >
                    {profile.connectionStatus}
                  </span>
                </div>

                {/* Mode Switcher */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setConnMode('local_agent')}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      connMode === 'local_agent'
                        ? 'border-[#EA580C] bg-orange-50/70'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      <Terminal className="w-4 h-4 text-[#EA580C]" />
                      <span>Local OBS Controller Agent (Recommended)</span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Small Node agent on the OBS laptop connects outbound to MaidanLive—zero port forwarding required.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConnMode('direct_ws')}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      connMode === 'direct_ws'
                        ? 'border-[#EA580C] bg-orange-50/70'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      <Server className="w-4 h-4 text-[#EA580C]" />
                      <span>Direct OBS WebSocket v5</span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Backend connects directly to <span className="font-mono">ws(s)://host:4455</span> when OBS is reachable by the server.
                    </p>
                  </button>
                </div>

                {/* Direct WS & Room Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Protocol</label>
                    <select
                      value={obsProtocol}
                      onChange={(e) => setObsProtocol(e.target.value as 'ws' | 'wss')}
                      className="w-full min-h-[40px] px-3 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="ws">ws://</option>
                      <option value="wss">wss:// (TLS)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">OBS Host / IP</label>
                    <input
                      type="text"
                      value={obsHost}
                      onChange={(e) => setObsHost(e.target.value)}
                      placeholder="127.0.0.1"
                      className="w-full min-h-[40px] px-3 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">OBS Port</label>
                    <input
                      type="number"
                      value={obsPort}
                      onChange={(e) => setObsPort(e.target.value)}
                      placeholder="4455"
                      className="w-full min-h-[40px] px-3 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      OBS WebSocket Password {profile.hasPassword ? '(Encrypted & Saved)' : ''}
                    </label>
                    <input
                      type="password"
                      value={obsPassword}
                      onChange={(e) => setObsPassword(e.target.value)}
                      placeholder={
                        profile.hasPassword
                          ? 'Saved encrypted — enter only to replace'
                          : 'OBS Tools → WebSocket Server Settings password'
                      }
                      className="w-full min-h-[40px] px-3 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      VDO.Ninja Room Identifier
                    </label>
                    <input
                      type="text"
                      value={vdoRoomName}
                      onChange={(e) => setVdoRoomName(e.target.value)}
                      className="w-full min-h-[40px] px-3 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="submit"
                    disabled={savingConn}
                    className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200"
                  >
                    {savingConn ? 'Saving...' : 'Save Settings'}
                  </button>

                  {connMode === 'direct_ws' && (
                    <button
                      type="button"
                      disabled={testingConn}
                      onClick={handleTestObsConnection}
                      className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                    >
                      {testingConn ? 'Testing OBS WS...' : 'Test Connection'}
                    </button>
                  )}

                  {obsConnected ? (
                    <button
                      type="button"
                      disabled={connectingObs}
                      onClick={handleDisconnectObs}
                      className="min-h-[40px] px-4 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
                    >
                      Disconnect OBS
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={connectingObs}
                      onClick={handleConnectObs}
                      className="min-h-[40px] px-5 py-2 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600"
                    >
                      {connectingObs
                        ? 'Connecting...'
                        : connMode === 'local_agent'
                          ? 'Sync Agent State'
                          : 'Connect OBS Studio'}
                    </button>
                  )}
                </div>
              </form>

              {/* Local OBS Controller Agent Panel */}
              <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-[#EA580C]" />
                    <h3 className="font-display text-sm font-bold text-slate-900">
                      Local OBS Controller Agent
                    </h3>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                      profile.agentOnline
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {profile.agentOnline ? 'BRIDGE ONLINE' : 'BROADCASTER BRIDGE OFFLINE'}
                  </span>
                </div>

                <div className="text-xs text-slate-600 space-y-1.5">
                  <p>
                    Status:{' '}
                    <strong className="text-slate-900">
                      {profile.agentOnline
                        ? `Connected (${profile.agentLabel || 'OBS Host'})`
                        : 'BROADCASTER BRIDGE OFFLINE — Waiting for local agent handshake'}
                    </strong>
                  </p>
                  {profile.obsVersion && (
                    <p className="font-mono text-[11px] text-slate-500">
                      OBS {profile.obsVersion} · WebSocket {profile.obsWebSocketVersion}
                    </p>
                  )}
                  {profile.hasAgentToken && (
                    <p className="font-mono text-[11px] text-slate-500">
                      Active Token Prefix: <strong>{profile.agentTokenPrefix}...</strong>
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={generatingAgentToken}
                  onClick={handleGenerateAgentToken}
                  className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>
                    {generatingAgentToken
                      ? 'Minting Agent Token...'
                      : profile.hasAgentToken
                        ? 'Rotate Local Agent Token'
                        : 'Generate Local Agent Token'}
                  </span>
                </button>

                {generatedAgentInfo && (
                  <div className="p-3 rounded-xl bg-slate-950 text-slate-100 space-y-2 border border-slate-800">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-emerald-400">
                        Run on your Windows OBS laptop (token shown once):
                      </span>
                      <button
                        type="button"
                        onClick={() => copyText('agentCmd', generatedAgentInfo.command)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-xs"
                      >
                        {copiedKey === 'agentCmd' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>Copy</span>
                      </button>
                    </div>
                    <pre className="text-[11px] font-mono whitespace-pre-wrap break-all text-slate-200">
                      {generatedAgentInfo.command}
                    </pre>
                  </div>
                )}

                <ol className="text-[11px] text-slate-600 list-decimal list-inside space-y-1 pt-1">
                  <li>Open OBS Studio → <strong>Tools → WebSocket Server Settings</strong> → Enable server on port <strong>4455</strong>.</li>
                  <li>On Windows, either install <strong>MaidanLive OBS Bridge Setup.exe</strong> or use legacy CLI <span className="font-mono">deploy/obs-agent</span>.</li>
                  <li>Once online, switch cameras, toggle scene sources, apply split layouts, and monitor YouTube Live continuously.</li>
                </ol>
              </section>
              </>
              )}

              {/* Local MediaMTX Receiver (Optional — Required Only For Larix Broadcaster) */}
              <section className="lg:col-span-12 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Wifi className="w-4 h-4 text-[#EA580C]" />
                      <h3 className="font-display text-sm font-bold text-slate-900 uppercase tracking-wide">
                        Local MediaMTX Receiver (Optional — For Larix Broadcaster Cameras)
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                          profile.mediamtxState?.running
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {profile.mediamtxState?.running
                          ? 'MEDIAMTX RUNNING'
                          : profile.mediamtxState?.installed
                            ? 'INSTALLED (STOPPED)'
                            : 'NOT DETECTED (OPTIONAL)'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Receives direct RTMP/SRT mobile streams from Larix Broadcaster on your broadcasting PC. VDO.Ninja cameras continue working independently even if MediaMTX is stopped.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!profile.agentOnline || busyMediamtxAction !== null}
                      onClick={() => handleControlMediaMTX('status')}
                      className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-45"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${busyMediamtxAction === 'status' ? 'animate-spin' : ''}`} />
                      <span>Check Status</span>
                    </button>
                    <button
                      type="button"
                      disabled={!profile.agentOnline || busyMediamtxAction !== null}
                      onClick={() => handleControlMediaMTX('sync_config')}
                      className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-45"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Sync mediamtx.yml</span>
                    </button>
                    {profile.mediamtxState?.running ? (
                      <button
                        type="button"
                        disabled={!profile.agentOnline || busyMediamtxAction !== null}
                        onClick={() => handleControlMediaMTX('stop')}
                        className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-45"
                      >
                        <Square className="w-3.5 h-3.5" />
                        <span>{busyMediamtxAction === 'stop' ? 'Stopping...' : 'Stop MediaMTX'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!profile.agentOnline || busyMediamtxAction !== null}
                        onClick={() => handleControlMediaMTX('start')}
                        className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-45"
                      >
                        <Radio className="w-3.5 h-3.5" />
                        <span>{busyMediamtxAction === 'start' ? 'Starting...' : 'Start MediaMTX'}</span>
                      </button>
                    )}
                    {mediamtxConfig?.yamlConfig && (
                      <button
                        type="button"
                        onClick={() => copyText('mtxYaml', mediamtxConfig.yamlConfig)}
                        className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200"
                      >
                        {copiedKey === 'mtxYaml' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>Copy mediamtx.yml</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Ingest Endpoints (.env)
                    </p>
                    <p className="font-mono text-[11px] text-slate-900 mt-1 truncate">
                      RTMP: {mediamtxConfig?.envConfig?.rtmpBase || 'rtmp://localhost:1935'}
                    </p>
                    <p className="font-mono text-[11px] text-slate-700 truncate">
                      SRT: {mediamtxConfig?.envConfig?.srtBase || 'srt://localhost:8890'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Local Ports
                    </p>
                    <p className="font-mono text-[11px] text-slate-900 mt-1">
                      1935 (RTMP): {profile.mediamtxState?.rtmpPortOpen ? 'OPEN' : 'IDLE'}
                    </p>
                    <p className="font-mono text-[11px] text-slate-700">
                      8890 (SRT): {profile.mediamtxState?.srtPortOpen ? 'OPEN' : 'IDLE'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Detected LAN IPs (For Phones)
                    </p>
                    <p className="font-mono text-[11px] text-slate-900 mt-1 truncate">
                      {(profile.mediamtxState?.lanIps?.length
                        ? profile.mediamtxState.lanIps
                        : mediamtxConfig?.lanIps || []
                      ).join(', ') || 'No LAN IP detected'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Active Ingest Streams
                    </p>
                    <p className="font-mono text-[11px] text-slate-900 mt-1">
                      {profile.mediamtxState?.activePathCount ?? 0} active path(s)
                    </p>
                    {profile.mediamtxState?.lastError && (
                      <p className="text-[10px] text-red-600 truncate mt-0.5" title={profile.mediamtxState.lastError}>
                        {profile.mediamtxState.lastError}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {/* Beginner-Friendly Windows Setup & Verification Checklist */}
              <section className="lg:col-span-12 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
                <h3 className="font-display text-sm font-bold text-slate-900 uppercase tracking-wide">
                  One-Click Windows Broadcast Setup Guide (Zero-Cost Stack)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
                  <div className="space-y-1.5">
                    <p className="font-bold text-slate-900">1. Install MaidanLive OBS Bridge</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Click <strong>Download Windows Bridge</strong> above and run the installer once (no Node.js needed).</li>
                      <li>Open OBS Studio 28+ (free, built-in WebSocket v5).</li>
                      <li>Go to Tools → WebSocket Server Settings → Enable WebSocket server (port <strong>4455</strong>) &amp; set a password.</li>
                      <li>Paste your YouTube Live Stream Key in OBS Settings → Stream → YouTube - RTMPS.</li>
                    </ol>
                  </div>
                  <div className="space-y-1.5">
                    <p className="font-bold text-slate-900">2. Pair in One Click &amp; Connect OBS</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Click <strong>Open / Pair Bridge</strong> above (or enter the 8-character Pairing Code / sign in inside the app).</li>
                      <li>Enter your OBS port 4455 password once inside the desktop app (saved with Windows DPAPI encryption).</li>
                      <li>Verify status reads <span className="font-mono font-semibold text-emerald-700">OBS CONNECTED</span> and your OBS scenes appear dynamically.</li>
                      <li>Click Start Streaming once in OBS for a single continuous YouTube Live feed.</li>
                    </ol>
                  </div>
                  <div className="space-y-1.5">
                    <p className="font-bold text-slate-900">3. Switch Live &amp; Verify Match Page</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Paste your YouTube Live URL/ID in Live Switching &amp; Multi-Cam so viewers see your broadcast.</li>
                      <li>Click any camera or scene button; OBS switches scenes remotely without restarting YouTube Live.</li>
                      <li>Minimize the Windows Bridge to the System Tray—it runs quietly and auto-reconnects if dropped.</li>
                      <li>Use <strong>Show Monitor</strong> on a live match row inside Admin Live Streams to preview the broadcast anytime.</li>
                    </ol>
                  </div>
                </div>
              </section>
            </div>
            );
          })()}

          {/* ============================================================== */}
          {/* TAB 5: BROADCAST PRODUCTION AUDIT LOGS                          */}
          {/* ============================================================== */}
          {activeTab === 'audit' && (
            <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Broadcast Production Audit Trail
                  </h2>
                  <p className="text-xs text-slate-500">
                    Every OBS connection, camera switch, multi-cam layout change, Admin Override, and rejected request is logged.
                  </p>
                </div>

                <select
                  value={auditFilter}
                  onChange={(e) => setAuditFilter(e.target.value)}
                  className="min-h-[36px] px-3 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">All Actions</option>
                  <option value="CAMERA_SWITCH">CAMERA_SWITCH</option>
                  <option value="LAYOUT_SWITCH">LAYOUT_SWITCH</option>
                  <option value="SCENE_SWITCH">SCENE_SWITCH</option>
                  <option value="OBS_CONNECT">OBS_CONNECT</option>
                  <option value="OBS_DISCONNECT">OBS_DISCONNECT</option>
                  <option value="OBS_STREAM_START">OBS_STREAM_START</option>
                  <option value="OBS_STREAM_STOP">OBS_STREAM_STOP</option>
                  <option value="OBS_RECORD_START">OBS_RECORD_START</option>
                  <option value="OBS_RECORD_STOP">OBS_RECORD_STOP</option>
                  <option value="CAMERA_AUDIO_TOGGLE">CAMERA_AUDIO_TOGGLE</option>
                  <option value="CAMERA_DISCONNECTED">CAMERA_DISCONNECTED</option>
                  <option value="BROADCAST_SESSION_STARTED">BROADCAST_SESSION_STARTED</option>
                  <option value="BROADCAST_SESSION_ENDED">BROADCAST_SESSION_ENDED</option>
                  <option value="CONTROLLER_TAKEOVER">CONTROLLER_TAKEOVER</option>
                  <option value="ADMIN_OVERRIDE_ON">ADMIN_OVERRIDE_ON</option>
                  <option value="ADMIN_OVERRIDE_OFF">ADMIN_OVERRIDE_OFF</option>
                  <option value="CAMERA_CREATED">CAMERA_CREATED</option>
                  <option value="CAMERA_TEST">CAMERA_TEST</option>
                  <option value="GRAPHICS_SAVED">GRAPHICS_SAVED</option>
                  <option value="GRAPHICS_SHOWN_LIVE">GRAPHICS_SHOWN_LIVE</option>
                  <option value="GRAPHICS_HIDDEN">GRAPHICS_HIDDEN</option>
                  <option value="GRAPHICS_CLEARED">GRAPHICS_CLEARED</option>
                  <option value="GRAPHICS_QUEUE_UPDATED">GRAPHICS_QUEUE_UPDATED</option>
                  <option value="GRAPHICS_EVENT_TRIGGERED">GRAPHICS_EVENT_TRIGGERED</option>
                  <option value="GRAPHICS_ASSET_UPLOADED">GRAPHICS_ASSET_UPLOADED</option>
                  <option value="GRAPHICS_DELETED">GRAPHICS_DELETED</option>
                </select>
              </div>

              {filteredAuditLogs.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  No broadcast audit events recorded for this filter yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                        <th className="py-2 pr-3">Timestamp</th>
                        <th className="py-2 pr-3">Action</th>
                        <th className="py-2 pr-3">Operator</th>
                        <th className="py-2 pr-3">Transition</th>
                        <th className="py-2 pr-3">OBS Status</th>
                        <th className="py-2">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredAuditLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="py-2.5 pr-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="py-2.5 pr-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                            {log.actionType}
                            {log.adminOverride && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[9px]">
                                OVERRIDE
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 whitespace-nowrap">
                            <span className="font-semibold text-slate-900">{log.userName || 'System'}</span>
                            {log.userRole && (
                              <span className="text-[10px] text-slate-500 ml-1">({log.userRole})</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-[11px] text-slate-700">
                            {log.previousScene || log.newScene
                              ? `${log.previousScene || '—'} → ${log.newScene || '—'}`
                              : log.cameraName || log.cameraId || '—'}
                            {log.layoutSelected ? ` [${log.layoutSelected}]` : ''}
                          </td>
                          <td className="py-2.5 pr-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                log.obsStatus === 'SUCCESS'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : log.obsStatus === 'REJECTED'
                                    ? 'bg-amber-50 text-amber-800'
                                    : 'bg-red-50 text-red-700'
                              }`}
                            >
                              {log.obsStatus}
                            </span>
                          </td>
                          <td className="py-2.5 text-[11px] text-slate-600 max-w-xs truncate" title={log.errorDetails}>
                            {log.errorDetails || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* Camera Add/Edit Modal */}
      <CameraFormModal
        open={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        editingCamera={editingCamera}
        operators={studio?.operators || []}
        vdoRoomName={profile?.vdoRoomName || ''}
        onSave={handleSaveCamera}
      />

      {/* Smartphone Connection QR Wizard Modal */}
      <SmartphoneWizardModal
        open={Boolean(wizardCamera)}
        onClose={() => {
          setWizardCamera(null);
          setWizardConnectUrl(null);
        }}
        camera={wizardCamera}
        mobileConnectUrl={wizardConnectUrl}
        onRotateLink={handleRotatePhoneLink}
      />

      {/* Larix Broadcaster + MediaMTX Connection Modal */}
      {matchId && (
        <LarixConnectionModal
          open={larixModalOpen}
          onClose={() => {
            setLarixModalOpen(false);
            setLarixTargetCamera(null);
          }}
          matchId={matchId}
          matchTitle={studio?.match?.matchTitle || 'Current Match'}
          camera={
            larixTargetCamera
              ? cameras.find((c) => c.cameraId === larixTargetCamera.cameraId) || larixTargetCamera
              : null
          }
          obsConnected={obsConnected}
          mediamtxConfig={mediamtxConfig}
          mediamtxState={profile?.mediamtxState || mediamtxConfig?.mediamtxState || null}
          onCreateLarixCamera={handleCreateLarixCamera}
          onSwitchProtocol={handleSwitchLarixProtocol}
          onRotateCredentials={handleRotateLarixCredentials}
          onRevokeCredentials={handleRevokeLarixCredentials}
          onAssignToObs={handleAssignCameraToObs}
          onRestartObsInput={handleReconnectCamera}
          onTestCamera={handleTestCamera}
        />
      )}

      {/* Delete Camera Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteCameraTarget)}
        title={`Remove ${deleteCameraTarget?.name || 'Camera'}?`}
        message={`This revokes the smartphone link for "${deleteCameraTarget?.label || deleteCameraTarget?.name}" and removes it from this match studio.`}
        confirmLabel="Remove Camera"
        variant="danger"
        loading={deletingCamera}
        onConfirm={handleDeleteCamera}
        onClose={() => setDeleteCameraTarget(null)}
      />

      {/* Admin Override Reason Modal */}
      <Modal
        open={overrideModalOpen}
        onClose={() => setOverrideModalOpen(false)}
        title="Engage Admin Override Lock"
        subtitle="Temporarily lock OBS scene switching so only Admins/Super Admins can change live camera feeds."
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Override Reason (Logged in Broadcast Audit Trail)
            </label>
            <input
              type="text"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g. Finals last-over director takeover"
              className="w-full min-h-[40px] px-3 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOverrideModalOpen(false)}
              className="min-h-[38px] px-4 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={togglingOverride}
              onClick={() => handleConfirmOverride(true)}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>{togglingOverride ? 'Locking...' : 'Engage Override Lock'}</span>
            </button>
          </div>
        </div>
      </Modal>
      {/* Bilingual Broadcast Control Room Guide Drawer (Hinglish + English) */}
      <BroadcastGuideDrawer
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        onJumpTo={handleGuideJump}
      />

      {/* Dynamic OBS Camera Source Mapping Modal */}
      <CameraSourceMappingModal
        open={mapSourcesModalOpen}
        onClose={() => setMapSourcesModalOpen(false)}
        obsConnected={obsConnected}
        obsInputs={discoveredObsInputs}
        obsScenes={profile?.obsScenes || []}
        existingCameras={cameras}
        scoreboardSourceName={profile?.scoreboardSourceName || 'MaidanLive Scoreboard'}
        onRefreshObsInputs={handleRefreshObsInputs}
        onSaveMappings={handleSaveCameraMappings}
      />

      {/* Step 1 / Next Match Setup Modal */}
      <MatchSetupFormModal
        open={setupModalMode !== null}
        onClose={() => {
          setSetupModalMode(null);
          setSetupEditStream(null);
        }}
        mode={setupModalMode === 'edit' ? 'edit' : 'create'}
        initialStream={setupEditStream}
        onInitialized={async (created) => {
          setYtVerification(null);
          notifySuccess(
            `Match "${created.matchTitle || created.teamAName || 'New Match'}" initialized cleanly (Unpublished Draft).`
          );
          await Promise.all([loadMatches(), refreshStreams()]);
          navigate(`${studioBaseRoute}/${created.id}`);
        }}
        onUpdated={async () => {
          notifySuccess('Match setup metadata updated.');
          await Promise.all([refetch(), loadMatches()]);
        }}
      />

      {/* Step 7 Confirm End Broadcast */}
      <ConfirmDialog
        open={endConfirmOpen}
        onClose={() => setEndConfirmOpen(false)}
        onConfirm={handleConfirmEndBroadcast}
        loading={endingBroadcast}
        title="End MaidanLive Broadcast"
        message="This will end the broadcast on MaidanLive, preserve all final scores and match history, unpublish the active live stage, and allow initializing the next match cleanly."
        confirmLabel="End Broadcast"
      />
    </div>
  );
}
