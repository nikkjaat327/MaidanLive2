import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Award,
  Calendar,
  ExternalLink,
  GitBranch,
  MapPin,
  Table2,
  Trophy,
  Users,
} from 'lucide-react';
import {
  FixtureData,
  LeaderboardEntry,
  LiveStreamData,
  PointsTableRow,
  TeamData,
  TournamentData,
  VenueData,
} from '../../types/index.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { StreamCard } from '../../components/streaming/StreamCard.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { TeamAvatar } from '../../components/common/TeamAvatar.tsx';
import { TournamentBracket } from '../../components/tournaments/TournamentBracket.tsx';

type TournamentTab = 'matches' | 'bracket' | 'standings' | 'teams' | 'leaderboards';

export function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<TournamentData | null>(null);
  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [fixtures, setFixtures] = useState<FixtureData[]>([]);
  const [pointsTable, setPointsTable] = useState<PointsTableRow[]>([]);
  const [venue, setVenue] = useState<VenueData | null>(null);
  const [leaderboards, setLeaderboards] = useState<{
    entries: LeaderboardEntry[];
    insufficientData: boolean;
    message?: string;
  }>({ entries: [], insufficientData: true });
  const [activeTab, setActiveTab] = useState<TournamentTab>('matches');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    entityService
      .getTournamentDetail(id)
      .then((res) => {
        setTournament(res.tournament);
        setStreams(res.streams);
        setTeams(res.teams);
        setFixtures(res.fixtures || []);
        setPointsTable(res.pointsTable || []);
        setVenue(res.venue || null);
        return platformOpsService
          .getLeaderboards({
            tournamentId: id,
            sportType: res.tournament.sportType,
          })
          .then(setLeaderboards)
          .catch(() => {});
      })
      .catch((err) => setError(extractApiError(err, 'Unable to load tournament details.')))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 rounded w-64" />
        <div className="h-32 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-4">
        <FeedbackBanner type="error" message={error || 'Tournament not found.'} />
        <Link to="/tournaments" className="inline-flex items-center gap-2 text-sm text-slate-700">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Tournaments</span>
        </Link>
      </div>
    );
  }

  const mapsUrl =
    venue && typeof venue.latitude === 'number' && typeof venue.longitude === 'number'
      ? `https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`
      : venue
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            [venue.name, venue.address, venue.city, venue.state].filter(Boolean).join(', ')
          )}`
        : tournament.location
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tournament.location)}`
          : null;

  const isCricket = tournament.sportType === 'Cricket';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <Link
        to="/tournaments"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>All Tournaments</span>
      </Link>

      {/* Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            {tournament.logoUrl && (
              <img
                src={tournament.logoUrl}
                alt={tournament.name}
                className="w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0"
              />
            )}
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-900">{tournament.sportType}</span>
                {tournament.format && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                      {tournament.format.replace('_', ' ')}
                    </span>
                  </>
                )}
                {tournament.season && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{tournament.season}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-emerald-700">{tournament.status}</span>
              </div>

              <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
                {tournament.name}
              </h1>

              {tournament.organizerName && (
                <p className="text-xs text-slate-500">Organized by {tournament.organizerName}</p>
              )}
            </div>
          </div>
        </div>

        {tournament.description && (
          <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
            {tournament.description}
          </p>
        )}

        {(tournament.rules || tournament.qualificationRules) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {tournament.rules && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                <p className="font-bold text-slate-900 mb-1">Tournament Rules</p>
                <p className="whitespace-pre-line">{tournament.rules}</p>
              </div>
            )}
            {tournament.qualificationRules && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                <p className="font-bold text-slate-900 mb-1">Qualification Rules</p>
                <p className="whitespace-pre-line">{tournament.qualificationRules}</p>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-5 text-xs text-slate-500 pt-2">
          {(venue?.name || tournament.location) && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              <span>{venue ? `${venue.name}${venue.city ? `, ${venue.city}` : ''}` : tournament.location}</span>
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-semibold"
                >
                  <span>Directions</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </span>
          )}
          {tournament.startDate && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              <span>
                {new Date(tournament.startDate).toLocaleDateString()}
                {tournament.endDate ? ` – ${new Date(tournament.endDate).toLocaleDateString()}` : ''}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { key: 'matches' as const, label: `Matches (${streams.length})`, icon: Trophy },
          { key: 'bracket' as const, label: `Bracket & Fixtures (${fixtures.length})`, icon: GitBranch },
          { key: 'standings' as const, label: `Points Table (${pointsTable.length})`, icon: Table2 },
          { key: 'teams' as const, label: `Teams (${teams.length})`, icon: Users },
          { key: 'leaderboards' as const, label: 'Leaderboards', icon: Award },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors ${
                activeTab === tab.key
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'matches' && (
        <section className="space-y-4">
          {streams.length === 0 ? (
            <EmptyState
              icon={<Trophy className="w-6 h-6" />}
              title="No matches linked yet"
              description="Streams associated with this tournament will show here."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {streams.map((s) => (
                <StreamCard key={s.id} stream={s} to={`/live/${s.id}`} />
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'bracket' && <TournamentBracket fixtures={fixtures} />}

      {activeTab === 'standings' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {pointsTable.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Points table standings will populate automatically once teams and confirmed match results are recorded.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-white uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-3 py-3">Grp</th>
                    <th className="px-3 py-3 text-right">P</th>
                    <th className="px-3 py-3 text-right">W</th>
                    <th className="px-3 py-3 text-right">L</th>
                    <th className="px-3 py-3 text-right">D/T</th>
                    <th className="px-3 py-3 text-right">NR</th>
                    <th className="px-3 py-3 text-right">Pts</th>
                    <th className="px-4 py-3 text-right">{isCricket ? 'NRR' : 'Diff'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {pointsTable.map((row, idx) => (
                    <tr key={row.teamId} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-500 font-bold">{idx + 1}</td>
                      <td className="px-4 py-3 font-sans">
                        <Link
                          to={`/teams/${row.teamId}`}
                          className="inline-flex items-center gap-2.5 font-semibold text-slate-900 hover:text-emerald-700"
                        >
                          <TeamAvatar name={row.teamName} logoUrl={row.logoUrl} size="sm" />
                          <span>{row.teamName}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-slate-500">{row.groupName || '—'}</td>
                      <td className="px-3 py-3 text-right">{row.played}</td>
                      <td className="px-3 py-3 text-right text-emerald-700 font-semibold">{row.won}</td>
                      <td className="px-3 py-3 text-right text-red-600">{row.lost}</td>
                      <td className="px-3 py-3 text-right">{row.drawn + row.tied}</td>
                      <td className="px-3 py-3 text-right">{row.noResult}</td>
                      <td className="px-3 py-3 text-right font-bold text-slate-900">{row.points}</td>
                      <td className="px-4 py-3 text-right">
                        {isCricket
                          ? row.netRunRate !== null
                            ? row.netRunRate.toFixed(3)
                            : '0.000'
                          : row.scoreDiff >= 0
                            ? `+${row.scoreDiff}`
                            : row.scoreDiff}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'teams' && (
        <section>
          {teams.length === 0 ? (
            <EmptyState
              icon={<Users className="w-6 h-6" />}
              title="No teams assigned yet"
              description="Participating teams added to this tournament will appear here."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {teams.map((team) => (
                <Link
                  key={team.id}
                  to={`/teams/${team.id}`}
                  className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-emerald-400 transition-colors"
                >
                  <TeamAvatar name={team.name} logoUrl={team.logoUrl} />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{team.name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {[team.city, team.captainName ? `Capt: ${team.captainName}` : '']
                        .filter(Boolean)
                        .join(' · ') || team.sportType}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'leaderboards' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          {leaderboards.insufficientData || leaderboards.entries.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              {leaderboards.message ||
                'No verified tournament player statistics have been recorded yet.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
                  <tr>
                    <th className="px-3 py-2.5">Player</th>
                    <th className="px-3 py-2.5">Team</th>
                    <th className="px-3 py-2.5 text-right">Matches</th>
                    {isCricket ? (
                      <>
                        <th className="px-3 py-2.5 text-right">Runs</th>
                        <th className="px-3 py-2.5 text-right">Wkts</th>
                      </>
                    ) : tournament.sportType === 'Kabaddi' ? (
                      <>
                        <th className="px-3 py-2.5 text-right">Raid Pts</th>
                        <th className="px-3 py-2.5 text-right">Tackle Pts</th>
                      </>
                    ) : tournament.sportType === 'Football' ? (
                      <>
                        <th className="px-3 py-2.5 text-right">Goals</th>
                        <th className="px-3 py-2.5 text-right">Assists</th>
                      </>
                    ) : (
                      <>
                        <th className="px-3 py-2.5 text-right">Attacks</th>
                        <th className="px-3 py-2.5 text-right">Blocks</th>
                      </>
                    )}
                    <th className="px-3 py-2.5 text-right">MVP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaderboards.entries.map((entry) => (
                    <tr key={entry.playerId} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-semibold">
                        <Link
                          to={`/players/${entry.playerId}`}
                          className="text-slate-900 hover:text-emerald-700"
                        >
                          {entry.playerName}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{entry.teamName || '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{entry.matches}</td>
                      {isCricket ? (
                        <>
                          <td className="px-3 py-2.5 text-right font-mono font-bold">
                            {entry.runs ?? 0}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">{entry.wickets ?? 0}</td>
                        </>
                      ) : tournament.sportType === 'Kabaddi' ? (
                        <>
                          <td className="px-3 py-2.5 text-right font-mono font-bold">
                            {entry.raidPoints ?? 0}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">
                            {entry.tacklePoints ?? 0}
                          </td>
                        </>
                      ) : tournament.sportType === 'Football' ? (
                        <>
                          <td className="px-3 py-2.5 text-right font-mono font-bold">
                            {entry.goals ?? 0}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">{entry.assists ?? 0}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2.5 text-right font-mono font-bold">
                            {entry.attackPoints ?? 0}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">
                            {entry.blockPoints ?? 0}
                          </td>
                        </>
                      )}
                      <td className="px-3 py-2.5 text-right font-mono text-amber-700 font-bold">
                        {entry.mvpAwards ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
