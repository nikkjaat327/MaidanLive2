import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList,
  Plus,
  Radio,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  UserCheck,
  UserX,
  Video,
} from 'lucide-react';
import { obsStudioService } from '../../services/obs/obsStudioService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import type { BroadcastersManagementPayload } from '../../types/obs.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { Modal } from '../../components/common/Modal.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';

const BROADCASTER_PERM_OPTIONS = [
  { key: 'broadcast:control', label: 'Control Scenes & Cameras' },
  { key: 'broadcast:manage_cameras', label: 'Add / Edit / Disconnect Cameras' },
  { key: 'broadcast:manage_overlays', label: 'Manage Scoreboard Overlays' },
  { key: 'broadcast:stream_control', label: 'Start / Stop OBS Stream' },
  { key: 'broadcast:record_control', label: 'Start / Stop OBS Recording' },
] as const;

export function AdminBroadcastersPage() {
  const [data, setData] = useState<BroadcastersManagementPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Assign modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState('');
  const [scopeType, setScopeType] = useState<'tournament' | 'match'>('tournament');
  const [tournamentId, setTournamentId] = useState('');
  const [matchId, setMatchId] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>(
    BROADCASTER_PERM_OPTIONS.map((p) => p.key)
  );
  const [notes, setNotes] = useState('');
  const [promoteToBroadcaster, setPromoteToBroadcaster] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED'>('ALL');

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const res = await obsStudioService.listBroadcasters();
      setData(res);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load broadcaster assignments.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function togglePerm(perm: string) {
    setSelectedPerms((prev) =>
      prev.includes(perm) ? prev.filter((item) => item !== perm) : [...prev, perm]
    );
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!targetUserId) return;
    try {
      setSubmitting(true);
      setError(null);
      await obsStudioService.assignBroadcaster({
        userId: targetUserId,
        scopeType,
        ...(scopeType === 'tournament' ? { tournamentId } : { matchId }),
        permissions: selectedPerms,
        notes: notes.trim(),
        promoteToBroadcaster,
      });
      setAssignOpen(false);
      setNotes('');
      setSuccess('Broadcaster assigned cleanly.');
      await loadData();
    } catch (err) {
      setError(extractApiError(err, 'Failed to assign broadcaster.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(
    assignmentId: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED',
    revokeReason?: string
  ) {
    try {
      setUpdatingId(assignmentId);
      setError(null);
      await obsStudioService.updateBroadcasterAssignment(assignmentId, {
        status,
        ...(revokeReason ? { revokeReason } : {}),
      });
      setSuccess(`Assignment updated to ${status}.`);
      await loadData();
    } catch (err) {
      setError(extractApiError(err, 'Failed to update broadcaster assignment status.'));
    } finally {
      setUpdatingId(null);
    }
  }

  const visibleAssignments = (data?.assignments || []).filter((a) =>
    statusFilter === 'ALL' ? true : a.status === statusFilter
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Broadcaster Team &amp; Production Assignments
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Assign dedicated Broadcasters to entire tournaments or specific matches without granting unrelated admin or scoring permissions.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadData}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => setAssignOpen(true)}
            className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600"
          >
            <Plus className="w-4 h-4" />
            <span>Assign Broadcaster</span>
          </button>
        </div>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      {loading ? (
        <TableSkeleton rows={5} />
      ) : !data ? null : (
        <>
          {/* Active OBS Broadcast Sessions */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                <Radio className="w-4 h-4 text-[#EA580C]" />
                <span>Monitored Broadcast Sessions ({data.activeSessions.length})</span>
              </h2>
              <Link
                to="/broadcaster/dashboard"
                className="text-xs font-semibold text-[#EA580C] hover:underline"
              >
                Open Broadcaster Hub
              </Link>
            </div>

            {data.activeSessions.length === 0 ? (
              <p className="text-xs text-slate-500">
                No OBS profiles initialized yet for your matches.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {data.activeSessions.map((sess) => (
                  <div
                    key={sess.matchId}
                    className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex flex-col justify-between gap-2.5"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            sess.connectionStatus === 'CONNECTED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          OBS {sess.connectionStatus}
                        </span>
                        {sess.obsStreamActive && (
                          <span className="px-2 py-0.5 rounded bg-red-600 text-white font-bold">
                            STREAMING
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-slate-900 mt-1.5 truncate">
                        {sess.matchTitle}
                      </p>
                      <p className="text-[11px] font-mono text-slate-600 mt-0.5">
                        {sess.onlineCameraCount}/{sess.totalCameraCount} cameras online · Scene:{' '}
                        {sess.activeObsScene || '—'}
                      </p>
                      {sess.activeControllerName && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Active controller: <strong>{sess.activeControllerName}</strong>
                        </p>
                      )}
                    </div>
                    <Link
                      to={`/broadcaster/control-room/${sess.matchId}`}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Open Control Room</span>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Broadcaster Assignments Table (with preserved history) */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[#EA580C]" />
                <h2 className="font-display text-base font-bold text-slate-900">
                  Broadcaster Assignments &amp; History ({visibleAssignments.length})
                </h2>
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="min-h-[36px] px-3 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
                <option value="REVOKED">REVOKED</option>
              </select>
            </div>

            {visibleAssignments.length === 0 ? (
              <div className="p-6 text-xs text-slate-500">
                No broadcaster assignments match this filter yet. Click &ldquo;Assign Broadcaster&rdquo; to assign a user.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase">
                      <th className="py-3 px-4">Broadcaster</th>
                      <th className="py-3 px-4">Scope</th>
                      <th className="py-3 px-4">Permissions</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Assigned By</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleAssignments.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900">{a.userName || 'User'}</p>
                          <p className="text-slate-500">{a.userEmail}</p>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold uppercase text-slate-700">
                            {a.scopeType}
                          </span>
                          <p className="text-slate-600 mt-0.5">
                            {a.scopeType === 'tournament'
                              ? a.tournamentName || a.tournamentId
                              : a.matchTitle || a.matchId}
                          </p>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600 max-w-xs">
                          {(a.permissions || []).join(', ')}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                              a.status === 'ACTIVE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : a.status === 'SUSPENDED'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {a.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {a.assignedByName || '—'}
                          <p className="text-[10px] text-slate-400">
                            {new Date(a.createdAt).toLocaleDateString()}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {a.status === 'ACTIVE' ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={updatingId === a.id}
                                onClick={() => handleStatusChange(a.id, 'SUSPENDED')}
                                className="px-2.5 py-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100"
                              >
                                Suspend
                              </button>
                              <button
                                type="button"
                                disabled={updatingId === a.id}
                                onClick={() =>
                                  handleStatusChange(a.id, 'REVOKED', 'Revoked by organizer/admin')
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100"
                              >
                                <UserX className="w-3 h-3" />
                                <span>Revoke</span>
                              </button>
                            </div>
                          ) : a.status === 'SUSPENDED' ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={updatingId === a.id}
                                onClick={() => handleStatusChange(a.id, 'ACTIVE')}
                                className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100"
                              >
                                Reactivate
                              </button>
                              <button
                                type="button"
                                disabled={updatingId === a.id}
                                onClick={() =>
                                  handleStatusChange(a.id, 'REVOKED', 'Revoked while suspended')
                                }
                                className="px-2.5 py-1 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100"
                              >
                                Revoke
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-mono">
                              Revoked (Archived)
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Recent Broadcast Production Activity */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
            <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-[#EA580C]" />
              <span>Recent Broadcast Production Audit Logs</span>
            </h2>
            {data.recentAuditLogs.length === 0 ? (
              <p className="text-xs text-slate-500">No broadcast activity logged yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] uppercase text-slate-500">
                      <th className="py-2 pr-3">Time</th>
                      <th className="py-2 pr-3">Action</th>
                      <th className="py-2 pr-3">Operator</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2">Scene / Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.recentAuditLogs.slice(0, 20).map((l) => (
                      <tr key={l.id}>
                        <td className="py-2 pr-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {new Date(l.timestamp).toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 font-mono font-semibold text-slate-800 whitespace-nowrap">
                          {l.actionType}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {l.userName || 'System'}{' '}
                          <span className="text-slate-400">({l.userRole || '—'})</span>
                        </td>
                        <td className="py-2 pr-3 font-mono">
                          <span
                            className={
                              l.obsStatus === 'SUCCESS' ? 'text-emerald-700' : 'text-red-600'
                            }
                          >
                            {l.obsStatus}
                          </span>
                        </td>
                        <td className="py-2 text-slate-600 truncate max-w-xs">
                          {l.newScene || l.cameraName || l.errorDetails || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* Assign Broadcaster Modal */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign Broadcaster"
        subtitle="Grant scoped broadcast production access to a tournament or individual match."
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleAssign} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Registered User *
            </label>
            <select
              required
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="w-full min-h-[40px] px-3 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Choose user...</option>
              {(data?.candidates || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email}) — {c.role}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Assignment Scope
              </label>
              <select
                value={scopeType}
                onChange={(e) => setScopeType(e.target.value as 'tournament' | 'match')}
                className="w-full min-h-[40px] px-3 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="tournament">Entire Tournament</option>
                <option value="match">Specific Match</option>
              </select>
            </div>

            {scopeType === 'tournament' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tournament *
                </label>
                <select
                  required
                  value={tournamentId}
                  onChange={(e) => setTournamentId(e.target.value)}
                  className="w-full min-h-[40px] px-3 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Select tournament...</option>
                  {(data?.tournaments || []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.status})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Match *</label>
                <select
                  required
                  value={matchId}
                  onChange={(e) => setMatchId(e.target.value)}
                  className="w-full min-h-[40px] px-3 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Select match...</option>
                  {(data?.matches || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      [{m.status}] {m.matchTitle}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-700 mb-1.5">Broadcast Capabilities</p>
            <div className="grid grid-cols-1 gap-1.5 p-3 rounded-lg border border-slate-200 bg-slate-50">
              {BROADCASTER_PERM_OPTIONS.map((opt) => (
                <label key={opt.key} className="inline-flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedPerms.includes(opt.key)}
                    onChange={() => togglePerm(opt.key)}
                    className="w-4 h-4 rounded border-slate-300 text-[#EA580C]"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={promoteToBroadcaster}
              onChange={(e) => setPromoteToBroadcaster(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-[#EA580C]"
            />
            <span>
              Set user role to <strong>BROADCASTER</strong> if currently Spectator / Captain / Moderator
            </span>
          </label>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Production Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Ground A primary camera & OBS director"
              className="w-full min-h-[40px] px-3 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setAssignOpen(false)}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !targetUserId}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>{submitting ? 'Assigning...' : 'Confirm Assignment'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
