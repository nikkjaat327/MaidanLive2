import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BatteryCharging,
  Camera,
  Check,
  ClipboardList,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Layers,
  Lock,
  Monitor,
  Play,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  Smartphone,
  Star,
  Terminal,
  Trash2,
  Tv,
  Unlock,
  Video,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { obsStudioService } from '../../services/obs/obsStudioService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { useObsStudio } from '../../hooks/useObsStudio.ts';
import type { LiveStreamData } from '../../types/index.ts';
import type { BroadcastCameraData, CameraConnectionStatus, ObsConnectionStatus } from '../../types/obs.ts';
import {
  OVERLAY_MODES,
  OVERLAY_POSITIONS,
  OVERLAY_THEMES,
  OverlayMode,
  OverlayPosition,
  OverlayTheme,
  normalizeOverlayConfig,
} from '../../utils/overlayConfig.ts';
import { OBS_THEME_MAP } from '../../components/obs/obsTheme.ts';
import type { ObsLayoutType } from '../../utils/obsLayoutGeometry.ts';
import { CameraFormModal, SmartphoneWizardModal } from '../../components/obsStudio/CameraSetupModal.tsx';
import { DynamicLayoutBuilder } from '../../components/obsStudio/DynamicLayoutBuilder.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';
import { Modal } from '../../components/common/Modal.tsx';

