import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Clock, Eye, Info, PlaySquare, Radio, RefreshCw } from 'lucide-react';
import { ViewerAnalyticsSummary } from '../../types/index.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';

function formatWatchDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${rem}s`;
  return `${rem}s`;
}

export function AdminAnalyticsPage() {
  const [data, setData] = useState<ViewerAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      setError(null);
      const res = await platformOpsService.getAdminAnalytics();
      setData(res);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load platform viewer analytics.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const summary = data?.summary;
  const perMatch = data?.perMatch || [];
  const chartData = perMatch.slice(0, 10).map((m) => ({
    name: m.matchTitle.length > 18 ? `${m.matchTitle.slice(0, 16)}…` : m.matchTitle,
    liveViews: m.totalViews,
    replayViews: m.replayViews,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Platform Viewer Analytics
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time MaidanLive viewer sessions, active Socket.IO room counts, and replay views persisted in MongoDB.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadAnalytics(true)}
          disabled={refreshing}
          className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

      {summary?.sourceNote && (
        <div className="p-3.5 rounded-xl bg-slate-900 text-slate-100 text-xs flex items-start gap-2.5">
          <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>{summary.sourceNote}</span>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={4} />
      ) : !summary ? (
        <EmptyState
          icon={<Activity className="w-6 h-6" />}
          title="No analytics data available"
          description="Session analytics populate automatically when viewers open match pages."
        />
      ) : (
        <>
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Active Socket Viewers</span>
                <Radio className="w-4 h-4 text-red-600" />
              </div>
              <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-2">
                {summary.totalActiveSocketViewers}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Total Platform Views</span>
                <Eye className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-2">
                {summary.totalPlatformViews}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Total Replay Views</span>
                <PlaySquare className="w-4 h-4 text-blue-600" />
              </div>
              <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-2">
                {summary.totalReplayViews}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Tracked Watch Time</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-2">
                {formatWatchDuration(summary.totalWatchSeconds)}
              </p>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
              <h2 className="text-sm font-bold text-slate-900">
                Views &amp; Replays by Match (Top {chartData.length})
              </h2>
              <div className="w-full h-[260px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip />
                    <Bar dataKey="liveViews" name="Total Views" fill="#059669" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="replayViews" name="Replay Views" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {perMatch.length === 0 ? (
            <EmptyState
              icon={<Activity className="w-6 h-6" />}
              title="No per-match sessions recorded yet"
              description="Views and watch-time metrics will appear here as spectators open live streams or replays."
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Match</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 font-mono">Live Now</th>
                    <th className="py-3 px-4 font-mono">Platform Views</th>
                    <th className="py-3 px-4 font-mono">Unique Sessions</th>
                    <th className="py-3 px-4 font-mono">Replay Views</th>
                    <th className="py-3 px-4 font-mono">Watch Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {perMatch.map((m) => (
                    <tr key={m.streamId} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <Link
                          to={`/admin/scoreboard/${m.streamId}`}
                          className="font-semibold text-slate-900 hover:text-emerald-700"
                        >
                          {m.matchTitle}
                        </Link>
                        {m.gameName && <div className="text-xs text-slate-500">{m.gameName}</div>}
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold">{m.status}</td>
                      <td className="py-3 px-4 font-mono tabular-nums text-red-600 font-semibold">
                        {m.liveSocketViewers}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums font-bold">{m.totalViews}</td>
                      <td className="py-3 px-4 font-mono tabular-nums">{m.uniqueSessions}</td>
                      <td className="py-3 px-4 font-mono tabular-nums text-blue-700">
                        {m.replayViews}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600">
                        {formatWatchDuration(m.totalWatchSeconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
