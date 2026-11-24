import { memo, useState } from 'react';
import type { ComponentType } from 'react';
import { Link, NavLink, Navigate, Outlet } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Bell,
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Shield,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.ts';
import { ROLE_LABELS } from '../../constants/roles.ts';

const BROADCASTER_SIDEBAR_STORAGE_KEY = 'maidanlive_broadcaster_sidebar_collapsed';

const MemoBroadcasterOutlet = memo(function MemoBroadcasterOutlet() {
  return <Outlet />;
});

interface BroadcasterNavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end: boolean;
}

const ALLOWED_BROADCASTER_PORTAL_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'TOURNAMENT_ORGANIZER',
  'BROADCASTER',
  'SCORER',
]);

function BroadcasterDesktopSidebar({
  navItems,
  collapsed,
  onToggleCollapse,
  canAccessAdminPortal,
  adminUser,
  onLogout,
}: {
  navItems: BroadcasterNavItem[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  canAccessAdminPortal: boolean;
  adminUser: { name: string; role: string } | null;
  onLogout: () => void;
}) {
  const [tooltip, setTooltip] = useState<{ label: string; top: number } | null>(null);

  const showTooltip = (el: HTMLElement, label: string) => {
    if (!collapsed) return;
    const rect = el.getBoundingClientRect();
    setTooltip({ label, top: rect.top + rect.height / 2 });
  };

  return (
    <aside
      aria-label="Broadcaster Navigation Sidebar"
      className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 bg-[#0F172A] border-r border-slate-800/80 z-30 transition-[width] duration-200 ease-out overflow-hidden ${
        collapsed ? 'lg:w-16' : 'lg:w-64'
      }`}
    >
      <div
        className={`h-14 flex items-center border-b border-slate-800/80 shrink-0 ${
          collapsed ? 'justify-center px-2' : 'justify-between px-4'
        }`}
      >
        {!collapsed && (
          <Link
            to="/broadcaster/dashboard"
            className="font-display text-base font-bold tracking-tight text-white flex items-center gap-2.5 min-w-0"
          >
            <span className="w-7 h-7 rounded-lg bg-[#EA580C] text-white flex items-center justify-center shrink-0">
              <Radio className="w-4 h-4" />
            </span>
            <span className="truncate">MaidanLive Broadcast</span>
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
          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors shrink-0"
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4 text-[#EA580C]" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>

      <nav
        aria-label="Broadcaster Sidebar"
        className={`flex-1 py-4 space-y-1 overflow-y-auto overflow-x-hidden ${
          collapsed ? 'px-2' : 'px-3'
        }`}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              aria-label={item.label}
              onMouseEnter={(e) => showTooltip(e.currentTarget, item.label)}
              onMouseLeave={() => setTooltip(null)}
              onFocus={(e) => showTooltip(e.currentTarget, item.label)}
              onBlur={() => setTooltip(null)}
              className={({ isActive }) =>
                `relative flex items-center rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  collapsed ? 'justify-center w-10 h-10 mx-auto px-0' : 'gap-3 px-3.5 py-2.5'
                } ${
                  isActive
                    ? 'bg-[#EA580C] text-white'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          );
        })}

        {canAccessAdminPortal && (
          <div className="pt-4 mt-4 border-t border-slate-800/80">
            <Link
              to="/admin/dashboard"
              aria-label="Back to Admin Portal"
              onMouseEnter={(e) => showTooltip(e.currentTarget, 'Back to Admin Portal')}
              onMouseLeave={() => setTooltip(null)}
              onFocus={(e) => showTooltip(e.currentTarget, 'Back to Admin Portal')}
              onBlur={() => setTooltip(null)}
              className={`flex items-center rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors ${
                collapsed ? 'justify-center w-10 h-10 mx-auto px-0' : 'gap-2.5 px-3.5 py-2'
              }`}
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              {!collapsed && <span>Back to Admin Portal</span>}
            </Link>
          </div>
        )}
      </nav>

      <div
        className={`border-t border-slate-800/80 shrink-0 ${
          collapsed ? 'p-2 flex flex-col items-center space-y-2' : 'p-4 space-y-3'
        }`}
      >
        {adminUser && !collapsed && (
          <div className="text-xs">
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
            collapsed ? 'w-10 h-10 px-0' : 'w-full min-h-[38px] gap-2 px-3 py-2'
          }`}
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>

      {collapsed && tooltip && (
        <div
          role="tooltip"
          style={{ top: tooltip.top }}
          className="fixed left-[72px] -translate-y-1/2 z-50 pointer-events-none px-2.5 py-1.5 rounded-md bg-slate-900 border border-slate-700 text-xs font-semibold text-white shadow-xl whitespace-nowrap"
        >
          {tooltip.label}
        </div>
      )}
    </aside>
  );
}

export function BroadcasterLayout() {
  const { adminUser, logoutAdmin, adminUnreadNotifications } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(BROADCASTER_SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

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

  const canAccessAdminPortal =
    adminUser?.role === 'SUPER_ADMIN' ||
    adminUser?.role === 'ADMIN' ||
    adminUser?.role === 'TOURNAMENT_ORGANIZER';

  const navItems: BroadcasterNavItem[] = [
    {
      to: '/broadcaster/dashboard',
      label: 'Broadcast Dashboard',
      icon: LayoutGrid,
      end: true,
    },
    {
      to: '/broadcaster/control-room',
      label: 'Control Room',
      icon: Video,
      end: false,
    },
    ...(canAccessAdminPortal
      ? [
          {
            to: '/admin/broadcasters',
            label: 'Manage Broadcasters',
            icon: Shield,
            end: true,
          },
        ]
      : []),
  ];

  return (
    <div
      data-admin-theme="dark"
      className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col lg:flex-row overflow-x-hidden"
    >
      {/* Desktop Sidebar */}
      <BroadcasterDesktopSidebar
        navItems={navItems}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        canAccessAdminPortal={canAccessAdminPortal}
        adminUser={adminUser ? { name: adminUser.name, role: adminUser.role } : null}
        onLogout={logoutAdmin}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-200 ease-out ${
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'
        }`}
      >
        <header className="sticky top-0 z-20 h-14 px-4 sm:px-6 flex items-center justify-between gap-4 border-b border-slate-800/80 bg-[#0B0F17]/95 backdrop-blur-xs">
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

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          <MemoBroadcasterOutlet />
        </main>
      </div>

      {/* Mobile Drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-black/75 flex"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawerOpen(false);
          }}
        >
          <div className="w-72 max-w-[85vw] bg-[#0F172A] border-r border-slate-800 h-full flex flex-col">
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800">
              <span className="font-display font-bold text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-[#EA580C]" />
                <span>MaidanLive Broadcast</span>
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
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setDrawerOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium ${
                        isActive ? 'bg-[#EA580C] text-white' : 'text-slate-300 hover:bg-slate-800'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </NavLink>
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
