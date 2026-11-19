import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Eye, EyeOff, Radio, SlidersHorizontal, TrendingUp } from 'lucide-react';
import {
  LiveStreamData,
  MatchHighlightData,
  PlayerData,
  PlayerMatchStatRecord,
  ScoreboardPosition,
} from '../../types/index.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { engagementService } from '../../services/engagement/engagementService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { useLiveStream } from '../../hooks/useLiveStream.ts';
import { useScoreboard } from '../../hooks/useScoreboard.ts';
import { BroadcastPlayerShell } from '../../components/streaming/BroadcastPlayerShell.tsx';
import { LiveScoreboardView } from '../../components/scoreboard/LiveScoreboardView.tsx';
import { BroadcastScoreboardOverlay } from '../../components/scoreboard/broadcast/BroadcastScoreboardOverlay.tsx';
import { ScoreMomentumCharts } from '../../components/scoreboard/ScoreMomentumCharts.tsx';
import { ScoreControlPanel } from '../../components/scoreboard/ScoreControlPanel.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';

export function AdminScoreboardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [showVideoMonitor, setShowVideoMonitor] = useState(false);
  const [showMomentumCharts, setShowMomentumCharts] = useState(true);
  const [togglingOverlayDefault, setTogglingOverlayDefault] = useState(false);

  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [highlights, setHighlights] = useState<MatchHighlightData[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerMatchStatRecord[]>([]);

  const selectedId = id || streams[0]?.id || '';

  const { stream, setStream, loading: streamLoading } = useLiveStream(selectedId || undefined);
  const { score, setScore, history, connected, refetch } = useScoreboard(selectedId || undefined);

  useEffect(() => {
    liveStreamService
      .listStreams()
      .then((data) => {
        setStreams(data);
        if (!id && data.length > 0) {
          const liveFirst = data.find((s) => s.status === 'LIVE') || data[0];
          navigate(`/admin/scoreboard/${liveFirst.id}`, { replace: true });
        }
      })
      .catch((err) => setListError(extractApiError(err, 'Failed to load streams.')))
      .finally(() => setListLoading(false));
  }, [id, navigate]);

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
    if (!stream) return;
    loadHighlights();
    loadPlayerStats();
    entityService
      .listPlayers(stream.gameName ? { sportType: stream.gameName } : undefined)
      .then((all) => {
        if (stream.teamAId || stream.teamBId) {
          const matching = all.filter((p) => {
            const tid =
              typeof p.teamId === 'object' && p.teamId
                ? p.teamId._id
                : (p.teamId as string | null);
            return tid === stream.teamAId || tid === stream.teamBId;
          });
          setPlayers(matching.length > 0 ? matching : all);
        } else {
          setPlayers(all);
        }
      })
      .catch(() => setPlayers([]));
  }, [stream, loadHighlights, loadPlayerStats]);

  async function handleToggleOverlayDefault() {
    if (!stream) return;
    try {
      setTogglingOverlayDefault(true);
      setListError(null);
      const nextVal = !(stream.scoreboardVisibleByDefault ?? true);
      const updated = await liveStreamService.updateStream(stream.id, {
        scoreboardVisibleByDefault: nextVal,
      });
      setStream(updated);
    } catch (err) {
      setListError(extractApiError(err, 'Failed to update default overlay setting.'));
    } finally {
      setTogglingOverlayDefault(false);
    }
  }

  async function handleChangeOverlayPosition(position: ScoreboardPosition) {
    if (!stream) return;
    try {
      setTogglingOverlayDefault(true);
      setListError(null);
      const updated = await liveStreamService.updateStream(stream.id, {
        scoreboardPosition: position,
      });
      setStream(updated);
    } catch (err) {
      setListError(extractApiError(err, 'Failed to update scoreboard position.'));
    } finally {
      setTogglingOverlayDefault(false);
    }
  }

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
              onChange={(e) => navigate(`/admin/scoreboard/${e.target.value}`)}
              aria-label="Select broadcast stream"
              className="min-h-[42px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg max-w-xs"
            >
              {streams.map((s) => (
                <option key={s.id} value={s.id}>
                  [{s.status}] {s.matchTitle || `${s.teamAName || 'Team A'} vs ${s.teamBName || 'Team B'}` || s.youtubeVideoId}
                </option>
              ))}
            </select>
          )}
          {stream && (
            <>
              <select
                value={stream.scoreboardPosition || 'BOTTOM'}
                disabled={togglingOverlayDefault}
                onChange={(e) => handleChangeOverlayPosition(e.target.value as ScoreboardPosition)}
                aria-label="Default overlay position"
                className="min-h-[42px] px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                <option value="BOTTOM">Position: Bottom</option>
                <option value="TOP">Position: Top</option>
                <option value="LEFT">Position: Left</option>
                <option value="RIGHT">Position: Right</option>
              </select>
              <button
                type="button"
                disabled={togglingOverlayDefault}
                onClick={handleToggleOverlayDefault}
                title="Default visibility of the video scoreboard overlay for new viewer sessions"
                className="min-h-[42px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                {(stream.scoreboardVisibleByDefault ?? true) ? (
                  <Eye className="w-4 h-4 text-emerald-600" />
                ) : (
                  <EyeOff className="w-4 h-4 text-slate-400" />
                )}
                <span>
                  Overlay: {(stream.scoreboardVisibleByDefault ?? true) ? 'Visible' : 'Hidden'}
                </span>
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
                <span>{showVideoMonitor ? 'Hide Monitor' : 'Show Monitor'}</span>
              </button>
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
          {showVideoMonitor && (
            <div className="max-w-2xl">
              <BroadcastPlayerShell
                stream={stream}
                score={score}
                videoId={stream.youtubeVideoId}
                title={stream.matchTitle || 'Stream Monitor'}
              />
            </div>
          )}

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
            onRefreshHistory={refetch}
            onRefreshHighlights={loadHighlights}
            onRefreshStats={loadPlayerStats}
          />
        </div>
      )}
    </div>
  );
}

