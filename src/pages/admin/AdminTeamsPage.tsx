import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Edit3, ExternalLink, Plus, ShieldAlert, Trash2, Users } from 'lucide-react';
import axios from 'axios';
import { PlayerData, TeamData, TournamentData } from '../../types/index.ts';
import { SPORT_OPTIONS, SportOption } from '../../constants/sports.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';
import { TeamAvatar } from '../../components/common/TeamAvatar.tsx';

export function AdminTeamsPage() {
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TeamData | null>(null);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [sportType, setSportType] = useState<SportOption>('Cricket');
  const [city, setCity] = useState('');
  const [captainName, setCaptainName] = useState('');
  const [tournamentId, setTournamentId] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TeamData | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [playersModalTeam, setPlayersModalTeam] = useState<TeamData | null>(null);
  const [teamPlayers, setTeamPlayers] = useState<PlayerData[]>([]);
  const [loadingTeamPlayers, setLoadingTeamPlayers] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [teamList, tourList] = await Promise.all([
        entityService.listTeams(),
        entityService.listTournaments(),
      ]);
      setTeams(teamList);
      setTournaments(tourList);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load teams.'));
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
    setShortName('');
    setLogoUrl('');
    setSportType('Cricket');
    setCity('');
    setCaptainName('');
    setTournamentId('');
    setModalOpen(true);
  }

  function openEdit(team: TeamData) {
    setEditing(team);
    setName(team.name);
    setShortName(team.shortName || '');
    setLogoUrl(team.logoUrl || '');
    setSportType(team.sportType);
    setCity(team.city || '');
    setCaptainName(team.captainName || '');
    setTournamentId(
      typeof team.tournamentId === 'object' && team.tournamentId
        ? team.tournamentId._id
        : (team.tournamentId as string) || ''
    );
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const payload = {
        name: name.trim(),
        shortName: shortName.trim(),
        logoUrl: logoUrl.trim(),
        sportType,
        city: city.trim(),
        captainName: captainName.trim(),
        tournamentId: tournamentId || null,
      };
      if (editing) {
        await entityService.updateTeam(editing.id, payload);
        setSuccess('Team updated.');
      } else {
        await entityService.createTeam(payload);
        setSuccess('Team created.');
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setError(extractApiError(err, 'Failed to save team.'));
    } finally {
      setSaving(false);
    }
  }

  async function openTeamPlayers(team: TeamData) {
    setPlayersModalTeam(team);
    setTeamPlayers([]);
    setLoadingTeamPlayers(true);
    try {
      const profile = await entityService.getTeamProfile(team.id);
      setTeamPlayers(profile.players || []);
    } catch (err) {
      setPlayersModalTeam(null);
      setError(extractApiError(err, 'Failed to load team players.'));
    } finally {
      setLoadingTeamPlayers(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      setError(null);
      await entityService.deleteTeam(deleteTarget.id);
      setDeleteTarget(null);
      setSuccess('Team deleted.');
      await loadData();
    } catch (err) {
      setDeleteTarget(null);
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setSuccess('Team was already removed. List refreshed.');
        await loadData();
      } else {
        setError(extractApiError(err, 'Failed to delete team.'));
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Teams</h1>
          <p className="text-sm text-slate-500 mt-1">
            Create and manage clubs and squads available for quick selection on live streams.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Team</span>
        </button>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      {loading ? (
        <TableSkeleton rows={4} />
      ) : teams.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6" />}
          title="No teams in database"
          description="Add teams so broadcasters can pick them directly when starting streams."
          action={
            <button
              type="button"
              onClick={openCreate}
              className="min-h-[36px] px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg"
            >
              Create First Team
            </button>
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Team</th>
                <th className="py-3 px-4">Sport</th>
                <th className="py-3 px-4">Players</th>
                <th className="py-3 px-4">City</th>
                <th className="py-3 px-4">Captain</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {teams.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => openTeamPlayers(t)}
                      className="flex items-center gap-3 text-left group"
                    >
                      <TeamAvatar name={t.name} logoUrl={t.logoUrl} size="sm" />
                      <div>
                        <span className="font-medium text-slate-900 group-hover:text-[#EA580C] group-hover:underline">
                          {t.name}
                        </span>
                        {t.shortName && (
                          <span className="ml-2 text-xs font-mono text-slate-500">
                            ({t.shortName})
                          </span>
                        )}
                      </div>
                    </button>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{t.sportType}</td>
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => openTeamPlayers(t)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-orange-50 hover:text-[#EA580C] text-xs font-semibold text-slate-700 transition-colors"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span className="font-mono tabular-nums">{t.playerCount ?? 0}</span>
                      <span>Players</span>
                    </button>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{t.city || '—'}</td>
                  <td className="py-3 px-4 text-slate-600">{t.captainName || '—'}</td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md mr-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(t)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
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
        title={editing ? 'Edit Team' : 'Create Team'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Team Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Short Code (e.g. ROY)
              </label>
              <input
                type="text"
                maxLength={12}
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
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
                Tournament (Optional)
              </label>
              <select
                value={tournamentId}
                onChange={(e) => setTournamentId(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">None</option>
                {tournaments.map((tour) => (
                  <option key={tour.id} value={tour.id}>
                    {tour.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">City / Ground</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Captain Name</label>
              <input
                type="text"
                value={captainName}
                onChange={(e) => setCaptainName(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Logo URL (Optional)
            </label>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

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
              className="min-h-[36px] px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Team'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Team Squad Players Modal */}
      <Modal
        open={Boolean(playersModalTeam)}
        onClose={() => setPlayersModalTeam(null)}
        title={`Squad Roster · ${playersModalTeam?.name || ''}`}
        subtitle={`${teamPlayers.length} player${teamPlayers.length === 1 ? '' : 's'} registered`}
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-4">
          {loadingTeamPlayers ? (
            <TableSkeleton rows={3} />
          ) : teamPlayers.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl">
              No players linked to this team yet. You can assign players from the Players &amp; Eligibility page.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
              {teamPlayers.map((p) => (
                <Link
                  key={p.id}
                  to={`/players/${p.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:border-[#EA580C] transition-colors"
                >
                  <TeamAvatar name={p.name} logoUrl={p.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm text-slate-900 truncate">{p.name}</p>
                      {p.isVerified && (
                        <BadgeCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      )}
                      {p.isMinor && (
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      {[
                        p.role || p.position,
                        p.jerseyNumber !== null && p.jerseyNumber !== undefined
                          ? `#${p.jerseyNumber}`
                          : '',
                        p.sportType,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            {playersModalTeam && (
              <Link
                to={`/teams/${playersModalTeam.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#EA580C] hover:underline"
              >
                <span>Open Public Team Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            )}
            <button
              type="button"
              onClick={() => setPlayersModalTeam(null)}
              className="min-h-[34px] px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Team"
        message={`Delete "${deleteTarget?.name}" from database? Players on this team will become unassigned.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
