import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  Eye,
  EyeOff,
  Radio,
  SlidersHorizontal,
  TrendingUp,
  Tv,
} from 'lucide-react';
import {
  BroadcastOverlayConfig,
  LiveStreamData,
  MatchHighlightData,
  PlayerData,
  PlayerMatchStatRecord,
} from '../../types/index.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import {
  DEFAULT_OVERLAY_CONFIG,
  computeOverlayMetrics,
  normalizeOverlayConfig,
} from '../../utils/overlayConfig.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { engagementService } from '../../services/engagement/engagementService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { useLiveStream } from '../../hooks/useLiveStream.ts';
import {
  clearStickyMatchId,
  resolveStickyOrPreferredMatch,
  setStickyMatchId,
} from '../../utils/activeMatchSelection.ts';
import { useScoreboard } from '../../hooks/useScoreboard.ts';
import { LiveStreamPlayer } from '../../components/broadcast/LiveStreamPlayer.tsx';
import { StreamStatusIndicator } from '../../components/broadcast/StreamStatusIndicator.tsx';
import { normalizeBroadcast } from '../../utils/normalizeBroadcast.ts';
import { isMatchPreparedDraft } from '../../utils/broadcastWorkflow.ts';
import { resolveTeamId } from '../../utils/dedupe.ts';
import { LiveScoreboardView } from '../../components/scoreboard/LiveScoreboardView.tsx';
import { ScoreboardSummary } from '../../components/scoreboard/ScoreboardSummary.tsx';
import { CricketScorecardPanel } from '../../components/scoreboard/CricketScorecardPanel.tsx';
import { BroadcastScoreboardOverlay } from '../../components/scoreboard/broadcast/BroadcastScoreboardOverlay.tsx';
import { ScoreMomentumCharts } from '../../components/scoreboard/ScoreMomentumCharts.tsx';
import { ScoreControlPanel } from '../../components/scoreboard/ScoreControlPanel.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { QuickLiveScoreControls } from '../../components/obs/QuickLiveScoreControls.tsx';
import { RealtimeDiagnosticsDrawer } from '../../components/admin/RealtimeDiagnosticsDrawer.tsx';

