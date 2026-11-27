import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertTriangle,
  CloudOff,
  Edit3,
  Lock,
  MessageSquarePlus,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Trophy,
  Undo2,
  Wifi,
} from 'lucide-react';
import {
  LiveScoreData,
  LiveStreamData,
  MatchHighlightData,
  PlayerData,
  PlayerMatchStatRecord,
  ScoreHistoryItem,
} from '../../types/index.ts';
import { SportOption, SPORT_OPTIONS } from '../../constants/sports.ts';
import { scoreboardService } from '../../services/scoreboard/scoreboardService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { ConfirmDialog } from '../common/ConfirmDialog.tsx';
import { FeedbackBanner } from '../common/FeedbackBanner.tsx';
import { Modal } from '../common/Modal.tsx';
import { MatchResultModal } from './MatchResultModal.tsx';
import { AdvancedEventComposer } from './AdvancedEventComposer.tsx';
import { EventCorrectionModal } from './EventCorrectionModal.tsx';
import { MatchHighlightsManager } from './MatchHighlightsManager.tsx';
import { PlayerMatchStatsRecorder } from './PlayerMatchStatsRecorder.tsx';
import type { MatchResultType } from '../../utils/matchResultValidation.ts';
import { STANDARD_MATCH_STATUSES } from '../../utils/matchStatus.ts';
import { generateAutoCommentary } from '../../utils/autoCommentary.ts';
import { OfflineScoreQueueItem } from '../../utils/offlineScoreQueue.ts';
import { offlineScoreService } from '../../services/scoreboard/offlineScoreService.ts';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.ts';
import {
  CricketDetails,
  applyCricketAction,
} from '../../utils/cricketScoring.ts';
import { CricketScorerConsole } from './CricketScorerConsole.tsx';
import { KabaddiScorerConsole } from './kabaddi/KabaddiScorerConsole.tsx';
import {
  FootballDetails,
  applyFootballAction,
  createInitialFootballDetails,
} from '../../utils/footballScoring.ts';
import {
  VolleyballActionPayload,
  VolleyballDetails,
  VolleyballRules,
  VOLLEYBALL_SET_PRESETS,
  getVolleyballCompletionEligibility,
  getVolleyballSetTargets,
  isVolleyballScoringLocked,
  normalizeVolleyballDetails,
  validateVolleyballRules,
} from '../../utils/volleyballScoring.ts';
import { getInitialSportDetails } from '../../utils/scoringEngine.ts';
import {
  applyOptimisticPatch,
  applyOptimisticStructuredEvent,
  makeClientEventId,
} from '../../utils/optimisticScore.ts';
import { completeScoreTraceApi, startScoreTrace } from '../../utils/realtimeDiagnostics.ts';

interface ScoreControlPanelProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  history: ScoreHistoryItem[];
  players?: PlayerData[];
  highlights?: MatchHighlightData[];
  playerStats?: PlayerMatchStatRecord[];
  onScoreChange: (score: LiveScoreData) => void;
  onRefreshHistory: () => void;
  onAddHistoryItem?: (item?: ScoreHistoryItem) => void;
  onRefreshHighlights?: () => void;
  onRefreshStats?: () => void;
}

