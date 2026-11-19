import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, MapPin, Search, Trophy } from 'lucide-react';
import { TournamentData } from '../../types/index.ts';
import { SPORT_OPTIONS } from '../../constants/sports.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { CardGridSkeleton } from '../../components/common/LoadingSkeleton.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';

export function TournamentsPage() {
  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [regFilter, setRegFilter] = useState('');

  useEffect(() => {
    entityService
      .listTournaments()
      .then(setTournaments)
      .catch((err) => setError(extractApiError(err, 'Unable to load tournaments.')))
      .finally(() => setLoading(false));
  }, []);

  const locations = useMemo(() => {
    const set = new Set<string>();
    tournaments.forEach((t) => {
      if (t.location?.trim()) set.add(t.location.trim());
    });
    return Array.from(set).sort();
  }, [tournaments]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return tournaments.filter((t) => {
      if (sportFilter && t.sportType !== sportFilter) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      if (locationFilter && (t.location || '').trim() !== locationFilter) return false;
      if (regFilter === 'open' && !(t.registrationOpen && t.status !== 'COMPLETED')) return false;
      if (regFilter === 'closed' && t.registrationOpen && t.status !== 'COMPLETED') return false;
      if (q) {
        const hay = `${t.name} ${t.location || ''} ${t.organizerName || ''} ${t.sportType}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tournaments, searchTerm, sportFilter, statusFilter, locationFilter, regFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Tournaments</h1>
        <p className="text-sm text-slate-500 mt-1">
          Explore active, upcoming, and completed grassroots cups hosted on MaidanLive.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search cup, city, organizer..."
            className="w-full min-h-[40px] pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
          />
        </div>

        <select
          value={sportFilter}
          onChange={(e) => setSportFilter(e.target.value)}
          className="min-h-[40px] px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
        >
          <option value="">All Sports</option>
          {SPORT_OPTIONS.map((sp) => (
            <option key={sp} value={sp}>
              {sp}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-h-[40px] px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
        >
          <option value="">All Statuses</option>
          <option value="ONGOING">Ongoing</option>
          <option value="UPCOMING">Upcoming</option>
          <option value="COMPLETED">Completed</option>
        </select>

        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="min-h-[40px] px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
        >
          <option value="">All Locations</option>
          {locations.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </select>

        <select
          value={regFilter}
          onChange={(e) => setRegFilter(e.target.value)}
          className="min-h-[40px] px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
        >
          <option value="">All Registration States</option>
          <option value="open">Registration Open</option>
          <option value="closed">Registration Closed</option>
        </select>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <CardGridSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Trophy className="w-6 h-6" />}
          title={tournaments.length === 0 ? 'No tournaments created yet' : 'No matching tournaments'}
          description={
            tournaments.length === 0
              ? 'Tournaments added by organizers will appear here with linked match broadcasts and teams.'
              : 'Try adjusting your sport, status, location, or search filter.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((t) => (
            <Link
              key={t.id}
              to={`/tournaments/${t.id}`}
              className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-bold text-[#EA580C] uppercase">{t.sportType}</span>
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
                  {t.registrationOpen && t.status !== 'COMPLETED' && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold text-[11px]">
                        Reg Open
                      </span>
                    </>
                  )}
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
                {t.prizeMoney && (
                  <span className="text-amber-800 font-semibold ml-auto">
                    {t.prizeMoney}
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
