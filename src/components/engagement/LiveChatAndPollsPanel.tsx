import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart2,
  CheckCircle2,
  Flag,
  MessageCircle,
  Send,
  ShieldAlert,
  Trash2,
  VolumeX,
} from 'lucide-react';
import { ChatMessageData, PollData } from '../../types/index.ts';
import { engagementService } from '../../services/engagement/engagementService.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { useAuth } from '../../hooks/useAuth.ts';

interface LiveChatAndPollsPanelProps {
  streamId: string;
  chatEnabled?: boolean;
}

type ExtendedPoll = PollData & {
  voters?: Array<{ userId: string; optionId: string }>;
  voterUserIds?: string[];
};

export function LiveChatAndPollsPanel({
  streamId,
  chatEnabled = true,
}: LiveChatAndPollsPanelProps) {
  const { customerUser, adminUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'chat' | 'polls'>('chat');
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [polls, setPolls] = useState<ExtendedPoll[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const canModerate =
    Boolean(adminUser) &&
    (adminUser?.role === 'SUPER_ADMIN' ||
      adminUser?.role === 'ADMIN' ||
      adminUser?.role === 'MODERATOR' ||
      Boolean(adminUser?.permissions?.moderateChat));

  useEffect(() => {
    let active = true;
    Promise.all([
      engagementService.listChatMessages(streamId),
      engagementService.listPolls(streamId),
    ])
      .then(([msgs, pollList]) => {
        if (!active) return;
        setMessages(msgs);
        setPolls(pollList as ExtendedPoll[]);
      })
      .catch(() => {
        // Non-blocking
      });

    const socket = getSocketClient();
    socket.emit('stream:join', streamId);

    const onChatMessage = (payload: { streamId: string; message: ChatMessageData }) => {
      if (payload?.streamId !== streamId || !payload.message) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === payload.message.id)) return prev;
        return [...prev.slice(-99), payload.message];
      });
    };

    const onChatDeleted = (payload: { streamId: string; messageId: string }) => {
      if (payload?.streamId !== streamId) return;
      setMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
    };

    const onPollUpdated = (payload: { streamId: string; poll: ExtendedPoll }) => {
      if (payload?.streamId !== streamId || !payload.poll) return;
      setPolls((prev) => {
        const exists = prev.some((p) => p.id === payload.poll.id);
        if (exists) {
          return prev.map((p) => (p.id === payload.poll.id ? payload.poll : p));
        }
        return [payload.poll, ...prev];
      });
    };

    socket.on('chat:message', onChatMessage);
    socket.on('chat:deleted', onChatDeleted);
    socket.on('poll:updated', onPollUpdated);

    return () => {
      active = false;
      socket.off('chat:message', onChatMessage);
      socket.off('chat:deleted', onChatDeleted);
      socket.off('poll:updated', onPollUpdated);
    };
  }, [streamId]);

  useEffect(() => {
    if (chatScrollRef.current && activeTab === 'chat') {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages.length, activeTab]);

  async function handleSendMessage(e: FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    try {
      setSending(true);
      setChatError(null);
      await engagementService.sendChatMessage(streamId, text, !customerUser && Boolean(adminUser));
      setChatInput('');
    } catch (err) {
      setChatError(extractApiError(err, 'Unable to send chat message.'));
    } finally {
      setSending(false);
    }
  }

  async function handleReportMessage(msgId: string) {
    if (!customerUser) {
      setChatError('Sign in to report abusive chat messages.');
      return;
    }
    try {
      setChatError(null);
      await engagementService.reportChatMessage(msgId, 'Inappropriate content');
      setNotice('Message flagged for moderators.');
      window.setTimeout(() => setNotice(null), 2500);
    } catch (err) {
      setChatError(extractApiError(err, 'Could not report message.'));
    }
  }

  async function handleDeleteMessage(msgId: string) {
    try {
      await engagementService.deleteChatMessage(msgId);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch (err) {
      setChatError(extractApiError(err, 'Failed to delete message.'));
    }
  }

  async function handleMuteUser(userId: string, userName: string) {
    try {
      await engagementService.muteChatUser(userId, {
        minutes: 60,
        reason: 'Moderated from live match chat',
      });
      setNotice(`${userName} muted for 60 minutes.`);
      window.setTimeout(() => setNotice(null), 2500);
    } catch (err) {
      setChatError(extractApiError(err, 'Failed to mute user.'));
    }
  }

  async function handleVote(pollId: string, optionId: string) {
    if (!customerUser) {
      setChatError('Please sign in to vote in live match polls.');
      return;
    }
    try {
      setVotingId(pollId);
      setChatError(null);
      const updated = await engagementService.votePoll(pollId, optionId);
      setPolls((prev) => prev.map((p) => (p.id === updated.id ? (updated as ExtendedPoll) : p)));
    } catch (err) {
      setChatError(extractApiError(err, 'Unable to submit vote.'));
    } finally {
      setVotingId(null);
    }
  }

  const openPollCount = polls.filter((p) => p.status === 'OPEN').length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
      {/* Header Tabs */}
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'chat'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Live Chat</span>
            <span className="font-mono text-[10px] opacity-80">({messages.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('polls')}
            className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'polls'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Live Polls</span>
            {openPollCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-mono text-[10px]">
                {openPollCount}
              </span>
            )}
          </button>
        </div>
        {canModerate && (
          <Link
            to="/admin/moderation"
            className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
            <span>Moderation</span>
          </Link>
        )}
      </div>

      {chatError && (
        <div className="mx-3 mt-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {chatError}
        </div>
      )}
      {notice && (
        <div className="mx-3 mt-3 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
          {notice}
        </div>
      )}

      {activeTab === 'chat' ? (
        <>
          <div
            ref={chatScrollRef}
            className="p-3.5 space-y-2.5 h-72 overflow-y-auto bg-white"
          >
            {!chatEnabled ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 text-center px-4">
                Live chat has been disabled by the broadcast organizer for this match.
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 text-center px-4">
                No chat messages yet. Say hello or cheer for your team!
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className="group flex items-start justify-between gap-2 text-xs py-1 border-b border-slate-50 last:border-0"
                >
                  <div className="min-w-0">
                    <span
                      className={`font-semibold mr-1.5 ${
                        m.userRole !== 'USER' ? 'text-emerald-700' : 'text-slate-900'
                      }`}
                    >
                      {m.userName}
                      {m.userRole !== 'USER' ? ' (Staff)' : ''}:
                    </span>
                    <span className="text-slate-700 break-words">{m.message}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    {customerUser && m.userId !== customerUser.id && (
                      <button
                        type="button"
                        onClick={() => handleReportMessage(m.id)}
                        title="Report message"
                        className="p-1 text-slate-400 hover:text-red-600 rounded"
                      >
                        <Flag className="w-3 h-3" />
                      </button>
                    )}
                    {canModerate && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleMuteUser(m.userId, m.userName)}
                          title="Mute user for 60m"
                          className="p-1 text-slate-400 hover:text-amber-600 rounded"
                        >
                          <VolumeX className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMessage(m.id)}
                          title="Delete message"
                          className="p-1 text-slate-400 hover:text-red-600 rounded"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {chatEnabled && (
            <div className="p-3 border-t border-slate-200 bg-slate-50">
              {customerUser || adminUser ? (
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input
                    type="text"
                    maxLength={400}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Send a message to match chat..."
                    className="flex-1 min-h-[40px] px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  <button
                    type="submit"
                    disabled={sending || !chatInput.trim()}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-40"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </form>
              ) : (
                <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
                  <span>Sign in to join the live match conversation.</span>
                  <Link
                    to="/login"
                    className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800"
                  >
                    Sign In
                  </Link>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="p-3.5 space-y-3 h-80 overflow-y-auto">
          {polls.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500 text-center">
              No live match polls created yet.
            </div>
          ) : (
            polls.map((poll) => {
              const myVote =
                poll.userVotedOptionId ||
                poll.voters?.find((v) => v.userId === customerUser?.id)?.optionId ||
                null;
              const isClosed = poll.status === 'CLOSED';
              const showResults = Boolean(myVote) || isClosed;

              return (
                <div
                  key={poll.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs sm:text-sm font-bold text-slate-900">{poll.question}</p>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 ${
                        isClosed
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {poll.status}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {poll.options.map((opt) => {
                      const pct =
                        poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;
                      const isMyPick = myVote === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={showResults || votingId === poll.id}
                          onClick={() => handleVote(poll.id, opt.id)}
                          className={`relative w-full text-left px-3 py-2 rounded-lg border text-xs overflow-hidden transition-colors ${
                            isMyPick
                              ? 'border-emerald-600 bg-emerald-50/70'
                              : 'border-slate-200 bg-white hover:border-slate-300 disabled:hover:border-slate-200'
                          }`}
                        >
                          {showResults && (
                            <div
                              className={`absolute inset-y-0 left-0 ${
                                isMyPick ? 'bg-emerald-500/20' : 'bg-slate-200/60'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          )}
                          <div className="relative flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900 inline-flex items-center gap-1.5">
                              {isMyPick && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                              <span>{opt.label}</span>
                            </span>
                            {showResults && (
                              <span className="font-mono text-[11px] font-bold text-slate-700 tabular-nums">
                                {pct}% ({opt.votes})
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                    {poll.totalVotes} vote{poll.totalVotes === 1 ? '' : 's'}
                    {myVote ? ' · Vote recorded' : !isClosed && !customerUser ? ' · Sign in to vote' : ''}
                  </p>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
