import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeftRight,
  Eye,
  EyeOff,
  Maximize2,
  Radio,
  RefreshCw,
  RotateCcw,
  Server,
  SlidersHorizontal,
  TrendingUp,
  Tv,
  Youtube,
} from 'lucide-react';
import {
  BroadcastOverlayConfig,
  LiveStreamData,
  MatchHighlightData,
  PlayerData,
  PlayerMatchStatRecord,
  ScoreboardPosition,
  StreamingProvider,
} from '../../types/index.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import {
  DEFAULT_OVERLAY_CONFIG,
  OVERLAY_MODES,
  OVERLAY_POSITIONS,
  OVERLAY_SCALES,
  OVERLAY_SLIDER_BOUNDS,
  OverlayMode,
  OverlayPosition,
  OverlayScale,
  PRESET_SCALE_MULTIPLIERS,
  computeOverlayMetrics,
  normalizeOverlayConfig,
} from '../../utils/overlayConfig.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { engagementService } from '../../services/engagement/engagementService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { useLiveStream } from '../../hooks/useLiveStream.ts';
import {
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
import { Modal } from '../../components/common/Modal.tsx';
import { QuickLiveScoreControls } from '../../components/obs/QuickLiveScoreControls.tsx';
import { useBroadcastPreview } from '../../context/BroadcastPreviewContext.tsx';

export function AdminScoreboardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { triggerOverlayPreview } = useBroadcastPreview();

  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listSuccess, setListSuccess] = useState<string | null>(null);
  const [showVideoMonitor, setShowVideoMonitor] = useState(false);
  const [showMomentumCharts, setShowMomentumCharts] = useState(true);
  const [togglingOverlayDefault, setTogglingOverlayDefault] = useState(false);

  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [highlights, setHighlights] = useState<MatchHighlightData[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerMatchStatRecord[]>([]);

  // Live OBS Overlay state (Admin + Scorer size/position/mode sync)
  const [obsOverlayConfig, setObsOverlayConfig] = useState<BroadcastOverlayConfig>(DEFAULT_OVERLAY_CONFIG);
  const [obsOverlaySaving, setObsOverlaySaving] = useState(false);
  const obsSliderDebounceRef = React.useRef<number | null>(null);
  const pendingObsSliderRef = React.useRef<Partial<BroadcastOverlayConfig>>({});

  // Quick provider switch modal
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchTo, setSwitchTo] = useState<StreamingProvider>('mediamtx');
  const [switchReason, setSwitchReason] = useState('');
  const [switchConfirmed, setSwitchConfirmed] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const selectedId = id || streams[0]?.id || '';

  const {
    stream,
    setStream,
    loading: streamLoading,
    refetch: refetchStream,
  } = useLiveStream(selectedId || undefined);
  const { score, setScore, history, connected, refetch } = useScoreboard(selectedId || undefined);

  useEffect(() => {
    if (id) {
      setStickyMatchId(id);
    }
  }, [id]);

  useEffect(() => {
    liveStreamService
      .listStreams()
      .then((data) => {
        setStreams(data);
        if (!id && data.length > 0) {
          const targetId = resolveStickyOrPreferredMatch(id, data);
          if (targetId) {
            setStickyMatchId(targetId);
            navigate(`/admin/scoreboard/${targetId}`, { replace: true });
          }
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

  useEffect(() => {
    return () => {
      if (obsSliderDebounceRef.current !== null) {
        window.clearTimeout(obsSliderDebounceRef.current);
      }
    };
  }, []);

  async function handleUpdateObsOverlay(patch: Partial<BroadcastOverlayConfig>) {
    if (!stream) return;
    const prev = obsOverlayConfig;
    const apiPatch: Partial<BroadcastOverlayConfig> = { ...patch };
    if (patch.mode === 'hidden') apiPatch.visible = false;
    else if (patch.mode && patch.visible === undefined) apiPatch.visible = true;
    if (patch.visible === true && (patch.mode ?? prev.mode) === 'hidden') {
      apiPatch.mode = 'full';
    }
    const next = normalizeOverlayConfig({ ...prev, ...apiPatch });
    pendingObsSliderRef.current = {};
    setObsOverlayConfig(next);
    triggerOverlayPreview({
      matchId: stream.id,
      stream,
      score,
      config: next,
      sourceTabKey: 'admin_scoreboard',
    });
    setObsOverlaySaving(true);
    setListError(null);
    try {
      const res = await liveStreamService.updateOverlayConfig(stream.id, apiPatch);
      if (res?.overlayConfig) {
        setObsOverlayConfig(normalizeOverlayConfig(res.overlayConfig));
      }
      setListSuccess('OBS overlay settings synced live.');
    } catch (err) {
      setObsOverlayConfig(prev);
      setListError(extractApiError(err, 'Failed to sync OBS overlay settings.'));
    } finally {
      setObsOverlaySaving(false);
    }
  }

  function handleObsSizeSliderChange(val: number) {
    if (!stream) return;
    const next = normalizeOverlayConfig({ ...obsOverlayConfig, customScale: val });
    pendingObsSliderRef.current = { ...pendingObsSliderRef.current, customScale: val };
    setObsOverlayConfig(next);
    triggerOverlayPreview({
      matchId: stream.id,
      stream,
      score,
      config: next,
      sourceTabKey: 'admin_scoreboard',
    });
    if (obsSliderDebounceRef.current !== null) {
      window.clearTimeout(obsSliderDebounceRef.current);
    }
    obsSliderDebounceRef.current = window.setTimeout(async () => {
      obsSliderDebounceRef.current = null;
      const patchToSend = { ...pendingObsSliderRef.current };
      pendingObsSliderRef.current = {};
      if (Object.keys(patchToSend).length === 0) return;
      setObsOverlaySaving(true);
      setListError(null);
      try {
        const res = await liveStreamService.updateOverlayConfig(stream.id, patchToSend);
        if (res?.overlayConfig) {
          setObsOverlayConfig(normalizeOverlayConfig(res.overlayConfig));
        }
        setListSuccess('OBS scoreboard size updated.');
      } catch (err) {
        setListError(extractApiError(err, 'Failed to update OBS scoreboard size.'));
      } finally {
        setObsOverlaySaving(false);
      }
    }, 160);
  }

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

  async function handleQuickSwitch(e: React.FormEvent) {
    e.preventDefault();
    if (!stream) return;
    try {
      setSwitching(true);
      setSwitchError(null);
      const res = await liveStreamService.switchProvider(stream.id, {
        toProvider: switchTo,
        reason: switchReason.trim() || 'Switched from Live Score Console',
      });
      setStream(res.stream);
      setSwitchOpen(false);
      setListSuccess(`Switched active video feed to ${res.toProvider.toUpperCase()}.`);
      await refetchStream();
    } catch (err) {
      setSwitchError(
        extractApiError(
          err,
          'Destination stream failed health check. Current broadcast feed remains active.'
        )
      );
    } finally {
      setSwitching(false);
    }
  }

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
                onClick={() => {
                  setSwitchTo(activeProvider === 'youtube' ? 'mediamtx' : 'youtube');
                  setSwitchReason('');
                  setSwitchConfirmed(false);
                  setSwitchError(null);
                  setSwitchOpen(true);
                }}
                className="min-h-[42px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 whitespace-nowrap"
              >
                {activeProvider === 'mediamtx' ? (
                  <Server className="w-3.5 h-3.5" />
                ) : (
                  <Youtube className="w-3.5 h-3.5" />
                )}
                <span>Feed: {activeProvider.toUpperCase()}</span>
                <ArrowLeftRight className="w-3.5 h-3.5 opacity-80" />
              </button>
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
                <span>{showVideoMonitor ? 'Hide Video Preview' : 'Live Video Preview'}</span>
              </button>
              <Link
                to={`/broadcast/overlay/${stream.id}`}
                className="min-h-[42px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-extrabold uppercase tracking-wide text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
              >
                <Tv className="w-4 h-4 text-[#EA580C]" />
                <span>OBS BROADCAST OVERLAY</span>
              </Link>
            </>
          )}
        </div>
      </div>

      <FeedbackBanner type="error" message={listError} onDismiss={() => setListError(null)} />
      <FeedbackBanner type="success" message={listSuccess} onDismiss={() => setListSuccess(null)} />

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
                  onRefresh={refetch}
                  themeVariant="light"
                />
              )}
            </div>
          )}

          {/* Live OBS Broadcast Size & Position Sync Bar (Admin + Scorer) */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Maximize2 className="w-4 h-4 text-[#EA580C]" />
                <h2 className="font-display text-sm font-bold text-slate-900 uppercase tracking-wide">
                  OBS Scoreboard Size &amp; Position Sync
                </h2>
                <span className="text-[11px] font-mono text-slate-500">
                  Width {obsOverlayMetrics.barWidthPct}% · {Math.round(obsOverlayMetrics.overallScale * 100)}%
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={obsOverlaySaving}
                  onClick={() =>
                    handleUpdateObsOverlay({
                      fullScoreboardVisible: !obsOverlayConfig.fullScoreboardVisible,
                      ...(!obsOverlayConfig.fullScoreboardVisible
                        ? { timeoutFullscreenSponsorAdActive: false }
                        : {}),
                    })
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg border transition-colors ${
                    obsOverlayConfig.fullScoreboardVisible
                      ? 'bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-700'
                      : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                  }`}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>{obsOverlayConfig.fullScoreboardVisible ? 'Hide Full Scoreboard' : 'Show Full Scoreboard'}</span>
                </button>
                <button
                  type="button"
                  disabled={obsOverlaySaving}
                  onClick={() =>
                    handleUpdateObsOverlay({
                      timeoutFullscreenSponsorAdActive: !obsOverlayConfig.timeoutFullscreenSponsorAdActive,
                      ...(!obsOverlayConfig.timeoutFullscreenSponsorAdActive
                        ? { fullScoreboardVisible: false }
                        : {}),
                    })
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg border transition-colors ${
                    obsOverlayConfig.timeoutFullscreenSponsorAdActive
                      ? 'bg-amber-600 text-white border-amber-500 hover:bg-amber-700'
                      : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span>{obsOverlayConfig.timeoutFullscreenSponsorAdActive ? 'Close Timeout Ad' : 'Timeout Fullscreen Ad'}</span>
                </button>
                <button
                  type="button"
                  disabled={obsOverlaySaving}
                  onClick={() => handleUpdateObsOverlay({ scale: 'medium', customScale: 1 })}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Size</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              {/* Size Presets */}
              <div className="md:col-span-4 space-y-1">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  OBS Size Preset
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {OVERLAY_SCALES.map((sc: OverlayScale) => {
                    const active = obsOverlayConfig.scale === sc;
                    return (
                      <button
                        key={sc}
                        type="button"
                        disabled={obsOverlaySaving}
                        onClick={() => handleUpdateObsOverlay({ scale: sc })}
                        className={`min-h-[38px] px-2 py-1 rounded-lg text-xs font-semibold border capitalize transition-colors ${
                          active
                            ? 'bg-[#EA580C] text-white border-[#EA580C]'
                            : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {sc} ({Math.round(PRESET_SCALE_MULTIPLIERS[sc] * 100)}%)
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Fine Size Slider */}
              <div className="md:col-span-4 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold uppercase tracking-wider text-slate-500">
                    Custom OBS Size
                  </span>
                  <span className="font-mono font-bold text-[#EA580C]">
                    {Math.round(obsOverlayConfig.customScale * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={OVERLAY_SLIDER_BOUNDS.customScale.min}
                  max={OVERLAY_SLIDER_BOUNDS.customScale.max}
                  step={OVERLAY_SLIDER_BOUNDS.customScale.step}
                  value={obsOverlayConfig.customScale}
                  aria-label="Custom OBS Scoreboard Size"
                  onChange={(e) => handleObsSizeSliderChange(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#EA580C]"
                />
              </div>

              {/* OBS Position & Mode */}
              <div className="md:col-span-4 grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    OBS Position
                  </span>
                  <select
                    value={obsOverlayConfig.position}
                    disabled={obsOverlaySaving}
                    onChange={(e) =>
                      handleUpdateObsOverlay({ position: e.target.value as OverlayPosition })
                    }
                    aria-label="OBS overlay screen position"
                    className="w-full min-h-[38px] px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
                  >
                    {OVERLAY_POSITIONS.map((pos) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    OBS Mode
                  </span>
                  <select
                    value={obsOverlayConfig.visible ? obsOverlayConfig.mode : 'hidden'}
                    disabled={obsOverlaySaving}
                    onChange={(e) => {
                      const nextMode = e.target.value as OverlayMode;
                      handleUpdateObsOverlay({ mode: nextMode, visible: nextMode !== 'hidden' });
                    }}
                    aria-label="OBS overlay display mode"
                    className="w-full min-h-[38px] px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
                  >
                    {OVERLAY_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m.replace('_', ' ').toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
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
            <CricketScorecardPanel stream={stream} score={score} />
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
            onRefreshHistory={refetch}
            onRefreshHighlights={loadHighlights}
            onRefreshStats={loadPlayerStats}
          />
        </div>
      )}

      {/* Quick Broadcast Provider Switch Modal */}
      <Modal
        open={switchOpen}
        onClose={() => setSwitchOpen(false)}
        title="Switch Broadcast Video Feed"
        subtitle="Scores and connected spectators stay live while the video feed updates."
      >
        <form onSubmit={handleQuickSwitch} className="space-y-4">
          <FeedbackBanner type="error" message={switchError} onDismiss={() => setSwitchError(null)} />
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Target Provider
            </label>
            <select
              value={switchTo}
              onChange={(e) => setSwitchTo(e.target.value as StreamingProvider)}
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="mediamtx">MediaMTX Direct Feed</option>
              <option value="youtube">YouTube Live</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reason (Optional)
            </label>
            <input
              type="text"
              value={switchReason}
              onChange={(e) => setSwitchReason(e.target.value)}
              placeholder="Backup failover or encoder switch..."
              className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <label className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950 cursor-pointer">
            <input
              type="checkbox"
              checked={switchConfirmed}
              onChange={(e) => setSwitchConfirmed(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-amber-400 text-[#EA580C]"
            />
            <span>
              Confirm switching active spectator playback to{' '}
              <strong className="uppercase">{switchTo}</strong> after live health verification.
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSwitchOpen(false)}
              className="min-h-[40px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={switching || !switchConfirmed}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${switching ? 'animate-spin' : ''}`} />
              <span>{switching ? 'Verifying...' : 'Verify & Switch'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
