import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ComponentType } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  Award,
  BarChart3,
  Bell,
  Briefcase,
  CalendarRange,
  Camera,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Flag,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  MapPin,
  Megaphone,
  Menu,
  MessageSquareWarning,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
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
import { useAuth } from '../../hooks/useAuth.ts';
import { useAdminTheme } from '../../context/AdminThemeContext.tsx';
import { ROLE_LABELS } from '../../constants/roles.ts';
import { HeaderYouTubePreviewControl } from '../streaming/HeaderYouTubePreviewControl.tsx';
import {
  ACTIVE_MATCH_CHANGED_EVENT,
  getStickyMatchId,
  setStickyMatchId,
} from '../../utils/activeMatchSelection.ts';

const ADMIN_SIDEBAR_STORAGE_KEY = 'maidanlive_admin_sidebar_collapsed';

const MemoAdminOutlet = memo(function MemoAdminOutlet() {
  return <Outlet />;
});

interface AdminNavChild {
  id: string;
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  show: boolean;
  studioTab?: string;
  matchPaths?: string[];
}

interface AdminNavGroup {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  items: AdminNavChild[];
}

function normalizeAdminStudioTab(rawTab: string | null): string {
  switch (rawTab) {
    case 'scoreboard':
    case 'dashboard':
    case 'match_control':
    case 'streaming':
      return 'scoreboard';
    case 'ads':
    case 'sponsor_ads':
    case 'sponsors':
      return 'ads';
    case 'cameras':
    case 'layouts':
      return 'cameras';
    case 'graphics':
      return 'graphics';
    case 'settings':
    case 'audit':
      return 'settings';
    default:
      return 'control_room';
  }
}

function isChildRouteActive(
  item: AdminNavChild,
  pathname: string,
  search: string
): boolean {
  if (item.studioTab) {
    if (!pathname.startsWith('/admin/broadcast-studio')) return false;
    const currentTab = normalizeAdminStudioTab(new URLSearchParams(search).get('tab'));
    return currentTab === item.studioTab;
  }
  if (item.matchPaths && item.matchPaths.length > 0) {
    return item.matchPaths.some((pattern) => {
      if (pattern.includes(':id')) {
        const regex = new RegExp(`^${pattern.replace(':id', '[^/]+')}/?$`);
        return regex.test(pathname);
      }
      return pathname === pattern || pathname.startsWith(`${pattern}/`);
    });
  }
  const basePath = item.to.split('?')[0];
  const isBaseMatch = pathname === basePath || pathname.startsWith(`${basePath}/`);
  if (!isBaseMatch) return false;
  if (item.id === 'event_animations') {
    return new URLSearchParams(search).get('section') === 'events';
  }
  if (item.id === 'overlay_studio') {
    return new URLSearchParams(search).get('section') !== 'events';
  }
  return true;
}

