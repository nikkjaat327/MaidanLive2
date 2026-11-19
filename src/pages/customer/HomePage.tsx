import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, Calendar, History, MapPin, PlaySquare, Radio, Trophy } from 'lucide-react';
import { HERO_BANNER_IMAGE, SPORT_OPTIONS } from '../../constants/sports.ts';
import { LiveStreamData, SponsorData, TournamentData } from '../../types/index.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import { useLanguage } from '../../context/LanguageContext.tsx';
import { StreamCard } from '../../components/streaming/StreamCard.tsx';
import { CardGridSkeleton } from '../../components/common/LoadingSkeleton.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { PWAInstallButton } from '../../components/common/PWAInstallButton.tsx';
import { RecentMatchEntry, recentlyWatchedStore } from '../../utils/recentlyWatched.ts';
import { MatchStatusBadge } from '../../components/common/MatchStatusBadge.tsx';

export function HomePage() {
  const { t } = useLanguage();
  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [replays, setReplays] = useState<LiveStreamData[]>([]);
  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [homeSponsors, setHomeSponsors] = useState<SponsorData[]>([]);
  const [selectedSport, setSelectedSport] = useState<string>('ALL');
  const [locationFilter, setLocationFilter] = useState<string>('ALL');
  const [recentMatches, setRecentMatches] = useState<RecentMatchEntry[]>(() =>
    recentlyWatchedStore.getMatches()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [allStreams, publishedReplays, allTournaments, sponsors] = await Promise.all([
        liveStreamService.listStreams(),
        liveStreamService.listReplays(false),
        entityService.listTournaments().catch(() => []),
        platformOpsService.listPublicSponsors({ placement: 'home_feed' }).catch(() => []),
      ]);
      setStreams(allStreams);
      setReplays(publishedReplays);
      setTournaments(allTournaments);
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

  const availableLocations = Array.from(
    new Set(
      streams
        .map((s) => (s.location || '').split(',').pop()?.trim() || '')
        .filter(Boolean)
    )
  ).slice(0, 8);

  const filterItem = (item: LiveStreamData) => {
    const sportMatch =
      selectedSport === 'ALL' ||
      item.gameName === selectedSport ||
      item.score?.sportType === selectedSport;
    const locMatch =
      locationFilter === 'ALL' ||
      (item.location || '').toLowerCase().includes(locationFilter.toLowerCase());
    return sportMatch && locMatch;
  };

  const liveNow = streams.filter((s) => s.status === 'LIVE' && filterItem(s));
  const upcoming = streams.filter((s) => s.status === 'UPCOMING' && filterItem(s));
  const completed = streams.filter((s) => s.status === 'ENDED' && filterItem(s)).slice(0, 6);
  const filteredReplays = replays.filter(filterItem).slice(0, 6);

  const todayStr = new Date().toDateString();
  const todaysMatches = streams
    .filter((s) => {
      if (!filterItem(s)) return false;
      const d = s.matchDate || s.startedAt;
      return d ? new Date(d).toDateString() === todayStr : s.status === 'LIVE';
    })
    .slice(0, 4);

  const featuredTournaments = tournaments
    .filter(
      (tour) =>
        (selectedSport === 'ALL' || tour.sportType === selectedSport) &&
        (locationFilter === 'ALL' ||
          (tour.location || '').toLowerCase().includes(locationFilter.toLowerCase()))
    )
    .slice(0, 3);

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

        {/* Sport + Optional Location Filter Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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

          {availableLocations.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <MapPin className="w-4 h-4 text-slate-400" />
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                aria-label="Filter by city or ground"
                className="min-h-[40px] px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-700"
              >
                <option value="ALL">All Locations</option>
                {availableLocations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Continue Watching / Recently Watched */}
        {recentMatches.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display text-lg font-bold text-slate-900 inline-flex items-center gap-2">
                <History className="w-4 h-4 text-[#EA580C]" />
                <span>Continue Watching</span>
              </h2>
              <button
                type="button"
                onClick={() => {
                  recentlyWatchedStore.clearMatches();
                  setRecentMatches([]);
                }}
                className="text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                Clear history
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {recentMatches.slice(0, 4).map((m) => (
                <Link
                  key={m.id}
                  to={`/live/${m.id}`}
                  className="bg-white border border-slate-200 rounded-xl p-3.5 hover:border-orange-300 transition-colors flex flex-col justify-between gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-[#EA580C] uppercase">{m.sport}</span>
                    <MatchStatusBadge rawStatus={m.status} compact />
                  </div>
                  <p className="text-sm font-semibold text-slate-900 line-clamp-1">{m.title}</p>
                  {m.tournamentName && (
                    <p className="text-xs text-slate-500 truncate">{m.tournamentName}</p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Today's Matches Strip */}
        {!loading && todaysMatches.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display text-xl font-bold text-slate-900">Today&apos;s Matches</h2>
              <Link
                to="/calendar"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#EA580C] hover:underline"
              >
                <span>Full schedule</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {todaysMatches.map((m) => (
                <Link
                  key={`today-${m.id}`}
                  to={`/live/${m.id}`}
                  className="bg-white border border-slate-200 rounded-xl p-3.5 hover:border-slate-300 transition-colors space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-600 uppercase">
                      {m.gameName || 'Match'}
                    </span>
                    <MatchStatusBadge stream={m} score={m.score} compact />
                  </div>
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {m.matchTitle || `${m.teamAName || 'Team A'} vs ${m.teamBName || 'Team B'}`}
                  </p>
                  {m.score && (
                    <p className="font-mono text-xs font-bold tabular-nums text-slate-700">
                      {m.score.teamAScore} - {m.score.teamBScore}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Featured Tournaments */}
        {!loading && featuredTournaments.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display text-xl font-bold text-slate-900">Featured Tournaments</h2>
              <Link
                to="/tournaments"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#EA580C] hover:underline"
              >
                <span>Explore all</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {featuredTournaments.map((tour) => (
                <Link
                  key={tour.id}
                  to={`/tournaments/${tour.id}`}
                  className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors flex flex-col justify-between gap-2"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-[#EA580C] uppercase">{tour.sportType}</span>
                    <span className="font-semibold text-slate-600">{tour.status}</span>
                  </div>
                  <h3 className="font-display text-base font-bold text-slate-900 line-clamp-1">
                    {tour.name}
                  </h3>
                  <p className="text-xs text-slate-500 truncate">
                    {tour.location || 'Local Ground'}
                    {tour.prizeMoney ? ` · Prize: ${tour.prizeMoney}` : ''}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

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
