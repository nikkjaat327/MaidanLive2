import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Calendar, Radio, Trophy, Users } from 'lucide-react';
import { LiveStreamData, TeamData } from '../../types/index.ts';
import { engagementService } from '../../services/engagement/engagementService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { TeamAvatar } from '../../components/common/TeamAvatar.tsx';
import { StreamCard } from '../../components/streaming/StreamCard.tsx';

export function FollowingPage() {
  const { customerUser, customerLoading } = useAuth();
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [liveMatches, setLiveMatches] = useState<LiveStreamData[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<LiveStreamData[]>([]);
  const [recentResults, setRecentResults] = useState<LiveStreamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    engagementService
      .getFollowingFeed()
      .then((res) => {
        setTeams(res.teams || []);
        setLiveMatches(res.liveMatches || []);
        setUpcomingMatches(res.upcomingMatches || []);
        setRecentResults(res.recentResults || []);
      })
      .catch((err) => setError(extractApiError(err, 'Failed to load followed teams feed.')))
      .finally(() => setLoading(false));
  }, [customerUser]);

  if (customerLoading || loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="p-8 bg-white border border-slate-200 rounded-xl text-sm text-slate-500">
          Loading your followed teams feed...
        </div>
      </div>
    );
  }

  if (!customerUser) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <EmptyState
          icon={<Bell className="w-6 h-6" />}
          title="Sign in to follow teams"
          description="Follow your favorite local clubs and get a personalized feed of live streams, upcoming fixtures, and results."
          action={
            <Link
              to="/login"
              className="min-h-[42px] inline-flex items-center px-5 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
            >
              Sign In
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Following Feed
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Matches and updates for the squads you follow on MaidanLive.
          </p>
        </div>
        <Link
          to="/teams"
          className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
        >
          <Users className="w-4 h-4" />
          <span>Browse All Teams</span>
        </Link>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

      {teams.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6" />}
          title="You aren't following any teams yet"
          description="Tap Follow on any team page or live broadcast to track their matches here."
          action={
            <Link
              to="/teams"
              className="min-h-[42px] inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
            >
              Explore Teams
            </Link>
          }
        />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Followed Squads ({teams.length})
            </h2>
            <div className="flex flex-wrap gap-3">
              {teams.map((t) => (
                <Link
                  key={t.id}
                  to={`/teams/${t.id}`}
                  className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 inline-flex items-center gap-2.5 hover:border-emerald-400"
                >
                  <TeamAvatar name={t.name} logoUrl={t.logoUrl} size="sm" />
                  <span className="text-sm font-semibold text-slate-900">{t.name}</span>
                </Link>
              ))}
            </div>
          </section>

          {liveMatches.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-xl font-bold text-slate-900 inline-flex items-center gap-2">
                <Radio className="w-5 h-5 text-red-600" />
                <span>Live Now</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {liveMatches.map((s) => (
                  <StreamCard key={s.id} stream={s} to={`/live/${s.id}`} />
                ))}
              </div>
            </section>
          )}

          {upcomingMatches.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-xl font-bold text-slate-900 inline-flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-600" />
                <span>Upcoming Matches</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {upcomingMatches.map((s) => (
                  <StreamCard key={s.id} stream={s} to={`/live/${s.id}`} />
                ))}
              </div>
            </section>
          )}

          {recentResults.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-xl font-bold text-slate-900 inline-flex items-center gap-2">
                <Trophy className="w-5 h-5 text-emerald-600" />
                <span>Recent Matches &amp; Results</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {recentResults.map((s) => (
                  <StreamCard key={s.id} stream={s} to={`/live/${s.id}`} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