function AdminDesktopSidebar({
  groups,
  collapsed,
  onToggleCollapse,
  adminUser,
  onLogout,
  pathname,
  search,
}: {
  groups: AdminNavGroup[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  adminUser: { name: string; role: string } | null;
  onLogout: () => void;
  pathname: string;
  search: string;
}) {
  const [tooltip, setTooltip] = useState<{ label: string; top: number } | null>(null);
  const [flyout, setFlyout] = useState<{ groupId: string; top: number } | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const flyoutRef = useRef<HTMLDivElement | null>(null);

  const activeGroupId = useMemo(
    () =>
      groups.find((g) => g.items.some((item) => isChildRouteActive(item, pathname, search)))?.id ||
      groups[0]?.id ||
      '',
    [groups, pathname, search]
  );

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    activeGroupId ? { [activeGroupId]: true } : {}
  );

  useEffect(() => {
    if (activeGroupId) {
      setOpenGroups((prev) => (prev[activeGroupId] ? prev : { ...prev, [activeGroupId]: true }));
    }
    setFlyout(null);
  }, [activeGroupId, pathname, search]);

  useEffect(() => {
    if (!flyout) return;
    const handleOutside = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(target) &&
        (!flyoutRef.current || !flyoutRef.current.contains(target))
      ) {
        setFlyout(null);
      }
    };
    const handleKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setFlyout(null);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [flyout]);

  const showTooltip = (el: HTMLElement, label: string) => {
    if (!collapsed || flyout) return;
    const rect = el.getBoundingClientRect();
    setTooltip({ label, top: rect.top + rect.height / 2 });
  };

  const toggleGroup = (groupId: string, el?: HTMLElement) => {
    if (collapsed && el) {
      const rect = el.getBoundingClientRect();
      setTooltip(null);
      setFlyout((prev) =>
        prev?.groupId === groupId ? null : { groupId, top: Math.min(rect.top, window.innerHeight - 380) }
      );
      return;
    }
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const initials = (adminUser?.name || 'A')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const activeFlyoutGroup = flyout ? groups.find((g) => g.id === flyout.groupId) || null : null;

  return (
    <aside
      ref={sidebarRef}
      aria-label="Admin Navigation Sidebar"
      className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 bg-[#060913] text-slate-100 border-r border-cyan-500/25 shadow-[4px_0_24px_rgba(6,182,212,0.08)] z-[70] transition-[width] duration-200 ease-out overflow-hidden ${
        collapsed ? 'lg:w-16' : 'lg:w-64'
      }`}
    >
      {/* Top Brand + Collapse Toggle */}
      <div
        className={`h-16 flex items-center border-b border-cyan-500/20 bg-gradient-to-r from-[#080d1c] to-[#060913] shrink-0 ${
          collapsed ? 'justify-center px-2' : 'justify-between px-4'
        }`}
      >
        {!collapsed && (
          <Link
            to="/admin/dashboard"
            className="font-display text-lg font-extrabold tracking-tight text-white whitespace-nowrap flex items-center gap-2 min-w-0"
          >
            <Activity className="w-5 h-5 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.85)] shrink-0" />
            <span className="truncate bg-gradient-to-r from-white via-cyan-100 to-orange-300 bg-clip-text text-transparent">
              MaidanLive Admin
            </span>
          </Link>
        )}
        <button
          type="button"
          onClick={() => {
            setTooltip(null);
            setFlyout(null);
            onToggleCollapse();
          }}
          onMouseEnter={(e) => showTooltip(e.currentTarget, 'Expand Sidebar')}
          onMouseLeave={() => setTooltip(null)}
          onFocus={(e) => showTooltip(e.currentTarget, 'Expand Sidebar')}
          onBlur={() => setTooltip(null)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-cyan-300 hover:text-white hover:bg-cyan-500/15 border border-cyan-500/25 hover:border-cyan-400/60 transition-all shrink-0 shadow-[0_0_12px_rgba(34,211,238,0.12)]"
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4 text-cyan-300" />
          ) : (
            <PanelLeftClose className="w-4 h-4 text-cyan-300" />
          )}
        </button>
      </div>

      {/* Hierarchical Parent -> Child Sidebar */}
      <nav
        aria-label="Admin Sidebar"
        onScroll={() => setTooltip(null)}
        className={`sidebar-neon-scroll flex-1 py-3 space-y-1.5 overflow-y-auto overflow-x-hidden ${
          collapsed ? 'px-2' : 'px-3'
        }`}
      >
        {groups.map((group) => {
          const GroupIcon = group.icon;
          const hasActiveChild = group.items.some((item) =>
            isChildRouteActive(item, pathname, search)
          );
          const isOpen = Boolean(openGroups[group.id]);

          return (
            <div key={group.id} className="space-y-1">
              <button
                type="button"
                aria-expanded={collapsed ? flyout?.groupId === group.id : isOpen}
                aria-label={group.label}
                onClick={(e) => toggleGroup(group.id, e.currentTarget)}
                onMouseEnter={(e) => showTooltip(e.currentTarget, group.label)}
                onMouseLeave={() => setTooltip(null)}
                onFocus={(e) => showTooltip(e.currentTarget, group.label)}
                onBlur={() => setTooltip(null)}
                className={`group relative w-full flex items-center rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                  collapsed
                    ? 'justify-center w-10 h-10 mx-auto px-0'
                    : 'justify-between gap-2 px-3 py-2'
                } ${
                  hasActiveChild
                    ? collapsed
                      ? 'bg-gradient-to-br from-[#EA580C] via-fuchsia-600 to-cyan-500 text-white shadow-[0_0_18px_rgba(34,211,238,0.45)] ring-1 ring-cyan-300/60'
                      : 'bg-gradient-to-r from-cyan-500/15 via-slate-900/95 to-fuchsia-500/10 text-cyan-100 border border-cyan-400/45 shadow-[0_0_14px_rgba(34,211,238,0.16)]'
                    : 'text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-200 border border-transparent hover:border-cyan-500/25'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <GroupIcon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      hasActiveChild && !collapsed
                        ? 'text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.85)]'
                        : 'group-hover:text-cyan-300'
                    }`}
                  />
                  {!collapsed && <span className="truncate">{group.label}</span>}
                </span>
                {!collapsed &&
                  (isOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-300 shrink-0" />
                  ))}
              </button>

              {!collapsed && isOpen && (
                <div className="ml-3.5 pl-2.5 border-l border-cyan-500/30 space-y-0.5 py-0.5">
                  {group.items.map((item) => {
                    const ItemIcon = item.icon;
                    const active = isChildRouteActive(item, pathname, search);
                    return (
                      <Link
                        key={item.id}
                        to={item.to}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-all whitespace-nowrap ${
                          active
                            ? 'bg-gradient-to-r from-[#EA580C] via-rose-500 to-fuchsia-600 text-white font-semibold shadow-[0_0_16px_rgba(234,88,12,0.42)] ring-1 ring-cyan-300/40'
                            : 'text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-200'
                        }`}
                      >
                        <ItemIcon
                          className={`w-3.5 h-3.5 shrink-0 ${
                            active ? 'text-white' : 'text-cyan-400/75'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer Profile & Sign Out */}
      <div
        className={`border-t border-cyan-500/20 bg-[#050811] shrink-0 ${
          collapsed ? 'p-2 space-y-2 flex flex-col items-center' : 'p-4 space-y-3'
        }`}
      >
        {adminUser &&
          (collapsed ? (
            <div
              tabIndex={0}
              onMouseEnter={(e) =>
                showTooltip(
                  e.currentTarget,
                  `${adminUser.name} · ${ROLE_LABELS[adminUser.role as keyof typeof ROLE_LABELS] || adminUser.role}`
                )
              }
              onMouseLeave={() => setTooltip(null)}
              onFocus={(e) =>
                showTooltip(
                  e.currentTarget,
                  `${adminUser.name} · ${ROLE_LABELS[adminUser.role as keyof typeof ROLE_LABELS] || adminUser.role}`
                )
              }
              onBlur={() => setTooltip(null)}
              className="w-9 h-9 rounded-lg bg-slate-900 border border-cyan-500/35 flex items-center justify-center text-xs font-bold text-cyan-200 select-none shadow-[0_0_10px_rgba(34,211,238,0.14)]"
            >
              {initials || 'A'}
            </div>
          ) : (
            <div className="text-xs">
              <p className="font-semibold text-white truncate">{adminUser.name}</p>
              <p className="text-cyan-400/80 truncate">
                {ROLE_LABELS[adminUser.role as keyof typeof ROLE_LABELS] || adminUser.role}
              </p>
            </div>
          ))}
        <button
          type="button"
          onClick={onLogout}
          onMouseEnter={(e) => showTooltip(e.currentTarget, 'Sign Out')}
          onMouseLeave={() => setTooltip(null)}
          onFocus={(e) => showTooltip(e.currentTarget, 'Sign Out')}
          onBlur={() => setTooltip(null)}
          aria-label="Sign Out"
          className={`flex items-center justify-center text-xs font-medium text-slate-200 bg-slate-900/90 border border-cyan-500/25 rounded-lg hover:bg-rose-500/20 hover:border-rose-400/50 hover:text-rose-200 transition-colors ${
            collapsed ? 'w-10 h-10 px-0' : 'w-full min-h-[40px] gap-2 px-3 py-2'
          }`}
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>

      {/* Portaled Collapsed Rail Floating Tooltip (never clipped or overlapped by main content) */}
      {typeof document !== 'undefined' &&
        collapsed &&
        tooltip &&
        !activeFlyoutGroup &&
        createPortal(
          <div
            role="tooltip"
            style={{ top: tooltip.top }}
            className="fixed left-[72px] -translate-y-1/2 z-[95] pointer-events-none px-2.5 py-1.5 rounded-md bg-[#080d1c] border border-cyan-400/50 text-xs font-semibold text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.3)] whitespace-nowrap"
          >
            {tooltip.label}
          </div>,
          document.body
        )}

      {/* Portaled Collapsed Rail Child Submenu Flyout (paints cleanly above Control Room / Studio headers) */}
      {typeof document !== 'undefined' &&
        collapsed &&
        activeFlyoutGroup &&
        flyout &&
        createPortal(
          <div
            ref={flyoutRef}
            role="menu"
            aria-label={`${activeFlyoutGroup.label} menu`}
            style={{ top: Math.max(12, flyout.top) }}
            className="sidebar-neon-scroll fixed left-[70px] z-[95] w-60 max-h-[78vh] overflow-y-auto rounded-xl bg-[#070b18]/98 backdrop-blur-md border border-cyan-400/40 shadow-[0_14px_40px_rgba(0,0,0,0.75),0_0_24px_rgba(34,211,238,0.2)] p-2 space-y-1"
          >
            <p className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-cyan-300 border-b border-cyan-500/25 mb-1">
              {activeFlyoutGroup.label}
            </p>
            {activeFlyoutGroup.items.map((item) => {
              const ItemIcon = item.icon;
              const active = isChildRouteActive(item, pathname, search);
              return (
                <Link
                  key={item.id}
                  to={item.to}
                  onClick={() => setFlyout(null)}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                    active
                      ? 'bg-gradient-to-r from-[#EA580C] via-rose-500 to-fuchsia-600 text-white font-semibold shadow-[0_0_14px_rgba(234,88,12,0.45)] ring-1 ring-cyan-300/40'
                      : 'text-slate-200 hover:bg-cyan-500/15 hover:text-cyan-200'
                  }`}
                >
                  <ItemIcon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-white' : 'text-cyan-400/80'}`} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>,
          document.body
        )}
    </aside>
  );
}

