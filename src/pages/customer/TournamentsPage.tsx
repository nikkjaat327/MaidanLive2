import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, MapPin, Trophy } from 'lucide-react';
import { TournamentData } from '../../types/index.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { CardGridSkeleton } from '../../components/common/LoadingSkeleton.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';

export function TournamentsPage() {
  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    entityService
      .listTournaments()
      .then(setTournaments)
      .catch((err) => setError(extractApiError(err, 'Unable to load tournaments.')))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Tournaments</h1>
        <p className="text-sm text-slate-500 mt-1">
          Explore active, upcoming, and completed tournaments hosted on MaidanLive.
        </p>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <CardGridSkeleton count={6} />
      ) : tournaments.length === 0 ? (
        <EmptyState
          icon={<Trophy className="w-6 h-6" />}
          title="No tournaments created yet"
          description="Tournaments added by organizers will appear here with linked match broadcasts and teams."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {tournaments.map((t) => (
            <Link
              key={t.id}
              to={`/tournaments/${t.id}`}
              className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{t.sportType}</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      t.status === 'ONGOING'
                        ? 'text-emerald-700 font-semibold'
                        : t.status === 'UPCOMING'
                          ? 'text-amber-700 font-medium'
                          : 'text-slate-500'
                    }
                  >
                    {t.status}
                  </span>
                </div>
                <h2 className="font-display text-lg font-bold text-slate-900">{t.name}</h2>
                {t.description && (
                  <p className="text-sm text-slate-600 line-clamp-2">{t.description}</p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                {t.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{t.location}</span>
                  </span>
                )}
                {t.startDate && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(t.startDate).toLocaleDateString()}</span>
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