export function AdminScoreboardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [showVideoMonitor, setShowVideoMonitor] = useState(false);
  const [showMomentumCharts, setShowMomentumCharts] = useState(true);
  const [diagOpen, setDiagOpen] = useState(false);

  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [highlights, setHighlights] = useState<MatchHighlightData[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerMatchStatRecord[]>([]);

  // Live OBS Overlay state (read-only status synced from Overlay Studio)
  const [obsOverlayConfig, setObsOverlayConfig] = useState<BroadcastOverlayConfig>(DEFAULT_OVERLAY_CONFIG);

  const selectedId = id || streams[0]?.id || '';

  const {
    stream,
    loading: streamLoading,
    notFound: streamNotFound,
    clearError: clearStreamError,
  } = useLiveStream(selectedId || undefined);
  const {
    score,
    setScore,
    history,
    connected,
    refreshHistoryOnly,
    addHistoryItem,
    applyUndoHistory,
  } = useScoreboard(selectedId || undefined);

  useEffect(() => {
    if (id && streams.some((s) => s.id === id)) {
      setStickyMatchId(id);
    }
  }, [id, streams]);

  useEffect(() => {
    liveStreamService
      .listStreams()
      .then((data) => {
        setStreams(data);
        const hasExact = Boolean(id && data.some((s) => s.id === id));
        if (data.length > 0 && (!id || !hasExact)) {
          clearStickyMatchId();
          clearStreamError();
          const targetId = resolveStickyOrPreferredMatch(undefined, data);
          if (targetId) {
            setStickyMatchId(targetId);
            navigate(`/admin/scoreboard/${targetId}`, { replace: true });
          }
        } else if (data.length === 0 && id) {
          clearStickyMatchId();
          clearStreamError();
          navigate('/admin/scoreboard', { replace: true });
        }
      })
      .catch((err) => setListError(extractApiError(err, 'Failed to load streams.')))
      .finally(() => setListLoading(false));
  }, [id, navigate, clearStreamError]);

  useEffect(() => {
    if (!streamNotFound || streamLoading || listLoading) return;
    if (streams.length > 0 && id && !streams.some((s) => s.id === id)) {
      clearStickyMatchId();
      clearStreamError();
      const targetId = resolveStickyOrPreferredMatch(undefined, streams);
      if (targetId) {
        setStickyMatchId(targetId);
        navigate(`/admin/scoreboard/${targetId}`, { replace: true });
      }
    }
  }, [streamNotFound, streamLoading, listLoading, streams, id, navigate, clearStreamError]);

  const loadHighlights = useCallback(async () => {
    if (!selectedId) return;
    try {
      const list = await engagementService.listHighlights(selectedId);
      setHighlights(list);
    } catch {
      // Non-blocking
    }
  }, [selectedId]);

  const loadPlayerStats = useCallback(async () => {
    if (!selectedId) return;
    try {
      const list = await platformOpsService.listMatchPlayerStats(selectedId);
      setPlayerStats(list);
    } catch {
      // Non-blocking
    }
  }, [selectedId]);

  useEffect(() => {
    if (!stream?.id) return;
    loadHighlights();
    loadPlayerStats();
    entityService
      .listPlayers(stream.gameName ? { sportType: stream.gameName } : undefined)
      .then((all) => {
        if (stream.teamAId || stream.teamBId) {
          const matching = all.filter((p) => {
            const tid = resolveTeamId(p.teamId);
            return tid === stream.teamAId || tid === stream.teamBId;
          });
          setPlayers(matching.length > 0 ? matching : all);
        } else {
          setPlayers(all);
        }
      })
      .catch(() => setPlayers([]));
  }, [stream?.id, stream?.gameName, stream?.teamAId, stream?.teamBId, loadHighlights, loadPlayerStats]);

  useEffect(() => {
    if (!selectedId) {
      setObsOverlayConfig(DEFAULT_OVERLAY_CONFIG);
      return;
    }
    let cancelled = false;
    liveStreamService
      .getOverlayData(selectedId)
      .then((res) => {
        if (!cancelled && res?.overlayConfig) {
          setObsOverlayConfig(normalizeOverlayConfig(res.overlayConfig));
        }
      })
      .catch(() => {});

    const socket = getSocketClient();
    const handleOverlayUpdated = (payload: {
      streamId?: string;
      overlayConfig?: BroadcastOverlayConfig;
    }) => {
      if (payload?.streamId !== selectedId || !payload.overlayConfig) return;
      setObsOverlayConfig(normalizeOverlayConfig(payload.overlayConfig));
    };
    socket.on('overlay:config_updated', handleOverlayUpdated);
    return () => {
      cancelled = true;
      socket.off('overlay:config_updated', handleOverlayUpdated);
    };
  }, [selectedId]);

  const activeProvider = stream?.activeStreamingProvider || stream?.streamingProvider || 'youtube';
  const normalized = stream ? normalizeBroadcast(stream, score) : null;
  const obsOverlayMetrics = computeOverlayMetrics(obsOverlayConfig, false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Live Scoreboard Control
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Record structured sport events, mark video highlights, and declare verified match results.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {streams.length > 0 && (
            <select
              value={selectedId}
              onChange={(e) => {
                if (!e.target.value) return;
                setStickyMatchId(e.target.value);
                navigate(`/admin/scoreboard/${e.target.value}`);
              }}
              aria-label="Select broadcast stream"
              className="min-h-[42px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg max-w-xs"
            >
              {streams.map((s) => (
                <option key={s.id} value={s.id}>
                  [{isMatchPreparedDraft(s) ? 'PREPARED' : s.status}]{' '}
                  {s.matchTitle ||
                    `${s.teamAName || 'Team A'} vs ${s.teamBName || 'Team B'}` ||
                    s.youtubeVideoId}
                </option>
              ))}
            </select>
          )}
          {stream && (
            <>
              <StreamStatusIndicator stream={stream} socketConnected={connected} />
              <button
                type="button"
                onClick={() => setDiagOpen(true)}
                className="min-h-[42px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <Activity className="w-4 h-4 text-indigo-600" />
                <span>Latency</span>
              </button>
              <button
                type="button"
                onClick={() => setShowMomentumCharts((v) => !v)}
                className="min-h-[42px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <TrendingUp className="w-4 h-4" />
                <span>{showMomentumCharts ? 'Hide Trends' : 'Show Trends'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowVideoMonitor((v) => !v)}
                className="min-h-[42px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                {showVideoMonitor ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span>{showVideoMonitor ? 'Hide Video Preview' : 'Live Video Preview'}</span>
              </button>
              <Link
                to={`/broadcast/overlay/${stream.id}`}
                className="min-h-[42px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-extrabold uppercase tracking-wide text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
              >
                <Tv className="w-4 h-4 text-[#EA580C]" />
                <span>Overlay Studio</span>
              </Link>
            </>
          )}
        </div>
      </div>

      <FeedbackBanner type="error" message={listError} onDismiss={() => setListError(null)} />

      {listLoading || streamLoading ? (
        <div className="p-8 bg-white border border-slate-200 rounded-xl text-sm text-slate-500">
          Loading scoreboard console...
        </div>
      ) : !stream ? (
        <EmptyState
          icon={<SlidersHorizontal className="w-6 h-6" />}
          title="No stream selected or available"
          description="Create or start a live stream first to control its scoreboard."
          action={
            <Link
              to="/admin/live-streams"
              className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700"
            >
              <Radio className="w-4 h-4" />
              <span>Go to Live Streams</span>
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {isMatchPreparedDraft(stream) && (
            <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 flex flex-wrap items-center justify-between gap-2 text-xs text-sky-900">
              <span>
                <strong>Prepared Draft (Unpublished):</strong> Scoreboard updates sync live to the OBS Browser Source overlay while hidden from Player Portal until activated.
              </span>
              <Link
                to={`/admin/broadcast-studio/${stream.id}`}
                className="font-bold text-[#EA580C] hover:underline whitespace-nowrap"
              >
                Open Control Room →
              </Link>
            </div>
          )}
          {stream.status === 'ENDED' && (
            <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700">
              <strong>Match Ended:</strong> Final score and match history are preserved. Start or switch to an active/prepared match in the selector above.
            </div>
          )}
          {showVideoMonitor && normalized && (
            <div className="space-y-3 max-w-2xl">
              <div className="aspect-video rounded-xl overflow-hidden border border-slate-200">
                <LiveStreamPlayer
                  provider={normalized.activeProvider}
                  youtubeVideoId={normalized.youtubeVideoId}
                  mediamtxPlaybackUrl={normalized.mediamtxPlaybackUrl}
                  mediamtxWebrtcUrl={normalized.mediamtxWebrtcUrl}
                  title={normalized.title}
                />
              </div>
              {stream.status === 'LIVE' && (
                <QuickLiveScoreControls
                  stream={stream}
                  score={score}
                  onScoreChange={setScore}
                  onRefresh={refreshHistoryOnly}
                  themeVariant="light"
                />
              )}
            </div>
          )}

          {/* Compact Broadcast Feed & OBS Overlay Summary Strip */}
          <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600">
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                <Tv className="w-4 h-4 text-[#EA580C]" />
                <span>OBS Overlay Status</span>
              </span>
              <span className="font-mono text-slate-700 tabular-nums">
                Mode: <strong className="uppercase">{obsOverlayConfig.visible ? obsOverlayConfig.mode : 'hidden'}</strong>
                {' · '}
                Pos: <strong className="uppercase">{obsOverlayConfig.position}</strong>
                {' · '}
                Scale: <strong>{Math.round(obsOverlayMetrics.overallScale * 100)}%</strong>
                {' · '}
                Feed: <strong className="uppercase">{activeProvider}</strong>
                {obsOverlayConfig.fullScoreboardVisible ? ' · Full Scoreboard ON' : ''}
                {obsOverlayConfig.timeoutFullscreenSponsorAdActive ? ' · Timeout Ad ON' : ''}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Link
                to="/admin/live-streams"
                className="font-semibold text-slate-600 hover:text-slate-900 whitespace-nowrap"
              >
                Manage Feed &amp; Failover →
              </Link>
              <Link
                to={`/broadcast/overlay/${stream.id}`}
                className="font-bold text-[#EA580C] hover:underline whitespace-nowrap"
              >
                Customize in Overlay Studio →
              </Link>
            </div>
          </section>

          {/* Live TV Broadcast Strip Preview */}
          {score && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Live Video Overlay Preview ({score.sportType} · {stream.scoreboardPosition || 'BOTTOM'})
              </p>
              <BroadcastScoreboardOverlay stream={stream} score={score} />
            </div>
          )}

          <LiveScoreboardView stream={stream} score={score} socketConnected={connected} />

          <ScoreboardSummary stream={stream} score={score} variant="compact" />

          {score?.sportType === 'Cricket' && (
            <CricketScorecardPanel stream={stream} score={score} players={players} />
          )}

          {showMomentumCharts && (
            <ScoreMomentumCharts stream={stream} score={score} history={history} />
          )}

          <ScoreControlPanel
            stream={stream}
            score={score}
            history={history}
            players={players}
            highlights={highlights}
            playerStats={playerStats}
            onScoreChange={setScore}
            onRefreshHistory={refreshHistoryOnly}
            onAddHistoryItem={addHistoryItem}
            onApplyUndoHistory={applyUndoHistory}
            onRefreshHighlights={loadHighlights}
            onRefreshStats={loadPlayerStats}
          />
        </div>
      )}

      <RealtimeDiagnosticsDrawer open={diagOpen} onClose={() => setDiagOpen(false)} />
    </div>
  );
}
