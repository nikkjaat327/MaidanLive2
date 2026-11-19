import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, UserCheck } from 'lucide-react';
import { PlayerData } from '../../types/index.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { SPORT_OPTIONS } from '../../constants/sports.ts';
import { CardGridSkeleton } from '../../components/common/LoadingSkeleton.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { TeamAvatar } from '../../components/common/TeamAvatar.tsx';

export function PlayersPage() {
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    entityService
      .listPlayers({
        ...(sportFilter ? { sportType: sportFilter } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      })
      .then(setPlayers)
      .catch((err) => setError(extractApiError(err, 'Unable to load players.')))
      .finally(() => setLoading(false));
  }, [sportFilter, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Players</h1>
          <p className="text-sm text-slate-500 mt-1">
            Athlete roster profiles registered across participating teams.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players..."
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
      ) : players.length === 0 ? (
        <EmptyState
          icon={<UserCheck className="w-6 h-6" />}
          title="No players found"
          description="Try clearing your filter or check back once rosters are published."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {players.map((player) => {
            const teamName =
              typeof player.teamId === 'object' && player.teamId ? player.teamId.name : '';
            return (
              <Link
                key={player.id}
                to={`/players/${player.id}`}
                className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4 hover:border-emerald-400 transition-colors"
              >
                <TeamAvatar name={player.name} logoUrl={player.avatarUrl} size="lg" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{player.sportType}</span>
                    {player.role && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{player.role}</span>
                      </>
                    )}
                    {player.jerseyNumber !== null && player.jerseyNumber !== undefined && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">#{player.jerseyNumber}</span>
                      </>
                    )}
                  </div>
                  <h2 className="font-display text-lg font-bold text-slate-900 truncate">
                    {player.name}
                  </h2>
                  {teamName && (
                    <p className="text-xs font-medium text-emerald-700 truncate">{teamName}</p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
