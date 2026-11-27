import { memo, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ComponentType } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Bell,
  Camera,
  LayoutGrid,
  LogOut,
  Megaphone,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Settings,
  Shield,
  Sparkles,
  Tv,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.ts';
import { ROLE_LABELS } from '../../constants/roles.ts';
import {
  ACTIVE_MATCH_CHANGED_EVENT,
  ACTIVE_MATCH_STORAGE_KEY,
  getStickyMatchId,
  setStickyMatchId,
} from '../../utils/activeMatchSelection.ts';
import { EnvBrandLogoImg } from '../obs/ObsBrandMark.tsx';

const BROADCASTER_SIDEBAR_STORAGE_KEY = 'maidanlive_broadcaster_sidebar_collapsed';
export const ACTIVE_CONTROL_ROOM_MATCH_STORAGE_KEY = ACTIVE_MATCH_STORAGE_KEY;
export const CONTROL_ROOM_STATUS_EVENT = 'maidanlive:control-room-status';

export interface ControlRoomSidebarTelemetry {
  matchId?: string;
  bridgeOnline?: boolean;
  connectionMode?: string;
  obsConnected?: boolean;
  obsVersion?: string;
  mediamtxRunning?: boolean;
  bridgeVersion?: string;
  cameraCount?: number;
  activeAdsCount?: number;
}

const MemoBroadcasterOutlet = memo(function MemoBroadcasterOutlet() {
  return <Outlet />;
});

interface BroadcasterNavItem {
  id: string;
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  isActive: boolean;
  badge?: number;
  badgeTone?: 'neutral' | 'emerald';
}

const ALLOWED_BROADCASTER_PORTAL_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'TOURNAMENT_ORGANIZER',
  'BROADCASTER',
  'SCORER',
]);

function normalizeTabParam(rawTab: string | null): string {
  switch (rawTab) {
    case 'scoreboard':
    case 'dashboard':
    case 'match_control':
      return 'scoreboard';
    case 'ads':
    case 'sponsor_ads':
    case 'sponsors':
      return 'ads';
    case 'cameras':
    case 'layouts':
      return 'cameras';
    case 'graphics':
    case 'streaming':
      return 'graphics';
    case 'settings':
    case 'audit':
      return 'settings';
    default:
      return 'control_room';
  }
}

