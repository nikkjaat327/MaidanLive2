import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  ClipboardList,
  Lock,
  Play,
  ShieldAlert,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import { LiveScoreData, LiveStreamData, PlayerData } from '../../types/index.ts';
import {
  CRICKET_OVER_PRESETS,
  CricketActionPayload,
  CricketDetails,
  computeCricketChaseState,
  formatCricketOvers,
  isCricketScoringLocked,
  normalizeCricketDetails,
} from '../../utils/cricketScoring.ts';
import { scoreboardService } from '../../services/scoreboard/scoreboardService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { ConfirmDialog } from '../common/ConfirmDialog.tsx';
import { Modal } from '../common/Modal.tsx';
import { CricketScorecardPanel } from './CricketScorecardPanel.tsx';
import { PlayerPickerField } from './PlayerPickerField.tsx';
import { mergeMatchRoster, UnifiedMatchPlayer } from '../../utils/sportPositions.ts';

interface CricketScorerConsoleProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  players: PlayerData[];
  saving: boolean;
  pendingOps?: number;
  onScoreChange: (score: LiveScoreData) => void;
  onRefreshHistory: () => void;
  onRefreshStats?: () => void;
  onOpenResultModal: () => void;
  onSubmitCricketEvent: (payload: {
    clientEventId: string;
    sportType: 'Cricket';
    action: CricketActionPayload | Record<string, unknown>;
    playerId?: string;
    playerName?: string;
    assistPlayerId?: string;
    assistPlayerName?: string;
  }) => Promise<void>;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

const DISMISSAL_TYPES = [
  'BOWLED',
  'CAUGHT',
  'LBW',
  'RUN_OUT',
  'STUMPED',
  'HIT_WICKET',
  'RETIRED_HURT',
  'RETIRED_OUT',
] as const;

