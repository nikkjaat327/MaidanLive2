import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Clock,
  Lock,
  Maximize2,
  Play,
  RotateCcw,
  ShieldAlert,
  Tv,
  Undo2,
  Zap,
} from 'lucide-react';
import type {
  BroadcastOverlayConfig,
  LiveScoreData,
  LiveStreamData,
  PlayerData,
} from '../../types/index.ts';
import type { SportOption } from '../../constants/sports.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { offlineScoreService } from '../../services/scoreboard/offlineScoreService.ts';
import { scoreboardService } from '../../services/scoreboard/scoreboardService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import {
  CricketDetails,
  computeCricketChaseState,
  isCricketScoringLocked,
  normalizeCricketDetails,
} from '../../utils/cricketScoring.ts';
import { FootballDetails, createInitialFootballDetails } from '../../utils/footballScoring.ts';
import { normalizeKabaddiDetails } from '../../utils/kabaddiScoring.ts';
import {
  VolleyballDetails,
  isVolleyballScoringLocked,
  normalizeVolleyballDetails,
} from '../../utils/volleyballScoring.ts';
import { deriveShortTeamName } from '../../utils/matchResultValidation.ts';
import { STANDARD_MATCH_STATUSES } from '../../utils/matchStatus.ts';
import { resolveMatchTimeoutState } from '../../utils/matchTimeout.ts';
import { normalizeOverlayConfig } from '../../utils/overlayConfig.ts';
import { Modal } from '../common/Modal.tsx';
import { PlayerPickerField } from '../scoreboard/PlayerPickerField.tsx';
import { mergeMatchRoster, UnifiedMatchPlayer } from '../../utils/sportPositions.ts';
import {
  applyOptimisticKabaddiEngineEvent,
  applyOptimisticPatch,
  applyOptimisticStructuredEvent,
  makeClientEventId,
} from '../../utils/optimisticScore.ts';
import { completeScoreTraceApi, startScoreTrace } from '../../utils/realtimeDiagnostics.ts';
import {
  enqueueScoreMutation,
  getPendingScoreCount,
  subscribePendingScoreCount,
} from '../../utils/scoreMutationQueue.ts';

interface QuickLiveScoreControlsProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  players?: PlayerData[];
  onScoreChange: (score: LiveScoreData) => void;
  onRefresh?: () => void;
  themeVariant?: 'dark' | 'light';
}

const WICKET_TYPES = [
  'CAUGHT',
  'BOWLED',
  'LBW',
  'RUN_OUT',
  'STUMPED',
  'HIT_WICKET',
  'RETIRED_OUT',
] as const;

