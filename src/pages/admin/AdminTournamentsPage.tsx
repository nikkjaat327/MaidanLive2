import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  Award,
  BookmarkPlus,
  Edit3,
  ExternalLink,
  GitBranch,
  MapPin,
  Medal,
  Plus,
  Trash2,
  Trophy,
} from 'lucide-react';
import {
  PlayerData,
  TeamData,
  TournamentBestPlayerEntry,
  TournamentCustomAwardField,
  TournamentData,
  TournamentFormat,
  TournamentPaymentMode,
  TournamentPositionEntry,
  TournamentTemplateData,
  VenueData,
} from '../../types/index.ts';
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
  const [templates, setTemplates] = useState<TournamentTemplateData[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TournamentData | null>(null);
  const [name, setName] = useState('');
  const [sportType, setSportType] = useState<SportOption>('Cricket');
  const [format, setFormat] = useState<TournamentFormat>('KNOCKOUT');
  const [season, setSeason] = useState('');
  const [prizeMoney, setPrizeMoney] = useState('');
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState<TournamentPaymentMode>('NONE');
  const [registrationFee, setRegistrationFee] = useState('0');
  const [securityDepositAmount, setSecurityDepositAmount] = useState('0');
  const [refundPolicy, setRefundPolicy] = useState('');
  const [paymentInstructions, setPaymentInstructions] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [venueId, setVenueId] = useState('');
  const [location, setLocation] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
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

  // Results, Positions & Custom Awards modal state
  const [awardsTarget, setAwardsTarget] = useState<TournamentData | null>(null);
  const [awardsTeams, setAwardsTeams] = useState<TeamData[]>([]);
  const [awardsPlayers, setAwardsPlayers] = useState<PlayerData[]>([]);
  const [awardsStatus, setAwardsStatus] = useState<'UPCOMING' | 'ONGOING' | 'COMPLETED'>('COMPLETED');
  const [positions, setPositions] = useState<TournamentPositionEntry[]>([]);
  const [bestPlayer, setBestPlayer] = useState<TournamentBestPlayerEntry>({
    mode: 'NONE',
    playerId: null,
    playerName: '',
    teamId: null,
    teamName: '',
    title: 'Player of the Tournament',
    performanceNote: '',
  });
  const [customAwardFields, setCustomAwardFields] = useState<TournamentCustomAwardField[]>([]);
  const [savingAwards, setSavingAwards] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TournamentData | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadTournaments = useCallback(async () => {
    try {
      setError(null);
      const [data, allVenues, allTeams, allTemplates] = await Promise.all([
        entityService.listTournaments(),
        platformOpsService.listVenues().catch(() => [] as VenueData[]),
        entityService.listTeams().catch(() => [] as TeamData[]),
        entityService.listTournamentTemplates().catch(() => [] as TournamentTemplateData[]),
      ]);
      setTournaments(data);
      setVenues(allVenues);
      setTeams(allTeams);
      setTemplates(allTemplates);
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
    setSelectedTemplateId('');
    setTemplateName('');
    setName('');
    setSportType('Cricket');
    setFormat('KNOCKOUT');
    setSeason('');
    setPrizeMoney('');
    setRegistrationOpen(false);
    setPaymentMode('NONE');
    setRegistrationFee('0');
    setSecurityDepositAmount('0');
    setRefundPolicy('');
    setPaymentInstructions('');
    setLogoUrl('');
    setVenueId('');
    setLocation('');
    setGoogleMapsUrl('');
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
    setPrizeMoney(t.prizeMoney || '');
    setRegistrationOpen(Boolean(t.registrationOpen));
    const derivedMode: TournamentPaymentMode =
      t.paymentMode || ((t.registrationFee || 0) > 0 ? 'ENTRY_FEE' : 'NONE');
    setPaymentMode(derivedMode);
    setRegistrationFee(String(t.registrationFee ?? 0));
    setSecurityDepositAmount(String(t.securityDepositAmount ?? 0));
    setRefundPolicy(t.refundPolicy || '');
    setPaymentInstructions(t.paymentInstructions || '');
    setLogoUrl(t.logoUrl || '');
    setVenueId(
      typeof t.venueId === 'object' && t.venueId
        ? t.venueId.id || t.venueId._id || ''
        : t.venueId || ''
    );
    setLocation(t.location || '');
    setGoogleMapsUrl(t.googleMapsUrl || '');
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

  function defaultRankLabel(rank: number): string {
    if (rank === 1) return '1st Position (Champion)';
    if (rank === 2) return '2nd Position (Runner-Up)';
    if (rank === 3) return '3rd Position';
    return `${rank}th Position`;
  }

  async function openAwardsModal(t: TournamentData) {
    setAwardsTarget(t);
    setAwardsStatus(t.status);
    const existingPositions = Array.isArray(t.positions) && t.positions.length > 0
      ? t.positions
      : [
          { rank: 1, label: '1st Position (Champion)', teamId: null, teamName: '', prizeNote: '' },
          { rank: 2, label: '2nd Position (Runner-Up)', teamId: null, teamName: '', prizeNote: '' },
          { rank: 3, label: '3rd Position', teamId: null, teamName: '', prizeNote: '' },
        ];
    setPositions(existingPositions);
    setBestPlayer(
      t.bestPlayer || {
        mode: 'NONE',
        playerId: null,
        playerName: '',
        teamId: null,
        teamName: '',
        title: 'Player of the Tournament',
        performanceNote: '',
      }
    );
    setCustomAwardFields(Array.isArray(t.customAwardFields) ? t.customAwardFields : []);

    try {
      const detail = await entityService.getTournamentDetail(t.id);
      setAwardsTeams(detail.teams || []);
      setAwardsPlayers(detail.players || []);
    } catch {
      setAwardsTeams(teams.filter((tm) => (t.teamIds || []).includes(tm.id)));
      setAwardsPlayers([]);
    }
  }

  async function handleSaveAwards(e: React.FormEvent) {
    e.preventDefault();
    if (!awardsTarget) return;
    try {
      setSavingAwards(true);
      setError(null);
      const cleanedPositions = positions
        .filter((p) => p.teamName.trim() || p.teamId)
        .map((p, idx) => ({
          ...p,
          rank: Number(p.rank) || idx + 1,
          label: p.label.trim() || defaultRankLabel(Number(p.rank) || idx + 1),
          teamName: p.teamName.trim(),
          prizeNote: (p.prizeNote || '').trim(),
        }));
      const cleanedBestPlayer: TournamentBestPlayerEntry =
        bestPlayer.mode === 'NONE' || !bestPlayer.playerName.trim()
          ? { mode: 'NONE', playerId: null, playerName: '', teamId: null, teamName: '', title: '', performanceNote: '' }
          : {
              ...bestPlayer,
              playerName: bestPlayer.playerName.trim(),
              teamName: (bestPlayer.teamName || '').trim(),
              title: (bestPlayer.title || 'Player of the Tournament').trim(),
              performanceNote: (bestPlayer.performanceNote || '').trim(),
            };
      const cleanedCustom = customAwardFields
        .filter((f) => f.label.trim() && f.value.trim())
        .map((f) => ({
          id: f.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          label: f.label.trim(),
          value: f.value.trim(),
        }));

      await entityService.updateTournamentResultsAwards(awardsTarget.id, {
        positions: cleanedPositions,
        bestPlayer: cleanedBestPlayer,
        customAwardFields: cleanedCustom,
        status: awardsStatus,
      });
      setAwardsTarget(null);
      setSuccess(`Saved results & awards for "${awardsTarget.name}".`);
      await loadTournaments();
    } catch (err) {
      setError(extractApiError(err, 'Failed to save tournament results & awards.'));
    } finally {
      setSavingAwards(false);
    }
  }

  function toggleTeamId(id: string) {
    setTeamIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function handleApplyTemplate(tplId: string) {
    setSelectedTemplateId(tplId);
    const tpl = templates.find((item) => item.id === tplId);
    if (!tpl) return;
    setSportType(tpl.sportType);
    setFormat(tpl.format);
    setGroupCount(String(tpl.groupCount || 2));
    if (tpl.location) setLocation(tpl.location);
    if (tpl.prizeMoney) setPrizeMoney(tpl.prizeMoney);
    setRegistrationFee(String(tpl.registrationFee ?? 0));
    setRules(tpl.rules || '');
    setQualificationRules(tpl.qualificationRules || '');
    setDescription(tpl.description || '');
  }

  async function handleSaveAsTemplate() {
    const label = templateName.trim() || `${sportType} ${format.replace('_', ' ')} Preset`;
    try {
      setSavingTemplate(true);
      setError(null);
      const created = await entityService.createTournamentTemplate({
        name: label,
        sportType,
        format,
        groupCount: Math.max(1, Number(groupCount) || 2),
        location: location.trim(),
        prizeMoney: prizeMoney.trim(),
        registrationFee: Math.max(0, Number(registrationFee) || 0),
        rules: rules.trim(),
        qualificationRules: qualificationRules.trim(),
        description: description.trim(),
      });
      setTemplates((prev) => [created, ...prev]);
      setSelectedTemplateId(created.id);
      setTemplateName('');
      setSuccess(`Template "${created.name}" saved.`);
    } catch (err) {
      setError(extractApiError(err, 'Failed to save tournament template.'));
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleDeleteTemplate(tplId: string) {
    try {
      await entityService.deleteTournamentTemplate(tplId);
      setTemplates((prev) => prev.filter((item) => item.id !== tplId));
      if (selectedTemplateId === tplId) setSelectedTemplateId('');
    } catch (err) {
      setError(extractApiError(err, 'Unable to delete template.'));
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const cleanMaps = googleMapsUrl.trim();
    if (cleanMaps) {
      try {
        const u = new URL(cleanMaps);
        if (!['http:', 'https:'].includes(u.protocol)) {
          setError('Google Maps link must start with https:// or http://.');
          return;
        }
      } catch {
        setError('Please enter a valid Google Maps URL.');
        return;
      }
    }

    const entryAmt = Math.max(0, Number(registrationFee) || 0);
    const depositAmt = Math.max(0, Number(securityDepositAmount) || 0);
    if (paymentMode === 'ENTRY_FEE' && entryAmt <= 0) {
      setError('Enter an Entry Fee amount greater than 0, or choose No Payment Required.');
      return;
    }
    if (paymentMode === 'SECURITY_DEPOSIT' && depositAmt <= 0) {
      setError('Enter a Refundable Security Deposit amount greater than 0, or choose No Payment Required.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const payload: Partial<TournamentData> = {
        name: name.trim(),
        sportType,
        format,
        season: season.trim(),
        prizeMoney: prizeMoney.trim(),
        registrationOpen,
        paymentMode,
        registrationFee: paymentMode === 'ENTRY_FEE' ? entryAmt : 0,
        securityDepositAmount: paymentMode === 'SECURITY_DEPOSIT' ? depositAmt : 0,
        refundPolicy: paymentMode === 'SECURITY_DEPOSIT' ? refundPolicy.trim() : '',
        paymentInstructions: paymentMode !== 'NONE' ? paymentInstructions.trim() : '',
        logoUrl: logoUrl.trim(),
        venueId: venueId || null,
        location: location.trim(),
        googleMapsUrl: cleanMaps,
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
      setError(null);
      await entityService.deleteTournament(deleteTarget.id);
      setDeleteTarget(null);
      setSuccess('Tournament deleted.');
      await loadTournaments();
    } catch (err) {
      setDeleteTarget(null);
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setSuccess('Tournament was already removed. List refreshed.');
        await loadTournaments();
      } else {
        setError(extractApiError(err, 'Failed to delete tournament.'));
      }
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
          className="min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
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
                    <div>{t.status}</div>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {t.isPublished === false && (
                        <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                          Draft
                        </span>
                      )}
                      {t.registrationOpen && (
                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                          Reg Open
                          {t.paymentMode === 'SECURITY_DEPOSIT' && (t.securityDepositAmount || 0) > 0
                            ? ` (Deposit ₹${t.securityDepositAmount})`
                            : (t.registrationFee || 0) > 0
                              ? ` (Fee ₹${t.registrationFee})`
                              : ' (Free)'}
                        </span>
                      )}
                      {t.prizeMoney && (
                        <span className="text-[11px] font-semibold text-[#EA580C] bg-orange-50 px-1.5 py-0.5 rounded">
                          Prize: {t.prizeMoney}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    <div>{t.location || '—'}</div>
                    {t.googleMapsUrl && (
                      <a
                        href={t.googleMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline mt-0.5"
                      >
                        <MapPin className="w-3 h-3" />
                        <span>Maps Link</span>
                      </a>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <Link
                      to={`/admin/tournaments/${t.id}/fixtures`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 rounded-md mr-1"
                    >
                      <GitBranch className="w-3.5 h-3.5" />
                      <span>Fixtures</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => openAwardsModal(t)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#EA580C] hover:bg-orange-50 rounded-md mr-1"
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span>Results &amp; Awards</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md mr-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(t)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md"
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
          {/* Saved Templates Bar */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700 inline-flex items-center gap-1.5">
                <BookmarkPlus className="w-3.5 h-3.5 text-[#EA580C]" />
                <span>Tournament Templates</span>
              </span>
              {templates.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => handleApplyTemplate(e.target.value)}
                    className="min-h-[34px] px-2.5 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Apply saved template...</option>
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name} ({tpl.sportType})
                      </option>
                    ))}
                  </select>
                  {selectedTemplateId && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(selectedTemplateId)}
                      title="Delete selected template"
                      className="min-h-[34px] px-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name (e.g. Weekend Turf Knockout)"
                className="flex-1 min-w-[180px] min-h-[36px] px-2.5 text-xs bg-white border border-slate-300 rounded-lg"
              />
              <button
                type="button"
                disabled={savingTemplate}
                onClick={handleSaveAsTemplate}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
              >
                {savingTemplate ? 'Saving...' : 'Save as Template'}
              </button>
            </div>
          </div>

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
              <label className="block text-sm font-medium text-slate-700 mb-1">Location Name</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Azad Maidan Ground, Delhi"
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-sm font-medium text-slate-700">
                  Google Maps Location Link (Optional)
                </label>
                {googleMapsUrl.trim() && (
                  <a
                    href={googleMapsUrl.trim()}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                  >
                    <span>Test Map Link</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <input
                type="url"
                value={googleMapsUrl}
                onChange={(e) => setGoogleMapsUrl(e.target.value)}
                placeholder="https://maps.google.com/?q=..."
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
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
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Prize Money / Pool (Optional)
              </label>
              <input
                type="text"
                value={prizeMoney}
                onChange={(e) => setPrizeMoney(e.target.value)}
                placeholder="e.g. ₹50,000 + Trophy"
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            {/* Mutually Exclusive Payment Mode Configuration */}
            <div className="sm:col-span-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-800">
                  Team Payment Requirement (Mutually Exclusive)
                </label>
                <span className="text-[11px] text-slate-500">
                  Choose Free, Entry Fee, OR Refundable Security Deposit
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'NONE', label: 'No Payment (Free)' },
                    { id: 'ENTRY_FEE', label: 'Entry Fee' },
                    { id: 'SECURITY_DEPOSIT', label: 'Refundable Deposit' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPaymentMode(opt.id)}
                    className={`min-h-[34px] px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      paymentMode === opt.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {paymentMode === 'ENTRY_FEE' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Entry Registration Fee (₹) *
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={registrationFee}
                      onChange={(e) => setRegistrationFee(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Payment / UPI / Bank Instructions
                    </label>
                    <input
                      type="text"
                      value={paymentInstructions}
                      onChange={(e) => setPaymentInstructions(e.target.value)}
                      placeholder="e.g. UPI ID: club@upi — upload screenshot"
                      className="w-full min-h-[38px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                </div>
              )}

              {paymentMode === 'SECURITY_DEPOSIT' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Refundable Security Deposit Amount (₹) *
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={securityDepositAmount}
                        onChange={(e) => setSecurityDepositAmount(e.target.value)}
                        className="w-full min-h-[38px] px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Payment / UPI / Bank Instructions
                      </label>
                      <input
                        type="text"
                        value={paymentInstructions}
                        onChange={(e) => setPaymentInstructions(e.target.value)}
                        placeholder="e.g. UPI ID: club@upi — upload receipt"
                        className="w-full min-h-[38px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Refundable Deposit Policy Explanation
                    </label>
                    <textarea
                      rows={2}
                      value={refundPolicy}
                      onChange={(e) => setRefundPolicy(e.target.value)}
                      placeholder="e.g. 100% refundable after completion of group matches unless forfeited for walkover."
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                </div>
              )}
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
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
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

          <div className="flex flex-wrap items-center gap-6">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600"
              />
              <span>Publish tournament publicly on Customer Portal</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={registrationOpen}
                onChange={(e) => setRegistrationOpen(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#EA580C]"
              />
              <span>Open Captain Team Registration</span>
            </label>
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
              {saving ? 'Saving...' : 'Save Tournament'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Dynamic Positions, Best Player & Custom Awards Modal */}
      <Modal
        open={Boolean(awardsTarget)}
        onClose={() => setAwardsTarget(null)}
        title={`Results, Positions & Awards · ${awardsTarget?.name || ''}`}
        subtitle="Publish partial or final rankings, Best Player, and unlimited custom awards."
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={handleSaveAwards} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tournament Status
              </label>
              <select
                value={awardsStatus}
                onChange={(e) =>
                  setAwardsStatus(e.target.value as 'UPCOMING' | 'ONGOING' | 'COMPLETED')
                }
                className="w-full min-h-[38px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="UPCOMING">UPCOMING</option>
                <option value="ONGOING">ONGOING</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>
            </div>
          </div>

          {/* Tournament Positions */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 inline-flex items-center gap-1.5">
                <Medal className="w-4 h-4 text-[#EA580C]" />
                <span>Tournament Positions (Optional / Partial Allowed)</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  const nextRank =
                    positions.reduce((m, p) => Math.max(m, Number(p.rank) || 0), 0) + 1;
                  setPositions((prev) => [
                    ...prev,
                    {
                      rank: nextRank,
                      label: defaultRankLabel(nextRank),
                      teamId: null,
                      teamName: '',
                      prizeNote: '',
                    },
                  ]);
                }}
                className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Position</span>
              </button>
            </div>

            <div className="space-y-2">
              {positions.map((pos, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-lg border border-slate-200"
                >
                  <div className="sm:col-span-3">
                    <input
                      type="text"
                      value={pos.label}
                      onChange={(e) =>
                        setPositions((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item))
                        )
                      }
                      placeholder="1st Position"
                      className="w-full min-h-[34px] px-2.5 py-1 text-xs font-semibold border border-slate-300 rounded-md"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <select
                      value={pos.teamId || ''}
                      onChange={(e) => {
                        const tid = e.target.value;
                        const tm = awardsTeams.find((x) => x.id === tid);
                        setPositions((prev) =>
                          prev.map((item, i) =>
                            i === idx
                              ? {
                                  ...item,
                                  teamId: tid || null,
                                  teamName: tm ? tm.name : item.teamName,
                                }
                              : item
                          )
                        );
                      }}
                      className="w-full min-h-[34px] px-2 py-1 text-xs border border-slate-300 rounded-md bg-white"
                    >
                      <option value="">Select team or enter manually →</option>
                      {awardsTeams.map((tm) => (
                        <option key={tm.id} value={tm.id}>
                          {tm.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      value={pos.teamName}
                      onChange={(e) =>
                        setPositions((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, teamName: e.target.value } : item
                          )
                        )
                      }
                      placeholder="Team name"
                      className="w-full min-h-[34px] px-2.5 py-1 text-xs border border-slate-300 rounded-md"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      value={pos.prizeNote || ''}
                      onChange={(e) =>
                        setPositions((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, prizeNote: e.target.value } : item
                          )
                        )
                      }
                      placeholder="Prize note"
                      className="w-full min-h-[34px] px-2.5 py-1 text-xs border border-slate-300 rounded-md"
                    />
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setPositions((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Remove position"
                      className="min-h-[30px] min-w-[30px] inline-flex items-center justify-center rounded-md text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Best Player Selection */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 inline-flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-amber-500" />
                <span>Best Player / Player of the Tournament</span>
              </h3>
              <div className="flex items-center gap-1.5">
                {(
                  [
                    { id: 'NONE', label: 'None' },
                    { id: 'PLAYER', label: 'From Roster' },
                    { id: 'MANUAL', label: 'Manual Entry' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      setBestPlayer((prev) => ({ ...prev, mode: m.id }))
                    }
                    className={`min-h-[28px] px-2.5 py-1 rounded-md text-[11px] font-semibold border ${
                      bestPlayer.mode === m.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {bestPlayer.mode === 'PLAYER' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Select Registered Player
                  </label>
                  <select
                    value={bestPlayer.playerId || ''}
                    onChange={(e) => {
                      const pid = e.target.value;
                      const found = awardsPlayers.find((p) => p.id === pid);
                      const tObj =
                        found && typeof found.teamId === 'object' && found.teamId
                          ? found.teamId
                          : null;
                      setBestPlayer((prev) => ({
                        ...prev,
                        playerId: pid || null,
                        playerName: found ? found.name : '',
                        teamId: tObj?._id || (typeof found?.teamId === 'string' ? found.teamId : null),
                        teamName: tObj?.name || '',
                      }));
                    }}
                    className="w-full min-h-[36px] px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Choose player...</option>
                    {awardsPlayers.map((p) => {
                      const teamLabel =
                        typeof p.teamId === 'object' && p.teamId ? ` (${p.teamId.name})` : '';
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {teamLabel}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Performance Summary
                  </label>
                  <input
                    type="text"
                    value={bestPlayer.performanceNote || ''}
                    onChange={(e) =>
                      setBestPlayer((prev) => ({ ...prev, performanceNote: e.target.value }))
                    }
                    placeholder="e.g. 240 Runs & 9 Wickets"
                    className="w-full min-h-[36px] px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              </div>
            )}

            {bestPlayer.mode === 'MANUAL' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={bestPlayer.playerName}
                  onChange={(e) =>
                    setBestPlayer((prev) => ({ ...prev, playerName: e.target.value, playerId: null }))
                  }
                  placeholder="Player name *"
                  className="min-h-[36px] px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                />
                <input
                  type="text"
                  value={bestPlayer.teamName || ''}
                  onChange={(e) =>
                    setBestPlayer((prev) => ({ ...prev, teamName: e.target.value }))
                  }
                  placeholder="Team name"
                  className="min-h-[36px] px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                />
                <input
                  type="text"
                  value={bestPlayer.performanceNote || ''}
                  onChange={(e) =>
                    setBestPlayer((prev) => ({ ...prev, performanceNote: e.target.value }))
                  }
                  placeholder="Stats / Achievement"
                  className="min-h-[36px] px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
            )}
          </div>

          {/* Unlimited Custom Label + Value Awards */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Custom Awards &amp; Recognitions
              </h3>
              <button
                type="button"
                onClick={() =>
                  setCustomAwardFields((prev) => [
                    ...prev,
                    {
                      id: `cf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                      label: '',
                      value: '',
                    },
                  ])
                }
                className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Custom Field</span>
              </button>
            </div>

            {customAwardFields.length === 0 ? (
              <p className="text-xs text-slate-500">
                Add awards such as Best Bowler, Highest Run Scorer, Fair Play Team, or Emerging Player.
              </p>
            ) : (
              <div className="space-y-2">
                {customAwardFields.map((field, idx) => (
                  <div key={field.id || idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) =>
                        setCustomAwardFields((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item))
                        )
                      }
                      placeholder="Label (e.g. Best Bowler)"
                      className="col-span-5 min-h-[34px] px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white"
                    />
                    <input
                      type="text"
                      value={field.value}
                      onChange={(e) =>
                        setCustomAwardFields((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, value: e.target.value } : item))
                        )
                      }
                      placeholder="Value (e.g. Rahul Sharma · 14 Wkts)"
                      className="col-span-6 min-h-[34px] px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white"
                    />
                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          setCustomAwardFields((prev) => prev.filter((_, i) => i !== idx))
                        }
                        aria-label="Delete custom field"
                        className="min-h-[30px] min-w-[30px] inline-flex items-center justify-center rounded-md text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAwardsTarget(null)}
              className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingAwards}
              className="min-h-[36px] px-4 py-1.5 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50"
            >
              {savingAwards ? 'Saving...' : 'Save Results & Awards'}
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
