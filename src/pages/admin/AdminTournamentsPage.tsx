import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Edit3, GitBranch, Plus, Trash2, Trophy } from 'lucide-react';
import { TeamData, TournamentData, TournamentFormat, VenueData } from '../../types/index.ts';
import { SPORT_OPTIONS, SportOption } from '../../constants/sports.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';

export function AdminTournamentsPage() {
  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [venues, setVenues] = useState<VenueData[]>([]);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TournamentData | null>(null);
  const [name, setName] = useState('');
  const [sportType, setSportType] = useState<SportOption>('Cricket');
  const [format, setFormat] = useState<TournamentFormat>('KNOCKOUT');
  const [season, setSeason] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [venueId, setVenueId] = useState('');
  const [location, setLocation] = useState('');
  const [organizerName, setOrganizerName] = useState('');
  const [status, setStatus] = useState<'UPCOMING' | 'ONGOING' | 'COMPLETED'>('UPCOMING');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [groupCount, setGroupCount] = useState('2');
  const [rules, setRules] = useState('');
  const [qualificationRules, setQualificationRules] = useState('');
  const [description, setDescription] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TournamentData | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadTournaments = useCallback(async () => {
    try {
      setError(null);
      const [data, allVenues, allTeams] = await Promise.all([
        entityService.listTournaments(),
        platformOpsService.listVenues().catch(() => [] as VenueData[]),
        entityService.listTeams().catch(() => [] as TeamData[]),
      ]);
      setTournaments(data);
      setVenues(allVenues);
      setTeams(allTeams);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load tournaments.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTournaments();
  }, [loadTournaments]);

  function openCreate() {
    setEditing(null);
    setName('');
    setSportType('Cricket');
    setFormat('KNOCKOUT');
    setSeason('');
    setLogoUrl('');
    setVenueId('');
    setLocation('');
    setOrganizerName('');
    setStatus('UPCOMING');
    setStartDate('');
    setEndDate('');
    setGroupCount('2');
    setRules('');
    setQualificationRules('');
    setDescription('');
    setIsPublished(true);
    setTeamIds([]);
    setModalOpen(true);
  }

  function openEdit(t: TournamentData) {
    setEditing(t);
    setName(t.name);
    setSportType(t.sportType);
    setFormat(t.format || 'KNOCKOUT');
    setSeason(t.season || '');
    setLogoUrl(t.logoUrl || '');
    setVenueId(
      typeof t.venueId === 'object' && t.venueId
        ? t.venueId.id || t.venueId._id || ''
        : t.venueId || ''
    );
    setLocation(t.location || '');
    setOrganizerName(t.organizerName || '');
    setStatus(t.status);
    setStartDate(t.startDate ? t.startDate.slice(0, 10) : '');
    setEndDate(t.endDate ? t.endDate.slice(0, 10) : '');
    setGroupCount(String(t.groupCount || 2));
    setRules(t.rules || '');
    setQualificationRules(t.qualificationRules || '');
    setDescription(t.description || '');
    setIsPublished(t.isPublished ?? true);
    setTeamIds((t.teamIds || []).map((id) => String(id)));
    setModalOpen(true);
  }

  function toggleTeamId(id: string) {
    setTeamIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const payload: Partial<TournamentData> = {
        name: name.trim(),
        sportType,
        format,
        season: season.trim(),
        logoUrl: logoUrl.trim(),
        venueId: venueId || null,
        location: location.trim(),
        organizerName: organizerName.trim(),
        status,
        startDate: startDate || null,
        endDate: endDate || null,
        groupCount: Math.max(1, Number(groupCount) || 2),
        rules: rules.trim(),
        qualificationRules: qualificationRules.trim(),
        description: description.trim(),
        isPublished,
        teamIds,
      };
      if (editing) {
        await entityService.updateTournament(editing.id, payload);
        setSuccess('Tournament updated.');
      } else {
        await entityService.createTournament(payload);
        setSuccess('Tournament created.');
      }
      setModalOpen(false);
      await loadTournaments();
    } catch (err) {
      setError(extractApiError(err, 'Failed to save tournament.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await entityService.deleteTournament(deleteTarget.id);
      setDeleteTarget(null);
      setSuccess('Tournament deleted.');
      await loadTournaments();
    } catch (err) {
      setError(extractApiError(err, 'Failed to delete tournament.'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Tournaments
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage leagues, cups, and tournament brackets stored in MongoDB.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>New Tournament</span>
        </button>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      {loading ? (
        <TableSkeleton rows={4} />
      ) : tournaments.length === 0 ? (
        <EmptyState
          icon={<Trophy className="w-6 h-6" />}
          title="No tournaments in database"
          description="Create your first tournament to organize teams and live streams."
          action={
            <button
              type="button"
              onClick={openCreate}
              className="min-h-[42px] px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg"
            >
              Create First Tournament
            </button>
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Tournament</th>
                <th className="py-3 px-4">Sport &amp; Format</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {tournaments.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-medium text-slate-900">
                    <div>{t.name}</div>
                    {t.season && <div className="text-xs text-slate-400">{t.season}</div>}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    <div>{t.sportType}</div>
                    <div className="text-xs text-slate-400">
                      {(t.format || 'KNOCKOUT').replace(/_/g, ' ')}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    <span>{t.status}</span>
                    {t.isPublished === false && (
                      <span className="ml-2 text-[11px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                        Draft
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-600">{t.location || '—'}</td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <Link
                      to={`/admin/tournaments/${t.id}/fixtures`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 rounded-md mr-1"
                    >
                      <GitBranch className="w-3.5 h-3.5" />
                      <span>Fixtures</span>
                    </Link>
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
        title={editing ? 'Edit Tournament' : 'Create Tournament'}
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tournament Name *
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Format</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as TournamentFormat)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="KNOCKOUT">Knockout Bracket</option>
                <option value="LEAGUE">League / Round-Robin</option>
                <option value="GROUP_STAGE">Group Stage</option>
                <option value="GROUP_KNOCKOUT">Group Stage + Knockout</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as 'UPCOMING' | 'ONGOING' | 'COMPLETED')
                }
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="UPCOMING">UPCOMING</option>
                <option value="ONGOING">ONGOING</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Season / Edition
              </label>
              <input
                type="text"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                placeholder="e.g. Season 2026"
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            {(format === 'GROUP_STAGE' || format === 'GROUP_KNOCKOUT') && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Group Count
                </label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={groupCount}
                  onChange={(e) => setGroupCount(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Saved Venue (Optional)
              </label>
              <select
                value={venueId}
                onChange={(e) => {
                  const id = e.target.value;
                  setVenueId(id);
                  const found = venues.find((v) => v.id === id);
                  if (found && !location.trim()) {
                    setLocation([found.name, found.city].filter(Boolean).join(', '));
                  }
                }}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Manual location / None</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} {v.city ? `(${v.city})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Organizer Name
              </label>
              <input
                type="text"
                value={organizerName}
                onChange={(e) => setOrganizerName(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tournament Logo URL (Optional)
              </label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://..."
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tournament Rules
              </label>
              <textarea
                rows={2}
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                placeholder="Match overs, half durations, tie-breakers..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Qualification Criteria
              </label>
              <textarea
                rows={2}
                value={qualificationRules}
                onChange={(e) => setQualificationRules(e.target.value)}
                placeholder="Top 2 per group advance to Semi-Finals..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {teams.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Participating Teams ({teamIds.length} selected)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto p-2.5 border border-slate-200 rounded-lg bg-slate-50">
                {teams.map((tm) => (
                  <label key={tm.id} className="inline-flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={teamIds.includes(tm.id)}
                      onChange={() => toggleTeamId(tm.id)}
                      className="w-3.5 h-3.5 rounded border-slate-300"
                    />
                    <span className="truncate">{tm.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600"
            />
            <span>Publish tournament publicly on Customer Portal</span>
          </label>

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
              {saving ? 'Saving...' : 'Save Tournament'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Tournament"
        message={`Delete "${deleteTarget?.name}" from MongoDB? Existing live streams will remain preserved.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
