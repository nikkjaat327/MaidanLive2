import { Link, NavLink, Outlet } from 'react-router-dom';
import { Award, Bell, Home, Radio, Trophy, User } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.ts';

export function CustomerLayout() {
  const { customerUser, unreadNotifications } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 pb-16 md:pb-0">
      {/* Desktop & Mobile Top Navigation */}
      <header className="sticky top-0 z-30 h-14 md:h-16 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4 lg:gap-8">
          {/* Zone 1: Brand wordmark */}
          <Link
            to="/"
            className="font-display text-xl font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            MaidanLive
          </Link>

          {/* Zone 2: Primary text links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-5 lg:gap-6 text-sm font-medium text-slate-600 overflow-x-auto"
          >
            <NavLink
              to="/live"
              className={({ isActive }) =>
                `whitespace-nowrap shrink-0 py-1 transition-colors hover:text-slate-900 ${
                  isActive ? 'text-slate-900 font-semibold border-b-2 border-emerald-600' : ''
                }`
              }
            >
              Live
            </NavLink>
            <NavLink
              to="/tournaments"
              className={({ isActive }) =>
                `whitespace-nowrap shrink-0 py-1 transition-colors hover:text-slate-900 ${
                  isActive ? 'text-slate-900 font-semibold border-b-2 border-emerald-600' : ''
                }`
              }
            >
              Tournaments
            </NavLink>
            <NavLink
              to="/teams"
              className={({ isActive }) =>
                `whitespace-nowrap shrink-0 py-1 transition-colors hover:text-slate-900 ${
                  isActive ? 'text-slate-900 font-semibold border-b-2 border-emerald-600' : ''
                }`
              }
            >
              Teams
            </NavLink>
            <NavLink
              to="/players"
              className={({ isActive }) =>
                `whitespace-nowrap shrink-0 py-1 transition-colors hover:text-slate-900 ${
                  isActive ? 'text-slate-900 font-semibold border-b-2 border-emerald-600' : ''
                }`
              }
            >
              Players
            </NavLink>
            <NavLink
              to="/leaderboards"
              className={({ isActive }) =>
                `whitespace-nowrap shrink-0 py-1 transition-colors hover:text-slate-900 ${
                  isActive ? 'text-slate-900 font-semibold border-b-2 border-emerald-600' : ''
                }`
              }
            >
              Leaderboards
            </NavLink>
            <NavLink
              to="/replays"
              className={({ isActive }) =>
                `whitespace-nowrap shrink-0 py-1 transition-colors hover:text-slate-900 ${
                  isActive ? 'text-slate-900 font-semibold border-b-2 border-emerald-600' : ''
                }`
              }
            >
              Replays
            </NavLink>
            {customerUser && (
              <NavLink
                to="/following"
                className={({ isActive }) =>
                  `whitespace-nowrap shrink-0 py-1 transition-colors hover:text-slate-900 ${
                    isActive ? 'text-slate-900 font-semibold border-b-2 border-emerald-600' : ''
                  }`
                }
              >
                Following
              </NavLink>
            )}
          </nav>

          {/* Zone 3: Notifications & Account action */}
          <div className="flex items-center gap-2.5 shrink-0">
            {customerUser && (
              <Link
                to="/notifications"
                aria-label="Notifications"
                className="relative min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white font-mono text-[10px] font-bold flex items-center justify-center">
                    {unreadNotifications > 99 ? '99+' : unreadNotifications}
                  </span>
                )}
              </Link>
            )}

            {customerUser ? (
              <Link
                to="/profile"
                className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <User className="w-3.5 h-3.5" />
                <span className="max-w-[120px] truncate">{customerUser.name}</span>
              </Link>
            ) : (
              <Link
                to="/login"
                className="min-h-[40px] inline-flex items-center px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full">
        <Outlet />
      </main>

      {/* Quiet Footer (Desktop & Tablet) */}
      <footer className="hidden md:block border-t border-slate-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span className="font-medium text-slate-700">
            MaidanLive · Grassroots &amp; Tournament Sports Streaming
          </span>
          <div className="flex items-center gap-5">
            <Link to="/live" className="hover:text-slate-900">
              Live Matches
            </Link>
            <Link to="/tournaments" className="hover:text-slate-900">
              Tournaments
            </Link>
            <Link to="/leaderboards" className="hover:text-slate-900">
              Leaderboards
            </Link>
            <Link to="/replays" className="hover:text-slate-900">
              Replays
            </Link>
            <Link to="/teams" className="hover:text-slate-900">
              Teams
            </Link>
          </div>
        </div>
      </footer>

      {/* Mobile Fixed Bottom Navigation */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-15 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-center"
      >
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex flex-col items-center justify-center h-full text-[11px] font-medium ${
              isActive ? 'text-emerald-700' : 'text-slate-500'
            }`
          }
        >
          <Home className="w-5 h-5" />
          <span className="mt-0.5">Home</span>
        </NavLink>
        <NavLink
          to="/live"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center h-full text-[11px] font-medium ${
              isActive ? 'text-red-600' : 'text-slate-500'
            }`
          }
        >
          <Radio className="w-5 h-5" />
          <span className="mt-0.5">Live</span>
        </NavLink>
        <NavLink
          to="/tournaments"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center h-full text-[11px] font-medium ${
              isActive ? 'text-emerald-700' : 'text-slate-500'
            }`
          }
        >
          <Trophy className="w-5 h-5" />
          <span className="mt-0.5">Events</span>
        </NavLink>
        <NavLink
          to="/leaderboards"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center h-full text-[11px] font-medium ${
              isActive ? 'text-emerald-700' : 'text-slate-500'
            }`
          }
        >
          <Award className="w-5 h-5" />
          <span className="mt-0.5">Stats</span>
        </NavLink>
        <NavLink
          to={customerUser ? '/following' : '/login'}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center h-full text-[11px] font-medium ${
              isActive ? 'text-emerald-700' : 'text-slate-500'
            }`
          }
        >
          <User className="w-5 h-5" />
          <span className="mt-0.5">{customerUser ? 'Following' : 'Sign In'}</span>
        </NavLink>
      </nav>
    </div>
  );
}
