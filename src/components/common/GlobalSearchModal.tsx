import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowRight,
  Clock,
  Loader2,
  MapPin,
  Search,
  Trophy,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { SearchResultsPayload } from '../../types/index.ts';
import { TeamAvatar } from './TeamAvatar.tsx';

type QuickSearchCategory = 'all' | 'tournaments' | 'teams' | 'players';

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
  const next = [
    clean,
    ...readRecentSearches().filter((s) => s.toLowerCase() !== clean.toLowerCase()),
  ].slice(0, 6);
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
}

interface NavigableItem {
  key: string;
  to: string;
}

interface GlobalSearchModalProps {
  open: boolean;
  onClose: () => void;
}

export function GlobalSearchModal({ open, onClose }: GlobalSearchModalProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<QuickSearchCategory>('all');
  const [results, setResults] = useState<SearchResultsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => readRecentSearches());
  const [activeIndex, setActiveIndex] = useState(0);

  const debouncedQuery = useDebounce(query.trim(), 280);

  useEffect(() => {
    if (!open) return;
    setRecentSearches(readRecentSearches());
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 30);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!debouncedQuery) {
      setResults(null);
      setLoading(false);
      setError(null);
      setActiveIndex(0);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    async function fetchResults() {
      try {
        setLoading(true);
        setError(null);
        const data = await entityService.globalSearch(debouncedQuery, category, controller.signal);
        if (cancelled) return;
        setResults(data);
        setActiveIndex(0);
      } catch (err) {
        if (cancelled || axios.isCancel(err)) return;
        setError(extractApiError(err, 'Unable to search right now.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchResults();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, debouncedQuery, category]);

  const visibleTournaments = useMemo(() => {
    if (!results) return [];
    if (category !== 'all' && category !== 'tournaments') return [];
    return results.tournaments.slice(0, category === 'all' ? 5 : 12);
  }, [results, category]);

  const visibleTeams = useMemo(() => {
    if (!results) return [];
    if (category !== 'all' && category !== 'teams') return [];
    return results.teams.slice(0, category === 'all' ? 5 : 12);
  }, [results, category]);

  const visiblePlayers = useMemo(() => {
    if (!results) return [];
    if (category !== 'all' && category !== 'players') return [];
    return results.players.slice(0, category === 'all' ? 5 : 12);
  }, [results, category]);

  const flatItems = useMemo<NavigableItem[]>(() => {
    const items: NavigableItem[] = [];
    for (const t of visibleTournaments) {
      items.push({ key: `t-${t.id}`, to: `/tournaments/${t.id}` });
    }
    for (const tm of visibleTeams) {
      items.push({ key: `tm-${tm.id}`, to: `/teams/${tm.id}` });
    }
    for (const p of visiblePlayers) {
      items.push({ key: `p-${p.id}`, to: `/players/${p.id}` });
    }
    return items;
  }, [visibleTournaments, visibleTeams, visiblePlayers]);

  const indexByKey = useMemo(() => {
    const map = new Map<string, number>();
    flatItems.forEach((item, idx) => map.set(item.key, idx));
    return map;
  }, [flatItems]);

  function handleNavigateTo(to: string, termToSave?: string) {
    const term = (termToSave ?? query).trim();
    if (term) {
      setRecentSearches(saveRecentSearch(term));
    }
    onClose();
    navigate(to);
  }

  function handleOpenFullSearch() {
    const trimmed = query.trim();
    if (trimmed) {
      setRecentSearches(saveRecentSearch(trimmed));
      onClose();
      navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    } else {
      onClose();
      navigate('/search');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      if (flatItems.length === 0) return;
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % flatItems.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      if (flatItems.length === 0) return;
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = flatItems[activeIndex];
      if (target) {
        handleNavigateTo(target.to);
      } else if (query.trim()) {
        handleOpenFullSearch();
      }
    }
  }

  if (!open) return null;

  const hasQuery = query.trim().length > 0;
  const totalEntityMatches =
    visibleTournaments.length + visibleTeams.length + visiblePlayers.length;
  const extraMatchesCount =
    (results?.matches.length ?? 0) +
    (results?.venues.length ?? 0) +
    (results?.organizers.length ?? 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global Search"
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-start justify-center p-3 sm:p-6 pt-12 sm:pt-20 overflow-y-auto"
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[82vh]">
        {/* Search Input Header */}
        <div className="p-3 sm:p-4 border-b border-slate-200 flex items-center gap-2.5">
          {loading ? (
            <Loader2 className="w-5 h-5 text-[#EA580C] animate-spin shrink-0" />
          ) : (
            <Search className="w-5 h-5 text-slate-400 shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tournaments, teams, or players..."
            aria-label="Search tournaments, teams, or players"
            className="flex-1 bg-transparent text-sm sm:text-base text-slate-900 placeholder:text-slate-400 focus:outline-none min-w-0"
          />
          {hasQuery && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults(null);
                inputRef.current?.focus();
              }}
              aria-label="Clear search query"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          >
            ESC
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="px-3 sm:px-4 py-2 border-b border-slate-100 bg-slate-50/70 flex items-center gap-1.5 overflow-x-auto">
          {[
            { id: 'all' as const, label: 'All' },
            {
              id: 'tournaments' as const,
              label: `Tournaments${results ? ` (${results.tournaments.length})` : ''}`,
            },
            {
              id: 'teams' as const,
              label: `Teams${results ? ` (${results.teams.length})` : ''}`,
            },
            {
              id: 'players' as const,
              label: `Players${results ? ` (${results.players.length})` : ''}`,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategory(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                category === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          {!hasQuery ? (
            <div className="space-y-4">
              {recentSearches.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 inline-flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Recent Searches</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          localStorage.removeItem(RECENT_SEARCHES_KEY);
                        } catch {
                          // ignore
                        }
                        setRecentSearches([]);
                      }}
                      className="text-[11px] text-slate-400 hover:text-slate-700"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => setQuery(term)}
                        className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 hover:border-[#EA580C] hover:text-[#EA580C] transition-colors"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Quick Browse
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleNavigateTo('/tournaments')}
                    className="p-3 rounded-xl border border-slate-200 hover:border-orange-300 bg-white text-left flex items-center gap-2.5 transition-colors"
                  >
                    <Trophy className="w-4 h-4 text-[#EA580C] shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-slate-900">Tournaments</p>
                      <p className="text-[11px] text-slate-500">Cups &amp; brackets</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigateTo('/teams')}
                    className="p-3 rounded-xl border border-slate-200 hover:border-emerald-300 bg-white text-left flex items-center gap-2.5 transition-colors"
                  >
                    <Users className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-slate-900">Teams</p>
                      <p className="text-[11px] text-slate-500">Squads &amp; cities</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigateTo('/players')}
                    className="p-3 rounded-xl border border-slate-200 hover:border-sky-300 bg-white text-left flex items-center gap-2.5 transition-colors"
                  >
                    <UserCheck className="w-4 h-4 text-sky-600 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-slate-900">Players</p>
                      <p className="text-[11px] text-slate-500">Profiles &amp; stats</p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          ) : loading && !results ? (
            <div className="py-10 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
              <Loader2 className="w-5 h-5 text-[#EA580C] animate-spin" />
              <span>Searching tournaments, teams, and players...</span>
            </div>
          ) : results && totalEntityMatches === 0 ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-800">
                No tournaments, teams, or players found for &ldquo;{debouncedQuery || query}&rdquo;
              </p>
              <p className="text-xs text-slate-500">
                Try another keyword or check full search for live matches and venues.
              </p>
              {extraMatchesCount > 0 && (
                <button
                  type="button"
                  onClick={handleOpenFullSearch}
                  className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                >
                  <span>See {extraMatchesCount} match/venue results</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Tournaments */}
              {visibleTournaments.length > 0 && (
                <section className="space-y-1.5">
                  <h3 className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-[#EA580C]" />
                    <span>Tournaments</span>
                  </h3>
                  <div className="space-y-1">
                    {visibleTournaments.map((t) => {
                      const idx = indexByKey.get(`t-${t.id}`);
                      const isActive = idx === activeIndex;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onMouseEnter={() => {
                            if (typeof idx === 'number') setActiveIndex(idx);
                          }}
                          onClick={() => handleNavigateTo(`/tournaments/${t.id}`)}
                          className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors ${
                            isActive
                              ? 'bg-orange-50 border border-orange-200'
                              : 'hover:bg-slate-50 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-orange-100 text-[#EA580C] flex items-center justify-center shrink-0">
                              <Trophy className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {t.name}
                              </p>
                              <p className="text-xs text-slate-500 truncate flex items-center gap-1.5">
                                <span className="font-semibold text-[#EA580C]">{t.sportType}</span>
                                <span aria-hidden="true">·</span>
                                <span>{t.status}</span>
                                {t.location && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="inline-flex items-center gap-0.5 truncate">
                                      <MapPin className="w-3 h-3 shrink-0" />
                                      <span className="truncate">{t.location}</span>
                                    </span>
                                  </>
                                )}
                              </p>
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Teams */}
              {visibleTeams.length > 0 && (
                <section className="space-y-1.5">
                  <h3 className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Teams</span>
                  </h3>
                  <div className="space-y-1">
                    {visibleTeams.map((tm) => {
                      const idx = indexByKey.get(`tm-${tm.id}`);
                      const isActive = idx === activeIndex;
                      return (
                        <button
                          key={tm.id}
                          type="button"
                          onMouseEnter={() => {
                            if (typeof idx === 'number') setActiveIndex(idx);
                          }}
                          onClick={() => handleNavigateTo(`/teams/${tm.id}`)}
                          className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors ${
                            isActive
                              ? 'bg-emerald-50 border border-emerald-200'
                              : 'hover:bg-slate-50 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <TeamAvatar name={tm.name} logoUrl={tm.logoUrl} size="sm" />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {tm.name}
                                {tm.shortName ? (
                                  <span className="ml-1.5 text-[11px] font-mono text-slate-400">
                                    ({tm.shortName})
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-xs text-slate-500 truncate">
                                {[tm.sportType, tm.city, tm.captainName ? `Capt: ${tm.captainName}` : '']
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Players */}
              {visiblePlayers.length > 0 && (
                <section className="space-y-1.5">
                  <h3 className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-sky-600" />
                    <span>Players</span>
                  </h3>
                  <div className="space-y-1">
                    {visiblePlayers.map((p) => {
                      const idx = indexByKey.get(`p-${p.id}`);
                      const isActive = idx === activeIndex;
                      const teamObj =
                        p.teamId && typeof p.teamId === 'object' ? p.teamId : null;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onMouseEnter={() => {
                            if (typeof idx === 'number') setActiveIndex(idx);
                          }}
                          onClick={() => handleNavigateTo(`/players/${p.id}`)}
                          className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors ${
                            isActive
                              ? 'bg-sky-50 border border-sky-200'
                              : 'hover:bg-slate-50 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <TeamAvatar name={p.name} logoUrl={p.avatarUrl} size="sm" />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {p.name}
                              </p>
                              <p className="text-xs text-slate-500 truncate">
                                {[p.sportType, p.role || p.position, teamObj?.name]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-3 sm:px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="hidden sm:flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px]">
                ↑↓
              </kbd>{' '}
              Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px]">
                ↵
              </kbd>{' '}
              Open
            </span>
          </div>
          <button
            type="button"
            onClick={handleOpenFullSearch}
            className="ml-auto inline-flex items-center gap-1 font-semibold text-[#EA580C] hover:underline"
          >
            <span>
              {hasQuery
                ? `Open full search results for "${query.trim()}"`
                : 'Open advanced search page'}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
