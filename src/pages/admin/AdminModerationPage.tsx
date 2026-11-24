import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ban,
  BarChart2,
  CheckCircle2,
  MessageSquareWarning,
  Plus,
  Trash2,
  Volume2,
} from 'lucide-react';
import { ChatMessageData, LiveStreamData, PollData } from '../../types/index.ts';
import { engagementService } from '../../services/engagement/engagementService.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';
import {
  getStickyMatchId,
  resolveStickyOrPreferredMatch,
  setStickyMatchId,
  subscribeStickyMatchId,
} from '../../utils/activeMatchSelection.ts';

export function AdminModerationPage() {
  const [flaggedMessages, setFlaggedMessages] = useState<ChatMessageData[]>([]);
  const [recentMessages, setRecentMessages] = useState<ChatMessageData[]>([]);
  const [mutedUsers, setMutedUsers] = useState<
    Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      chatMutedUntil?: string;
      chatMutedReason?: string;
    }>
  >([]);
  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [selectedStreamId, setSelectedStreamId] = useState(() => getStickyMatchId());
  const [polls, setPolls] = useState<PollData[]>([]);

  // Create Poll form
  const [question, setQuestion] = useState('');
  const [optionsText, setOptionsText] = useState('Team A\nTeam B');
  const [creatingPoll, setCreatingPoll] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadModeration = useCallback(async () => {
    try {
      setError(null);
      const [queue, allStreams] = await Promise.all([
        engagementService.getChatModerationQueue(),
        liveStreamService.listStreams(),
      ]);
      setFlaggedMessages(queue.flaggedMessages || []);
      setRecentMessages(queue.recentMessages || []);
      setMutedUsers(queue.mutedUsers || []);
      setStreams(allStreams);
      if (allStreams.length > 0) {
        setSelectedStreamId((prev) => {
          const resolved = resolveStickyOrPreferredMatch(
            prev && allStreams.some((s) => s.id === prev) ? prev : undefined,
            allStreams
          );
          if (resolved) setStickyMatchId(resolved);
          return resolved;
        });
      }
    } catch (err) {
      setError(extractApiError(err, 'Failed to load chat moderation queue.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPolls = useCallback(async (streamId: string) => {
    if (!streamId) return;
    try {
      const list = await engagementService.listPolls(streamId);
      setPolls(list);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load live polls.'));
    }
  }, []);

  useEffect(() => {
    loadModeration();
  }, [loadModeration]);

  useEffect(() => {
    return subscribeStickyMatchId((nextId) => {
      if (nextId && streams.some((s) => s.id === nextId)) {
        setSelectedStreamId(nextId);
      }
    });
  }, [streams]);

  useEffect(() => {
    if (selectedStreamId) {
      loadPolls(selectedStreamId);
    }
  }, [selectedStreamId, loadPolls]);

  async function handleDeleteMessage(id: string) {
    try {
      await engagementService.deleteChatMessage(id);
      setSuccess('Chat message deleted.');
      await loadModeration();
    } catch (err) {
      setError(extractApiError(err, 'Failed to delete message.'));
    }
  }

  async function handleMuteUser(userId: string, minutes: number) {
    try {
      await engagementService.muteChatUser(userId, {
        minutes,
        reason: 'Chat moderation action',
      });
      setSuccess(`User muted for ${minutes} minutes.`);
      await loadModeration();
    } catch (err) {
      setError(extractApiError(err, 'Failed to mute user.'));
    }
  }

  async function handleUnmuteUser(userId: string) {
    try {
      await engagementService.muteChatUser(userId, { unmute: true });
      setSuccess('User unmuted.');
      await loadModeration();
    } catch (err) {
      setError(extractApiError(err, 'Failed to unmute user.'));
    }
  }

  async function handleCreatePoll(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStreamId || !question.trim()) return;
    const options = optionsText
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (options.length < 2) {
      setError('Provide at least 2 poll options.');
      return;
    }
    try {
      setCreatingPoll(true);
      setError(null);
      await engagementService.createPoll(selectedStreamId, {
        question: question.trim(),
        options,
      });
      setQuestion('');
      setSuccess('Live poll published to match viewers.');
      await loadPolls(selectedStreamId);
    } catch (err) {
      setError(extractApiError(err, 'Failed to create poll.'));
    } finally {
      setCreatingPoll(false);
    }
  }

  async function handleClosePoll(pollId: string) {
    try {
      await engagementService.closePoll(pollId);
      setSuccess('Poll closed.');
      await loadPolls(selectedStreamId);
    } catch (err) {
      setError(extractApiError(err, 'Failed to close poll.'));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
          Chat Moderation &amp; Live Polls
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Review flagged live chat messages, mute abusive accounts, and launch or close real-time audience polls.
        </p>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      {loading ? (
        <TableSkeleton rows={4} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chat Moderation Column */}
          <div className="space-y-4">
            <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                  <MessageSquareWarning className="w-4 h-4 text-red-600" />
                  <span>Flagged Messages ({flaggedMessages.length})</span>
                </h2>
              </div>

              {flaggedMessages.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  No reported chat messages in queue.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {flaggedMessages.map((msg) => (
                    <div key={msg.id} className="py-2.5 flex items-start justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{msg.userName}</span>
                          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-mono text-[10px]">
                            {msg.reportedCount || 1} report{(msg.reportedCount || 1) === 1 ? '' : 's'}
                          </span>
                        </div>
                        <p className="text-slate-700 mt-0.5 break-words">{msg.message}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMuteUser(msg.userId, 30)}
                          className="px-2 py-1 rounded bg-amber-50 text-amber-800 hover:bg-amber-100 font-semibold"
                          title="Mute 30 mins"
                        >
                          Mute 30m
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          title="Delete message"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                <Ban className="w-4 h-4 text-slate-600" />
                <span>Muted Users ({mutedUsers.length})</span>
              </h2>
              {mutedUsers.length === 0 ? (
                <p className="text-xs text-slate-500 py-3 text-center">No users currently muted.</p>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {mutedUsers.map((u) => (
                    <div key={u.id} className="py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{u.name}</p>
                        <p className="text-slate-500 truncate">
                          {u.email}
                          {u.chatMutedUntil
                            ? ` · Until ${new Date(u.chatMutedUntil).toLocaleString()}`
                            : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnmuteUser(u.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold shrink-0"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Unmute</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <h2 className="text-sm font-bold text-slate-900">
                Recent Chat Activity ({recentMessages.length})
              </h2>
              {recentMessages.length === 0 ? (
                <p className="text-xs text-slate-500 py-3 text-center">No recent messages.</p>
              ) : (
                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto text-xs">
                  {recentMessages.map((msg) => (
                    <div key={msg.id} className="py-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-900">{msg.userName}: </span>
                        <span className="text-slate-700 break-words">{msg.message}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Link
                          to={`/live/${msg.liveStreamId}`}
                          className="px-2 py-0.5 text-[11px] text-emerald-700 hover:underline"
                        >
                          Match
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Delete message"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Live Polls Manager Column */}
          <div className="space-y-4">
            <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-emerald-600" />
                  <span>Live Match Polls</span>
                </h2>
              </div>

              {streams.length === 0 ? (
                <EmptyState
                  title="No streams available"
                  description="Start a stream to create live fan prediction polls."
                />
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Target Broadcast
                    </label>
                    <select
                      value={selectedStreamId}
                      onChange={(e) => {
                        const next = e.target.value;
                        setSelectedStreamId(next);
                        setStickyMatchId(next);
                      }}
                      className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {streams.map((s) => (
                        <option key={s.id} value={s.id}>
                          [{s.status}] {s.matchTitle || `${s.teamAName} vs ${s.teamBName}` || s.youtubeVideoId}
                        </option>
                      ))}
                    </select>
                  </div>

                  <form onSubmit={handleCreatePoll} className="space-y-3 pt-2 border-t border-slate-100">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Poll Question *
                      </label>
                      <input
                        type="text"
                        required
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="Who will win today's match?"
                        className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Options (one per line or comma-separated)
                      </label>
                      <textarea
                        rows={3}
                        value={optionsText}
                        onChange={(e) => setOptionsText(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={creatingPoll}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{creatingPoll ? 'Launching...' : 'Launch Live Poll'}</span>
                    </button>
                  </form>

                  <div className="space-y-2.5 pt-2 border-t border-slate-100">
                    {polls.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-3">
                        No polls for this match yet.
                      </p>
                    ) : (
                      polls.map((poll) => (
                        <div
                          key={poll.id}
                          className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-900">{poll.question}</p>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                                poll.status === 'OPEN'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {poll.status}
                            </span>
                          </div>
                          <div className="space-y-1 text-xs">
                            {poll.options.map((opt) => {
                              const pct =
                                poll.totalVotes > 0
                                  ? Math.round((opt.votes / poll.totalVotes) * 100)
                                  : 0;
                              return (
                                <div key={opt.id} className="flex items-center justify-between">
                                  <span className="text-slate-700">{opt.label}</span>
                                  <span className="font-mono tabular-nums text-slate-600">
                                    {opt.votes} ({pct}%)
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                            <span className="font-mono">{poll.totalVotes} total votes</span>
                            {poll.status === 'OPEN' && (
                              <button
                                type="button"
                                onClick={() => handleClosePoll(poll.id)}
                                className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-red-600"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Close Poll</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
