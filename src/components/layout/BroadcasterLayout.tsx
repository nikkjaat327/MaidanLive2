import { useState } from 'react';
import { Link, NavLink, Navigate, Outlet } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Bell,
  LayoutGrid,
  LogOut,
  Menu,
  Radio,
  Shield,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.ts';
import { ROLE_LABELS } from '../../constants/roles.ts';

const ALLOWED_BROADCASTER_PORTAL_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'TOURNAMENT_ORGANIZER',
  'BROADCASTER',
  'SCORER',
]);

export function BroadcasterLayout() {
  const { adminUser, logoutAdmin, adminUnreadNotifications } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (adminUser && !ALLOWED_BROADCASTER_PORTAL_ROLES.has(adminUser.role)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const canAccessAdminPortal =
    adminUser?.role === 'SUPER_ADMIN' ||
    adminUser?.role === 'ADMIN' ||
    adminUser?.role === 'TOURNAMENT_ORGANIZER';

  const navItems = [
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
    <div data-admin-theme="dark" className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-[#0F172A] border-r border-slate-800/80 z-30">
        <div className="h-14 px-5 flex items-center justify-between border-b border-slate-800/80">
          <Link
            to="/broadcaster/dashboard"
            className="font-display text-base font-bold tracking-tight text-white flex items-center gap-2.5"
          >
            <span className="w-7 h-7 rounded-lg bg-[#EA580C] text-white flex items-center justify-center shrink-0">
              <Radio className="w-4 h-4" />
            </span>
            <span className="truncate">MaidanLive Broadcast</span>
          </Link>
        </div>

        <nav aria-label="Broadcaster Sidebar" className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#EA580C] text-white'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          {canAccessAdminPortal && (
            <div className="pt-4 mt-4 border-t border-slate-800/80">
              <Link
                to="/admin/dashboard"
                className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Admin Portal</span>
              </Link>
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800/80 space-y-3">
          {adminUser && (
            <div className="text-xs">
              <p className="font-semibold text-white truncate">{adminUser.name}</p>
              <p className="text-slate-400 font-mono text-[11px] truncate">
                {ROLE_LABELS[adminUser.role] || adminUser.role}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={logoutAdmin}
            className="w-full min-h-[38px] flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-900 border border-slate-700/80 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
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
          <Outlet />
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
