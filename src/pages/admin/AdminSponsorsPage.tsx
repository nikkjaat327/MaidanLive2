import React, { useCallback, useEffect, useState } from 'react';
import { Award, Edit3, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import {
  LiveStreamData,
  ScoreboardPosition,
  SponsorData,
  SponsorOverlayData,
  SponsorPlacement,
  TournamentData,
} from '../../types/index.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';

export function AdminSponsorsPage() {
  const [sponsors, setSponsors] = useState<SponsorData[]>([]);
  const [overlays, setOverlays] = useState<SponsorOverlayData[]>([]);
  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<'SPONSORS' | 'OVERLAYS'>('SPONSORS');

  // Sponsor modal
  const [sponsorModalOpen, setSponsorModalOpen] = useState(false);
  const [editingSponsor, setEditingSponsor] = useState<SponsorData | null>(null);
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [sponsorshipType, setSponsorshipType] = useState('Title Sponsor');
  const [placement, setPlacement] = useState<SponsorPlacement>('live_match');
  const [tagline, setTagline] = useState('');
  const [ctaText, setCtaText] = useState('Visit Partner');
  const [tournamentId, setTournamentId] = useState('');
  const [liveStreamId, setLiveStreamId] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [savingSponsor, setSavingSponsor] = useState(false);

  // Overlay modal
  const [overlayModalOpen, setOverlayModalOpen] = useState(false);
  const [ovSponsorId, setOvSponsorId] = useState('');
  const [ovStreamId, setOvStreamId] = useState('');
  const [ovTournamentId, setOvTournamentId] = useState('');
  const [ovPosition, setOvPosition] = useState<ScoreboardPosition>('TOP');
  const [ovDuration, setOvDuration] = useState('12');
  const [ovOrder, setOvOrder] = useState('1');
  const [ovMode, setOvMode] = useState<'BANNER' | 'ANNOUNCEMENT'>('BANNER');
  const [ovText, setOvText] = useState('');
  const [ovVisible, setOvVisible] = useState(true);
  const [savingOverlay, setSavingOverlay] = useState(false);

  const [deleteSponsorTarget, setDeleteSponsorTarget] = useState<SponsorData | null>(null);
  const [deleteOverlayTarget, setDeleteOverlayTarget] = useState<SponsorOverlayData | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setError(null);
      const [allSponsors, allOverlays, allTours, allStreams] = await Promise.all([
        platformOpsService.listSponsors(false),
        platformOpsService.listAdminSponsorOverlays(),
        entityService.listTournaments(),
        liveStreamService.listStreams(),
      ]);
      setSponsors(allSponsors);
      setOverlays(allOverlays);
      setTournaments(allTours);
      setStreams(allStreams);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load sponsors & overlays.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  function openNewSponsor() {
    setEditingSponsor(null);
    setName('');
    setLogoUrl('');
    setWebsiteUrl('');
    setContactInfo('');
    setSponsorshipType('Title Sponsor');
    setPlacement('live_match');
    setTagline('');
    setCtaText('Visit Partner');
    setTournamentId('');
    setLiveStreamId('');
    setIsPublished(true);
    setIsActive(true);
    setSponsorModalOpen(true);
  }

  function openEditSponsor(s: SponsorData) {
    setEditingSponsor(s);
    setName(s.name);
    setLogoUrl(s.logoUrl || '');
    setWebsiteUrl(s.websiteUrl || '');
    setContactInfo(s.contactInfo || '');
    setSponsorshipType(s.sponsorshipType || 'Title Sponsor');
    setPlacement(s.placement || 'live_match');
    setTagline(s.tagline || '');
    setCtaText(s.ctaText || 'Visit Partner');
    setTournamentId(
      typeof s.tournamentId === 'object' && s.tournamentId
        ? s.tournamentId._id
        : s.tournamentId || ''
    );
    setLiveStreamId(
      typeof s.liveStreamId === 'object' && s.liveStreamId
        ? s.liveStreamId._id
        : s.liveStreamId || ''
    );
    setIsPublished(s.isPublished);
    setIsActive(s.isActive);
    setSponsorModalOpen(true);
  }

  async function handleSaveSponsor(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingSponsor(true);
      setError(null);
      const payload: Partial<SponsorData> = {
        name: name.trim(),
        logoUrl: logoUrl.trim(),
        websiteUrl: websiteUrl.trim(),
        contactInfo: contactInfo.trim(),
        sponsorshipType: sponsorshipType.trim(),
        placement,
        tagline: tagline.trim(),
        ctaText: ctaText.trim() || 'Visit Partner',
        tournamentId: tournamentId || null,
        liveStreamId: liveStreamId || null,
        isPublished,
        isActive,
      };
      if (editingSponsor) {
        await platformOpsService.updateSponsor(editingSponsor.id, payload);
        setSuccess('Sponsor updated.');
      } else {
        await platformOpsService.createSponsor(payload);
        setSuccess('Sponsor created.');
      }
      setSponsorModalOpen(false);
      await loadAll();
    } catch (err) {
      setError(extractApiError(err, 'Failed to save sponsor.'));
    } finally {
      setSavingSponsor(false);
    }
  }

  async function handleCreateOverlay(e: React.FormEvent) {
    e.preventDefault();
    if (!ovSponsorId) {
      setError('Select a sponsor for the broadcast overlay.');
      return;
    }
    try {
      setSavingOverlay(true);
      setError(null);
      await platformOpsService.createSponsorOverlay({
        sponsorId: ovSponsorId,
        liveStreamId: ovStreamId || null,
        tournamentId: ovTournamentId || null,
        position: ovPosition,
        durationSeconds: Math.max(3, Number(ovDuration) || 12),
        displayOrder: Math.max(1, Number(ovOrder) || 1),
        mode: ovMode,
        announcementText: ovText.trim(),
        isVisible: ovVisible,
      });
      setOverlayModalOpen(false);
      setSuccess('Broadcast sponsor overlay configured.');
      await loadAll();
    } catch (err) {
      setError(extractApiError(err, 'Failed to save sponsor overlay.'));
    } finally {
      setSavingOverlay(false);
    }
  }

  async function toggleOverlayVisibility(ov: SponsorOverlayData) {
    try {
      await platformOpsService.updateSponsorOverlay(ov.id, { isVisible: !ov.isVisible });
      await loadAll();
    } catch (err) {
      setError(extractApiError(err, 'Failed to toggle overlay visibility.'));
    }
  }

  async function confirmDelete() {
    try {
      setDeleting(true);
      if (deleteSponsorTarget) {
        await platformOpsService.deleteSponsor(deleteSponsorTarget.id);
        setDeleteSponsorTarget(null);
        setSuccess('Sponsor removed.');
      } else if (deleteOverlayTarget) {
        await platformOpsService.deleteSponsorOverlay(deleteOverlayTarget.id);
        setDeleteOverlayTarget(null);
        setSuccess('Overlay removed.');
      }
      await loadAll();
    } catch (err) {
      setError(extractApiError(err, 'Delete operation failed.'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Sponsors &amp; Broadcast Overlays
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage tournament sponsors and non-intrusive broadcast sponsor banners. Only active, published sponsors appear on live streams.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openNewSponsor}
            className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
          >
            <Plus className="w-4 h-4" />
            <span>Add Sponsor</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOvSponsorId(sponsors[0]?.id || '');
              setOvStreamId('');
              setOvTournamentId('');
              setOvPosition('TOP');
              setOvDuration('12');
              setOvOrder('1');
              setOvMode('BANNER');
              setOvText('');
              setOvVisible(true);
              setOverlayModalOpen(true);
            }}
            disabled={sponsors.length === 0}
            className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Add Overlay</span>
          </button>
        </div>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setTab('SPONSORS')}
          className={`min-h-[36px] px-4 py-1.5 text-xs font-semibold rounded-md ${
            tab === 'SPONSORS' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          Sponsors ({sponsors.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('OVERLAYS')}
          className={`min-h-[36px] px-4 py-1.5 text-xs font-semibold rounded-md ${
            tab === 'OVERLAYS' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          Stream Overlays ({overlays.length})
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={4} />
      ) : tab === 'SPONSORS' ? (
        sponsors.length === 0 ? (
          <EmptyState
            icon={<Award className="w-6 h-6" />}
            title="No sponsors added"
            description="Add real local sponsors to feature them on tournaments and live broadcast overlays."
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Sponsor</th>
                  <th className="py-3 px-4">Tier &amp; Placement</th>
                  <th className="py-3 px-4">Scope</th>
                  <th className="py-3 px-4">Performance</th>
                  <th className="py-3 px-4">Visibility</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {sponsors.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {s.logoUrl && (
                          <img
                            src={s.logoUrl}
                            alt={s.name}
                            className="w-9 h-9 rounded object-contain bg-slate-50 border border-slate-200 p-1"
                          />
                        )}
                        <div>
                          <div className="font-semibold text-slate-900">{s.name}</div>
                          {s.websiteUrl && (
                            <div className="text-xs text-slate-500 truncate max-w-[200px]">
                              {s.websiteUrl}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <div className="font-semibold">{s.sponsorshipType || 'Partner'}</div>
                      <div className="font-mono text-[11px] text-[#EA580C]">
                        {s.placement || 'live_match'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {typeof s.tournamentId === 'object' && s.tournamentId
                        ? s.tournamentId.name
                        : typeof s.liveStreamId === 'object' && s.liveStreamId
                          ? s.liveStreamId.matchTitle || 'Stream'
                          : 'Platform-wide'}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-700">
                      <div>{s.impressionsCount ?? 0} views</div>
                      <div className="text-[11px] text-emerald-600">{s.clicksCount ?? 0} clicks</div>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded font-semibold ${
                          s.isActive && s.isPublished
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {s.isActive && s.isPublished ? 'Published & Active' : 'Hidden / Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEditSponsor(s)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md mr-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteSponsorTarget(s)}
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
        )
      ) : overlays.length === 0 ? (
        <EmptyState
          icon={<Award className="w-6 h-6" />}
          title="No broadcast sponsor overlays configured"
          description="Create timed banner or announcement overlays for specific streams or tournaments."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Sponsor</th>
                <th className="py-3 px-4">Target Stream / Tournament</th>
                <th className="py-3 px-4">Mode &amp; Position</th>
                <th className="py-3 px-4">Rotation</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {overlays.map((ov) => {
                const spObj = typeof ov.sponsorId === 'object' ? ov.sponsorId : ov.sponsor;
                return (
                  <tr key={ov.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {spObj?.name || 'Sponsor'}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {typeof ov.liveStreamId === 'object' && ov.liveStreamId
                        ? ov.liveStreamId.matchTitle ||
                          `${ov.liveStreamId.teamAName} vs ${ov.liveStreamId.teamBName}`
                        : typeof ov.tournamentId === 'object' && ov.tournamentId
                          ? ov.tournamentId.name
                          : 'Global'}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <div>
                        {ov.mode} · {ov.position}
                      </div>
                      {ov.announcementText && (
                        <div className="text-slate-500 truncate max-w-[220px]">
                          {ov.announcementText}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600">
                      {ov.durationSeconds}s (#{ov.displayOrder})
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleOverlayVisibility(ov)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md mr-1"
                      >
                        {ov.isVisible ? (
                          <>
                            <Eye className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Visible</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                            <span>Hidden</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteOverlayTarget(ov)}
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

      {/* Sponsor Modal */}
      <Modal
        open={sponsorModalOpen}
        onClose={() => setSponsorModalOpen(false)}
        title={editingSponsor ? 'Edit Sponsor' : 'Add Sponsor'}
      >
        <form onSubmit={handleSaveSponsor} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Sponsor Name *
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
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Sponsorship Tier
              </label>
              <input
                type="text"
                value={sponsorshipType}
                onChange={(e) => setSponsorshipType(e.target.value)}
                placeholder="Title Sponsor, Kit Partner..."
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contact Info</label>
              <input
                type="text"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Placement Slot
              </label>
              <select
                value={placement}
                onChange={(e) => setPlacement(e.target.value as SponsorPlacement)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="live_match">Live Match View (live_match)</option>
                <option value="home_feed">Home Feed Banner (home_feed)</option>
                <option value="tournament_banner">Tournament Banner (tournament_banner)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">CTA Label</label>
              <input
                type="text"
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                placeholder="Visit Partner"
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tagline / Offer Copy (Optional)
              </label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Official Cricket Equipment & Kit Partner"
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Logo URL</label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Website URL</label>
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
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
                <option value="">All Tournaments</option>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Live Stream (Optional)
              </label>
              <select
                value={liveStreamId}
                onChange={(e) => setLiveStreamId(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">All Streams</option>
                {streams.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.matchTitle || `${s.teamAName} vs ${s.teamBName}` || s.youtubeVideoId}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300"
              />
              <span>Published</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300"
              />
              <span>Active</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setSponsorModalOpen(false)}
              className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingSponsor}
              className="min-h-[42px] px-5 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {savingSponsor ? 'Saving...' : 'Save Sponsor'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Overlay Modal */}
      <Modal
        open={overlayModalOpen}
        onClose={() => setOverlayModalOpen(false)}
        title="Add Broadcast Sponsor Overlay"
      >
        <form onSubmit={handleCreateOverlay} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sponsor *</label>
            <select
              value={ovSponsorId}
              onChange={(e) => setOvSponsorId(e.target.value)}
              required
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Select Sponsor</option>
              {sponsors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Stream (Optional)
              </label>
              <select
                value={ovStreamId}
                onChange={(e) => setOvStreamId(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Any stream</option>
                {streams.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.matchTitle || `${s.teamAName} vs ${s.teamBName}` || s.youtubeVideoId}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tournament (Optional)
              </label>
              <select
                value={ovTournamentId}
                onChange={(e) => setOvTournamentId(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Any tournament</option>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mode</label>
              <select
                value={ovMode}
                onChange={(e) => setOvMode(e.target.value as 'BANNER' | 'ANNOUNCEMENT')}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="BANNER">Banner Pill</option>
                <option value="ANNOUNCEMENT">Announcement Strip</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Position</label>
              <select
                value={ovPosition}
                onChange={(e) => setOvPosition(e.target.value as ScoreboardPosition)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="TOP">Top</option>
                <option value="BOTTOM">Bottom</option>
                <option value="LEFT">Left</option>
                <option value="RIGHT">Right</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Duration (seconds)
              </label>
              <input
                type="number"
                min={3}
                value={ovDuration}
                onChange={(e) => setOvDuration(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Display Order
              </label>
              <input
                type="number"
                min={1}
                value={ovOrder}
                onChange={(e) => setOvOrder(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Announcement Copy (Optional)
            </label>
            <input
              type="text"
              value={ovText}
              onChange={(e) => setOvText(e.target.value)}
              placeholder="e.g. Powered by Local Sports Hardware"
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={ovVisible}
              onChange={(e) => setOvVisible(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300"
            />
            <span>Visible on broadcast player</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOverlayModalOpen(false)}
              className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingOverlay}
              className="min-h-[42px] px-5 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {savingOverlay ? 'Saving...' : 'Create Overlay'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteSponsorTarget || deleteOverlayTarget)}
        onClose={() => {
          setDeleteSponsorTarget(null);
          setDeleteOverlayTarget(null);
        }}
        onConfirm={confirmDelete}
        loading={deleting}
        title={deleteSponsorTarget ? 'Delete Sponsor' : 'Delete Sponsor Overlay'}
        message={
          deleteSponsorTarget
            ? `Delete sponsor "${deleteSponsorTarget.name}"?`
            : 'Remove this broadcast overlay configuration?'
        }
        confirmLabel="Delete"
      />
    </div>
  );
}
