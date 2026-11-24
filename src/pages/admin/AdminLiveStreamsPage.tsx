import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowLeftRight,
  CheckCircle2,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  Monitor,
  PlaySquare,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Server,
  SlidersHorizontal,
  StopCircle,
  Trash2,
  Tv,
  Video,
  Youtube,
} from 'lucide-react';
import {
  LiveStreamData,
  StreamingProvider,
  TeamData,
  TournamentData,
  VenueData,
} from '../../types/index.ts';
import { SPORT_OPTIONS } from '../../constants/sports.ts';
import {
  AdminStreamConfigResponse,
  YouTubeVerification,
  liveStreamService,
} from '../../services/liveStream/liveStreamService.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { extractYouTubeVideoId } from '../../utils/youtube.ts';
import {
  hasStreamOutputReady,
  isMatchPreparedDraft,
} from '../../utils/broadcastWorkflow.ts';
import { YouTubePlayer } from '../../components/streaming/YouTubePlayer.tsx';
import { StreamStatusIndicator } from '../../components/broadcast/StreamStatusIndicator.tsx';
import { MatchSetupFormModal } from '../../components/broadcast/MatchSetupFormModal.tsx';
import { Modal } from '../../components/common/Modal.tsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';
import { useLiveMonitor } from '../../context/LiveMonitorContext.tsx';
import { useAuth } from '../../hooks/useAuth.ts';
import { getStickyMatchId, setStickyMatchId } from '../../utils/activeMatchSelection.ts';
import { dispatchTabChangedEvent } from '../../context/BroadcastPreviewContext.tsx';

type AdminStreamTab = 'ACTIVE' | 'UPCOMING' | 'HISTORY' | 'REPLAYS';

