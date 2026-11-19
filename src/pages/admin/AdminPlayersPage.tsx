import React, { useCallback, useEffect, useState } from 'react';
import { Edit3, Plus, Trash2, UserCheck } from 'lucide-react';
import { PlayerData, TeamData } from '../../types/index.ts';
import { SPORT_OPTIONS, SportOption } from '../../constants/sports.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';
import { FileUploadField } from '../../components/common/FileUploadField.tsx';

export function AdminPlayersPage() {
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlayerData | null>(null);
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [sportType, setSportType] = useState<SportOption>('Cricket');
  const [role, setRole] = useState('');
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PlayerData | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [pList, tList] = await Promise.all([
        entityService.listPlayers(),
        entityService.listTeams(),
      ]);
      setPlayers(pList);
      setTeams(tList);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load players.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openCreate() {
    setEditing(null);
    setName('');
    setTeamId('');
    setSportType('Cricket');
    setRole('');
    setJerseyNumber('');
    setAvatarUrl('');
    setModalOpen(true);
  }

  function openEdit(player: PlayerData) {
    setEditing(player);
    setName(player.name);
    setTeamId(
      typeof player.teamId === 'object' && player.teamId
        ? player.teamId._id
        : (player.teamId as string) || ''
    );
    setSportType(player.sportType);
    setRole(player.role || '');
    setJerseyNumber(
      player.jerseyNumber !== null && player.jerseyNumber !== undefined
        ? String(player.jerseyNumber)
        : ''
    );
    setAvatarUrl(player.avatarUrl || '');
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const payload = {
        name: name.trim(),
        teamId: teamId || null,
        sportType,
        role: role.trim(),
        jerseyNumber: jerseyNumber !== '' ? Number(jerseyNumber) : null,
        avatarUrl: avatarUrl.trim(),
      };
      if (editing) {
        await entityService.updatePlayer(editing.id, payload);
        setSuccess('Player updated.');
      } else {
        await entityService.createPlayer(payload);
        setSuccess('Player added.');
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setError(extractApiError(err, 'Failed to save player.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await entityService.deletePlayer(deleteTarget.id);
      setDeleteTarget(null);
      setSuccess('Player deleted.');
      await loadData();
    } catch (err) {
      setError(extractApiError(err, 'Failed to delete player.'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Players</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage athlete rosters and positions in MongoDB.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Add Player</span>
        </button>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      {loading ? (
        <TableSkeleton rows={4} />
      ) : players.length === 0 ? (
        <EmptyState
          icon={<UserCheck className="w-6 h-6" />}
          title="No players registered"
          description="Add athletes and link them to teams."
          action={
            <button
              type="button"
              onClick={openCreate}
              className="min-h-[42px] px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg"
            >
              Add First Player
            </button>
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Team</th>
                <th className="py-3 px-4">Sport</th>
                <th className="py-3 px-4">Position / Role</th>
                <th className="py-3 px-4">Jersey</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {players.map((p) => {
                const teamName =
                  typeof p.teamId === 'object' && p.teamId ? p.teamId.name : 'Unassigned';
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium text-slate-900">{p.name}</td>
                    <td className="py-3 px-4 text-slate-600">{teamName}</td>
                    <td className="py-3 px-4 text-slate-600">{p.sportType}</td>
                    <td className="py-3 px-4 text-slate-600">{p.role || '—'}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                      {p.jerseyNumber !== null && p.jerseyNumber !== undefined
                        ? `#${p.jerseyNumber}`
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md mr-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(p)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Player' : 'Add Player'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Player Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Team</label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Unassigned</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Sport</label>
              <select
                value={sportType}
                onChange={(e) => setSportType(e.target.value as SportOption)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {SPORT_OPTIONS.map((sp) => (
                  <option key={sp} value={sp}>
                    {sp}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Role / Position
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Batsman, Raider, Striker"
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Jersey Number
              </label>
              <input
                type="number"
                min={0}
                max={999}
                value={jerseyNumber}
                onChange={(e) => setJerseyNumber(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <FileUploadField
                label="Player Photo (Optional)"
                value={avatarUrl}
                onChange={setAvatarUrl}
                folder="players"
                portal="admin"
                placeholder="Upload photo or paste https://..."
              />
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
              {saving ? 'Saving...' : 'Save Player'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Player"
        message={`Delete "${deleteTarget?.name}" from MongoDB?`}
        confirmLabel="Delete"
      />
    </div>
  );
}
