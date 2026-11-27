import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Award,
  Bell,
  Calendar,
  Heart,
  Home,
  Languages,
  Menu,
  PlaySquare,
  Radio,
  RefreshCw,
  Search,
  Shield,
  Trophy,
  User,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.ts';
import { useLanguage } from '../../context/LanguageContext.tsx';
import { PWAInstallButton } from '../common/PWAInstallButton.tsx';
import { OfflineIndicator } from '../common/OfflineIndicator.tsx';
import { ServerWakeupBanner } from '../common/ServerWakeupBanner.tsx';
import { GlobalSearchModal } from '../common/GlobalSearchModal.tsx';
import { MatchStartAlertManager } from '../common/MatchStartAlertManager.tsx';
import { EnvBrandLogoImg } from '../obs/ObsBrandMark.tsx';

export function CustomerLayout() {
  const { customerUser, adminUser, unreadNotifications } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [swWaiting, setSwWaiting] = useState<ServiceWorker | null>(null);
  const headerInnerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const requiredWidthRef = useRef<number>(0);

  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (
        e.key === '/' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target as HTMLElement | null)?.isContentEditable
      ) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    let cancelled = false;

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg || cancelled) return;
      if (reg.waiting) {
        setSwWaiting(reg.waiting);
      }
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller && !cancelled) {
            setSwWaiting(reg.waiting || installing);
          }
        });
      });
    });

    const onControllerChange = () => {
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  function handleApplySwUpdate() {
    if (!swWaiting) return;
    swWaiting.postMessage({ type: 'SKIP_WAITING' });
    setSwWaiting(null);
  }

  const desktopLinks = [
    { to: '/', label: t('nav.home'), icon: Home, end: true },
    { to: '/live', label: t('nav.live'), icon: Radio },
    { to: '/calendar', label: 'Schedule', icon: Calendar },
    { to: '/tournaments', label: t('nav.tournaments'), icon: Trophy },
    { to: '/teams', label: t('nav.teams'), icon: Users },
    { to: '/players', label: t('nav.players'), icon: UserCheck },
    { to: '/leaderboards', label: t('nav.leaderboards'), icon: Award },
    { to: '/replays', label: t('nav.replays'), icon: PlaySquare },
    ...(customerUser ? [{ to: '/following', label: t('nav.following'), icon: Heart }] : []),
  ];

  // Re-evaluate inline nav fit when language, auth user, or link count changes
  useEffect(() => {
    requiredWidthRef.current = 0;
    setNavCollapsed(false);
  }, [language, customerUser?.name, desktopLinks.length]);

  useLayoutEffect(() => {
    const checkNavFit = () => {
      if (typeof window === 'undefined') return;
      const headerEl = headerInnerRef.current;
      const navEl = navRef.current;

      if (navCollapsed) {
        if (requiredWidthRef.current > 0 && window.innerWidth >= requiredWidthRef.current) {
          setNavCollapsed(false);
        }
        return;
      }

      if (!headerEl || !navEl) return;
      const navVisible = window.getComputedStyle(navEl).display !== 'none';
      if (!navVisible) return;

      const overflowPx = Math.max(
        navEl.scrollWidth - navEl.clientWidth,
        headerEl.scrollWidth - headerEl.clientWidth
      );
      if (overflowPx > 2) {
        requiredWidthRef.current = window.innerWidth + overflowPx + 24;
        setNavCollapsed(true);
      }
    };

    checkNavFit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(checkNavFit) : null;
    if (ro && headerInnerRef.current) ro.observe(headerInnerRef.current);
    window.addEventListener('resize', checkNavFit);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', checkNavFit);
    };
  }, [navCollapsed, language, customerUser?.name, desktopLinks.length]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 pb-16 md:pb-0">
      <OfflineIndicator />
      <ServerWakeupBanner />

      {swWaiting && (
        <div className="bg-slate-900 text-white px-4 py-2 text-xs flex items-center justify-center gap-3 border-b border-slate-800">
          <span>A new MaidanLive version is ready.</span>
          <button
            type="button"
            onClick={handleApplySwUpdate}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#EA580C] text-white font-bold hover:bg-orange-600"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reload</span>
          </button>
        </div>
      )}

      {/* Desktop & Mobile Top Navigation */}
      <header
        data-app-nav="true"
        className="sticky top-0 z-30 h-14 md:h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 safe-pt"
      >
        <div
          ref={headerInnerRef}
          className="max-w-7xl mx-auto h-full px-2.5 sm:px-6 flex items-center justify-between gap-2 lg:gap-5 overflow-hidden"
        >
          {/* Left Zone: Menu Trigger (Mobile/Tablet or when PC nav has insufficient space) + Brand Wordmark */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className={`${
                navCollapsed ? 'inline-flex' : 'inline-flex xl:hidden'
              } min-h-[36px] min-w-[36px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 hover:bg-slate-100 active:scale-95 transition shrink-0`}
            >
              <Menu className="w-4.5 h-4.5" />
            </button>

            <Link
              to="/"
              className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 whitespace-nowrap flex items-center gap-1.5 shrink-0"
            >
              <EnvBrandLogoImg alt="MaidanLive" className="h-6 sm:h-7 w-auto object-contain shrink-0" />
              <span>MaidanLive</span>
            </Link>
          </div>

          {/* Center Zone: PC Navigation Links (hidden cleanly into Menu drawer whenever constrained — never shows a scrollbar) */}
          <nav
            ref={navRef}
            aria-label="Primary Navigation"
            className={`${
              navCollapsed ? 'hidden' : 'hidden xl:flex'
            } items-center gap-4 2xl:gap-6 text-sm font-medium text-slate-600 overflow-hidden min-w-0`}
          >
            {desktopLinks.slice(1).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `whitespace-nowrap shrink-0 py-1 transition-colors hover:text-slate-900 ${
                    isActive
                      ? 'text-slate-900 font-semibold border-b-2 border-[#EA580C]'
                      : ''
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Right Zone: Search, Language Toggle, PWA Install, Notifications & Account */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search tournaments, teams, and players"
              title="Search (Ctrl+K / ⌘K)"
              className="min-h-[36px] min-w-[36px] sm:min-h-[38px] sm:px-3 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <Search className="w-4 h-4 shrink-0" />
              <span className="hidden lg:inline text-xs font-medium text-slate-500">
                Search...
              </span>
              <kbd className="hidden xl:inline-flex items-center px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px] text-slate-400">
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              onClick={toggleLanguage}
              title="Switch English / Hindi"
              className="hidden sm:inline-flex min-h-[38px] items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Languages className="w-3.5 h-3.5 text-[#EA580C]" />
              <span>{language === 'en' ? 'EN' : 'हिन्दी'}</span>
            </button>

            <div className="hidden sm:block">
              <PWAInstallButton compact />
            </div>

            {customerUser && (
              <Link
                to="/notifications"
                aria-label="Notifications"
                className="relative min-h-[36px] min-w-[36px] sm:min-h-[38px] sm:min-w-[38px] inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-600 text-white font-mono text-[10px] font-bold flex items-center justify-center">
                    {unreadNotifications > 99 ? '99+' : unreadNotifications}
                  </span>
                )}
              </Link>
            )}

            {customerUser ? (
              <Link
                to="/profile"
                aria-label={`Profile (${customerUser.name})`}
                title={customerUser.name}
                className="min-h-[36px] min-w-[36px] sm:min-h-[38px] sm:min-w-0 inline-flex items-center justify-center gap-2 px-0 sm:px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <User className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline max-w-[120px] truncate">{customerUser.name}</span>
              </Link>
            ) : (
              <Link
                to="/login"
                className="min-h-[36px] sm:min-h-[38px] inline-flex items-center px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                {t('nav.signIn')}
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Top-Left Animated Sidebar Drawer (contains ALL PC navigation items + utilities) */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            key="mobile-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setMobileMenuOpen(false);
            }}
            className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex"
          >
            <motion.aside
              key="mobile-drawer-panel"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
              className="w-76 max-w-[85vw] h-full bg-white text-slate-900 shadow-2xl flex flex-col safe-pt safe-pb"
            >
              <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200">
                <Link
                  to="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="font-display text-lg font-extrabold text-slate-900 flex items-center gap-2"
                >
                  <EnvBrandLogoImg alt="MaidanLive" className="h-6 w-auto object-contain shrink-0" />
                  <span>MaidanLive</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                  className="min-h-[42px] min-w-[42px] inline-flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav aria-label="Mobile Full Navigation" className="flex-1 overflow-y-auto p-3 space-y-1">
                {desktopLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                          isActive
                            ? 'bg-orange-50 text-[#EA580C]'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`
                      }
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}

                <NavLink
                  to="/search"
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                      isActive ? 'bg-orange-50 text-[#EA580C]' : 'text-slate-700 hover:bg-slate-100'
                    }`
                  }
                >
                  <Search className="w-4 h-4 shrink-0" />
                  <span>Search</span>
                </NavLink>

                {customerUser && (
                  <NavLink
                    to="/notifications"
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `min-h-[44px] flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                        isActive ? 'bg-orange-50 text-[#EA580C]' : 'text-slate-700 hover:bg-slate-100'
                      }`
                    }
                  >
                    <span className="flex items-center gap-3">
                      <Bell className="w-4 h-4 shrink-0" />
                      <span>{t('nav.notifications')}</span>
                    </span>
                    {unreadNotifications > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-red-600 text-white font-mono text-[11px] font-bold">
                        {unreadNotifications}
                      </span>
                    )}
                  </NavLink>
                )}

                <div className="pt-3 mt-3 border-t border-slate-200 space-y-1">
                  {customerUser ? (
                    <NavLink
                      to="/profile"
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold ${
                          isActive
                            ? 'bg-orange-50 text-[#EA580C]'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`
                      }
                    >
                      <User className="w-4 h-4 shrink-0" />
                      <span className="truncate">{customerUser.name}</span>
                    </NavLink>
                  ) : (
                    <>
                      <NavLink
                        to="/login"
                        onClick={() => setMobileMenuOpen(false)}
                        className="min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <User className="w-4 h-4 shrink-0" />
                        <span>{t('nav.signIn')}</span>
                      </NavLink>
                      <NavLink
                        to="/register"
                        onClick={() => setMobileMenuOpen(false)}
                        className="min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-[#EA580C] hover:bg-orange-50"
                      >
                        <UserCheck className="w-4 h-4 shrink-0" />
                        <span>{t('nav.register')}</span>
                      </NavLink>
                    </>
                  )}

                  {adminUser && (
                    <NavLink
                      to="/admin/dashboard"
                      onClick={() => setMobileMenuOpen(false)}
                      className="min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200"
                    >
                      <Shield className="w-4 h-4 shrink-0 text-[#EA580C]" />
                      <span>{t('nav.admin')}</span>
                    </NavLink>
                  )}
                </div>
              </nav>

              <div className="p-4 border-t border-slate-200 space-y-2.5 bg-slate-50">
                <button
                  type="button"
                  onClick={toggleLanguage}
                  className="w-full min-h-[42px] flex items-center justify-between px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
                >
                  <span className="inline-flex items-center gap-2">
                    <Languages className="w-4 h-4 text-[#EA580C]" />
                    <span>Language / भाषा</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-900">
                    {language === 'en' ? 'English -> हिन्दी' : 'हिन्दी -> English'}
                  </span>
                </button>
                <PWAInstallButton className="w-full" />
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 w-full">
        <Outlet />
      </main>

      {/* Quiet Footer (Desktop & Tablet) */}
      <footer className="hidden md:block border-t border-slate-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span className="font-medium text-slate-700">
            MaidanLive · Grassroots &amp; Tournament Sports Network
          </span>
          <div className="flex items-center gap-5">
            <Link to="/live" className="hover:text-slate-900">
              {t('nav.live')}
            </Link>
            <Link to="/tournaments" className="hover:text-slate-900">
              {t('nav.tournaments')}
            </Link>
            <Link to="/leaderboards" className="hover:text-slate-900">
              {t('nav.leaderboards')}
            </Link>
            <Link to="/replays" className="hover:text-slate-900">
              {t('nav.replays')}
            </Link>
            <Link to="/teams" className="hover:text-slate-900">
              {t('nav.teams')}
            </Link>
          </div>
        </div>
      </footer>

      {/* Mobile Fixed Bottom 4-Tab Navigation (hidden automatically during fullscreen broadcast) */}
      <nav
        data-app-nav="true"
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-15 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-4 items-center safe-pb"
      >
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex flex-col items-center justify-center h-full text-[11px] font-medium ${
              isActive ? 'text-[#EA580C] font-semibold' : 'text-slate-500'
            }`
          }
        >
          <Home className="w-5 h-5" />
          <span className="mt-0.5">{t('nav.home')}</span>
        </NavLink>
        <NavLink
          to="/live"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center h-full text-[11px] font-medium ${
              isActive ? 'text-red-600 font-semibold' : 'text-slate-500'
            }`
          }
        >
          <Radio className="w-5 h-5" />
          <span className="mt-0.5">{t('nav.live')}</span>
        </NavLink>
        <NavLink
          to="/tournaments"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center h-full text-[11px] font-medium ${
              isActive ? 'text-[#EA580C] font-semibold' : 'text-slate-500'
            }`
          }
        >
          <Trophy className="w-5 h-5" />
          <span className="mt-0.5">{t('nav.tournaments')}</span>
        </NavLink>
        <NavLink
          to="/leaderboards"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center h-full text-[11px] font-medium ${
              isActive ? 'text-[#EA580C] font-semibold' : 'text-slate-500'
            }`
          }
        >
          <Award className="w-5 h-5" />
          <span className="mt-0.5">{t('nav.leaderboards')}</span>
        </NavLink>
      </nav>

      <MatchStartAlertManager />
      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