export function AdminLiveStreamsPage() {
  const navigate = useNavigate();
  const { adminUser } = useAuth();
  const canDeleteMatch = adminUser?.role === 'SUPER_ADMIN' || adminUser?.role === 'ADMIN';
  const { isOpen: monitorOpen, selectedStreamId, toggleMonitor, refreshStreams } = useLiveMonitor();
  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [venues, setVenues] = useState<VenueData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminStreamTab>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');
  const [sportFilter, setSportFilter] = useState('');

  // Create (Match Setup / Initialize) & Edit Metadata Modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editingStream, setEditingStream] = useState<LiveStreamData | null>(null);

  // Private RTMP Config & Health Modal
  const [configTarget, setConfigTarget] = useState<LiveStreamData | null>(null);
  const [streamConfig, setStreamConfig] = useState<AdminStreamConfigResponse | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [healthProvider, setHealthProvider] = useState<StreamingProvider>('mediamtx');
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthResult, setHealthResult] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Switch Provider Mid-Match Modal
  const [switchTarget, setSwitchTarget] = useState<LiveStreamData | null>(null);
  const [switchToProvider, setSwitchToProvider] = useState<StreamingProvider>('mediamtx');
  const [switchReason, setSwitchReason] = useState('');
  const [switchYoutubeInput, setSwitchYoutubeInput] = useState('');
  const [switchMtxPath, setSwitchMtxPath] = useState('');
  const [switchMtxHls, setSwitchMtxHls] = useState('');
  const [switchMtxWebrtc, setSwitchMtxWebrtc] = useState('');
  const [switchConfirmed, setSwitchConfirmed] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  // End Stream confirmation
  const [endTarget, setEndTarget] = useState<LiveStreamData | null>(null);
  const [ending, setEnding] = useState(false);

  // Delete Match confirmation (SUPER_ADMIN & ADMIN)
  const [deleteTarget, setDeleteTarget] = useState<LiveStreamData | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Replay management modal
  const [replayTarget, setReplayTarget] = useState<LiveStreamData | null>(null);
  const [replayInput, setReplayInput] = useState('');
  const [replayDescription, setReplayDescription] = useState('');
  const [replayVerify, setReplayVerify] = useState<YouTubeVerification | null>(null);
  const [verifyingReplay, setVerifyingReplay] = useState(false);
  const [savingReplay, setSavingReplay] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setError(null);
      const [allStreams, allTeams, allTours, allVenues] = await Promise.all([
        liveStreamService.listStreams(),
        entityService.listTeams(),
        entityService.listTournaments(),
        platformOpsService.listVenues().catch(() => [] as VenueData[]),
      ]);
      setStreams(allStreams);
      setTeams(allTeams);
      setTournaments(allTours);
      setVenues(allVenues);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load streams.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  function openNewStreamModal() {
    setEditingStream(null);
    setFormOpen(true);
  }

  function openEditStreamModal(stream: LiveStreamData) {
    setEditingStream(stream);
    setFormOpen(true);
  }

  async function openConfigModal(stream: LiveStreamData) {
    setConfigTarget(stream);
    setStreamConfig(null);
    setHealthResult(null);
    setHealthProvider(stream.activeStreamingProvider || 'mediamtx');
    try {
      setLoadingConfig(true);
      const cfg = await liveStreamService.getAdminStreamConfig(stream.id);
      setStreamConfig(cfg);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load private stream configuration.'));
    } finally {
      setLoadingConfig(false);
    }
  }

  async function handleCheckHealth() {
    if (!configTarget) return;
    try {
      setCheckingHealth(true);
      setHealthResult(null);
      const res = await liveStreamService.verifyStreamHealth(configTarget.id, healthProvider);
      setHealthResult(
        `${res.ok ? 'HEALTHY' : 'OFFLINE'} (${res.provider.toUpperCase()}): ${res.message}${
          res.latencyMs != null ? ` · ${res.latencyMs}ms` : ''
        }`
      );
      await loadAll();
    } catch (err) {
      setHealthResult(`ERROR: ${extractApiError(err, 'Health verification failed.')}`);
    } finally {
      setCheckingHealth(false);
    }
  }

  function openSwitchModal(stream: LiveStreamData) {
    const current = stream.activeStreamingProvider || stream.streamingProvider || 'youtube';
    const next: StreamingProvider = current === 'youtube' ? 'mediamtx' : 'youtube';
    setSwitchTarget(stream);
    setSwitchToProvider(next);
    setSwitchReason('');
    setSwitchYoutubeInput(stream.youtubeInput || stream.youtubeVideoId || '');
    setSwitchMtxPath(stream.mediamtxStreamPath || '');
    setSwitchMtxHls(stream.mediamtxPlaybackUrl || '');
    setSwitchMtxWebrtc(stream.mediamtxWebrtcUrl || '');
    setSwitchConfirmed(false);
    setSwitchError(null);
  }

  async function handleSwitchProvider(e: React.FormEvent) {
    e.preventDefault();
    if (!switchTarget) return;
    try {
      setSwitching(true);
      setSwitchError(null);
      const res = await liveStreamService.switchProvider(switchTarget.id, {
        toProvider: switchToProvider,
        reason: switchReason.trim() || `Switched to ${switchToProvider}`,
        youtubeInput: switchYoutubeInput.trim() || undefined,
        mediamtxStreamPath: switchMtxPath.trim() || undefined,
        mediamtxPlaybackUrl: switchMtxHls.trim() || undefined,
        mediamtxWebrtcUrl: switchMtxWebrtc.trim() || undefined,
      });
      setSwitchTarget(null);
      setSuccess(
        `Broadcast feed switched from ${res.fromProvider.toUpperCase()} to ${res.toProvider.toUpperCase()} seamlessly.`
      );
      await loadAll();
    } catch (err) {
      setSwitchError(
        extractApiError(
          err,
          'Destination stream failed health verification. Existing broadcast feed was retained.'
        )
      );
    } finally {
      setSwitching(false);
    }
  }

  function copyToClipboard(label: string, val: string) {
    if (!val) return;
    navigator.clipboard?.writeText(val).catch(() => {});
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1800);
  }

  async function handleEndStream() {
    if (!endTarget) return;
    try {
      setEnding(true);
      setError(null);
      const res = await liveStreamService.endStream(endTarget.id);
      setEndTarget(null);
      setSuccess(
        res.note ||
          'MaidanLive stream ended and moved to history with final scores preserved.'
      );
      await Promise.all([loadAll(), refreshStreams()]);
    } catch (err) {
      setError(extractApiError(err, 'Failed to end stream.'));
    } finally {
      setEnding(false);
    }
  }

  async function handleDeleteMatch() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      setError(null);
      const res = await liveStreamService.deleteStream(deleteTarget.id);
      if (getStickyMatchId() === deleteTarget.id) {
        setStickyMatchId('');
      }
      setDeleteTarget(null);
      setSuccess(res.message || 'Match permanently deleted.');
      await Promise.all([loadAll(), refreshStreams()]);
    } catch (err) {
      setError(extractApiError(err, 'Failed to delete match.'));
    } finally {
      setDeleting(false);
    }
  }

  function openReplayModal(stream: LiveStreamData) {
    setReplayTarget(stream);
    setReplayInput(stream.replayInput || stream.replayVideoId || stream.youtubeVideoId || '');
    setReplayDescription(stream.replayDescription || '');
    setReplayVerify(null);
  }

  async function handleVerifyReplay() {
    try {
      setVerifyingReplay(true);
      setError(null);
      const res = await liveStreamService.verifyYouTubeVideo(replayInput);
      setReplayVerify(res);
    } catch (err) {
      setError(extractApiError(err, 'Failed to verify YouTube replay.'));
    } finally {
      setVerifyingReplay(false);
    }
  }

  async function handleSaveReplay(publishState: boolean) {
    if (!replayTarget) return;
    try {
      setSavingReplay(true);
      setError(null);
      await liveStreamService.updateReplay(replayTarget.id, {
        replayInput: replayInput.trim(),
        replayPublished: publishState,
        replayDescription: replayDescription.trim(),
      });
      setReplayTarget(null);
      setSuccess(publishState ? 'Verified replay published to Player Portal.' : 'Replay saved/hidden.');
      await loadAll();
    } catch (err) {
      setError(extractApiError(err, 'Could not update replay.'));
    } finally {
      setSavingReplay(false);
    }
  }

  const totalCount = streams.length;
  const activeStreams = streams.filter((s) => s.status === 'LIVE');
  const upcomingStreams = streams.filter((s) => s.status === 'UPCOMING');
  const endedStreams = streams.filter((s) => s.status === 'ENDED');
  const availableReplaysCount = endedStreams.filter(
    (s) => s.replayAvailable && s.replayVideoId
  ).length;

  const baseStreams =
    activeTab === 'ACTIVE'
      ? activeStreams
      : activeTab === 'UPCOMING'
        ? upcomingStreams
        : endedStreams;

  const q = searchQuery.trim().toLowerCase();
  const displayedStreams = baseStreams.filter((s) => {
    if (sportFilter && s.gameName !== sportFilter) return false;
    if (!q) return true;
    const text = [
      s.matchTitle,
      s.teamAName,
      s.teamBName,
      s.tournamentName,
      s.location,
      s.youtubeVideoId,
      s.mediamtxStreamPath,
    ]
      .join(' ')
      .toLowerCase();
    return text.includes(q);
  });

  const parsedReplay = extractYouTubeVideoId(replayInput);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Dual Broadcast Studio
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Initialize matches cleanly first, configure OBS &amp; scoreboard overlays, then connect YouTube Live and activate broadcasts inside the Control Room.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewStreamModal}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Match Setup</span>
        </button>
      </div>

      {/* Dashboard Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Total Streams</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
            {loading ? '—' : totalCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Currently Live</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-red-600 mt-1">
            {loading ? '—' : activeStreams.length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Ended Streams</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-slate-700 mt-1">
            {loading ? '—' : endedStreams.length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Available Replays</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-emerald-600 mt-1">
            {loading ? '—' : availableReplaysCount}
          </p>
        </div>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      {/* Section Tabs & Search/Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto max-w-full">
          {[
            { key: 'ACTIVE' as const, label: `Active (${activeStreams.length})` },
            { key: 'UPCOMING' as const, label: `Prepared & Upcoming (${upcomingStreams.length})` },
            { key: 'HISTORY' as const, label: `Stream History (${endedStreams.length})` },
            { key: 'REPLAYS' as const, label: `Replays (${endedStreams.length})` },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                dispatchTabChangedEvent(`live_streams_${tab.key}`);
              }}
              className={`min-h-[38px] px-4 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab.key
                  ? 'bg-[#EA580C] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search streams..."
              className="w-full min-h-[38px] pl-9 pr-3 text-xs border border-slate-300 rounded-lg bg-white"
            />
          </div>
          <select
            value={sportFilter}
            onChange={(e) => setSportFilter(e.target.value)}
            className="min-h-[38px] px-3 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Sports</option>
            {SPORT_OPTIONS.map((sp) => (
              <option key={sp} value={sp}>
                {sp}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stream List */}
      {loading ? (
        <TableSkeleton rows={4} />
      ) : displayedStreams.length === 0 ? (
        <EmptyState
          icon={<Video className="w-6 h-6" />}
          title={
            activeTab === 'ACTIVE'
              ? 'No active live broadcasts'
              : activeTab === 'UPCOMING'
                ? 'No prepared or upcoming matches'
                : 'No ended streams yet'
          }
          description="Click New Match Setup to initialize a match without a YouTube link, prepare OBS & overlays, then activate when ready."
          action={
            (activeTab === 'ACTIVE' || activeTab === 'UPCOMING') && (
              <button
                type="button"
                onClick={openNewStreamModal}
                className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600"
              >
                <Plus className="w-4 h-4" />
                <span>New Match Setup</span>
              </button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {displayedStreams.map((stream) => {
            const title =
              stream.matchTitle ||
              (stream.teamAName && stream.teamBName
                ? `${stream.teamAName} vs ${stream.teamBName}`
                : stream.youtubeVideoId || stream.mediamtxStreamPath || 'Untitled Stream');
            const activeProvider =
              stream.activeStreamingProvider || stream.streamingProvider || 'youtube';

            return (
              <div
                key={stream.id}
                className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {stream.status === 'LIVE' && (
                      <span className="inline-flex items-center gap-1 font-semibold text-red-600">
                        <Radio className="w-3.5 h-3.5" />
                        LIVE · PUBLISHED
                      </span>
                    )}
                    {stream.status === 'UPCOMING' && (
                      <span
                        className={`px-2 py-0.5 rounded font-semibold ${
                          isMatchPreparedDraft(stream)
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {isMatchPreparedDraft(stream) ? 'PREPARED · UNPUBLISHED' : 'UPCOMING'}
                      </span>
                    )}
                    {stream.status === 'ENDED' && (
                      <span className="font-semibold text-slate-600">ENDED</span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold ${
                        activeProvider === 'mediamtx'
                          ? 'bg-orange-100 text-orange-800'
                          : stream.youtubeVideoId
                            ? 'bg-red-100 text-red-800'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {activeProvider === 'mediamtx' ? (
                        <>
                          <Server className="w-3 h-3" />
                          MediaMTX ({stream.mediamtxPublishStatus || 'IDLE'})
                        </>
                      ) : stream.youtubeVideoId ? (
                        <>
                          <Youtube className="w-3 h-3" />
                          YouTube Linked
                        </>
                      ) : (
                        <>
                          <Youtube className="w-3 h-3" />
                          YouTube Not Linked
                        </>
                      )}
                    </span>
                    {stream.status !== 'ENDED' && hasStreamOutputReady(stream) && (
                      <StreamStatusIndicator stream={stream} />
                    )}
                    {stream.showScoreboardOnYoutube === false && (
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold">
                        Web Embed Scoreboard Only
                      </span>
                    )}
                    {stream.youtubeVideoId && (
                      <span className="font-mono text-slate-600">YT: {stream.youtubeVideoId}</span>
                    )}
                    {stream.gameName && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{stream.gameName}</span>
                      </>
                    )}
                    {stream.location && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{stream.location}</span>
                      </>
                    )}
                  </div>

                  <h3 className="text-base font-semibold text-slate-900 truncate">{title}</h3>

                  {stream.score && (
                    <p className="text-xs font-mono tabular-nums text-slate-600">
                      Score: {stream.teamAName || 'Team A'} {stream.score.teamAScore} -{' '}
                      {stream.score.teamBScore} {stream.teamBName || 'Team B'}
                      {stream.endedAt &&
                        ` · Ended ${new Date(stream.endedAt).toLocaleString()}`}
                    </p>
                  )}

                  {stream.score?.resultStatus && stream.score.resultStatus !== 'NOT_DECLARED' && (
                    <p className="text-xs font-semibold text-amber-600">
                      Result: {stream.score.resultDescription || stream.score.winnerTeamName}
                    </p>
                  )}

                  {activeTab === 'REPLAYS' && (
                    <p className="text-xs text-slate-600">
                      Replay Status:{' '}
                      <strong
                        className={
                          stream.replayPublished
                            ? 'text-emerald-600'
                            : stream.replayAvailable
                              ? 'text-slate-900'
                              : 'text-slate-500'
                        }
                      >
                        {stream.replayPublished
                          ? `Published (${stream.replayVideoId})`
                          : stream.replayAvailable
                            ? `Verified & Hidden (${stream.replayVideoId})`
                            : 'Not verified / No replay set'}
                      </strong>
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {stream.status === 'LIVE' && (
                    <button
                      type="button"
                      onClick={() => toggleMonitor(stream.id, stream)}
                      aria-pressed={monitorOpen && selectedStreamId === stream.id}
                      className={`min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        monitorOpen && selectedStreamId === stream.id
                          ? 'bg-[#EA580C] text-white border-[#EA580C]'
                          : 'bg-slate-50 text-slate-900 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <Monitor className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {monitorOpen && selectedStreamId === stream.id
                          ? 'Hide Monitor'
                          : 'Show Monitor'}
                      </span>
                    </button>
                  )}

                  <Link
                    to={`/admin/scoreboard/${stream.id}`}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Score Control</span>
                  </Link>

                  <Link
                    to={`/broadcast/overlay/${stream.id}`}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 whitespace-nowrap"
                  >
                    <Tv className="w-3.5 h-3.5" />
                    <span>OBS BROADCAST OVERLAY</span>
                  </Link>

                  <Link
                    to={`/admin/broadcast-studio/${stream.id}`}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-slate-800 rounded-lg hover:bg-slate-700 whitespace-nowrap"
                  >
                    <Video className="w-3.5 h-3.5 text-[#EA580C]" />
                    <span>Multi-Cam OBS</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => openConfigModal(stream)}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                  >
                    <Server className="w-3.5 h-3.5 text-[#EA580C]" />
                    <span>RTMP / Health</span>
                  </button>

                  {stream.status !== 'ENDED' && (
                    <button
                      type="button"
                      onClick={() => openSwitchModal(stream)}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#EA580C] bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 whitespace-nowrap"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      <span>Switch Feed</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openEditStreamModal(stream)}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Info</span>
                  </button>

                  {stream.status === 'LIVE' && (
                    <button
                      type="button"
                      onClick={() => setEndTarget(stream)}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 whitespace-nowrap"
                    >
                      <StopCircle className="w-3.5 h-3.5" />
                      <span>End Stream</span>
                    </button>
                  )}

                  {stream.status === 'UPCOMING' && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!hasStreamOutputReady(stream)) {
                          navigate(`/admin/broadcast-studio/${stream.id}`);
                          return;
                        }
                        try {
                          await liveStreamService.activateBroadcast(stream.id);
                          setSuccess('Broadcast activated and published on Player Portal.');
                          await Promise.all([loadAll(), refreshStreams()]);
                        } catch (err) {
                          setError(extractApiError(err, 'Failed to activate broadcast.'));
                        }
                      }}
                      className={`min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white rounded-lg whitespace-nowrap ${
                        hasStreamOutputReady(stream)
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-[#EA580C] hover:bg-orange-600'
                      }`}
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>
                        {hasStreamOutputReady(stream)
                          ? 'Activate Broadcast'
                          : 'Connect YouTube in Studio'}
                      </span>
                    </button>
                  )}

                  {stream.status === 'ENDED' && (
                    <button
                      type="button"
                      onClick={() => openReplayModal(stream)}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 whitespace-nowrap"
                    >
                      <PlaySquare className="w-3.5 h-3.5" />
                      <span>Manage Replay</span>
                    </button>
                  )}

                  {canDeleteMatch && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(stream)}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Step 1 Match Setup / Edit Metadata Modal (separated from YouTube URL) */}
      <MatchSetupFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        mode={editingStream ? 'edit' : 'create'}
        initialStream={editingStream}
        teams={teams}
        tournaments={tournaments}
        venues={venues}
        onInitialized={async (created) => {
          setSuccess(
            `Match "${created.matchTitle || created.teamAName || 'Session'}" initialized (Unpublished Draft). Opening Control Room...`
          );
          await Promise.all([loadAll(), refreshStreams()]);
          navigate(`/admin/broadcast-studio/${created.id}`);
        }}
        onUpdated={async () => {
          setSuccess('Match metadata updated.');
          await Promise.all([loadAll(), refreshStreams()]);
        }}
      />

      {/* Private RTMP Stream Config & Health Check Modal */}
      <Modal
        open={Boolean(configTarget)}
        onClose={() => setConfigTarget(null)}
        title="RTMP Broadcast Config & Health Verification"
        subtitle="Keep your RTMP stream key private — it is never sent to public viewer endpoints."
        maxWidthClass="max-w-2xl"
      >
        {configTarget && (
          <div className="space-y-4">
            {loadingConfig ? (
              <div className="py-6 text-sm text-slate-500">Loading private broadcast credentials...</div>
            ) : streamConfig ? (
              <div className="space-y-3 text-xs">
                {[
                  { label: 'RTMP Publish URL (OBS / Larix)', value: streamConfig.mediamtxRtmpPublishUrl },
                  { label: 'RTMP Server URL', value: streamConfig.mediamtxRtmpServerUrl },
                  { label: 'Private Stream Key', value: streamConfig.mediamtxStreamKey },
                  { label: 'HLS Playback URL', value: streamConfig.mediamtxPlaybackUrl },
                  { label: 'WebRTC WHEP URL', value: streamConfig.mediamtxWebrtcUrl },
                ].map((item) => (
                  <div key={item.label} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-semibold text-slate-700">{item.label}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(item.label, item.value)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#EA580C] hover:underline"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedField === item.label ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>
                    <p className="font-mono text-[11px] text-slate-800 break-all">{item.value || '—'}</p>
                  </div>
                ))}

                <div className="pt-2 border-t border-slate-200 space-y-2.5">
                  <StreamStatusIndicator stream={configTarget} variant="detailed" />
                  <p className="font-semibold text-slate-800">Verify Destination Stream Health</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={healthProvider}
                      onChange={(e) => setHealthProvider(e.target.value as StreamingProvider)}
                      className="min-h-[40px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="mediamtx">MediaMTX Direct Feed</option>
                      <option value="youtube">YouTube Live</option>
                    </select>
                    <button
                      type="button"
                      disabled={checkingHealth}
                      onClick={handleCheckHealth}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span>{checkingHealth ? 'Checking...' : 'Run Health Check'}</span>
                    </button>
                  </div>
                  {healthResult && (
                    <p className="p-2.5 rounded-lg bg-slate-100 border border-slate-200 font-mono text-[11px] text-slate-800">
                      {healthResult}
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Modal>

      {/* Mid-Match Switch Streaming Provider Modal */}
      <Modal
        open={Boolean(switchTarget)}
        onClose={() => setSwitchTarget(null)}
        title="Switch Live Streaming Provider"
        subtitle="Destination health is verified before switching. If offline, the current feed stays active."
        maxWidthClass="max-w-xl"
      >
        {switchTarget && (
          <form onSubmit={handleSwitchProvider} className="space-y-4">
            <FeedbackBanner
              type="error"
              message={switchError}
              onDismiss={() => setSwitchError(null)}
            />

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
              <span>
                Active Provider:{' '}
                <strong className="uppercase">
                  {switchTarget.activeStreamingProvider || switchTarget.streamingProvider || 'youtube'}
                </strong>
              </span>
              <span className="text-slate-500">Scores &amp; chat remain intact</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Destination Provider
              </label>
              <select
                value={switchToProvider}
                onChange={(e) => setSwitchToProvider(e.target.value as StreamingProvider)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="mediamtx">MediaMTX Direct Feed (HLS / WebRTC)</option>
                <option value="youtube">YouTube Live</option>
              </select>
            </div>

            {switchToProvider === 'youtube' ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Target YouTube Video ID or URL
                </label>
                <input
                  type="text"
                  required
                  value={switchYoutubeInput}
                  onChange={(e) => setSwitchYoutubeInput(e.target.value)}
                  placeholder="YouTube Video ID or URL"
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    MediaMTX Stream Path
                  </label>
                  <input
                    type="text"
                    value={switchMtxPath}
                    onChange={(e) => setSwitchMtxPath(e.target.value)}
                    placeholder="live/stream-id"
                    className="w-full min-h-[40px] px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    HLS Playback URL (.m3u8)
                  </label>
                  <input
                    type="url"
                    value={switchMtxHls}
                    onChange={(e) => setSwitchMtxHls(e.target.value)}
                    placeholder="http://.../index.m3u8"
                    className="w-full min-h-[40px] px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    WebRTC WHEP URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={switchMtxWebrtc}
                    onChange={(e) => setSwitchMtxWebrtc(e.target.value)}
                    placeholder="http://.../whep"
                    className="w-full min-h-[40px] px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Switch Reason (Audit Log)
              </label>
              <input
                type="text"
                value={switchReason}
                onChange={(e) => setSwitchReason(e.target.value)}
                placeholder="e.g. Failover due to local fiber drop, switching to OBS direct feed"
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            {switchTarget.providerSwitchHistory && switchTarget.providerSwitchHistory.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-200">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Switch History
                </p>
                <div className="max-h-28 overflow-y-auto space-y-1 text-[11px]">
                  {switchTarget.providerSwitchHistory.map((h, i) => (
                    <div key={i} className="p-2 rounded bg-slate-50 border border-slate-200">
                      <span className="font-semibold">
                        {h.fromProvider} → {h.toProvider}
                      </span>{' '}
                      <span
                        className={
                          h.status === 'SUCCESS' ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'
                        }
                      >
                        [{h.status}]
                      </span>{' '}
                      · {h.switchedByName} · {h.reason || h.detail}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <label className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950 cursor-pointer">
              <input
                type="checkbox"
                checked={switchConfirmed}
                onChange={(e) => setSwitchConfirmed(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-amber-400 text-[#EA580C]"
              />
              <span>
                I confirm the destination feed is ready for live spectators. If verification fails,
                the active stream will automatically remain intact.
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSwitchTarget(null)}
                className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={switching || !switchConfirmed}
                className="min-h-[42px] inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${switching ? 'animate-spin' : ''}`} />
                <span>{switching ? 'Verifying & Switching...' : 'Verify Health & Switch'}</span>
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Confirm End Stream */}
      <ConfirmDialog
        open={Boolean(endTarget)}
        onClose={() => setEndTarget(null)}
        onConfirm={handleEndStream}
        loading={ending}
        title="End MaidanLive Stream"
        message="This will mark the stream as ENDED on MaidanLive, preserve all final scores, move it to Stream History, and notify viewers. Remember to also stop your broadcast encoder if you are still streaming."
        confirmLabel="End Stream"
      />

      {/* Confirm Permanent Match Deletion (Prepared Draft, Upcoming, Live, or Completed) */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteMatch}
        loading={deleting}
        title="Delete Match Permanently"
        message={
          deleteTarget
            ? `Permanently delete "${
                deleteTarget.matchTitle ||
                `${deleteTarget.teamAName || 'Team A'} vs ${deleteTarget.teamBName || 'Team B'}`
              }" (${
                isMatchPreparedDraft(deleteTarget) ? 'Prepared Draft' : deleteTarget.status
              })? All scores, overlays, camera scenes, chat, and stream records for this match will be removed.`
            : ''
        }
        confirmLabel="Delete Permanently"
      />

      {/* Manage & Verify Replay Modal */}
      <Modal
        open={Boolean(replayTarget)}
        onClose={() => setReplayTarget(null)}
        title="Replay Management"
        subtitle="Verify that the YouTube replay is available and embeddable before publishing."
      >
        {replayTarget && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Replay YouTube Video ID or URL
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={replayInput}
                  onChange={(e) => {
                    setReplayInput(e.target.value);
                    setReplayVerify(null);
                  }}
                  className="flex-1 min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  disabled={!parsedReplay.valid || verifyingReplay}
                  onClick={handleVerifyReplay}
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                >
                  {verifyingReplay ? 'Verifying...' : 'Verify Availability'}
                </button>
              </div>
            </div>

            {replayVerify && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                  replayVerify.available
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {replayVerify.available
                    ? `Replay verified available: ${replayVerify.title || replayVerify.videoId}`
                    : replayVerify.message}
                </span>
              </div>
            )}

            {parsedReplay.valid && parsedReplay.videoId && (
              <YouTubePlayer videoId={parsedReplay.videoId} title="Replay Preview" />
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Replay Notes / Summary (Optional)
              </label>
              <textarea
                rows={2}
                value={replayDescription}
                onChange={(e) => setReplayDescription(e.target.value)}
                placeholder="Highlight summary or broadcast notes for replay viewers"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-200">
              {replayTarget.replayPublished && (
                <button
                  type="button"
                  disabled={savingReplay}
                  onClick={() => handleSaveReplay(false)}
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  <EyeOff className="w-4 h-4" />
                  <span>Hide Replay</span>
                </button>
              )}
              <button
                type="button"
                disabled={savingReplay || !parsedReplay.valid}
                onClick={() => handleSaveReplay(true)}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                <Eye className="w-4 h-4" />
                <span>{savingReplay ? 'Verifying & Publishing...' : 'Verify & Publish Replay'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
