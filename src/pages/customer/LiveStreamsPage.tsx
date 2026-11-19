import { useCallback, useEffect, useState } from 'react';
import { Radio, Search } from 'lucide-react';
import { SPORT_OPTIONS } from '../../constants/sports.ts';
import { LiveStreamData } from '../../types/index.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import { StreamCard } from '../../components/streaming/StreamCard.tsx';
import { CardGridSkeleton } from '../../components/common/LoadingSkeleton.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';

export function LiveStreamsPage() {
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
  }, []);

  useEffect(() => {
    fetchStreams();
    const socket = getSocketClient();
    const refresh = () => fetchStreams();
    const updateScore = (payload: { streamId: string; score: any }) => {
      setStreams((prev) =>
        prev.map((s) => (s.id === payload.streamId ? { ...s, score: payload.score } : s))
      );
    };

    socket.on('live:started', refresh);
    socket.on('live:updated', refresh);
    socket.on('live:ended', refresh);
    socket.on('score:updated', updateScore);
    socket.on('score:undo', updateScore);
    socket.on('score:reset', updateScore);
    socket.on('match:result:declared', updateScore);
    socket.on('match:result:updated', updateScore);
    return () => {
      socket.off('live:started', refresh);
      socket.off('live:updated', refresh);
      socket.off('live:ended', refresh);
      socket.off('score:updated', updateScore);
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
