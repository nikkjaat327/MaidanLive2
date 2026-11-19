import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ExternalLink,
  HeartPulse,
  Radio,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { MatchHealthItem } from '../../types/index.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { resolveMatchStatus } from '../../utils/matchStatus.ts';
import { MatchStatusBadge } from '../../components/common/MatchStatusBadge.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';

export function AdminMatchHealthPage() {
  const [matches, setMatches] = useState<MatchHealthItem[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [liveCount, setLiveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LIVE' | 'DEGRADED'>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      setError(null);
      const res = await platformOpsService.getMatchHealthOverview();
      setMatches(res.matches || []);
      setGeneratedAt(res.generatedAt || null);
      setLiveCount(res.liveCount || 0);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load match health diagnostics.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  async function handleVerify(item: MatchHealthItem) {
    try {
      setVerifyingId(item.id);
      setError(null);
      const res = await liveStreamService.verifyStreamHealth(
        item.id,
        item.activeStreamingProvider
      );
      setSuccess(
        `${item.matchTitle}: ${res.provider.toUpperCase()} is ${res.ok ? 'healthy' : 'offline'} (${res.message})`
      );
      await loadHealth();
    } catch (err) {
      setError(extractApiError(err, 'Unable to verify stream health.'));
    } finally {
      setVerifyingId(null);
    }
  }

  const healthyCount = matches.filter((m) => m.healthGrade === 'Healthy').length;
  const degradedOrOfflineCount = matches.filter(
    (m) => m.healthGrade === 'Degraded' || m.healthGrade === 'Offline'
  ).length;

  const visibleMatches = matches.filter((m) => {
    if (statusFilter === 'LIVE') return m.status === 'LIVE';
    if (statusFilter === 'DEGRADED') {
      return m.healthGrade === 'Degraded' || m.healthGrade === 'Offline';
    }
    return true;
  });

  const gradeBadgeClass = (grade: MatchHealthItem['healthGrade']) => {
    switch (grade) {
      case 'Healthy':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Degraded':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Offline':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 inline-flex items-center gap-2.5">
            <HeartPulse className="w-6 h-6 text-[#EA580C]" />
            <span>Match &amp; Stream Health Monitor</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time broadcast diagnostics, active providers, scorer assignments, and health checks.
          </p>
        </div>

        <button
          type="button"
          onClick={loadHealth}
          className="min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh Diagnostics</span>
        </button>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      {success && <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Tracked Matches</p>
          <p className="font-mono text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {loading ? '—' : matches.length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Live Broadcasts</p>
          <p className="font-mono text-2xl font-bold text-red-600 mt-1 tabular-nums">
            {loading ? '—' : liveCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Healthy Feeds</p>
          <p className="font-mono text-2xl font-bold text-emerald-700 mt-1 tabular-nums">
            {loading ? '—' : healthyCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Degraded / Offline</p>
          <p className="font-mono text-2xl font-bold text-amber-700 mt-1 tabular-nums">
            {loading ? '—' : degradedOrOfflineCount}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {[
            { id: 'ALL' as const, label: `All (${matches.length})` },
            { id: 'LIVE' as const, label: `Live Only (${liveCount})` },
            { id: 'DEGRADED' as const, label: `Needs Attention (${degradedOrOfflineCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                statusFilter === tab.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {generatedAt && (
          <span className="text-xs text-slate-400 font-mono">
            Checked: {new Date(generatedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : visibleMatches.length === 0 ? (
        <EmptyState
          icon={<Activity className="w-6 h-6" />}
          title="No matches in this filter"
          description="Create or start a live broadcast to inspect stream health and scorer sync telemetry."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase">
                <th className="py-3 px-4">Match</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Provider &amp; Health</th>
                <th className="py-3 px-3">Scorers</th>
                <th className="py-3 px-3 text-right">Viewers</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleMatches.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <p className="font-semibold text-sm text-slate-900">{m.matchTitle}</p>
                    <p className="text-slate-500 mt-0.5">
                      {m.sport}
                      {m.tournamentName ? ` · ${m.tournamentName}` : ''}
                    </p>
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <MatchStatusBadge
                      status={resolveMatchStatus(
                        { status: m.status },
                        { matchStatus: m.matchStatus }
                      )}
                      compact
                    />
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-semibold uppercase text-slate-800">
                        <Radio className="w-3.5 h-3.5 text-[#EA580C]" />
                        {m.activeStreamingProvider}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded border text-[11px] font-bold ${gradeBadgeClass(
                          m.healthGrade
                        )}`}
                      >
                        {m.healthGrade}
                      </span>
                    </div>
                    {m.streamHealth?.detail && (
                      <p className="text-[11px] text-slate-500 mt-0.5 max-w-[220px] truncate">
                        {m.streamHealth.detail}
                      </p>
                    )}
                  </td>
                  <td className="py-3 px-3 text-slate-600">
                    <div>Primary: {m.authorizedScorer?.name || 'Any Scorer'}</div>
                    {m.backupScorer && (
                      <div className="text-slate-400">Backup: {m.backupScorer.name}</div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-800">
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {m.activeSocketViewers}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                    <button
                      type="button"
                      disabled={verifyingId === m.id}
                      onClick={() => handleVerify(m)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-100 disabled:opacity-50"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{verifyingId === m.id ? 'Checking...' : 'Verify'}</span>
                    </button>
                    <Link
                      to={`/admin/scoreboard/${m.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-900 text-white font-semibold hover:bg-slate-800"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Score</span>
                    </Link>
                    <Link
                      to={`/live/${m.id}`}
                      className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-slate-600 hover:bg-slate-100"
                      title="Open public Match Center"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
