import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquareText, Send, Trash2 } from 'lucide-react';
import type { ScoreHistoryItem } from '../../types/index.ts';
import { scoreboardService } from '../../services/scoreboard/scoreboardService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import {
  extractCommentaryFeedEntries,
  type CommentaryCategory,
  type CommentaryFilter,
} from '../../utils/commentaryFeed.ts';

export interface CommentaryFeedWidgetProps {
  matchId: string;
  history?: ScoreHistoryItem[];
  canBroadcast?: boolean;
  onCommentaryAdded?: (item: ScoreHistoryItem) => void;
  onCommentaryDeleted?: (commentaryId: string) => void;
  className?: string;
}

const CATEGORY_OPTIONS: Array<{ id: CommentaryCategory; label: string }> = [
  { id: 'COMMENTARY', label: 'Commentary' },
  { id: 'HIGHLIGHT', label: 'Highlight' },
  { id: 'UPDATE', label: 'Match Update' },
];

const FILTER_OPTIONS: Array<{ id: CommentaryFilter; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'HIGHLIGHT', label: 'Highlights' },
  { id: 'UPDATE', label: 'Updates' },
  { id: 'COMMENTARY', label: 'Commentary' },
];

export function CommentaryFeedWidget({
  matchId,
  history: externalHistory,
  canBroadcast = false,
  onCommentaryAdded,
  onCommentaryDeleted,
  className = '',
}: CommentaryFeedWidgetProps) {
  const [localHistory, setLocalHistory] = useState<ScoreHistoryItem[]>(externalHistory || []);
  const [loading, setLoading] = useState<boolean>(
    externalHistory === undefined && Boolean(matchId)
  );
  const [filter, setFilter] = useState<CommentaryFilter>('ALL');
  const [category, setCategory] = useState<CommentaryCategory>('COMMENTARY');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [freshId, setFreshId] = useState<string>('');
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

    const insertCommentaryItem = (item?: ScoreHistoryItem) => {
      if (!item || !item._id || item.entryType !== 'COMMENTARY') return;
      setLocalHistory((prev) => {
        if (prev.some((h) => h._id === item._id)) return prev;
        return [item, ...prev].slice(0, 100);
      });
    };

    const handleCommentaryAdded = (payload: {
      streamId?: string;
      commentary?: ScoreHistoryItem;
    }) => {
      if (payload?.streamId !== matchId || !payload.commentary) return;
      insertCommentaryItem(payload.commentary);
    };

    const handleCommentaryDeleted = (payload: {
      streamId?: string;
      commentaryId?: string;
    }) => {
      if (payload?.streamId !== matchId || !payload.commentaryId) return;
      setLocalHistory((prev) => prev.filter((h) => h._id !== payload.commentaryId));
    };

    const handleTimelineUpdated = (payload: {
      streamId?: string;
      historyItem?: ScoreHistoryItem;
      deletedCommentaryId?: string;
    }) => {
      if (payload?.streamId !== matchId) return;
      if (payload.deletedCommentaryId) {
        setLocalHistory((prev) =>
          prev.filter((h) => h._id !== payload.deletedCommentaryId)
        );
        return;
      }
      if (payload.historyItem?.entryType === 'COMMENTARY') {
        insertCommentaryItem(payload.historyItem);
      }
    };

    socket.on('commentary:added', handleCommentaryAdded);
    socket.on('commentary:deleted', handleCommentaryDeleted);
    socket.on('match:timeline:updated', handleTimelineUpdated);

    return () => {
      cancelled = true;
      socket.off('commentary:added', handleCommentaryAdded);
      socket.off('commentary:deleted', handleCommentaryDeleted);
      socket.off('match:timeline:updated', handleTimelineUpdated);
    };
  }, [matchId, externalHistory === undefined]);

  const allCommentary = useMemo(
    () => extractCommentaryFeedEntries(localHistory, 'ALL'),
    [localHistory]
  );

  const visibleEntries = useMemo(
    () =>
      filter === 'ALL'
        ? allCommentary
        : allCommentary.filter((entry) => entry.category === filter),
    [allCommentary, filter]
  );

  const topId = allCommentary[0]?.id || '';
  useEffect(() => {
    if (!topId) {
      prevTopIdRef.current = '';
      return;
    }
    if (prevTopIdRef.current && prevTopIdRef.current !== topId) {
      setFreshId(topId);
      const t = window.setTimeout(() => setFreshId(''), 700);
      prevTopIdRef.current = topId;
      return () => window.clearTimeout(t);
    }
    prevTopIdRef.current = topId;
  }, [topId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const snippet = text.trim();
    if (!snippet || submitting) return;

    try {
      setSubmitting(true);
      setFeedbackError(null);
      const res = await scoreboardService.submitCommentary(matchId, snippet, category);
      if (res?.commentary?._id) {
        setLocalHistory((prev) => {
          if (prev.some((h) => h._id === res.commentary._id)) return prev;
          return [res.commentary, ...prev].slice(0, 100);
        });
        onCommentaryAdded?.(res.commentary);
      }
      setText('');
      if (filter !== 'ALL' && filter !== category) {
        setFilter('ALL');
      }
    } catch (err) {
      setFeedbackError(
        extractApiError(err, 'Unable to broadcast commentary update right now.')
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(commentaryId: string) {
    if (!canBroadcast || deletingId) return;
    try {
      setDeletingId(commentaryId);
      setFeedbackError(null);
      await scoreboardService.deleteCommentary(matchId, commentaryId);
      setLocalHistory((prev) => prev.filter((h) => h._id !== commentaryId));
      onCommentaryDeleted?.(commentaryId);
    } catch (err) {
      setFeedbackError(extractApiError(err, 'Unable to delete commentary update.'));
    } finally {
      setDeletingId(null);
    }
  }

  const categoryTextTone = (cat: CommentaryCategory) => {
    switch (cat) {
      case 'HIGHLIGHT':
        return 'text-amber-400';
      case 'UPDATE':
        return 'text-sky-400';
      default:
        return 'text-emerald-400';
    }
  };

  return (
    <section
      aria-label="Commentary Feed"
      className={`bg-slate-950 border border-slate-800 rounded-xl p-3.5 sm:p-4 text-white space-y-3 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquareText className="w-4 h-4 text-[#EA580C] shrink-0" />
          <h2 className="font-display text-xs sm:text-sm font-bold uppercase tracking-wider text-white">
            Commentary Feed
          </h2>
        </div>
        <span className="text-[11px] font-mono tabular-nums text-slate-400">
          {allCommentary.length} update{allCommentary.length === 1 ? '' : 's'}
        </span>
      </div>

      {allCommentary.length > 0 && (
        <div
          role="tablist"
          aria-label="Filter commentary updates"
          className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800"
        >
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(opt.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {canBroadcast && (
        <form
          onSubmit={handleSubmit}
          className="border border-slate-800 bg-slate-900/60 rounded-lg p-3 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1 bg-slate-950 p-1 rounded-md border border-slate-800">
              {CATEGORY_OPTIONS.map((opt) => {
                const selected = category === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setCategory(opt.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      selected
                        ? 'bg-[#EA580C] text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <span className="text-[11px] font-mono tabular-nums text-slate-400">
              {text.length}/280
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              maxLength={280}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Broadcast a match update, highlight, or live commentary..."
              aria-label="Broadcast commentary update"
              className="flex-1 min-h-[40px] px-3 py-2 text-xs sm:text-sm bg-slate-950 text-white placeholder:text-slate-500 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
            />
            <button
              type="submit"
              disabled={submitting || !text.trim()}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{submitting ? 'Sending...' : 'Broadcast'}</span>
            </button>
          </div>

          {feedbackError && (
            <p className="text-xs text-red-400" role="alert">
              {feedbackError}
            </p>
          )}
        </form>
      )}

      {loading ? (
        <div className="space-y-2.5 animate-pulse">
          <div className="h-12 bg-slate-900 rounded-lg" />
          <div className="h-12 bg-slate-900 rounded-lg" />
        </div>
      ) : visibleEntries.length === 0 ? (
        <p className="text-xs text-slate-400 py-2">
          {allCommentary.length === 0
            ? 'Live match commentary, key highlights, and broadcast updates will appear here in real time.'
            : 'No entries match the selected filter yet.'}
        </p>
      ) : (
        <div
          role="log"
          aria-live="polite"
          className="max-h-[340px] overflow-y-auto divide-y divide-slate-800/80 pr-1"
        >
          {visibleEntries.map((entry) => {
            const isFresh = entry.id === freshId;
            return (
              <article
                key={entry.id}
                className={`py-2.5 first:pt-1 last:pb-1 space-y-1 ${
                  isFresh ? 'ml-player-change' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] min-w-0">
                    <span
                      className={`font-semibold whitespace-nowrap ${categoryTextTone(
                        entry.category
                      )}`}
                    >
                      {entry.categoryLabel}
                    </span>
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                    <span className="text-slate-400 truncate">{entry.authorName}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums text-[11px]">
                    {entry.scoreSnapshot && (
                      <span className="text-slate-200 font-semibold">
                        {entry.scoreSnapshot}
                      </span>
                    )}
                    <span className="text-slate-500">{entry.formattedTime}</span>
                    {canBroadcast && (
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        disabled={deletingId === entry.id}
                        aria-label="Delete commentary update"
                        className="p-1 text-slate-500 hover:text-red-400 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-slate-100 leading-relaxed break-words">
                  {entry.text}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
