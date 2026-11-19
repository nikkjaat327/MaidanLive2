import { useEffect, useMemo, useState } from 'react';
import { Calendar as CalendarIcon, Filter } from 'lucide-react';
import { LiveStreamData, TournamentData } from '../../types/index.ts';
import { SPORT_OPTIONS } from '../../constants/sports.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { resolveMatchStatus, STANDARD_MATCH_STATUSES, StandardMatchStatus } from '../../utils/matchStatus.ts';
import { StreamCard } from '../../components/streaming/StreamCard.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { CardGridSkeleton } from '../../components/common/LoadingSkeleton.tsx';

type DateRangeTab = 'all' | 'today' | 'tomorrow' | 'weekend' | 'upcoming' | 'custom';

function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function CalendarPage() {
  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateTab, setDateTab] = useState<DateRangeTab>('all');
  const [customDate, setCustomDate] = useState(() => toLocalDateKey(new Date()));
  const [sportFilter, setSportFilter] = useState('');
  const [tournamentFilter, setTournamentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StandardMatchStatus | ''>('');

  useEffect(() => {
    Promise.all([
      liveStreamService.listStreams({ limit: 100 }),
      entityService.listTournaments().catch(() => [] as TournamentData[]),
    ])
      .then(([sList, tList]) => {
        setStreams(sList);
        setTournaments(tList);
      })
      .catch((err) => setError(extractApiError(err, 'Unable to load match schedule.')))
      .finally(() => setLoading(false));
  }, []);

  const filteredStreams = useMemo(() => {
    const now = new Date();
    const todayKey = toLocalDateKey(now);
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowKey = toLocalDateKey(tomorrow);

    // Next Saturday & Sunday (including today if weekend)
    const weekendKeys = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + i);
      const dayOfWeek = candidate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        weekendKeys.add(toLocalDateKey(candidate));
      }
      if (weekendKeys.size >= 2 && dayOfWeek === 0) break;
    }

    return streams
      .filter((s) => {
        if (sportFilter && s.gameName !== sportFilter) return false;
        if (tournamentFilter && String(s.tournamentId || '') !== tournamentFilter) return false;

        const stdStatus = resolveMatchStatus(s, s.score || null);
        if (statusFilter && stdStatus !== statusFilter) return false;

        const dateSrc = s.matchDate || s.startedAt || s.createdAt;
        const parsed = dateSrc ? new Date(dateSrc) : null;
        const key = parsed && !Number.isNaN(parsed.getTime()) ? toLocalDateKey(parsed) : '';

        if (dateTab === 'today') return key === todayKey || s.status === 'LIVE';
        if (dateTab === 'tomorrow') return key === tomorrowKey;
        if (dateTab === 'weekend') return Boolean(key && weekendKeys.has(key));
        if (dateTab === 'upcoming') {
          return stdStatus === 'UPCOMING' || stdStatus === 'LIVE' || Boolean(parsed && parsed >= now);
        }
        if (dateTab === 'custom') return key === customDate;
        return true;
      })
      .sort((a, b) => {
        const ta = new Date(a.matchDate || a.startedAt || a.createdAt).getTime();
        const tb = new Date(b.matchDate || b.startedAt || b.createdAt).getTime();
        return tb - ta;
      });
  }, [streams, dateTab, customDate, sportFilter, tournamentFilter, statusFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 inline-flex items-center gap-2.5">
          <CalendarIcon className="w-6 h-6 text-[#EA580C]" />
          <span>Match Calendar &amp; Schedule</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Browse live, upcoming, and scheduled matches by day, sport, or tournament.
        </p>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

      {/* Date Range Quick Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'all' as const, label: 'All Dates' },
          { id: 'today' as const, label: 'Today' },
          { id: 'tomorrow' as const, label: 'Tomorrow' },
          { id: 'weekend' as const, label: 'This Weekend' },
          { id: 'upcoming' as const, label: 'Upcoming' },
          { id: 'custom' as const, label: 'Pick Date' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setDateTab(tab.id)}
            className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
              dateTab === tab.id
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}

        {dateTab === 'custom' && (
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="min-h-[40px] px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
          />
        )}
      </div>

      {/* Filters Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
          <Filter className="w-3.5 h-3.5" />
          <span>Filter:</span>
        </span>

        <select
          value={sportFilter}
          onChange={(e) => setSportFilter(e.target.value)}
          className="min-h-[38px] px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
        >
          <option value="">All Sports</option>
          {SPORT_OPTIONS.map((sp) => (
            <option key={sp} value={sp}>
              {sp}
            </option>
          ))}
        </select>

        <select
          value={tournamentFilter}
          onChange={(e) => setTournamentFilter(e.target.value)}
          className="min-h-[38px] px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg max-w-[220px]"
        >
          <option value="">All Tournaments</option>
          {tournaments.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StandardMatchStatus | '')}
          className="min-h-[38px] px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
        >
          <option value="">All Match Statuses</option>
          {STANDARD_MATCH_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>

        {(sportFilter || tournamentFilter || statusFilter || dateTab !== 'all') && (
          <button
            type="button"
            onClick={() => {
              setSportFilter('');
              setTournamentFilter('');
              setStatusFilter('');
              setDateTab('all');
            }}
            className="text-xs font-semibold text-[#EA580C] hover:underline ml-auto"
          >
            Reset Filters
          </button>
        )}
      </div>

      {loading ? (
        <CardGridSkeleton count={6} />
      ) : filteredStreams.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon className="w-6 h-6" />}
          title="No matches match your schedule filters"
          description="Try switching the date range or clearing the sport/tournament filters."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredStreams.map((s) => (
            <StreamCard key={s.id} stream={s} to={`/live/${s.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
