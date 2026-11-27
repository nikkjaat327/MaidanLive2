import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowRight,
  Award,
  BarChart3,
  CalendarRange,
  Camera,
  ClipboardCheck,
  CreditCard,
  Flag,
  HeartPulse,
  LayoutDashboard,
  Loader2,
  MapPin,
  Megaphone,
  Moon,
  Plus,
  Radio,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trophy,
  Tv,
  UserCheck,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import type { LiveStreamData, SearchResultsPayload } from '../../types/index.ts';

interface PaletteActionItem {
  id: string;
  label: string;
  subtitle: string;
  section: 'Quick Actions' | 'Pages' | 'Live & Scheduled Matches' | 'Tournaments' | 'Teams' | 'Players';
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  onExecute: () => void;
}

interface AdminCommandPaletteProps {
  open: boolean;
  onClose: () => void;
  stickyMatchId?: string;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  isBroadcasterPortal?: boolean;
}

export function AdminCommandPalette({
  open,
  onClose,
  stickyMatchId = '',
  theme = 'dark',
  onToggleTheme,
  isBroadcasterPortal = false,
}: AdminCommandPaletteProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [entityResults, setEntityResults] = useState<SearchResultsPayload | null>(null);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const debouncedQuery = useDebounce(query.trim(), 220);
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 25);

    let cancelled = false;
    liveStreamService
      .listStreams()
      .then((list) => {
        if (!cancelled) setStreams(list);
      })
      .catch(() => {
        if (!cancelled) setStreams([]);
      });

    return () => {
      cancelled = true;
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!debouncedQuery || isBroadcasterPortal) {
      setEntityResults(null);
      setLoadingEntities(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setLoadingEntities(true);

    entityService
      .globalSearch(debouncedQuery, 'all', controller.signal)
      .then((res) => {
        if (!cancelled) setEntityResults(res);
      })
      .catch((err) => {
        if (!cancelled && !axios.isCancel(err)) setEntityResults(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingEntities(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, debouncedQuery, isBroadcasterPortal]);

  const studioBase = stickyMatchId
    ? isBroadcasterPortal
      ? `/broadcaster/control-room/${stickyMatchId}`
      : `/admin/broadcast-studio/${stickyMatchId}`
    : isBroadcasterPortal
      ? '/broadcaster/control-room'
      : '/admin/broadcast-studio';
  const scoreboardBase = stickyMatchId ? `/admin/scoreboard/${stickyMatchId}` : '/admin/scoreboard';
  const overlayBase = stickyMatchId ? `/broadcast/overlay/${stickyMatchId}` : '/broadcast/overlay';

  const items = useMemo<PaletteActionItem[]>(() => {
    const go = (to: string) => {
      onClose();
      setQuery('');
      navigate(to);
    };

    const quickActions: PaletteActionItem[] = [
      {
        id: 'act-control-room',
        label: 'Open Control Room',
        subtitle: stickyMatchId ? 'Jump to active match studio' : 'Select or launch broadcast studio',
        section: 'Quick Actions',
        keywords: 'obs studio broadcast live control room camera transition',
        icon: Radio,
        badge: 'Studio',
        onExecute: () => go(`${studioBase}?tab=control_room`),
      },
      ...(!isBroadcasterPortal
        ? [
            {
              id: 'act-new-tournament',
              label: 'New Tournament Wizard',
              subtitle: 'Open Tournaments to launch a 4-step setup wizard',
              section: 'Quick Actions' as const,
              keywords: 'create tournament cup league wizard',
              icon: Plus,
              badge: 'Wizard',
              onExecute: () => go('/admin/tournaments?create=1'),
            },
            {
              id: 'act-live-scorer',
              label: 'Open Live Scoreboard Console',
              subtitle: 'Full ball-by-ball / raid / goal scoring panel',
              section: 'Quick Actions' as const,
              keywords: 'score scoreboard cricket kabaddi football scorer',
              icon: SlidersHorizontal,
              onExecute: () => go(scoreboardBase),
            },
          ]
        : []),
      ...(onToggleTheme
        ? [
            {
              id: 'act-toggle-theme',
              label: isDark ? 'Switch Admin to Light Theme' : 'Switch Admin to Dark Theme',
              subtitle: 'Toggle operator portal appearance',
              section: 'Quick Actions' as const,
              keywords: 'theme dark light mode appearance',
              icon: isDark ? Sun : Moon,
              onExecute: () => {
                onToggleTheme();
                onClose();
              },
            },
          ]
        : []),
    ];

    const routeItems: PaletteActionItem[] = isBroadcasterPortal
      ? [
          {
            id: 'nav-b-dash',
            label: 'Broadcast Dashboard',
            subtitle: 'Assigned broadcasts and OBS readiness',
            section: 'Pages',
            keywords: 'dashboard broadcaster home',
            icon: LayoutDashboard,
            onExecute: () => go('/broadcaster/dashboard'),
          },
          {
            id: 'nav-b-cams',
            label: 'Cameras & Layouts',
            subtitle: 'Multi-cam grid, Larix, and source mapping',
            section: 'Pages',
            keywords: 'cameras larix vdo inputs layouts',
            icon: Camera,
            onExecute: () => go(`${studioBase}?tab=cameras`),
          },
          {
            id: 'nav-b-ads',
            label: 'Sponsor & Timeout Ads',
            subtitle: 'Sponsor rotation and JioHotstar timeout mode',
            section: 'Pages',
            keywords: 'sponsor timeout ads commercial banner',
            icon: Megaphone,
            onExecute: () => go(`${studioBase}?tab=ads`),
          },
          {
            id: 'nav-b-graphics',
            label: 'Graphics & Stream',
            subtitle: 'Broadcast graphic overlays and canvas editor',
            section: 'Pages',
            keywords: 'graphics overlays canvas',
            icon: Sparkles,
            onExecute: () => go(`${studioBase}?tab=graphics`),
          },
          {
            id: 'nav-b-settings',
            label: 'Studio & OBS Bridge Settings',
            subtitle: 'OBS WebSocket, MediaMTX, and pairing',
            section: 'Pages',
            keywords: 'settings obs bridge websocket mediamtx',
            icon: Settings,
            onExecute: () => go(`${studioBase}?tab=settings`),
          },
        ]
      : [
          {
            id: 'nav-dashboard',
            label: 'Admin Dashboard',
            subtitle: 'Operations overview and live queue',
            section: 'Pages',
            keywords: 'dashboard overview home',
            icon: LayoutDashboard,
            onExecute: () => go('/admin/dashboard'),
          },
          {
            id: 'nav-analytics',
            label: 'Analytics',
            subtitle: 'Viewer metrics and sponsor engagement',
            section: 'Pages',
            keywords: 'analytics viewer stats charts',
            icon: BarChart3,
            onExecute: () => go('/admin/analytics'),
          },
          {
            id: 'nav-health',
            label: 'Match Health Monitor',
            subtitle: 'Stream latency, score sync, and provider alerts',
            section: 'Pages',
            keywords: 'health telemetry diagnostics stream',
            icon: HeartPulse,
            onExecute: () => go('/admin/match-health'),
          },
          {
            id: 'nav-streams',
            label: 'Live Streams',
            subtitle: 'Create, activate, or manage broadcasts',
            section: 'Pages',
            keywords: 'live streams youtube mediamtx broadcast',
            icon: Video,
            onExecute: () => go('/admin/live-streams'),
          },
          {
            id: 'nav-cameras',
            label: 'Cameras & Inputs',
            subtitle: 'OBS camera previews and source mapping',
            section: 'Pages',
            keywords: 'cameras larix inputs studio',
            icon: Camera,
            onExecute: () => go(`${studioBase}?tab=cameras`),
          },
          {
            id: 'nav-overlays',
            label: 'Overlay Studio',
            subtitle: 'Broadcast scoreboard themes and bug placement',
            section: 'Pages',
            keywords: 'overlay studio scoreboard theme bug',
            icon: Tv,
            onExecute: () => go(overlayBase),
          },
          {
            id: 'nav-ads',
            label: 'Sponsor & Timeout Ads',
            subtitle: 'Sponsor scheduler and full-screen timeout takeover',
            section: 'Pages',
            keywords: 'sponsors timeout ads schedule',
            icon: Megaphone,
            onExecute: () => go(`${studioBase}?tab=ads`),
          },
          {
            id: 'nav-tournaments',
            label: 'Tournaments',
            subtitle: 'Brackets, formats, prizes, and standings',
            section: 'Pages',
            keywords: 'tournaments leagues cups standings',
            icon: Trophy,
            onExecute: () => go('/admin/tournaments'),
          },
          {
            id: 'nav-fixtures',
            label: 'Matches & Fixtures',
            subtitle: 'Schedule matches and generate brackets',
            section: 'Pages',
            keywords: 'fixtures schedule brackets rounds',
            icon: CalendarRange,
            onExecute: () => go('/admin/fixtures'),
          },
          {
            id: 'nav-teams',
            label: 'Teams Directory',
            subtitle: 'Squads, captains, and city affiliations',
            section: 'Pages',
            keywords: 'teams squads captains',
            icon: Users,
            onExecute: () => go('/admin/teams'),
          },
          {
            id: 'nav-players',
            label: 'Players & Eligibility',
            subtitle: 'Player profiles, roles, and verifications',
            section: 'Pages',
            keywords: 'players eligibility roster',
            icon: UserCheck,
            onExecute: () => go('/admin/players'),
          },
          {
            id: 'nav-venues',
            label: 'Venues',
            subtitle: 'Grounds, arenas, and map coordinates',
            section: 'Pages',
            keywords: 'venues grounds stadiums locations',
            icon: MapPin,
            onExecute: () => go('/admin/venues'),
          },
          {
            id: 'nav-registrations',
            label: 'Registration Queue',
            subtitle: 'Approve or review team tournament entries',
            section: 'Pages',
            keywords: 'registrations approvals captains',
            icon: ClipboardCheck,
            onExecute: () => go('/admin/registrations'),
          },
          {
            id: 'nav-payments',
            label: 'Payment Verification',
            subtitle: 'Entry fees, deposits, and receipts',
            section: 'Pages',
            keywords: 'payments fees deposits verification',
            icon: CreditCard,
            onExecute: () => go('/admin/payments'),
          },
          {
            id: 'nav-sponsors',
            label: 'Sponsor Catalog',
            subtitle: 'Brand partners and placements',
            section: 'Pages',
            keywords: 'sponsors catalog partners',
            icon: Award,
            onExecute: () => go('/admin/sponsors'),
          },
          {
            id: 'nav-reports',
            label: 'Issue Reports',
            subtitle: 'Viewer playback and stream incident reports',
            section: 'Pages',
            keywords: 'reports issues feedback',
            icon: Flag,
            onExecute: () => go('/admin/reports'),
          },
          {
            id: 'nav-users',
            label: 'Users & Roles',
            subtitle: 'Admins, scorers, and broadcasters',
            section: 'Pages',
            keywords: 'users roles permissions access',
            icon: Shield,
            onExecute: () => go('/admin/users'),
          },
          {
            id: 'nav-settings',
            label: 'Security & Settings',
            subtitle: 'Two-factor auth and studio settings',
            section: 'Pages',
            keywords: 'settings security 2fa obs',
            icon: Settings,
            onExecute: () => go('/admin/settings'),
          },
        ];

    const q = query.trim().toLowerCase();
    const matchFilter = (item: PaletteActionItem) => {
      if (!q) return true;
      return (
        item.label.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q)
      );
    };

    const streamItems: PaletteActionItem[] = streams
      .filter((s) => {
        if (!q) return s.status === 'LIVE' || s.status === 'UPCOMING';
        const hay = `${s.matchTitle || ''} ${s.teamAName || ''} ${s.teamBName || ''} ${s.gameName || ''} ${s.tournamentName || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, q ? 8 : 5)
      .map((s) => {
        const title =
          s.matchTitle ||
          [s.teamAName, s.teamBName].filter(Boolean).join(' vs ') ||
          'Match Broadcast';
        const targetRoute = isBroadcasterPortal
          ? `/broadcaster/control-room/${s.id}?tab=control_room`
          : `/admin/broadcast-studio/${s.id}?tab=control_room`;
        return {
          id: `stream-${s.id}`,
          label: title,
          subtitle: `${s.gameName || 'Sport'} · ${s.status}${s.tournamentName ? ` · ${s.tournamentName}` : ''}`,
          section: 'Live & Scheduled Matches',
          keywords: title,
          icon: Radio,
          badge: s.status === 'LIVE' ? 'LIVE' : s.status,
          onExecute: () => go(targetRoute),
        };
      });

    const entityItems: PaletteActionItem[] = [];
    if (entityResults && !isBroadcasterPortal) {
      for (const t of entityResults.tournaments.slice(0, 4)) {
        entityItems.push({
          id: `ent-t-${t.id}`,
          label: t.name,
          subtitle: `${t.sportType} · ${t.status}${t.location ? ` · ${t.location}` : ''}`,
          section: 'Tournaments',
          keywords: t.name,
          icon: Trophy,
          onExecute: () => go(`/admin/tournaments/${t.id}/fixtures`),
        });
      }
      for (const tm of entityResults.teams.slice(0, 4)) {
        entityItems.push({
          id: `ent-tm-${tm.id}`,
          label: tm.name,
          subtitle: [tm.sportType, tm.city].filter(Boolean).join(' · ') || 'Team',
          section: 'Teams',
          keywords: tm.name,
          icon: Users,
          onExecute: () => go('/admin/teams'),
        });
      }
      for (const p of entityResults.players.slice(0, 4)) {
        entityItems.push({
          id: `ent-p-${p.id}`,
          label: p.name,
          subtitle: [p.sportType, p.role || p.position].filter(Boolean).join(' · ') || 'Player',
          section: 'Players',
          keywords: p.name,
          icon: UserCheck,
          onExecute: () => go('/admin/players'),
        });
      }
    }

    const combined = [
      ...quickActions.filter(matchFilter),
      ...streamItems,
      ...(q ? routeItems.filter(matchFilter) : routeItems.slice(0, 6)),
      ...entityItems,
    ];
    return combined;
  }, [
    query,
    streams,
    entityResults,
    isBroadcasterPortal,
    stickyMatchId,
    studioBase,
    scoreboardBase,
    overlayBase,
    isDark,
    onToggleTheme,
    onClose,
    navigate,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, items.length]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      if (items.length === 0) return;
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % items.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      if (items.length === 0) return;
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = items[activeIndex];
      if (target) target.onExecute();
    }
  }

  if (!open) return null;

  const grouped = new Map<string, Array<{ item: PaletteActionItem; index: number }>>();
  items.forEach((item, index) => {
    const existing = grouped.get(item.section) || [];
    existing.push({ item, index });
    grouped.set(item.section, existing);
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Admin Command Palette"
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-xs flex items-start justify-center p-3 sm:p-6 pt-12 sm:pt-20 overflow-y-auto"
    >
      <div
        className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[80vh] ${
          isDark
            ? 'bg-[#0B101B] border-slate-700/90 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Search Bar */}
        <div
          className={`p-3 sm:p-4 border-b flex items-center gap-2.5 ${
            isDark ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          {loadingEntities ? (
            <Loader2 className="w-5 h-5 text-[#EA580C] animate-spin shrink-0" />
          ) : (
            <Search className="w-5 h-5 text-slate-400 shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to Control Room, matches, pages, tournaments, or teams..."
            aria-label="Admin command palette search"
            className={`flex-1 bg-transparent text-sm sm:text-base focus:outline-none min-w-0 ${
              isDark
                ? 'text-white placeholder:text-slate-400'
                : 'text-slate-900 placeholder:text-slate-400'
            }`}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`px-2 py-1 rounded-lg border text-[11px] font-semibold ${
              isDark
                ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            ESC
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {items.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              No matching admin pages, active matches, or entities found for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            Array.from(grouped.entries()).map(([section, entries]) => (
              <div key={section} className="space-y-1">
                <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {section}
                </p>
                <div className="space-y-1">
                  {entries.map(({ item, index }) => {
                    const Icon = item.icon;
                    const active = index === activeIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={item.onExecute}
                        className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors border ${
                          active
                            ? isDark
                              ? 'bg-[#EA580C]/20 border-[#EA580C]/50 text-white'
                              : 'bg-orange-50 border-orange-200 text-slate-900'
                            : isDark
                              ? 'border-transparent hover:bg-slate-900 text-slate-200'
                              : 'border-transparent hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              isDark ? 'bg-slate-800 text-[#EA580C]' : 'bg-slate-100 text-[#EA580C]'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-semibold truncate">{item.label}</p>
                            <p className="text-[11px] text-slate-400 truncate">{item.subtitle}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {item.badge && (
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                item.badge === 'LIVE'
                                  ? 'bg-red-600 text-white'
                                  : isDark
                                    ? 'bg-slate-800 text-slate-300'
                                    : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          className={`px-4 py-2 border-t flex items-center justify-between text-[11px] ${
            isDark
              ? 'border-slate-800 bg-[#070A10] text-slate-400'
              : 'border-slate-200 bg-slate-50 text-slate-500'
          }`}
        >
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Open</span>
            <span>ESC Close</span>
          </div>
          <span className="font-mono">⌘K / Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