function makeClientEventId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function CricketScorerConsole({
  stream,
  score,
  players,
  saving,
  pendingOps = 0,
  onScoreChange,
  onRefreshHistory,
  onRefreshStats,
  onOpenResultModal,
  onSubmitCricketEvent,
  onError,
  onSuccess,
}: CricketScorerConsoleProps) {
  const details = useMemo(
    () =>
      normalizeCricketDetails(
        (score?.sportSpecificDetails || {}) as Partial<CricketDetails>
      ),
    [score?.sportSpecificDetails]
  );

  const teamA = stream.teamAName || 'Team A';
  const teamB = stream.teamBName || 'Team B';
  const chase = useMemo(
    () => computeCricketChaseState(details, teamA, teamB),
    [details, teamA, teamB]
  );
  const lockState = useMemo(() => isCricketScoringLocked(details), [details]);
  const terminalBusy = saving || pendingOps > 0;

  const [batsman1, setBatsman1] = useState(details.batsman1 || '');
  const [batsman2, setBatsman2] = useState(details.batsman2 || '');
  const [bowler, setBowler] = useState(details.bowler || '');
  const [target, setTarget] = useState(String(details.target || 0));
  const [oversLimit, setOversLimit] = useState(String(details.oversLimit || 20));
  const [playersPerSide, setPlayersPerSide] = useState(String(details.playersPerSide || 11));
  const [shortA, setShortA] = useState(details.teamAShortName || '');
  const [shortB, setShortB] = useState(details.teamBShortName || '');
  const [tossWinner, setTossWinner] = useState<'A' | 'B' | ''>(details.tossWinner || '');
  const [tossDecision, setTossDecision] = useState<'BAT' | 'BOWL' | ''>(
    details.tossDecision || ''
  );
  const [isSuperOver, setIsSuperOver] = useState(Boolean(details.isSuperOver));
  const [soRunsA, setSoRunsA] = useState(String(details.superOverTeamARuns || 0));
  const [soWktsA, setSoWktsA] = useState(String(details.superOverTeamAWickets || 0));
  const [soRunsB, setSoRunsB] = useState(String(details.superOverTeamBRuns || 0));
  const [soWktsB, setSoWktsB] = useState(String(details.superOverTeamBWickets || 0));

  // Sub-modals & interactive drawers
  const [extrasPicker, setExtrasPicker] = useState<'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE' | null>(null);
  const [wicketOpen, setWicketOpen] = useState(false);
  const [wicketType, setWicketType] = useState<string>('CAUGHT');
  const [dismissedRole, setDismissedRole] = useState<'STRIKER' | 'NON_STRIKER'>('STRIKER');
  const [wicketFielder, setWicketFielder] = useState('');
  const [wicketRuns, setWicketRuns] = useState(0);
  const [wicketNewBatter, setWicketNewBatter] = useState('');

  const [endOverOpen, setEndOverOpen] = useState(false);
  const [nextOverBowler, setNextOverBowler] = useState('');

  const [completeInningsConfirmOpen, setCompleteInningsConfirmOpen] = useState(false);
  const [completingInnings, setCompletingInnings] = useState(false);

  const [secondInningsOpen, setSecondInningsOpen] = useState(false);
  const [secondBattingTeam, setSecondBattingTeam] = useState<'A' | 'B'>(
    (details.firstInningsBattingTeam || details.battingTeam) === 'A' ? 'B' : 'A'
  );
  const [secondBatter1, setSecondBatter1] = useState('');
  const [secondBatter2, setSecondBatter2] = useState('');
  const [secondBowler, setSecondBowler] = useState('');
  const [secondOvers, setSecondOvers] = useState(String(details.oversLimit || 20));
  const [secondTarget, setSecondTarget] = useState('');
  const [startingSecondInnings, setStartingSecondInnings] = useState(false);

  const [showLiveScorecard, setShowLiveScorecard] = useState(false);

  const [substituteOpen, setSubstituteOpen] = useState(false);
  const [subRole, setSubRole] = useState<'STRIKER' | 'NON_STRIKER' | 'BOWLER' | 'SQUAD'>('STRIKER');
  const [subTeam, setSubTeam] = useState<'A' | 'B'>(details.battingTeam);
  const [subPlayerOut, setSubPlayerOut] = useState('');
  const [subPlayerIn, setSubPlayerIn] = useState('');
  const [subReason, setSubReason] = useState('');

  useEffect(() => {
    setBatsman1(details.batsman1 || '');
    setBatsman2(details.batsman2 || '');
    setBowler(details.bowler || '');
    setTarget(String(details.target || 0));
    setOversLimit(String(details.oversLimit || 20));
    setPlayersPerSide(String(details.playersPerSide || 11));
    setShortA(details.teamAShortName || '');
    setShortB(details.teamBShortName || '');
    setTossWinner(details.tossWinner || '');
    setTossDecision(details.tossDecision || '');
    setIsSuperOver(Boolean(details.isSuperOver));
    setSoRunsA(String(details.superOverTeamARuns || 0));
    setSoWktsA(String(details.superOverTeamAWickets || 0));
    setSoRunsB(String(details.superOverTeamBRuns || 0));
    setSoWktsB(String(details.superOverTeamBWickets || 0));
  }, [details]);

  // Merge drafted match players with DB roster players per team side
  const roster = useMemo(() => mergeMatchRoster(stream, players), [stream, players]);

  const { battingRoster, bowlingRoster } = useMemo(() => {
    const batSide = details.battingTeam === 'A' ? roster.teamA : roster.teamB;
    const bowlSide = details.battingTeam === 'A' ? roster.teamB : roster.teamA;
    return {
      battingRoster: batSide.length > 0 ? batSide : roster.all,
      bowlingRoster: bowlSide.length > 0 ? bowlSide : roster.all,
    };
  }, [roster, details.battingTeam]);

  const { secondBattingRoster, secondBowlingRoster } = useMemo(() => {
    const batSide = secondBattingTeam === 'A' ? roster.teamA : roster.teamB;
    const bowlSide = secondBattingTeam === 'A' ? roster.teamB : roster.teamA;
    return {
      secondBattingRoster: batSide.length > 0 ? batSide : roster.all,
      secondBowlingRoster: bowlSide.length > 0 ? bowlSide : roster.all,
    };
  }, [roster, secondBattingTeam]);

  function findPlayerIdByName(name: string, pool: UnifiedMatchPlayer[]): string | undefined {
    const norm = name.trim().toLowerCase();
    if (!norm) return undefined;
    const match = pool.find((p) => p.name.trim().toLowerCase() === norm);
    return match?.dbPlayerId;
  }

  async function dispatchDelivery(
    action: CricketActionPayload,
    opts?: { dismissedOverride?: string; strikerOverride?: string; bowlerOverride?: string }
  ) {
    if (lockState.locked) {
      onError(lockState.reason);
      return;
    }
    const strikerName = (opts?.strikerOverride ?? batsman1).trim();
    const nonStrikerName = batsman2.trim();
    const bowlerName = (opts?.bowlerOverride ?? bowler).trim();

    const pId = findPlayerIdByName(opts?.dismissedOverride || strikerName, battingRoster);
    const bId = findPlayerIdByName(bowlerName, bowlingRoster);

    await onSubmitCricketEvent({
      clientEventId: makeClientEventId('cric'),
      sportType: 'Cricket',
      action: {
        ...action,
        striker: strikerName || undefined,
        nonStriker: nonStrikerName || undefined,
        bowler: bowlerName || undefined,
      },
      playerId: pId,
      playerName: opts?.dismissedOverride || strikerName || undefined,
      assistPlayerId: bId,
      assistPlayerName: bowlerName || undefined,
    });
  }

  async function handleConfirmCompleteInnings() {
    try {
      setCompletingInnings(true);
      const res = await scoreboardService.completeCricketInnings(stream.id, 'MANUAL');
      onScoreChange(res.score);
      onRefreshHistory();
      onRefreshStats?.();
      setCompleteInningsConfirmOpen(false);
      onSuccess('1st Innings completed & locked. Setup 2nd Innings when ready.');
    } catch (err) {
      onError(extractApiError(err, 'Failed to complete 1st innings.'));
    } finally {
      setCompletingInnings(false);
    }
  }

  function openSecondInningsModal() {
    const firstSide = details.firstInningsBattingTeam || details.battingTeam || 'A';
    const nextSide: 'A' | 'B' = firstSide === 'A' ? 'B' : 'A';
    const firstRuns = firstSide === 'A' ? details.teamARuns : details.teamBRuns;
    setSecondBattingTeam(nextSide);
    setSecondBatter1('');
    setSecondBatter2('');
    setSecondBowler('');
    setSecondOvers(String(details.oversLimit || 20));
    setSecondTarget(String(details.target > 0 ? details.target : firstRuns + 1));
    setSecondInningsOpen(true);
  }

  async function handleStartSecondInnings(e: React.FormEvent) {
    e.preventDefault();
    try {
      setStartingSecondInnings(true);
      const firstSideLocal = details.firstInningsBattingTeam || details.battingTeam || 'A';
      const firstRunsLocal = firstSideLocal === 'A' ? details.teamARuns : details.teamBRuns;
      const resolvedTarget = Math.max(
        1,
        Math.floor(Number(secondTarget) || details.target || firstRunsLocal + 1 || 1)
      );
      const resolvedOvers = Math.max(
        1,
        Math.min(90, Math.floor(Number(secondOvers) || details.oversLimit || 20))
      );
      const res = await scoreboardService.startSecondCricketInnings(stream.id, {
        battingTeam: secondBattingTeam,
        batsman1: secondBatter1.trim(),
        batsman2: secondBatter2.trim(),
        bowler: secondBowler.trim(),
        oversLimit: resolvedOvers,
        target: resolvedTarget,
      });
      onScoreChange(res.score);
      onRefreshHistory();
      setSecondInningsOpen(false);
      onSuccess('2nd Innings started cleanly!');
    } catch (err) {
      onError(extractApiError(err, 'Failed to start 2nd innings.'));
    } finally {
      setStartingSecondInnings(false);
    }
  }

  async function handleSubmitWicket(e: React.FormEvent) {
    e.preventDefault();
    const dismissedName =
      dismissedRole === 'NON_STRIKER'
        ? batsman2.trim() || batsman1.trim() || 'Non-Striker'
        : batsman1.trim() || 'Batter';
    await dispatchDelivery(
      {
        type: 'WICKET',
        wicketType,
        dismissedPlayer: dismissedName,
        newBatsman: wicketNewBatter.trim(),
        fielder: wicketFielder.trim(),
        batRuns: wicketRuns,
      },
      { dismissedOverride: dismissedName }
    );
    setWicketOpen(false);
    setWicketFielder('');
    setWicketNewBatter('');
    setWicketRuns(0);
    setDismissedRole('STRIKER');
  }

  async function handleConfirmEndOver(e: React.FormEvent) {
    e.preventDefault();
    await onSubmitCricketEvent({
      clientEventId: makeClientEventId('endov'),
      sportType: 'Cricket',
      action: {
        type: 'END_OVER',
        nextBowler: nextOverBowler.trim() || undefined,
      },
    });
    if (nextOverBowler.trim()) setBowler(nextOverBowler.trim());
    setEndOverOpen(false);
    setNextOverBowler('');
  }

  async function handleUpdateMeta() {
    await onSubmitCricketEvent({
      clientEventId: makeClientEventId('meta'),
      sportType: 'Cricket',
      action: {
        type: 'UPDATE_META',
        batsman1,
        batsman2,
        bowler,
        target: Number(target) || 0,
        oversLimit: Math.max(1, Math.min(90, Math.floor(Number(oversLimit) || 20))),
        playersPerSide: Math.max(2, Math.min(15, Math.floor(Number(playersPerSide) || 11))),
        teamAShortName: shortA,
        teamBShortName: shortB,
        tossWinner,
        tossDecision,
        isSuperOver,
        superOverTeamARuns: Number(soRunsA) || 0,
        superOverTeamAWickets: Number(soWktsA) || 0,
        superOverTeamBRuns: Number(soRunsB) || 0,
        superOverTeamBWickets: Number(soWktsB) || 0,
      },
    });
  }

  function openSubstituteModal(
    initialRole: 'STRIKER' | 'NON_STRIKER' | 'BOWLER' | 'SQUAD' = 'STRIKER'
  ) {
    const batSide = details.battingTeam;
    const bowlSide: 'A' | 'B' = batSide === 'A' ? 'B' : 'A';
    setSubRole(initialRole);
    setSubTeam(initialRole === 'BOWLER' ? bowlSide : batSide);
    setSubPlayerOut(
      initialRole === 'STRIKER'
        ? batsman1
        : initialRole === 'NON_STRIKER'
          ? batsman2
          : initialRole === 'BOWLER'
            ? bowler
            : ''
    );
    setSubPlayerIn('');
    setSubReason('');
    setSubstituteOpen(true);
  }

  function handleSelectSubRole(nextRole: 'STRIKER' | 'NON_STRIKER' | 'BOWLER' | 'SQUAD') {
    const batSide = details.battingTeam;
    const bowlSide: 'A' | 'B' = batSide === 'A' ? 'B' : 'A';
    setSubRole(nextRole);
    if (nextRole === 'STRIKER') {
      setSubTeam(batSide);
      setSubPlayerOut(batsman1);
    } else if (nextRole === 'NON_STRIKER') {
      setSubTeam(batSide);
      setSubPlayerOut(batsman2);
    } else if (nextRole === 'BOWLER') {
      setSubTeam(bowlSide);
      setSubPlayerOut(bowler);
    } else {
      setSubPlayerOut('');
    }
    setSubPlayerIn('');
  }

  async function handleConfirmSubstitute(e: React.FormEvent) {
    e.preventDefault();
    const outClean = subPlayerOut.trim();
    const inClean = subPlayerIn.trim();
    if (!inClean) {
      onError('Select or enter the incoming substitute player.');
      return;
    }
    const resolvedTeam: 'A' | 'B' =
      subRole === 'BOWLER'
        ? details.battingTeam === 'A'
          ? 'B'
          : 'A'
        : subRole === 'SQUAD'
          ? subTeam
          : details.battingTeam;
    const activePool =
      resolvedTeam === 'A'
        ? roster.teamA.length > 0
          ? roster.teamA
          : roster.all
        : roster.teamB.length > 0
          ? roster.teamB
          : roster.all;
    const inId = findPlayerIdByName(inClean, activePool);
    const outId = findPlayerIdByName(outClean, activePool);

    await onSubmitCricketEvent({
      clientEventId: makeClientEventId('sub'),
      sportType: 'Cricket',
      action: {
        type: 'SUBSTITUTE_PLAYER',
        team: resolvedTeam,
        role: subRole,
        playerOut: outClean,
        playerIn: inClean,
        ...(subReason.trim() ? { reason: subReason.trim() } : {}),
      },
      playerId: inId,
      playerName: inClean,
      assistPlayerId: outId,
      assistPlayerName: outClean || undefined,
    });
    if (subRole === 'STRIKER') setBatsman1(inClean);
    else if (subRole === 'NON_STRIKER') setBatsman2(inClean);
    else if (subRole === 'BOWLER') setBowler(inClean);
    setSubstituteOpen(false);
    setSubPlayerIn('');
    setSubReason('');
  }

  const activeTeamName = details.battingTeam === 'A' ? teamA : teamB;
  const activeRuns = details.battingTeam === 'A' ? details.teamARuns : details.teamBRuns;
  const activeWkts = details.battingTeam === 'A' ? details.teamAWickets : details.teamBWickets;
  const activeBalls = details.battingTeam === 'A' ? details.teamABalls : details.teamBBalls;

  const firstSide: 'A' | 'B' =
    details.firstInningsBattingTeam === 'A' || details.firstInningsBattingTeam === 'B'
      ? details.firstInningsBattingTeam
      : details.battingTeam;
  const firstTeamName = firstSide === 'A' ? teamA : teamB;
  const firstRuns = firstSide === 'A' ? details.teamARuns : details.teamBRuns;
  const firstWkts = firstSide === 'A' ? details.teamAWickets : details.teamBWickets;
  const firstBalls = firstSide === 'A' ? details.teamABalls : details.teamBBalls;
  const secondTeamDefaultName = firstSide === 'A' ? teamB : teamA;

  return (
    <div className="space-y-4">

      {/* Locked State Banner: INNINGS BREAK */}
      {chase.isInningsBreak && (
        <div className="rounded-xl border-2 border-orange-400 bg-orange-50 p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-600 text-white flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-orange-800">
                  1st Innings Completed &amp; Locked
                </p>
                <p className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
                  {firstTeamName}: {firstRuns}/{firstWkts} ({formatCricketOvers(firstBalls)} / {details.oversLimit} ov)
                </p>
                <p className="text-xs text-slate-700 mt-1">
                  Target for <strong>{secondTeamDefaultName}</strong>:{' '}
                  <strong className="font-mono text-orange-900 text-sm">{chase.target} runs</strong> in{' '}
                  {details.oversLimit} overs.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={terminalBusy}
              onClick={openSecondInningsModal}
              className="min-h-[46px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#EA580C] text-white text-sm font-bold hover:bg-orange-700 shadow-sm"
            >
              <Play className="w-4 h-4" />
              <span>Start 2nd Innings</span>
            </button>
          </div>
        </div>
      )}

      {/* Locked State Banner: MATCH COMPLETED */}
      {chase.isMatchCompleted && (
        <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  Match Completed · Scoring Locked
                </p>
                <p className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
                  {chase.chaseSummaryText}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  Use Undo Last in the top toolbar if the final ball was recorded by mistake.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenResultModal}
              className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
            >
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Review Official Result</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Mobile-First Scorer Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        {/* Live Match Pulse Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-900 text-white">
                {details.innings === 2 ? '2nd Innings' : '1st Innings'}
              </span>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                Max {details.oversLimit} ov · {details.playersPerSide || 11}/side
              </span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-slate-900 mt-1 font-mono tabular-nums">
              {activeTeamName}: {activeRuns}/{activeWkts}{' '}
              <span className="text-sm font-normal text-slate-500">
                ({formatCricketOvers(activeBalls)}/{details.oversLimit} ov)
              </span>
            </p>
            <p className="text-xs font-medium text-slate-700 mt-0.5">
              {chase.chaseSummaryText} · CRR <span className="font-mono font-bold">{chase.crr}</span>
              {chase.rrr !== null && (
                <>
                  {' · '}
                  RRR <span className="font-mono font-bold text-orange-700">{chase.rrr}</span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowLiveScorecard((v) => !v)}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ClipboardList className="w-4 h-4 text-slate-600" />
              <span>{showLiveScorecard ? 'Hide Scorecard' : 'Full Scorecard'}</span>
            </button>

            {details.innings === 1 && !details.innings1Completed && !details.innings1Locked && (
              <button
                type="button"
                disabled={terminalBusy}
                onClick={() => setCompleteInningsConfirmOpen(true)}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>Complete 1st Innings</span>
              </button>
            )}

            {details.innings === 1 && (details.innings1Completed || details.innings1Locked) && (
              <button
                type="button"
                disabled={terminalBusy}
                onClick={openSecondInningsModal}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Play className="w-4 h-4" />
                <span>Start 2nd Innings</span>
              </button>
            )}
          </div>
        </div>

        {/* This Over / Recent Deliveries Timeline */}
        {details.recentBalls.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1">
              Recent Balls:
            </span>
            {details.recentBalls.slice(-8).map((b, idx) => (
              <span
                key={`${b}-${idx}`}
                className={`inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-md font-mono text-xs font-bold tabular-nums ${
                  b.includes('W') && !b.startsWith('Wd')
                    ? 'bg-red-600 text-white'
                    : b === '4' || b === '6'
                      ? 'bg-emerald-600 text-white'
                      : b.startsWith('Wd') || b.startsWith('Nb')
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-white border border-slate-300 text-slate-800'
                }`}
              >
                {b}
              </span>
            ))}
          </div>
        )}

        {/* Active Scoring Pad (never blocks rapid taps during network latency; locks only on innings/match lock) */}
        <fieldset disabled={lockState.locked} className="space-y-4 disabled:opacity-55">
          {/* Runs Grid */}
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">
              Legal Delivery Runs (Auto-rotates strike &amp; overs)
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2.5">
              {[0, 1, 2, 3, 4, 5, 6].map((runs) => (
                <button
                  key={runs}
                  type="button"
                  onClick={() => dispatchDelivery({ type: 'RUNS', runs })}
                  className={`min-h-[52px] rounded-xl font-mono text-base font-bold border transition-transform active:scale-[0.97] ${
                    runs === 4 || runs === 6
                      ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                      : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                  }`}
                >
                  {runs === 0 ? '0 · Dot' : `+${runs}`}
                </button>
              ))}
            </div>
          </div>

          {/* Extras, Wicket & Over Flow */}
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">
              Extras, Wickets &amp; Strike Control
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
              <button
                type="button"
                onClick={() => setExtrasPicker(extrasPicker === 'WIDE' ? null : 'WIDE')}
                className={`min-h-[48px] px-3 rounded-xl text-sm font-semibold border ${
                  extrasPicker === 'WIDE'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                }`}
              >
                Wide
              </button>
              <button
                type="button"
                onClick={() => setExtrasPicker(extrasPicker === 'NO_BALL' ? null : 'NO_BALL')}
                className={`min-h-[48px] px-3 rounded-xl text-sm font-semibold border ${
                  extrasPicker === 'NO_BALL'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                }`}
              >
                No Ball
              </button>
              <button
                type="button"
                onClick={() => setExtrasPicker(extrasPicker === 'BYE' ? null : 'BYE')}
                className={`min-h-[48px] px-3 rounded-xl text-sm font-semibold border ${
                  extrasPicker === 'BYE'
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200'
                }`}
              >
                Bye
              </button>
              <button
                type="button"
                onClick={() => setExtrasPicker(extrasPicker === 'LEG_BYE' ? null : 'LEG_BYE')}
                className={`min-h-[48px] px-3 rounded-xl text-sm font-semibold border ${
                  extrasPicker === 'LEG_BYE'
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200'
                }`}
              >
                Leg Bye
              </button>
              <button
                type="button"
                onClick={() => setWicketOpen(true)}
                className="min-h-[48px] px-3 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700"
              >
                Wicket
              </button>
              <button
                type="button"
                onClick={() =>
                  onSubmitCricketEvent({
                    clientEventId: makeClientEventId('swap'),
                    sportType: 'Cricket',
                    action: { type: 'CHANGE_STRIKER' },
                  })
                }
                className="min-h-[48px] inline-flex items-center justify-center gap-1.5 px-3 rounded-xl text-xs font-semibold bg-white text-slate-800 border border-slate-300 hover:bg-slate-50"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Swap Striker</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setNextOverBowler('');
                  setEndOverOpen(true);
                }}
                className="min-h-[48px] px-3 rounded-xl text-xs font-semibold bg-slate-800 text-white hover:bg-slate-700"
              >
                End Over
              </button>
              <button
                type="button"
                onClick={() => openSubstituteModal('STRIKER')}
                className="min-h-[48px] inline-flex items-center justify-center gap-1.5 px-3 rounded-xl text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 col-span-2 sm:col-span-1 lg:col-span-7"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Substitute Player</span>
              </button>
            </div>
          </div>

          {/* Extras Quick Picker Sub-Bar */}
          {extrasPicker && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-amber-950">
                {extrasPicker === 'WIDE' && 'Wide Delivery Total Runs:'}
                {extrasPicker === 'NO_BALL' && 'No Ball (+1 Penalty + Bat Runs):'}
                {extrasPicker === 'BYE' && 'Byes Scored:'}
                {extrasPicker === 'LEG_BYE' && 'Leg Byes Scored:'}
              </span>
              <div className="flex flex-wrap gap-2">
                {extrasPicker === 'WIDE' &&
                  [0, 1, 2, 3, 4].map((extra) => (
                    <button
                      key={extra}
                      type="button"
                      onClick={() => {
                        setExtrasPicker(null);
                        void dispatchDelivery({ type: 'WIDE', extraRuns: extra });
                      }}
                      className="min-h-[40px] px-3.5 rounded-lg bg-white border border-amber-300 text-xs font-bold text-slate-900 hover:bg-amber-100"
                    >
                      {extra === 0 ? 'Wd (+1)' : `Wd + ${extra} (${extra + 1})`}
                    </button>
                  ))}
                {extrasPicker === 'NO_BALL' &&
                  [0, 1, 2, 3, 4, 6].map((bat) => (
                    <button
                      key={bat}
                      type="button"
                      onClick={() => {
                        setExtrasPicker(null);
                        void dispatchDelivery({ type: 'NO_BALL', extraRuns: 0, batRuns: bat });
                      }}
                      className="min-h-[40px] px-3.5 rounded-lg bg-white border border-amber-300 text-xs font-bold text-slate-900 hover:bg-amber-100"
                    >
                      {bat === 0 ? 'Nb (+1)' : `Nb + ${bat} bat`}
                    </button>
                  ))}
                {(extrasPicker === 'BYE' || extrasPicker === 'LEG_BYE') &&
                  [1, 2, 3, 4].map((runs) => (
                    <button
                      key={runs}
                      type="button"
                      onClick={() => {
                        const kind = extrasPicker;
                        setExtrasPicker(null);
                        void dispatchDelivery({ type: kind, runs });
                      }}
                      className="min-h-[40px] px-3.5 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-900 hover:bg-slate-100"
                    >
                      {extrasPicker === 'BYE' ? `B${runs}` : `Lb${runs}`} (+{runs})
                    </button>
                  ))}
              </div>
            </div>
          )}
        </fieldset>

        {/* Active Crease Batters, Bowler & Config Editor */}
        <div className="pt-3 border-t border-slate-200 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Striker (On Strike)
              </label>
              <PlayerPickerField
                compact
                value={batsman1}
                onChange={(name) => setBatsman1(name)}
                players={battingRoster}
                placeholder="Striker name (optional)"
                emptyOptionLabel="-- Select striker --"
                ariaLabel="Striker"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Non-Striker
              </label>
              <PlayerPickerField
                compact
                value={batsman2}
                onChange={(name) => setBatsman2(name)}
                players={battingRoster}
                placeholder="Non-striker (optional)"
                emptyOptionLabel="-- Select non-striker --"
                ariaLabel="Non-Striker"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Current Bowler
              </label>
              <PlayerPickerField
                compact
                value={bowler}
                onChange={(name) => setBowler(name)}
                players={bowlingRoster}
                placeholder="Bowler name (optional)"
                emptyOptionLabel="-- Select bowler --"
                ariaLabel="Current Bowler"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Overs / Side
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={oversLimit}
                  onChange={(e) => setOversLimit(e.target.value)}
                  aria-label="Overs limit"
                  title="Match Overs"
                  className="w-1/2 min-h-[40px] px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded-lg"
                />
                <input
                  type="number"
                  min={2}
                  max={15}
                  value={playersPerSide}
                  onChange={(e) => setPlayersPerSide(e.target.value)}
                  aria-label="Players per side"
                  title="Players per side"
                  className="w-1/2 min-h-[40px] px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Target / Codes
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  aria-label="Target runs"
                  className="w-1/2 min-h-[40px] px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  maxLength={6}
                  value={shortA}
                  onChange={(e) => setShortA(e.target.value.toUpperCase())}
                  placeholder="TMA"
                  aria-label="Team A Short Code"
                  className="w-1/4 min-h-[40px] px-1.5 py-1.5 text-xs font-mono uppercase border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  maxLength={6}
                  value={shortB}
                  onChange={(e) => setShortB(e.target.value.toUpperCase())}
                  placeholder="TMB"
                  aria-label="Team B Short Code"
                  className="w-1/4 min-h-[40px] px-1.5 py-1.5 text-xs font-mono uppercase border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                disabled={saving}
                onClick={handleUpdateMeta}
                className="w-full min-h-[40px] px-3 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                Update Crease / Config
              </button>
            </div>
          </div>

          {/* Quick Overs Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-500 mr-1">Overs Presets:</span>
            {CRICKET_OVER_PRESETS.map((ov) => (
              <button
                key={ov}
                type="button"
                onClick={() => setOversLimit(String(ov))}
                className={`px-2 py-1 rounded text-[11px] font-mono font-semibold border ${
                  Number(oversLimit) === ov
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {ov}
              </button>
            ))}
          </div>

          {/* Toss Tracking & Super Over */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="grid grid-cols-2 gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Toss Winner</label>
                <select
                  value={tossWinner}
                  onChange={(e) => setTossWinner(e.target.value as 'A' | 'B' | '')}
                  className="w-full min-h-[38px] px-2.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">-- Not Recorded --</option>
                  <option value="A">{teamA}</option>
                  <option value="B">{teamB}</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Toss Decision</label>
                <select
                  value={tossDecision}
                  onChange={(e) => setTossDecision(e.target.value as 'BAT' | 'BOWL' | '')}
                  className="w-full min-h-[38px] px-2.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">-- Decision --</option>
                  <option value="BAT">Bat</option>
                  <option value="BOWL">Bowl / Field</option>
                </select>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSuperOver}
                  onChange={(e) => setIsSuperOver(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                />
                <span>Super Over Tie-Breaker</span>
              </label>
              {isSuperOver && (
                <div className="grid grid-cols-4 gap-2">
                  <input
                    type="number"
                    min={0}
                    value={soRunsA}
                    onChange={(e) => setSoRunsA(e.target.value)}
                    placeholder="A Runs"
                    aria-label="Team A Super Over Runs"
                    className="min-h-[34px] px-2 text-xs font-mono border border-slate-300 rounded bg-white"
                  />
                  <input
                    type="number"
                    min={0}
                    max={2}
                    value={soWktsA}
                    onChange={(e) => setSoWktsA(e.target.value)}
                    placeholder="A Wkts"
                    aria-label="Team A Super Over Wickets"
                    className="min-h-[34px] px-2 text-xs font-mono border border-slate-300 rounded bg-white"
                  />
                  <input
                    type="number"
                    min={0}
                    value={soRunsB}
                    onChange={(e) => setSoRunsB(e.target.value)}
                    placeholder="B Runs"
                    aria-label="Team B Super Over Runs"
                    className="min-h-[34px] px-2 text-xs font-mono border border-slate-300 rounded bg-white"
                  />
                  <input
                    type="number"
                    min={0}
                    max={2}
                    value={soWktsB}
                    onChange={(e) => setSoWktsB(e.target.value)}
                    placeholder="B Wkts"
                    aria-label="Team B Super Over Wickets"
                    className="min-h-[34px] px-2 text-xs font-mono border border-slate-300 rounded bg-white"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Live Inline Scorecard Drawer */}
      {showLiveScorecard && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <CricketScorecardPanel stream={stream} score={score} />
        </div>
      )}

      {/* Wicket / Dismissal Modal */}
      <Modal
        open={wicketOpen}
        onClose={() => setWicketOpen(false)}
        title="Record Cricket Wicket"
        subtitle="Specify dismissal details, fielder (optional), and incoming batter."
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSubmitWicket} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Dismissal Type
              </label>
              <select
                value={wicketType}
                onChange={(e) => setWicketType(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {DISMISSAL_TYPES.map((dt) => (
                  <option key={dt} value={dt}>
                    {dt.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Dismissed Batter
              </label>
              <select
                value={dismissedRole}
                onChange={(e) => setDismissedRole(e.target.value as 'STRIKER' | 'NON_STRIKER')}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="STRIKER">Striker: {batsman1 || 'Batter 1'}</option>
                <option value="NON_STRIKER">Non-Striker: {batsman2 || 'Batter 2'}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Fielder / Keeper (Optional)
              </label>
              <PlayerPickerField
                value={wicketFielder}
                onChange={(name) => setWicketFielder(name)}
                players={bowlingRoster}
                placeholder="Catcher / Run-out fielder"
                emptyOptionLabel="-- Select fielder (Optional) --"
                ariaLabel="Fielder or Keeper"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Runs Completed on Ball
              </label>
              <input
                type="number"
                min={0}
                max={4}
                value={wicketRuns}
                onChange={(e) => setWicketRuns(Math.max(0, Math.min(4, Number(e.target.value) || 0)))}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Next Batsman / Incoming Batter (Optional)
            </label>
            <PlayerPickerField
              value={wicketNewBatter}
              onChange={(name) => setWicketNewBatter(name)}
              players={battingRoster}
              placeholder="Select or enter next batsman"
              emptyOptionLabel="-- Select next batsman (Optional) --"
              ariaLabel="Incoming New Batter"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setWicketOpen(false)}
              className="min-h-[40px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[40px] px-5 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              Confirm Wicket
            </button>
          </div>
        </form>
      </Modal>

      {/* End Over & Next Bowler Modal */}
      <Modal
        open={endOverOpen}
        onClose={() => setEndOverOpen(false)}
        title="End Current Over"
        subtitle="Marks over complete, rotates strike, and assigns next bowler."
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleConfirmEndOver} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Next Over Bowler (Optional)
            </label>
            <PlayerPickerField
              value={nextOverBowler}
              onChange={(name) => setNextOverBowler(name)}
              players={bowlingRoster}
              placeholder="Select or type bowler name"
              emptyOptionLabel="-- Select next bowler (Optional) --"
              ariaLabel="Next Over Bowler"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEndOverOpen(false)}
              className="min-h-[40px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[40px] px-5 py-2 text-sm font-bold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
            >
              Complete Over
            </button>
          </div>
        </form>
      </Modal>

      {/* Complete 1st Innings Confirmation Dialog */}
      <ConfirmDialog
        open={completeInningsConfirmOpen}
        onClose={() => setCompleteInningsConfirmOpen(false)}
        onConfirm={handleConfirmCompleteInnings}
        loading={completingInnings}
        variant="primary"
        title="Complete & Lock 1st Innings?"
        message={`${activeTeamName} is currently ${activeRuns}/${activeWkts} (${formatCricketOvers(activeBalls)} ov). Completing the 1st innings will lock 1st innings scoring, set Target ${activeRuns + 1}, and move the match to INNINGS BREAK.`}
        confirmLabel="Yes, Complete 1st Innings"
      />

      {/* 2nd Innings Setup Modal */}
      <Modal
        open={secondInningsOpen}
        onClose={() => setSecondInningsOpen(false)}
        title="Start 2nd Innings"
        subtitle="Confirm chasing team, target, opening batters, and opening bowler before resuming."
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleStartSecondInnings} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Chasing / Batting Team
            </label>
            <select
              value={secondBattingTeam}
              onChange={(e) => setSecondBattingTeam(e.target.value as 'A' | 'B')}
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="A">{teamA}</option>
              <option value="B">{teamB}</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Runs (Optional)
              </label>
              <input
                type="number"
                min={1}
                value={secondTarget}
                onChange={(e) => setSecondTarget(e.target.value)}
                placeholder={String(firstRuns + 1)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Match Overs (Optional)
              </label>
              <input
                type="number"
                min={1}
                max={90}
                value={secondOvers}
                onChange={(e) => setSecondOvers(e.target.value)}
                placeholder={String(details.oversLimit || 20)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={startingSecondInnings}
              className="min-h-[42px] inline-flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              <span>{startingSecondInnings ? 'Starting...' : 'Confirm & Start 2nd Innings'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Substitute Player Modal */}
      <Modal
        open={substituteOpen}
        onClose={() => setSubstituteOpen(false)}
        title="Substitute Player"
        subtitle="Swap an active or squad player from the team list. Updates Active Players & Match Timeline live."
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleConfirmSubstitute} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Substitution Role / Position
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { id: 'STRIKER', label: 'Striker' },
                  { id: 'NON_STRIKER', label: 'Non-Striker' },
                  { id: 'BOWLER', label: 'Bowler' },
                  { id: 'SQUAD', label: 'Team Squad' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectSubRole(opt.id)}
                  className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    subRole === opt.id
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {subRole === 'SQUAD' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Team
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['A', 'B'] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => {
                      setSubTeam(side);
                      setSubPlayerOut('');
                      setSubPlayerIn('');
                    }}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold border truncate ${
                      subTeam === side
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    {side === 'A' ? teamA : teamB}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(() => {
            const targetSide: 'A' | 'B' =
              subRole === 'BOWLER'
                ? details.battingTeam === 'A'
                  ? 'B'
                  : 'A'
                : subRole === 'SQUAD'
                  ? subTeam
                  : details.battingTeam;
            const sidePool =
              targetSide === 'A'
                ? roster.teamA.length > 0
                  ? roster.teamA
                  : roster.all
                : roster.teamB.length > 0
                  ? roster.teamB
                  : roster.all;
            const outNorm = subPlayerOut.trim().toLowerCase();
            const incomingPool = outNorm
              ? sidePool.filter((p) => p.name.trim().toLowerCase() !== outNorm)
              : sidePool;
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Player Out (Swapped Out)
                  </label>
                  <PlayerPickerField
                    value={subPlayerOut}
                    onChange={(name) => setSubPlayerOut(name)}
                    players={sidePool}
                    placeholder="Player leaving field"
                    emptyOptionLabel="-- Select outgoing player --"
                    ariaLabel="Player Out"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Substitute In (Team Roster)
                  </label>
                  <PlayerPickerField
                    value={subPlayerIn}
                    onChange={(name) => setSubPlayerIn(name)}
                    players={incomingPool.length > 0 ? incomingPool : sidePool}
                    placeholder="Select or enter substitute"
                    emptyOptionLabel="-- Select substitute player --"
                    ariaLabel="Substitute Player In"
                  />
                </div>
              </div>
            );
          })()}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reason (Optional)
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {['Injury', 'Tactical', 'Concussion Sub', 'Fielding Sub'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setSubReason(subReason === preset ? '' : preset)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold border ${
                    subReason === preset
                      ? 'bg-violet-100 border-violet-400 text-violet-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              type="text"
              maxLength={100}
              value={subReason}
              onChange={(e) => setSubReason(e.target.value)}
              placeholder="Optional substitution note (e.g. Retired hurt / Concussion)"
              className="w-full min-h-[38px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setSubstituteOpen(false)}
              className="min-h-[40px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={terminalBusy || !subPlayerIn.trim()}
              className="min-h-[40px] inline-flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>Confirm Substitution</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
