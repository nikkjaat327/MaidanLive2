import { useMemo, useState } from 'react';
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
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../../types/index.ts';
import type { SportOption } from '../../constants/sports.ts';
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
import {
  applyOptimisticKabaddiEngineEvent,
  applyOptimisticPatch,
  applyOptimisticStructuredEvent,
  makeClientEventId,
} from '../../utils/optimisticScore.ts';
import { completeScoreTraceApi, startScoreTrace } from '../../utils/realtimeDiagnostics.ts';

interface QuickLiveScoreControlsProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
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
  onScoreChange,
  onRefresh,
  themeVariant = 'dark',
}: QuickLiveScoreControlsProps) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Quick cricket wicket modal state
  const [wicketModalOpen, setWicketModalOpen] = useState(false);
  const [wicketType, setWicketType] = useState<string>('CAUGHT');
  const [newBatsman, setNewBatsman] = useState('');

  // Quick 2nd innings modal state
  const [secondInningsOpen, setSecondInningsOpen] = useState(false);
  const [secondBatter1, setSecondBatter1] = useState('');
  const [secondBatter2, setSecondBatter2] = useState('');
  const [secondBowler, setSecondBowler] = useState('');

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
    sportTypeOverride?: string
  ) {
    const prevScore = score;
    const effectiveSport = sportTypeOverride || sport;
    const traceId = makeClientEventId('quick');
    const apiStartAtMs = Date.now();
    startScoreTrace(traceId, successFallback, apiStartAtMs);
    const optimistic = applyOptimisticStructuredEvent(score, effectiveSport, action);
    if (optimistic && optimistic !== score) {
      onScoreChange(optimistic);
    }

    try {
      setBusy(true);
      setFeedback(null);
      const res = await offlineScoreService.submitScoreEvent(
        stream.id,
        {
          clientEventId: traceId,
          traceId,
          sportType: effectiveSport,
          action,
        },
        score
      );
      completeScoreTraceApi(traceId, {
        status: res.queued ? 'queued' : 'synced',
        apiStartAtMs,
        diag: res.diag,
      });
      if (res.score) {
        onScoreChange(res.score);
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
      if (prevScore) onScoreChange(prevScore);
      const msg = extractApiError(err, 'Failed to update live score.');
      completeScoreTraceApi(traceId, { status: 'error', apiStartAtMs, errorText: msg });
      setFeedback({
        type: 'error',
        text: msg,
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitPatch(payload: {
    teamAScore?: number;
    teamBScore?: number;
    matchStatus?: string;
    sportSpecificDetails?: Record<string, unknown>;
    action: string;
  }) {
    const prevScore = score;
    const traceId = makeClientEventId('quick_patch');
    const apiStartAtMs = Date.now();
    startScoreTrace(traceId, payload.action, apiStartAtMs);
    const optimistic = applyOptimisticPatch(score, payload);
    if (optimistic) {
      onScoreChange(optimistic);
    }

    try {
      setBusy(true);
      setFeedback(null);
      const res = await offlineScoreService.submitScorePatch(
        stream.id,
        { ...payload, clientEventId: traceId, traceId },
        score
      );
      completeScoreTraceApi(traceId, {
        status: res.queued ? 'queued' : 'synced',
        apiStartAtMs,
        diag: res.diag,
      });
      if (res.score) {
        onScoreChange(res.score);
      } else if (!res.queued) {
        onRefresh?.();
      }
      setFeedback({
        type: 'success',
        text: res.queued ? `Cached offline (${payload.action})` : payload.action,
      });
    } catch (err) {
      if (prevScore) onScoreChange(prevScore);
      const msg = extractApiError(err, 'Failed to update match score.');
      completeScoreTraceApi(traceId, { status: 'error', apiStartAtMs, errorText: msg });
      setFeedback({
        type: 'error',
        text: msg,
      });
    } finally {
      setBusy(false);
    }
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
        batsman1: secondBatter1.trim() || 'Opener 1',
        batsman2: secondBatter2.trim() || 'Opener 2',
        bowler: secondBowler.trim() || 'Opening Bowler',
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
            disabled={busy || volleyballLock.locked}
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
            disabled={busy}
            onClick={handleUndo}
            className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${btnNeutral}`}
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
                disabled={busy || cricketLock.locked}
                onClick={() =>
                  submitEvent(
                    {
                      type: 'RUNS',
                      runs: b.runs,
                      striker: cricketDetails.batsman1 || undefined,
                      nonStriker: cricketDetails.batsman2 || undefined,
                      bowler: cricketDetails.bowler || undefined,
                    },
                    `+${b.runs} run${b.runs === 1 ? '' : 's'}`
                  )
                }
                className={`min-h-[42px] px-3.5 py-2 rounded-lg border font-mono tabular-nums text-xs font-extrabold transition-colors disabled:opacity-40 whitespace-nowrap ${b.cls}`}
              >
                {b.label}
              </button>
            ))}

            <button
              type="button"
              disabled={busy || cricketLock.locked}
              onClick={() =>
                submitEvent(
                  {
                    type: 'WIDE',
                    extraRuns: 0,
                    striker: cricketDetails.batsman1 || undefined,
                    nonStriker: cricketDetails.batsman2 || undefined,
                    bowler: cricketDetails.bowler || undefined,
                  },
                  'Wide +1'
                )
              }
              className="min-h-[42px] px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 font-mono text-xs font-bold disabled:opacity-40 whitespace-nowrap"
            >
              Wd +1
            </button>

            <button
              type="button"
              disabled={busy || cricketLock.locked}
              onClick={() =>
                submitEvent(
                  {
                    type: 'NO_BALL',
                    extraRuns: 0,
                    batRuns: 0,
                    striker: cricketDetails.batsman1 || undefined,
                    nonStriker: cricketDetails.batsman2 || undefined,
                    bowler: cricketDetails.bowler || undefined,
                  },
                  'No Ball +1'
                )
              }
              className="min-h-[42px] px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 font-mono text-xs font-bold disabled:opacity-40 whitespace-nowrap"
            >
              NB +1
            </button>

            <button
              type="button"
              disabled={busy || cricketLock.locked}
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
              disabled={busy || cricketLock.locked}
              onClick={() => submitEvent({ type: 'CHANGE_STRIKER' }, 'Swapped striker')}
              className={`min-h-[42px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold disabled:opacity-40 whitespace-nowrap ${btnNeutral}`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Swap Strike</span>
            </button>

            {cricketDetails.innings === 1 && !cricketDetails.innings1Completed && (
              <button
                type="button"
                disabled={busy}
                onClick={handleCompleteFirstInnings}
                className="min-h-[42px] px-3 py-2 rounded-lg border border-orange-500/40 bg-[#EA580C]/20 text-orange-300 hover:bg-[#EA580C]/30 text-xs font-semibold disabled:opacity-40 whitespace-nowrap"
              >
                End 1st Innings
              </button>
            )}
          </div>

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
              {cricketDetails.batsman1 && (
                <span>
                  Striker: <strong>*{cricketDetails.batsman1}</strong>
                </span>
              )}
              {cricketDetails.bowler && (
                <span>
                  Bowler: <strong>{cricketDetails.bowler}</strong>
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              submitEvent({ type: 'GOAL', team: 'A', delta: 1 }, `${shortA} Goal (+1)`, 'Football')
            }
            className="min-h-[42px] px-3 py-2 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-white text-xs font-bold whitespace-nowrap"
          >
            +1 Goal ({shortA})
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              submitEvent({ type: 'GOAL', team: 'A', delta: -1 }, `${shortA} -1`, 'Football')
            }
            className={`min-h-[42px] px-3 py-2 rounded-lg border text-xs font-semibold whitespace-nowrap ${btnNeutral}`}
          >
            -1 ({shortA})
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              submitEvent({ type: 'GOAL', team: 'B', delta: 1 }, `${shortB} Goal (+1)`, 'Football')
            }
            className="min-h-[42px] px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold whitespace-nowrap"
          >
            +1 Goal ({shortB})
          </button>
          <button
            type="button"
            disabled={busy}
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
      )}

      {/* KABADDI QUICK CONTROLS */}
      {sport === 'Kabaddi' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(['A', 'B'] as const).map((side) => {
            const label = side === 'A' ? shortA : shortB;
            const kd = normalizeKabaddiDetails(score?.sportSpecificDetails);
            const curScore = side === 'A' ? score?.teamAScore ?? 0 : score?.teamBScore ?? 0;
            const courtCount = side === 'A' ? kd.playersOnCourtA : kd.playersOnCourtB;
            const triggerKabaddi = async (
              action: Record<string, unknown>,
              fallbackText: string
            ) => {
              const prevScore = score;
              const traceId = makeClientEventId('quick_kbd');
              const apiStartAtMs = Date.now();
              startScoreTrace(traceId, fallbackText, apiStartAtMs);
              const optimistic = applyOptimisticKabaddiEngineEvent(score, action as any);
              if (optimistic) {
                onScoreChange(optimistic);
              }
              try {
                setBusy(true);
                setFeedback(null);
                const res = await scoreboardService.recordKabaddiEvent(stream.id, {
                  clientEventId: traceId,
                  traceId,
                  action,
                });
                completeScoreTraceApi(traceId, { status: 'synced', apiStartAtMs, diag: res.diag });
                if (res.score) {
                  onScoreChange(res.score);
                } else {
                  onRefresh?.();
                }
                setFeedback({
                  type: 'success',
                  text: res.historyItem?.action || fallbackText,
                });
              } catch (err) {
                if (prevScore) onScoreChange(prevScore);
                const msg = extractApiError(err, 'Failed to update Kabaddi score.');
                completeScoreTraceApi(traceId, { status: 'error', apiStartAtMs, errorText: msg });
                setFeedback({
                  type: 'error',
                  text: msg,
                });
              } finally {
                setBusy(false);
              }
            };
            return (
              <div key={side} className={`p-2.5 rounded-lg border space-y-2 ${subBarClass}`}>
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>
                    {label} ({kd.half} · {courtCount} on court)
                  </span>
                  <span className="font-mono text-sm">{curScore}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={busy || kd.matchCompleted}
                    onClick={() =>
                      triggerKabaddi({ type: 'TOUCH_POINT', team: side }, `${label} Touch Point`)
                    }
                    className="min-h-[36px] px-2.5 py-1 rounded bg-[#EA580C] hover:bg-orange-600 text-white text-xs font-bold disabled:opacity-40"
                  >
                    Touch Point (+{kd.rules.touchPointValue})
                  </button>
                  <button
                    type="button"
                    disabled={busy || kd.matchCompleted}
                    onClick={() =>
                      triggerKabaddi(
                        { type: 'TACKLE_POINT', team: side },
                        `${label} Tackle Point (+${kd.rules.unsuccessfulRaidDefenderPoints})`
                      )
                    }
                    className="min-h-[36px] px-2.5 py-1 rounded bg-red-700 hover:bg-red-600 text-white text-xs font-bold disabled:opacity-40"
                  >
                    Tackle Point (+{kd.rules.unsuccessfulRaidDefenderPoints})
                  </button>
                  <button
                    type="button"
                    disabled={busy || kd.matchCompleted}
                    onClick={() =>
                      triggerKabaddi({ type: 'EMPTY_RAID', team: side }, `${label} Empty Raid`)
                    }
                    className={`min-h-[36px] px-2.5 py-1 rounded border text-xs font-bold disabled:opacity-40 ${btnNeutral}`}
                  >
                    Empty Raid
                  </button>
                  <button
                    type="button"
                    disabled={busy || kd.matchCompleted}
                    onClick={() =>
                      triggerKabaddi({ type: 'BONUS_POINT', team: side }, `${label} Bonus Point`)
                    }
                    className="min-h-[36px] px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-40"
                  >
                    Bonus (+{kd.rules.bonusPointValue})
                  </button>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      kd.matchCompleted ||
                      courtCount > kd.rules.superTackleMaxDefenders
                    }
                    onClick={() =>
                      triggerKabaddi({ type: 'SUPER_TACKLE', team: side }, `${label} Super Tackle`)
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
          <div className="flex flex-wrap items-center gap-2">
            {(() => {
              const vd = normalizeVolleyballDetails(
                (score?.sportSpecificDetails || {}) as Partial<VolleyballDetails>
              );
              const disabled = busy || volleyballLock.locked;
              return (
                <>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      submitEvent(
                        { type: 'POINT', team: 'A', delta: 1 },
                        `${shortA} +1 Point`,
                        'Volleyball'
                      )
                    }
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
                    onClick={() =>
                      submitEvent(
                        { type: 'POINT', team: 'B', delta: 1 },
                        `${shortB} +1 Point`,
                        'Volleyball'
                      )
                    }
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              submitPatch({
                teamAScore: (score?.teamAScore ?? 0) + 1,
                action: `${shortA} +1`,
              })
            }
            className="min-h-[42px] px-4 py-2 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-white text-xs font-bold"
          >
            +1 {shortA} ({score?.teamAScore ?? 0})
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              submitPatch({
                teamAScore: Math.max(0, (score?.teamAScore ?? 0) - 1),
                action: `${shortA} -1`,
              })
            }
            className={`min-h-[42px] px-3 py-2 rounded-lg border text-xs font-semibold ${btnNeutral}`}
          >
            -1
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              submitPatch({
                teamBScore: (score?.teamBScore ?? 0) + 1,
                action: `${shortB} +1`,
              })
            }
            className="min-h-[42px] px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
          >
            +1 {shortB} ({score?.teamBScore ?? 0})
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              submitPatch({
                teamBScore: Math.max(0, (score?.teamBScore ?? 0) - 1),
                action: `${shortB} -1`,
              })
            }
            className={`min-h-[42px] px-3 py-2 rounded-lg border text-xs font-semibold ${btnNeutral}`}
          >
            -1
          </button>
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
              Incoming New Batter (Optional)
            </label>
            <input
              type="text"
              value={newBatsman}
              onChange={(e) => setNewBatsman(e.target.value)}
              placeholder="e.g. R. Sharma"
              className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
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
                await submitEvent(
                  {
                    type: 'WICKET',
                    wicketType,
                    dismissedPlayer: cricketDetails.batsman1 || undefined,
                    newBatsman: newBatsman.trim() || undefined,
                    striker: cricketDetails.batsman1 || undefined,
                    nonStriker: cricketDetails.batsman2 || undefined,
                    bowler: cricketDetails.bowler || undefined,
                  },
                  `Wicket (${wicketType.replace(/_/g, ' ')})`
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
        subtitle={`Chasing Target: ${cricketChase.target || cricketDetails.teamARuns + 1}`}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Striker (Batter 1)
            </label>
            <input
              type="text"
              value={secondBatter1}
              onChange={(e) => setSecondBatter1(e.target.value)}
              placeholder="Opener 1"
              className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Non-Striker (Batter 2)
            </label>
            <input
              type="text"
              value={secondBatter2}
              onChange={(e) => setSecondBatter2(e.target.value)}
              placeholder="Opener 2"
              className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Opening Bowler
            </label>
            <input
              type="text"
              value={secondBowler}
              onChange={(e) => setSecondBowler(e.target.value)}
              placeholder="Opening Bowler"
              className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
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
