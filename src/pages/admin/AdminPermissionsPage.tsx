import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { AuthUser, SecurityPolicyData } from '../../types/index.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { authService } from '../../services/auth/authService.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';

export function AdminPermissionsPage() {
  const { adminUser } = useAuth();
  const isSuperOrAdmin = adminUser?.role === 'SUPER_ADMIN' || adminUser?.role === 'ADMIN';
  const isSuperAdmin = adminUser?.role === 'SUPER_ADMIN';

  const [policy, setPolicy] = useState<SecurityPolicyData>({
    enforceAdmin2FA: false,
    maxFailedLoginAttempts: 5,
    lockoutMinutes: 15,
    providerSwitchGraceSeconds: 15,
  });
  const [availablePermissions, setAvailablePermissions] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [creatingAssignment, setCreatingAssignment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New Role Assignment form
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('SCORER');
  const [scopeType, setScopeType] = useState<'global' | 'tournament' | 'match' | 'team'>('global');
  const [scopeId, setScopeId] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  const loadAll = useCallback(async () => {
    if (!isSuperOrAdmin) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [policyRes, assignmentList, userList] = await Promise.all([
        authService.getSecurityPolicy(),
        authService.listRoleAssignments().catch(() => []),
        entityService.listUsers().catch(() => []),
      ]);
      setPolicy(policyRes.policy);
      setAvailablePermissions(policyRes.availablePermissions || []);
      setAssignments(assignmentList);
      setUsers(userList);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load permissions & security policy.'));
    } finally {
      setLoading(false);
    }
  }, [isSuperOrAdmin]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (!isSuperOrAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">
        Only Administrators can view and manage security policies and scoped role assignments.
      </div>
    );
  }

  async function handleSavePolicy(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingPolicy(true);
      setError(null);
      const updated = await authService.updateSecurityPolicy(policy);
      setPolicy(updated);
      setSuccess('Platform security policy updated.');
    } catch (err) {
      setError(extractApiError(err, 'Failed to save security policy.'));
    } finally {
      setSavingPolicy(false);
    }
  }

  function togglePerm(p: string) {
    setSelectedPerms((prev) => (prev.includes(p) ? prev.filter((item) => item !== p) : [...prev, p]));
  }

  async function handleCreateAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    try {
      setCreatingAssignment(true);
      setError(null);
      await authService.createRoleAssignment({
        userId,
        role,
        scopeType,
        scopeId: scopeId.trim() || undefined,
        permissions: selectedPerms,
      });
      setScopeId('');
      setSelectedPerms([]);
      setSuccess('Scoped role assignment created.');
      await loadAll();
    } catch (err) {
      setError(extractApiError(err, 'Failed to create role assignment.'));
    } finally {
      setCreatingAssignment(false);
    }
  }

  async function handleDeleteAssignment(id: string) {
    try {
      setError(null);
      await authService.deleteRoleAssignment(id);
      setSuccess('Role assignment removed.');
      await loadAll();
    } catch (err) {
      setError(extractApiError(err, 'Failed to delete role assignment.'));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
          Permissions &amp; Security Policy
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure authentication lockout thresholds, 2FA enforcement, and granular tournament/match permission scopes.
        </p>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      {loading ? (
        <TableSkeleton rows={4} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Security Policy Card */}
          <form
            onSubmit={handleSavePolicy}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#EA580C]" />
              <h2 className="text-base font-bold text-slate-900">Authentication &amp; Broadcast Policy</h2>
            </div>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={policy.enforceAdmin2FA}
                onChange={(e) => setPolicy((p) => ({ ...p, enforceAdmin2FA: e.target.checked }))}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#EA580C]"
              />
              <div className="text-xs">
                <p className="font-semibold text-slate-900">Enforce TOTP 2FA for Staff Accounts</p>
                <p className="text-slate-500 mt-0.5">
                  Requires administrators, organizers, and scorers to enable authenticator 2FA.
                </p>
              </div>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Max Failed Logins
                </label>
                <input
                  type="number"
                  min={3}
                  max={20}
                  value={policy.maxFailedLoginAttempts}
                  onChange={(e) =>
                    setPolicy((p) => ({
                      ...p,
                      maxFailedLoginAttempts: Number(e.target.value) || 5,
                    }))
                  }
                  className="w-full min-h-[40px] px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Lockout (Minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={policy.lockoutMinutes}
                  onChange={(e) =>
                    setPolicy((p) => ({ ...p, lockoutMinutes: Number(e.target.value) || 15 }))
                  }
                  className="w-full min-h-[40px] px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Switch Grace (sec)
                </label>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={policy.providerSwitchGraceSeconds}
                  onChange={(e) =>
                    setPolicy((p) => ({
                      ...p,
                      providerSwitchGraceSeconds: Number(e.target.value) || 15,
                    }))
                  }
                  className="w-full min-h-[40px] px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            {policy.updatedAt && (
              <p className="text-[11px] text-slate-500">
                Last updated {new Date(policy.updatedAt).toLocaleString()}
                {policy.updatedByName ? ` by ${policy.updatedByName}` : ''}
              </p>
            )}

            <button
              type="submit"
              disabled={savingPolicy}
              className="min-h-[42px] px-5 py-2 text-sm font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50"
            >
              {savingPolicy ? 'Saving...' : 'Save Security Policy'}
            </button>
          </form>

          {/* Create Scoped Role Assignment Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-[#EA580C]" />
              <h2 className="text-base font-bold text-slate-900">Assign Scoped Permissions</h2>
            </div>

            {!isSuperAdmin ? (
              <p className="text-xs text-slate-500">
                Only Super Admins can create or remove scoped role assignments. You can view active scopes below.
              </p>
            ) : (
              <form onSubmit={handleCreateAssignment} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Staff User</label>
                    <select
                      required
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">Select user...</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Scope Type</label>
                    <select
                      value={scopeType}
                      onChange={(e) => setScopeType(e.target.value as any)}
                      className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="global">Global</option>
                      <option value="tournament">Tournament ID</option>
                      <option value="match">Match / Stream ID</option>
                      <option value="team">Team ID</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Role Label</label>
                    <input
                      type="text"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      placeholder="SCORER / STREAM_OP"
                      className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Target Resource ID {scopeType === 'global' ? '(Optional)' : '*'}
                    </label>
                    <input
                      type="text"
                      value={scopeId}
                      onChange={(e) => setScopeId(e.target.value)}
                      placeholder={scopeType === 'global' ? 'Leave empty for global' : 'Object ID'}
                      className="w-full min-h-[40px] px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1.5">Granular Permissions</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto p-2.5 border border-slate-200 rounded-lg bg-slate-50">
                    {availablePermissions.map((perm) => (
                      <label key={perm} className="inline-flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedPerms.includes(perm)}
                          onChange={() => togglePerm(perm)}
                          className="w-3.5 h-3.5 rounded border-slate-300"
                        />
                        <span className="font-mono text-[11px] truncate">{perm}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={creatingAssignment || !userId}
                  className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>{creatingAssignment ? 'Assigning...' : 'Add Scoped Assignment'}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Existing Scoped Role Assignments Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Active Scoped Role Assignments</h2>
          <span className="text-xs font-mono text-slate-500">{assignments.length} active</span>
        </div>
        {assignments.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            No custom scoped role assignments configured yet.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Scope</th>
                <th className="py-3 px-4">Permissions</th>
                {isSuperAdmin && <th className="py-3 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {assignments.map((a) => {
                const userObj = typeof a.userId === 'object' && a.userId ? a.userId : null;
                return (
                  <tr key={a.id || a._id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{userObj?.name || 'User'}</p>
                      <p className="text-slate-500">{userObj?.email || a.userId}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-800">{a.role}</span> ·{' '}
                      <span className="font-mono text-slate-600">
                        {a.scopeType}
                        {a.scopeId ? `:${a.scopeId}` : ''}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                      {(a.permissions || []).join(', ') || 'None'}
                    </td>
                    {isSuperAdmin && (
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteAssignment(a.id || a._id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