type StudioTab = 'live' | 'cameras' | 'overlay' | 'connection' | 'audit';

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

  const [matches, setMatches] = useState<LiveStreamData[]>([]);
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
    clearLiveErrorToast,
    refetch,
  } = useObsStudio(matchId);

  // Busy states
  const [switchingKey, setSwitchingKey] = useState<string | null>(null);
  const [applyingLayout, setApplyingLayout] = useState(false);
  const [testingCamId, setTestingCamId] = useState<string | null>(null);
  const [previewSnapshots, setPreviewSnapshots] = useState<Record<string, { imageData: string; capturedAt: string }>>({});
  const [capturingPreviewFor, setCapturingPreviewFor] = useState<string | null>(null);

  // Camera modals
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState<BroadcastCameraData | null>(null);
  const [wizardCamera, setWizardCamera] = useState<BroadcastCameraData | null>(null);
  const [wizardConnectUrl, setWizardConnectUrl] = useState<string | null>(null);
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

  // Overlay & Sponsor tab state
  const [savingOverlay, setSavingOverlay] = useState(false);
  const [savingSponsors, setSavingSponsors] = useState(false);

  // Audit log filter
  const [auditFilter, setAuditFilter] = useState('');

  // Load match selector list
  const loadMatches = useCallback(async () => {
    try {
      setLoadingMatches(true);
      const list = await liveStreamService.listStreams();
      setMatches(list);
      if (!matchId && list.length > 0) {
        const preferred = list.find((s) => s.status === 'LIVE') || list.find((s) => s.status === 'UPCOMING') || list[0];
        navigate(`/admin/broadcast-studio/${preferred.id}`, { replace: true });
      }
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to load matches list.'));
    } finally {
      setLoadingMatches(false);
    }
  }, [matchId, navigate]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

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
  }, [studio?.profile]);

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
  const enabledCameras = useMemo(() => cameras.filter((c) => c.enabled), [cameras]);
  const onlineCameraCount = useMemo(
    () => cameras.filter((c) => c.enabled && (c.status === 'CONNECTED' || c.status === 'ACTIVE')).length,
    [cameras]
  );

  // Camera CRUD handlers
  async function handleSaveCamera(payload: Partial<BroadcastCameraData>) {
    if (!matchId) return;
    try {
      setActionError(null);
      if (editingCamera) {
        await obsStudioService.updateCamera(matchId, editingCamera.cameraId, payload);
        notifySuccess(`Updated ${editingCamera.name}.`);
      } else {
        const res = await obsStudioService.createCamera(matchId, payload);
        setWizardCamera(res.camera);
        setWizardConnectUrl(res.mobileConnectUrl);
        notifySuccess(`Created ${res.camera.name} — scan QR or copy mobile setup link.`);
      }
      await refetch();
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to save camera.'));
      throw err;
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

  async function handleRotatePhoneLink(cameraId: string) {
    if (!matchId) return;
    try {
      const res = await obsStudioService.rotateCameraToken(matchId, cameraId);
      setWizardConnectUrl(res.mobileConnectUrl);
      notifySuccess('Generated fresh scoped smartphone setup QR link.');
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to generate smartphone link.'));
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
      notifySuccess(`Applied ${payload.layoutType} across ${payload.cameraIds.length} cameras in OBS (${res.sceneName || payload.sceneName || ''}).`);
      await refetch();
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

  async function handleCaptureSourcePreview(cam: BroadcastCameraData) {
    if (!matchId) return;
    const sourceName = cam.obsInputName || cam.name;
    try {
      setCapturingPreviewFor(cam.cameraId);
      setActionError(null);
      const res = await obsStudioService.capturePreview(matchId, sourceName);
      setPreviewSnapshots((prev) => ({
        ...prev,
        [cam.cameraId]: {
          imageData: res.imageData,
          capturedAt: new Date().toLocaleTimeString(),
        },
      }));
    } catch (err) {
      setActionError(extractApiError(err, `OBS could not capture frame for "${sourceName}".`));
    } finally {
      setCapturingPreviewFor(null);
    }
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
    const next = normalizeOverlayConfig({ ...current, ...patch });
    if (patch.mode === 'hidden') next.visible = false;
    else if (patch.mode && patch.visible === undefined) next.visible = true;
    if (patch.visible === true && next.mode === 'hidden') next.mode = 'full';

    setStudio((prev) =>
      prev ? { ...prev, match: { ...prev.match, overlayConfig: next } } : prev
    );
    try {
      setSavingOverlay(true);
      await liveStreamService.updateOverlayConfig(matchId, next);
      notifySuccess('Scoreboard overlay synced live to OBS Browser Source.');
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to update scoreboard overlay.'));
      await refetch();
    } finally {
      setSavingOverlay(false);
    }
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

  return (
    <div className="space-y-5">
      {/* Studio Header Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Video className="w-5 h-5 text-[#EA580C] shrink-0" />
            <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 truncate">
              Multi-Camera OBS Broadcast Studio
            </h1>
            {profile && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border ${obsStatusBadgeClass(
                  profile.connectionStatus
                )}`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    profile.connectionStatus === 'CONNECTED'
                      ? 'bg-emerald-500'
                      : profile.connectionStatus === 'ERROR'
                        ? 'bg-red-500'
                        : 'bg-slate-400'
                  }`}
                />
                OBS {profile.connectionStatus}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold border ${
                socketConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              {socketConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {socketConnected ? 'Sync Live' : 'Syncing...'}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Control unlimited smartphone &amp; studio cameras in OBS Studio — switches stream seamlessly into your continuous YouTube Live feed without restart.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            value={matchId || ''}
            disabled={loadingMatches}
            onChange={(e) => {
              if (e.target.value) navigate(`/admin/broadcast-studio/${e.target.value}`);
            }}
            aria-label="Select broadcast match"
            className="min-h-[38px] px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white max-w-[260px]"
          >
            {matches.length === 0 && <option value="">No matches available</option>}
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                [{m.status}] {m.matchTitle || `${m.teamAName || 'Team A'} vs ${m.teamBName || 'Team B'}`}
              </option>
            ))}
          </select>

          {matchId && (
            <>
              <Link
                to={`/broadcast/overlay/${matchId}`}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 whitespace-nowrap"
              >
                <Tv className="w-3.5 h-3.5 text-[#EA580C]" />
                <span>Overlay Studio</span>
              </Link>
              <Link
                to={`/admin/scoreboard/${matchId}`}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Scoreboard</span>
              </Link>
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
              className={`min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors whitespace-nowrap ${
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
          description="Create a match stream in Broadcasts first, then attach multi-camera OBS controls here."
          action={
            <Link
              to="/admin/live-streams"
              className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600"
            >
              <Radio className="w-4 h-4" />
              <span>Go to Broadcasts</span>
            </Link>
          }
        />
      ) : loading || !studio || !profile ? (
        <TableSkeleton rows={5} />
      ) : (
        <>
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
                  : '—'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                {obsConnected && profile.obsStats
                  ? `Dropped: ${profile.obsStats.outputSkippedFrames} frames`
                  : 'Connect OBS to read live telemetry'}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Stream Output (YouTube / RTMP)
              </p>
              <p
                className={`font-mono text-lg font-bold mt-1 ${
                  obsConnected && profile.obsStreamActive ? 'text-red-600' : 'text-slate-700'
                }`}
              >
                {obsConnected
                  ? profile.obsStreamActive
                    ? `OBS LIVE ${profile.obsStreamTimecode || ''}`
                    : 'OBS Output Idle'
                  : studio.match.status}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                Match: {studio.match.matchTitle} ({studio.match.activeStreamingProvider.toUpperCase()})
              </p>
            </div>
          </div>

          {/* 5 Workspace Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl overflow-x-auto">
            {[
              { id: 'live' as const, label: 'Live Switching & Layouts', icon: Monitor },
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
          {/* TAB 1: LIVE CAMERA SWITCHING & MULTI-CAMERA LAYOUT BUILDER      */}
          {/* ============================================================== */}
          {activeTab === 'live' && (
            <div className="space-y-6">
              {/* Live Single-Camera Cut Deck */}
              <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-[#EA580C]" />
                      <span>Instant Camera Cut Deck ({enabledCameras.length} Enabled)</span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Click <strong>Take Live</strong> to switch OBS Studio&apos;s active scene in real time. Status turns active only after OBS confirms the switch.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await obsStudioService.refreshObs(matchId!);
                          notifySuccess('Refreshed scenes and stats from OBS.');
                        } catch (err) {
                          setActionError(extractApiError(err, 'OBS Studio is not connected.'));
                        }
                      }}
                      disabled={!obsConnected}
                      className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Sync OBS State</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('cameras')}
                      className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Manage Cameras</span>
                    </button>
                  </div>
                </div>

                {enabledCameras.length === 0 ? (
                  <EmptyState
                    icon={<Smartphone className="w-6 h-6" />}
                    title="No cameras added for this match yet"
                    description="Quickly add 2, 4, 6, or unlimited smartphone/studio cameras to start switching live in OBS."
                    action={
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {[2, 4, 6].map((cnt) => (
                          <button
                            key={cnt}
                            type="button"
                            disabled={scaffoldingCount !== null}
                            onClick={() => handleScaffoldCameras(cnt)}
                            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50"
                          >
                            {scaffoldingCount === cnt ? `Adding ${cnt}...` : `+ Quick Add ${cnt} Cameras`}
                          </button>
                        ))}
                      </div>
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {enabledCameras.map((cam) => {
                      const isLiveProgram =
                        obsConnected &&
                        (profile.activeCameraId === cam.cameraId ||
                          (cam.obsSceneName && profile.activeObsScene === cam.obsSceneName));
                      const snap = previewSnapshots[cam.cameraId];
                      const isSwitching = switchingKey === `cam:${cam.cameraId}`;

                      return (
                        <div
                          key={cam.cameraId}
                          className={`rounded-xl border overflow-hidden transition-colors ${
                            isLiveProgram
                              ? 'border-[#EA580C] ring-2 ring-[#EA580C]/20 bg-white'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          {/* Genuine OBS Snapshot Monitor (only shows real OBS GetSourceScreenshot when requested) */}
                          <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden border-b border-slate-200">
                            {snap ? (
                              <img
                                src={snap.imageData}
                                alt={`Live OBS frame for ${cam.name}`}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <div className="p-4 text-center space-y-1.5">
                                <Camera className="w-6 h-6 text-slate-600 mx-auto" />
                                <p className="text-[11px] font-medium text-slate-400">
                                  {obsConnected
                                    ? 'Click "Fetch OBS Frame" below for real source snapshot'
                                    : 'Connect OBS Studio to preview or switch live'}
                                </p>
                              </div>
                            )}

                            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded bg-slate-950/90 text-white font-mono text-[11px] font-bold">
                                CAM {cam.cameraNumber}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${cameraStatusBadgeClass(
                                  isLiveProgram ? 'ACTIVE' : cam.status
                                )}`}
                              >
                                {isLiveProgram ? 'ON AIR' : cam.status}
                              </span>
                            </div>

                            {snap && (
                              <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-slate-950/80 text-[10px] font-mono text-slate-300">
                                OBS Snapshot {snap.capturedAt}
                              </span>
                            )}
                          </div>

                          <div className="p-3.5 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="text-sm font-bold text-slate-900 truncate">
                                  {cam.label || cam.name}
                                </h3>
                                <p className="text-[11px] text-slate-500 truncate font-mono">
                                  {cam.name} · Scene: {cam.obsSceneName || 'Auto'} · {cam.resolution}@{cam.fps}fps
                                </p>
                              </div>
                              {cam.isDefault && (
                                <Star className="w-4 h-4 text-amber-500 shrink-0 fill-amber-500" />
                              )}
                            </div>

                            {cam.telemetry && (
                              <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-500">
                                {cam.telemetry.batteryLevel != null && (
                                  <span className="inline-flex items-center gap-1">
                                    <BatteryCharging className="w-3.5 h-3.5 text-emerald-600" />
                                    {Math.round(cam.telemetry.batteryLevel)}%
                                  </span>
                                )}
                                {cam.telemetry.networkType && (
                                  <span>Net: {cam.telemetry.networkType.toUpperCase()}</span>
                                )}
                                {cam.operatorName && <span>Op: {cam.operatorName}</span>}
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={!obsConnected || isSwitching}
                                onClick={() => handleSwitchCamera(cam)}
                                className={`flex-1 min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wide rounded-lg transition-colors disabled:opacity-40 ${
                                  isLiveProgram
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-[#EA580C] text-white hover:bg-orange-600'
                                }`}
                              >
                                <Play className="w-3.5 h-3.5" />
                                <span>
                                  {isSwitching
                                    ? 'Switching...'
                                    : isLiveProgram
                                      ? 'Live in OBS'
                                      : 'Take Live'}
                                </span>
                              </button>

                              <button
                                type="button"
                                disabled={!obsConnected || capturingPreviewFor === cam.cameraId}
                                onClick={() => handleCaptureSourcePreview(cam)}
                                title="Capture genuine snapshot from OBS Studio"
                                className="min-h-[38px] px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40"
                              >
                                {capturingPreviewFor === cam.cameraId ? '...' : 'Fetch Frame'}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setWizardCamera(cam);
                                  setWizardConnectUrl(null);
                                }}
                                title="Smartphone QR / URL Setup"
                                className="min-h-[38px] px-2.5 py-1.5 text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100"
                              >
                                <QrCode className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Dynamic N-Camera Layout Builder */}
              <DynamicLayoutBuilder
                cameras={cameras}
                obsConnected={obsConnected}
                activeLayoutType={profile.activeLayoutType}
                activeObsScene={profile.activeObsScene}
                applying={applyingLayout}
                onApplyLayout={handleApplyLayout}
                onSaveAsScene={handleSaveScenePreset}
              />

              {/* OBS Native Scenes & Saved Layout Presets */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-bold text-slate-900 uppercase tracking-wide">
                      Live OBS Studio Scenes ({profile.obsScenes.length})
                    </h3>
                    <span className="text-[11px] text-slate-500">Direct from connected OBS</span>
                  </div>

                  {profile.obsScenes.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      {obsConnected
                        ? 'No scenes reported by OBS Studio yet.'
                        : 'Connect OBS Studio to list and switch all existing OBS scenes.'}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {profile.obsScenes.map((sceneName) => {
                        const active = obsConnected && profile.activeObsScene === sceneName;
                        return (
                          <button
                            key={sceneName}
                            type="button"
                            disabled={!obsConnected || switchingKey === `scene:${sceneName}`}
                            onClick={() => handleSwitchSceneName(sceneName)}
                            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors ${
                              active
                                ? 'bg-[#EA580C] text-white border-[#EA580C]'
                                : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {sceneName}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

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
              </div>
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

                <div className="flex flex-wrap items-center gap-2">
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
                      setEditingCamera(null);
                      setCameraModalOpen(true);
                    }}
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Camera</span>
                  </button>
                </div>
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
                              {cam.sourceType.toUpperCase()}
                            </span>
                            <p className="text-[11px] font-mono text-slate-500">
                              {cam.resolution} · {cam.fps}fps · {cam.bitrateKbps}kbps
                              {cam.lowBandwidthMode ? ' · 4G Safe' : ''}
                            </p>
                          </td>

                          <td className="py-3 pr-3 font-mono text-[11px]">
                            <p className="text-slate-800">{cam.obsSceneName || '—'}</p>
                            <p className="text-slate-500">{cam.obsInputName || '—'}</p>
                          </td>

                          <td className="py-3 pr-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-mono font-bold ${cameraStatusBadgeClass(
                                cam.status
                              )}`}
                            >
                              {cam.status}
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
                  <Link
                    to="/admin/sponsors"
                    className="text-xs font-semibold text-[#EA580C] hover:underline"
                  >
                    Manage Sponsors
                  </Link>
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
          {/* TAB 4: OBS CONNECTION & LOCAL AGENT SETUP                       */}
          {/* ============================================================== */}
          {activeTab === 'connection' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
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
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      profile.agentOnline
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {profile.agentOnline ? 'AGENT ONLINE' : 'AGENT OFFLINE'}
                  </span>
                </div>

                <div className="text-xs text-slate-600 space-y-1.5">
                  <p>
                    Status:{' '}
                    <strong className="text-slate-900">
                      {profile.agentOnline
                        ? `Connected (${profile.agentLabel || 'OBS Host'})`
                        : 'Waiting for local agent handshake'}
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
                        Run this command on the OBS laptop (token shown once):
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
                  <li>Open OBS Studio → <strong>Tools → WebSocket Server Settings</strong> → Enable WebSocket server on port <strong>4455</strong>.</li>
                  <li>Add <span className="font-mono">--obs-password YOUR_OBS_PASS</span> if OBS authentication is enabled.</li>
                  <li>Once the agent connects, you can switch cameras, create multi-camera split layouts, and monitor FPS/CPU from anywhere.</li>
                </ol>
              </section>
            </div>
          )}

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
                  <option value="ADMIN_OVERRIDE_ON">ADMIN_OVERRIDE_ON</option>
                  <option value="ADMIN_OVERRIDE_OFF">ADMIN_OVERRIDE_OFF</option>
                  <option value="CAMERA_CREATED">CAMERA_CREATED</option>
                  <option value="CAMERA_TEST">CAMERA_TEST</option>
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
    </div>
  );
}
