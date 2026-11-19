import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award } from 'lucide-react';
import { LeaderboardEntry, TournamentData } from '../../types/index.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { SPORT_OPTIONS } from '../../constants/sports.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { TeamAvatar } from '../../components/common/TeamAvatar.tsx';

export function LeaderboardsPage() {
  const [sportType, setSportType] = useState<string>('Cricket');
  const [tournamentId, setTournamentId] = useState<string>('');
  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [insufficientData, setInsufficientData] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    entityService
      .listTournaments()
      .then(setTournaments)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    platformOpsService
      .getLeaderboards({
        sportType,
        ...(tournamentId ? { tournamentId } : {}),
      })
      .then((res) => {
        setEntries(res.entries || []);
        setInsufficientData(Boolean(res.insufficientData));
        setInfoMessage(res.message);
      })
      .catch((err) => setError(extractApiError(err, 'Failed to load leaderboards.')))
      .finally(() => setLoading(false));
  }, [sportType, tournamentId]);

  const sortedEntries = [...entries].sort((a, b) => {
    if (sportType === 'Cricket') return (b.runs || 0) - (a.runs || 0);
    if (sportType === 'Kabaddi') return (b.totalKabaddiPoints || 0) - (a.totalKabaddiPoints || 0);
    if (sportType === 'Football') return (b.goals || 0) - (a.goals || 0);
    if (sportType === 'Volleyball') return (b.attackPoints || 0) - (a.attackPoints || 0);
    return (b.mvpAwards || 0) - (a.mvpAwards || 0);
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Player Leaderboards
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Rankings calculated exclusively from verified match statistics and official events.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={sportType}
            onChange={(e) => setSportType(e.target.value)}
            aria-label="Filter leaderboard by sport"
            className="min-h-[40px] px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
          >
            {SPORT_OPTIONS.filter((s) => s !== 'Other').map((sp) => (
              <option key={sp} value={sp}>
                {sp}
              </option>
            ))}
          </select>

          <select
            value={tournamentId}
            onChange={(e) => setTournamentId(e.target.value)}
            aria-label="Filter leaderboard by tournament"
            className="min-h-[40px] px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg max-w-xs"
          >
            <option value="">All Tournaments</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <div className="p-8 bg-white border border-slate-200 rounded-xl text-sm text-slate-500">
          Calculating verified leaderboards...
        </div>
      ) : insufficientData || sortedEntries.length === 0 ? (
        <EmptyState
          icon={<Award className="w-6 h-6" />}
          title="No verified stats available yet"
          description={
            infoMessage ||
            'Leaderboards stay hidden until verified player match statistics are recorded for this sport or tournament.'
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-white uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Player</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-3 py-3 text-right">Matches</th>
                  {sportType === 'Cricket' && (
                    <>
                      <th className="px-3 py-3 text-right">Runs</th>
                      <th className="px-3 py-3 text-right">Wickets</th>
                    </>
                  )}
                  {sportType === 'Kabaddi' && (
                    <>
                      <th className="px-3 py-3 text-right">Raid Pts</th>
                      <th className="px-3 py-3 text-right">Tackle Pts</th>
                      <th className="px-3 py-3 text-right">Total Pts</th>
                    </>
                  )}
                  {sportType === 'Football' && (
                    <>
                      <th className="px-3 py-3 text-right">Goals</th>
                      <th className="px-3 py-3 text-right">Assists</th>
                    </>
                  )}
                  {sportType === 'Volleyball' && (
                    <>
                      <th className="px-3 py-3 text-right">Attack Pts</th>
                      <th className="px-3 py-3 text-right">Blocks</th>
                      <th className="px-3 py-3 text-right">Aces</th>
                    </>
                  )}
                  <th className="px-4 py-3 text-right">MVP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                {sortedEntries.map((entry, idx) => (
                  <tr key={entry.playerId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-600">#{idx + 1}</td>
                    <td className="px-4 py-3 font-sans">
                      <Link
                        to={`/players/${entry.playerId}`}
                        className="inline-flex items-center gap-2.5 font-semibold text-slate-900 hover:text-emerald-700"
                      >
                        <TeamAvatar name={entry.playerName} logoUrl={entry.avatarUrl} size="sm" />
                        <span>{entry.playerName}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-sans text-slate-600">
                      {entry.teamId ? (
                        <Link to={`/teams/${entry.teamId}`} className="hover:underline">
                          {entry.teamName || '—'}
                        </Link>
                      ) : (
                        entry.teamName || '—'
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">{entry.matches}</td>
                    {sportType === 'Cricket' && (
                      <>
                        <td className="px-3 py-3 text-right font-bold text-slate-900">
                          {entry.runs ?? 0}
                        </td>
                        <td className="px-3 py-3 text-right">{entry.wickets ?? 0}</td>
                      </>
                    )}
                    {sportType === 'Kabaddi' && (
                      <>
                        <td className="px-3 py-3 text-right">{entry.raidPoints ?? 0}</td>
                        <td className="px-3 py-3 text-right">{entry.tacklePoints ?? 0}</td>
                        <td className="px-3 py-3 text-right font-bold text-slate-900">
                          {entry.totalKabaddiPoints ?? 0}
                        </td>
                      </>
                    )}
                    {sportType === 'Football' && (
                      <>
                        <td className="px-3 py-3 text-right font-bold text-slate-900">
                          {entry.goals ?? 0}
                        </td>
                        <td className="px-3 py-3 text-right">{entry.assists ?? 0}</td>
                      </>
                    )}
                    {sportType === 'Volleyball' && (
                      <>
                        <td className="px-3 py-3 text-right font-bold text-slate-900">
                          {entry.attackPoints ?? 0}
                        </td>
                        <td className="px-3 py-3 text-right">{entry.blockPoints ?? 0}</td>
                        <td className="px-3 py-3 text-right">{entry.serveAces ?? 0}</td>
                      </>
                    )}
                    <td className="px-4 py-3 text-right font-bold text-amber-700">
                      {entry.mvpAwards ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
