import { useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  Award,
  BarChart3,
  Bell,
  Briefcase,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Flag,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageSquareWarning,
  Moon,
  Radio,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trophy,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.ts';
import { useAdminTheme } from '../../context/AdminThemeContext.tsx';
import { ROLE_LABELS } from '../../constants/roles.ts';

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
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isSuperOrAdmin = adminUser?.role === 'SUPER_ADMIN' || adminUser?.role === 'ADMIN';
  const perms = adminUser?.permissions;

  const navItems = [
    { to: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard, show: true },
    { to: '/admin/tournaments', label: 'Tournaments', icon: Trophy, show: true },
    { to: '/admin/teams', label: 'Teams Directory', icon: Users, show: true },
    { to: '/admin/players', label: 'Players & Eligibility', icon: UserCheck, show: true },
    {
      to: '/admin/registrations',
      label: 'Registration Queue',
      icon: ClipboardCheck,
      show: isSuperOrAdmin || adminUser?.role === 'TOURNAMENT_ORGANIZER' || Boolean(perms?.manageTournaments),
    },
    {
      to: '/admin/payments',
      label: 'Payment Verification',
      icon: CreditCard,
      show: isSuperOrAdmin || adminUser?.role === 'TOURNAMENT_ORGANIZER' || Boolean(perms?.manageTournaments),
    },
    {
      to: '/admin/notifications',
      label: 'Notifications',
      icon: Bell,
      show: true,
    },
    { to: '/admin/fixtures', label: 'Matches & Fixtures', icon: CalendarRange, show: true },
    { to: '/admin/live-streams', label: 'Broadcasts', icon: Radio, show: true },
    { to: '/admin/match-health', label: 'Match Health', icon: HeartPulse, show: true },
    { to: '/admin/scoreboard', label: 'Live Score Control', icon: SlidersHorizontal, show: true },
    {
      to: '/admin/sponsors',
      label: 'Sponsors',
      icon: Award,
      show: isSuperOrAdmin || Boolean(perms?.manageSponsors),
    },
    {
      to: '/admin/users',
      label: 'Users & Roles',
      icon: Shield,
      show: isSuperOrAdmin,
    },
    {
      to: '/admin/permissions',
      label: 'Permissions & Policy',
      icon: KeyRound,
      show: isSuperOrAdmin,
    },
    {
      to: '/admin/audit-logs',
      label: 'Audit Logs',
      icon: ClipboardList,
      show: isSuperOrAdmin || adminUser?.role === 'MODERATOR',
    },
    { to: '/admin/settings', label: 'Security & Settings', icon: Settings, show: true },
    // Additional operational tools
    { to: '/admin/highlights', label: 'Highlights', icon: Sparkles, show: true },
    {
      to: '/admin/venues',
      label: 'Venues',
      icon: MapPin,
      show: isSuperOrAdmin || adminUser?.role === 'TOURNAMENT_ORGANIZER' || Boolean(perms?.manageVenues),
    },
    {
      to: '/admin/moderation',
      label: 'Chat & Polls',
      icon: MessageSquareWarning,
      show: isSuperOrAdmin || adminUser?.role === 'MODERATOR' || Boolean(perms?.moderateChat),
    },
    { to: '/admin/reports', label: 'Issue Reports', icon: Flag, show: true },
    { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, show: true },
    { to: '/admin/organizer', label: 'Organizer Hub', icon: Briefcase, show: true },
  ].filter((item) => item.show);

  return (
    <div
      data-admin-theme={theme}
      className={`min-h-screen flex flex-col lg:flex-row pb-16 lg:pb-0 transition-colors ${
        theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
      }`}
    >
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-slate-950 text-slate-100 border-r border-slate-800 z-30">
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800">
          <Link
            to="/admin/dashboard"
            className="font-display text-lg font-extrabold tracking-tight text-white whitespace-nowrap flex items-center gap-2"
          >
            <Activity className="w-5 h-5 text-[#EA580C]" />
            <span>MaidanLive Admin</span>
          </Link>
        </div>

        <nav aria-label="Admin Sidebar" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#EA580C] text-white shadow-sm'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3">
          {adminUser && (
            <div className="text-xs">
              <p className="font-semibold text-white truncate">{adminUser.name}</p>
              <p className="text-slate-400 truncate">
                {ROLE_LABELS[adminUser.role] || adminUser.role}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={logoutAdmin}
            className="w-full min-h-[40px] flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Compact Sticky Header */}
        <header
          className={`sticky top-0 z-20 h-14 px-4 sm:px-6 flex items-center justify-between gap-4 border-b transition-colors ${
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
            <Link
              to="/admin/live-streams"
              className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 whitespace-nowrap"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Streams</span>
            </Link>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile/Tablet Slide-over Drawer with Smooth Motion */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 lg:hidden bg-slate-950/70 backdrop-blur-xs flex"
            onClick={(e) => {
              if (e.target === e.currentTarget) setDrawerOpen(false);
            }}
          >
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 36 }}
              className="w-76 max-w-[85vw] bg-slate-950 text-white h-full flex flex-col border-r border-slate-800"
            >
              <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#EA580C]" />
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
              <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setDrawerOpen(false)}
                      className={({ isActive }) =>
                        `min-h-[42px] flex items-center gap-3 px-3.5 py-2 rounded-lg text-sm font-medium ${
                          isActive ? 'bg-[#EA580C] text-white' : 'text-slate-300 hover:bg-slate-900'
                        }`
                      }
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
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
        className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 h-15 border-t grid grid-cols-4 items-center ${
          theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
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
          to="/admin/scoreboard"
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
