import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Calendar, Heart, MapPin, Radio, Trophy, UserCheck, Users, X } from 'lucide-react';
import { LiveStreamData, PlayerData, TeamData, TournamentData } from '../../types/index.ts';
import { engagementService } from '../../services/engagement/engagementService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { TeamAvatar } from '../../components/common/TeamAvatar.tsx';
import { StreamCard } from '../../components/streaming/StreamCard.tsx';

export function FollowingPage() {
  const { customerUser, customerLoading, updateCustomerUser } = useAuth();
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [liveMatches, setLiveMatches] = useState<LiveStreamData[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<LiveStreamData[]>([]);
  const [recentResults, setRecentResults] = useState<LiveStreamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    if (!customerUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await engagementService.getFollowingFeed();
      setTeams(res.teams || []);
      setPlayers(res.players || []);
      setTournaments(res.tournaments || []);
      setLiveMatches(res.liveMatches || []);
      setUpcomingMatches(res.upcomingMatches || []);
      setRecentResults(res.recentResults || []);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load your favorites feed.'));
    } finally {
      setLoading(false);
    }
  }, [customerUser]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  async function handleUnfollowTeam(teamId: string) {
    if (!customerUser) return;
    try {
      setBusyId(teamId);
      const res = await engagementService.unfollowTeam(teamId);
      updateCustomerUser({ ...customerUser, followedTeamIds: res.followedTeamIds });
      setTeams((prev) => prev.filter((t) => t.id !== teamId));
    } catch (err) {
      setError(extractApiError(err, 'Unable to unfollow team.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleUnfollowPlayer(playerId: string) {
    if (!customerUser) return;
    try {
      setBusyId(playerId);
      const res = await engagementService.unfollowPlayer(playerId);
      updateCustomerUser({ ...customerUser, followedPlayerIds: res.followedPlayerIds });
      setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    } catch (err) {
      setError(extractApiError(err, 'Unable to unfollow player.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleUnfollowTournament(tournamentId: string) {
    if (!customerUser) return;
    try {
      setBusyId(tournamentId);
      const res = await engagementService.unfollowTournament(tournamentId);
      updateCustomerUser({ ...customerUser, followedTournamentIds: res.followedTournamentIds });
      setTournaments((prev) => prev.filter((t) => t.id !== tournamentId));
    } catch (err) {
      setError(extractApiError(err, 'Unable to unfollow tournament.'));
    } finally {
      setBusyId(null);
    }
  }

  if (customerLoading || loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="p-8 bg-white border border-slate-200 rounded-xl text-sm text-slate-500">
          Loading your favorites feed...
        </div>
      </div>
    );
  }

  if (!customerUser) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <EmptyState
          icon={<Bell className="w-6 h-6" />}
          title="Sign in for My Favorites"
          description="Follow your favorite local teams, players, and tournaments to get a personalized hub of live streams, schedules, and results."
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

  const hasAnyFollowed = teams.length > 0 || players.length > 0 || tournaments.length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 inline-flex items-center gap-2">
            <Heart className="w-6 h-6 text-[#EA580C]" />
            <span>My Favorites &amp; Following</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Matches, stats, and schedules for your followed teams, players, and tournaments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/teams"
            className="min-h-[40px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            <Users className="w-4 h-4" />
            <span>Teams</span>
          </Link>
          <Link
            to="/players"
            className="min-h-[40px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            <UserCheck className="w-4 h-4" />
            <span>Players</span>
          </Link>
          <Link
            to="/tournaments"
            className="min-h-[40px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            <Trophy className="w-4 h-4" />
            <span>Tournaments</span>
          </Link>
        </div>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

      {!hasAnyFollowed ? (
        <EmptyState
          icon={<Heart className="w-6 h-6" />}
          title="You aren't following any teams, players, or tournaments yet"
          description="Tap Follow on any team, player profile, or tournament page to build your personalized sports feed."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                to="/tournaments"
                className="min-h-[42px] inline-flex items-center px-4 py-2 rounded-lg bg-[#EA580C] text-white text-sm font-semibold hover:bg-orange-700"
              >
                Explore Tournaments
              </Link>
              <Link
                to="/teams"
                className="min-h-[42px] inline-flex items-center px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
              >
                Explore Teams
              </Link>
            </div>
          }
        />
      ) : (
        <>
          {/* Followed Squads */}
          {teams.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Followed Teams ({teams.length})
              </h2>
              <div className="flex flex-wrap gap-3">
                {teams.map((t) => (
                  <div
                    key={t.id}
                    className="bg-white border border-slate-200 rounded-xl px-3.5 py-2 inline-flex items-center gap-2.5"
                  >
                    <Link to={`/teams/${t.id}`} className="inline-flex items-center gap-2.5 hover:text-[#EA580C]">
                      <TeamAvatar name={t.name} logoUrl={t.logoUrl} size="sm" />
                      <span className="text-sm font-semibold text-slate-900">{t.name}</span>
                    </Link>
                    <button
                      type="button"
                      disabled={busyId === t.id}
                      onClick={() => handleUnfollowTeam(t.id)}
                      aria-label={`Unfollow ${t.name}`}
                      className="p-1 text-slate-400 hover:text-red-600 rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Followed Players */}
          {players.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Followed Players ({players.length})
              </h2>
              <div className="flex flex-wrap gap-3">
                {players.map((p) => (
                  <div
                    key={p.id}
                    className="bg-white border border-slate-200 rounded-xl px-3.5 py-2 inline-flex items-center gap-2.5"
                  >
                    <Link to={`/players/${p.id}`} className="inline-flex items-center gap-2.5 hover:text-[#EA580C]">
                      <TeamAvatar name={p.name} logoUrl={p.avatarUrl} size="sm" />
                      <div>
                        <span className="text-sm font-semibold text-slate-900 block leading-tight">
                          {p.name}
                        </span>
                        <span className="text-[11px] text-slate-500">{p.sportType}</span>
                      </div>
                    </Link>
                    <button
                      type="button"
                      disabled={busyId === p.id}
                      onClick={() => handleUnfollowPlayer(p.id)}
                      aria-label={`Unfollow ${p.name}`}
                      className="p-1 text-slate-400 hover:text-red-600 rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Followed Tournaments */}
          {tournaments.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Followed Tournaments ({tournaments.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {tournaments.map((t) => (
                  <div
                    key={t.id}
                    className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-start justify-between gap-2"
                  >
                    <Link to={`/tournaments/${t.id}`} className="min-w-0 space-y-1">
                      <p className="text-[11px] font-bold uppercase text-[#EA580C]">
                        {t.sportType} · {t.status}
                      </p>
                      <p className="font-semibold text-sm text-slate-900 truncate">{t.name}</p>
                      {t.location && (
                        <p className="text-xs text-slate-500 inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span>{t.location}</span>
                        </p>
                      )}
                    </Link>
                    <button
                      type="button"
                      disabled={busyId === t.id}
                      onClick={() => handleUnfollowTournament(t.id)}
                      aria-label={`Unfollow ${t.name}`}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

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
