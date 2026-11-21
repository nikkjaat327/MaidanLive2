import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, BellPlus, Calendar, Check, Trophy, Users } from 'lucide-react';
import { FixtureData, LiveStreamData, PlayerData, TeamData } from '../../types/index.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { engagementService } from '../../services/engagement/engagementService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { recentlyWatchedStore } from '../../utils/recentlyWatched.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { TeamAvatar } from '../../components/common/TeamAvatar.tsx';
import { StreamCard } from '../../components/streaming/StreamCard.tsx';
import { ShareButton } from '../../components/common/ShareButton.tsx';
import { buildTeamUrl } from '../../utils/shareUrl.ts';

export function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { customerUser, updateCustomerUser } = useAuth();
  const [team, setTeam] = useState<TeamData | null>(null);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [fixtures, setFixtures] = useState<FixtureData[]>([]);
  const [record, setRecord] = useState<{ played: number; won: number; lost: number; drawn: number }>({
    played: 0,
    won: 0,
    lost: 0,
    drawn: 0,
  });
  const [followBusy, setFollowBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    entityService
      .getTeamProfile(id)
      .then((res) => {
        setTeam(res.team);
        setPlayers(res.players || []);
        setStreams(res.streams || []);
        setFixtures(res.fixtures || []);
        setRecord(res.record || { played: 0, won: 0, lost: 0, drawn: 0 });
        if (res.team) {
          recentlyWatchedStore.recordTeam({
            id: res.team.id,
            name: res.team.name,
            sportType: res.team.sportType,
            logoUrl: res.team.logoUrl,
          });
        }
      })
      .catch((err) => setError(extractApiError(err, 'Unable to load team profile.')))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleToggleFollow() {
    if (!team) return;
    if (!customerUser) {
      setError('Sign in to follow this team and receive match alerts.');
      return;
    }
    const isFollowing = (customerUser.followedTeamIds || []).includes(team.id);
    try {
      setFollowBusy(true);
      const res = isFollowing
        ? await engagementService.unfollowTeam(team.id)
        : await engagementService.followTeam(team.id);
      updateCustomerUser({ ...customerUser, followedTeamIds: res.followedTeamIds });
      setTeam((prev) => (prev ? { ...prev, followersCount: res.followersCount } : prev));
    } catch (err) {
      setError(extractApiError(err, 'Failed to update follow status.'));
    } finally {
      setFollowBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 rounded w-52" />
        <div className="h-36 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-4">
        <FeedbackBanner type="error" message={error || 'Team not found.'} />
        <Link to="/teams" className="inline-flex items-center gap-2 text-sm text-slate-700">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Teams</span>
        </Link>
      </div>
    );
  }

  const isFollowing = Boolean(customerUser?.followedTeamIds?.includes(team.id));
  const tourObj = typeof team.tournamentId === 'object' && team.tournamentId ? team.tournamentId : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
      <Link
        to="/teams"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>All Teams</span>
      </Link>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

      {/* Team Hero Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4 min-w-0">
          <TeamAvatar name={team.name} logoUrl={team.logoUrl} size="lg" />
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-900">{team.sportType}</span>
              {team.shortName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{team.shortName}</span>
                </>
              )}
              {team.city && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{team.city}</span>
                </>
              )}
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
              {team.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              {team.captainName && <span>Captain: {team.captainName}</span>}
              {tourObj && (
                <Link
                  to={`/tournaments/${tourObj._id}`}
                  className="text-emerald-700 font-semibold hover:underline"
                >
                  {tourObj.name}
                </Link>
              )}
              <span className="font-mono tabular-nums">
                {team.followersCount || 0} follower{(team.followersCount || 0) === 1 ? '' : 's'}
              </span>
            </div>
            {team.bio && <p className="text-sm text-slate-600 pt-1 max-w-2xl">{team.bio}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:justify-end">
          <button
            type="button"
            disabled={followBusy}
            onClick={handleToggleFollow}
            className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              isFollowing
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            {isFollowing ? <Check className="w-3.5 h-3.5" /> : <BellPlus className="w-3.5 h-3.5" />}
            <span>{isFollowing ? 'Following Team' : 'Follow Team'}</span>
          </button>
          <ShareButton
            compact
            title={team.name}
            text={`Follow ${team.name} on MaidanLive`}
            url={buildTeamUrl(team.id)}
            shareCard={{
              type: 'TEAM',
              teamId: team.id,
              teamName: team.name,
              shortName: team.shortName,
              sport: team.sportType,
              city: team.city,
              captainName: team.captainName,
              tournamentName: tourObj?.name,
              teamLogoUrl: team.logoUrl,
              record,
              players: players.map((p) => ({
                name: p.name,
                role: p.role || p.position,
                jerseyNumber: p.jerseyNumber,
                avatarUrl: p.avatarUrl,
              })),
              shareUrl: buildTeamUrl(team.id),
            }}
          />
        </div>
      </div>

      {/* Confirmed Match Record */}
      {record.played > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Confirmed Matches', val: record.played },
            { label: 'Won', val: record.won },
            { label: 'Lost', val: record.lost },
            { label: 'Draw / Tie', val: record.drawn },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white border border-slate-200 rounded-xl p-4 text-center"
            >
              <p className="text-xs text-slate-500">{stat.label}</p>
              <p className="font-mono text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                {stat.val}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Squad Roster */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-emerald-600" />
          <h2 className="font-display text-xl font-bold text-slate-900">
            Squad Roster ({players.length})
          </h2>
        </div>
        {players.length === 0 ? (
          <div className="p-6 bg-white border border-slate-200 rounded-xl text-sm text-slate-500">
            No players registered under this team yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {players.map((p) => (
              <Link
                key={p.id}
                to={`/players/${p.id}`}
                className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-emerald-400 transition-colors"
              >
                <TeamAvatar name={p.name} logoUrl={p.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-slate-900 truncate">{p.name}</p>
                    {p.isVerified && (
                      <BadgeCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    {[
                      p.role || p.position,
                      p.jerseyNumber !== null && p.jerseyNumber !== undefined
                        ? `#${p.jerseyNumber}`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ') || p.sportType}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Fixtures */}
      {fixtures.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-amber-600" />
            <h2 className="font-display text-xl font-bold text-slate-900">
              Scheduled Fixtures ({fixtures.length})
            </h2>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {fixtures.map((fx) => {
              const linkedStreamId =
                typeof fx.liveStreamId === 'object' && fx.liveStreamId
                  ? (fx.liveStreamId as any)._id || (fx.liveStreamId as any).id
                  : fx.liveStreamId;
              return (
                <div key={fx.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 text-sm truncate">
                      {fx.teamAName || 'TBD'} vs {fx.teamBName || 'TBD'}
                    </p>
                    <p className="text-slate-500 mt-0.5">
                      {fx.roundName || `Round ${fx.roundNumber}`}
                      {fx.scheduledAt ? ` · ${new Date(fx.scheduledAt).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                      {fx.status}
                    </span>
                    {linkedStreamId && (
                      <Link
                        to={`/live/${linkedStreamId}`}
                        className="px-2.5 py-1 rounded bg-slate-900 text-white font-semibold hover:bg-slate-800"
                      >
                        Match Center
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Team Broadcasts */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-emerald-600" />
          <h2 className="font-display text-xl font-bold text-slate-900">
            Matches &amp; Broadcasts ({streams.length})
          </h2>
        </div>
        {streams.length === 0 ? (
          <div className="p-6 bg-white border border-slate-200 rounded-xl text-sm text-slate-500">
            No live or archived broadcasts linked to this team yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {streams.map((s) => (
              <StreamCard key={s.id} stream={s} to={`/live/${s.id}`} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
