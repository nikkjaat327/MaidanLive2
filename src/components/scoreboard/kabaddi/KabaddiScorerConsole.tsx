import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Award,
  Flame,
  Layers,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Shield,
  ShieldAlert,
  Timer,
  Undo2,
  Zap,
} from 'lucide-react';
import type {
  LiveScoreData,
  LiveStreamData,
  PlayerData,
  PlayerMatchStatRecord,
  ScoreHistoryItem,
} from '../../../types/index.ts';
import { extractApiError } from '../../../services/api/httpClient.ts';
import { scoreboardService } from '../../../services/scoreboard/scoreboardService.ts';
import { resolveTeamId } from '../../../utils/dedupe.ts';
import {
  computeEffectiveKabaddiClock,
  normalizeKabaddiDetails,
  type KabaddiClockCommand,
  type KabaddiHalfLabel,
  type KabaddiRulesConfig,
  type KabaddiScorerSettings,
  type KabaddiSide,
  type KabaddiViewerDisplaySettings,
} from '../../../utils/kabaddiScoring.ts';
import { TeamAvatar } from '../../common/TeamAvatar.tsx';
import { EventCorrectionModal } from '../EventCorrectionModal.tsx';
import { KabaddiAnimations } from './KabaddiAnimations.tsx';
import { KabaddiCourtDots } from './KabaddiCourtDots.tsx';
import {
  ExtraPointsModal,
  KabaddiCompleteMatchModal,
  KabaddiPlayerOpsModal,
  KabaddiRulesModal,
  KabaddiTimeoutModal,
  KabaddiUtilityModals,
  MultiPointRaidModal,
} from './KabaddiModals.tsx';
import { KabaddiSidebarPanels, type KabaddiSidebarTab } from './KabaddiSidebarPanels.tsx';
import { KabaddiWinnerScreen } from './KabaddiWinnerScreen.tsx';
import {
  applyOptimisticKabaddiEngineEvent,
  makeClientEventId,
} from '../../../utils/optimisticScore.ts';
import { completeScoreTraceApi, startScoreTrace } from '../../../utils/realtimeDiagnostics.ts';
import {
  enqueueScoreMutation,
  getPendingScoreCount,
  subscribePendingScoreCount,
} from '../../../utils/scoreMutationQueue.ts';

interface KabaddiScorerConsoleProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  history: ScoreHistoryItem[];
  players: PlayerData[];
  playerStats: PlayerMatchStatRecord[];
  onScoreChange: (score: LiveScoreData) => void;
  onRefreshHistory: () => void;
  onAddHistoryItem?: (item?: ScoreHistoryItem) => void;
  onApplyUndoHistory?: (payload: {
    revertedHistoryId?: string;
    deletedHistoryId?: string | null;
    undoHistoryItem?: ScoreHistoryItem | null;
  }) => boolean;
  onRefreshStats?: () => void;
  onError: (msg: string | null) => void;
  onSuccess: (msg: string | null) => void;
}

