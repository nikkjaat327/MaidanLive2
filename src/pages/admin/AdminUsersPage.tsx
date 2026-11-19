import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Shield, Trash2 } from 'lucide-react';
import { AuthUser, UserPermissions } from '../../types/index.ts';
import { ROLE_LABELS, UserRole } from '../../constants/roles.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';

export function AdminUsersPage() {
  const { adminUser } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('SCORER');
  const [permissions, setPermissions] = useState<UserPermissions>({
    manageStreams: false,
    manageScores: true,
    manageTournaments: false,
    manageTeams: false,
    managePlayers: false,
    moderateChat: false,
    manageSponsors: false,
    manageVenues: false,
    declareResults: false,
  });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AuthUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isSuperAdmin = adminUser?.role === 'SUPER_ADMIN';

  const loadUsers = useCallback(async () => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const data = await entityService.listUsers();
      setUsers(data);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load users.'));
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  if (!isSuperAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">
        Only Super Admins can create administrative accounts and assign RBAC roles.
      </div>
    );
  }

  function handleRolePreset(nextRole: UserRole) {
    setRole(nextRole);
    if (nextRole === 'SUPER_ADMIN' || nextRole === 'ADMIN') {
      setPermissions({
        manageStreams: true,
        manageScores: true,
        manageTournaments: true,
        manageTeams: true,
        managePlayers: true,
        moderateChat: true,
        manageSponsors: true,
        manageVenues: true,
        declareResults: true,
      });
    } else if (nextRole === 'TOURNAMENT_ORGANIZER') {
      setPermissions({
        manageStreams: true,
        manageScores: true,
        manageTournaments: true,
        manageTeams: true,
        managePlayers: true,
        moderateChat: true,
        manageSponsors: true,
        manageVenues: true,
        declareResults: true,
      });
    } else if (nextRole === 'MODERATOR') {
      setPermissions({
        manageStreams: false,
        manageScores: false,
        manageTournaments: false,
        manageTeams: false,
        managePlayers: false,
        moderateChat: true,
        manageSponsors: false,
        manageVenues: false,
        declareResults: false,
      });
    } else {
      setPermissions({
        manageStreams: false,
        manageScores: true,
        manageTournaments: false,
        manageTeams: false,
        managePlayers: false,
        moderateChat: false,
        manageSponsors: false,
        manageVenues: false,
        declareResults: false,
      });
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      await entityService.createUser({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        permissions,
      });
      setModalOpen(false);
      setName('');
      setEmail('');
      setPassword('');
      setSuccess('Administrative user created.');
      await loadUsers();
    } catch (err) {
      setError(extractApiError(err, 'Failed to create user.'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: AuthUser) {
    try {
      setError(null);
      await entityService.updateUser(u.id, { isActive: !u.isActive });
      setSuccess(`Updated active status for ${u.email}.`);
      await loadUsers();
    } catch (err) {
      setError(extractApiError(err, 'Failed to update user status.'));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await entityService.deleteUser(deleteTarget.id);
      setDeleteTarget(null);
      setSuccess('User deleted.');
      await loadUsers();
    } catch (err) {
      setError(extractApiError(err, 'Failed to delete user.'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Users &amp; Role Permissions
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Create Admin, Tournament Organizer, and Scorer accounts with enforced backend RBAC.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Create Staff Account</span>
        </button>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      {loading ? (
        <TableSkeleton rows={4} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Permissions</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <p className="font-medium text-slate-900">{u.name}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                      <Shield className="w-3.5 h-3.5 text-slate-400" />
                      {ROLE_LABELS[u.role]}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">
                    {u.role === 'SUPER_ADMIN'
                      ? 'Full Access'
                      : u.role === 'SPECTATOR'
                        ? 'Read-Only'
                        : [
                            u.permissions?.manageStreams && 'Streams',
                            u.permissions?.manageScores && 'Scores',
                            u.permissions?.manageTournaments && 'Tournaments',
                            u.permissions?.manageTeams && 'Teams',
                            u.permissions?.managePlayers && 'Players',
                            u.permissions?.moderateChat && 'Chat Mod',
                            u.permissions?.manageSponsors && 'Sponsors',
                            u.permissions?.manageVenues && 'Venues',
                            u.permissions?.declareResults && 'Results',
                          ]
                            .filter(Boolean)
                            .join(', ') || 'None'}
                  </td>
                  <td className="py-3 px-4 text-xs font-semibold">
                    <span className={u.isActive ? 'text-emerald-700' : 'text-red-600'}>
                      {u.isActive ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    {u.id !== adminUser?.id && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleActive(u)}
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md mr-1"
                        >
                          {u.isActive ? 'Suspend' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(u)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create Administrative Account"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password *</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => handleRolePreset(e.target.value as UserRole)}
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="SCORER">Scorer</option>
              <option value="MODERATOR">Moderator</option>
              <option value="TOURNAMENT_ORGANIZER">Tournament Organizer</option>
              <option value="ADMIN">Admin</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-200">
            <p className="text-xs font-semibold text-slate-700">Granular Permissions</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {(
                [
                  ['manageStreams', 'Manage Streams'],
                  ['manageScores', 'Update Scores'],
                  ['manageTournaments', 'Manage Tournaments'],
                  ['manageTeams', 'Manage Teams'],
                  ['managePlayers', 'Manage Players'],
                  ['moderateChat', 'Moderate Chat'],
                  ['manageSponsors', 'Manage Sponsors'],
                  ['manageVenues', 'Manage Venues'],
                  ['declareResults', 'Declare Results'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(permissions[key])}
                    onChange={(e) =>
                      setPermissions((p) => ({ ...p, [key]: e.target.checked }))
                    }
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[42px] px-5 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete User Account"
        message={`Permanently remove "${deleteTarget?.email}"?`}
        confirmLabel="Delete"
      />
    </div>
  );
}