export function QuickLiveScoreControls({
  stream,
  score,
  players: propPlayers,
  onScoreChange,
  onRefresh,
  themeVariant = 'dark',
}: QuickLiveScoreControlsProps) {
  const [busy, setBusy] = useState(false);
  const [pendingOps, setPendingOps] = useState(0);
  const scoreRef = useRef<LiveScoreData | null>(score);
  const confirmedScoreRef = useRef<LiveScoreData | null>(score);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [fetchedPlayers, setFetchedPlayers] = useState<PlayerData[]>([]);

  useEffect(() => {
    return subscribePendingScoreCount(stream.id, setPendingOps);
  }, [stream.id]);

  useEffect(() => {
    if (getPendingScoreCount(stream.id) === 0) {
      scoreRef.current = score;
      confirmedScoreRef.current = score;
    }
  }, [score, stream.id]);

  useEffect(() => {
    if (propPlayers || (!stream.teamAId && !stream.teamBId)) return;
    let cancelled = false;
    Promise.all([
      stream.teamAId ? entityService.listPlayers({ teamId: stream.teamAId }) : Promise.resolve([]),
      stream.teamBId ? entityService.listPlayers({ teamId: stream.teamBId }) : Promise.resolve([]),
    ])
      .then(([a, b]) => {
        if (!cancelled) setFetchedPlayers([...a, ...b]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [propPlayers, stream.teamAId, stream.teamBId]);

  const terminalBusy = busy || pendingOps > 0;

  // Quick cricket wicket modal state
  const [wicketModalOpen, setWicketModalOpen] = useState(false);
  const [wicketType, setWicketType] = useState<string>('CAUGHT');
  const [newBatsman, setNewBatsman] = useState('');

  // Quick 2nd innings modal state
  const [secondInningsOpen, setSecondInningsOpen] = useState(false);
  const [secondBatter1, setSecondBatter1] = useState('');
  const [secondBatter2, setSecondBatter2] = useState('');
  const [secondBowler, setSecondBowler] = useState('');

  // Quick per-team / crease player selection state
  const [quickStriker, setQuickStriker] = useState('');
  const [quickNonStriker, setQuickNonStriker] = useState('');
  const [quickBowler, setQuickBowler] = useState('');
  const [quickPlayerA, setQuickPlayerA] = useState('');
  const [quickPlayerB, setQuickPlayerB] = useState('');

  const sport: SportOption = score?.sportType || (stream.gameName as SportOption) || 'Other';
  const nameA = stream.teamAName || 'Team A';
  const nameB = stream.teamBName || 'Team B';
  const shortA = deriveShortTeamName(nameA, 'TMA');
  const shortB = deriveShortTeamName(nameB, 'TMB');

  const cricketDetails = useMemo(
    () =>
      normalizeCricketDetails(
        (score?.sportSpecificDetails || {}) as Partial<CricketDetails>
      ),
    [score?.sportSpecificDetails]
  );

  useEffect(() => {
    setQuickStriker(cricketDetails.batsman1 || '');
    setQuickNonStriker(cricketDetails.batsman2 || '');
    setQuickBowler(cricketDetails.bowler || '');
  }, [cricketDetails.batsman1, cricketDetails.batsman2, cricketDetails.bowler]);

  const roster = useMemo(
    () => mergeMatchRoster(stream, propPlayers ?? fetchedPlayers),
    [stream, propPlayers, fetchedPlayers]
  );

  const battingRoster = useMemo(() => {
    const side = cricketDetails.battingTeam === 'A' ? roster.teamA : roster.teamB;
    return side.length > 0 ? side : roster.all;
  }, [roster, cricketDetails.battingTeam]);

  const bowlingRoster = useMemo(() => {
    const side = cricketDetails.battingTeam === 'A' ? roster.teamB : roster.teamA;
    return side.length > 0 ? side : roster.all;
  }, [roster, cricketDetails.battingTeam]);

  const secondBattingTeam: 'A' | 'B' =
    (cricketDetails.firstInningsBattingTeam || cricketDetails.battingTeam || 'A') === 'A' ? 'B' : 'A';
  const secondBattingRoster = useMemo(() => {
    const side = secondBattingTeam === 'A' ? roster.teamA : roster.teamB;
    return side.length > 0 ? side : roster.all;
  }, [roster, secondBattingTeam]);
  const secondBowlingRoster = useMemo(() => {
    const side = secondBattingTeam === 'A' ? roster.teamB : roster.teamA;
    return side.length > 0 ? side : roster.all;
  }, [roster, secondBattingTeam]);

  const findDbPlayerId = (name: string, pool: UnifiedMatchPlayer[]): string | undefined => {
    const norm = name.trim().toLowerCase();
    if (!norm) return undefined;
    return pool.find((p) => p.name.trim().toLowerCase() === norm)?.dbPlayerId;
  };

  const cricketLock = useMemo(() => isCricketScoringLocked(cricketDetails), [cricketDetails]);
  const volleyballLock = useMemo(
    () =>
      sport === 'Volleyball'
        ? isVolleyballScoringLocked(score?.sportSpecificDetails, score?.resultStatus)
        : { locked: false, reason: '' },
    [sport, score?.sportSpecificDetails, score?.resultStatus]
  );
  const cricketChase = useMemo(
    () => computeCricketChaseState(cricketDetails, nameA, nameB),
    [cricketDetails, nameA, nameB]
  );
  const timeoutInfo = useMemo(() => resolveMatchTimeoutState(stream, score), [stream, score]);
  const currentOverlay = useMemo(
    () => normalizeOverlayConfig(stream.overlayConfig),
    [stream.overlayConfig]
  );

  // Show strictly when stream is LIVE
  if (stream.status !== 'LIVE') {
    return null;
  }

  const isDark = themeVariant === 'dark';
  const shellClass = isDark
    ? 'bg-slate-900/95 border-slate-800 text-slate-100'
    : 'bg-white border-slate-200 text-slate-900';
  const subBarClass = isDark
    ? 'bg-slate-950/70 border-slate-800 text-slate-400'
    : 'bg-slate-50 border-slate-200 text-slate-600';
  const btnNeutral = isDark
    ? 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700'
    : 'bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-300';

  async function submitEvent(
    action: Record<string, unknown>,
    successFallback: string,
    sportTypeOverride?: string,
    playerMeta?: {
      playerId?: string;
      playerName?: string;
      assistPlayerId?: string;
      assistPlayerName?: string;
    }
  ) {
    const baseScore = scoreRef.current || score;
    const effectiveSport = sportTypeOverride || sport;
    const traceId = makeClientEventId('quick');
    const apiStartAtMs = Date.now();
    startScoreTrace(traceId, successFallback, apiStartAtMs);
    const optimistic = applyOptimisticStructuredEvent(baseScore, effectiveSport, action);
    if (optimistic && optimistic !== baseScore) {
      scoreRef.current = optimistic;
      onScoreChange(optimistic);
    }
    setFeedback(null);

    return enqueueScoreMutation(stream.id, async () => {
      try {
        const res = await offlineScoreService.submitScoreEvent(
          stream.id,
          {
            clientEventId: traceId,
            traceId,
            sportType: effectiveSport,
            action,
            ...(playerMeta?.playerId ? { playerId: playerMeta.playerId } : {}),
            ...(playerMeta?.playerName ? { playerName: playerMeta.playerName } : {}),
            ...(playerMeta?.assistPlayerId ? { assistPlayerId: playerMeta.assistPlayerId } : {}),
            ...(playerMeta?.assistPlayerName ? { assistPlayerName: playerMeta.assistPlayerName } : {}),
          },
          baseScore
        );
        completeScoreTraceApi(traceId, {
          status: res.queued ? 'queued' : 'synced',
          apiStartAtMs,
          diag: res.diag,
        });
        if (res.score) {
          confirmedScoreRef.current = res.score;
          if (getPendingScoreCount(stream.id) <= 1) {
            scoreRef.current = res.score;
            onScoreChange(res.score);
          }
        } else if (!res.queued) {
          onRefresh?.();
        }
        setFeedback({
          type: 'success',
          text: res.queued
            ? `Cached offline (${successFallback})`
            : res.historyItem?.action || successFallback,
        });
      } catch (err) {
        if (getPendingScoreCount(stream.id) <= 1) {
          const rollback = confirmedScoreRef.current || baseScore;
          if (rollback) {
            scoreRef.current = rollback;
            onScoreChange(rollback);
          }
        }
        const msg = extractApiError(err, 'Failed to update live score.');
        completeScoreTraceApi(traceId, { status: 'error', apiStartAtMs, errorText: msg });
        setFeedback({
          type: 'error',
          text: msg,
        });
      }
    });
  }

  async function submitPatch(payload: {
    teamAScore?: number;
    teamBScore?: number;
    matchStatus?: string;
    sportSpecificDetails?: Record<string, unknown>;
    action: string;
  }) {
    const baseScore = scoreRef.current || score;
    const traceId = makeClientEventId('quick_patch');
    const apiStartAtMs = Date.now();
    startScoreTrace(traceId, payload.action, apiStartAtMs);
    const optimistic = applyOptimisticPatch(baseScore, payload);
    if (optimistic) {
      scoreRef.current = optimistic;
      onScoreChange(optimistic);
    }
    setFeedback(null);

    return enqueueScoreMutation(stream.id, async () => {
      try {
        const res = await offlineScoreService.submitScorePatch(
          stream.id,
          { ...payload, clientEventId: traceId, traceId },
          baseScore
        );
        completeScoreTraceApi(traceId, {
          status: res.queued ? 'queued' : 'synced',
          apiStartAtMs,
          diag: res.diag,
        });
        if (res.score) {
          confirmedScoreRef.current = res.score;
          if (getPendingScoreCount(stream.id) <= 1) {
            scoreRef.current = res.score;
            onScoreChange(res.score);
          }
        } else if (!res.queued) {
          onRefresh?.();
        }
        setFeedback({
          type: 'success',
          text: res.queued ? `Cached offline (${payload.action})` : payload.action,
        });
      } catch (err) {
        if (getPendingScoreCount(stream.id) <= 1) {
          const rollback = confirmedScoreRef.current || baseScore;
          if (rollback) {
            scoreRef.current = rollback;
            onScoreChange(rollback);
          }
        }
        const msg = extractApiError(err, 'Failed to update match score.');
        completeScoreTraceApi(traceId, { status: 'error', apiStartAtMs, errorText: msg });
        setFeedback({
          type: 'error',
          text: msg,
        });
      }
    });
  }

  async function handleUndo() {
    const traceId = makeClientEventId('quick_undo');
    const apiStartAtMs = Date.now();
    startScoreTrace(traceId, 'Quick Undo', apiStartAtMs);
    try {
      setBusy(true);
      setFeedback(null);
      const res = await scoreboardService.undoScore(stream.id, {
        clientEventId: traceId,
        traceId,
      });
      completeScoreTraceApi(traceId, { status: 'synced', apiStartAtMs, diag: res.diag });
      if (res.score) {
        confirmedScoreRef.current = res.score;
        scoreRef.current = res.score;
        onScoreChange(res.score);
      } else {
        onRefresh?.();
      }
      setFeedback({ type: 'success', text: `Undid: ${res.undoneAction}` });
    } catch (err) {
      const msg = extractApiError(err, 'Nothing to undo.');
      completeScoreTraceApi(traceId, { status: 'error', apiStartAtMs, errorText: msg });
      setFeedback({ type: 'error', text: msg });
    } finally {
      setBusy(false);
    }
  }

  async function handleTimeoutAction(side: 'A' | 'B' | 'END') {
    try {
      setBusy(true);
      setFeedback(null);
      if (sport === 'Kabaddi') {
        const res = await scoreboardService.controlKabaddiClock(
          stream.id,
          side === 'END' ? { type: 'END_TIMEOUT' } : { type: 'START_TIMEOUT', team: side }
        );
        if (res?.score) onScoreChange(res.score);
      } else {
        const nextStatus =
          side === 'END'
            ? 'LIVE'
            : `${side === 'A' ? nameA : nameB} TIMEOUT`;
        const res = await offlineScoreService.submitScorePatch(
          stream.id,
          {
            matchStatus: nextStatus,
            action: side === 'END' ? 'Resumed Live' : `Timeout (${side === 'A' ? shortA : shortB})`,
          },
          score
        );
        if (res.score) onScoreChange(res.score);
      }
      onRefresh?.();
      setFeedback({
        type: 'success',
        text: side === 'END' ? 'Timeout ended — Match Live' : `${side === 'A' ? shortA : shortB} Timeout Active`,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: extractApiError(err, 'Failed to update timeout.') });
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleOverlayTakeover(target: 'full_scoreboard' | 'fullscreen_ad') {
    try {
      setBusy(true);
      setFeedback(null);
      const patch: Partial<BroadcastOverlayConfig> =
        target === 'full_scoreboard'
          ? {
              fullScoreboardVisible: !currentOverlay.fullScoreboardVisible,
              ...(!currentOverlay.fullScoreboardVisible
                ? { timeoutFullscreenSponsorAdActive: false }
                : {}),
            }
          : {
              timeoutFullscreenSponsorAdActive: !currentOverlay.timeoutFullscreenSponsorAdActive,
              ...(!currentOverlay.timeoutFullscreenSponsorAdActive
                ? { fullScoreboardVisible: false }
                : {}),
            };
      await liveStreamService.updateOverlayConfig(stream.id, patch);
      onRefresh?.();
      setFeedback({
        type: 'success',
        text:
          target === 'full_scoreboard'
            ? !currentOverlay.fullScoreboardVisible
              ? 'JioHotstar Full Scoreboard ON'
              : 'Full Scoreboard OFF'
            : !currentOverlay.timeoutFullscreenSponsorAdActive
              ? 'Fullscreen Timeout Sponsor Ad ON'
              : 'Fullscreen Timeout Ad OFF',
      });
    } catch (err) {
      setFeedback({ type: 'error', text: extractApiError(err, 'Failed to update broadcast takeover.') });
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteFirstInnings() {
    try {
      setBusy(true);
      setFeedback(null);
      const res = await scoreboardService.completeCricketInnings(stream.id, 'MANUAL');
      onScoreChange(res.score);
      onRefresh?.();
      setFeedback({ type: 'success', text: '1st Innings completed. Ready for 2nd Innings.' });
    } catch (err) {
      setFeedback({ type: 'error', text: extractApiError(err, 'Unable to complete 1st innings.') });
    } finally {
      setBusy(false);
    }
  }

  async function handleStartSecondInnings() {
    try {
      setBusy(true);
      setFeedback(null);
      const firstSide = cricketDetails.firstInningsBattingTeam || cricketDetails.battingTeam || 'A';
      const nextBatting: 'A' | 'B' = firstSide === 'A' ? 'B' : 'A';
      const firstRuns = firstSide === 'A' ? cricketDetails.teamARuns : cricketDetails.teamBRuns;
      const res = await scoreboardService.startSecondCricketInnings(stream.id, {
        battingTeam: nextBatting,
        batsman1: secondBatter1.trim(),
        batsman2: secondBatter2.trim(),
        bowler: secondBowler.trim(),
        oversLimit: cricketDetails.oversLimit,
        target: firstRuns + 1,
      });
      onScoreChange(res.score);
      onRefresh?.();
      setSecondInningsOpen(false);
      setFeedback({ type: 'success', text: '2nd Innings started!' });
    } catch (err) {
      setFeedback({ type: 'error', text: extractApiError(err, 'Unable to start 2nd innings.') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${shellClass}`}>
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#EA580C] shrink-0" />
          <h3 className="font-display text-sm font-bold tracking-wide uppercase">
            Quick Live Score Controls
          </h3>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-red-600/15 text-red-400 border border-red-500/30 font-semibold">
            {sport}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={
              STANDARD_MATCH_STATUSES.includes((score?.matchStatus || 'LIVE').toUpperCase() as any)
                ? (score?.matchStatus || 'LIVE').toUpperCase()
                : ''
            }
            disabled={terminalBusy || volleyballLock.locked}
            onChange={(e) => {
              if (!e.target.value) return;
              submitPatch({
                matchStatus: e.target.value,
                action: `Status -> ${e.target.value}`,
              });
            }}
            aria-label="Quick match status"
            className={`min-h-[34px] px-2.5 py-1 text-xs font-semibold rounded-lg border ${
              isDark
                ? 'bg-slate-950 border-slate-700 text-slate-200'
                : 'bg-white border-slate-300 text-slate-800'
            }`}
          >
            <option value="">Status: {score?.matchStatus || 'LIVE'}</option>
            {STANDARD_MATCH_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={terminalBusy}
            onClick={handleUndo}
            className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap disabled:opacity-40 ${btnNeutral}`}
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>
        </div>
      </div>

      {/* Inline Feedback */}
      {feedback && (
        <div
          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between gap-2 ${
            feedback.type === 'error'
              ? 'bg-red-500/15 text-red-300 border border-red-500/30'
              : isDark
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}
        >
          <span className="truncate">{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[11px] opacity-75 hover:opacity-100 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Team Timeout & Full-Screen Broadcast Takeover Row */}
      <div className={`px-3 py-2 rounded-lg border flex flex-wrap items-center gap-2 ${subBarClass}`}>
        <button
          type="button"
          disabled={busy}
          onClick={() => handleToggleOverlayTakeover('full_scoreboard')}
          className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
            currentOverlay.fullScoreboardVisible
              ? 'bg-indigo-600 text-white border-indigo-400'
              : btnNeutral
          }`}
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>{currentOverlay.fullScoreboardVisible ? 'Hide Full Scoreboard' : 'Show Full Scoreboard'}</span>
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => handleToggleOverlayTakeover('fullscreen_ad')}
          className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
            currentOverlay.timeoutFullscreenSponsorAdActive
              ? 'bg-amber-600 text-white border-amber-400'
              : btnNeutral
          }`}
        >
          <Tv className="w-3.5 h-3.5" />
          <span>{currentOverlay.timeoutFullscreenSponsorAdActive ? 'Close Fullscreen Ad' : 'Fullscreen Timeout Ad'}</span>
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => handleTimeoutAction('A')}
          className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 ${
            timeoutInfo.isTimeout && timeoutInfo.teamSide === 'A'
              ? 'bg-amber-500 text-slate-950 border-amber-400'
              : btnNeutral
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>{shortA} Timeout</span>
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => handleTimeoutAction('B')}
          className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 ${
            timeoutInfo.isTimeout && timeoutInfo.teamSide === 'B'
              ? 'bg-amber-500 text-slate-950 border-amber-400'
              : btnNeutral
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>{shortB} Timeout</span>
        </button>

        {timeoutInfo.isTimeout && (
          <button
            type="button"
            disabled={busy}
            onClick={() => handleTimeoutAction('END')}
            className="min-h-[32px] px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
          >
            Resume Live
          </button>
        )}
      </div>

      {/* CRICKET QUICK CONTROLS */}
      {sport === 'Cricket' && (
        <div className="space-y-3">
          {cricketLock.locked && (
            <div className="p-3 rounded-lg bg-amber-500/15 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200">
              <div className="flex items-center gap-2 font-semibold">
                <Lock className="w-4 h-4 shrink-0" />
                <span>{cricketLock.reason}</span>
              </div>
              {cricketChase.isInningsBreak && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSecondBatter1('');
                    setSecondBatter2('');
                    setSecondBowler('');
                    setSecondInningsOpen(true);
                  }}
                  className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#EA580C] text-white font-semibold hover:bg-orange-600"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Start 2nd Innings</span>
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: '0 (Dot)', runs: 0, cls: btnNeutral },
              { label: '+1', runs: 1, cls: btnNeutral },
              { label: '+2', runs: 2, cls: btnNeutral },
              { label: '+3', runs: 3, cls: btnNeutral },
              {
                label: '4 FOUR',
                runs: 4,
                cls: 'bg-sky-600 hover:bg-sky-500 text-white border-sky-500',
              },
              {
                label: '6 SIX',
                runs: 6,
                cls: 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500',
              },
            ].map((b) => (
              <button
                key={b.runs}
                type="button"
                disabled={cricketLock.locked}
                onClick={() => {
                  const s = quickStriker.trim() || cricketDetails.batsman1 || '';
                  const ns = quickNonStriker.trim() || cricketDetails.batsman2 || '';
                  const bw = quickBowler.trim() || cricketDetails.bowler || '';
                  void submitEvent(
                    {
                      type: 'RUNS',
                      runs: b.runs,
                      striker: s || undefined,
                      nonStriker: ns || undefined,
                      bowler: bw || undefined,
                    },
                    `+${b.runs} run${b.runs === 1 ? '' : 's'}`,
                    'Cricket',
                    {
                      playerId: findDbPlayerId(s, battingRoster),
                      playerName: s || undefined,
                      assistPlayerId: findDbPlayerId(bw, bowlingRoster),
                      assistPlayerName: bw || undefined,
                    }
                  );
                }}
                className={`min-h-[42px] px-3.5 py-2 rounded-lg border font-mono tabular-nums text-xs font-extrabold transition-colors disabled:opacity-40 whitespace-nowrap ${b.cls}`}
              >
                {b.label}
              </button>
            ))}

            <button
              type="button"
              disabled={cricketLock.locked}
              onClick={() => {
                const s = quickStriker.trim() || cricketDetails.batsman1 || '';
                const ns = quickNonStriker.trim() || cricketDetails.batsman2 || '';
                const bw = quickBowler.trim() || cricketDetails.bowler || '';
                void submitEvent(
                  {
                    type: 'WIDE',
                    extraRuns: 0,
                    striker: s || undefined,
                    nonStriker: ns || undefined,
                    bowler: bw || undefined,
                  },
                  'Wide +1',
                  'Cricket',
                  {
                    playerId: findDbPlayerId(s, battingRoster),
                    playerName: s || undefined,
                    assistPlayerId: findDbPlayerId(bw, bowlingRoster),
                    assistPlayerName: bw || undefined,
                  }
                );
              }}
              className="min-h-[42px] px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 font-mono text-xs font-bold disabled:opacity-40 whitespace-nowrap"
            >
              Wd +1
            </button>

            <button
              type="button"
              disabled={cricketLock.locked}
              onClick={() => {
                const s = quickStriker.trim() || cricketDetails.batsman1 || '';
                const ns = quickNonStriker.trim() || cricketDetails.batsman2 || '';
                const bw = quickBowler.trim() || cricketDetails.bowler || '';
                void submitEvent(
                  {
                    type: 'NO_BALL',
                    extraRuns: 0,
                    batRuns: 0,
                    striker: s || undefined,
                    nonStriker: ns || undefined,
                    bowler: bw || undefined,
                  },
                  'No Ball +1',
                  'Cricket',
                  {
                    playerId: findDbPlayerId(s, battingRoster),
                    playerName: s || undefined,
                    assistPlayerId: findDbPlayerId(bw, bowlingRoster),
                    assistPlayerName: bw || undefined,
                  }
                );
              }}
              className="min-h-[42px] px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 font-mono text-xs font-bold disabled:opacity-40 whitespace-nowrap"
            >
              NB +1
            </button>

            <button
              type="button"
              disabled={cricketLock.locked}
              onClick={() => {
                setWicketType('CAUGHT');
                setNewBatsman('');
                setWicketModalOpen(true);
              }}
              className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-500 bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold uppercase tracking-wide disabled:opacity-40 whitespace-nowrap"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Wicket</span>
            </button>

            <button
              type="button"
              disabled={cricketLock.locked}
              onClick={() => submitEvent({ type: 'CHANGE_STRIKER' }, 'Swapped striker')}
              className={`min-h-[42px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold disabled:opacity-40 whitespace-nowrap ${btnNeutral}`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Swap Strike</span>
            </button>

            {cricketDetails.innings === 1 && !cricketDetails.innings1Completed && (
              <button
                type="button"
                disabled={terminalBusy}
                onClick={handleCompleteFirstInnings}
                className="min-h-[42px] px-3 py-2 rounded-lg border border-orange-500/40 bg-[#EA580C]/20 text-orange-300 hover:bg-[#EA580C]/30 text-xs font-semibold disabled:opacity-40 whitespace-nowrap"
              >
                End 1st Innings
              </button>
            )}
          </div>

          {/* Quick Striker / Non-Striker / Bowler Dropdown Strip (Optional) */}
          {!cricketLock.locked && (
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider opacity-75 mb-1">
                  Striker (Optional)
                </label>
                <PlayerPickerField
                  compact
                  themeVariant={themeVariant}
                  value={quickStriker}
                  onChange={(name) => setQuickStriker(name)}
                  players={battingRoster}
                  placeholder="Striker name"
                  emptyOptionLabel="-- Select striker --"
                  ariaLabel="Quick Striker"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider opacity-75 mb-1">
                  Non-Striker (Optional)
                </label>
                <PlayerPickerField
                  compact
                  themeVariant={themeVariant}
                  value={quickNonStriker}
                  onChange={(name) => setQuickNonStriker(name)}
                  players={battingRoster}
                  placeholder="Non-striker"
                  emptyOptionLabel="-- Select non-striker --"
                  ariaLabel="Quick Non-Striker"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider opacity-75 mb-1">
                  Bowler (Optional)
                </label>
                <PlayerPickerField
                  compact
                  themeVariant={themeVariant}
                  value={quickBowler}
                  onChange={(name) => setQuickBowler(name)}
                  players={bowlingRoster}
                  placeholder="Current bowler"
                  emptyOptionLabel="-- Select bowler --"
                  ariaLabel="Quick Bowler"
                />
              </div>
              <button
                type="button"
                disabled={terminalBusy}
                onClick={() =>
                  submitEvent(
                    {
                      type: 'UPDATE_META',
                      batsman1: quickStriker.trim(),
                      batsman2: quickNonStriker.trim(),
                      bowler: quickBowler.trim(),
                    },
                    'Updated crease batters & bowler'
                  )
                }
                className={`min-h-[36px] px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap ${btnNeutral}`}
              >
                Apply Crease
              </button>
            </div>
          )}

          <div
            className={`px-3 py-2 rounded-lg border flex flex-wrap items-center justify-between gap-2 text-xs ${subBarClass}`}
          >
            <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums">
              <span>
                Batting: <strong>{cricketDetails.battingTeam === 'A' ? shortA : shortB}</strong> (
                {cricketDetails.battingTeam === 'A'
                  ? `${cricketDetails.teamARuns}/${cricketDetails.teamAWickets}`
                  : `${cricketDetails.teamBRuns}/${cricketDetails.teamBWickets}`}
                )
              </span>
              {(quickStriker || cricketDetails.batsman1) && (
                <span>
                  Striker: <strong>*{quickStriker || cricketDetails.batsman1}</strong>
                </span>
              )}
              {(quickBowler || cricketDetails.bowler) && (
                <span>
                  Bowler: <strong>{quickBowler || cricketDetails.bowler}</strong>
                </span>
              )}
            </div>
            {cricketChase.isSecondInnings && cricketChase.target > 0 && (
              <span className="font-mono font-bold text-amber-400">
                Target {cricketChase.target} · {cricketChase.chaseSummaryText}
              </span>
            )}
          </div>
        </div>
      )}

      {/* FOOTBALL QUICK CONTROLS */}
      {sport === 'Football' && (
        <div className="space-y-2.5">
          {(roster.teamA.length > 0 || roster.teamB.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <PlayerPickerField
                compact
                themeVariant={themeVariant}
                value={quickPlayerA}
                onChange={(name) => setQuickPlayerA(name)}
                players={roster.teamA}
                placeholder={`${shortA} player (optional)`}
                emptyOptionLabel={`-- ${shortA} Player (Optional) --`}
                ariaLabel={`${shortA} player`}
              />
              <PlayerPickerField
                compact
                themeVariant={themeVariant}
                value={quickPlayerB}
                onChange={(name) => setQuickPlayerB(name)}
                players={roster.teamB}
                placeholder={`${shortB} player (optional)`}
                emptyOptionLabel={`-- ${shortB} Player (Optional) --`}
                ariaLabel={`${shortB} player`}
              />
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => {
                const pName = quickPlayerA.trim();
                const fdCur = {
                  ...createInitialFootballDetails(),
                  ...((score?.sportSpecificDetails || {}) as Partial<FootballDetails>),
                };
                void submitEvent(
                  pName
                    ? {
                        type: 'STRUCTURED_EVENT',
                        team: 'A',
                        eventType: 'GOAL',
                        minute: fdCur.timerMinutes,
                        playerName: pName,
                      }
                    : { type: 'GOAL', team: 'A', delta: 1 },
                  `${shortA} Goal (+1)${pName ? ` · ${pName}` : ''}`,
                  'Football',
                  pName
                    ? {
                        playerId: findDbPlayerId(pName, roster.teamA),
                        playerName: pName,
                      }
                    : undefined
                );
              }}
              className="min-h-[42px] px-3 py-2 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-white text-xs font-bold whitespace-nowrap"
            >
              +1 Goal ({shortA})
            </button>
            <button
              type="button"
              onClick={() =>
                submitEvent({ type: 'GOAL', team: 'A', delta: -1 }, `${shortA} -1`, 'Football')
              }
              className={`min-h-[42px] px-3 py-2 rounded-lg border text-xs font-semibold whitespace-nowrap ${btnNeutral}`}
            >
              -1 ({shortA})
            </button>
            <button
              type="button"
              onClick={() => {
                const pName = quickPlayerB.trim();
                const fdCur = {
                  ...createInitialFootballDetails(),
                  ...((score?.sportSpecificDetails || {}) as Partial<FootballDetails>),
                };
                void submitEvent(
                  pName
                    ? {
                        type: 'STRUCTURED_EVENT',
                        team: 'B',
                        eventType: 'GOAL',
                        minute: fdCur.timerMinutes,
                        playerName: pName,
                      }
                    : { type: 'GOAL', team: 'B', delta: 1 },
                  `${shortB} Goal (+1)${pName ? ` · ${pName}` : ''}`,
                  'Football',
                  pName
                    ? {
                        playerId: findDbPlayerId(pName, roster.teamB),
                        playerName: pName,
                      }
                    : undefined
                );
              }}
              className="min-h-[42px] px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold whitespace-nowrap"
            >
              +1 Goal ({shortB})
            </button>
            <button
              type="button"
              onClick={() =>
                submitEvent({ type: 'GOAL', team: 'B', delta: -1 }, `${shortB} -1`, 'Football')
              }
              className={`min-h-[42px] px-3 py-2 rounded-lg border text-xs font-semibold whitespace-nowrap ${btnNeutral}`}
            >
              -1 ({shortB})
            </button>
            {(() => {
              const fd = {
                ...createInitialFootballDetails(),
                ...((score?.sportSpecificDetails || {}) as Partial<FootballDetails>),
              };
              return (
                <div className={`col-span-full px-3 py-1.5 rounded-lg border text-xs font-mono ${subBarClass}`}>
                  {fd.half} · {String(fd.timerMinutes).padStart(2, '0')}:
                  {String(fd.timerSeconds).padStart(2, '0')} · {shortA} {score?.teamAScore ?? 0} -{' '}
                  {score?.teamBScore ?? 0} {shortB}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* KABADDI QUICK CONTROLS */}
      {sport === 'Kabaddi' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(['A', 'B'] as const).map((side) => {
            const label = side === 'A' ? shortA : shortB;
            const kd = normalizeKabaddiDetails(score?.sportSpecificDetails);
            const curScore = side === 'A' ? score?.teamAScore ?? 0 : score?.teamBScore ?? 0;
            const courtCount = side === 'A' ? kd.playersOnCourtA : kd.playersOnCourtB;
            const triggerKabaddi = (
              action: Record<string, unknown>,
              fallbackText: string
            ) => {
              const baseScore = scoreRef.current || score;
              const traceId = makeClientEventId('quick_kbd');
              const apiStartAtMs = Date.now();
              startScoreTrace(traceId, fallbackText, apiStartAtMs);
              const optimistic = applyOptimisticKabaddiEngineEvent(baseScore, action as any);
              if (optimistic) {
                scoreRef.current = optimistic;
                onScoreChange(optimistic);
              }
              setFeedback(null);

              return enqueueScoreMutation(stream.id, async () => {
                try {
                  const res = await scoreboardService.recordKabaddiEvent(stream.id, {
                    clientEventId: traceId,
                    traceId,
                    action,
                  });
                  completeScoreTraceApi(traceId, { status: 'synced', apiStartAtMs, diag: res.diag });
                  if (res.score) {
                    confirmedScoreRef.current = res.score;
                    if (getPendingScoreCount(stream.id) <= 1) {
                      scoreRef.current = res.score;
                      onScoreChange(res.score);
                    }
                  } else {
                    onRefresh?.();
                  }
                  setFeedback({
                    type: 'success',
                    text: res.historyItem?.action || fallbackText,
                  });
                } catch (err) {
                  if (getPendingScoreCount(stream.id) <= 1) {
                    const rollback = confirmedScoreRef.current || baseScore;
                    if (rollback) {
                      scoreRef.current = rollback;
                      onScoreChange(rollback);
                    }
                  }
                  const msg = extractApiError(err, 'Failed to update Kabaddi score.');
                  completeScoreTraceApi(traceId, { status: 'error', apiStartAtMs, errorText: msg });
                  setFeedback({
                    type: 'error',
                    text: msg,
                  });
                }
              });
            };
            const sideRoster = side === 'A' ? roster.teamA : roster.teamB;
            const sidePlayerName = side === 'A' ? quickPlayerA : quickPlayerB;
            const setSidePlayerName = side === 'A' ? setQuickPlayerA : setQuickPlayerB;
            const pickedPlayer = sideRoster.find(
              (p) => p.name.trim().toLowerCase() === sidePlayerName.trim().toLowerCase()
            );
            return (
              <div key={side} className={`p-2.5 rounded-lg border space-y-2 ${subBarClass}`}>
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>
                    {label} ({kd.half} · {courtCount} on court)
                  </span>
                  <span className="font-mono text-sm">{curScore}</span>
                </div>
                {sideRoster.length > 0 && (
                  <PlayerPickerField
                    compact
                    themeVariant={themeVariant}
                    value={sidePlayerName}
                    onChange={(name) => setSidePlayerName(name)}
                    players={sideRoster}
                    placeholder={`${label} player (optional)`}
                    emptyOptionLabel={`-- ${label} Player (Optional) --`}
                    ariaLabel={`${label} active player`}
                  />
                )}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={kd.matchCompleted}
                    onClick={() =>
                      triggerKabaddi(
                        {
                          type: 'TOUCH_POINT',
                          team: side,
                          ...(pickedPlayer?.dbPlayerId ? { raiderId: pickedPlayer.dbPlayerId } : {}),
                          ...(sidePlayerName.trim() ? { raiderName: sidePlayerName.trim() } : {}),
                        },
                        `${label} Touch Point`
                      )
                    }
                    className="min-h-[36px] px-2.5 py-1 rounded bg-[#EA580C] hover:bg-orange-600 text-white text-xs font-bold disabled:opacity-40"
                  >
                    Touch Point (+{kd.rules.touchPointValue})
                  </button>
                  <button
                    type="button"
                    disabled={kd.matchCompleted}
                    onClick={() =>
                      triggerKabaddi(
                        {
                          type: 'TACKLE_POINT',
                          team: side,
                          ...(pickedPlayer?.dbPlayerId ? { defenderId: pickedPlayer.dbPlayerId } : {}),
                          ...(sidePlayerName.trim() ? { defenderName: sidePlayerName.trim() } : {}),
                        },
                        `${label} Tackle Point (+${kd.rules.unsuccessfulRaidDefenderPoints})`
                      )
                    }
                    className="min-h-[36px] px-2.5 py-1 rounded bg-red-700 hover:bg-red-600 text-white text-xs font-bold disabled:opacity-40"
                  >
                    Tackle Point (+{kd.rules.unsuccessfulRaidDefenderPoints})
                  </button>
                  <button
                    type="button"
                    disabled={kd.matchCompleted}
                    onClick={() =>
                      triggerKabaddi(
                        {
                          type: 'EMPTY_RAID',
                          team: side,
                          ...(pickedPlayer?.dbPlayerId ? { raiderId: pickedPlayer.dbPlayerId } : {}),
                          ...(sidePlayerName.trim() ? { raiderName: sidePlayerName.trim() } : {}),
                        },
                        `${label} Empty Raid`
                      )
                    }
                    className={`min-h-[36px] px-2.5 py-1 rounded border text-xs font-bold disabled:opacity-40 ${btnNeutral}`}
                  >
                    Empty Raid
                  </button>
                  <button
                    type="button"
                    disabled={kd.matchCompleted}
                    onClick={() =>
                      triggerKabaddi(
                        {
                          type: 'BONUS_POINT',
                          team: side,
                          ...(pickedPlayer?.dbPlayerId ? { raiderId: pickedPlayer.dbPlayerId } : {}),
                          ...(sidePlayerName.trim() ? { raiderName: sidePlayerName.trim() } : {}),
                        },
                        `${label} Bonus Point`
                      )
                    }
                    className="min-h-[36px] px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-40"
                  >
                    Bonus (+{kd.rules.bonusPointValue})
                  </button>
                  <button
                    type="button"
                    disabled={
                      kd.matchCompleted ||
                      courtCount > kd.rules.superTackleMaxDefenders
                    }
                    onClick={() =>
                      triggerKabaddi(
                        {
                          type: 'SUPER_TACKLE',
                          team: side,
                          ...(pickedPlayer?.dbPlayerId ? { defenderId: pickedPlayer.dbPlayerId } : {}),
                          ...(sidePlayerName.trim() ? { defenderName: sidePlayerName.trim() } : {}),
                        },
                        `${label} Super Tackle`
                      )
                    }
                    className="min-h-[36px] px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-35"
                  >
                    Super Tackle
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VOLLEYBALL QUICK CONTROLS */}
      {sport === 'Volleyball' && (
        <div className="space-y-2">
          {volleyballLock.locked && (
            <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center gap-2 text-xs text-amber-200 font-semibold">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>{volleyballLock.reason}</span>
            </div>
          )}
          {(roster.teamA.length > 0 || roster.teamB.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <PlayerPickerField
                compact
                themeVariant={themeVariant}
                value={quickPlayerA}
                onChange={(name) => setQuickPlayerA(name)}
                players={roster.teamA}
                placeholder={`${shortA} scorer (optional)`}
                emptyOptionLabel={`-- ${shortA} Player (Optional) --`}
                ariaLabel={`${shortA} Volleyball player`}
              />
              <PlayerPickerField
                compact
                themeVariant={themeVariant}
                value={quickPlayerB}
                onChange={(name) => setQuickPlayerB(name)}
                players={roster.teamB}
                placeholder={`${shortB} scorer (optional)`}
                emptyOptionLabel={`-- ${shortB} Player (Optional) --`}
                ariaLabel={`${shortB} Volleyball player`}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {(() => {
              const vd = normalizeVolleyballDetails(
                (score?.sportSpecificDetails || {}) as Partial<VolleyballDetails>
              );
              const disabled = volleyballLock.locked;
              return (
                <>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      const pName = quickPlayerA.trim();
                      void submitEvent(
                        pName
                          ? {
                              type: 'STRUCTURED_POINT',
                              team: 'A',
                              eventType: 'ATTACK_POINT',
                              points: 1,
                              playerName: pName,
                            }
                          : { type: 'POINT', team: 'A', delta: 1 },
                        `${shortA} +1 Point${pName ? ` (${pName})` : ''}`,
                        'Volleyball',
                        pName
                          ? {
                              playerId: findDbPlayerId(pName, roster.teamA),
                              playerName: pName,
                            }
                          : undefined
                      );
                    }}
                    className="min-h-[42px] px-4 py-2 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-white text-xs font-bold disabled:opacity-40 whitespace-nowrap"
                  >
                    +1 {shortA} ({score?.teamAScore ?? 0})
                  </button>
                  <button
                    type="button"
                    disabled={disabled || (score?.teamAScore ?? 0) <= 0}
                    onClick={() =>
                      submitEvent(
                        { type: 'POINT', team: 'A', delta: -1 },
                        `${shortA} -1 Point`,
                        'Volleyball'
                      )
                    }
                    className={`min-h-[42px] px-3 py-2 rounded-lg border text-xs font-semibold disabled:opacity-40 ${btnNeutral}`}
                  >
                    -1
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      const pName = quickPlayerB.trim();
                      void submitEvent(
                        pName
                          ? {
                              type: 'STRUCTURED_POINT',
                              team: 'B',
                              eventType: 'ATTACK_POINT',
                              points: 1,
                              playerName: pName,
                            }
                          : { type: 'POINT', team: 'B', delta: 1 },
                        `${shortB} +1 Point${pName ? ` (${pName})` : ''}`,
                        'Volleyball',
                        pName
                          ? {
                              playerId: findDbPlayerId(pName, roster.teamB),
                              playerName: pName,
                            }
                          : undefined
                      );
                    }}
                    className="min-h-[42px] px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold disabled:opacity-40 whitespace-nowrap"
                  >
                    +1 {shortB} ({score?.teamBScore ?? 0})
                  </button>
                  <button
                    type="button"
                    disabled={disabled || (score?.teamBScore ?? 0) <= 0}
                    onClick={() =>
                      submitEvent(
                        { type: 'POINT', team: 'B', delta: -1 },
                        `${shortB} -1 Point`,
                        'Volleyball'
                      )
                    }
                    className={`min-h-[42px] px-3 py-2 rounded-lg border text-xs font-semibold disabled:opacity-40 ${btnNeutral}`}
                  >
                    -1
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      submitEvent(
                        {
                          type: 'SET_SERVING_TEAM',
                          team: vd.servingTeam === 'A' ? 'B' : 'A',
                        },
                        'Switched Serve',
                        'Volleyball'
                      )
                    }
                    className={`min-h-[42px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold disabled:opacity-40 whitespace-nowrap ${btnNeutral}`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Serve: {vd.servingTeam === 'A' ? shortA : shortB}</span>
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      submitEvent(
                        {
                          type: 'SET_ADVANTAGE',
                          team: vd.advantageTeam === 'A' ? null : 'A',
                        },
                        `Advantage ${shortA}`,
                        'Volleyball'
                      )
                    }
                    className={`min-h-[42px] px-3 py-2 rounded-lg border text-xs font-semibold disabled:opacity-40 whitespace-nowrap ${
                      vd.advantageTeam === 'A'
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : btnNeutral
                    }`}
                  >
                    ADV {shortA}
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      submitEvent(
                        {
                          type: 'SET_ADVANTAGE',
                          team: vd.advantageTeam === 'B' ? null : 'B',
                        },
                        `Advantage ${shortB}`,
                        'Volleyball'
                      )
                    }
                    className={`min-h-[42px] px-3 py-2 rounded-lg border text-xs font-semibold disabled:opacity-40 whitespace-nowrap ${
                      vd.advantageTeam === 'B'
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : btnNeutral
                    }`}
                  >
                    ADV {shortB}
                  </button>
                  <span className="font-mono text-xs px-2.5 py-1 rounded border border-slate-700/60 whitespace-nowrap">
                    Set {vd.currentSet}/{vd.bestOfSets}
                    {vd.isDeuce && !vd.advantageTeam ? ' · DEUCE' : ''}
                  </span>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* OTHER / GENERIC SPORT QUICK CONTROLS */}
      {sport === 'Other' && (
        <div className="space-y-2.5">
          {(roster.teamA.length > 0 || roster.teamB.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <PlayerPickerField
                compact
                themeVariant={themeVariant}
                value={quickPlayerA}
                onChange={(name) => setQuickPlayerA(name)}
                players={roster.teamA}
                placeholder={`${shortA} player (optional)`}
                emptyOptionLabel={`-- ${shortA} Player (Optional) --`}
                ariaLabel={`${shortA} player`}
              />
              <PlayerPickerField
                compact
                themeVariant={themeVariant}
                value={quickPlayerB}
                onChange={(name) => setQuickPlayerB(name)}
                players={roster.teamB}
                placeholder={`${shortB} player (optional)`}
                emptyOptionLabel={`-- ${shortB} Player (Optional) --`}
                ariaLabel={`${shortB} player`}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const pName = quickPlayerA.trim();
                void submitPatch({
                  teamAScore: (scoreRef.current?.teamAScore ?? score?.teamAScore ?? 0) + 1,
                  action: `${shortA} +1${pName ? ` (${pName})` : ''}`,
                });
              }}
              className="min-h-[42px] px-4 py-2 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-white text-xs font-bold"
            >
              +1 {shortA} ({score?.teamAScore ?? 0})
            </button>
            <button
              type="button"
              onClick={() =>
                submitPatch({
                  teamAScore: Math.max(0, (scoreRef.current?.teamAScore ?? score?.teamAScore ?? 0) - 1),
                  action: `${shortA} -1`,
                })
              }
              className={`min-h-[42px] px-3 py-2 rounded-lg border text-xs font-semibold ${btnNeutral}`}
            >
              -1
            </button>
            <button
              type="button"
              onClick={() => {
                const pName = quickPlayerB.trim();
                void submitPatch({
                  teamBScore: (scoreRef.current?.teamBScore ?? score?.teamBScore ?? 0) + 1,
                  action: `${shortB} +1${pName ? ` (${pName})` : ''}`,
                });
              }}
              className="min-h-[42px] px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
            >
              +1 {shortB} ({score?.teamBScore ?? 0})
            </button>
            <button
              type="button"
              onClick={() =>
                submitPatch({
                  teamBScore: Math.max(0, (scoreRef.current?.teamBScore ?? score?.teamBScore ?? 0) - 1),
                  action: `${shortB} -1`,
                })
              }
              className={`min-h-[42px] px-3 py-2 rounded-lg border text-xs font-semibold ${btnNeutral}`}
            >
              -1
            </button>
          </div>
        </div>
      )}

      {/* Quick Cricket Wicket Modal */}
      <Modal
        open={wicketModalOpen}
        onClose={() => setWicketModalOpen(false)}
        title="Record Wicket"
        subtitle={`Striker: ${cricketDetails.batsman1 || 'Current Striker'}`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Dismissal Type
            </label>
            <select
              value={wicketType}
              onChange={(e) => setWicketType(e.target.value)}
              className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
            >
              {WICKET_TYPES.map((wt) => (
                <option key={wt} value={wt}>
                  {wt.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Next Batsman / Incoming Batter (Optional)
            </label>
            <PlayerPickerField
              value={newBatsman}
              onChange={(name) => setNewBatsman(name)}
              players={battingRoster}
              placeholder="Select or type next batsman"
              emptyOptionLabel="-- Select next batsman (Optional) --"
              ariaLabel="Incoming New Batter"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setWicketModalOpen(false)}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const s = quickStriker.trim() || cricketDetails.batsman1 || '';
                const ns = quickNonStriker.trim() || cricketDetails.batsman2 || '';
                const bw = quickBowler.trim() || cricketDetails.bowler || '';
                await submitEvent(
                  {
                    type: 'WICKET',
                    wicketType,
                    dismissedPlayer: s || undefined,
                    newBatsman: newBatsman.trim() || undefined,
                    striker: s || undefined,
                    nonStriker: ns || undefined,
                    bowler: bw || undefined,
                  },
                  `Wicket (${wicketType.replace(/_/g, ' ')})`,
                  'Cricket',
                  {
                    playerId: findDbPlayerId(s, battingRoster),
                    playerName: s || undefined,
                    assistPlayerId: findDbPlayerId(bw, bowlingRoster),
                    assistPlayerName: bw || undefined,
                  }
                );
                setWicketModalOpen(false);
              }}
              className="min-h-[40px] px-4 py-2 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              Confirm Wicket
            </button>
          </div>
        </div>
      </Modal>

      {/* Quick Start 2nd Innings Modal */}
      <Modal
        open={secondInningsOpen}
        onClose={() => setSecondInningsOpen(false)}
        title="Start 2nd Innings"
        subtitle={`Chasing Target: ${cricketChase.target || cricketDetails.teamARuns + 1} · All player fields optional`}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Opening Striker (Optional)
            </label>
            <PlayerPickerField
              value={secondBatter1}
              onChange={(name) => setSecondBatter1(name)}
              players={secondBattingRoster}
              placeholder="Opening striker (optional)"
              emptyOptionLabel="-- Select striker (Optional) --"
              ariaLabel="Opening Striker"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Opening Non-Striker (Optional)
            </label>
            <PlayerPickerField
              value={secondBatter2}
              onChange={(name) => setSecondBatter2(name)}
              players={secondBattingRoster}
              placeholder="Non-striker (optional)"
              emptyOptionLabel="-- Select non-striker (Optional) --"
              ariaLabel="Opening Non-Striker"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Opening Bowler (Optional)
            </label>
            <PlayerPickerField
              value={secondBowler}
              onChange={(name) => setSecondBowler(name)}
              players={secondBowlingRoster}
              placeholder="Opening bowler (optional)"
              emptyOptionLabel="-- Select bowler (Optional) --"
              ariaLabel="Opening Bowler"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setSecondInningsOpen(false)}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleStartSecondInnings}
              className="min-h-[40px] px-4 py-2 text-xs font-bold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50"
            >
              Start Chase
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