export function KabaddiScorerConsole({
  stream,
  score,
  history,
  players,
  playerStats,
  onScoreChange,
  onRefreshHistory,
  onAddHistoryItem,
  onApplyUndoHistory,
  onRefreshStats,
  onError,
  onSuccess,
}: KabaddiScorerConsoleProps) {
  const [saving, setSaving] = useState(false);
  const [pendingOps, setPendingOps] = useState(0);
  const scoreRef = useRef<LiveScoreData | null>(score);
  const confirmedScoreRef = useRef<LiveScoreData | null>(score);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<KabaddiSidebarTab>('controls');
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Optional active player attribution selectors for quick/detailed scoring
  const [selectedRaiderA, setSelectedRaiderA] = useState('');
  const [selectedRaiderB, setSelectedRaiderB] = useState('');
  const [selectedDefA, setSelectedDefA] = useState('');
  const [selectedDefB, setSelectedDefB] = useState('');
  const [scoringMode, setScoringMode] = useState<'quick' | 'detailed'>('quick');

  // Modals
  const [multiModalTeam, setMultiModalTeam] = useState<KabaddiSide | null>(null);
  const [extraModalTeam, setExtraModalTeam] = useState<KabaddiSide | null>(null);
  const [timeoutOpen, setTimeoutOpen] = useState(false);
  const [playerOpsMode, setPlayerOpsMode] = useState<'SUBSTITUTION' | 'CARD' | 'INJURY' | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [timeCorrOpen, setTimeCorrOpen] = useState(false);
  const [scoreCorrOpen, setScoreCorrOpen] = useState(false);
  const [forfeitOpen, setForfeitOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [winnerOpen, setWinnerOpen] = useState(false);
  const [correctionItem, setCorrectionItem] = useState<ScoreHistoryItem | null>(null);

  const details = useMemo(
    () => normalizeKabaddiDetails(score?.sportSpecificDetails),
    [score?.sportSpecificDetails]
  );

  useEffect(() => {
    setScoringMode(details.scorerSettings.defaultScoringMode || 'quick');
  }, [details.scorerSettings.defaultScoringMode]);

  useEffect(() => {
    return subscribePendingScoreCount(stream.id, setPendingOps);
  }, [stream.id]);

  useEffect(() => {
    if (getPendingScoreCount(stream.id) === 0) {
      scoreRef.current = score;
      confirmedScoreRef.current = score;
    }
  }, [score, stream.id]);

  const isCompleted = Boolean(details.matchCompleted);
  const isSuspended = details.clock.status === 'SUSPENDED';

  const isClockTicking = Boolean(
    !isCompleted &&
      (details.clock.status === 'RUNNING' ||
        details.clock.status === 'EXTRA_TIME' ||
        details.clock.status === 'BREAK' ||
        details.clock.raidRunning ||
        details.clock.timeoutActive ||
        details.doOrDie.active ||
        (details.lastAllOut?.triggeredAtIso &&
          Date.now() - Date.parse(details.lastAllOut.triggeredAtIso) <=
            (details.rules.allOutBannerDurationSec || 5) * 1000))
  );

  // Smooth timer tick strictly when clock, raid timer, timeout, or stinger banner is active
  useEffect(() => {
    if (!isClockTicking) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [isClockTicking]);

  // Auto-open Winner Screen when match transitions to completed
  const [prevCompleted, setPrevCompleted] = useState(Boolean(details.matchCompleted));
  useEffect(() => {
    if (!prevCompleted && details.matchCompleted) {
      setWinnerOpen(true);
    }
    setPrevCompleted(Boolean(details.matchCompleted));
  }, [details.matchCompleted, prevCompleted]);

  const clock = useMemo(
    () => computeEffectiveKabaddiClock(details, nowMs),
    [details, nowMs]
  );

  const teamAName = stream.teamAName || 'Team A';
  const teamBName = stream.teamBName || 'Team B';
  const scoreA = score?.teamAScore ?? 0;
  const scoreB = score?.teamBScore ?? 0;
  // Never lock rapid scoring taps while previous network calls finish; FIFO queue serializes requests
  const actionDisabled = isCompleted || isSuspended;
  const terminalBusy = saving || pendingOps > 0;

  const undoableCount = history.filter(
    (h) => (!h.entryType || h.entryType === 'SCORE_UPDATE') && !h.reverted
  ).length;

  async function dispatchEvent(action: Record<string, unknown>, successFallback?: string) {
    const baseScore = scoreRef.current || score;
    const traceId = makeClientEventId('kbd');
    const apiStartAtMs = Date.now();
    const actionType = String(action?.type || 'Kabaddi Event');
    startScoreTrace(traceId, `Kabaddi: ${actionType}`, apiStartAtMs);
    if (baseScore && actionType !== 'SYNC_ROSTER') {
      const optimistic = applyOptimisticKabaddiEngineEvent(baseScore, action as any);
      if (optimistic) {
        scoreRef.current = optimistic;
        onScoreChange(optimistic);
      }
    }
    onError(null);

    return enqueueScoreMutation(stream.id, async () => {
      try {
        const res = await scoreboardService.recordKabaddiEvent(stream.id, {
          clientEventId: traceId,
          traceId,
          action,
        });
        completeScoreTraceApi(traceId, { status: 'synced', apiStartAtMs, diag: res.diag });
        confirmedScoreRef.current = res.score;
        if (getPendingScoreCount(stream.id) <= 1) {
          scoreRef.current = res.score;
          onScoreChange(res.score);
        }
        if (res.historyItem && onAddHistoryItem) {
          onAddHistoryItem(res.historyItem);
        } else {
          onRefreshHistory();
        }
        onRefreshStats?.();
        if (!res.duplicatePrevented) {
          onSuccess(res.historyItem?.action || successFallback || 'Kabaddi score updated.');
        }
        return res;
      } catch (err) {
        if (getPendingScoreCount(stream.id) <= 1) {
          const rollback = confirmedScoreRef.current || baseScore;
          if (rollback) {
            scoreRef.current = rollback;
            onScoreChange(rollback);
          }
        }
        const msg = extractApiError(err, 'Unable to apply Kabaddi scoring event.');
        completeScoreTraceApi(traceId, { status: 'error', apiStartAtMs, errorText: msg });
        onError(msg);
        return null;
      }
    });
  }

  async function dispatchClock(command: KabaddiClockCommand) {
    try {
      setSaving(true);
      onError(null);
      const res = await scoreboardService.controlKabaddiClock(stream.id, command);
      confirmedScoreRef.current = res.score;
      scoreRef.current = res.score;
      onScoreChange(res.score);
      if (res.historyItem && onAddHistoryItem) {
        onAddHistoryItem(res.historyItem);
      } else {
        onRefreshHistory();
      }
      onSuccess(res.historyItem?.action || 'Match clock updated.');
    } catch (err) {
      onError(extractApiError(err, 'Failed to update match clock.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleUndoLast() {
    const traceId = makeClientEventId('undo');
    const apiStartAtMs = Date.now();
    startScoreTrace(traceId, 'Kabaddi: Undo', apiStartAtMs);
    try {
      setSaving(true);
      onError(null);
      const res = await scoreboardService.undoScore(stream.id, {
        clientEventId: traceId,
        traceId,
      });
      completeScoreTraceApi(traceId, { status: 'synced', apiStartAtMs, diag: res.diag });
      confirmedScoreRef.current = res.score;
      scoreRef.current = res.score;
      onScoreChange(res.score);
      if (!onApplyUndoHistory?.(res)) {
        onRefreshHistory();
      }
      onRefreshStats?.();
      onSuccess(`Undid: ${res.undoneAction}`);
    } catch (err) {
      const msg = extractApiError(err, 'Unable to undo last update.');
      completeScoreTraceApi(traceId, { status: 'error', apiStartAtMs, errorText: msg });
      onError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncRosterFromDb() {
    const teamAPlayers = players
      .filter((p) => resolveTeamId(p.teamId) === stream.teamAId)
      .map((p) => ({
        playerId: p.id || p._id || '',
        name: p.name,
        jerseyNumber: p.jerseyNumber,
        role: p.role,
      }))
      .filter((p) => p.playerId);

    const teamBPlayers = players
      .filter((p) => resolveTeamId(p.teamId) === stream.teamBId)
      .map((p) => ({
        playerId: p.id || p._id || '',
        name: p.name,
        jerseyNumber: p.jerseyNumber,
        role: p.role,
      }))
      .filter((p) => p.playerId);

    if (teamAPlayers.length === 0 && teamBPlayers.length === 0) {
      onError('No database roster players linked to Team A or Team B yet.');
      return;
    }
    await dispatchEvent(
      {
        type: 'SYNC_ROSTER',
        teamAPlayers,
        teamBPlayers,
      },
      'Team rosters synced to Kabaddi court sheet.'
    );
  }

  async function handleSaveSettings(payload: {
    rules?: KabaddiRulesConfig;
    scorerSettings?: KabaddiScorerSettings;
    viewerDisplaySettings?: KabaddiViewerDisplaySettings;
    resetRulesDefaults?: boolean;
    resetScorerDefaults?: boolean;
    resetViewerDefaults?: boolean;
  }) {
    try {
      setSaving(true);
      onError(null);
      const res = await scoreboardService.saveKabaddiSettings(stream.id, payload as any);
      onScoreChange(res.score);
      onSuccess('Kabaddi configuration saved.');
    } catch (err) {
      onError(extractApiError(err, 'Failed to save Kabaddi configuration.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleCompleteMatch(opts?: {
    forfeitTeam?: KabaddiSide | '';
    forfeitReason?: string;
    goldenRaidWinner?: KabaddiSide | '';
    allowDraw?: boolean;
  }) {
    try {
      setSaving(true);
      onError(null);
      const res = await scoreboardService.completeKabaddiMatch(stream.id, opts);
      onScoreChange(res.score);
      onRefreshHistory();
      onRefreshStats?.();
      setCompleteOpen(false);
      setForfeitOpen(false);
      setWinnerOpen(true);
      onSuccess('Match completed and official winner calculated!');
    } catch (err) {
      onError(extractApiError(err, 'Unable to complete match.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleReopenMatch() {
    try {
      setSaving(true);
      onError(null);
      const res = await scoreboardService.reopenKabaddiMatch(stream.id, 'Reopened by Scorer/Admin');
      onScoreChange(res.score);
      onRefreshHistory();
      setWinnerOpen(false);
      onSuccess('Match reopened for live scoring.');
    } catch (err) {
      onError(extractApiError(err, 'Unable to reopen match.'));
    } finally {
      setSaving(false);
    }
  }

  const btns = details.scorerSettings.buttons;

  const renderTeamScoringCard = (side: KabaddiSide) => {
    const isTeamA = side === 'A';
    const name = isTeamA ? teamAName : teamBName;
    const logo = isTeamA ? stream.teamALogo : stream.teamBLogo;
    const teamScore = isTeamA ? scoreA : scoreB;
    const breakdown = isTeamA ? details.teamA : details.teamB;
    const activeRaider = details.activeRaidingTeam === side;
    const emptyStreak = isTeamA ? details.consecutiveEmptyRaidsA : details.consecutiveEmptyRaidsB;
    const courtList = isTeamA ? details.courtPlayersA : details.courtPlayersB;
    const oppCourtList = isTeamA ? details.courtPlayersB : details.courtPlayersA;
    const activeOnCourt = courtList.filter((p) => p.status === 'ON_COURT');
    const oppActiveOnCourt = oppCourtList.filter((p) => p.status === 'ON_COURT');

    const raiderId = isTeamA ? selectedRaiderA : selectedRaiderB;
    const defId = isTeamA ? selectedDefA : selectedDefB;
    const setRaiderId = isTeamA ? setSelectedRaiderA : setSelectedRaiderB;
    const setDefId = isTeamA ? setSelectedDefA : setSelectedDefB;

    const chosenRaider = activeOnCourt.find((p) => p.playerId === raiderId);
    const chosenDefender = oppActiveOnCourt.find((p) => p.playerId === defId);

    const superTackleEligible = activeOnCourt.length <= (details.rules.superTackleMaxDefenders || 3);
    const dodActiveForSide = details.doOrDie.active && details.doOrDie.team === side && clock.doOrDieVisible;
    const pendingDodForSide = isTeamA ? details.pendingDoOrDieA : details.pendingDoOrDieB;

    return (
      <div
        className={`rounded-2xl border p-4 space-y-3.5 transition-colors ${
          activeRaider
            ? 'bg-slate-900 border-[#EA580C]/70'
            : 'bg-slate-900/75 border-slate-800'
        }`}
      >
        {/* Card Header: Logo + Name + Active Raider Trigger + Big Tabular Score */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <TeamAvatar name={name} logoUrl={logo} size="md" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-base sm:text-lg font-extrabold text-white truncate">
                  {name}
                </h3>
                <button
                  type="button"
                  disabled={actionDisabled || activeRaider}
                  onClick={() => dispatchEvent({ type: 'SET_RAIDING_TEAM', team: side })}
                  className={`min-h-[26px] px-2 rounded text-[10px] font-bold uppercase tracking-wider border ${
                    activeRaider
                      ? 'bg-[#EA580C] text-white border-[#EA580C]'
                      : 'bg-slate-950 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  {activeRaider ? 'RAIDING NOW' : 'Set Raider'}
                </button>
                {pendingDodForSide && !dodActiveForSide && (
                  <span className="min-h-[24px] inline-flex items-center px-2 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 text-[10px] font-extrabold uppercase tracking-wider">
                    Next Raid: Do-or-Die
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono text-slate-400 mt-0.5 tabular-nums">
                Raid {breakdown.raidPoints} · Tackle {breakdown.tacklePoints} · Bonus{' '}
                {breakdown.bonusPoints} · AO {breakdown.allOutPoints} · ST {breakdown.superTackles}
              </p>
            </div>
          </div>
          <div className="text-right font-mono tabular-nums shrink-0">
            <p className="text-3xl sm:text-4xl font-black text-white leading-none">{teamScore}</p>
            <p className="text-[11px] text-amber-300 font-semibold mt-1">
              Empty Streak: {emptyStreak}/{details.rules.doOrDieConsecutiveEmptyThreshold}
            </p>
          </div>
        </div>

        {/* Players On Court Dots */}
        <div className="pt-2 border-t border-slate-800/80">
          <KabaddiCourtDots
            players={courtList}
            maxPlayers={details.rules.playersPerSide}
            teamName={name}
            side={side}
            showNumbers={details.viewerDisplaySettings.showJerseyNumbers}
          />
        </div>

        {/* Optional Player Selectors in Detailed Mode */}
        {scoringMode === 'detailed' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <select
              value={raiderId}
              onChange={(e) => setRaiderId(e.target.value)}
              aria-label={`${name} raider player`}
              className="min-h-[38px] px-2.5 text-xs rounded-lg bg-slate-950 border border-slate-700 text-slate-100"
            >
              <option value="">Raider / Scorer (Optional)</option>
              {activeOnCourt.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.jerseyNumber ? `#${p.jerseyNumber} ` : ''}{p.name}
                </option>
              ))}
            </select>
            <select
              value={defId}
              onChange={(e) => setDefId(e.target.value)}
              aria-label={`Opponent defender put out`}
              className="min-h-[38px] px-2.5 text-xs rounded-lg bg-slate-950 border border-slate-700 text-slate-100"
            >
              <option value="">Opp Player Put Out (Optional)</option>
              {oppActiveOnCourt.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.jerseyNumber ? `#${p.jerseyNumber} ` : ''}{p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 8 Identical Configurable Scoring Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {btns.touchPoint && (
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() =>
                dispatchEvent(
                  {
                    type: 'TOUCH_POINT',
                    team: side,
                    raiderId: chosenRaider?.playerId,
                    raiderName: chosenRaider?.name,
                    defenderId: chosenDefender?.playerId,
                    defenderName: chosenDefender?.name,
                    clockText: clock.formattedClock,
                  },
                  `${name} Touch Point (+${details.rules.touchPointValue})`
                )
              }
              className="min-h-[48px] px-3 py-2 rounded-xl bg-[#EA580C] hover:bg-orange-600 text-white text-xs font-extrabold uppercase tracking-wide flex items-center justify-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
            >
              <Zap className="w-4 h-4 shrink-0" />
              <span>TOUCH POINT (+{details.rules.touchPointValue})</span>
            </button>
          )}

          {btns.unsuccessfulRaid && (
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() =>
                dispatchEvent(
                  {
                    type: 'TACKLE_POINT',
                    team: side,
                    defenderId: chosenRaider?.playerId,
                    defenderName: chosenRaider?.name,
                    raiderId: chosenDefender?.playerId,
                    raiderName: chosenDefender?.name,
                    clockText: clock.formattedClock,
                  },
                  `${name} Tackle Point (+${details.rules.unsuccessfulRaidDefenderPoints})`
                )
              }
              className="min-h-[48px] px-3 py-2 rounded-xl bg-red-700 hover:bg-red-600 border border-red-500/60 text-white text-xs font-extrabold uppercase tracking-wide disabled:opacity-40 whitespace-nowrap"
            >
              TACKLE POINT (+{details.rules.unsuccessfulRaidDefenderPoints})
            </button>
          )}

          {btns.emptyRaid && (
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() =>
                dispatchEvent(
                  {
                    type: 'EMPTY_RAID',
                    team: side,
                    raiderId: chosenRaider?.playerId,
                    raiderName: chosenRaider?.name,
                    clockText: clock.formattedClock,
                  },
                  `${name} Empty Raid`
                )
              }
              className="min-h-[48px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-bold uppercase tracking-wide disabled:opacity-40 whitespace-nowrap"
            >
              EMPTY RAID
            </button>
          )}

          {btns.bonusPoint && (
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() =>
                dispatchEvent(
                  {
                    type: 'BONUS_POINT',
                    team: side,
                    raiderId: chosenRaider?.playerId,
                    raiderName: chosenRaider?.name,
                    clockText: clock.formattedClock,
                  },
                  `${name} Bonus Point (+${details.rules.bonusPointValue})`
                )
              }
              className="min-h-[48px] px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-extrabold uppercase tracking-wide disabled:opacity-40 whitespace-nowrap"
            >
              BONUS POINT (+{details.rules.bonusPointValue})
            </button>
          )}

          {btns.multiPointsRaid && (
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => setMultiModalTeam(side)}
              className="min-h-[48px] px-3 py-2 rounded-xl bg-sky-700 hover:bg-sky-600 text-white text-xs font-extrabold uppercase tracking-wide inline-flex items-center justify-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
            >
              <Layers className="w-4 h-4 shrink-0" />
              <span>MULTI POINTS RAID</span>
            </button>
          )}

          {btns.superTackle && (
            <button
              type="button"
              disabled={actionDisabled || !superTackleEligible}
              title={
                superTackleEligible
                  ? `Execute Super Tackle (+${details.rules.superTacklePoints})`
                  : `Requires <= ${details.rules.superTackleMaxDefenders} defenders on court (${activeOnCourt.length} active)`
              }
              onClick={() =>
                dispatchEvent(
                  {
                    type: 'SUPER_TACKLE',
                    team: side,
                    defenderId: chosenRaider?.playerId,
                    defenderName: chosenRaider?.name,
                    raiderId: chosenDefender?.playerId,
                    raiderName: chosenDefender?.name,
                    clockText: clock.formattedClock,
                  },
                  `${name} Super Tackle (+${details.rules.superTacklePoints})`
                )
              }
              className="min-h-[48px] px-3 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-extrabold uppercase tracking-wide inline-flex items-center justify-center gap-1.5 disabled:opacity-35 whitespace-nowrap"
            >
              <Shield className="w-4 h-4 shrink-0" />
              <span>
                SUPER TACKLE (+{details.rules.superTacklePoints})
              </span>
            </button>
          )}

          {btns.doOrDieRaid && (
            <button
              type="button"
              disabled={actionDisabled || dodActiveForSide}
              onClick={() =>
                dispatchEvent(
                  {
                    type: 'DO_OR_DIE_TRIGGER',
                    team: side,
                    triggerType: 'MANUAL',
                  },
                  `Team ${side} DO-OR-DIE RAID Triggered`
                )
              }
              className="min-h-[48px] px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wide inline-flex items-center justify-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
            >
              <Flame className="w-4 h-4 shrink-0" />
              <span>{dodActiveForSide ? 'DOD ACTIVE' : 'DO OR DIE RAID'}</span>
            </button>
          )}

          {btns.extraPoints && (
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => setExtraModalTeam(side)}
              className="min-h-[48px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-xs font-bold uppercase tracking-wide inline-flex items-center justify-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>EXTRA POINTS</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  const orderedSides: KabaddiSide[] = details.clock.sideSwapped ? ['B', 'A'] : ['A', 'B'];

  return (
    <section
      aria-label="MaidanLive Kabaddi Scorer Console"
      className="bg-slate-950 text-slate-100 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl"
    >
      {/* TOP MATCH CONTROL & CLOCK BAR */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 font-mono tabular-nums">
            <span className="text-2xl sm:text-3xl font-black text-white">{clock.formattedClock}</span>
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                {details.clock.halfLabel || details.half}
              </span>
              <span className="text-[11px] text-slate-400">{details.clock.status.replace('_', ' ')}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {details.clock.status === 'NOT_STARTED' ? (
              <button
                type="button"
                disabled={terminalBusy || isCompleted}
                onClick={() => dispatchClock({ type: 'START_MATCH' })}
                className="min-h-[40px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Start Match</span>
              </button>
            ) : details.clock.status === 'RUNNING' || details.clock.status === 'EXTRA_TIME' ? (
              <button
                type="button"
                disabled={terminalBusy || isCompleted}
                onClick={() => dispatchClock({ type: 'PAUSE' })}
                className="min-h-[40px] px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={terminalBusy || isCompleted}
                onClick={() => dispatchClock({ type: 'RESUME' })}
                className="min-h-[40px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Resume</span>
              </button>
            )}

            {details.rules.raidTimerEnabled && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 font-mono tabular-nums text-xs">
                <span className="text-slate-400">Raid</span>
                <span
                  className={`font-black ${
                    clock.raidRemainingSec <= 5 ? 'text-red-400' : 'text-orange-400'
                  }`}
                >
                  {String(clock.raidRemainingSec).padStart(2, '0')}s
                </span>
                <button
                  type="button"
                  disabled={actionDisabled}
                  onClick={() =>
                    dispatchClock({
                      type: details.clock.raidRunning ? 'PAUSE_RAID_TIMER' : 'START_RAID_TIMER',
                    })
                  }
                  aria-label={details.clock.raidRunning ? 'Pause raid timer' : 'Start raid timer'}
                  className="p-1 rounded hover:bg-slate-800 text-slate-200"
                >
                  {details.clock.raidRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </button>
                <button
                  type="button"
                  disabled={actionDisabled}
                  onClick={() => dispatchClock({ type: 'RESET_RAID_TIMER' })}
                  aria-label="Reset raid timer"
                  className="p-1 rounded hover:bg-slate-800 text-slate-200"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mode toggle + Quick actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-0.5 rounded-lg bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => setScoringMode('quick')}
              className={`min-h-[34px] px-2.5 rounded-md text-[11px] font-bold whitespace-nowrap ${
                scoringMode === 'quick' ? 'bg-slate-800 text-white' : 'text-slate-400'
              }`}
            >
              Quick
            </button>
            <button
              type="button"
              onClick={() => setScoringMode('detailed')}
              className={`min-h-[34px] px-2.5 rounded-md text-[11px] font-bold whitespace-nowrap ${
                scoringMode === 'detailed' ? 'bg-slate-800 text-white' : 'text-slate-400'
              }`}
            >
              Player Pick
            </button>
          </div>

          <button
            type="button"
            disabled={actionDisabled}
            onClick={() =>
              dispatchEvent({
                type: 'SET_RAIDING_TEAM',
                team: details.activeRaidingTeam === 'A' ? 'B' : 'A',
              })
            }
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold whitespace-nowrap"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-orange-400" />
            <span>Raid: {details.activeRaidingTeam === 'A' ? teamAName : teamBName}</span>
          </button>

          {details.scorerSettings.panels.timeoutControls && (
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() =>
                details.clock.timeoutActive
                  ? dispatchClock({ type: 'END_TIMEOUT' })
                  : setTimeoutOpen(true)
              }
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 rounded-lg bg-sky-900/60 hover:bg-sky-800/70 border border-sky-700/60 text-xs font-semibold text-sky-100 whitespace-nowrap"
            >
              <Timer className="w-3.5 h-3.5" />
              <span>{details.clock.timeoutActive ? 'End Timeout' : 'Timeout'}</span>
            </button>
          )}

          <button
            type="button"
            disabled={terminalBusy || undoableCount === 0}
            onClick={handleUndoLast}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold disabled:opacity-40 whitespace-nowrap"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>

          {isCompleted ? (
            <button
              type="button"
              onClick={() => setWinnerOpen(true)}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold whitespace-nowrap"
            >
              <Award className="w-3.5 h-3.5" />
              <span>Winner Screen</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={terminalBusy}
              onClick={() => setCompleteOpen(true)}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold whitespace-nowrap disabled:opacity-40"
            >
              <Award className="w-3.5 h-3.5" />
              <span>Complete Match</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold whitespace-nowrap"
          >
            {sidebarOpen ? (
              <PanelRightClose className="w-4 h-4" />
            ) : (
              <PanelRightOpen className="w-4 h-4" />
            )}
            <span>{sidebarOpen ? 'Hide Tools' : 'Tools'}</span>
          </button>
        </div>
      </div>

      {/* SUSPENDED BANNER */}
      {isSuspended && (
        <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-400/50 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-100">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Match Suspended: {details.clock.suspendedReason || 'Paused by officials'}</span>
          </div>
          <button
            type="button"
            disabled={terminalBusy}
            onClick={() => dispatchClock({ type: 'RESUME_MATCH' })}
            className="min-h-[34px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-40"
          >
            Resume Match
          </button>
        </div>
      )}

      {/* ANIMATIONS: DO-OR-DIE / ALL-OUT / TIMEOUT */}
      <KabaddiAnimations
        streamId={stream.id}
        teamAName={teamAName}
        teamBName={teamBName}
        doOrDie={details.doOrDie}
        doOrDieVisible={clock.doOrDieVisible}
        doOrDieRemainingSec={clock.doOrDieRemainingSec}
        lastAllOut={details.lastAllOut}
        allOutDurationSec={details.rules.allOutBannerDurationSec}
        timeoutActive={details.clock.timeoutActive}
        timeoutTeam={details.clock.timeoutTeam}
        timeoutRemainingSec={clock.timeoutRemainingSec}
        displaySettings={details.viewerDisplaySettings}
        onClearDoOrDie={() => dispatchEvent({ type: 'CLEAR_DO_OR_DIE' }, 'Do-or-Die cleared')}
      />

      {/* MAIN GRID: DUAL IDENTICAL SCORING CARDS + COLLAPSIBLE SIDEBAR */}
      <div className={`grid grid-cols-1 gap-4 ${sidebarOpen ? 'xl:grid-cols-[1fr_390px]' : ''}`}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {orderedSides.map((s) => (
              <div key={s}>{renderTeamScoringCard(s)}</div>
            ))}
          </div>

          {/* Inline Winner Banner if match completed */}
          {isCompleted && (
            <KabaddiWinnerScreen
              inline
              stream={stream}
              score={score}
              details={details}
            />
          )}

          {/* Compact Recent Events Strip (always handy when sidebar is collapsed) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-400">
                Recent Kabaddi Events
              </span>
              <span className="font-mono text-slate-500">
                Raid #{details.raidNumber} · {details.raidTimeline.length} logged
              </span>
            </div>
            {details.raidTimeline.length === 0 ? (
              <p className="text-xs text-slate-500">No raids scored yet — tap any scoring button above to begin.</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {details.raidTimeline.slice(0, 6).map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-2 text-xs py-1 border-b border-slate-800/70 last:border-b-0 ${
                      item.reverted ? 'opacity-45 line-through' : ''
                    }`}
                  >
                    <span className="text-slate-200 truncate">{item.description || item.eventType}</span>
                    <span className="font-mono tabular-nums font-bold text-orange-400 shrink-0">
                      {item.scoreSnapshot}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {sidebarOpen && (
          <KabaddiSidebarPanels
            stream={stream}
            score={score}
            details={details}
            history={history}
            players={players}
            playerStats={playerStats}
            saving={terminalBusy}
            formattedClock={clock.formattedClock}
            activeTab={sidebarTab}
            onChangeTab={setSidebarTab}
            onClockCommand={dispatchClock}
            onOpenTimeCorrection={() => setTimeCorrOpen(true)}
            onOpenScoreCorrection={() => setScoreCorrOpen(true)}
            onOpenTimeout={() => setTimeoutOpen(true)}
            onOpenRules={() => setRulesOpen(true)}
            onOpenPlayerOps={(mode) => setPlayerOpsMode(mode)}
            onOpenForfeit={() => setForfeitOpen(true)}
            onOpenCompleteMatch={() => setCompleteOpen(true)}
            onReopenMatch={handleReopenMatch}
            onCorrectEvent={(item) => setCorrectionItem(item)}
            onSyncRoster={handleSyncRosterFromDb}
            onSaveScorerSettings={(scorerSettings) => handleSaveSettings({ scorerSettings })}
            onResetScorerSettings={() => handleSaveSettings({ resetScorerDefaults: true })}
            onSaveViewerSettings={(viewerDisplaySettings) =>
              handleSaveSettings({ viewerDisplaySettings })
            }
            onSaveRules={(rules) => handleSaveSettings({ rules })}
            onResetViewerSettings={() => handleSaveSettings({ resetViewerDefaults: true })}
          />
        )}
      </div>

      {/* CONTEXTUAL MODALS */}
      {multiModalTeam && (
        <MultiPointRaidModal
          open={Boolean(multiModalTeam)}
          onClose={() => setMultiModalTeam(null)}
          team={multiModalTeam}
          teamName={multiModalTeam === 'A' ? teamAName : teamBName}
          oppTeamName={multiModalTeam === 'A' ? teamBName : teamAName}
          raiders={(multiModalTeam === 'A' ? details.courtPlayersA : details.courtPlayersB).filter(
            (p) => p.status === 'ON_COURT'
          )}
          oppDefenders={(
            multiModalTeam === 'A' ? details.courtPlayersB : details.courtPlayersA
          ).filter((p) => p.status === 'ON_COURT')}
          defaultMode={scoringMode}
          rules={details.rules}
          saving={false}
          onSubmit={async (payload) => {
            await dispatchEvent(
              {
                type: 'MULTI_POINT_RAID',
                ...payload,
                clockText: clock.formattedClock,
              },
              'Multi-point raid recorded'
            );
            setMultiModalTeam(null);
          }}
        />
      )}

      {extraModalTeam && (
        <ExtraPointsModal
          open={Boolean(extraModalTeam)}
          onClose={() => setExtraModalTeam(null)}
          initialTeam={extraModalTeam}
          teamAName={teamAName}
          teamBName={teamBName}
          courtPlayersA={details.courtPlayersA}
          courtPlayersB={details.courtPlayersB}
          saving={false}
          onSubmit={async (payload) => {
            await dispatchEvent(
              {
                type: 'EXTRA_POINTS',
                ...payload,
                clockText: clock.formattedClock,
              },
              'Extra points awarded'
            );
            setExtraModalTeam(null);
          }}
        />
      )}

      <KabaddiTimeoutModal
        open={timeoutOpen}
        onClose={() => setTimeoutOpen(false)}
        teamAName={teamAName}
        teamBName={teamBName}
        details={details}
        saving={terminalBusy}
        onStartTimeout={async (team) => {
          await dispatchClock({ type: 'START_TIMEOUT', team });
          setTimeoutOpen(false);
        }}
      />

      {playerOpsMode && (
        <KabaddiPlayerOpsModal
          open={Boolean(playerOpsMode)}
          onClose={() => setPlayerOpsMode(null)}
          mode={playerOpsMode}
          teamAName={teamAName}
          teamBName={teamBName}
          courtPlayersA={details.courtPlayersA}
          courtPlayersB={details.courtPlayersB}
          saving={saving}
          onSubstitute={async (payload) => {
            await dispatchEvent({ type: 'SUBSTITUTION', ...payload });
            setPlayerOpsMode(null);
          }}
          onCard={async (payload) => {
            await dispatchEvent({ type: 'CARD', ...payload });
            setPlayerOpsMode(null);
          }}
          onInjury={async (payload) => {
            await dispatchEvent({ type: 'INJURY', ...payload });
            setPlayerOpsMode(null);
          }}
        />
      )}

      <KabaddiRulesModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        rules={details.rules}
        saving={terminalBusy}
        onSaveRules={async (rules) => {
          await handleSaveSettings({ rules });
          setRulesOpen(false);
        }}
        onResetDefaults={async () => {
          await handleSaveSettings({ resetRulesDefaults: true });
          setRulesOpen(false);
        }}
      />

      <KabaddiUtilityModals
        timeOpen={timeCorrOpen}
        onCloseTime={() => setTimeCorrOpen(false)}
        scoreCorrOpen={scoreCorrOpen}
        onCloseScoreCorr={() => setScoreCorrOpen(false)}
        forfeitOpen={forfeitOpen}
        onCloseForfeit={() => setForfeitOpen(false)}
        teamAName={teamAName}
        teamBName={teamBName}
        scoreA={scoreA}
        scoreB={scoreB}
        details={details}
        saving={terminalBusy}
        onTimeCorrection={async (minutes, seconds, halfLabel: KabaddiHalfLabel) => {
          await dispatchClock({ type: 'TIME_CORRECTION', minutes, seconds, halfLabel });
          setTimeCorrOpen(false);
        }}
        onScoreCorrection={async (nextA, nextB, reason) => {
          await dispatchEvent({
            type: 'MANUAL_SCORE_CORRECTION',
            teamAScore: nextA,
            teamBScore: nextB,
            reason,
          });
          setScoreCorrOpen(false);
        }}
        onForfeit={async (fTeam, reason) => {
          await handleCompleteMatch({ forfeitTeam: fTeam, forfeitReason: reason });
        }}
      />

      <KabaddiCompleteMatchModal
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        teamAName={teamAName}
        teamBName={teamBName}
        scoreA={scoreA}
        scoreB={scoreB}
        details={details}
        saving={terminalBusy}
        onComplete={(opts) => handleCompleteMatch(opts)}
        onStartExtraTime={() => dispatchClock({ type: 'EXTRA_TIME', halfNumber: 1 })}
        onStartTieBreaker={() => dispatchClock({ type: 'TIE_BREAKER' })}
      />

      <EventCorrectionModal
        open={Boolean(correctionItem)}
        onClose={() => setCorrectionItem(null)}
        eventItem={correctionItem}
        teamA={teamAName}
        teamB={teamBName}
        saving={terminalBusy}
        onConfirmCorrection={async (payload) => {
          try {
            setSaving(true);
            onError(null);
            const res = await scoreboardService.correctScoreEvent(stream.id, payload.eventId, {
              correctionReason: payload.correctionReason,
              teamAScore: payload.teamAScore,
              teamBScore: payload.teamBScore,
              revertToBeforeEvent: payload.revertToBeforeEvent,
            });
            onScoreChange(res.score);
            onRefreshHistory();
            onRefreshStats?.();
            setCorrectionItem(null);
            onSuccess('Scoring event corrected and audited.');
          } catch (err) {
            onError(extractApiError(err, 'Failed to apply event correction.'));
          } finally {
            setSaving(false);
          }
        }}
      />

      <KabaddiWinnerScreen
        open={winnerOpen}
        onClose={() => setWinnerOpen(false)}
        stream={stream}
        score={score}
        details={details}
      />
    </section>
  );
}
