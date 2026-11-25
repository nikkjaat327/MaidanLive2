import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Clock,
  Edit3,
  LayoutTemplate,
  Maximize2,
  Megaphone,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  BroadcastOverlayConfig,
  SponsorData,
  SponsorPlacement,
} from '../../types/index.ts';
import type { ObsStudioPayload } from '../../types/obs.ts';
import {
  OVERLAY_POSITIONS,
  SPONSOR_AD_TIMING_BOUNDS,
  TIMEOUT_AD_LAYOUTS,
  TIMEOUT_AD_POSITIONS,
  normalizeOverlayConfig,
  type OverlayPosition,
  type SponsorAdAnimation,
  type SponsorAdTransition,
  type TimeoutAdLayout,
  type TimeoutAdPosition,
  type TimeoutDisplayMode,
} from '../../utils/overlayConfig.ts';
import {
  SPONSOR_ANIMATION_OPTIONS,
  SPONSOR_TRANSITION_OPTIONS,
} from '../../utils/sponsorAnimation.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { ConfirmDialog } from '../common/ConfirmDialog.tsx';

type StudioSponsorItem = ObsStudioPayload['sponsors'][number];

interface BroadcastSponsorAndTimeoutTabProps {
  matchId: string;
  sponsors: StudioSponsorItem[];
  selectedSponsorIds: string[];
  overlayConfig: BroadcastOverlayConfig;
  savingOverlay: boolean;
  savingSponsors: boolean;
  canManageCatalog: boolean;
  onUpdateOverlay: (patch: Record<string, unknown>) => Promise<void>;
  onToggleMatchSponsor: (sponsorId: string) => Promise<void>;
  onSponsorsChanged: () => Promise<void>;
  onBackToControlRoom: () => void;
  onNotifySuccess: (msg: string) => void;
  onNotifyError: (msg: string) => void;
}

interface SponsorDraftForm {
  id?: string;
  name: string;
  logoUrl: string;
  sponsorshipType: string;
  tagline: string;
  ctaText: string;
  websiteUrl: string;
  placement: SponsorPlacement;
  isPublished: boolean;
  isActive: boolean;
}

const EMPTY_SPONSOR_DRAFT: SponsorDraftForm = {
  name: '',
  logoUrl: '',
  sponsorshipType: 'Title Sponsor',
  tagline: '',
  ctaText: 'SPONSORED',
  websiteUrl: '',
  placement: 'live_match',
  isPublished: true,
  isActive: true,
};

const POSITION_LABELS: Record<TimeoutAdPosition, string> = {
  center: 'Center',
  'top-left': 'Top Left',
  'top-center': 'Top Center',
  'top-right': 'Top Right',
  'bottom-left': 'Bottom Left',
  'bottom-center': 'Bottom Center',
  'bottom-right': 'Bottom Right',
};

const TIMEOUT_LAYOUT_META: Record<
  TimeoutAdLayout,
  { label: string; desc: string }
> = {
  fullscreen_card: {
    label: 'Fullscreen Spotlight',
    desc: 'Full dark stage takeover with live score bar',
  },
  floating_showcase: {
    label: 'Floating Card',
    desc: 'Framed showcase box placed at chosen screen zone',
  },
  banner_strip: {
    label: 'Wide Banner Strip',
    desc: 'Clean edge ticker ribbon keeping camera visible',
  },
};

