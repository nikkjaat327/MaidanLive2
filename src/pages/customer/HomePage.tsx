import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, Calendar, PlaySquare, Radio, Trophy } from 'lucide-react';
import { HERO_BANNER_IMAGE, SPORT_OPTIONS } from '../../constants/sports.ts';
import { LiveStreamData, SponsorData } from '../../types/index.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import { useLanguage } from '../../context/LanguageContext.tsx';
import { StreamCard } from '../../components/streaming/StreamCard.tsx';
import { CardGridSkeleton } from '../../components/common/LoadingSkeleton.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { PWAInstallButton } from '../../components/common/PWAInstallButton.tsx';

export function HomePage() {
  const { t } = useLanguage();
  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [replays, setReplays] = useState<LiveStreamData[]>([]);
  const [homeSponsors, setHomeSponsors] = useState<SponsorData[]>([]);
  const [selectedSport, setSelectedSport] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [allStreams, publishedReplays, sponsors] = await Promise.all([
        liveStreamService.listStreams(),
        liveStreamService.listReplays(false),
        platformOpsService.listPublicSponsors({ placement: 'home_feed' }).catch(() => []),
      ]);
      setStreams(allStreams);
      setReplays(publishedReplays);
      setHomeSponsors(sponsors);
      sponsors.forEach((sp) => platformOpsService.trackSponsorImpression(sp.id));
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

  const filterBySport = (item: LiveStreamData) =>
    selectedSport === 'ALL' || item.gameName === selectedSport || item.score?.sportType === selectedSport;

  const liveNow = streams.filter((s) => s.status === 'LIVE' && filterBySport(s));
  const upcoming = streams.filter((s) => s.status === 'UPCOMING' && filterBySport(s));
  const completed = streams.filter((s) => s.status === 'ENDED' && filterBySport(s)).slice(0, 6);
  const filteredReplays = replays.filter(filterBySport).slice(0, 6);

  return (
    <div className="space-y-8 pb-10">
      {/* Hero Banner */}
      <section className="relative bg-slate-950 text-white overflow-hidden">
        <img
          src={HERO_BANNER_IMAGE}
          alt="Community sports ground under evening floodlights"
          className="absolute inset-0 w-full h-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/35" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16 lg:py-20">
          <div className="max-w-2xl space-y-4">
            <p className="text-xs sm:text-sm font-bold text-[#EA580C] tracking-wide uppercase">
              {t('hero.badge')}
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight leading-[1.08] text-balance">
              {t('hero.title')}
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
              {t('hero.subtitle')}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to="/live"
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                <Radio className="w-4 h-4" />
                <span>{t('hero.watchLive')}</span>
              </Link>
              <Link
                to="/tournaments"
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 transition-colors"
              >
                <Trophy className="w-4 h-4" />
                <span>{t('hero.browseTournaments')}</span>
              </Link>
              <PWAInstallButton />
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
        <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

        {/* Sport Filter Strip */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedSport('ALL')}
            className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border transition-colors ${
              selectedSport === 'ALL'
                ? 'bg-[#EA580C] text-white border-[#EA580C]'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t('common.allSports')}
          </button>
          {SPORT_OPTIONS.map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => setSelectedSport(sp)}
              className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border transition-colors ${
                selectedSport === sp
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {sp}
            </button>
          ))}
        </div>

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
              className="inline-flex items-center gap-1 text-sm font-medium text-[#EA580C] hover:underline whitespace-nowrap"
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
              title={t('common.noMatches')}
              description="When an organizer starts a live match stream, it will appear here immediately with real-time scoreboards."
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

        {/* Home Feed Sponsors (if configured by organizers) */}
        {homeSponsors.length > 0 && (
          <section className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 inline-flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-[#EA580C]" />
              <span>Featured Community Sponsors</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {homeSponsors.map((sp) => (
                <a
                  key={sp.id}
                  href={sp.websiteUrl || undefined}
                  target={sp.websiteUrl ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  onClick={() => platformOpsService.trackSponsorClick(sp.id)}
                  className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3 hover:border-orange-300 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {sp.logoUrl && (
                      <img
                        src={sp.logoUrl}
                        alt={sp.name}
                        className="w-11 h-11 rounded-lg object-contain bg-slate-50 border border-slate-200 p-1 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{sp.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {sp.tagline || sp.sponsorshipType}
                      </p>
                    </div>
                  </div>
                  {sp.websiteUrl && (
                    <span className="text-xs font-semibold text-[#EA580C] shrink-0">
                      {sp.ctaText || 'Learn More'}
                    </span>
                  )}
                </a>
              ))}
            </div>
          </section>
        )}

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
              className="inline-flex items-center gap-1 text-sm font-medium text-[#EA580C] hover:underline whitespace-nowrap"
            >
              <span>All replays</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {loading ? (
            <CardGridSkeleton count={3} />
          ) : filteredReplays.length === 0 ? (
            <EmptyState
              icon={<PlaySquare className="w-6 h-6" />}
              title="No replays published yet"
              description="Verified full-match replays published by organizers will be available here."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredReplays.map((stream) => (
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