function BroadcasterDesktopSidebar({
  navItems,
  collapsed,
  onToggleCollapse,
  canAccessAdminPortal,
  adminUser,
  onLogout,
  telemetry,
  showTelemetry,
}: {
  navItems: BroadcasterNavItem[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  canAccessAdminPortal: boolean;
  adminUser: { name: string; role: string } | null;
  onLogout: () => void;
  telemetry: ControlRoomSidebarTelemetry | null;
  showTelemetry: boolean;
}) {
  const [tooltip, setTooltip] = useState<{ label: string; top: number } | null>(null);
  const navigate = useNavigate();

  const showTooltip = (el: HTMLElement, label: string) => {
    if (!collapsed) return;
    const rect = el.getBoundingClientRect();
    setTooltip({ label, top: rect.top + rect.height / 2 });
  };

  return (
    <aside
      aria-label="Broadcaster Navigation Sidebar"
      className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 bg-[#060913] border-r border-cyan-500/25 shadow-[4px_0_24px_rgba(6,182,212,0.08)] z-[70] transition-[width] duration-200 ease-out overflow-hidden ${
        collapsed ? 'lg:w-16' : 'lg:w-60'
      }`}
    >
      <div
        className={`h-14 flex items-center border-b border-cyan-500/20 shrink-0 ${
          collapsed ? 'justify-center px-2' : 'justify-between px-3.5'
        }`}
      >
        {!collapsed && (
          <Link
            to="/broadcaster/dashboard"
            className="font-display text-sm font-bold tracking-tight text-white flex items-center gap-2 min-w-0"
          >
            <EnvBrandLogoImg alt="MaidanLive Studio" className="h-6 w-auto object-contain shrink-0" />
            <span className="truncate bg-gradient-to-r from-white via-cyan-100 to-orange-300 bg-clip-text text-transparent">
              MaidanLive Studio
            </span>
          </Link>
        )}
        <button
          type="button"
          onClick={() => {
            setTooltip(null);
            onToggleCollapse();
          }}
          onMouseEnter={(e) => showTooltip(e.currentTarget, 'Expand Sidebar')}
          onMouseLeave={() => setTooltip(null)}
          onFocus={(e) => showTooltip(e.currentTarget, 'Expand Sidebar')}
          onBlur={() => setTooltip(null)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-cyan-300 hover:text-white hover:bg-cyan-500/15 border border-cyan-500/25 hover:border-cyan-400/60 transition-all shrink-0"
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4 text-cyan-300" />
          ) : (
            <PanelLeftClose className="w-4 h-4 text-cyan-300" />
          )}
        </button>
      </div>

      <nav
        aria-label="Broadcaster Sidebar"
        onScroll={() => setTooltip(null)}
        className={`sidebar-neon-scroll flex-1 py-3 space-y-1 overflow-y-auto overflow-x-hidden ${
          collapsed ? 'px-2' : 'px-2.5'
        }`}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isControlRoom = item.id === 'control_room';
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.to)}
              aria-label={item.label}
              aria-current={item.isActive ? 'page' : undefined}
              onMouseEnter={(e) => showTooltip(e.currentTarget, item.label)}
              onMouseLeave={() => setTooltip(null)}
              onFocus={(e) => showTooltip(e.currentTarget, item.label)}
              onBlur={() => setTooltip(null)}
              className={`relative w-full flex items-center rounded-lg text-[13px] font-semibold transition-all whitespace-nowrap ${
                collapsed ? 'justify-center w-10 h-10 mx-auto px-0' : 'justify-between gap-2 px-3 py-2'
              } ${
                item.isActive
                  ? isControlRoom
                    ? 'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 text-white shadow-[0_0_18px_rgba(168,85,247,0.5)] ring-1 ring-cyan-300/50'
                    : 'bg-gradient-to-r from-[#EA580C] via-rose-500 to-fuchsia-600 text-white shadow-[0_0_16px_rgba(234,88,12,0.42)] ring-1 ring-cyan-300/40'
                  : 'text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-200 border border-transparent hover:border-cyan-500/25'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${item.isActive ? 'text-white' : 'text-cyan-400/80'}`} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </span>
              {!collapsed && typeof item.badge === 'number' && item.badge > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums shrink-0 ${
                    item.badgeTone === 'emerald'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : item.isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {canAccessAdminPortal && (
          <div className="pt-3 mt-3 border-t border-slate-800/80">
            <Link
              to="/admin/dashboard"
              aria-label="Back to Admin Portal"
              onMouseEnter={(e) => showTooltip(e.currentTarget, 'Back to Admin Portal')}
              onMouseLeave={() => setTooltip(null)}
              onFocus={(e) => showTooltip(e.currentTarget, 'Back to Admin Portal')}
              onBlur={() => setTooltip(null)}
              className={`flex items-center rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors ${
                collapsed ? 'justify-center w-10 h-10 mx-auto px-0' : 'gap-2.5 px-3 py-2'
              }`}
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              {!collapsed && <span>Back to Admin Portal</span>}
            </Link>
          </div>
        )}
      </nav>

      {/* Live OBS Bridge / Studio / MediaMTX telemetry inside existing sidebar when expanded */}
      {showTelemetry && telemetry && !collapsed && (
        <div className="px-2.5 pb-2.5 shrink-0">
          <div className="rounded-xl bg-[#0F1522] border border-slate-800/90 p-2.5 space-y-2 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-slate-200 font-semibold truncate">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    telemetry.bridgeOnline ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.75)]' : 'bg-slate-600'
                  }`}
                />
                OBS Bridge
              </span>
              <span className={telemetry.bridgeOnline ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                {telemetry.bridgeOnline
                  ? 'Connected'
                  : telemetry.connectionMode === 'direct_ws'
                    ? 'Direct WS'
                    : 'Offline'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-slate-200 font-semibold truncate">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    telemetry.obsConnected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.75)]' : 'bg-amber-500/70'
                  }`}
                />
                OBS Studio
              </span>
              <span className="text-slate-400 font-mono text-[10px] truncate">
                {telemetry.obsConnected
                  ? telemetry.obsVersion
                    ? `v${telemetry.obsVersion.replace(/^v/i, '')}`
                    : 'Connected'
                  : 'Offline'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-slate-200 font-semibold truncate">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    telemetry.mediamtxRunning ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.75)]' : 'bg-slate-600'
                  }`}
                />
                MediaMTX
              </span>
              <span className={telemetry.mediamtxRunning ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                {telemetry.mediamtxRunning ? 'Running' : 'Standby'}
              </span>
            </div>
          </div>
        </div>
      )}

      <div
        className={`border-t border-slate-800/80 shrink-0 ${
          collapsed ? 'p-2 flex flex-col items-center space-y-2' : 'p-3 space-y-2.5'
        }`}
      >
        {adminUser && !collapsed && (
          <div className="text-xs px-0.5">
            <p className="font-semibold text-white truncate">{adminUser.name}</p>
            <p className="text-slate-400 font-mono text-[11px] truncate">
              {ROLE_LABELS[adminUser.role as keyof typeof ROLE_LABELS] || adminUser.role}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={onLogout}
          onMouseEnter={(e) => showTooltip(e.currentTarget, 'Sign Out')}
          onMouseLeave={() => setTooltip(null)}
          onFocus={(e) => showTooltip(e.currentTarget, 'Sign Out')}
          onBlur={() => setTooltip(null)}
          aria-label="Sign Out"
          className={`flex items-center justify-center text-xs font-semibold text-slate-200 bg-slate-900 border border-slate-700/80 rounded-lg hover:bg-slate-800 transition-colors ${
            collapsed ? 'w-10 h-10 px-0' : 'w-full min-h-[36px] gap-2 px-3 py-1.5'
          }`}
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>

      {typeof document !== 'undefined' &&
        collapsed &&
        tooltip &&
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
    </aside>
  );
}

export function BroadcasterLayout() {
  const { adminUser, logoutAdmin, adminUnreadNotifications } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [telemetry, setTelemetry] = useState<ControlRoomSidebarTelemetry | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(BROADCASTER_SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [stickyMatchId, setStickyMatchState] = useState<string>(() => getStickyMatchId());

  useEffect(() => {
    const onTelemetry = (ev: Event) => {
      const detail = (ev as CustomEvent<ControlRoomSidebarTelemetry>).detail;
      if (detail) setTelemetry(detail);
    };
    const onStickyChanged = (ev: Event) => {
      const next = (ev as CustomEvent<{ matchId?: string }>).detail?.matchId ?? getStickyMatchId();
      setStickyMatchState(next);
    };
    window.addEventListener(CONTROL_ROOM_STATUS_EVENT, onTelemetry);
    window.addEventListener(ACTIVE_MATCH_CHANGED_EVENT, onStickyChanged);
    window.addEventListener('storage', onStickyChanged);
    return () => {
      window.removeEventListener(CONTROL_ROOM_STATUS_EVENT, onTelemetry);
      window.removeEventListener(ACTIVE_MATCH_CHANGED_EVENT, onStickyChanged);
      window.removeEventListener('storage', onStickyChanged);
    };
  }, []);

  const handleToggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(BROADCASTER_SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage restrictions
      }
      return next;
    });
  };

  if (adminUser && !ALLOWED_BROADCASTER_PORTAL_ROLES.has(adminUser.role)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  // Broadcaster role gets a dedicated full-screen, camera-first interface with zero admin/sidebar chrome
  if (adminUser?.role === 'BROADCASTER') {
    if (
      location.pathname.startsWith('/broadcaster/dashboard') ||
      location.pathname.startsWith('/broadcaster/control-room')
    ) {
      const matchTail = location.pathname.replace(/^\/broadcaster\/control-room\/?/, '');
      const dest = matchTail && !matchTail.includes('/') ? `/broadcaster/${matchTail}` : '/broadcaster';
      return <Navigate to={dest} replace />;
    }
    return <Outlet />;
  }

  const canAccessAdminPortal =
    adminUser?.role === 'SUPER_ADMIN' ||
    adminUser?.role === 'ADMIN' ||
    adminUser?.role === 'TOURNAMENT_ORGANIZER';

  const isControlRoomRoute = location.pathname.startsWith('/broadcaster/control-room');
  const pathMatch = location.pathname.match(/^\/broadcaster\/control-room\/([^/?]+)/);
  const pathMatchId = pathMatch?.[1] || '';

  useEffect(() => {
    if (
      pathMatchId &&
      pathMatchId.toLowerCase() !== 'undefined' &&
      pathMatchId.toLowerCase() !== 'null'
    ) {
      setStickyMatchId(pathMatchId);
    }
  }, [pathMatchId]);

  const rememberedMatchId = pathMatchId || stickyMatchId || telemetry?.matchId || getStickyMatchId();
  const controlRoomBase = rememberedMatchId
    ? `/broadcaster/control-room/${rememberedMatchId}`
    : '/broadcaster/control-room';

  const activeControlTab = isControlRoomRoute
    ? normalizeTabParam(new URLSearchParams(location.search).get('tab'))
    : '';

  const navItems: BroadcasterNavItem[] = [
    {
      id: 'broadcast_dashboard',
      to: '/broadcaster/dashboard',
      label: 'Broadcast Dashboard',
      icon: LayoutGrid,
      isActive: location.pathname === '/broadcaster/dashboard',
    },
    {
      id: 'control_room',
      to: `${controlRoomBase}?tab=control_room`,
      label: 'Control Room',
      icon: Radio,
      isActive: isControlRoomRoute && activeControlTab === 'control_room',
    },
    {
      id: 'scoreboard',
      to: `${controlRoomBase}?tab=scoreboard`,
      label: 'Match & Scoreboard',
      icon: Tv,
      isActive: isControlRoomRoute && activeControlTab === 'scoreboard',
    },
    {
      id: 'ads',
      to: `${controlRoomBase}?tab=ads`,
      label: 'Sponsor & Timeout Ads',
      icon: Megaphone,
      isActive: isControlRoomRoute && activeControlTab === 'ads',
    },
    {
      id: 'cameras',
      to: `${controlRoomBase}?tab=cameras`,
      label: 'Cameras & Layouts',
      icon: Camera,
      isActive: isControlRoomRoute && activeControlTab === 'cameras',
      badge: telemetry?.cameraCount,
      badgeTone: 'neutral',
    },
    {
      id: 'graphics',
      to: `${controlRoomBase}?tab=graphics`,
      label: 'Graphics & Stream',
      icon: Sparkles,
      isActive: isControlRoomRoute && activeControlTab === 'graphics',
      badge: telemetry?.activeAdsCount,
      badgeTone: 'emerald',
    },
    {
      id: 'settings',
      to: `${controlRoomBase}?tab=settings`,
      label: 'Studio Settings',
      icon: Settings,
      isActive: isControlRoomRoute && activeControlTab === 'settings',
    },
    ...(canAccessAdminPortal
      ? [
          {
            id: 'manage_broadcasters',
            to: '/admin/broadcasters',
            label: 'Manage Broadcasters',
            icon: Shield,
            isActive: location.pathname.startsWith('/admin/broadcasters'),
          },
        ]
      : []),
  ];

  // Keep side gap <= 10px (p-2 = 8px) when main sidebar is collapsed, and remove max-w squeeze on Control Room
  const mainPaddingClass = sidebarCollapsed
    ? 'flex-1 w-full max-w-none p-2'
    : isControlRoomRoute
      ? 'flex-1 w-full max-w-none p-2.5 sm:p-3'
      : 'flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto';

  return (
    <div
      data-admin-theme="dark"
      className="min-h-screen bg-[#070A10] text-slate-100 flex flex-col lg:flex-row overflow-x-hidden"
    >
      {/* Single Main Broadcaster Sidebar */}
      <BroadcasterDesktopSidebar
        navItems={navItems}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        canAccessAdminPortal={canAccessAdminPortal}
        adminUser={adminUser ? { name: adminUser.name, role: adminUser.role } : null}
        onLogout={logoutAdmin}
        telemetry={telemetry}
        showTelemetry={isControlRoomRoute}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-200 ease-out ${
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-60'
        }`}
      >
        <header
          className={`sticky top-0 z-20 h-14 flex items-center justify-between gap-4 border-b border-slate-800/80 bg-[#0B0F17]/95 backdrop-blur-xs ${
            sidebarCollapsed ? 'px-2.5' : 'px-4 sm:px-6'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open broadcaster navigation"
              className="lg:hidden min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <Activity className="w-4 h-4 text-[#EA580C] shrink-0" />
              <span className="text-xs sm:text-sm font-semibold text-slate-200 truncate">
                Broadcast Production Desk
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {adminUser && (
              <span className="hidden md:inline text-xs text-slate-400 font-mono">
                {adminUser.name} · {ROLE_LABELS[adminUser.role] || adminUser.role}
              </span>
            )}
            {canAccessAdminPortal && (
              <Link
                to="/admin/notifications"
                aria-label="Notifications"
                className="relative min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:text-white"
              >
                <Bell className="w-4 h-4" />
                {adminUnreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#EA580C] text-white text-[10px] font-bold flex items-center justify-center">
                    {adminUnreadNotifications > 9 ? '9+' : adminUnreadNotifications}
                  </span>
                )}
              </Link>
            )}
          </div>
        </header>

        <main className={mainPaddingClass}>
          <MemoBroadcasterOutlet />
        </main>
      </div>

      {/* Mobile Drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-[80] lg:hidden bg-black/75 flex"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawerOpen(false);
          }}
        >
          <div className="w-72 max-w-[85vw] bg-[#060913] border-r border-cyan-500/30 h-full flex flex-col">
            <div className="h-14 px-4 flex items-center justify-between border-b border-cyan-500/20">
              <span className="font-display font-bold text-white flex items-center gap-2">
                <EnvBrandLogoImg alt="MaidanLive Studio" className="h-6 w-auto object-contain shrink-0" />
                <span>MaidanLive Studio</span>
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="sidebar-neon-scroll flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isControlRoom = item.id === 'control_room';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      navigate(item.to);
                      setDrawerOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg text-sm font-medium ${
                      item.isActive
                        ? isControlRoom
                          ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white'
                          : 'bg-[#EA580C] text-white'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {typeof item.badge === 'number' && item.badge > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 text-[10px] font-mono">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
              {canAccessAdminPortal && (
                <Link
                  to="/admin/dashboard"
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Admin Portal</span>
                </Link>
              )}
            </nav>
            <div className="p-4 border-t border-slate-800 space-y-3">
              {adminUser && (
                <div className="text-xs">
                  <p className="font-semibold text-white">{adminUser.name}</p>
                  <p className="text-slate-400 font-mono text-[11px]">
                    {ROLE_LABELS[adminUser.role] || adminUser.role}
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  logoutAdmin();
                }}
                className="w-full min-h-[40px] flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-900 border border-slate-700 rounded-lg"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
