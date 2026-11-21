import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellPlus, Check, Search, Users } from 'lucide-react';
import { TeamData } from '../../types/index.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { engagementService } from '../../services/engagement/engagementService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { SPORT_OPTIONS } from '../../constants/sports.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { CardGridSkeleton } from '../../components/common/LoadingSkeleton.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { TeamAvatar } from '../../components/common/TeamAvatar.tsx';
import { ShareButton } from '../../components/common/ShareButton.tsx';
import { buildTeamUrl } from '../../utils/shareUrl.ts';

export function TeamsPage() {
  const { customerUser, updateCustomerUser } = useAuth();
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    entityService
      .listTeams({
        ...(sportFilter ? { sportType: sportFilter } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      })
      .then((list) => setTeams(list))
      .catch((err) => setError(extractApiError(err, 'Unable to load teams.')))
      .finally(() => setLoading(false));
  }, [sportFilter, search]);

  async function handleFollowToggle(e: React.MouseEvent, team: TeamData) {
    e.preventDefault();
    e.stopPropagation();
    if (!customerUser) {
      setError('Sign in to follow teams and get live match alerts.');
      return;
    }
    const followed = new Set(customerUser.followedTeamIds || []);
    const isFollowing = followed.has(team.id);
    try {
      setBusyId(team.id);
      const res = isFollowing
        ? await engagementService.unfollowTeam(team.id)
        : await engagementService.followTeam(team.id);
      updateCustomerUser({ ...customerUser, followedTeamIds: res.followedTeamIds });
      setTeams((prev) =>
        prev.map((t) => (t.id === team.id ? { ...t, followersCount: res.followersCount } : t))
      );
    } catch (err) {
      setError(extractApiError(err, 'Unable to update follow status.'));
    } finally {
      setBusyId(null);
    }
  }

  const followedIds = new Set(customerUser?.followedTeamIds || []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Teams</h1>
          <p className="text-sm text-slate-500 mt-1">
            Registered squads and clubs competing across MaidanLive broadcasts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search teams..."
              className="min-h-[40px] pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg w-48 sm:w-56"
            />
          </div>
          <select
            value={sportFilter}
            onChange={(e) => setSportFilter(e.target.value)}
            className="min-h-[40px] px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
          >
            <option value="">All Sports</option>
            {SPORT_OPTIONS.map((sp) => (
              <option key={sp} value={sp}>
                {sp}
              </option>
            ))}
          </select>
        </div>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <CardGridSkeleton count={6} />
      ) : teams.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6" />}
          title="No teams found"
          description="Try clearing your search or filter to view registered squads."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {teams.map((team) => {
            const tourName =
              typeof team.tournamentId === 'object' && team.tournamentId
                ? team.tournamentId.name
                : '';
            const isFollowed = followedIds.has(team.id);
            const squadCount = team.playerCount ?? 0;
            const shareUrl = buildTeamUrl(team.id);
            return (
              <div
                key={team.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex items-start gap-4 hover:border-emerald-400 transition-colors"
              >
                <Link to={`/teams/${team.id}`} className="shrink-0">
                  <TeamAvatar name={team.name} logoUrl={team.logoUrl} size="lg" />
                </Link>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0 truncate">
                      <span>{team.sportType}</span>
                      {team.shortName && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{team.shortName}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={busyId === team.id}
                        onClick={(e) => handleFollowToggle(e, team)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 ${
                          isFollowed
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {isFollowed ? <Check className="w-3 h-3" /> : <BellPlus className="w-3 h-3" />}
                        <span>{isFollowed ? 'Following' : 'Follow'}</span>
                      </button>
                      <ShareButton
                        variant="card-icon"
                        title={team.name}
                        text={`${team.sportType} squad on MaidanLive`}
                        url={shareUrl}
                        shareCard={{
                          type: 'TEAM',
                          teamId: team.id,
                          teamName: team.name,
                          shortName: team.shortName,
                          sport: team.sportType,
                          city: team.city,
                          captainName: team.captainName,
                          tournamentName: tourName || undefined,
                          teamLogoUrl: team.logoUrl,
                          shareUrl,
                        }}
                      />
                    </div>
                  </div>
                  <Link to={`/teams/${team.id}`} className="block space-y-1">
                    <h2 className="font-display text-lg font-bold text-slate-900 truncate hover:text-[#EA580C] transition-colors">
                      {team.name}
                    </h2>
                    {team.city && <p className="text-xs text-slate-500">{team.city}</p>}
                    {team.captainName && (
                      <p className="text-xs text-slate-600">Captain: {team.captainName}</p>
                    )}
                    {tourName && <p className="text-xs text-emerald-700 font-medium">{tourName}</p>}
                    <p className="text-xs font-semibold text-[#EA580C] pt-1 inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      <span>
                        {squadCount} Player{squadCount === 1 ? '' : 's'} · View Squad
                      </span>
                    </p>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
