import React, { useCallback, useEffect, useState } from 'react';
import {
  Edit3,
  KeyRound,
  Lock,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  Unlock,
} from 'lucide-react';
import { AuthUser, LiveStreamData, UserPermissions } from '../../types/index.ts';
import { ROLE_LABELS, UserRole } from '../../constants/roles.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';

export function AdminUsersPage() {
  const { adminUser } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create modal
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

  // Edit User Modal (role, permissions, assigned streams, password reset)
  const [editUser, setEditUser] = useState<AuthUser | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('SCORER');
  const [editPerms, setEditPerms] = useState<UserPermissions>({
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
  const [editGranular, setEditGranular] = useState('');
  const [editAssignedStreams, setEditAssignedStreams] = useState<string[]>([]);
  const [editNewPassword, setEditNewPassword] = useState('');
  const [updatingUser, setUpdatingUser] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AuthUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isSuperOrAdmin = adminUser?.role === 'SUPER_ADMIN' || adminUser?.role === 'ADMIN';
  const isSuperAdmin = adminUser?.role === 'SUPER_ADMIN';

  const loadUsers = useCallback(async () => {
    if (!isSuperOrAdmin) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [data, streamList] = await Promise.all([
        entityService.listUsers(),
        liveStreamService.listStreams().catch(() => [] as LiveStreamData[]),
      ]);
      setUsers(data);
      setStreams(streamList);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load users.'));
    } finally {
      setLoading(false);
    }
  }, [isSuperOrAdmin]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  if (!isSuperOrAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">
        Only Super Admins and Admins can view and manage user accounts and RBAC roles.
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
    } else if (nextRole === 'BROADCASTER') {
      setPermissions({
        manageStreams: true,
        manageScores: false,
        manageTournaments: false,
        manageTeams: false,
        managePlayers: false,
        moderateChat: false,
        manageSponsors: false,
        manageVenues: false,
        declareResults: false,
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
    } else if (nextRole === 'CAPTAIN') {
      setPermissions({
        manageStreams: false,
        manageScores: false,
        manageTournaments: false,
        manageTeams: false,
        managePlayers: false,
        moderateChat: false,
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

  function openEditUserModal(u: AuthUser) {
    setEditUser(u);
    setEditRole(u.role);
    setEditPerms({
      manageStreams: Boolean(u.permissions?.manageStreams),
      manageScores: Boolean(u.permissions?.manageScores),
      manageTournaments: Boolean(u.permissions?.manageTournaments),
      manageTeams: Boolean(u.permissions?.manageTeams),
      managePlayers: Boolean(u.permissions?.managePlayers),
      moderateChat: Boolean(u.permissions?.moderateChat),
      manageSponsors: Boolean(u.permissions?.manageSponsors),
      manageVenues: Boolean(u.permissions?.manageVenues),
      declareResults: Boolean(u.permissions?.declareResults),
    });
    setEditGranular((u.granularPermissions || []).join(', '));
    setEditAssignedStreams(u.assignedStreamIds || []);
    setEditNewPassword('');
  }

  async function handleSaveEditUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    try {
      setUpdatingUser(true);
      setError(null);
      const granularList = editGranular
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const payload: Record<string, unknown> = {
        role: editRole,
        permissions: editPerms,
        granularPermissions: granularList,
        assignedStreamIds: editAssignedStreams,
      };
      if (editNewPassword.trim().length >= 6) {
        payload.newPassword = editNewPassword.trim();
      }
      await entityService.updateUser(editUser.id, payload);
      setEditUser(null);
      setSuccess(`Updated account & permissions for ${editUser.email}.`);
      await loadUsers();
    } catch (err) {
      setError(extractApiError(err, 'Failed to update user account.'));
    } finally {
      setUpdatingUser(false);
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

  async function handleUnlockUser(u: AuthUser) {
    try {
      setError(null);
      await entityService.updateUser(u.id, { unlockAccount: true });
      setSuccess(`Unlocked account and reset failed attempts for ${u.email}.`);
      await loadUsers();
    } catch (err) {
      setError(extractApiError(err, 'Failed to unlock account.'));
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

  const q = search.trim().toLowerCase();
  const filteredUsers = users.filter((u) => {
    if (roleFilter && u.role !== roleFilter) return false;
    if (!q) return true;
    return `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Users &amp; Role Permissions
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage staff, captains, 2FA enrollment, lockouts, and stream-level scoring permissions.
          </p>
        </div>

        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Create Staff Account</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email..."
            className="w-full min-h-[40px] pl-9 pr-3 text-sm border border-slate-300 rounded-lg bg-white"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="min-h-[40px] px-3 text-sm border border-slate-300 rounded-lg bg-white"
        >
          <option value="">All Roles</option>
          <option value="SUPER_ADMIN">Super Admin</option>
          <option value="ADMIN">Admin</option>
          <option value="TOURNAMENT_ORGANIZER">Tournament Organizer</option>
          <option value="BROADCASTER">Broadcaster</option>
          <option value="MODERATOR">Moderator</option>
          <option value="SCORER">Scorer</option>
          <option value="CAPTAIN">Team Captain</option>
          <option value="SPECTATOR">Spectator</option>
        </select>
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
                <th className="py-3 px-4">Role &amp; Security</th>
                <th className="py-3 px-4">Permissions</th>
                <th className="py-3 px-4">Status</th>
                {isSuperAdmin && <th className="py-3 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredUsers.map((u) => {
                const isLocked =
                  Boolean(u.lockedUntil) && new Date(u.lockedUntil as string).getTime() > Date.now();
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">{u.name}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className="py-3 px-4">
                      <div className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                        <Shield className="w-3.5 h-3.5 text-[#EA580C]" />
                        <span>{ROLE_LABELS[u.role] || u.role}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {u.totpEnabled && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                            <ShieldCheck className="w-3 h-3" />
                            2FA
                          </span>
                        )}
                        {isLocked && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-semibold">
                            <Lock className="w-3 h-3" />
                            Locked
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {u.role === 'SUPER_ADMIN'
                        ? 'Full Access'
                        : u.role === 'SPECTATOR' || u.role === 'CAPTAIN'
                          ? u.role === 'CAPTAIN'
                            ? 'Team Registration & Roster Portal'
                            : 'Read-Only'
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
                      {(u.granularPermissions || []).length > 0 && (
                        <div className="font-mono text-[10px] text-[#EA580C] mt-0.5">
                          + {u.granularPermissions!.join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold">
                      <span className={u.isActive ? 'text-emerald-600' : 'text-red-600'}>
                        {u.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    {isSuperAdmin && (
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEditUserModal(u)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md mr-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        {isLocked && (
                          <button
                            type="button"
                            onClick={() => handleUnlockUser(u)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 rounded-md mr-1"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            <span>Unlock</span>
                          </button>
                        )}
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
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create Staff / Captain Account"
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
              <option value="BROADCASTER">Broadcaster</option>
              <option value="MODERATOR">Moderator</option>
              <option value="TOURNAMENT_ORGANIZER">Tournament Organizer</option>
              <option value="ADMIN">Admin</option>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="CAPTAIN">Team Captain</option>
            </select>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-200">
            <p className="text-xs font-semibold text-slate-700">Module Permissions</p>
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
              className="min-h-[42px] px-5 py-2 text-sm font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit User Permissions, Stream Assignments & Password Reset Modal */}
      <Modal
        open={Boolean(editUser)}
        onClose={() => setEditUser(null)}
        title={`Edit Account: ${editUser?.name || ''}`}
        subtitle={editUser?.email}
        maxWidthClass="max-w-2xl"
      >
        {editUser && (
          <form onSubmit={handleSaveEditUser} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="SCORER">Scorer</option>
                  <option value="BROADCASTER">Broadcaster</option>
                  <option value="MODERATOR">Moderator</option>
                  <option value="TOURNAMENT_ORGANIZER">Tournament Organizer</option>
                  <option value="ADMIN">Admin</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                  <option value="CAPTAIN">Team Captain</option>
                  <option value="SPECTATOR">Spectator</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reset Password (Optional, min 6 chars)
                </label>
                <div className="relative">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    minLength={6}
                    value={editNewPassword}
                    onChange={(e) => setEditNewPassword(e.target.value)}
                    placeholder="Leave blank to keep existing"
                    className="w-full min-h-[40px] pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-700">Module Permissions</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
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
                      checked={Boolean(editPerms[key])}
                      onChange={(e) =>
                        setEditPerms((p) => ({ ...p, [key]: e.target.checked }))
                      }
                      className="w-3.5 h-3.5 rounded border-slate-300"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Granular Permission Overrides (comma-separated, e.g. matches:manage_stream)
              </label>
              <input
                type="text"
                value={editGranular}
                onChange={(e) => setEditGranular(e.target.value)}
                placeholder="matches:manage_stream, scores:update"
                className="w-full min-h-[40px] px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>

            {streams.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Assigned Broadcast Streams (for Scorer scope)
                </label>
                <div className="max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2.5 border border-slate-200 rounded-lg bg-slate-50">
                  {streams.map((st) => (
                    <label key={st.id} className="inline-flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={editAssignedStreams.includes(st.id)}
                        onChange={() =>
                          setEditAssignedStreams((prev) =>
                            prev.includes(st.id)
                              ? prev.filter((item) => item !== st.id)
                              : [...prev, st.id]
                          )
                        }
                        className="w-3.5 h-3.5 rounded border-slate-300"
                      />
                      <span className="truncate">
                        {st.matchTitle || `${st.teamAName} vs ${st.teamBName}` || st.id}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditUser(null)}
                className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updatingUser}
                className="min-h-[42px] px-5 py-2 text-sm font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50"
              >
                {updatingUser ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
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
