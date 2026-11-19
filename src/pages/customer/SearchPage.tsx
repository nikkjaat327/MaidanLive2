import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Briefcase,
  Clock,
  MapPin,
  Search as SearchIcon,
  Trophy,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { SearchResultsPayload } from '../../types/index.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { StreamCard } from '../../components/streaming/StreamCard.tsx';
import { TeamAvatar } from '../../components/common/TeamAvatar.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';

type SearchTab = 'all' | 'matches' | 'tournaments' | 'teams' | 'players' | 'venues' | 'organizers';

const RECENT_SEARCHES_KEY = 'maidanlive_recent_searches';

function readRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(term: string): string[] {
  const clean = term.trim();
  if (!clean) return readRecentSearches();
  const next = [clean, ...readRecentSearches().filter((s) => s.toLowerCase() !== clean.toLowerCase())].slice(0, 6);
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get('q') || '';
  const [queryInput, setQueryInput] = useState(initialQ);
  const [activeQuery, setActiveQuery] = useState(initialQ);
  const [activeTab, setActiveTab] = useState<SearchTab>('all');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => readRecentSearches());
  const [results, setResults] = useState<SearchResultsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (q: string, tab: SearchTab) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await entityService.globalSearch(trimmed, tab);
      setResults(data);
      setRecentSearches(saveRecentSearch(trimmed));
    } catch (err) {
      setError(extractApiError(err, 'Search failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const qParam = searchParams.get('q') || '';
    setQueryInput(qParam);
    setActiveQuery(qParam);
    if (qParam.trim()) {
      runSearch(qParam, activeTab);
    } else {
      setResults(null);
    }
  }, [searchParams, activeTab, runSearch]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = queryInput.trim();
    if (!trimmed) {
      setSearchParams({});
      return;
    }
    setSearchParams({ q: trimmed });
  }

  function handleSelectQuick(term: string) {
    setQueryInput(term);
    setSearchParams({ q: term });
  }

  function handleClearRecent() {
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      // ignore
    }
    setRecentSearches([]);
  }

  const totalCount = results
    ? results.matches.length +
      results.tournaments.length +
      results.teams.length +
      results.players.length +
      results.venues.length +
      results.organizers.length
    : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="space-y-3">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
          Search MaidanLive
        </h1>
        <p className="text-sm text-slate-500">
          Find live matches, tournaments, teams, players, grounds, and local organizers.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5 max-w-2xl">
          <div className="relative flex-1">
            <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Search team, player, cricket cup, venue or city..."
              className="w-full min-h-[46px] pl-10 pr-4 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#EA580C]/25 focus:border-[#EA580C]"
            />
          </div>
          <button
            type="submit"
            className="min-h-[46px] px-6 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 whitespace-nowrap"
          >
            Search
          </button>
        </form>

        {recentSearches.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs font-semibold text-slate-500 inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Recent:</span>
            </span>
            {recentSearches.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => handleSelectQuick(term)}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:border-[#EA580C] hover:text-[#EA580C]"
              >
                {term}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClearRecent}
              aria-label="Clear recent searches"
              className="text-[11px] text-slate-400 hover:text-slate-700 inline-flex items-center gap-0.5 ml-1"
            >
              <X className="w-3 h-3" />
              <span>Clear</span>
            </button>
          </div>
        )}
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

      {/* Category Filter Tabs */}
      {activeQuery && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { id: 'all' as const, label: 'All Results' },
            { id: 'matches' as const, label: `Matches (${results?.matches.length ?? 0})` },
            { id: 'tournaments' as const, label: `Tournaments (${results?.tournaments.length ?? 0})` },
            { id: 'teams' as const, label: `Teams (${results?.teams.length ?? 0})` },
            { id: 'players' as const, label: `Players (${results?.players.length ?? 0})` },
            { id: 'venues' as const, label: `Venues (${results?.venues.length ?? 0})` },
            { id: 'organizers' as const, label: `Organizers (${results?.organizers.length ?? 0})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {!activeQuery ? (
        <EmptyState
          icon={<SearchIcon className="w-6 h-6" />}
          title="Search across the entire sports network"
          description="Type a match title, player name, squad, tournament cup, or ground city above."
        />
      ) : loading ? (
        <div className="p-8 bg-white border border-slate-200 rounded-xl text-sm text-slate-500">
          Searching MaidanLive for &ldquo;{activeQuery}&rdquo;...
        </div>
      ) : results && totalCount === 0 ? (
        <EmptyState
          icon={<SearchIcon className="w-6 h-6" />}
          title={`No results for "${activeQuery}"`}
          description="Try a shorter keyword, team name, sport, or venue city."
        />
      ) : (
        results && (
          <div className="space-y-8">
            {/* Matches */}
            {results.matches.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Matches ({results.matches.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {results.matches.map((m) => (
                    <StreamCard key={m.id} stream={m} to={`/live/${m.id}`} />
                  ))}
                </div>
              </section>
            )}

            {/* Tournaments */}
            {results.tournaments.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-display text-lg font-bold text-slate-900 inline-flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-[#EA580C]" />
                  <span>Tournaments ({results.tournaments.length})</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {results.tournaments.map((t) => (
                    <Link
                      key={t.id}
                      to={`/tournaments/${t.id}`}
                      className="bg-white border border-slate-200 rounded-xl p-4 hover:border-orange-300 transition-colors space-y-1.5"
                    >
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-bold text-[#EA580C] uppercase">{t.sportType}</span>
                        <span aria-hidden="true">·</span>
                        <span>{t.status}</span>
                      </div>
                      <p className="font-display font-bold text-slate-900">{t.name}</p>
                      {t.location && (
                        <p className="text-xs text-slate-500 inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{t.location}</span>
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Teams */}
            {results.teams.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-display text-lg font-bold text-slate-900 inline-flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-600" />
                  <span>Teams ({results.teams.length})</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {results.teams.map((tm) => (
                    <Link
                      key={tm.id}
                      to={`/teams/${tm.id}`}
                      className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-emerald-400 transition-colors"
                    >
                      <TeamAvatar name={tm.name} logoUrl={tm.logoUrl} />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{tm.name}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {[tm.sportType, tm.city].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Players */}
            {results.players.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-display text-lg font-bold text-slate-900 inline-flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-sky-600" />
                  <span>Players ({results.players.length})</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {results.players.map((p) => (
                    <Link
                      key={p.id}
                      to={`/players/${p.id}`}
                      className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-sky-400 transition-colors"
                    >
                      <TeamAvatar name={p.name} logoUrl={p.avatarUrl} />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{p.name}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {[p.sportType, p.role].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Venues */}
            {results.venues.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-display text-lg font-bold text-slate-900 inline-flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-amber-600" />
                  <span>Venues &amp; Grounds ({results.venues.length})</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {results.venues.map((v) => (
                    <div
                      key={v.id}
                      className="bg-white border border-slate-200 rounded-xl p-4 space-y-1"
                    >
                      <p className="font-semibold text-slate-900">{v.name}</p>
                      <p className="text-xs text-slate-500">
                        {[v.address, v.city, v.state].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Organizers */}
            {results.organizers.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-display text-lg font-bold text-slate-900 inline-flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-slate-700" />
                  <span>Organizers ({results.organizers.length})</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {results.organizers.map((org) => (
                    <Link
                      key={org.name}
                      to={
                        org.latestTournamentId
                          ? `/tournaments/${org.latestTournamentId}`
                          : '/tournaments'
                      }
                      className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors space-y-1"
                    >
                      <p className="font-semibold text-slate-900">{org.name}</p>
                      <p className="text-xs text-slate-500">
                        {org.tournamentCount} tournament{org.tournamentCount === 1 ? '' : 's'}
                        {org.sports.length > 0 ? ` · ${org.sports.join(', ')}` : ''}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        )
      )}
    </div>
  );
}