export function RequireAdminAuth() {
  const { adminUser, adminLoading } = useAuth();
  const location = useLocation();
  const { theme } = useAdminTheme();

  if (adminLoading) {
    return (
      <div
        data-admin-theme={theme}
        className={`min-h-screen flex items-center justify-center text-sm ${
          theme === 'dark' ? 'bg-slate-950 text-slate-300' : 'bg-slate-100 text-slate-600'
        }`}
      >
        Verifying administrative session...
      </div>
    );
  }

  if (!adminUser) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

export function AdminLayout() {
  const { adminUser, logoutAdmin, adminUnreadNotifications } = useAuth();
  const { theme, toggleTheme } = useAdminTheme();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileOpenGroups, setMobileOpenGroups] = useState<Record<string, boolean>>({});
  const [stickyMatchId, setStickyMatchState] = useState<string>(() => getStickyMatchId());
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ADMIN_SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const matchRoute = location.pathname.match(
      /^\/(?:admin\/(?:scoreboard|broadcast-studio)|broadcast\/overlay)\/([^/?]+)/
    );
    const routeId = matchRoute?.[1];
    if (routeId && routeId !== 'view') {
      setStickyMatchId(routeId);
      setStickyMatchState(routeId);
    }
  }, [location.pathname]);

  useEffect(() => {
    const onStickyChanged = (ev: Event) => {
      const next = (ev as CustomEvent<{ matchId?: string }>).detail?.matchId ?? getStickyMatchId();
      setStickyMatchState(next);
    };
    window.addEventListener(ACTIVE_MATCH_CHANGED_EVENT, onStickyChanged);
    window.addEventListener('storage', onStickyChanged);
    return () => {
      window.removeEventListener(ACTIVE_MATCH_CHANGED_EVENT, onStickyChanged);
      window.removeEventListener('storage', onStickyChanged);
    };
  }, []);

  const handleToggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(ADMIN_SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage restrictions
      }
      return next;
    });
  };

  const isSuperOrAdmin = adminUser?.role === 'SUPER_ADMIN' || adminUser?.role === 'ADMIN';
  const isBroadcaster = adminUser?.role === 'BROADCASTER';
  const isOrganizer = adminUser?.role === 'TOURNAMENT_ORGANIZER';
  const isModerator = adminUser?.role === 'MODERATOR';
  const perms = adminUser?.permissions;

  const studioBase = stickyMatchId
    ? `/admin/broadcast-studio/${stickyMatchId}`
    : '/admin/broadcast-studio';
  const scoreboardBase = stickyMatchId ? `/admin/scoreboard/${stickyMatchId}` : '/admin/scoreboard';
  const overlayBase = stickyMatchId ? `/broadcast/overlay/${stickyMatchId}` : '/broadcast/overlay';
  const canAccessStudio = isSuperOrAdmin || isOrganizer || Boolean(perms?.manageStreams);

  const navGroups: AdminNavGroup[] = [
    {
      id: 'overview',
      label: 'Overview & Health',
      icon: LayoutDashboard,
      items: [
        { id: 'dashboard', to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: !isBroadcaster },
        { id: 'analytics', to: '/admin/analytics', label: 'Analytics', icon: BarChart3, show: !isBroadcaster },
        { id: 'match_health', to: '/admin/match-health', label: 'Match Health', icon: HeartPulse, show: !isBroadcaster },
      ],
    },
    {
      id: 'broadcast',
      label: 'Broadcast Hub',
      icon: Radio,
      items: [
        {
          id: 'broadcaster_dashboard',
          to: '/broadcaster/dashboard',
          label: 'Broadcast Dashboard',
          icon: LayoutGrid,
          show: isSuperOrAdmin || isOrganizer,
        },
        {
          id: 'control_room',
          to: `${studioBase}?tab=control_room`,
          label: 'Control Room',
          icon: Radio,
          studioTab: 'control_room',
          show: canAccessStudio,
        },
        {
          id: 'stream_workflow',
          to: `${studioBase}?tab=scoreboard`,
          label: 'Stream Output & Workflow',
          icon: Tv,
          studioTab: 'scoreboard',
          show: canAccessStudio,
        },
        {
          id: 'live_streams',
          to: '/admin/live-streams',
          label: 'Live Streams',
          icon: Video,
          show: !isBroadcaster,
        },
        {
          id: 'live_scoreboard',
          to: scoreboardBase,
          label: 'Live Score Control',
          icon: SlidersHorizontal,
          matchPaths: ['/admin/scoreboard'],
          show: !isBroadcaster,
        },
        {
          id: 'cameras_inputs',
          to: `${studioBase}?tab=cameras`,
          label: 'Cameras & Inputs',
          icon: Camera,
          studioTab: 'cameras',
          show: canAccessStudio,
        },
        {
          id: 'overlay_studio',
          to: overlayBase,
          label: 'Overlay Studio',
          icon: Tv,
          matchPaths: ['/broadcast/overlay'],
          show: !isBroadcaster,
        },
        {
          id: 'event_animations',
          to: `${overlayBase}?section=events`,
          label: 'Event Animations (Pro)',
          icon: Sparkles,
          show: !isBroadcaster,
        },
        {
          id: 'graphics_studio',
          to: `${studioBase}?tab=graphics`,
          label: 'Graphics Studio',
          icon: Sparkles,
          studioTab: 'graphics',
          show: canAccessStudio,
        },
        {
          id: 'sponsor_timeout_ads',
          to: `${studioBase}?tab=ads`,
          label: 'Sponsor & Timeout Ads',
          icon: Megaphone,
          studioTab: 'ads',
          show: canAccessStudio,
        },
        {
          id: 'obs_settings',
          to: `${studioBase}?tab=settings`,
          label: 'OBS Bridge & Settings',
          icon: Settings,
          studioTab: 'settings',
          show: canAccessStudio,
        },
        {
          id: 'broadcaster_team',
          to: '/admin/broadcasters',
          label: 'Broadcaster Team',
          icon: UserCheck,
          show: isSuperOrAdmin || isOrganizer,
        },
      ],
    },
    {
      id: 'tournaments',
      label: 'Tournaments',
      icon: Trophy,
      items: [
        {
          id: 'tournaments_list',
          to: '/admin/tournaments',
          label: 'Tournaments',
          icon: Trophy,
          matchPaths: ['/admin/tournaments'],
          show: !isBroadcaster,
        },
        {
          id: 'fixtures',
          to: '/admin/fixtures',
          label: 'Matches & Fixtures',
          icon: CalendarRange,
          matchPaths: ['/admin/fixtures', '/admin/tournaments/:id/fixtures'],
          show: !isBroadcaster,
        },
        { id: 'highlights', to: '/admin/highlights', label: 'Highlights', icon: Sparkles, show: !isBroadcaster },
        {
          id: 'venues',
          to: '/admin/venues',
          label: 'Venues',
          icon: MapPin,
          show: !isBroadcaster && (isSuperOrAdmin || isOrganizer || Boolean(perms?.manageVenues)),
        },
        {
          id: 'registrations',
          to: '/admin/registrations',
          label: 'Registration Queue',
          icon: ClipboardCheck,
          show: !isBroadcaster && (isSuperOrAdmin || isOrganizer || Boolean(perms?.manageTournaments)),
        },
        {
          id: 'payments',
          to: '/admin/payments',
          label: 'Payment Verification',
          icon: CreditCard,
          show: !isBroadcaster && (isSuperOrAdmin || isOrganizer || Boolean(perms?.manageTournaments)),
        },
      ],
    },
    {
      id: 'rosters',
      label: 'Teams & Players',
      icon: Users,
      items: [
        { id: 'teams', to: '/admin/teams', label: 'Teams Directory', icon: Users, show: !isBroadcaster },
        { id: 'players', to: '/admin/players', label: 'Players & Eligibility', icon: UserCheck, show: !isBroadcaster },
      ],
    },
    {
      id: 'community',
      label: 'Sponsors & Community',
      icon: Award,
      items: [
        {
          id: 'sponsors',
          to: '/admin/sponsors',
          label: 'Sponsor Catalog',
          icon: Award,
          show: !isBroadcaster && (isSuperOrAdmin || Boolean(perms?.manageSponsors)),
        },
        {
          id: 'moderation',
          to: '/admin/moderation',
          label: 'Chat & Polls',
          icon: MessageSquareWarning,
          show: !isBroadcaster && (isSuperOrAdmin || isModerator || Boolean(perms?.moderateChat)),
        },
        { id: 'reports', to: '/admin/reports', label: 'Issue Reports', icon: Flag, show: !isBroadcaster },
        { id: 'organizer', to: '/admin/organizer', label: 'Organizer Hub', icon: Briefcase, show: !isBroadcaster },
        { id: 'notifications', to: '/admin/notifications', label: 'Notifications', icon: Bell, show: true },
      ],
    },
    {
      id: 'system',
      label: 'Users & System',
      icon: Shield,
      items: [
        { id: 'users', to: '/admin/users', label: 'Users & Roles', icon: Shield, show: isSuperOrAdmin },
        { id: 'permissions', to: '/admin/permissions', label: 'Permissions & Policy', icon: KeyRound, show: isSuperOrAdmin },
        {
          id: 'audit_logs',
          to: '/admin/audit-logs',
          label: 'Audit Logs',
          icon: ClipboardList,
          show: !isBroadcaster && (isSuperOrAdmin || isModerator),
        },
        { id: 'settings', to: '/admin/settings', label: 'Security & Settings', icon: Settings, show: !isBroadcaster },
      ],
    },
  ]
    .map((group) => ({ ...group, items: group.items.filter((i) => i.show) }))
    .filter((group) => group.items.length > 0);

  const activeMobileGroupId =
    navGroups.find((g) => g.items.some((item) => isChildRouteActive(item, location.pathname, location.search)))?.id ||
    navGroups[0]?.id ||
    '';

  useEffect(() => {
    if (activeMobileGroupId) {
      setMobileOpenGroups((prev) =>
        prev[activeMobileGroupId] ? prev : { ...prev, [activeMobileGroupId]: true }
      );
    }
  }, [activeMobileGroupId]);

  // Enforce strict Broadcaster isolation: Broadcaster role is always routed to dedicated full-screen studio
  if (isBroadcaster) {
    return <Navigate to="/broadcaster" replace />;
  }

  return (
    <div
      data-admin-theme={theme}
      className={`min-h-screen flex flex-col lg:flex-row pb-16 lg:pb-0 overflow-x-clip transition-colors ${
        theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
      }`}
    >
      {/* Desktop Single Hierarchical Sidebar */}
      <AdminDesktopSidebar
        groups={navGroups}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        adminUser={adminUser ? { name: adminUser.name, role: adminUser.role } : null}
        onLogout={logoutAdmin}
        pathname={location.pathname}
        search={location.search}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-200 ease-out ${
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'
        }`}
      >
        {/* Compact Sticky Header */}
        <header
          className={`sticky top-0 z-20 h-14 flex items-center justify-between gap-4 border-b transition-colors ${
            sidebarCollapsed ? 'px-2.5' : 'px-4 sm:px-6'
          } ${
            theme === 'dark'
              ? 'bg-slate-950/95 border-slate-800 text-slate-100'
              : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open admin menu"
              className={`lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg ${
                theme === 'dark' ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-display font-bold truncate lg:hidden">
              MaidanLive Admin
            </span>
            <span className="hidden lg:inline text-sm font-medium text-slate-500">
              Broadcast Operations, Tournaments &amp; Score Control
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <HeaderYouTubePreviewControl
              tone={theme === 'dark' ? 'dark' : 'light'}
              compact
            />
            {adminUser && (
              <span className="hidden md:inline text-xs text-slate-500 whitespace-nowrap">
                {adminUser.name} · {ROLE_LABELS[adminUser.role] || adminUser.role}
              </span>
            )}
            <Link
              to="/admin/notifications"
              aria-label="Admin notifications"
              title="Notifications"
              className={`relative min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg border transition-colors ${
                theme === 'dark'
                  ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Bell className="w-4 h-4" />
              {adminUnreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#EA580C] text-white text-[10px] font-bold flex items-center justify-center">
                  {adminUnreadNotifications > 9 ? '9+' : adminUnreadNotifications}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className={`min-h-[34px] min-w-[34px] inline-flex items-center justify-center gap-1.5 px-2.5 rounded-lg border text-xs font-semibold transition-colors ${
                theme === 'dark'
                  ? 'bg-slate-900 border-slate-700 text-amber-300 hover:bg-slate-800'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
          </div>
        </header>

        <main
          className={
            sidebarCollapsed
              ? 'flex-1 w-full max-w-none p-2'
              : location.pathname.startsWith('/admin/broadcast-studio') ||
                  location.pathname.startsWith('/broadcast/overlay')
                ? 'flex-1 w-full max-w-none p-2.5 sm:p-3'
                : 'flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto'
          }
        >
          <MemoAdminOutlet />
        </main>
      </div>

      {/* Mobile/Tablet Slide-over Drawer with Hierarchical Parent -> Child Categories */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[80] lg:hidden bg-slate-950/75 backdrop-blur-xs flex"
            onClick={(e) => {
              if (e.target === e.currentTarget) setDrawerOpen(false);
            }}
          >
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 36 }}
              className="w-76 max-w-[85vw] bg-[#060913] text-white h-full flex flex-col border-r border-cyan-500/30"
            >
              <div className="h-14 px-4 flex items-center justify-between border-b border-cyan-500/20">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span className="font-display font-bold">MaidanLive Admin</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close menu"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="sidebar-neon-scroll flex-1 p-3 space-y-1.5 overflow-y-auto">
                {navGroups.map((group) => {
                  const GroupIcon = group.icon;
                  const isOpen = Boolean(mobileOpenGroups[group.id]);
                  const hasActiveChild = group.items.some((item) =>
                    isChildRouteActive(item, location.pathname, location.search)
                  );
                  return (
                    <div key={group.id} className="space-y-1">
                      <button
                        type="button"
                        onClick={() =>
                          setMobileOpenGroups((prev) => ({
                            ...prev,
                            [group.id]: !prev[group.id],
                          }))
                        }
                        className={`w-full min-h-[42px] flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
                          hasActiveChild ? 'bg-slate-900 text-white' : 'text-slate-300 hover:bg-slate-900'
                        }`}
                      >
                        <span className="flex items-center gap-3 min-w-0">
                          <GroupIcon
                            className={`w-4 h-4 shrink-0 ${hasActiveChild ? 'text-[#EA580C]' : ''}`}
                          />
                          <span className="truncate">{group.label}</span>
                        </span>
                        {isOpen ? (
                          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                        )}
                      </button>
                      {isOpen && (
                        <div className="ml-3.5 pl-2.5 border-l border-slate-800 space-y-0.5 py-0.5">
                          {group.items.map((item) => {
                            const ItemIcon = item.icon;
                            const active = isChildRouteActive(item, location.pathname, location.search);
                            return (
                              <Link
                                key={item.id}
                                to={item.to}
                                onClick={() => setDrawerOpen(false)}
                                className={`min-h-[38px] flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                                  active
                                    ? 'bg-[#EA580C] text-white font-semibold'
                                    : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                                }`}
                              >
                                <ItemIcon className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{item.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
              <div className="p-4 border-t border-slate-800 space-y-3">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="w-full min-h-[40px] flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold bg-slate-900 border border-slate-800 rounded-lg text-slate-200 hover:bg-slate-800"
                >
                  {theme === 'dark' ? (
                    <>
                      <Sun className="w-4 h-4 text-amber-300" />
                      <span>Switch to Light Theme</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-4 h-4 text-slate-300" />
                      <span>Switch to Dark Theme</span>
                    </>
                  )}
                </button>
                {adminUser && (
                  <div className="text-xs">
                    <p className="font-semibold text-white">{adminUser.name}</p>
                    <p className="text-slate-400">{ROLE_LABELS[adminUser.role] || adminUser.role}</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    logoutAdmin();
                  }}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Admin Mobile Navigation"
        className={`lg:hidden fixed bottom-0 left-0 right-0 z-[70] h-15 border-t grid grid-cols-4 items-center ${
          theme === 'dark' ? 'bg-slate-950 border-cyan-500/25' : 'bg-white border-slate-200'
        }`}
      >
        <NavLink
          to="/admin/dashboard"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center h-full text-[11px] font-medium ${
              isActive ? 'text-[#EA580C]' : 'text-slate-500'
            }`
          }
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="mt-0.5">Overview</span>
        </NavLink>
        <NavLink
          to="/admin/live-streams"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center h-full text-[11px] font-medium ${
              isActive ? 'text-red-500' : 'text-slate-500'
            }`
          }
        >
          <Radio className="w-5 h-5" />
          <span className="mt-0.5">Broadcasts</span>
        </NavLink>
        <NavLink
          to={stickyMatchId ? `/admin/scoreboard/${stickyMatchId}` : '/admin/scoreboard'}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center h-full text-[11px] font-medium ${
              isActive ? 'text-[#EA580C]' : 'text-slate-500'
            }`
          }
        >
          <SlidersHorizontal className="w-5 h-5" />
          <span className="mt-0.5">Scoring</span>
        </NavLink>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex flex-col items-center justify-center h-full text-[11px] font-medium text-slate-500"
        >
          <Menu className="w-5 h-5" />
          <span className="mt-0.5">Menu</span>
        </button>
      </nav>
    </div>
  );
}
