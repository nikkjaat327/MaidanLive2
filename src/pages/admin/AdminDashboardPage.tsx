import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlaySquare, Radio, SlidersHorizontal, Trophy, UserCheck, Users } from 'lucide-react';
import { ActivityLogItem, DashboardStats } from '../../types/index.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';

export function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setError(null);
      const data = await entityService.getDashboardStats();
      setStats(data.stats);
      setActivity(data.recentActivity);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load dashboard statistics.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const cards = [
    { label: 'Total Streams', value: stats?.totalStreams ?? 0, icon: Radio, accent: 'text-slate-900' },
    { label: 'Currently Live', value: stats?.liveStreams ?? 0, icon: Radio, accent: 'text-red-600' },
    { label: 'Ended Streams', value: stats?.endedStreams ?? 0, icon: Radio, accent: 'text-slate-700' },
    { label: 'Published Replays', value: stats?.publishedReplays ?? 0, icon: PlaySquare, accent: 'text-emerald-700' },
    { label: 'Tournaments', value: stats?.tournamentsCount ?? 0, icon: Trophy, accent: 'text-slate-900' },
    { label: 'Teams', value: stats?.teamsCount ?? 0, icon: Users, accent: 'text-slate-900' },
    { label: 'Players', value: stats?.playersCount ?? 0, icon: UserCheck, accent: 'text-slate-900' },
    { label: 'Upcoming Streams', value: stats?.upcomingStreams ?? 0, icon: Radio, accent: 'text-amber-700' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Broadcast Overview
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Live database metrics across streams, scoreboards, tournaments, and rosters.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/admin/live-streams"
            className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 whitespace-nowrap"
          >
            <Radio className="w-4 h-4" />
            <span>Manage Live Streams</span>
          </Link>
          <Link
            to="/admin/scoreboard"
            className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Live Score Control</span>
          </Link>
        </div>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-2"
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>{card.label}</span>
                <Icon className="w-4 h-4 text-slate-400" />
              </div>
              <p className={`font-mono tabular-nums text-2xl sm:text-3xl font-bold ${card.accent}`}>
                {loading ? '—' : card.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Recent Admin Audit Log */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Recent Admin Activity</h2>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {activity.length} event{activity.length === 1 ? '' : 's'}
          </span>
        </div>

        {loading ? (
          <div className="p-5 text-sm text-slate-500">Loading activity logs...</div>
        ) : activity.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            No administrative actions recorded yet. Start a stream or create a tournament to begin.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {activity.map((item) => (
              <div
                key={item._id}
                className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {item.action}{' '}
                    {item.details && (
                      <span className="font-normal text-slate-600">· {item.details}</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {item.actorName} ({item.actorRole}) · {item.resourceType}
                  </p>
                </div>
                <span className="text-xs text-slate-400 font-mono tabular-nums shrink-0">
                  {new Date(item.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
