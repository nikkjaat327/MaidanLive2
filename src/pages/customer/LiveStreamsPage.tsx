import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Radio, Search } from 'lucide-react';
import { SPORT_OPTIONS } from '../../constants/sports.ts';
import { LiveStreamData } from '../../types/index.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import { StreamCard } from '../../components/streaming/StreamCard.tsx';
import { CardGridSkeleton } from '../../components/common/LoadingSkeleton.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';

export function LiveStreamsPage() {
  const { customerUser, adminUser, customerLoading, adminLoading } = useAuth();
  const isAuthenticated = Boolean(customerUser || adminUser);
  const authLoading = customerLoading || adminLoading;

  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LIVE' | 'UPCOMING' | 'ENDED'>('ALL');
  const [sportFilter, setSportFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const fetchStreams = useCallback(async () => {
    try {
      setError(null);
      const data = await liveStreamService.listStreams();
      setStreams(data);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load live streams.'));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchStreams();
    const socket = getSocketClient();

    const joinFeed = () => {
      socket.emit('feed:join');
    };
    if (socket.connected) {
      joinFeed();
    }

    const matchStreamId = (s: LiveStreamData, targetId?: string) =>
      Boolean(targetId && (s.id === targetId || s._id === targetId));

    const handleStreamStarted = (started: LiveStreamData) => {
      const targetId = started?.id || started?._id;
      if (!targetId) {
        void fetchStreams();
        return;
      }
      setStreams((prev) => {
        const exists = prev.some((s) => matchStreamId(s, targetId));
        if (!exists) {
          void fetchStreams();
          return prev;
        }
        return prev.map((s) =>
          matchStreamId(s, targetId)
            ? { ...s, ...started, score: started.score ?? s.score }
            : s
        );
      });
    };

    const handleStreamUpdated = (updated: LiveStreamData) => {
      const targetId = updated?.id || updated?._id;
      if (!targetId) return;
      setStreams((prev) =>
        prev.map((s) =>
          matchStreamId(s, targetId)
            ? { ...s, ...updated, score: updated.score ?? s.score }
            : s
        )
      );
    };

    const handleStreamEnded = (ended: LiveStreamData) => {
      const targetId = ended?.id || ended?._id;
      if (!targetId) return;
      setStreams((prev) =>
        prev.map((s) =>
          matchStreamId(s, targetId)
            ? { ...s, ...ended, status: 'ENDED', score: ended.score ?? s.score }
            : s
        )
      );
    };

    const updateScore = (payload: { streamId: string; score: any }) => {
      if (!payload?.streamId || !payload?.score) return;
      setStreams((prev) =>
        prev.map((s) =>
          matchStreamId(s, payload.streamId) ? { ...s, score: payload.score } : s
        )
      );
    };

    socket.on('connect', joinFeed);
    socket.on('live:started', handleStreamStarted);
    socket.on('live:updated', handleStreamUpdated);
    socket.on('live:ended', handleStreamEnded);
    socket.on('score:updated', updateScore);
    socket.on('score:event:created', updateScore);
    socket.on('kabaddi:state', updateScore);
    socket.on('score:undo', updateScore);
    socket.on('score:reset', updateScore);
    socket.on('match:result:declared', updateScore);
    socket.on('match:result:updated', updateScore);
    return () => {
      socket.emit('feed:leave');
      socket.off('connect', joinFeed);
      socket.off('live:started', handleStreamStarted);
      socket.off('live:updated', handleStreamUpdated);
      socket.off('live:ended', handleStreamEnded);
      socket.off('score:updated', updateScore);
      socket.off('score:event:created', updateScore);
      socket.off('kabaddi:state', updateScore);
      socket.off('score:undo', updateScore);
      socket.off('score:reset', updateScore);
      socket.off('match:result:declared', updateScore);
      socket.off('match:result:updated', updateScore);
    };
  }, [fetchStreams]);

  const filtered = streams.filter((s) => {
    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
    if (sportFilter !== 'ALL' && s.gameName !== sportFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = [s.matchTitle, s.teamAName, s.teamBName, s.tournamentName, s.location, s.gameName]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Live &amp; Scheduled Broadcasts
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Select any stream to watch the YouTube Live feed with instant score updates.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams, match, location..."
            className="w-full min-h-[42px] pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto max-w-full">
          {(['ALL', 'LIVE', 'UPCOMING', 'ENDED'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st === 'ALL' ? 'All Streams' : st === 'LIVE' ? 'Live Now' : st === 'UPCOMING' ? 'Upcoming' : 'Ended'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setSportFilter('ALL')}
            className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
              sportFilter === 'ALL'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Sports
          </button>
          {SPORT_OPTIONS.map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => setSportFilter(sp)}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                sportFilter === sp
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {sp}
            </button>
          ))}
        </div>
      </div>

      {!authLoading && !isAuthenticated && (
        <div className="bg-slate-900 text-white rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-slate-800">
          <div className="flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-[#EA580C] shrink-0 mt-0.5" />
            <p className="text-xs sm:text-sm text-slate-200">
              Player sign-in is required to play live streams, match highlights, and full replays.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/login?next=%2Flive"
              className="min-h-[36px] inline-flex items-center px-3.5 py-1.5 rounded-lg bg-[#EA580C] text-white text-xs font-semibold hover:bg-orange-600"
            >
              Sign In
            </Link>
            <Link
              to="/register?next=%2Flive"
              className="min-h-[36px] inline-flex items-center px-3.5 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs font-semibold hover:bg-white/20"
            >
              Create Player Account
            </Link>
          </div>
        </div>
      )}

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <CardGridSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Radio className="w-6 h-6" />}
          title="No streams match your filters"
          description="Try clearing your search query or switching to All Streams."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((stream) => (
            <StreamCard key={stream.id} stream={stream} to={`/live/${stream.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
