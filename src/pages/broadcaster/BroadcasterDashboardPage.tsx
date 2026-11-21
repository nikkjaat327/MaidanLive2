import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Camera,
  CalendarClock,
  CheckCircle2,
  Lock,
  Radio,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  Trophy,
  Video,
} from 'lucide-react';
import { obsStudioService } from '../../services/obs/obsStudioService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import type {
  BroadcasterDashboardMatchItem,
  BroadcasterDashboardPayload,
} from '../../types/obs.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';

function MatchRowCard({ item }: { item: BroadcasterDashboardMatchItem }) {
  const obsConnected = item.obsConnectionStatus === 'CONNECTED';
  return (
    <div className="bg-[#0F172A] border border-slate-800/90 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:border-slate-700 transition-colors">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
          <span
            className={`px-2 py-0.5 rounded border font-bold ${
              item.status === 'LIVE'
                ? 'bg-red-500/15 text-red-300 border-red-500/40'
                : item.status === 'UPCOMING'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            {item.status}
          </span>
          <span
            className={`px-2 py-0.5 rounded border ${
              obsConnected
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            OBS {item.obsConnectionStatus}
          </span>
          {item.obsStreamActive && (
            <span className="px-2 py-0.5 rounded bg-red-600 text-white font-bold">ON AIR</span>
          )}
          {item.adminOverrideLocked && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-950/60 text-red-300 border border-red-800/70">
              <Lock className="w-3 h-3" />
              OVERRIDE LOCK
            </span>
          )}
          <span className="text-slate-400 truncate">
            {item.tournamentName || item.gameName || 'Standalone Match'}
          </span>
        </div>

        <h3 className="text-base font-bold text-white truncate">{item.matchTitle}</h3>

        <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-[#EA580C]" />
            <span>
              {item.connectedCameraCount} connected / {item.totalCameraCount} configured cameras
            </span>
          </span>
          {item.activeObsScene && (
            <span>
              Scene: <strong className="text-slate-200">{item.activeObsScene}</strong>
            </span>
          )}
          {item.activeControllerName && (
            <span>
              Controller: <strong className="text-slate-200">{item.activeControllerName}</strong>
            </span>
          )}
          {item.matchDate && (
            <span>
              {new Date(item.matchDate).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Link
          to={`/broadcaster/control-room/${item.id}`}
          className="min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 transition-colors whitespace-nowrap"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Open Broadcast Control Room</span>
        </Link>
      </div>
    </div>
  );
}

export function BroadcasterDashboardPage() {
  const [data, setData] = useState<BroadcasterDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);
      else setRefreshing(true);
      setError(null);
      const res = await obsStudioService.getBroadcasterDashboard();
      setData(res);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load Broadcaster Dashboard.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard(false);
  }, [loadDashboard]);

  const liveMatches = (data?.matches || []).filter((m) => m.status === 'LIVE');
  const upcomingMatches = (data?.matches || []).filter((m) => m.status === 'UPCOMING');
  const completedMatches = (data?.matches || []).filter((m) => m.status === 'ENDED').slice(0, 12);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Broadcaster Control Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Monitor assigned tournaments, active OBS Studio sessions, field smartphone cameras, and launch the live Broadcast Control Room.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadDashboard(true)}
          disabled={refreshing || loading}
          className="min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-200 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh Live Status</span>
        </button>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <TableSkeleton rows={5} />
      ) : !data ? null : (
        <>
          {/* KPI Grid (max 4 metrics visible cleanly) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#0F172A] border border-slate-800/90 rounded-lg p-4">
              <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Assigned Tournaments
              </p>
              <p className="font-mono tabular-nums text-2xl font-bold text-white mt-1.5">
                {data.summary.assignedTournaments}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {data.scope.allAccess
                  ? 'Full organizational access'
                  : `${data.summary.authorizedMatchIdsCount} authorized matches`}
              </p>
            </div>

            <div className="bg-[#0F172A] border border-slate-800/90 rounded-lg p-4">
              <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Live / Upcoming Matches
              </p>
              <p className="font-mono tabular-nums text-2xl font-bold text-white mt-1.5">
                {data.summary.liveMatches}{' '}
                <span className="text-sm font-normal text-slate-400">
                  live · {data.summary.upcomingMatches} upcoming
                </span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {data.summary.completedMatches} recently completed
              </p>
            </div>

            <div className="bg-[#0F172A] border border-slate-800/90 rounded-lg p-4">
              <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                OBS Studio Connections
              </p>
              <p className="font-mono tabular-nums text-2xl font-bold text-emerald-400 mt-1.5">
                {data.summary.connectedObsCount}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Real-time verified OBS sessions
              </p>
            </div>

            <div className="bg-[#0F172A] border border-slate-800/90 rounded-lg p-4">
              <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Connected Cameras
              </p>
              <p className="font-mono tabular-nums text-2xl font-bold text-[#EA580C] mt-1.5">
                {data.summary.connectedCamerasTotal}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Active across authorized matches
              </p>
            </div>
          </div>

          {/* Active Broadcast Sessions */}
          {data.activeSessions.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                  <Radio className="w-4 h-4 text-red-400" />
                  <span>Active Broadcast Sessions ({data.activeSessions.length})</span>
                </h2>
              </div>
              <div className="space-y-3">
                {data.activeSessions.map((item) => (
                  <MatchRowCard key={`sess-${item.id}`} item={item} />
                ))}
              </div>
            </section>
          )}

          {/* Live & Upcoming Matches */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                <Video className="w-4 h-4 text-[#EA580C]" />
                <span>Assigned Live &amp; Upcoming Broadcasts</span>
              </h2>
            </div>

            {liveMatches.length === 0 && upcomingMatches.length === 0 ? (
              <div className="bg-[#0F172A] border border-slate-800 rounded-lg p-6">
                <EmptyState
                  icon={<CalendarClock className="w-6 h-6" />}
                  title="No live or upcoming assigned matches"
                  description={
                    data.scope.allAccess
                      ? 'Create a match stream in Admin → Broadcasts to start producing with OBS.'
                      : 'Ask a Tournament Organizer or Admin to assign you to a tournament or upcoming match.'
                  }
                />
              </div>
            ) : (
              <div className="space-y-3">
                {[...liveMatches, ...upcomingMatches].map((item) => (
                  <MatchRowCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>

          {/* Assigned Tournaments & Scope Permissions */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <section className="lg:col-span-7 bg-[#0F172A] border border-slate-800/90 rounded-lg p-4 sm:p-5 space-y-3">
              <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[#EA580C]" />
                <span>Assigned Tournaments ({data.tournaments.length})</span>
              </h2>
              {data.tournaments.length === 0 ? (
                <p className="text-xs text-slate-400">No tournament assignments on record.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400">
                        <th className="py-2 pr-3">Tournament</th>
                        <th className="py-2 pr-3">Sport</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 text-right">Matches</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {data.tournaments.map((t) => (
                        <tr key={t.id}>
                          <td className="py-2.5 pr-3 font-semibold text-white">{t.name}</td>
                          <td className="py-2.5 pr-3 text-slate-400">{t.sportType}</td>
                          <td className="py-2.5 pr-3 font-mono text-[11px] text-slate-300">
                            {t.status}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-slate-200">
                            {t.matchCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="lg:col-span-5 bg-[#0F172A] border border-slate-800/90 rounded-lg p-4 sm:p-5 space-y-3">
              <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Your Broadcast Assignments</span>
              </h2>
              {data.scope.allAccess ? (
                <p className="text-xs text-slate-400">
                  Your administrative role grants broadcast supervision access across all matches.
                </p>
              ) : data.assignments.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No direct BroadcastAssignment entries recorded yet.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-64 overflow-y-auto">
                  {data.assignments.map((a) => (
                    <div
                      key={a.id}
                      className="p-3 rounded-lg border border-slate-800 bg-slate-950/60 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-white uppercase">
                          {a.scopeType} Scope
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                            a.status === 'ACTIVE'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : a.status === 'SUSPENDED'
                                ? 'bg-amber-500/15 text-amber-300'
                                : 'bg-red-500/15 text-red-300'
                          }`}
                        >
                          {a.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Permissions: {(a.permissions || []).join(', ') || 'Standard'}
                      </p>
                      {a.assignedByName && (
                        <p className="text-[10px] text-slate-500">Assigned by {a.assignedByName}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Recently Completed Broadcasts */}
          {completedMatches.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-slate-400" />
                <span>Recently Completed Broadcasts ({completedMatches.length})</span>
              </h2>
              <div className="space-y-2.5">
                {completedMatches.map((item) => (
                  <MatchRowCard key={`done-${item.id}`} item={item} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
