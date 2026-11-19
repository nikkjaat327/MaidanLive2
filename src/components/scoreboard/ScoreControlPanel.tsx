import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertTriangle,
  CloudOff,
  Edit3,
  MessageSquarePlus,
  RefreshCw,
  RotateCcw,
  Send,
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
  createInitialCricketDetails,
} from '../../utils/cricketScoring.ts';
import {
  KabaddiDetails,
  applyKabaddiAction,
  createInitialKabaddiDetails,
} from '../../utils/kabaddiScoring.ts';
import {
  FootballDetails,
  applyFootballAction,
  createInitialFootballDetails,
} from '../../utils/footballScoring.ts';
import {
  VolleyballDetails,
  applyVolleyballAction,
  createInitialVolleyballDetails,
} from '../../utils/volleyballScoring.ts';
import { getInitialSportDetails } from '../../utils/scoringEngine.ts';

interface ScoreControlPanelProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  history: ScoreHistoryItem[];
  players?: PlayerData[];
  highlights?: MatchHighlightData[];
  playerStats?: PlayerMatchStatRecord[];
  onScoreChange: (score: LiveScoreData) => void;
  onRefreshHistory: () => void;
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
    (h) => !h.entryType || h.entryType === 'SCORE_UPDATE'
  ).length;
  const resultDeclared = Boolean(score?.resultStatus && score.resultStatus !== 'NOT_DECLARED');

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
    try {
      setSaving(true);
      setError(null);
      const result = await offlineScoreService.submitScorePatch(stream.id, payload, score);
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
        onRefreshHistory();
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
      setError(extractApiError(err, 'Failed to update score.'));
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
    try {
      setSaving(true);
      setError(null);
      const result = await offlineScoreService.submitScoreEvent(stream.id, payload, score);
      if (result.queued) {
        setSuccessMsg(
          'Scoring event cached in IndexedDB — will sync automatically upon reconnection.'
        );
        return;
      }

      if (result.score) {
        onScoreChange(result.score);
      }
      onRefreshHistory();
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
      setError(extractApiError(err, 'Failed to record scoring event.'));
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
    try {
      setSaving(true);
      setError(null);
      const res = await scoreboardService.undoScore(stream.id);
      onScoreChange(res.score);
      onRefreshHistory();
      setUndoOpen(false);
      setSuccessMsg(`Undid: ${res.undoneAction}`);
    } catch (err) {
      setError(extractApiError(err, 'Unable to undo score update.'));
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
                disabled={saving}
                onChange={(e) => handleSportChange(e.target.value as SportOption)}
                className="min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
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
                  disabled={saving}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setMatchStatusInput(e.target.value);
                    commitUpdate({
                      matchStatus: e.target.value,
                      action: `Match status: ${e.target.value}`,
                    });
                  }}
                  aria-label="Standardized match status preset"
                  className="min-h-[42px] px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
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
                  onChange={(e) => setMatchStatusInput(e.target.value)}
                  placeholder="e.g. Live, Half Time"
                  className="min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg w-36 sm:w-44 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    commitUpdate({
                      matchStatus: matchStatusInput.trim() || 'Live',
                      action: `Match status: ${matchStatusInput.trim() || 'Live'}`,
                    })
                  }
                  className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
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
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-wide uppercase text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 whitespace-nowrap"
            >
              <Trophy className="w-4 h-4" />
              <span>{resultDeclared ? 'Correct Result' : 'Declare Match Result'}</span>
            </button>
            <button
              type="button"
              disabled={saving || scoreUpdateCount === 0}
              onClick={() => setUndoOpen(true)}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
            >
              <Undo2 className="w-4 h-4" />
              <span>Undo Last</span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setResetOpen(true)}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 whitespace-nowrap"
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

      {/* Advanced Multi-Point & Structured Scorer */}
      <AdvancedEventComposer
        stream={stream}
        score={score}
        players={players}
        saving={saving}
        onSubmitEvent={handleSubmitStructuredEvent}
      />

      {/* Sport-specific interactive touch controls */}
      {sport === 'Cricket' && (
        <CricketControls
          teamA={teamA}
          teamB={teamB}
          details={{
            ...createInitialCricketDetails(),
            ...((score?.sportSpecificDetails || {}) as Partial<CricketDetails>),
          }}
          saving={saving}
          onApply={(next) =>
            commitUpdate({
              teamAScore: next.teamAScore,
              teamBScore: next.teamBScore,
              sportSpecificDetails: next.details as unknown as Record<string, unknown>,
              tossWinner: next.details.tossWinner,
              tossDecision: next.details.tossDecision,
              action: next.label,
            })
          }
        />
      )}

      {sport === 'Kabaddi' && (
        <KabaddiControls
          teamA={teamA}
          teamB={teamB}
          scoreA={score?.teamAScore ?? 0}
          scoreB={score?.teamBScore ?? 0}
          details={{
            ...createInitialKabaddiDetails(),
            ...((score?.sportSpecificDetails || {}) as Partial<KabaddiDetails>),
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
          details={{
            ...createInitialVolleyballDetails(),
            ...((score?.sportSpecificDetails || {}) as Partial<VolleyballDetails>),
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
              return (
                <div
                  key={item._id}
                  className={`px-4 py-2.5 flex items-center justify-between gap-3 text-xs ${
                    isCommentary ? 'bg-emerald-50/40' : isResult ? 'bg-amber-50/50' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 break-words">
                      {isCommentary && (
                        <span className="font-semibold text-emerald-700 mr-1.5">[Commentary]</span>
                      )}
                      {isResult && (
                        <span className="font-semibold text-amber-800 mr-1.5">[Result]</span>
                      )}
                      {item.action}
                    </p>
                    <p className="text-slate-500 mt-0.5">
                      {actorName} · {new Date(item.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono tabular-nums font-semibold text-slate-700">
                      {item.updatedScore?.teamAScore ?? 0} - {item.updatedScore?.teamBScore ?? 0}
                    </span>
                    {(!item.entryType || item.entryType === 'SCORE_UPDATE') && !item.reverted && (
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

function CricketControls({
  teamA,
  teamB,
  details,
  saving,
  onApply,
}: {
  teamA: string;
  teamB: string;
  details: CricketDetails;
  saving: boolean;
  onApply: (res: ReturnType<typeof applyCricketAction>) => void;
}) {
  const [batsman1, setBatsman1] = useState(details.batsman1 || '');
  const [batsman2, setBatsman2] = useState(details.batsman2 || '');
  const [bowler, setBowler] = useState(details.bowler || '');
  const [target, setTarget] = useState(String(details.target || 0));
  const [oversLimit, setOversLimit] = useState(String(details.oversLimit || 20));
  const [shortA, setShortA] = useState(details.teamAShortName || '');
  const [shortB, setShortB] = useState(details.teamBShortName || '');
  const [tossWinner, setTossWinner] = useState<'A' | 'B' | ''>(details.tossWinner || '');
  const [tossDecision, setTossDecision] = useState<'BAT' | 'BOWL' | ''>(details.tossDecision || '');
  const [isSuperOver, setIsSuperOver] = useState(Boolean(details.isSuperOver));
  const [soRunsA, setSoRunsA] = useState(String(details.superOverTeamARuns || 0));
  const [soWktsA, setSoWktsA] = useState(String(details.superOverTeamAWickets || 0));
  const [soRunsB, setSoRunsB] = useState(String(details.superOverTeamBRuns || 0));
  const [soWktsB, setSoWktsB] = useState(String(details.superOverTeamBWickets || 0));

  useEffect(() => {
    setBatsman1(details.batsman1 || '');
    setBatsman2(details.batsman2 || '');
    setBowler(details.bowler || '');
    setTarget(String(details.target || 0));
    setOversLimit(String(details.oversLimit || 20));
    setShortA(details.teamAShortName || '');
    setShortB(details.teamBShortName || '');
    setTossWinner(details.tossWinner || '');
    setTossDecision(details.tossDecision || '');
    setIsSuperOver(Boolean(details.isSuperOver));
    setSoRunsA(String(details.superOverTeamARuns || 0));
    setSoWktsA(String(details.superOverTeamAWickets || 0));
    setSoRunsB(String(details.superOverTeamBRuns || 0));
    setSoWktsB(String(details.superOverTeamBWickets || 0));
  }, [
    details.batsman1,
    details.batsman2,
    details.bowler,
    details.target,
    details.oversLimit,
    details.teamAShortName,
    details.teamBShortName,
    details.tossWinner,
    details.tossDecision,
    details.isSuperOver,
    details.superOverTeamARuns,
    details.superOverTeamAWickets,
    details.superOverTeamBRuns,
    details.superOverTeamBWickets,
  ]);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-500">Active Batting Side & Innings</p>
            <p className="text-sm font-semibold text-slate-900 mt-0.5">
              {details.battingTeam === 'A' ? teamA : teamB} · Innings {details.innings}
              {details.isSuperOver ? ' · Super Over Active' : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                onApply(
                  applyCricketAction(details, {
                    type: 'SWITCH_INNINGS',
                    battingTeam: 'A',
                    innings: details.innings,
                  })
                )
              }
              className={`min-h-[42px] px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                details.battingTeam === 'A'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {teamA} Batting
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                onApply(
                  applyCricketAction(details, {
                    type: 'SWITCH_INNINGS',
                    battingTeam: 'B',
                    innings: details.innings,
                  })
                )
              }
              className={`min-h-[42px] px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                details.battingTeam === 'B'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {teamB} Batting
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                onApply(
                  applyCricketAction(details, {
                    type: 'SWITCH_INNINGS',
                    battingTeam: details.battingTeam === 'A' ? 'B' : 'A',
                    innings: details.innings === 1 ? 2 : 1,
                    setTargetFromFirstInnings: details.innings === 1,
                  })
                )
              }
              className="min-h-[42px] px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {details.innings === 1 ? 'Start 2nd Innings & Set Target' : 'Switch to 1st Innings'}
            </button>
          </div>
        </div>

        {/* Runs & Legal Balls */}
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Scoring Runs (Legal Delivery)</p>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2.5">
            {[0, 1, 2, 3, 4, 5, 6].map((runs) => (
              <button
                key={runs}
                type="button"
                disabled={saving}
                onClick={() => onApply(applyCricketAction(details, { type: 'RUNS', runs }))}
                className={`min-h-[50px] rounded-xl font-mono text-base font-bold border transition-colors active:scale-[0.98] ${
                  runs === 4 || runs === 6
                    ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                    : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                }`}
              >
                {runs === 0 ? 'Dot (0)' : `+${runs}`}
              </button>
            ))}
          </div>
        </div>

        {/* Extras, Wicket & Over Flow */}
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Extras, Wickets &amp; Over Control</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            <button
              type="button"
              disabled={saving}
              onClick={() => onApply(applyCricketAction(details, { type: 'WIDE', extraRuns: 0 }))}
              className="min-h-[48px] px-3 rounded-xl text-sm font-semibold bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100"
            >
              Wide (+1)
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onApply(applyCricketAction(details, { type: 'NO_BALL', extraRuns: 0 }))}
              className="min-h-[48px] px-3 rounded-xl text-sm font-semibold bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100"
            >
              No Ball (+1)
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onApply(applyCricketAction(details, { type: 'BYE', runs: 1 }))}
              className="min-h-[48px] px-3 rounded-xl text-sm font-semibold bg-slate-100 text-slate-800 border border-slate-200 hover:bg-slate-200"
            >
              Bye (+1)
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onApply(applyCricketAction(details, { type: 'LEG_BYE', runs: 1 }))}
              className="min-h-[48px] px-3 rounded-xl text-sm font-semibold bg-slate-100 text-slate-800 border border-slate-200 hover:bg-slate-200"
            >
              Leg Bye (+1)
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onApply(applyCricketAction(details, { type: 'WICKET' }))}
              className="min-h-[48px] px-3 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700"
            >
              Wicket
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onApply(applyCricketAction(details, { type: 'CHANGE_STRIKER' }))}
              className="min-h-[48px] px-3 rounded-xl text-xs font-semibold bg-white text-slate-800 border border-slate-300 hover:bg-slate-50"
            >
              Swap Striker
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onApply(applyCricketAction(details, { type: 'END_OVER' }))}
              className="min-h-[48px] px-3 rounded-xl text-xs font-semibold bg-slate-800 text-white hover:bg-slate-700"
            >
              End Over
            </button>
          </div>
        </div>

        {/* Active Batters / Bowler / Target / Short Codes */}
        <div className="pt-3 border-t border-slate-200 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Batsman 1</label>
              <input
                type="text"
                value={batsman1}
                onChange={(e) => setBatsman1(e.target.value)}
                placeholder="Striker name"
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Batsman 2</label>
              <input
                type="text"
                value={batsman2}
                onChange={(e) => setBatsman2(e.target.value)}
                placeholder="Non-striker"
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Bowler</label>
              <input
                type="text"
                value={bowler}
                onChange={(e) => setBowler(e.target.value)}
                placeholder="Current bowler"
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Target / Overs</label>
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
                  type="number"
                  min={1}
                  value={oversLimit}
                  onChange={(e) => setOversLimit(e.target.value)}
                  aria-label="Overs limit"
                  className="w-1/2 min-h-[40px] px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">TV Short Codes</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={shortA}
                  onChange={(e) => setShortA(e.target.value.toUpperCase())}
                  placeholder="TMA"
                  aria-label="Team A Short Code"
                  className="w-1/2 min-h-[40px] px-2.5 py-1.5 text-xs font-mono uppercase border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  maxLength={6}
                  value={shortB}
                  onChange={(e) => setShortB(e.target.value.toUpperCase())}
                  placeholder="TMB"
                  aria-label="Team B Short Code"
                  className="w-1/2 min-h-[40px] px-2.5 py-1.5 text-xs font-mono uppercase border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  onApply(
                    applyCricketAction(details, {
                      type: 'UPDATE_META',
                      batsman1,
                      batsman2,
                      bowler,
                      target: Number(target) || 0,
                      oversLimit: Number(oversLimit) || 20,
                      teamAShortName: shortA,
                      teamBShortName: shortB,
                      tossWinner,
                      tossDecision,
                      isSuperOver,
                      superOverTeamARuns: Number(soRunsA) || 0,
                      superOverTeamAWickets: Number(soWktsA) || 0,
                      superOverTeamBRuns: Number(soRunsB) || 0,
                      superOverTeamBWickets: Number(soWktsB) || 0,
                    })
                  )
                }
                className="w-full min-h-[40px] px-3 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                Update Details
              </button>
            </div>
          </div>

          {/* Toss Tracking */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
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
                <option value="">-- Select Decision --</option>
                <option value="BAT">Elected to Bat</option>
                <option value="BOWL">Elected to Bowl / Field</option>
              </select>
            </div>
          </div>

          {/* Super Over Controls */}
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={isSuperOver}
                onChange={(e) => setIsSuperOver(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
              />
              <span>Enable Super Over Tie-Breaker</span>
            </label>
            {isSuperOver && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">{teamA} SO Runs</label>
                  <input
                    type="number"
                    min={0}
                    value={soRunsA}
                    onChange={(e) => setSoRunsA(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">{teamA} SO Wkts</label>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    value={soWktsA}
                    onChange={(e) => setSoWktsA(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">{teamB} SO Runs</label>
                  <input
                    type="number"
                    min={0}
                    value={soRunsB}
                    onChange={(e) => setSoRunsB(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">{teamB} SO Wkts</label>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    value={soWktsB}
                    onChange={(e) => setSoWktsB(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KabaddiControls({
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
  details: KabaddiDetails;
  saving: boolean;
  onApply: (res: ReturnType<typeof applyKabaddiAction>) => void;
}) {
  const [half, setHalf] = useState<KabaddiDetails['half']>(details.half);
  const [mins, setMins] = useState(String(details.timerMinutes));
  const [secs, setSecs] = useState(String(details.timerSeconds));
  const [superRaidNote, setSuperRaidNote] = useState(details.superRaidNote || '');
  const [isTieBreaker, setIsTieBreaker] = useState(Boolean(details.isTieBreaker));
  const [tbA, setTbA] = useState(String(details.tieBreakerScoreA || 0));
  const [tbB, setTbB] = useState(String(details.tieBreakerScoreB || 0));

  useEffect(() => {
    setHalf(details.half);
    setMins(String(details.timerMinutes));
    setSecs(String(details.timerSeconds));
    setSuperRaidNote(details.superRaidNote || '');
    setIsTieBreaker(Boolean(details.isTieBreaker));
    setTbA(String(details.tieBreakerScoreA || 0));
    setTbB(String(details.tieBreakerScoreB || 0));
  }, [
    details.half,
    details.timerMinutes,
    details.timerSeconds,
    details.superRaidNote,
    details.isTieBreaker,
    details.tieBreakerScoreA,
    details.tieBreakerScoreB,
  ]);

  const renderTeamButtons = (team: 'A' | 'B', name: string) => (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-slate-900">{name}</h4>
        <span className="font-mono text-lg font-bold tabular-nums">
          {team === 'A' ? scoreA : scoreB}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onApply(
              applyKabaddiAction(details, scoreA, scoreB, {
                type: 'ADD_POINTS',
                team,
                category: 'raidPoints',
                points: 1,
              })
            )
          }
          className="min-h-[44px] px-3 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
        >
          +1 Raid
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onApply(
              applyKabaddiAction(details, scoreA, scoreB, {
                type: 'ADD_POINTS',
                team,
                category: 'tacklePoints',
                points: 1,
              })
            )
          }
          className="min-h-[44px] px-3 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
        >
          +1 Tackle
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onApply(
              applyKabaddiAction(details, scoreA, scoreB, {
                type: 'ADD_POINTS',
                team,
                category: 'bonusPoints',
                points: 1,
              })
            )
          }
          className="min-h-[44px] px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
        >
          +1 Bonus
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onApply(
              applyKabaddiAction(details, scoreA, scoreB, {
                type: 'ADD_POINTS',
                team,
                category: 'superTackles',
                points: 2,
              })
            )
          }
          className="min-h-[44px] px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
        >
          Super Tackle (+2)
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onApply(
              applyKabaddiAction(details, scoreA, scoreB, {
                type: 'ADD_POINTS',
                team,
                category: 'superRaids',
                points: 3,
                note: `${name} Super Raid (+3)!`,
              })
            )
          }
          className="min-h-[44px] px-3 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700"
        >
          Super Raid (+3)
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onApply(
              applyKabaddiAction(details, scoreA, scoreB, {
                type: 'ADD_POINTS',
                team,
                category: 'allOutPoints',
                points: 2,
              })
            )
          }
          className="min-h-[44px] px-3 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700"
        >
          All-Out (+2)
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderTeamButtons('A', teamA)}
        {renderTeamButtons('B', teamB)}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Half / Stage</label>
            <select
              value={half}
              onChange={(e) => setHalf(e.target.value as KabaddiDetails['half'])}
              className="min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
            >
              <option value="1st Half">1st Half</option>
              <option value="Half Time">Half Time</option>
              <option value="2nd Half">2nd Half</option>
              <option value="Extra Time">Extra Time</option>
              <option value="Tie-Breaker">Tie-Breaker</option>
              <option value="Full Time">Full Time</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Timer (MM:SS)</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={99}
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
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Super Raid Callout</label>
            <input
              type="text"
              value={superRaidNote}
              onChange={(e) => setSuperRaidNote(e.target.value)}
              placeholder="Optional Super Raid info (clear to hide)"
              className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              onApply(
                applyKabaddiAction(details, scoreA, scoreB, {
                  type: 'SET_META',
                  half,
                  timerMinutes: Number(mins) || 0,
                  timerSeconds: Number(secs) || 0,
                  superRaidNote: superRaidNote.trim(),
                  isTieBreaker,
                  tieBreakerScoreA: Number(tbA) || 0,
                  tieBreakerScoreB: Number(tbB) || 0,
                })
              )
            }
            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
          >
            Update Clock &amp; Details
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={isTieBreaker}
              onChange={(e) => setIsTieBreaker(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
            />
            <span>Tie-Breaker Active</span>
          </label>
          {isTieBreaker && (
            <div className="flex items-center gap-2 text-xs">
              <span>{teamA}:</span>
              <input
                type="number"
                min={0}
                value={tbA}
                onChange={(e) => setTbA(e.target.value)}
                className="w-16 min-h-[36px] px-2 font-mono border border-slate-300 rounded-lg"
              />
              <span>{teamB}:</span>
              <input
                type="number"
                min={0}
                value={tbB}
                onChange={(e) => setTbB(e.target.value)}
                className="w-16 min-h-[36px] px-2 font-mono border border-slate-300 rounded-lg"
              />
            </div>
          )}
        </div>
      </div>
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
              applyFootballAction(details, scoreA, scoreB, { type: 'PENALTY', team, delta: 1 })
            )
          }
          className="col-span-2 min-h-[42px] rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
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
  onApply,
}: {
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  details: VolleyballDetails;
  saving: boolean;
  onApply: (res: ReturnType<typeof applyVolleyballAction>) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Serving Team, Match Format & Set Selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 mr-1">Serving:</span>
          {(['A', 'B'] as const).map((side) => (
            <button
              key={side}
              type="button"
              disabled={saving}
              onClick={() =>
                onApply(
                  applyVolleyballAction(details, scoreA, scoreB, {
                    type: 'SET_SERVING_TEAM',
                    team: side,
                  })
                )
              }
              className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border ${
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
          {([3, 5] as const).map((bo) => (
            <button
              key={bo}
              type="button"
              disabled={saving}
              onClick={() =>
                onApply(
                  applyVolleyballAction(details, scoreA, scoreB, {
                    type: 'SET_BEST_OF',
                    bestOfSets: bo,
                  })
                )
              }
              className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                details.bestOfSets === bo
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Best of {bo}
            </button>
          ))}
          <select
            value={details.currentSet}
            disabled={saving}
            aria-label="Active set"
            onChange={(e) =>
              onApply(
                applyVolleyballAction(details, scoreA, scoreB, {
                  type: 'SET_CURRENT_SET',
                  setNumber: Number(e.target.value),
                })
              )
            }
            className="min-h-[38px] px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white"
          >
            {Array.from({ length: details.bestOfSets || 5 }, (_, idx) => idx + 1).map((n) => (
              <option key={n} value={n}>
                Set {n} {n === details.bestOfSets ? '(Decider)' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              onApply(
                applyVolleyballAction(details, scoreA, scoreB, {
                  type: 'SET_CUSTOM_MULTI_POINT',
                  enabled: !details.allowCustomMultiPoint,
                })
              )
            }
            className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border ${
              details.allowCustomMultiPoint
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {details.allowCustomMultiPoint ? 'Multi-Point Unlocked' : 'Unlock Multi-Point'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { team: 'A' as const, name: teamA, pts: scoreA, setsWon: details.teamASetsWon },
          { team: 'B' as const, name: teamB, pts: scoreB, setsWon: details.teamBSetsWon },
        ].map((side) => (
          <div
            key={side.team}
            className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <h4 className="font-semibold text-slate-900 truncate">{side.name}</h4>
                {details.servingTeam === side.team && (
                  <span className="text-[11px] font-semibold text-amber-700">· Serving</span>
                )}
              </div>
              <span className="font-mono text-lg font-bold tabular-nums shrink-0">
                Sets {side.setsWon} · Pts {side.pts}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  onApply(
                    applyVolleyballAction(details, scoreA, scoreB, {
                      type: 'POINT',
                      team: side.team,
                      delta: 1,
                    })
                  )
                }
                className="min-h-[48px] rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
              >
                +1 Point
              </button>
              <button
                type="button"
                disabled={saving || side.pts <= 0}
                onClick={() =>
                  onApply(
                    applyVolleyballAction(details, scoreA, scoreB, {
                      type: 'POINT',
                      team: side.team,
                      delta: -1,
                    })
                  )
                }
                className="min-h-[48px] rounded-lg bg-slate-100 text-slate-800 text-sm font-semibold hover:bg-slate-200 disabled:opacity-40"
              >
                -1 Point
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  onApply(
                    applyVolleyballAction(details, scoreA, scoreB, {
                      type: 'COMPLETE_SET',
                      winner: side.team,
                    })
                  )
                }
                className="col-span-2 min-h-[44px] rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
              >
                Award Set {details.currentSet} to {side.name}
              </button>
            </div>
          </div>
        ))}
      </div>
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
