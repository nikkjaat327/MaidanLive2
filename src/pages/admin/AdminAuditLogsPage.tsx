import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, ClipboardList, Search } from 'lucide-react';
import { ActivityLogItem } from '../../types/index.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';

export function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      setError(null);
      const data = await entityService.getActivityLogs({
        search: search.trim() || undefined,
        resourceType: resourceType || undefined,
        action: actionFilter.trim() || undefined,
        limit: 120,
      });
      setLogs(data);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load audit logs.'));
    } finally {
      setLoading(false);
    }
  }, [search, resourceType, actionFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
          Administrative Audit Logs
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Immutable trail of administrative actions, score corrections, fixture edits, and moderation actions with before/after value snapshots.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor, details, or action..."
            className="w-full min-h-[40px] pl-9 pr-3 text-sm border border-slate-300 rounded-lg"
          />
        </div>
        <select
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value)}
          className="min-h-[40px] px-3 text-sm border border-slate-300 rounded-lg bg-white"
        >
          <option value="">All Resource Types</option>
          <option value="LiveStream">LiveStream</option>
          <option value="LiveScore">LiveScore</option>
          <option value="Tournament">Tournament</option>
          <option value="Fixture">Fixture</option>
          <option value="Team">Team</option>
          <option value="Player">Player</option>
          <option value="Venue">Venue</option>
          <option value="Sponsor">Sponsor</option>
          <option value="ChatMessage">ChatMessage</option>
          <option value="MatchReport">MatchReport</option>
          <option value="User">User</option>
        </select>
        <input
          type="text"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          placeholder="Filter by action (e.g. SCORE_CORRECTION)"
          className="min-h-[40px] px-3 text-sm border border-slate-300 rounded-lg"
        />
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <TableSkeleton rows={6} />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="w-6 h-6" />}
          title="No matching audit log entries"
          description="Administrative actions, score corrections, and moderation events will be logged here."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Resource</th>
                <th className="py-3 px-4">Details</th>
                <th className="py-3 px-4 text-right">Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {logs.map((log) => {
                const hasDiff = Boolean(log.previousValue || log.newValue);
                const expanded = expandedId === log._id;
                return (
                  <>
                    <tr key={log._id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{log.actorName}</div>
                        <div className="text-[11px] text-slate-500">{log.actorRole}</div>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                        {log.action}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{log.resourceType}</td>
                      <td className="py-3 px-4 text-slate-700 max-w-md">{log.details || '—'}</td>
                      <td className="py-3 px-4 text-right">
                        {hasDiff ? (
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : log._id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium"
                          >
                            <span>{expanded ? 'Hide' : 'Inspect'}</span>
                            {expanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                    {expanded && hasDiff && (
                      <tr key={`${log._id}-diff`} className="bg-slate-50/80">
                        <td colSpan={6} className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <p className="text-[11px] font-semibold text-slate-500 uppercase mb-1">
                                Previous Value
                              </p>
                              <pre className="p-2.5 rounded-lg bg-white border border-slate-200 text-[11px] font-mono overflow-x-auto max-h-48">
                                {log.previousValue
                                  ? JSON.stringify(log.previousValue, null, 2)
                                  : 'null'}
                              </pre>
                            </div>
                            <div>
                              <p className="text-[11px] font-semibold text-slate-500 uppercase mb-1">
                                New Value
                              </p>
                              <pre className="p-2.5 rounded-lg bg-white border border-slate-200 text-[11px] font-mono overflow-x-auto max-h-48">
                                {log.newValue ? JSON.stringify(log.newValue, null, 2) : 'null'}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