export function ScoreControlPanel({
  stream,
  score,
  history,
  players = [],
  highlights = [],
  playerStats = [],
  onScoreChange,
  onRefreshHistory,
  onAddHistoryItem,
  onRefreshHighlights,
  onRefreshStats,
}: ScoreControlPanelProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [correctionItem, setCorrectionItem] = useState<ScoreHistoryItem | null>(null);

  const [commentaryText, setCommentaryText] = useState('');
  const [postingCommentary, setPostingCommentary] = useState(false);
  const [autoCommentaryEnabled, setAutoCommentaryEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('maidanlive_auto_commentary') !== 'false';
    } catch {
      return true;
    }
  });
  const [autoPostCommentary, setAutoPostCommentary] = useState<boolean>(false);

  // Offline Queue & Sync state (managed by OfflineScoreService)
  const isOnline = useOnlineStatus();
  const [queuedItems, setQueuedItems] = useState<OfflineScoreQueueItem[]>([]);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  const sport: SportOption = score?.sportType || (stream.gameName as SportOption) || 'Other';
  const teamA = stream.teamAName || 'Team A';
  const teamB = stream.teamBName || 'Team B';
  const [matchStatusInput, setMatchStatusInput] = useState(score?.matchStatus || 'Live');
  const scoreUpdateCount = history.filter(
    (h) =>
      (!h.entryType ||
        h.entryType === 'SCORE_UPDATE' ||
        h.entryType === 'RULES' ||
        (sport === 'Volleyball' && h.entryType === 'RESULT')) &&
      !h.reverted
  ).length;
  const resultDeclared = Boolean(score?.resultStatus && score.resultStatus !== 'NOT_DECLARED');
  const volleyballLock =
    sport === 'Volleyball'
      ? isVolleyballScoringLocked(score?.sportSpecificDetails, score?.resultStatus)
      : { locked: false, reason: '' };
  const controlLocked = volleyballLock.locked;

  useEffect(() => {
    if (score?.matchStatus) setMatchStatusInput(score.matchStatus);
  }, [score?.matchStatus]);

  useEffect(() => {
    const unsubscribe = offlineScoreService.subscribe(
      stream.id,
      (snapshot) => {
        setQueuedItems(snapshot.items);
        setSyncingQueue(snapshot.syncing);
        setLastSyncedAt(snapshot.lastSyncedAt);
        setLastSyncError(snapshot.lastSyncError);
      },
      {
        onScoreSynced: (syncedScore) => {
          onScoreChange(syncedScore);
          onRefreshHistory();
          onRefreshStats?.();
        },
      }
    );
    return unsubscribe;
  }, [stream.id, onScoreChange, onRefreshHistory, onRefreshStats]);

  const syncOfflineQueue = useCallback(
    async (forceOverride = false) => {
      const result = await offlineScoreService.syncStream(stream.id, {
        forceOverride,
        onScoreSynced: (syncedScore) => {
          onScoreChange(syncedScore);
        },
      });
      if (result.syncedCount > 0) {
        onRefreshHistory();
        onRefreshStats?.();
        setSuccessMsg(
          `Synced ${result.syncedCount} cached scoring update${result.syncedCount === 1 ? '' : 's'} to server.`
        );
      }
    },
    [stream.id, onScoreChange, onRefreshHistory, onRefreshStats]
  );

  function handleAutoCommentaryAfterEvent(
    actionLabel: string,
    nextA: number,
    nextB: number,
    nextDetails?: Record<string, unknown>
  ) {
    if (!autoCommentaryEnabled) return;
    const generated = generateAutoCommentary({
      sport,
      actionLabel,
      teamAName: teamA,
      teamBName: teamB,
      teamAScore: nextA,
      teamBScore: nextB,
      details: nextDetails,
    });
    if (autoPostCommentary && navigator.onLine) {
      scoreboardService
        .submitCommentary(stream.id, generated)
        .then(() => onRefreshHistory())
        .catch(() => setCommentaryText(generated));
    } else {
      setCommentaryText(generated);
    }
  }

  async function commitUpdate(payload: {
    teamAScore?: number;
    teamBScore?: number;
    sportSpecificDetails?: Record<string, unknown>;
    matchStatus?: string;
    sportType?: SportOption;
    tossWinner?: 'A' | 'B' | '';
    tossDecision?: string;
    action: string;
  }) {
    const prevScore = score;
    const clientEventId = makeClientEventId('patch');
    const traceId = clientEventId;
    const apiStartAtMs = Date.now();
    startScoreTrace(traceId, payload.action, apiStartAtMs);
    const optimistic = applyOptimisticPatch(score, payload);
    if (optimistic) {
      onScoreChange(optimistic);
    }

    try {
      setSaving(true);
      setError(null);
      const result = await offlineScoreService.submitScorePatch(
        stream.id,
        { ...payload, clientEventId, traceId },
        score
      );
      completeScoreTraceApi(traceId, {
        status: result.queued ? 'queued' : 'synced',
        apiStartAtMs,
        diag: result.diag,
      });
      if (result.score) {
        onScoreChange(result.score);
      }

      if (result.queued) {
        setSuccessMsg(`Saved offline (${payload.action}) — will sync automatically on reconnect.`);
        handleAutoCommentaryAfterEvent(
          payload.action,
          result.score?.teamAScore ?? 0,
          result.score?.teamBScore ?? 0,
          payload.sportSpecificDetails
        );
      } else {
        if (result.historyItem && onAddHistoryItem) {
          onAddHistoryItem(result.historyItem);
        } else {
          onRefreshHistory();
        }
        setSuccessMsg(payload.action);
        if (result.score) {
          handleAutoCommentaryAfterEvent(
            payload.action,
            result.score.teamAScore,
            result.score.teamBScore,
            result.score.sportSpecificDetails
          );
        }
      }
    } catch (err) {
      if (prevScore) {
        onScoreChange(prevScore);
      }
      const msg = extractApiError(err, 'Failed to update score.');
      completeScoreTraceApi(traceId, { status: 'error', apiStartAtMs, errorText: msg });
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitStructuredEvent(payload: {
    clientEventId: string;
    sportType: string;
    action: Record<string, unknown>;
    playerId?: string;
    playerName?: string;
    assistPlayerId?: string;
    assistPlayerName?: string;
    eventPhase?: string;
  }) {
    const prevScore = score;
    const traceId = payload.clientEventId || makeClientEventId('evt');
    const apiStartAtMs = Date.now();
    const actionName = String(payload.action?.type || 'Structured Event');
    startScoreTrace(traceId, `${payload.sportType}: ${actionName}`, apiStartAtMs);
    const optimistic = applyOptimisticStructuredEvent(score, payload.sportType, payload.action);
    if (optimistic && optimistic !== score) {
      onScoreChange(optimistic);
    }

    try {
      setSaving(true);
      setError(null);
      const result = await offlineScoreService.submitScoreEvent(
        stream.id,
        { ...payload, clientEventId: traceId, traceId },
        score
      );
      completeScoreTraceApi(traceId, {
        status: result.queued ? 'queued' : 'synced',
        apiStartAtMs,
        diag: result.diag,
      });
      if (result.queued) {
        if (!optimistic || optimistic === score) {
          if (payload.sportType === 'Cricket' && score) {
            const applied = applyCricketAction(
              (score.sportSpecificDetails || {}) as Partial<CricketDetails>,
              payload.action as any
            );
            const nextStatus = applied.autoCompletedMatch
              ? 'COMPLETED'
              : applied.autoCompletedInnings1
                ? 'INNINGS BREAK'
                : score.matchStatus;
            onScoreChange({
              ...score,
              teamAScore: applied.teamAScore,
              teamBScore: applied.teamBScore,
              matchStatus: nextStatus,
              sportSpecificDetails: applied.details as unknown as Record<string, unknown>,
            });
          }
        }
        setSuccessMsg(
          'Scoring event cached in IndexedDB — will sync automatically upon reconnection.'
        );
        return;
      }

      if (result.score) {
        onScoreChange(result.score);
      }
      if (result.historyItem && onAddHistoryItem) {
        onAddHistoryItem(result.historyItem);
      } else {
        onRefreshHistory();
      }
      onRefreshStats?.();
      const actionLabel = result.historyItem?.action || 'Structured scoring event recorded.';
      setSuccessMsg(
        result.duplicatePrevented ? 'Duplicate submission safely ignored.' : actionLabel
      );
      if (!result.duplicatePrevented && result.score) {
        handleAutoCommentaryAfterEvent(
          actionLabel,
          result.score.teamAScore,
          result.score.teamBScore,
          result.score.sportSpecificDetails
        );
      }
    } catch (err) {
      if (prevScore) {
        onScoreChange(prevScore);
      }
      const msg = extractApiError(err, 'Failed to record scoring event.');
      completeScoreTraceApi(traceId, { status: 'error', apiStartAtMs, errorText: msg });
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmEventCorrection(payload: {
    eventId: string;
    correctionReason: string;
    teamAScore?: number;
    teamBScore?: number;
    revertToBeforeEvent?: boolean;
  }) {
    try {
      setSaving(true);
      setError(null);
      const res = await scoreboardService.correctScoreEvent(stream.id, payload.eventId, {
        correctionReason: payload.correctionReason,
        teamAScore: payload.teamAScore,
        teamBScore: payload.teamBScore,
        revertToBeforeEvent: payload.revertToBeforeEvent,
      });
      onScoreChange(res.score);
      onRefreshHistory();
      setCorrectionItem(null);
      setSuccessMsg('Scoring event corrected and recorded in audit history.');
    } catch (err) {
      setError(extractApiError(err, 'Failed to apply event correction.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleUndo() {
    const traceId = makeClientEventId('undo');
    const apiStartAtMs = Date.now();
    startScoreTrace(traceId, 'Undo Last Action', apiStartAtMs);
    try {
      setSaving(true);
      setError(null);
      const res = await scoreboardService.undoScore(stream.id, {
        clientEventId: traceId,
        traceId,
      });
      completeScoreTraceApi(traceId, { status: 'synced', apiStartAtMs, diag: res.diag });
      onScoreChange(res.score);
      onRefreshHistory();
      setUndoOpen(false);
      setSuccessMsg(`Undid: ${res.undoneAction}`);
    } catch (err) {
      const msg = extractApiError(err, 'Unable to undo score update.');
      completeScoreTraceApi(traceId, { status: 'error', apiStartAtMs, errorText: msg });
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    try {
      setSaving(true);
      setError(null);
      const res = await scoreboardService.resetScore(stream.id);
      onScoreChange(res.score);
      onRefreshHistory();
      setResetOpen(false);
      setSuccessMsg('Scoreboard reset to zero.');
    } catch (err) {
      setError(extractApiError(err, 'Failed to reset scoreboard.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSportChange(nextSport: SportOption) {
    await commitUpdate({
      sportType: nextSport,
      teamAScore: 0,
      teamBScore: 0,
      sportSpecificDetails: getInitialSportDetails(nextSport),
      action: `Switched scoreboard mode to ${nextSport}`,
    });
  }

  async function handleSubmitCommentary(e: FormEvent) {
    e.preventDefault();
    const snippet = commentaryText.trim();
    if (!snippet) return;
    try {
      setPostingCommentary(true);
      setError(null);
      await scoreboardService.submitCommentary(stream.id, snippet);
      setCommentaryText('');
      onRefreshHistory();
      setSuccessMsg('Live commentary posted to viewers.');
    } catch (err) {
      setError(extractApiError(err, 'Failed to submit commentary snippet.'));
    } finally {
      setPostingCommentary(false);
    }
  }

  async function handleDeclareResult(payload: {
    resultType: MatchResultType;
    winningMargin: string;
    resultDescription: string;
    mvpPlayerId?: string;
    mvpPlayerName?: string;
    finalSummary?: string;
    confirmCorrection: boolean;
  }) {
    try {
      setSaving(true);
      setError(null);
      const res = await scoreboardService.declareMatchResult(stream.id, payload);
      onScoreChange(res.score);
      onRefreshHistory();
      onRefreshStats?.();
      setResultModalOpen(false);
      setSuccessMsg(
        res.isCorrection
          ? `Match result updated: ${res.score.resultDescription}`
          : `Official match result declared: ${res.score.resultDescription}`
      );
    } catch (err) {
      setError(extractApiError(err, 'Failed to declare match result.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleVolleyballEvent(action: VolleyballActionPayload) {
    await handleSubmitStructuredEvent({
      clientEventId: `vb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sportType: 'Volleyball',
      action: action as unknown as Record<string, unknown>,
    });
  }

  async function handleSaveVolleyballRules(rules: Partial<VolleyballRules>) {
    try {
      setSaving(true);
      setError(null);
      const res = await scoreboardService.saveVolleyballRules(stream.id, {
        ...rules,
        rules: rules as Record<string, unknown>,
      });
      onScoreChange(res.score);
      onRefreshHistory();
      setSuccessMsg(
        res.historyItem?.action ||
          `Volleyball format updated: Best of ${res.score.sportSpecificDetails?.bestOfSets ?? rules.bestOfSets ?? 5}`
      );
    } catch (err) {
      setError(extractApiError(err, 'Failed to update Volleyball match rules.'));
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleCompleteVolleyballMatch(payload: {
    winnerSide: 'A' | 'B';
    reason?: string;
    winningMargin?: string;
    mvpPlayerId?: string;
    mvpPlayerName?: string;
  }) {
    try {
      setSaving(true);
      setError(null);
      const res = await scoreboardService.completeVolleyballMatch(stream.id, payload);
      onScoreChange(res.score);
      onRefreshHistory();
      onRefreshStats?.();
      setSuccessMsg(
        `Match completed & locked. Official winner: ${res.score.winnerTeamName || (payload.winnerSide === 'A' ? teamA : teamB)}.`
      );
    } catch (err) {
      setError(extractApiError(err, 'Failed to complete Volleyball match.'));
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleReopenVolleyballMatch(reason?: string) {
    try {
      setSaving(true);
      setError(null);
      const res = await scoreboardService.reopenVolleyballMatch(stream.id, reason);
      onScoreChange(res.score);
      onRefreshHistory();
      onRefreshStats?.();
      setSuccessMsg('Match reopened and returned to active scoring state. All set scores preserved.');
    } catch (err) {
      setError(extractApiError(err, 'Failed to reopen Volleyball match.'));
      throw err;
    } finally {
      setSaving(false);
    }
  }

  const conflictItems = queuedItems.filter((q) => q.status === 'CONFLICT');

  return (
    <div className="space-y-5">
      {/* Offline Queue & Connectivity Sync Bar */}
      <div
        className={`rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs ${
          !isOnline
            ? 'bg-amber-50 border-amber-300 text-amber-950'
            : conflictItems.length > 0
              ? 'bg-red-50 border-red-300 text-red-950'
              : queuedItems.length > 0
                ? 'bg-sky-50 border-sky-200 text-sky-950'
                : 'bg-white border-slate-200 text-slate-700'
        }`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            {isOnline ? (
              <Wifi className="w-4 h-4 text-emerald-600" />
            ) : (
              <CloudOff className="w-4 h-4 text-amber-700" />
            )}
            <span>{isOnline ? 'Connected · Live Sync Ready' : 'Offline Mode · Caching in IndexedDB'}</span>
          </span>
          {queuedItems.length > 0 && (
            <span className="font-mono font-bold tabular-nums">
              · {queuedItems.length} cached update{queuedItems.length === 1 ? '' : 's'}
            </span>
          )}
          {lastSyncError && isOnline && queuedItems.length > 0 && (
            <span className="text-amber-800 font-medium">· {lastSyncError}</span>
          )}
          {lastSyncedAt && (
            <span className="text-slate-500 font-mono tabular-nums hidden sm:inline">
              · Last synced {lastSyncedAt}
            </span>
          )}
        </div>
        {queuedItems.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!isOnline || syncingQueue}
              onClick={() => syncOfflineQueue(false)}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingQueue ? 'animate-spin' : ''}`} />
              <span>{syncingQueue ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          </div>
        )}
      </div>

      {conflictItems.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 space-y-2.5 text-xs text-red-950">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>
              {conflictItems.length} queued update{conflictItems.length === 1 ? '' : 's'} paused due
              to newer server score state
            </span>
          </div>
          <p className="text-red-800">
            Another scorer updated this match while you were offline. Review before overwriting valid
            server state:
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => syncOfflineQueue(true)}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700"
            >
              Apply Local Queue Anyway
            </button>
            <button
              type="button"
              onClick={async () => {
                await offlineScoreService.discardConflicts(stream.id);
              }}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white border border-red-300 text-red-800 font-semibold hover:bg-red-100"
            >
              Discard Conflicting Queue
            </button>
          </div>
        </div>
      )}

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      {successMsg && (
        <FeedbackBanner
          type="success"
          message={successMsg}
          onDismiss={() => setSuccessMsg(null)}
        />
      )}

      {/* Top Toolbar: Sport Mode, Standardized Match Status, Undo, Reset */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Scoreboard Sport
              </label>
              <select
                value={sport}
                disabled={saving || controlLocked}
                title={controlLocked ? volleyballLock.reason : undefined}
                onChange={(e) => handleSportChange(e.target.value as SportOption)}
                className="min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
              >
                {SPORT_OPTIONS.map((sp) => (
                  <option key={sp} value={sp}>
                    {sp}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Match Status
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={
                    STANDARD_MATCH_STATUSES.includes(matchStatusInput.toUpperCase() as any)
                      ? matchStatusInput.toUpperCase()
                      : ''
                  }
                  disabled={saving || controlLocked}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setMatchStatusInput(e.target.value);
                    commitUpdate({
                      matchStatus: e.target.value,
                      action: `Match status: ${e.target.value}`,
                    });
                  }}
                  aria-label="Standardized match status preset"
                  className="min-h-[42px] px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg disabled:opacity-50"
                >
                  <option value="">Quick Status...</option>
                  {STANDARD_MATCH_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={matchStatusInput}
                  disabled={saving || controlLocked}
                  onChange={(e) => setMatchStatusInput(e.target.value)}
                  placeholder="e.g. Live, Half Time"
                  className="min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg w-36 sm:w-44 focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={saving || controlLocked}
                  onClick={() =>
                    commitUpdate({
                      matchStatus: matchStatusInput.trim() || 'Live',
                      action: `Match status: ${matchStatusInput.trim() || 'Live'}`,
                    })
                  }
                  className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap disabled:opacity-50"
                >
                  Save Status
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setResultModalOpen(true)}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-wide uppercase text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 whitespace-nowrap shrink-0"
            >
              <Trophy className="w-4 h-4" />
              <span>{resultDeclared ? 'Correct Result' : 'Declare Match Result'}</span>
            </button>
            <button
              type="button"
              disabled={saving || scoreUpdateCount === 0}
              onClick={() => setUndoOpen(true)}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <Undo2 className="w-4 h-4" />
              <span>Undo Last</span>
            </button>
            <button
              type="button"
              disabled={saving || controlLocked}
              title={controlLocked ? volleyballLock.reason : undefined}
              onClick={() => setResetOpen(true)}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {resultDeclared && score && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-emerald-950 font-semibold">
              <Trophy className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                Official Result: {score.resultDescription || score.winnerTeamName}
                {score.declaredByName ? ` (by ${score.declaredByName})` : ''}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setResultModalOpen(true)}
              className="text-emerald-800 font-semibold underline hover:text-emerald-950"
            >
              Edit / Correct
            </button>
          </div>
        )}
      </div>

      {/* Live Commentary Snippet Input + Rule-Based Auto Commentary Controls */}
      <form
        onSubmit={handleSubmitCommentary}
        className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="live-commentary-input"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800"
          >
            <MessageSquarePlus className="w-4 h-4 text-emerald-600" />
            <span>Live Commentary Snippet</span>
          </label>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5 text-slate-700 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={autoCommentaryEnabled}
                onChange={(e) => {
                  const next = e.target.checked;
                  setAutoCommentaryEnabled(next);
                  try {
                    localStorage.setItem('maidanlive_auto_commentary', String(next));
                  } catch {
                    // ignore
                  }
                }}
                className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600"
              />
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Auto-Commentary</span>
            </label>
            {autoCommentaryEnabled && (
              <label className="inline-flex items-center gap-1.5 text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoPostCommentary}
                  onChange={(e) => setAutoPostCommentary(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-[#EA580C]"
                />
                <span>Auto-Post Live</span>
              </label>
            )}
            <span className="text-[11px] text-slate-500 font-mono tabular-nums">
              {commentaryText.length}/280
            </span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="live-commentary-input"
            type="text"
            maxLength={280}
            value={commentaryText}
            onChange={(e) => setCommentaryText(e.target.value)}
            placeholder="Type live commentary update or let Auto-Commentary pre-fill from score updates"
            className="flex-1 min-h-[42px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
          <button
            type="submit"
            disabled={postingCommentary || !commentaryText.trim()}
            className="min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{postingCommentary ? 'Sending...' : 'Post Commentary'}</span>
          </button>
        </div>
      </form>

      {/* Advanced Multi-Point & Structured Scorer (Football / Volleyball / Other; Cricket & Kabaddi have dedicated Consoles) */}
      {sport !== 'Cricket' && sport !== 'Kabaddi' && (
        <AdvancedEventComposer
          stream={stream}
          score={score}
          players={players}
          saving={saving}
          locked={controlLocked}
          onSubmitEvent={handleSubmitStructuredEvent}
        />
      )}

      {/* Sport-specific interactive touch controls */}
      {sport === 'Cricket' && (
        <CricketScorerConsole
          stream={stream}
          score={score}
          players={players}
          saving={saving}
          onScoreChange={onScoreChange}
          onRefreshHistory={onRefreshHistory}
          onRefreshStats={onRefreshStats}
          onOpenResultModal={() => setResultModalOpen(true)}
          onSubmitCricketEvent={handleSubmitStructuredEvent}
          onError={setError}
          onSuccess={setSuccessMsg}
        />
      )}

      {sport === 'Kabaddi' && (
        <KabaddiScorerConsole
          stream={stream}
          score={score}
          history={history}
          players={players}
          playerStats={playerStats}
          onScoreChange={onScoreChange}
          onRefreshHistory={onRefreshHistory}
          onAddHistoryItem={onAddHistoryItem}
          onRefreshStats={onRefreshStats}
          onError={setError}
          onSuccess={setSuccessMsg}
        />
      )}

      {sport === 'Football' && (
        <FootballControls
          teamA={teamA}
          teamB={teamB}
          scoreA={score?.teamAScore ?? 0}
          scoreB={score?.teamBScore ?? 0}
          details={{
            ...createInitialFootballDetails(),
            ...((score?.sportSpecificDetails || {}) as Partial<FootballDetails>),
          }}
          saving={saving}
          onApply={(next) =>
            commitUpdate({
              teamAScore: next.teamAScore,
              teamBScore: next.teamBScore,
              sportSpecificDetails: next.details as unknown as Record<string, unknown>,
              action: next.label,
            })
          }
        />
      )}

      {sport === 'Volleyball' && (
        <VolleyballControls
          teamA={teamA}
          teamB={teamB}
          scoreA={score?.teamAScore ?? 0}
          scoreB={score?.teamBScore ?? 0}
          details={normalizeVolleyballDetails(
            (score?.sportSpecificDetails || {}) as Partial<VolleyballDetails>
          )}
          saving={saving}
          locked={controlLocked}
          winnerName={score?.winnerTeamName || ''}
          resultDescription={score?.resultDescription || ''}
          players={players}
          onEvent={handleVolleyballEvent}
          onSaveRules={handleSaveVolleyballRules}
          onCompleteMatch={handleCompleteVolleyballMatch}
          onReopenMatch={handleReopenVolleyballMatch}
        />
      )}

      {sport === 'Other' && (
        <OtherSportControls
          teamA={teamA}
          teamB={teamB}
          scoreA={score?.teamAScore ?? 0}
          scoreB={score?.teamBScore ?? 0}
          details={score?.sportSpecificDetails || {}}
          saving={saving}
          onCommit={commitUpdate}
        />
      )}

      {/* Score & Commentary Audit History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Score &amp; Commentary Audit History</h3>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {history.length} event{history.length === 1 ? '' : 's'}
          </span>
        </div>
        {history.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No score updates or commentary recorded yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {history.map((item) => {
              const actorName =
                typeof item.updatedBy === 'object' && item.updatedBy
                  ? item.updatedBy.name
                  : 'Admin';
              const isCommentary = item.entryType === 'COMMENTARY';
              const isResult = item.entryType === 'RESULT';
              const isUndo = item.entryType === 'UNDO';
              const isRules = item.entryType === 'RULES';
              const isCorrection = item.entryType === 'CORRECTION';
              return (
                <div
                  key={item._id}
                  className={`px-4 py-2.5 flex items-center justify-between gap-3 text-xs ${
                    item.reverted
                      ? 'bg-slate-50 text-slate-400'
                      : isCommentary
                        ? 'bg-emerald-50/40'
                        : isResult
                          ? 'bg-amber-50/50'
                          : isUndo || isCorrection
                            ? 'bg-sky-50/40'
                            : isRules
                              ? 'bg-slate-50/70'
                              : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p
                      className={`font-medium break-words ${
                        item.reverted ? 'line-through text-slate-400' : 'text-slate-800'
                      }`}
                    >
                      {isCommentary && (
                        <span className="font-semibold text-emerald-700 mr-1.5">[Commentary]</span>
                      )}
                      {isResult && (
                        <span className="font-semibold text-amber-800 mr-1.5">[Result]</span>
                      )}
                      {isUndo && (
                        <span className="font-semibold text-sky-700 mr-1.5">[Undo]</span>
                      )}
                      {isRules && (
                        <span className="font-semibold text-slate-700 mr-1.5">[Rules]</span>
                      )}
                      {isCorrection && (
                        <span className="font-semibold text-indigo-700 mr-1.5">[Audit]</span>
                      )}
                      {item.action}
                      {item.reverted && (
                        <span className="ml-1.5 no-underline inline-block font-semibold text-slate-500">
                          [Reverted]
                        </span>
                      )}
                    </p>
                    <p className="text-slate-500 mt-0.5">
                      {actorName} · {new Date(item.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono tabular-nums font-semibold text-slate-700">
                      {item.updatedScore?.teamAScore ?? 0} - {item.updatedScore?.teamBScore ?? 0}
                    </span>
                    {(!item.entryType || item.entryType === 'SCORE_UPDATE') &&
                      !item.reverted &&
                      !controlLocked && (
                        <button
                          type="button"
                          onClick={() => setCorrectionItem(item)}
                          title="Correct this scoring event"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:border-slate-300"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Correct</span>
                        </button>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Match Highlights & Verified Player Match Stats */}
      {onRefreshHighlights && (
        <MatchHighlightsManager
          streamId={stream.id}
          highlights={highlights}
          onRefresh={onRefreshHighlights}
        />
      )}

      {onRefreshStats && (
        <PlayerMatchStatsRecorder
          streamId={stream.id}
          sportType={sport}
          players={players}
          stats={playerStats}
          onRefresh={onRefreshStats}
        />
      )}

      <ConfirmDialog
        open={undoOpen}
        onClose={() => setUndoOpen(false)}
        onConfirm={handleUndo}
        loading={saving}
        variant="primary"
        title="Undo Last Score Update"
        message="This will revert the scoreboard to its state prior to the last score update and notify live viewers."
        confirmLabel="Yes, Undo Update"
      />

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={handleReset}
        loading={saving}
        title="Reset Scoreboard"
        message="This will reset both teams' scores and sport-specific counters back to zero. This action is logged in score history."
        confirmLabel="Yes, Reset Scoreboard"
      />

      <MatchResultModal
        open={resultModalOpen}
        onClose={() => setResultModalOpen(false)}
        stream={stream}
        score={score}
        players={players}
        saving={saving}
        onConfirmSubmit={handleDeclareResult}
      />

      <EventCorrectionModal
        open={Boolean(correctionItem)}
        onClose={() => setCorrectionItem(null)}
        eventItem={correctionItem}
        teamA={teamA}
        teamB={teamB}
        saving={saving}
        onConfirmCorrection={handleConfirmEventCorrection}
      />
    </div>
  );
}


function FootballControls({
  teamA,
  teamB,
  scoreA,
  scoreB,
  details,
  saving,
  onApply,
}: {
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  details: FootballDetails;
  saving: boolean;
  onApply: (res: ReturnType<typeof applyFootballAction>) => void;
}) {
  const [half, setHalf] = useState<FootballDetails['half']>(details.half);
  const [mins, setMins] = useState(String(details.timerMinutes));
  const [secs, setSecs] = useState(String(details.timerSeconds));
  const [extraMins, setExtraMins] = useState(String(details.extraTimeMinutes));

  useEffect(() => {
    setHalf(details.half);
    setMins(String(details.timerMinutes));
    setSecs(String(details.timerSeconds));
    setExtraMins(String(details.extraTimeMinutes));
  }, [details.half, details.timerMinutes, details.timerSeconds, details.extraTimeMinutes]);

  const renderTeam = (team: 'A' | 'B', name: string, goals: number) => (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-slate-900">{name}</h4>
        <span className="font-mono text-xl font-bold tabular-nums">{goals}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onApply(applyFootballAction(details, scoreA, scoreB, { type: 'GOAL', team, delta: 1 }))
          }
          className="min-h-[46px] rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
        >
          +1 Goal
        </button>
        <button
          type="button"
          disabled={saving || goals <= 0}
          onClick={() =>
            onApply(applyFootballAction(details, scoreA, scoreB, { type: 'GOAL', team, delta: -1 }))
          }
          className="min-h-[46px] rounded-lg bg-slate-100 text-slate-800 text-sm font-semibold hover:bg-slate-200 disabled:opacity-40"
        >
          -1 Goal
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onApply(
              applyFootballAction(details, scoreA, scoreB, {
                type: 'CARD',
                team,
                card: 'yellow',
                delta: 1,
              })
            )
          }
          className="min-h-[42px] rounded-lg bg-amber-100 text-amber-900 text-xs font-semibold hover:bg-amber-200"
        >
          +1 Yellow Card
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onApply(
              applyFootballAction(details, scoreA, scoreB, {
                type: 'CARD',
                team,
                card: 'red',
                delta: 1,
              })
            )
          }
          className="min-h-[42px] rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
        >
          +1 Red Card
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onApply(
              applyFootballAction(details, scoreA, scoreB, {
                type: 'FOUL',
                team,
                delta: 1,
              })
            )
          }
          className="min-h-[42px] rounded-lg bg-orange-100 text-orange-900 text-xs font-semibold hover:bg-orange-200"
        >
          +1 Foul ({(team === 'A' ? details.teamAFouls : details.teamBFouls) || 0})
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onApply(
              applyFootballAction(details, scoreA, scoreB, { type: 'PENALTY', team, delta: 1 })
            )
          }
          className="min-h-[42px] rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
        >
          +1 Shootout Penalty
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderTeam('A', teamA, scoreA)}
        {renderTeam('B', teamB, scoreB)}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Period</label>
          <select
            value={half}
            onChange={(e) => setHalf(e.target.value as FootballDetails['half'])}
            className="min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
          >
            <option value="1st Half">1st Half</option>
            <option value="Half Time">Half Time</option>
            <option value="2nd Half">2nd Half</option>
            <option value="Extra Time">Extra Time</option>
            <option value="Penalties">Penalties</option>
            <option value="Full Time">Full Time</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Clock (MM:SS)</label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={130}
              value={mins}
              onChange={(e) => setMins(e.target.value)}
              className="w-16 min-h-[40px] px-2.5 text-sm font-mono border border-slate-300 rounded-lg"
            />
            <span>:</span>
            <input
              type="number"
              min={0}
              max={59}
              value={secs}
              onChange={(e) => setSecs(e.target.value)}
              className="w-16 min-h-[40px] px-2.5 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Added Mins</label>
          <input
            type="number"
            min={0}
            max={30}
            value={extraMins}
            onChange={(e) => setExtraMins(e.target.value)}
            className="w-20 min-h-[40px] px-2.5 text-sm font-mono border border-slate-300 rounded-lg"
          />
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onApply(
              applyFootballAction(details, scoreA, scoreB, {
                type: 'SET_META',
                half,
                timerMinutes: Number(mins) || 0,
                timerSeconds: Number(secs) || 0,
                extraTimeMinutes: Number(extraMins) || 0,
              })
            )
          }
          className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
        >
          Update Time & Period
        </button>
      </div>
    </div>
  );
}

function VolleyballControls({
  teamA,
  teamB,
  scoreA,
  scoreB,
  details,
  saving,
  locked,
  winnerName,
  resultDescription,
  players,
  onEvent,
  onSaveRules,
  onCompleteMatch,
  onReopenMatch,
}: {
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  details: VolleyballDetails;
  saving: boolean;
  locked: boolean;
  winnerName: string;
  resultDescription: string;
  players: PlayerData[];
  onEvent: (action: VolleyballActionPayload) => Promise<void>;
  onSaveRules: (rules: Partial<VolleyballRules>) => Promise<void>;
  onCompleteMatch: (payload: {
    winnerSide: 'A' | 'B';
    reason?: string;
    winningMargin?: string;
    mvpPlayerId?: string;
    mvpPlayerName?: string;
  }) => Promise<void>;
  onReopenMatch: (reason?: string) => Promise<void>;
}) {
  const eligibility = getVolleyballCompletionEligibility(details);
  const targets = getVolleyballSetTargets(details.currentSet, details.rules);
  const activeSet = details.setScores.find((s) => s.set === details.currentSet);
  const currentSetAwarded = Boolean(activeSet?.winner);

  const [rulesDrawerOpen, setRulesDrawerOpen] = useState(false);
  const [customSetsInput, setCustomSetsInput] = useState(String(details.bestOfSets));
  const [rulesDraft, setRulesDraft] = useState<VolleyballRules>(details.rules);
  const [rulesError, setRulesError] = useState<string | null>(null);

  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [winnerSide, setWinnerSide] = useState<'A' | 'B'>(
    eligibility.thresholdWinnerSide || (details.teamBSetsWon > details.teamASetsWon ? 'B' : 'A')
  );
  const [completeReason, setCompleteReason] = useState('');
  const [mvpPlayerId, setMvpPlayerId] = useState('');
  const [mvpPlayerName, setMvpPlayerName] = useState('');

  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  useEffect(() => {
    setCustomSetsInput(String(details.bestOfSets));
    setRulesDraft(details.rules);
  }, [details.bestOfSets, details.rules]);

  const openCompleteModal = () => {
    setWinnerSide(
      eligibility.thresholdWinnerSide ||
        (details.teamBSetsWon > details.teamASetsWon
          ? 'B'
          : details.teamASetsWon > details.teamBSetsWon
            ? 'A'
            : scoreB > scoreA
              ? 'B'
              : 'A')
    );
    setCompleteReason(
      eligibility.thresholdReached ? 'Winning set threshold reached' : 'Manual official match decision'
    );
    setCompleteModalOpen(true);
  };

  const completedSetsList = details.setScores.filter((s) => s.winner === 'A' || s.winner === 'B');
  const minAllowedBestOf = Math.max(
    1,
    completedSetsList.length,
    completedSetsList.reduce((acc, s) => Math.max(acc, s.set), 0)
  );

  const handleApplyCustomSets = async () => {
    const parsed = Number(customSetsInput);
    const check = validateVolleyballRules({ ...details.rules, bestOfSets: parsed });
    if (!check.valid) {
      setRulesError(check.error || 'Enter a valid odd number between 1 and 15.');
      return;
    }
    if (parsed < minAllowedBestOf) {
      setRulesError(
        `Cannot reduce below Best of ${minAllowedBestOf} because ${completedSetsList.length} set(s) are already completed.`
      );
      return;
    }
    setRulesError(null);
    await onSaveRules({ bestOfSets: parsed });
  };

  const handleSaveRulesDrawer = async () => {
    const check = validateVolleyballRules(rulesDraft);
    if (!check.valid) {
      setRulesError(check.error || 'Invalid Volleyball rules.');
      return;
    }
    if (check.rules.bestOfSets < minAllowedBestOf) {
      setRulesError(
        `Cannot reduce below Best of ${minAllowedBestOf} because ${completedSetsList.length} set(s) are already completed.`
      );
      return;
    }
    setRulesError(null);
    await onSaveRules(check.rules);
    setRulesDrawerOpen(false);
  };

  const advTeamName =
    details.advantageTeam === 'A' ? teamA : details.advantageTeam === 'B' ? teamB : '';

  return (
    <div className="space-y-4">
      {/* Match Completed & Locked Banner */}
      {locked && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-amber-400/30 text-amber-900 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-bold text-slate-900">
                Match Completed &amp; Locked
                {winnerName ? ` · Winner: ${winnerName}` : ''}
              </p>
              <p className="text-xs text-slate-700 font-mono tabular-nums">
                Final Sets: {teamA} {details.teamASetsWon} – {details.teamBSetsWon} {teamB}
                {resultDescription ? ` · ${resultDescription}` : ''}
              </p>
              <p className="text-xs text-slate-600">
                Scoring, set awards, advantage, and rule edits are locked until reopened or undone.
              </p>
            </div>
          </div>
          {details.rules.allowMatchReopen && (
            <button
              type="button"
              disabled={saving}
              onClick={() => setReopenModalOpen(true)}
              className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Resume / Reopen Match</span>
            </button>
          )}
        </div>
      )}

      {/* Winning Threshold Reached Prompt (when active/reopened) */}
      {!locked && eligibility.thresholdReached && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-emerald-950 font-medium">
            Winning threshold reached ({eligibility.winningThreshold} sets won by{' '}
            <span className="font-bold">
              {eligibility.thresholdWinnerSide === 'A' ? teamA : teamB}
            </span>
            ). Complete the match or adjust rules / reopen sets.
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={openCompleteModal}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold whitespace-nowrap shrink-0"
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Complete &amp; Lock Match</span>
          </button>
        </div>
      )}

      {/* Serving, Format Presets & Set Selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500 mr-1">Serving:</span>
            {(['A', 'B'] as const).map((side) => (
              <button
                key={side}
                type="button"
                disabled={saving || locked}
                onClick={() => onEvent({ type: 'SET_SERVING_TEAM', team: side })}
                className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border whitespace-nowrap shrink-0 disabled:opacity-45 ${
                  details.servingTeam === side
                    ? 'bg-amber-400 text-slate-950 border-amber-400'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {side === 'A' ? teamA : teamB}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Format:</span>
            {VOLLEYBALL_SET_PRESETS.map((bo) => (
              <button
                key={bo}
                type="button"
                disabled={saving || locked || bo < minAllowedBestOf}
                onClick={() => onSaveRules({ bestOfSets: bo })}
                className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border whitespace-nowrap shrink-0 disabled:opacity-45 ${
                  details.bestOfSets === bo
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                Best of {bo}
              </button>
            ))}

            <div className="inline-flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={15}
                step={2}
                disabled={saving || locked}
                value={customSetsInput}
                onChange={(e) => setCustomSetsInput(e.target.value)}
                aria-label="Custom total sets"
                className="w-16 min-h-[38px] px-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg disabled:bg-slate-100"
              />
              <button
                type="button"
                disabled={saving || locked}
                onClick={handleApplyCustomSets}
                className="min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 disabled:opacity-45"
              >
                Set Format
              </button>
            </div>

            <button
              type="button"
              disabled={saving || locked}
              onClick={() => setRulesDrawerOpen((v) => !v)}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 disabled:opacity-45"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Match Rules</span>
            </button>
          </div>
        </div>

        {/* Active Set Selector, Advantage Controls & Declare Winner Action */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={details.currentSet}
              disabled={saving || locked}
              aria-label="Active set"
              onChange={(e) =>
                onEvent({
                  type: 'SET_CURRENT_SET',
                  setNumber: Number(e.target.value),
                })
              }
              className="min-h-[38px] px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white disabled:opacity-45"
            >
              {Array.from({ length: details.bestOfSets }, (_, idx) => idx + 1).map((n) => {
                const alreadyExists = details.setScores.some((s) => s.set === n);
                const disabledOption = eligibility.thresholdReached && !alreadyExists;
                return (
                  <option key={n} value={n} disabled={disabledOption}>
                    Set {n} {details.bestOfSets > 1 && n === details.bestOfSets ? '(Decider)' : ''}
                  </option>
                );
              })}
            </select>

            <span className="text-xs text-slate-600 font-mono tabular-nums">
              Target {targets.targetPoints} pts · Min +{targets.requiredMargin}
              {targets.isDecidingSet ? ' · Decider Set' : ''}
            </span>

            {details.isDeuce && !details.advantageTeam && (
              <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-1 rounded">
                DEUCE ({scoreA}-{scoreB})
              </span>
            )}
            {details.advantageTeam && (
              <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-1 rounded">
                ADVANTAGE: {advTeamName}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={saving || locked || currentSetAwarded}
              onClick={() =>
                onEvent({
                  type: 'SET_ADVANTAGE',
                  team: details.advantageTeam === 'A' ? null : 'A',
                })
              }
              className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border whitespace-nowrap shrink-0 disabled:opacity-45 ${
                details.advantageTeam === 'A'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Advantage {teamA}
            </button>
            <button
              type="button"
              disabled={saving || locked || currentSetAwarded}
              onClick={() =>
                onEvent({
                  type: 'SET_ADVANTAGE',
                  team: details.advantageTeam === 'B' ? null : 'B',
                })
              }
              className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border whitespace-nowrap shrink-0 disabled:opacity-45 ${
                details.advantageTeam === 'B'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Advantage {teamB}
            </button>
            {details.advantageTeam && (
              <button
                type="button"
                disabled={saving || locked}
                onClick={() => onEvent({ type: 'SET_ADVANTAGE', team: null })}
                className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 whitespace-nowrap shrink-0 disabled:opacity-45"
              >
                Clear Advantage
              </button>
            )}

            {(details.rules.allowManualWinnerDeclaration || eligibility.thresholdReached) && !locked && (
              <button
                type="button"
                disabled={saving}
                onClick={openCompleteModal}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold whitespace-nowrap shrink-0 disabled:opacity-45"
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>Declare Match Winner / Complete</span>
              </button>
            )}
          </div>
        </div>

        {rulesError && (
          <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {rulesError}
          </p>
        )}

        {/* Expandable Match Rules Drawer */}
        {rulesDrawerOpen && (
          <div className="pt-3 border-t border-slate-200 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Points Per Set
                </label>
                <input
                  type="number"
                  min={5}
                  max={99}
                  value={rulesDraft.pointsPerSet}
                  onChange={(e) =>
                    setRulesDraft((prev) => ({
                      ...prev,
                      pointsPerSet: Math.max(5, Math.min(99, Number(e.target.value) || 25)),
                    }))
                  }
                  className="w-full min-h-[38px] px-2.5 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Min Win Margin
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={rulesDraft.minMargin}
                  onChange={(e) =>
                    setRulesDraft((prev) => ({
                      ...prev,
                      minMargin: Math.max(1, Math.min(10, Number(e.target.value) || 2)),
                    }))
                  }
                  className="w-full min-h-[38px] px-2.5 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Final Set Points
                </label>
                <input
                  type="number"
                  min={5}
                  max={99}
                  value={rulesDraft.finalSetPoints}
                  onChange={(e) =>
                    setRulesDraft((prev) => ({
                      ...prev,
                      finalSetPoints: Math.max(5, Math.min(99, Number(e.target.value) || 15)),
                    }))
                  }
                  className="w-full min-h-[38px] px-2.5 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Final Set Min Margin
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={rulesDraft.finalSetMinMargin}
                  onChange={(e) =>
                    setRulesDraft((prev) => ({
                      ...prev,
                      finalSetMinMargin: Math.max(1, Math.min(10, Number(e.target.value) || 2)),
                    }))
                  }
                  className="w-full min-h-[38px] px-2.5 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rulesDraft.autoCompleteSets}
                    onChange={(e) =>
                      setRulesDraft((prev) => ({ ...prev, autoCompleteSets: e.target.checked }))
                    }
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <span>Auto-complete set on target + margin</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rulesDraft.allowManualWinnerDeclaration}
                    onChange={(e) =>
                      setRulesDraft((prev) => ({
                        ...prev,
                        allowManualWinnerDeclaration: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <span>Allow manual winner anytime</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rulesDraft.allowMatchReopen}
                    onChange={(e) =>
                      setRulesDraft((prev) => ({ ...prev, allowMatchReopen: e.target.checked }))
                    }
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <span>Allow reopen completed match</span>
                </label>
                <button
                  type="button"
                  disabled={saving || locked}
                  onClick={() =>
                    onEvent({
                      type: 'SET_CUSTOM_MULTI_POINT',
                      enabled: !details.allowCustomMultiPoint,
                    })
                  }
                  className={`min-h-[34px] px-2.5 py-1 text-xs font-semibold rounded-lg border whitespace-nowrap ${
                    details.allowCustomMultiPoint
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {details.allowCustomMultiPoint ? 'Multi-Point Unlocked' : 'Unlock Multi-Point'}
                </button>
              </div>

              <button
                type="button"
                disabled={saving || locked}
                onClick={handleSaveRulesDrawer}
                className="min-h-[38px] px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                Save Match Rules
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Team Scoring Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { team: 'A' as const, name: teamA, pts: scoreA, setsWon: details.teamASetsWon },
          { team: 'B' as const, name: teamB, pts: scoreB, setsWon: details.teamBSetsWon },
        ].map((side) => {
          const hasAdvantage = details.advantageTeam === side.team;
          const awardSetDisabled =
            saving || locked || eligibility.thresholdReached || currentSetAwarded;
          return (
            <div
              key={side.team}
              className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <h4 className="font-semibold text-slate-900 truncate">{side.name}</h4>
                  {details.servingTeam === side.team && !locked && (
                    <span className="text-[11px] font-semibold text-amber-700 shrink-0">
                      · Serving
                    </span>
                  )}
                  {hasAdvantage && !locked && (
                    <span className="text-[11px] font-bold text-emerald-700 shrink-0">
                      · ADVANTAGE
                    </span>
                  )}
                </div>
                <span className="font-mono text-base font-bold tabular-nums shrink-0 text-slate-900">
                  Sets {side.setsWon}/{details.winningThreshold} · Pts {side.pts}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={saving || locked || currentSetAwarded}
                  onClick={() => onEvent({ type: 'POINT', team: side.team, delta: 1 })}
                  className="min-h-[48px] rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
                >
                  +1 Point
                </button>
                <button
                  type="button"
                  disabled={saving || locked || side.pts <= 0 || currentSetAwarded}
                  onClick={() => onEvent({ type: 'POINT', team: side.team, delta: -1 })}
                  className="min-h-[48px] rounded-lg bg-slate-100 text-slate-800 text-sm font-semibold hover:bg-slate-200 disabled:opacity-40 whitespace-nowrap"
                >
                  -1 Point
                </button>
                <button
                  type="button"
                  disabled={awardSetDisabled}
                  title={
                    eligibility.thresholdReached
                      ? `Winning threshold (${details.winningThreshold} sets) already reached`
                      : currentSetAwarded
                        ? `Set ${details.currentSet} already awarded`
                        : undefined
                  }
                  onClick={() => onEvent({ type: 'COMPLETE_SET', winner: side.team })}
                  className="col-span-2 min-h-[44px] rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-40 whitespace-nowrap"
                >
                  {currentSetAwarded
                    ? `Set ${details.currentSet} Won by ${activeSet?.winner === 'A' ? teamA : teamB}`
                    : `Award Set ${details.currentSet} to ${side.name}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Set Breakdown Strip */}
      {details.setScores.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums text-slate-700">
          <span className="font-sans font-semibold text-slate-500">
            Sets (Best of {details.bestOfSets} · First to {details.winningThreshold}):
          </span>
          {details.setScores.map((s) => (
            <span
              key={s.set}
              className={`px-2 py-1 rounded border ${
                s.set === details.currentSet
                  ? 'border-slate-900 bg-slate-900 text-white font-semibold'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              S{s.set}: {s.teamA}-{s.teamB}
              {s.winner ? ` (${s.winner === 'A' ? teamA : teamB})` : ''}
            </span>
          ))}
        </div>
      )}

      {/* Manual Winner Declaration & Match Completion Modal */}
      <Modal
        open={completeModalOpen}
        onClose={() => setCompleteModalOpen(false)}
        title="Declare Match Winner & Complete Match"
        maxWidthClass="max-w-lg"
        zIndexClass="z-[110]"
      >
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
            <p className="font-semibold text-slate-900">
              {teamA} vs {teamB} · Best of {details.bestOfSets}
            </p>
            <p className="font-mono tabular-nums text-slate-600">
              Current Sets: {details.teamASetsWon} - {details.teamBSetsWon} · Set {details.currentSet}{' '}
              Points: {scoreA} - {scoreB}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Select Official Match Winner
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {(['A', 'B'] as const).map((side) => {
                const label = side === 'A' ? teamA : teamB;
                const sets = side === 'A' ? details.teamASetsWon : details.teamBSetsWon;
                return (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setWinnerSide(side)}
                    className={`min-h-[48px] px-3 py-2 rounded-lg border text-left transition-colors ${
                      winnerSide === side
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-bold truncate">{label}</div>
                    <div className="text-[11px] font-mono tabular-nums opacity-80">
                      Sets Won: {sets}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Decision Reason / Margin (Optional)
            </label>
            <input
              type="text"
              value={completeReason}
              onChange={(e) => setCompleteReason(e.target.value)}
              placeholder="e.g. Threshold reached, Opponent forfeit, Retired"
              className="w-full min-h-[40px] px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Player of the Match (Optional)
            </label>
            <div className="flex gap-2">
              {players.length > 0 && (
                <select
                  value={mvpPlayerId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    setMvpPlayerId(pid);
                    const found = players.find((p) => (p.id || p._id) === pid);
                    if (found) setMvpPlayerName(found.name);
                  }}
                  className="w-1/2 min-h-[40px] px-2.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">-- Roster --</option>
                  {players.map((p) => (
                    <option key={p.id || p._id} value={p.id || p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              <input
                type="text"
                value={mvpPlayerName}
                onChange={(e) => setMvpPlayerName(e.target.value)}
                placeholder="MVP player name"
                className="flex-1 min-h-[40px] px-3 text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Completing the match preserves the real set scores and points without fabricating
            unplayed set wins. All Volleyball scoring and rule controls will lock immediately until
            reopened or undone.
          </p>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={saving}
              onClick={() => setCompleteModalOpen(false)}
              className="min-h-[42px] px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                await onCompleteMatch({
                  winnerSide,
                  reason: completeReason.trim() || undefined,
                  mvpPlayerId: mvpPlayerId || undefined,
                  mvpPlayerName: mvpPlayerName.trim() || undefined,
                });
                setCompleteModalOpen(false);
              }}
              className="min-h-[42px] px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg whitespace-nowrap"
            >
              {saving
                ? 'Completing...'
                : `Confirm Winner: ${winnerSide === 'A' ? teamA : teamB}`}
            </button>
          </div>
        </div>
      </Modal>

      {/* Reopen / Resume Completed Match Modal */}
      <Modal
        open={reopenModalOpen}
        onClose={() => setReopenModalOpen(false)}
        title="Resume / Reopen Completed Match"
        maxWidthClass="max-w-md"
        zIndexClass="z-[110]"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            Reopening returns this Volleyball match to active Live status and unlocks score, set,
            advantage, and rule controls. All existing set scores ({details.teamASetsWon}-
            {details.teamBSetsWon}) and points ({scoreA}-{scoreB}) are preserved cleanly.
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Reopen Reason (Optional Audit Note)
            </label>
            <input
              type="text"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="e.g. Correcting final set score or resuming play"
              className="w-full min-h-[40px] px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setReopenModalOpen(false)}
              className="min-h-[42px] px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                await onReopenMatch(reopenReason.trim() || undefined);
                setReopenModalOpen(false);
                setReopenReason('');
              }}
              className="min-h-[42px] px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap"
            >
              {saving ? 'Reopening...' : 'Yes, Resume Match'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function OtherSportControls({
  teamA,
  teamB,
  scoreA,
  scoreB,
  details,
  saving,
  onCommit,
}: {
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  details: Record<string, any>;
  saving: boolean;
  onCommit: (payload: any) => void;
}) {
  const [valA, setValA] = useState(String(scoreA));
  const [valB, setValB] = useState(String(scoreB));
  const [periodLabel, setPeriodLabel] = useState(String(details.periodLabel || ''));
  const [notes, setNotes] = useState(String(details.notes || ''));

  useEffect(() => {
    setValA(String(scoreA));
    setValB(String(scoreB));
    setPeriodLabel(String(details.periodLabel || ''));
    setNotes(String(details.notes || ''));
  }, [scoreA, scoreB, details.periodLabel, details.notes]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">{teamA}</span>
            <span className="font-mono text-xl font-bold tabular-nums">{scoreA}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 5].map((inc) => (
              <button
                key={inc}
                type="button"
                disabled={saving}
                onClick={() =>
                  onCommit({
                    teamAScore: scoreA + inc,
                    action: `${teamA} +${inc}`,
                  })
                }
                className="min-h-[44px] flex-1 px-3 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
              >
                +{inc}
              </button>
            ))}
            <button
              type="button"
              disabled={saving || scoreA <= 0}
              onClick={() =>
                onCommit({
                  teamAScore: Math.max(0, scoreA - 1),
                  action: `${teamA} -1`,
                })
              }
              className="min-h-[44px] px-4 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-semibold"
            >
              -1
            </button>
          </div>
        </div>

        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">{teamB}</span>
            <span className="font-mono text-xl font-bold tabular-nums">{scoreB}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 5].map((inc) => (
              <button
                key={inc}
                type="button"
                disabled={saving}
                onClick={() =>
                  onCommit({
                    teamBScore: scoreB + inc,
                    action: `${teamB} +${inc}`,
                  })
                }
                className="min-h-[44px] flex-1 px-3 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
              >
                +{inc}
              </button>
            ))}
            <button
              type="button"
              disabled={saving || scoreB <= 0}
              onClick={() =>
                onCommit({
                  teamBScore: Math.max(0, scoreB - 1),
                  action: `${teamB} -1`,
                })
              }
              className="min-h-[44px] px-4 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-semibold"
            >
              -1
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{teamA} Score</label>
          <input
            type="number"
            min={0}
            value={valA}
            onChange={(e) => setValA(e.target.value)}
            className="w-full min-h-[40px] px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{teamB} Score</label>
          <input
            type="number"
            min={0}
            value={valB}
            onChange={(e) => setValB(e.target.value)}
            className="w-full min-h-[40px] px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Period / Round</label>
          <input
            type="text"
            value={periodLabel}
            onChange={(e) => setPeriodLabel(e.target.value)}
            placeholder="e.g. Round 2"
            className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              onCommit({
                teamAScore: Math.max(0, Number(valA) || 0),
                teamBScore: Math.max(0, Number(valB) || 0),
                sportSpecificDetails: { periodLabel, notes },
                action: `Manual score update (${Number(valA) || 0} - ${Number(valB) || 0})`,
              })
            }
            className="w-full min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
          >
            Apply Manual Score
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Scoreboard Notes</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional match commentary or note"
          className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
        />
      </div>
    </div>
  );
}
