import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Edit3, Plus, Search, ShieldAlert, Trash2, UserCheck, Users } from 'lucide-react';
import axios from 'axios';
import { PlayerData, TeamData } from '../../types/index.ts';
import { SPORT_OPTIONS, SportOption } from '../../constants/sports.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';
import { getEntityId, resolveTeamId } from '../../utils/dedupe.ts';

function computeIsMinor(dob: string): boolean {
  if (!dob) return false;
  const parsed = new Date(dob);
  if (isNaN(parsed.getTime())) return false;
  const ageYears = (Date.now() - parsed.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return ageYears < 18;
}

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
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PlayerData | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [teamFilter, setTeamFilter] = useState('');

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
    setDateOfBirth('');
    setIsVerified(false);
    setAvatarUrl('');
    setModalOpen(true);
  }

  function openEdit(player: PlayerData) {
    setEditing(player);
    setName(player.name);
    setTeamId(resolveTeamId(player.teamId));
    setSportType(player.sportType);
    setRole(player.role || '');
    setJerseyNumber(
      player.jerseyNumber !== null && player.jerseyNumber !== undefined
        ? String(player.jerseyNumber)
        : ''
    );
    setDateOfBirth(player.dateOfBirth ? player.dateOfBirth.slice(0, 10) : '');
    setIsVerified(Boolean(player.isVerified));
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
        dateOfBirth: dateOfBirth || '',
        isMinor: computeIsMinor(dateOfBirth),
        isVerified,
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

  async function handleToggleVerify(player: PlayerData) {
    try {
      setError(null);
      await platformOpsService.verifyPlayer(player.id, !player.isVerified);
      setSuccess(
        !player.isVerified
          ? `Verified player "${player.name}".`
          : `Removed verification from "${player.name}".`
      );
      await loadData();
    } catch (err) {
      setError(extractApiError(err, 'Failed to update verification status.'));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      setError(null);
      await entityService.deletePlayer(deleteTarget.id);
      setDeleteTarget(null);
      setSuccess('Player deleted.');
      await loadData();
    } catch (err) {
      setDeleteTarget(null);
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setSuccess('Player was already removed. List refreshed.');
        await loadData();
      } else {
        setError(extractApiError(err, 'Failed to delete player.'));
      }
    } finally {
      setDeleting(false);
    }
  }

  const dobMinor = computeIsMinor(dateOfBirth);

  const uniquePlayers = useMemo(() => {
    const seenIds = new Set<string>();
    const list: PlayerData[] = [];
    for (const p of players) {
      const pid = getEntityId(p);
      if (pid) {
        if (seenIds.has(pid)) continue;
        seenIds.add(pid);
      }
      list.push(p);
    }
    return list;
  }, [players]);

  const filteredPlayers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const seenIds = new Set<string>();
    return uniquePlayers.filter((p) => {
      const pid = getEntityId(p);
      if (pid) {
        if (seenIds.has(pid)) return false;
        seenIds.add(pid);
      }
      const pTeamId = resolveTeamId(p.teamId);
      if (teamFilter === '__unassigned__' && pTeamId) return false;
      if (teamFilter && teamFilter !== '__unassigned__' && pTeamId !== teamFilter) return false;
      if (!q) return true;
      const teamName =
        typeof p.teamId === 'object' && p.teamId ? p.teamId.name.toLowerCase() : '';
      return (
        p.name.toLowerCase().includes(q) ||
        (p.role || '').toLowerCase().includes(q) ||
        teamName.includes(q)
      );
    });
  }, [uniquePlayers, searchTerm, teamFilter]);

  const teamCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of uniquePlayers) {
      const pTeamId = resolveTeamId(p.teamId);
      if (pTeamId) {
        counts.set(pTeamId, (counts.get(pTeamId) || 0) + 1);
      }
    }
    return counts;
  }, [uniquePlayers]);

  const totalPlayers = uniquePlayers.length;
  const assignedCount = uniquePlayers.filter((p) => Boolean(resolveTeamId(p.teamId))).length;
  const verifiedCount = uniquePlayers.filter((p) => p.isVerified).length;
  const minorCount = uniquePlayers.filter((p) => p.isMinor).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Players &amp; Eligibility
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage athlete rosters, age/minor status (&lt;18), and organizer verification badges.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Player</span>
        </button>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      {/* Total Players & Eligibility Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total Players</span>
            <Users className="w-4 h-4 text-[#EA580C]" />
          </div>
          <p className="font-mono text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {totalPlayers}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Assigned to Teams</span>
            <UserCheck className="w-4 h-4 text-blue-600" />
          </div>
          <p className="font-mono text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {assignedCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Verified Athletes</span>
            <BadgeCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="font-mono text-2xl font-bold text-emerald-700 mt-1 tabular-nums">
            {verifiedCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Minors (&lt;18)</span>
            <ShieldAlert className="w-4 h-4 text-amber-600" />
          </div>
          <p className="font-mono text-2xl font-bold text-amber-700 mt-1 tabular-nums">
            {minorCount}
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      {players.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search player, role, or team..."
                className="min-h-[38px] pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg w-56 sm:w-64"
              />
            </div>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="min-h-[38px] px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
            >
              <option value="">All Teams ({totalPlayers})</option>
              <option value="__unassigned__">Unassigned Players</option>
              {teams.map((tm) => {
                const tid = getEntityId(tm);
                const count = teamCountMap.get(tid) || 0;
                return (
                  <option key={tid} value={tid}>
                    {tm.name} ({count})
                  </option>
                );
              })}
            </select>
          </div>
          <p className="text-xs font-mono text-slate-500">
            Showing {filteredPlayers.length} of {totalPlayers} players
          </p>
        </div>
      )}

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
              className="min-h-[36px] px-3.5 py-1.5 text-xs font-semibold text-white bg-[#EA580C] rounded-lg"
            >
              Add First Player
            </button>
          }
        />
      ) : filteredPlayers.length === 0 ? (
        <EmptyState
          icon={<Search className="w-6 h-6" />}
          title="No matching players"
          description="Try clearing your team filter or search query."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Player</th>
                <th className="py-3 px-4">Team</th>
                <th className="py-3 px-4">Sport / Role</th>
                <th className="py-3 px-4">Eligibility</th>
                <th className="py-3 px-4">Jersey</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredPlayers.map((p) => {
                const pid = getEntityId(p);
                const teamObj = typeof p.teamId === 'object' && p.teamId ? p.teamId : null;
                const resolvedTid = resolveTeamId(p.teamId);
                const teamName = teamObj ? teamObj.name : 'Unassigned';
                return (
                  <tr key={pid} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <Link
                          to={`/players/${pid}`}
                          className="hover:text-[#EA580C] hover:underline"
                        >
                          {p.name}
                        </Link>
                        {p.isVerified && (
                          <span title="Verified Athlete">
                            <BadgeCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                          </span>
                        )}
                      </div>
                      {p.dateOfBirth && (
                        <div className="text-[11px] font-mono text-slate-400">
                          DOB: {p.dateOfBirth.slice(0, 10)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {teamObj && resolvedTid ? (
                        <Link
                          to={`/teams/${resolvedTid}`}
                          className="font-medium text-slate-800 hover:text-[#EA580C] hover:underline"
                        >
                          {teamName}
                        </Link>
                      ) : (
                        teamName
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div>{p.sportType}</div>
                      {p.role && <div className="text-xs text-slate-400">{p.role}</div>}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {p.isMinor ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-100 text-orange-800 font-semibold">
                            <ShieldAlert className="w-3 h-3" />
                            Minor (&lt;18)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                            Standard
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleToggleVerify(p)}
                          className={`px-2 py-0.5 rounded font-semibold transition-colors ${
                            p.isVerified
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {p.isVerified ? 'Verified' : 'Verify'}
                        </button>
                      </div>
                    </td>
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
                Date of Birth (Optional)
              </label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              {dateOfBirth && (
                <p className={`text-[11px] mt-1 font-semibold ${dobMinor ? 'text-orange-600' : 'text-emerald-600'}`}>
                  {dobMinor ? 'Auto-detected: Minor (<18 years)' : 'Auto-detected: Adult (18+)'}
                </p>
              )}
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
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Photo URL (Optional)
              </label>
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isVerified}
              onChange={(e) => setIsVerified(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600"
            />
            <span>Mark athlete ID &amp; eligibility as Organizer Verified</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[36px] px-4 py-1.5 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50"
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
        message={`Delete "${deleteTarget?.name}" from database?`}
        confirmLabel="Delete"
      />
    </div>
  );
}
