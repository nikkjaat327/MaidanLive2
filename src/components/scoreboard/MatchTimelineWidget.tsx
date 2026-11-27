import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Clock, Flame, ShieldAlert, Zap } from 'lucide-react';
import { ScoreHistoryItem } from '../../types/index.ts';
import { scoreboardService } from '../../services/scoreboard/scoreboardService.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import {
  classifyMajorTimelineEvent,
  extractMajorTimelineEvents,
  type MajorTimelineEvent,
  type MajorTimelineEventKind,
} from '../../utils/matchTimeline.ts';

export { classifyMajorTimelineEvent, extractMajorTimelineEvents };
export type { MajorTimelineEvent, MajorTimelineEventKind };

export interface MatchTimelineWidgetProps {
  matchId: string;
  history?: ScoreHistoryItem[];
  teamAName?: string;
  teamBName?: string;
  className?: string;
}

export function MatchTimelineWidget({
  matchId,
  history: externalHistory,
  teamAName = 'Team A',
  teamBName = 'Team B',
  className = '',
}: MatchTimelineWidgetProps) {
  const [localHistory, setLocalHistory] = useState<ScoreHistoryItem[]>(externalHistory || []);
  const [loading, setLoading] = useState<boolean>(externalHistory === undefined && Boolean(matchId));
  const [pulseTopId, setPulseTopId] = useState<string>('');
  const prevTopIdRef = useRef<string>('');

  useEffect(() => {
    if (externalHistory !== undefined) {
      setLocalHistory(externalHistory);
      setLoading(false);
    }
  }, [externalHistory]);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;

    if (externalHistory === undefined) {
      scoreboardService
        .getScoreHistory(matchId)
        .then((items) => {
          if (!cancelled && Array.isArray(items)) {
            setLocalHistory(items);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    const socket = getSocketClient();

    const appendHistoryItem = (item?: ScoreHistoryItem) => {
      if (!item || !item._id) return;
      setLocalHistory((prev) => {
        if (prev.some((h) => h._id === item._id)) return prev;
        return [item, ...prev].slice(0, 100);
      });
    };

    const handleTimelineOrScoreEvent = (payload: {
      streamId?: string;
      historyItem?: ScoreHistoryItem;
      correctedEventId?: string;
    }) => {
      if (payload?.streamId !== matchId) return;
      if (payload.correctedEventId) {
        setLocalHistory((prev) =>
          prev.map((h) =>
            h._id === payload.correctedEventId ? { ...h, reverted: true } : h
          )
        );
      }
      if (payload.historyItem) {
        appendHistoryItem(payload.historyItem);
      }
    };

    const handleUndoEvent = (payload: {
      streamId?: string;
      revertedHistoryId?: string;
      deletedHistoryId?: string | null;
      undoHistoryItem?: ScoreHistoryItem | null;
    }) => {
      if (payload?.streamId !== matchId) return;
      setLocalHistory((prev) => {
        let next = prev;
        if (payload.deletedHistoryId) {
          next = next.filter((h) => h._id !== payload.deletedHistoryId);
        } else if (payload.revertedHistoryId) {
          next = next.map((h) =>
            h._id === payload.revertedHistoryId ? { ...h, reverted: true } : h
          );
        }
        if (
          payload.undoHistoryItem?._id &&
          !next.some((h) => h._id === payload.undoHistoryItem!._id)
        ) {
          next = [payload.undoHistoryItem, ...next];
        }
        return next.slice(0, 100);
      });
    };

    const handleResetEvent = (payload: {
      streamId?: string;
      resetHistoryItem?: ScoreHistoryItem;
    }) => {
      if (payload?.streamId !== matchId) return;
      if (payload.resetHistoryItem) {
        appendHistoryItem(payload.resetHistoryItem);
      }
    };

    socket.on('match:timeline:updated', handleTimelineOrScoreEvent);
    socket.on('score:event:created', handleTimelineOrScoreEvent);
    socket.on('score:updated', handleTimelineOrScoreEvent);
    socket.on('score:undo', handleUndoEvent);
    socket.on('score:reset', handleResetEvent);

    return () => {
      cancelled = true;
      socket.off('match:timeline:updated', handleTimelineOrScoreEvent);
      socket.off('score:event:created', handleTimelineOrScoreEvent);
      socket.off('score:updated', handleTimelineOrScoreEvent);
      socket.off('score:undo', handleUndoEvent);
      socket.off('score:reset', handleResetEvent);
    };
  }, [matchId, externalHistory === undefined]);

  const majorEvents = useMemo(
    () => extractMajorTimelineEvents(localHistory, teamAName, teamBName, 5),
    [localHistory, teamAName, teamBName]
  );

  const topEventId = majorEvents[0]?.id || '';
  useEffect(() => {
    if (!topEventId) {
      prevTopIdRef.current = '';
      return;
    }
    if (prevTopIdRef.current && prevTopIdRef.current !== topEventId) {
      setPulseTopId(topEventId);
      const t = window.setTimeout(() => setPulseTopId(''), 700);
      prevTopIdRef.current = topEventId;
      return () => window.clearTimeout(t);
    }
    prevTopIdRef.current = topEventId;
  }, [topEventId]);

  const styleForKind = (kind: MajorTimelineEventKind) => {
    switch (kind) {
      case 'WICKET':
        return {
          dot: 'bg-red-500 border-red-300',
          badge: 'bg-red-500/20 text-red-300 border-red-500/40',
          icon: <ShieldAlert className="w-3.5 h-3.5 text-red-400" />,
        };
      case 'BOUNDARY_SIX':
        return {
          dot: 'bg-[#EA580C] border-orange-300',
          badge: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
          icon: <Flame className="w-3.5 h-3.5 text-orange-400" />,
        };
      case 'BOUNDARY_FOUR':
        return {
          dot: 'bg-emerald-500 border-emerald-300',
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          icon: <Zap className="w-3.5 h-3.5 text-emerald-400" />,
        };
      case 'SUBSTITUTION':
        return {
          dot: 'bg-violet-500 border-violet-300',
          badge: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
          icon: <ArrowLeftRight className="w-3.5 h-3.5 text-violet-400" />,
        };
    }
  };

  return (
    <section
      aria-label="Match Timeline"
      className={`bg-slate-950 border border-slate-800 rounded-xl p-3.5 sm:p-4 text-white shadow-sm space-y-3 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#EA580C]" />
          <h2 className="font-display text-xs sm:text-sm font-bold uppercase tracking-wider text-white">
            Match Timeline
          </h2>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
          Last 5 Major Events
        </span>
      </div>

      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 bg-slate-900 rounded-lg" />
          <div className="h-10 bg-slate-900 rounded-lg" />
        </div>
      ) : majorEvents.length === 0 ? (
        <p className="text-xs text-slate-400 py-1.5">
          No major events recorded yet. Wickets, boundaries (4s/6s), and player substitutions will appear here with timestamps.
        </p>
      ) : (
        <ol className="relative space-y-2 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-slate-800">
          {majorEvents.map((ev) => {
            const st = styleForKind(ev.kind);
            const isFresh = ev.id === pulseTopId;
            return (
              <li
                key={ev.id}
                className={`relative pl-7 pr-2.5 py-2 rounded-lg border border-slate-800/90 bg-slate-900/75 flex items-start justify-between gap-3 ${
                  isFresh ? 'ml-player-change border-orange-500/50' : ''
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute left-[7px] top-3.5 w-2.5 h-2.5 rounded-full border ${st.dot}`}
                />
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold tracking-wider ${st.badge}`}
                    >
                      {st.icon}
                      <span>{ev.badge}</span>
                    </span>
                    <span className="text-xs sm:text-sm font-semibold text-white truncate">
                      {ev.title}
                    </span>
                  </div>
                  {ev.subtitle && ev.subtitle !== ev.title && (
                    <p className="text-[11px] text-slate-400 truncate">{ev.subtitle}</p>
                  )}
                </div>

                <div className="text-right shrink-0 space-y-0.5 font-mono tabular-nums">
                  {ev.scoreSnapshot && (
                    <p className="text-xs font-bold text-slate-200">{ev.scoreSnapshot}</p>
                  )}
                  <p className="text-[10px] text-slate-400">{ev.formattedTime}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
