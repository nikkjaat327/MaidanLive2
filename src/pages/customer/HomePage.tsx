import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, PlaySquare, Radio, Trophy } from 'lucide-react';
import { HERO_BANNER_IMAGE } from '../../constants/sports.ts';
import { LiveStreamData } from '../../types/index.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import { StreamCard } from '../../components/streaming/StreamCard.tsx';
import { CardGridSkeleton } from '../../components/common/LoadingSkeleton.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';

export function HomePage() {
  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [replays, setReplays] = useState<LiveStreamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [allStreams, publishedReplays] = await Promise.all([
        liveStreamService.listStreams(),
        liveStreamService.listReplays(false),
      ]);
      setStreams(allStreams);
      setReplays(publishedReplays);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load broadcasts from server.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const socket = getSocketClient();

    const refresh = () => loadData();
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
  }, [loadData]);

  const liveNow = streams.filter((s) => s.status === 'LIVE');
  const upcoming = streams.filter((s) => s.status === 'UPCOMING');
  const completed = streams.filter((s) => s.status === 'ENDED').slice(0, 6);

  return (
    <div className="space-y-10 pb-10">
      {/* Hero Banner */}
      <section className="relative bg-slate-950 text-white overflow-hidden">
        <img
          src={HERO_BANNER_IMAGE}
          alt="Community sports ground under evening floodlights"
          className="absolute inset-0 w-full h-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/65 to-slate-950/35" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20">
          <div className="max-w-2xl space-y-4">
            <p className="text-xs sm:text-sm font-medium text-emerald-400 tracking-wide">
              Community &amp; Tournament Sports Network
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight leading-[1.08] text-balance">
              Watch local matches live with real-time scoreboards
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
              Follow Cricket, Kabaddi, Football, and Volleyball action directly from local grounds
              with synchronized YouTube Live streams and ball-by-ball scoreboard updates.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to="/live"
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                <Radio className="w-4 h-4" />
                <span>Explore Live Streams</span>
              </Link>
              <Link
                to="/tournaments"
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 transition-colors"
              >
                <Trophy className="w-4 h-4" />
                <span>View Tournaments</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-12">
        <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

        {/* Live Now Section */}
        <section aria-labelledby="live-now-heading" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <h2 id="live-now-heading" className="font-display text-2xl font-bold text-slate-900">
                Live Now
              </h2>
              {liveNow.length > 0 && (
                <span className="text-xs font-mono tabular-nums font-semibold text-red-600">
                  {liveNow.length} active
                </span>
              )}
            </div>
            <Link
              to="/live"
              className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
            >
              <span>All live</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {loading ? (
            <CardGridSkeleton count={3} />
          ) : liveNow.length === 0 ? (
            <EmptyState
              icon={<Radio className="w-6 h-6" />}
              title="No matches are live right now"
              description="When a tournament organizer or broadcaster starts a stream, it will appear here immediately with real-time scores."
              action={
                <Link
                  to="/replays"
                  className="min-h-[42px] inline-flex items-center px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                >
                  Browse Published Replays
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {liveNow.map((stream) => (
                <StreamCard key={stream.id} stream={stream} to={`/live/${stream.id}`} />
              ))}
            </div>
          )}
        </section>

        {/* Upcoming Streams Section */}
        <section aria-labelledby="upcoming-heading" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 id="upcoming-heading" className="font-display text-2xl font-bold text-slate-900">
              Upcoming Streams
            </h2>
          </div>

          {loading ? (
            <CardGridSkeleton count={3} />
          ) : upcoming.length === 0 ? (
            <EmptyState
              icon={<Calendar className="w-6 h-6" />}
              title="No upcoming streams scheduled"
              description="Upcoming fixtures scheduled by organizers will be listed here before kickoff or toss."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {upcoming.map((stream) => (
                <StreamCard key={stream.id} stream={stream} to={`/live/${stream.id}`} />
              ))}
            </div>
          )}
        </section>

        {/* Recently Completed */}
        <section aria-labelledby="completed-heading" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 id="completed-heading" className="font-display text-2xl font-bold text-slate-900">
              Recently Completed
            </h2>
          </div>

          {loading ? (
            <CardGridSkeleton count={3} />
          ) : completed.length === 0 ? (
            <EmptyState
              title="No completed broadcasts yet"
              description="Finished matches and their final preserved scoreboards appear here once streams end."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {completed.map((stream) => (
                <StreamCard key={stream.id} stream={stream} to={`/live/${stream.id}`} />
              ))}
            </div>
          )}
        </section>

        {/* Available Replays */}
        <section aria-labelledby="replays-heading" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 id="replays-heading" className="font-display text-2xl font-bold text-slate-900">
              Available Replays
            </h2>
            <Link
              to="/replays"
              className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
            >
              <span>All replays</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {loading ? (
            <CardGridSkeleton count={3} />
          ) : replays.length === 0 ? (
            <EmptyState
              icon={<PlaySquare className="w-6 h-6" />}
              title="No replays published yet"
              description="Verified full-match YouTube replays published by organizers will be available here."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {replays.slice(0, 6).map((stream) => (
                <StreamCard
                  key={stream.id}
                  stream={stream}
                  to={`/live/${stream.id}?mode=replay`}
                  useReplayThumbnail
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