export function BroadcastSponsorAndTimeoutTab({
  matchId,
  sponsors,
  selectedSponsorIds,
  overlayConfig,
  savingOverlay,
  savingSponsors,
  canManageCatalog,
  onUpdateOverlay,
  onToggleMatchSponsor,
  onSponsorsChanged,
  onBackToControlRoom,
  onNotifySuccess,
  onNotifyError,
}: BroadcastSponsorAndTimeoutTabProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftForm, setDraftForm] = useState<SponsorDraftForm>(EMPTY_SPONSOR_DRAFT);
  const [savingCatalog, setSavingCatalog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StudioSponsorItem | null>(null);
  const [deletingCatalog, setDeletingCatalog] = useState(false);

  // Local text input drafts so typing doesn't lag or fight backend sync
  const [sponsorTextDraft, setSponsorTextDraft] = useState<{
    name?: string;
    tagline?: string;
    cta?: string;
    logoUrl?: string;
  }>({});
  const [timeoutTextDraft, setTimeoutTextDraft] = useState<{
    title?: string;
    subtitle?: string;
    badgeText?: string;
    cta?: string;
    logoUrl?: string;
  }>({});

  const effectiveConfig = useMemo(
    () => normalizeOverlayConfig(overlayConfig),
    [overlayConfig]
  );

  const sponsorNameVal = sponsorTextDraft.name ?? effectiveConfig.sponsorAdName;
  const sponsorTaglineVal = sponsorTextDraft.tagline ?? effectiveConfig.sponsorAdTagline;
  const sponsorCtaVal = sponsorTextDraft.cta ?? effectiveConfig.sponsorAdCta;
  const sponsorLogoVal = sponsorTextDraft.logoUrl ?? effectiveConfig.sponsorAdLogoUrl;

  const timeoutTitleVal = timeoutTextDraft.title ?? effectiveConfig.timeoutAdTitle;
  const timeoutSubtitleVal = timeoutTextDraft.subtitle ?? effectiveConfig.timeoutAdSubtitle;
  const timeoutBadgeVal = timeoutTextDraft.badgeText ?? effectiveConfig.timeoutAdBadgeText;
  const timeoutCtaVal = timeoutTextDraft.cta ?? effectiveConfig.timeoutAdCta;
  const timeoutLogoVal = timeoutTextDraft.logoUrl ?? effectiveConfig.timeoutAdLogoUrl;

  function openCreateSponsor() {
    setDraftForm({ ...EMPTY_SPONSOR_DRAFT });
    setEditorOpen(true);
  }

  function openEditSponsor(sp: StudioSponsorItem) {
    const validPlacements: readonly SponsorPlacement[] = [
      'live_match',
      'home_feed',
      'tournament_banner',
    ];
    const safePlacement: SponsorPlacement = validPlacements.includes(
      sp.placement as SponsorPlacement
    )
      ? (sp.placement as SponsorPlacement)
      : 'live_match';
    setDraftForm({
      id: sp.id,
      name: sp.name || '',
      logoUrl: sp.logoUrl || '',
      sponsorshipType: sp.sponsorshipType || 'Title Sponsor',
      tagline: sp.tagline || '',
      ctaText: sp.ctaText || 'SPONSORED',
      websiteUrl: sp.websiteUrl || '',
      placement: safePlacement,
      isPublished: sp.isPublished !== false,
      isActive: sp.isActive !== false,
    });
    setEditorOpen(true);
  }

  async function handleSaveSponsorCatalog(e: React.FormEvent) {
    e.preventDefault();
    if (!draftForm.name.trim()) {
      onNotifyError('Sponsor name is required.');
      return;
    }
    try {
      setSavingCatalog(true);
      const payload: Partial<SponsorData> = {
        name: draftForm.name.trim(),
        logoUrl: draftForm.logoUrl.trim(),
        sponsorshipType: draftForm.sponsorshipType.trim() || 'Partner',
        tagline: draftForm.tagline.trim(),
        ctaText: draftForm.ctaText.trim() || 'SPONSORED',
        websiteUrl: draftForm.websiteUrl.trim(),
        placement: draftForm.placement,
        isPublished: draftForm.isPublished,
        isActive: draftForm.isActive,
      };
      if (draftForm.id) {
        const updated = await platformOpsService.updateSponsor(draftForm.id, payload);
        onNotifySuccess(`Updated sponsor "${updated.name}".`);
        if (effectiveConfig.sponsorAdId === updated.id) {
          await onUpdateOverlay({
            sponsorAdName: updated.name,
            sponsorAdTagline: updated.tagline || updated.sponsorshipType || '',
            sponsorAdLogoUrl: updated.logoUrl || '',
            sponsorAdCta: updated.ctaText || 'SPONSORED',
          });
        }
        if (effectiveConfig.timeoutAdSponsorId === updated.id) {
          await onUpdateOverlay({
            timeoutAdTitle: updated.name,
            timeoutAdSubtitle: updated.tagline || updated.sponsorshipType || '',
            timeoutAdLogoUrl: updated.logoUrl || '',
            timeoutAdCta: updated.ctaText || 'OFFICIAL PARTNER',
          });
        }
      } else {
        const created = await platformOpsService.createSponsor(payload);
        onNotifySuccess(`Created sponsor "${created.name}".`);
      }
      setEditorOpen(false);
      setDraftForm(EMPTY_SPONSOR_DRAFT);
      await onSponsorsChanged();
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to save sponsor.'));
    } finally {
      setSavingCatalog(false);
    }
  }

  async function handleConfirmDeleteSponsor() {
    if (!deleteTarget) return;
    try {
      setDeletingCatalog(true);
      await platformOpsService.deleteSponsor(deleteTarget.id);
      onNotifySuccess(`Removed sponsor "${deleteTarget.name}".`);
      setDeleteTarget(null);
      await onSponsorsChanged();
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to delete sponsor.'));
    } finally {
      setDeletingCatalog(false);
    }
  }

  async function stageForSponsorAd(sp: StudioSponsorItem) {
    setSponsorTextDraft({});
    await onUpdateOverlay({
      sponsorAdId: sp.id,
      sponsorAdName: sp.name,
      sponsorAdTagline: sp.tagline || sp.sponsorshipType || '',
      sponsorAdLogoUrl: sp.logoUrl || '',
      sponsorAdCta: sp.ctaText || 'SPONSORED',
    });
    onNotifySuccess(
      `Staged "${sp.name}" for Sponsor Ad. Click "Sponsor Ad" in Control Room to go live.`
    );
  }

  async function stageForTimeoutAd(sp: StudioSponsorItem) {
    setTimeoutTextDraft({});
    await onUpdateOverlay({
      timeoutAdSponsorId: sp.id,
      timeoutAdTitle: sp.name,
      timeoutAdSubtitle: sp.tagline || sp.sponsorshipType || '',
      timeoutAdLogoUrl: sp.logoUrl || '',
      timeoutAdCta: sp.ctaText || 'OFFICIAL PARTNER',
    });
    onNotifySuccess(
      `Staged "${sp.name}" for Timeout Ad. Click "Timeout Ad" in Control Room when ready.`
    );
  }

  async function stageForBothAds(sp: StudioSponsorItem) {
    setSponsorTextDraft({});
    setTimeoutTextDraft({});
    await onUpdateOverlay({
      sponsorAdId: sp.id,
      sponsorAdName: sp.name,
      sponsorAdTagline: sp.tagline || sp.sponsorshipType || '',
      sponsorAdLogoUrl: sp.logoUrl || '',
      sponsorAdCta: sp.ctaText || 'SPONSORED',
      timeoutAdSponsorId: sp.id,
      timeoutAdTitle: sp.name,
      timeoutAdSubtitle: sp.tagline || sp.sponsorshipType || '',
      timeoutAdLogoUrl: sp.logoUrl || '',
      timeoutAdCta: sp.ctaText || 'OFFICIAL PARTNER',
    });
    onNotifySuccess(
      `Staged "${sp.name}" for both Sponsor Ad & Timeout Ad. Ready in Control Room!`
    );
  }

  const activeStagedSponsorName =
    effectiveConfig.sponsorAdName ||
    sponsors.find((s) => s.id === effectiveConfig.sponsorAdId)?.name ||
    'Not selected yet';
  const activeTimeoutTitle =
    effectiveConfig.timeoutAdTitle ||
    effectiveConfig.sponsorAdName ||
    'Synced with Sponsor Ad';

  return (
    <div className="p-3 sm:p-5 bg-[#070A10] space-y-5 text-slate-100">
      {/* Top Broadcast Handoff Strip */}
      <div className="rounded-xl border border-slate-800 bg-[#0B101B] p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="font-display text-base sm:text-lg font-bold text-white truncate">
              Sponsor Ad &amp; Timeout Ad Studio
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Select or create sponsors, configure screen positions, duration, timing, and layout here — then use the Control Room <span className="text-amber-300 font-semibold">Sponsor Ad</span> or <span className="text-orange-300 font-semibold">Timeout Ad</span> buttons to trigger live on OBS &amp; player.
          </p>
          <p className="text-[11px] font-mono text-slate-300 pt-0.5 truncate">
            Staged Sponsor Ad: <span className="text-amber-300">{activeStagedSponsorName}</span> ({effectiveConfig.sponsorAdPosition}) · Timeout Ad: <span className="text-orange-300">{activeTimeoutTitle}</span> ({effectiveConfig.timeoutAdLayout.replace('_', ' ')} · {effectiveConfig.timeoutAdPosition})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={savingOverlay}
            onClick={() =>
              void onUpdateOverlay({
                sponsorAdVisible: !effectiveConfig.sponsorAdVisible,
              })
            }
            className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              effectiveConfig.sponsorAdVisible
                ? 'bg-amber-500 border-amber-400 text-slate-950'
                : 'bg-[#121826] border-amber-500/40 text-amber-300 hover:bg-slate-800'
            }`}
          >
            <Megaphone className="w-3.5 h-3.5" />
            <span>{effectiveConfig.sponsorAdVisible ? 'Sponsor Ad ON' : 'Preview Sponsor Ad'}</span>
          </button>

          <button
            type="button"
            disabled={savingOverlay}
            onClick={() =>
              void onUpdateOverlay({
                timeoutFullscreenSponsorAdActive: !effectiveConfig.timeoutFullscreenSponsorAdActive,
                ...(effectiveConfig.timeoutFullscreenSponsorAdActive
                  ? {}
                  : { fullScoreboardVisible: false }),
              })
            }
            className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              effectiveConfig.timeoutFullscreenSponsorAdActive
                ? 'bg-orange-500 border-orange-400 text-slate-950'
                : 'bg-[#121826] border-orange-500/40 text-orange-300 hover:bg-slate-800'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>
              {effectiveConfig.timeoutFullscreenSponsorAdActive
                ? 'Timeout Ad ON'
                : 'Preview Timeout Ad'}
            </span>
          </button>

          <button
            type="button"
            onClick={onBackToControlRoom}
            className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Control Room</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: SPONSOR CATALOG MANAGER */}
      <section className="rounded-xl border border-slate-800 bg-[#0B101B] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="font-display text-sm sm:text-base font-bold text-white">
              Registered Sponsors ({sponsors.length} available · {selectedSponsorIds.length} active on match)
            </h3>
            <p className="text-xs text-slate-400">
              Create, edit, or select any sponsor to stage its branding into the Sponsor Ad banner or Timeout Ad spotlight.
            </p>
          </div>
          {canManageCatalog && (
            <button
              type="button"
              onClick={openCreateSponsor}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#EA580C] hover:bg-orange-500 text-white text-xs font-bold transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Sponsor</span>
            </button>
          )}
        </div>

        {/* Inline Create / Edit Sponsor Drawer */}
        {editorOpen && (
          <form
            onSubmit={handleSaveSponsorCatalog}
            className="rounded-xl border border-amber-500/40 bg-slate-950/90 p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-sm font-bold text-amber-300">
                {draftForm.id ? 'Edit Sponsor Details' : 'Create New Sponsor'}
              </p>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Sponsor Brand Name *
                </label>
                <input
                  type="text"
                  required
                  value={draftForm.name}
                  onChange={(e) => setDraftForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Apex Energy"
                  className="w-full min-h-[36px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-900 text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Sponsorship Tier / Type
                </label>
                <input
                  type="text"
                  value={draftForm.sponsorshipType}
                  onChange={(e) => setDraftForm((f) => ({ ...f, sponsorshipType: e.target.value }))}
                  placeholder="Title Sponsor / Co-Partner"
                  className="w-full min-h-[36px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-900 text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  CTA Badge Text
                </label>
                <input
                  type="text"
                  value={draftForm.ctaText}
                  onChange={(e) => setDraftForm((f) => ({ ...f, ctaText: e.target.value }))}
                  placeholder="OFFICIAL PARTNER"
                  className="w-full min-h-[36px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-900 text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Sponsor Logo URL
                </label>
                <input
                  type="url"
                  value={draftForm.logoUrl}
                  onChange={(e) => setDraftForm((f) => ({ ...f, logoUrl: e.target.value }))}
                  placeholder="https://cdn.example.com/sponsor-logo.png"
                  className="w-full min-h-[36px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-900 text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Website URL (Optional)
                </label>
                <input
                  type="url"
                  value={draftForm.websiteUrl}
                  onChange={(e) => setDraftForm((f) => ({ ...f, websiteUrl: e.target.value }))}
                  placeholder="https://brand.com"
                  className="w-full min-h-[36px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-900 text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Tagline / Offer Copy
                </label>
                <input
                  type="text"
                  value={draftForm.tagline}
                  onChange={(e) => setDraftForm((f) => ({ ...f, tagline: e.target.value }))}
                  placeholder="Powering Champions Across Every Arena"
                  className="w-full min-h-[36px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-900 text-white"
                />
              </div>

              <div className="flex items-end gap-4">
                <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer min-h-[36px]">
                  <input
                    type="checkbox"
                    checked={draftForm.isActive}
                    onChange={(e) => setDraftForm((f) => ({ ...f, isActive: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-600 text-amber-500"
                  />
                  <span>Active</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer min-h-[36px]">
                  <input
                    type="checkbox"
                    checked={draftForm.isPublished}
                    onChange={(e) => setDraftForm((f) => ({ ...f, isPublished: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-600 text-amber-500"
                  />
                  <span>Published</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="min-h-[34px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingCatalog}
                className="min-h-[34px] inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{savingCatalog ? 'Saving...' : draftForm.id ? 'Update Sponsor' : 'Create Sponsor'}</span>
              </button>
            </div>
          </form>
        )}

        {sponsors.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-slate-800 bg-slate-950/60 text-center space-y-2">
            <p className="text-xs text-slate-300 font-semibold">
              No active sponsors in the catalog yet.
            </p>
            <p className="text-[11px] text-slate-400">
              Create a sponsor above or configure custom Sponsor Ad &amp; Timeout Ad details directly below.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[360px] overflow-y-auto pr-1">
            {sponsors.map((sp) => {
              const isMatchSelected = selectedSponsorIds.includes(sp.id);
              const isStagedSponsor = effectiveConfig.sponsorAdId === sp.id;
              const isStagedTimeout = effectiveConfig.timeoutAdSponsorId === sp.id;
              return (
                <div
                  key={sp.id}
                  className={`rounded-xl border p-3 flex flex-col justify-between gap-3 transition-colors ${
                    isStagedSponsor || isStagedTimeout
                      ? 'border-amber-500/60 bg-amber-500/10'
                      : isMatchSelected
                        ? 'border-orange-500/40 bg-slate-900/90'
                        : 'border-slate-800 bg-slate-950/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <label className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isMatchSelected}
                        disabled={savingSponsors}
                        onChange={() => void onToggleMatchSponsor(sp.id)}
                        title="Include sponsor in match"
                        className="w-4 h-4 mt-1 rounded border-slate-600 text-[#EA580C] shrink-0"
                      />
                      {sp.logoUrl ? (
                        <img
                          src={sp.logoUrl}
                          alt={sp.name}
                          className="w-10 h-10 rounded-lg object-contain bg-white border border-slate-700 p-0.5 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-extrabold text-amber-300 shrink-0">
                          {sp.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">{sp.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {sp.sponsorshipType}
                          {sp.tagline ? ` · ${sp.tagline}` : ''}
                        </p>
                        {(isStagedSponsor || isStagedTimeout) && (
                          <p className="text-[10px] font-mono text-amber-300 mt-0.5 truncate">
                            {[
                              isStagedSponsor ? 'Staged: Sponsor Ad' : '',
                              isStagedTimeout ? 'Staged: Timeout Ad' : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        )}
                      </div>
                    </label>

                    {canManageCatalog && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditSponsor(sp)}
                          title="Edit sponsor"
                          aria-label={`Edit ${sp.name}`}
                          className="p-1.5 rounded-md border border-slate-800 bg-slate-900 hover:border-slate-600 text-slate-300 hover:text-white"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(sp)}
                          title="Delete sponsor"
                          aria-label={`Delete ${sp.name}`}
                          className="p-1.5 rounded-md border border-slate-800 bg-slate-900 hover:border-red-500/60 text-slate-400 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/80">
                    <button
                      type="button"
                      disabled={savingOverlay}
                      onClick={() => void stageForSponsorAd(sp)}
                      className={`flex-1 min-h-[30px] px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                        isStagedSponsor
                          ? 'bg-amber-500 border-amber-400 text-slate-950'
                          : 'bg-slate-900 border-slate-700 text-amber-300 hover:border-amber-500/60'
                      }`}
                    >
                      {isStagedSponsor ? 'Sponsor Ad ✓' : 'Use Sponsor Ad'}
                    </button>
                    <button
                      type="button"
                      disabled={savingOverlay}
                      onClick={() => void stageForTimeoutAd(sp)}
                      className={`flex-1 min-h-[30px] px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                        isStagedTimeout
                          ? 'bg-orange-500 border-orange-400 text-slate-950'
                          : 'bg-slate-900 border-slate-700 text-orange-300 hover:border-orange-500/60'
                      }`}
                    >
                      {isStagedTimeout ? 'Timeout Ad ✓' : 'Use Timeout Ad'}
                    </button>
                    <button
                      type="button"
                      disabled={savingOverlay}
                      onClick={() => void stageForBothAds(sp)}
                      className="min-h-[30px] px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border border-slate-700 bg-slate-900 text-slate-200 hover:border-purple-500"
                    >
                      Both
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 2: TWO-COLUMN SPONSOR AD & TIMEOUT AD STUDIO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT: SPONSOR AD STUDIO */}
        <section className="rounded-xl border border-slate-800 bg-[#0B101B] p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Megaphone className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <h3 className="font-display text-sm sm:text-base font-bold text-white truncate">
                  Sponsor Ad Banner Settings
                </h3>
                <p className="text-[11px] text-slate-400 truncate">
                  Triggered from Control Room &ldquo;Sponsor Ad&rdquo; button · Match {matchId.slice(-6)}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={savingOverlay}
              onClick={() =>
                void onUpdateOverlay({ sponsorAdVisible: !effectiveConfig.sponsorAdVisible })
              }
              className={`min-h-[32px] px-3 rounded-lg text-[11px] font-extrabold uppercase tracking-wider border shrink-0 ${
                effectiveConfig.sponsorAdVisible
                  ? 'bg-amber-500 border-amber-400 text-slate-950'
                  : 'bg-slate-900 border-amber-500/40 text-amber-300 hover:bg-slate-800'
              }`}
            >
              {effectiveConfig.sponsorAdVisible ? 'Live ON' : 'Go Live'}
            </button>
          </div>

          {/* Copy & Branding */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Sponsor Brand Name
              </label>
              <input
                type="text"
                value={sponsorNameVal}
                disabled={savingOverlay}
                placeholder="Official Broadcast Partner"
                onChange={(e) =>
                  setSponsorTextDraft((d) => ({ ...d, name: e.target.value }))
                }
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  setSponsorTextDraft((d) => ({ ...d, name: undefined }));
                  if (next !== effectiveConfig.sponsorAdName) {
                    void onUpdateOverlay({ sponsorAdName: next });
                  }
                }}
                className="w-full min-h-[36px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                CTA Badge
              </label>
              <input
                type="text"
                value={sponsorCtaVal}
                disabled={savingOverlay}
                placeholder="SPONSORED"
                onChange={(e) =>
                  setSponsorTextDraft((d) => ({ ...d, cta: e.target.value }))
                }
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  setSponsorTextDraft((d) => ({ ...d, cta: undefined }));
                  if (next !== effectiveConfig.sponsorAdCta) {
                    void onUpdateOverlay({ sponsorAdCta: next });
                  }
                }}
                className="w-full min-h-[36px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Tagline / Sub-text
              </label>
              <input
                type="text"
                value={sponsorTaglineVal}
                disabled={savingOverlay}
                placeholder="Powered by Title Sponsor"
                onChange={(e) =>
                  setSponsorTextDraft((d) => ({ ...d, tagline: e.target.value }))
                }
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  setSponsorTextDraft((d) => ({ ...d, tagline: undefined }));
                  if (next !== effectiveConfig.sponsorAdTagline) {
                    void onUpdateOverlay({ sponsorAdTagline: next });
                  }
                }}
                className="w-full min-h-[36px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Sponsor Logo URL
              </label>
              <input
                type="url"
                value={sponsorLogoVal}
                disabled={savingOverlay}
                placeholder="https://cdn.example.com/logo.png"
                onChange={(e) =>
                  setSponsorTextDraft((d) => ({ ...d, logoUrl: e.target.value }))
                }
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  setSponsorTextDraft((d) => ({ ...d, logoUrl: undefined }));
                  if (next !== effectiveConfig.sponsorAdLogoUrl) {
                    void onUpdateOverlay({ sponsorAdLogoUrl: next });
                  }
                }}
                className="w-full min-h-[36px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-white"
              />
            </div>
          </div>

          {/* 6-Point Position Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-300">Screen Position (6 Zones)</span>
              <span className="font-mono text-amber-300">{effectiveConfig.sponsorAdPosition}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {OVERLAY_POSITIONS.map((pos: OverlayPosition) => {
                const active = effectiveConfig.sponsorAdPosition === pos;
                return (
                  <button
                    key={pos}
                    type="button"
                    disabled={savingOverlay}
                    onClick={() => void onUpdateOverlay({ sponsorAdPosition: pos })}
                    className={`min-h-[32px] px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                      active
                        ? 'bg-amber-500 border-amber-400 text-slate-950 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {POSITION_LABELS[pos]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scale & Offsets */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-semibold text-slate-300">Scale</span>
                <span className="font-mono text-amber-300">
                  {Math.round(effectiveConfig.sponsorAdScale * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={SPONSOR_AD_TIMING_BOUNDS.sponsorAdScale.min}
                max={SPONSOR_AD_TIMING_BOUNDS.sponsorAdScale.max}
                step={SPONSOR_AD_TIMING_BOUNDS.sponsorAdScale.step}
                value={effectiveConfig.sponsorAdScale}
                onChange={(e) =>
                  void onUpdateOverlay({ sponsorAdScale: Number(e.target.value) })
                }
                className="w-full h-1.5 bg-slate-800 rounded-lg accent-amber-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-semibold text-slate-300">Edge X</span>
                <span className="font-mono text-amber-300">{effectiveConfig.sponsorAdOffsetX}px</span>
              </div>
              <input
                type="range"
                min={SPONSOR_AD_TIMING_BOUNDS.sponsorAdOffsetX.min}
                max={SPONSOR_AD_TIMING_BOUNDS.sponsorAdOffsetX.max}
                step={SPONSOR_AD_TIMING_BOUNDS.sponsorAdOffsetX.step}
                value={effectiveConfig.sponsorAdOffsetX}
                onChange={(e) =>
                  void onUpdateOverlay({ sponsorAdOffsetX: Number(e.target.value) })
                }
                className="w-full h-1.5 bg-slate-800 rounded-lg accent-amber-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-semibold text-slate-300">Edge Y</span>
                <span className="font-mono text-amber-300">{effectiveConfig.sponsorAdOffsetY}px</span>
              </div>
              <input
                type="range"
                min={SPONSOR_AD_TIMING_BOUNDS.sponsorAdOffsetY.min}
                max={SPONSOR_AD_TIMING_BOUNDS.sponsorAdOffsetY.max}
                step={SPONSOR_AD_TIMING_BOUNDS.sponsorAdOffsetY.step}
                value={effectiveConfig.sponsorAdOffsetY}
                onChange={(e) =>
                  void onUpdateOverlay({ sponsorAdOffsetY: Number(e.target.value) })
                }
                className="w-full h-1.5 bg-slate-800 rounded-lg accent-amber-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Timing, Animation & Transition */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                Show Duration (sec)
              </label>
              <input
                type="number"
                min={SPONSOR_AD_TIMING_BOUNDS.sponsorAdDurationSeconds.min}
                max={SPONSOR_AD_TIMING_BOUNDS.sponsorAdDurationSeconds.max}
                defaultValue={effectiveConfig.sponsorAdDurationSeconds}
                key={`sp-dur-${effectiveConfig.sponsorAdDurationSeconds}`}
                disabled={savingOverlay}
                onBlur={(e) =>
                  void onUpdateOverlay({
                    sponsorAdDurationSeconds: Number(e.target.value) || 12,
                  })
                }
                className="w-full min-h-[34px] px-2.5 text-xs font-mono rounded-lg border border-slate-700 bg-slate-950 text-white"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                Repeat After (sec)
              </label>
              <input
                type="number"
                min={SPONSOR_AD_TIMING_BOUNDS.sponsorAdRepeatIntervalSeconds.min}
                max={SPONSOR_AD_TIMING_BOUNDS.sponsorAdRepeatIntervalSeconds.max}
                defaultValue={effectiveConfig.sponsorAdRepeatIntervalSeconds}
                key={`sp-rep-${effectiveConfig.sponsorAdRepeatIntervalSeconds}`}
                disabled={savingOverlay}
                onBlur={(e) =>
                  void onUpdateOverlay({
                    sponsorAdRepeatIntervalSeconds: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full min-h-[34px] px-2.5 text-xs font-mono rounded-lg border border-slate-700 bg-slate-950 text-white"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                Transition (ms)
              </label>
              <input
                type="number"
                step={50}
                min={SPONSOR_AD_TIMING_BOUNDS.sponsorAdTransitionMs.min}
                max={SPONSOR_AD_TIMING_BOUNDS.sponsorAdTransitionMs.max}
                defaultValue={effectiveConfig.sponsorAdTransitionMs}
                key={`sp-ms-${effectiveConfig.sponsorAdTransitionMs}`}
                disabled={savingOverlay}
                onBlur={(e) =>
                  void onUpdateOverlay({
                    sponsorAdTransitionMs: Number(e.target.value) || 450,
                  })
                }
                className="w-full min-h-[34px] px-2.5 text-xs font-mono rounded-lg border border-slate-700 bg-slate-950 text-white"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                Animation
              </label>
              <select
                value={effectiveConfig.sponsorAdAnimation}
                disabled={savingOverlay}
                onChange={(e) =>
                  void onUpdateOverlay({
                    sponsorAdAnimation: e.target.value as SponsorAdAnimation,
                  })
                }
                className="w-full min-h-[34px] px-2 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-950 text-white"
              >
                {SPONSOR_ANIMATION_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                Transition
              </label>
              <select
                value={effectiveConfig.sponsorAdTransition}
                disabled={savingOverlay}
                onChange={(e) =>
                  void onUpdateOverlay({
                    sponsorAdTransition: e.target.value as SponsorAdTransition,
                  })
                }
                className="w-full min-h-[34px] px-2 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-950 text-white"
              >
                {SPONSOR_TRANSITION_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-950 text-[11px] font-semibold text-slate-200 cursor-pointer self-end min-h-[34px]">
              <input
                type="checkbox"
                checked={effectiveConfig.sponsorAdRepeatContinuously !== false}
                disabled={savingOverlay}
                onChange={(e) =>
                  void onUpdateOverlay({
                    sponsorAdRepeatContinuously: e.target.checked,
                  })
                }
                className="w-3.5 h-3.5 rounded border-slate-600 text-amber-500 shrink-0"
              />
              <span className="truncate">Repeat Loop</span>
            </label>
          </div>
        </section>

        {/* RIGHT: TIMEOUT AD STUDIO */}
        <section className="rounded-xl border border-slate-800 bg-[#0B101B] p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="w-4 h-4 text-orange-400 shrink-0" />
              <div className="min-w-0">
                <h3 className="font-display text-sm sm:text-base font-bold text-white truncate">
                  Timeout Ad Settings
                </h3>
                <p className="text-[11px] text-slate-400 truncate">
                  Triggered on team timeout or via Control Room &ldquo;Timeout Ad&rdquo; button
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={savingOverlay}
              onClick={() =>
                void onUpdateOverlay({
                  timeoutFullscreenSponsorAdActive: !effectiveConfig.timeoutFullscreenSponsorAdActive,
                  ...(effectiveConfig.timeoutFullscreenSponsorAdActive
                    ? {}
                    : { fullScoreboardVisible: false }),
                })
              }
              className={`min-h-[32px] px-3 rounded-lg text-[11px] font-extrabold uppercase tracking-wider border shrink-0 ${
                effectiveConfig.timeoutFullscreenSponsorAdActive
                  ? 'bg-orange-500 border-orange-400 text-slate-950'
                  : 'bg-slate-900 border-orange-500/40 text-orange-300 hover:bg-slate-800'
              }`}
            >
              {effectiveConfig.timeoutFullscreenSponsorAdActive ? 'Live ON' : 'Go Live'}
            </button>
          </div>

          {/* Timeout Behavior */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                When Team Takes Timeout
              </label>
              <select
                value={effectiveConfig.timeoutDisplayMode}
                disabled={savingOverlay}
                onChange={(e) =>
                  void onUpdateOverlay({
                    timeoutDisplayMode: e.target.value as TimeoutDisplayMode,
                  })
                }
                className="w-full min-h-[36px] px-2.5 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-950 text-white"
              >
                <option value="fullscreen_ad">Show Configured Timeout Ad</option>
                <option value="full_scoreboard">Show Full Match Scoreboard</option>
                <option value="none">Keep Normal Lower Scoreboard</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Timeout Partner Quick Sync
              </label>
              <button
                type="button"
                disabled={savingOverlay}
                onClick={() => {
                  setTimeoutTextDraft({});
                  void onUpdateOverlay({
                    timeoutAdSponsorId: effectiveConfig.sponsorAdId,
                    timeoutAdTitle: effectiveConfig.sponsorAdName,
                    timeoutAdSubtitle: effectiveConfig.sponsorAdTagline,
                    timeoutAdLogoUrl: effectiveConfig.sponsorAdLogoUrl,
                    timeoutAdCta: effectiveConfig.sponsorAdCta,
                  });
                }}
                className="w-full min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200"
              >
                <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                <span>Copy Branding from Sponsor Ad</span>
              </button>
            </div>
          </div>

          {/* Timeout Copy Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Timeout Sponsor Title (blank = use Sponsor Ad)
              </label>
              <input
                type="text"
                value={timeoutTitleVal}
                disabled={savingOverlay}
                placeholder={effectiveConfig.sponsorAdName || 'Official Timeout Partner'}
                onChange={(e) =>
                  setTimeoutTextDraft((d) => ({ ...d, title: e.target.value }))
                }
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  setTimeoutTextDraft((d) => ({ ...d, title: undefined }));
                  if (next !== effectiveConfig.timeoutAdTitle) {
                    void onUpdateOverlay({ timeoutAdTitle: next });
                  }
                }}
                className="w-full min-h-[36px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Top Spotlight Label
              </label>
              <input
                type="text"
                value={timeoutBadgeVal}
                disabled={savingOverlay}
                placeholder="TIMEOUT PARTNER SPOTLIGHT"
                onChange={(e) =>
                  setTimeoutTextDraft((d) => ({ ...d, badgeText: e.target.value }))
                }
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  setTimeoutTextDraft((d) => ({ ...d, badgeText: undefined }));
                  if (next !== effectiveConfig.timeoutAdBadgeText) {
                    void onUpdateOverlay({ timeoutAdBadgeText: next });
                  }
                }}
                className="w-full min-h-[36px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Timeout Subtitle / Offer
              </label>
              <input
                type="text"
                value={timeoutSubtitleVal}
                disabled={savingOverlay}
                placeholder={effectiveConfig.sponsorAdTagline || 'Supporting Live Arena Sports'}
                onChange={(e) =>
                  setTimeoutTextDraft((d) => ({ ...d, subtitle: e.target.value }))
                }
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  setTimeoutTextDraft((d) => ({ ...d, subtitle: undefined }));
                  if (next !== effectiveConfig.timeoutAdSubtitle) {
                    void onUpdateOverlay({ timeoutAdSubtitle: next });
                  }
                }}
                className="w-full min-h-[36px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  CTA Pill
                </label>
                <input
                  type="text"
                  value={timeoutCtaVal}
                  disabled={savingOverlay}
                  placeholder={effectiveConfig.sponsorAdCta || 'OFFICIAL PARTNER'}
                  onChange={(e) =>
                    setTimeoutTextDraft((d) => ({ ...d, cta: e.target.value }))
                  }
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    setTimeoutTextDraft((d) => ({ ...d, cta: undefined }));
                    if (next !== effectiveConfig.timeoutAdCta) {
                      void onUpdateOverlay({ timeoutAdCta: next });
                    }
                  }}
                  className="w-full min-h-[36px] px-2.5 text-xs rounded-lg border border-slate-700 bg-slate-950 text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Logo URL
                </label>
                <input
                  type="url"
                  value={timeoutLogoVal}
                  disabled={savingOverlay}
                  placeholder="https://..."
                  onChange={(e) =>
                    setTimeoutTextDraft((d) => ({ ...d, logoUrl: e.target.value }))
                  }
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    setTimeoutTextDraft((d) => ({ ...d, logoUrl: undefined }));
                    if (next !== effectiveConfig.timeoutAdLogoUrl) {
                      void onUpdateOverlay({ timeoutAdLogoUrl: next });
                    }
                  }}
                  className="w-full min-h-[36px] px-2.5 text-xs rounded-lg border border-slate-700 bg-slate-950 text-white"
                />
              </div>
            </div>
          </div>

          {/* Timeout Ad Layout Selector */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
              <LayoutTemplate className="w-3.5 h-3.5 text-orange-400" />
              <span>Timeout Ad Layout Mode</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {TIMEOUT_AD_LAYOUTS.map((layoutId) => {
                const active = effectiveConfig.timeoutAdLayout === layoutId;
                const meta = TIMEOUT_LAYOUT_META[layoutId];
                return (
                  <button
                    key={layoutId}
                    type="button"
                    disabled={savingOverlay}
                    onClick={() => void onUpdateOverlay({ timeoutAdLayout: layoutId })}
                    className={`p-2.5 rounded-xl border text-left transition-colors ${
                      active
                        ? 'bg-orange-500/20 border-orange-400 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <p className="text-[11px] font-bold">{meta.label}</p>
                    <p className="text-[10px] text-slate-400 leading-snug mt-0.5">{meta.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 7-Point Position Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-300">Timeout Ad Position</span>
              <span className="font-mono text-orange-300">{effectiveConfig.timeoutAdPosition}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {TIMEOUT_AD_POSITIONS.map((pos: TimeoutAdPosition) => {
                const active = effectiveConfig.timeoutAdPosition === pos;
                return (
                  <button
                    key={pos}
                    type="button"
                    disabled={savingOverlay}
                    onClick={() => void onUpdateOverlay({ timeoutAdPosition: pos })}
                    className={`min-h-[30px] px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${
                      pos === 'center' ? 'col-span-4 sm:col-span-1' : ''
                    } ${
                      active
                        ? 'bg-orange-500 border-orange-400 text-slate-950 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {POSITION_LABELS[pos]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Timeout Duration, Scale & Motion */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                Auto-Hide (sec, 0=Manual)
              </label>
              <input
                type="number"
                min={SPONSOR_AD_TIMING_BOUNDS.timeoutAdDurationSeconds.min}
                max={SPONSOR_AD_TIMING_BOUNDS.timeoutAdDurationSeconds.max}
                defaultValue={effectiveConfig.timeoutAdDurationSeconds}
                key={`to-dur-${effectiveConfig.timeoutAdDurationSeconds}`}
                disabled={savingOverlay}
                onBlur={(e) =>
                  void onUpdateOverlay({
                    timeoutAdDurationSeconds: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full min-h-[34px] px-2.5 text-xs font-mono rounded-lg border border-slate-700 bg-slate-950 text-white"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                Transition (ms)
              </label>
              <input
                type="number"
                step={50}
                min={SPONSOR_AD_TIMING_BOUNDS.timeoutAdTransitionMs.min}
                max={SPONSOR_AD_TIMING_BOUNDS.timeoutAdTransitionMs.max}
                defaultValue={effectiveConfig.timeoutAdTransitionMs}
                key={`to-ms-${effectiveConfig.timeoutAdTransitionMs}`}
                disabled={savingOverlay}
                onBlur={(e) =>
                  void onUpdateOverlay({
                    timeoutAdTransitionMs: Number(e.target.value) || 450,
                  })
                }
                className="w-full min-h-[34px] px-2.5 text-xs font-mono rounded-lg border border-slate-700 bg-slate-950 text-white"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400 mb-1">
                <span>Card Scale</span>
                <span className="font-mono text-orange-300">
                  {Math.round(effectiveConfig.timeoutAdScale * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={SPONSOR_AD_TIMING_BOUNDS.timeoutAdScale.min}
                max={SPONSOR_AD_TIMING_BOUNDS.timeoutAdScale.max}
                step={SPONSOR_AD_TIMING_BOUNDS.timeoutAdScale.step}
                value={effectiveConfig.timeoutAdScale}
                onChange={(e) =>
                  void onUpdateOverlay({ timeoutAdScale: Number(e.target.value) })
                }
                className="w-full h-1.5 mt-2 bg-slate-800 rounded-lg accent-orange-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                Animation
              </label>
              <select
                value={effectiveConfig.timeoutAdAnimation}
                disabled={savingOverlay}
                onChange={(e) =>
                  void onUpdateOverlay({
                    timeoutAdAnimation: e.target.value as SponsorAdAnimation,
                  })
                }
                className="w-full min-h-[34px] px-2 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-950 text-white"
              >
                {SPONSOR_ANIMATION_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-1 sm:col-span-2">
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                Transition Effect
              </label>
              <select
                value={effectiveConfig.timeoutAdTransition}
                disabled={savingOverlay}
                onChange={(e) =>
                  void onUpdateOverlay({
                    timeoutAdTransition: e.target.value as SponsorAdTransition,
                  })
                }
                className="w-full min-h-[34px] px-2 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-950 text-white"
              >
                {SPONSOR_TRANSITION_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Sponsor"
        message={`Are you sure you want to delete "${deleteTarget?.name || 'this sponsor'}" from the sponsor catalog?`}
        confirmLabel="Delete Sponsor"
        variant="danger"
        loading={deletingCatalog}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDeleteSponsor()}
      />
    </div>
  );
}
