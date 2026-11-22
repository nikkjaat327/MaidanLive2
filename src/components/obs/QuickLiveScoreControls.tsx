import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Lock,
  Play,
  RotateCcw,
  ShieldAlert,
  Undo2,
  Zap,
} from 'lucide-react';
import type { LiveScoreData, LiveStreamData } from '../../types/index.ts';
import type { SportOption } from '../../constants/sports.ts';
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
import { VolleyballDetails, createInitialVolleyballDetails } from '../../utils/volleyballScoring.ts';
import { deriveShortTeamName } from '../../utils/matchResultValidation.ts';
import { STANDARD_MATCH_STATUSES } from '../../utils/matchStatus.ts';
import { Modal } from '../common/Modal.tsx';

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

function makeClientEventId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

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
  const cricketChase = useMemo(
    () => computeCricketChaseState(cricketDetails, nameA, nameB),
    [cricketDetails, nameA, nameB]
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
    try {
      setBusy(true);
      setFeedback(null);
      const res = await offlineScoreService.submitScoreEvent(
        stream.id,
        {
          clientEventId: makeClientEventId('quick'),
          sportType: sportTypeOverride || sport,
          action,
        },
        score
      );
      if (res.score) onScoreChange(res.score);
      onRefresh?.();
      setFeedback({
        type: 'success',
        text: res.queued
          ? `Cached offline (${successFallback})`
          : res.historyItem?.action || successFallback,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: extractApiError(err, 'Failed to update live score.'),
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
    try {
      setBusy(true);
      setFeedback(null);
      const res = await offlineScoreService.submitScorePatch(stream.id, payload, score);
      if (res.score) onScoreChange(res.score);
      onRefresh?.();
      setFeedback({
        type: 'success',
        text: res.queued ? `Cached offline (${payload.action})` : payload.action,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: extractApiError(err, 'Failed to update match score.'),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleUndo() {
    try {
      setBusy(true);
      setFeedback(null);
      const res = await scoreboardService.undoScore(stream.id);
      onScoreChange(res.score);
      onRefresh?.();
      setFeedback({ type: 'success', text: `Undid: ${res.undoneAction}` });
    } catch (err) {
      setFeedback({ type: 'error', text: extractApiError(err, 'Nothing to undo.') });
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
            disabled={busy}
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
              try {
                setBusy(true);
                setFeedback(null);
                const res = await scoreboardService.recordKabaddiEvent(stream.id, {
                  clientEventId: makeClientEventId('quick_kbd'),
                  action,
                });
                onScoreChange(res.score);
                onRefresh?.();
                setFeedback({
                  type: 'success',
                  text: res.historyItem?.action || fallbackText,
                });
              } catch (err) {
                setFeedback({
                  type: 'error',
                  text: extractApiError(err, 'Failed to update Kabaddi score.'),
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
        <div className="flex flex-wrap items-center gap-2">
          {(() => {
            const vd = {
              ...createInitialVolleyballDetails(),
              ...((score?.sportSpecificDetails || {}) as Partial<VolleyballDetails>),
            };
            return (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    submitEvent(
                      { type: 'POINT', team: 'A', delta: 1 },
                      `${shortA} +1 Point`,
                      'Volleyball'
                    )
                  }
                  className="min-h-[42px] px-4 py-2 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-white text-xs font-bold"
                >
                  +1 {shortA} ({score?.teamAScore ?? 0})
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    submitEvent(
                      { type: 'POINT', team: 'A', delta: -1 },
                      `${shortA} -1 Point`,
                      'Volleyball'
                    )
                  }
                  className={`min-h-[42px] px-3 py-2 rounded-lg border text-xs font-semibold ${btnNeutral}`}
                >
                  -1
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    submitEvent(
                      { type: 'POINT', team: 'B', delta: 1 },
                      `${shortB} +1 Point`,
                      'Volleyball'
                    )
                  }
                  className="min-h-[42px] px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
                >
                  +1 {shortB} ({score?.teamBScore ?? 0})
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    submitEvent(
                      { type: 'POINT', team: 'B', delta: -1 },
                      `${shortB} -1 Point`,
                      'Volleyball'
                    )
                  }
                  className={`min-h-[42px] px-3 py-2 rounded-lg border text-xs font-semibold ${btnNeutral}`}
                >
                  -1
                </button>
                <button
                  type="button"
                  disabled={busy}
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
                  className={`min-h-[42px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold ${btnNeutral}`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Serve: {vd.servingTeam === 'A' ? shortA : shortB}</span>
                </button>
                <span className="font-mono text-xs px-2.5 py-1 rounded border border-slate-700/60">
                  Set {vd.currentSet}/{vd.bestOfSets}
                </span>
              </>
            );
          })()}
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
