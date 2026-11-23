import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Edit3,
  Eye,
  Film,
  Layers,
  ListVideo,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  SkipForward,
  Sparkles,
  Square,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type {
  ActiveBroadcastGraphicSlot,
  BroadcastAdDesignData,
  BroadcastAdQueueItem,
  BroadcastGraphicEventRule,
  BroadcastGraphicEventTrigger,
  BroadcastGraphicsStateData,
  GraphicsDesignType,
  GraphicsOverlapPolicy,
  GraphicsScope,
} from '../../types/broadcastGraphics.ts';
import { broadcastGraphicsService } from '../../services/obs/broadcastGraphicsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import {
  BROADCAST_EVENT_TRIGGERS,
  GRAPHICS_DURATION_PRESETS,
  summarizeAdPosition,
} from '../../utils/broadcastGraphicsTemplates.ts';
import { formatSlotRemainingLabel } from './graphicsStyleUtils.ts';
import { ObsGraphicsLayer, ScaledGraphicsPreviewFrame } from './ObsGraphicsLayer.tsx';
import { ConfirmDialog } from '../common/ConfirmDialog.tsx';
import { Modal } from '../common/Modal.tsx';

interface SavedAdsLibraryPanelProps {
  matchId: string;
  tournamentId?: string | null;
  graphicsState?: BroadcastGraphicsStateData | null;
  designs: BroadcastAdDesignData[];
  loadingDesigns: boolean;
  onRefreshDesigns: () => Promise<void> | void;
  onGraphicsStateChange: (next: BroadcastGraphicsStateData) => void;
  onOpenStudioNew: () => void;
  onOpenStudioEdit: (design: BroadcastAdDesignData) => void;
  onNotifySuccess: (msg: string) => void;
  onNotifyError: (msg: string) => void;
  compactMode?: boolean;
}

export const SavedAdsLibraryPanel: React.FC<SavedAdsLibraryPanelProps> = ({
  matchId,
  tournamentId,
  graphicsState,
  designs,
  loadingDesigns,
  onRefreshDesigns,
  onGraphicsStateChange,
  onOpenStudioNew,
  onOpenStudioEdit,
  onNotifySuccess,
  onNotifyError,
  compactMode = false,
}) => {
  const [scopeFilter, setScopeFilter] = useState<'all' | GraphicsScope>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | GraphicsDesignType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [durationOverrideMap, setDurationOverrideMap] = useState<
    Record<string, { mode: 'saved' | 'custom' | number; customSec: string }>
  >({});
  const [editingDurationId, setEditingDurationId] = useState<string | null>(null);
  const [editingDurationVal, setEditingDurationVal] = useState<string>('10');

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [previewDesign, setPreviewDesign] = useState<BroadcastAdDesignData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BroadcastAdDesignData | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [queueOpen, setQueueOpen] = useState(!compactMode);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [queueAddDesignId, setQueueAddDesignId] = useState<string>('');
  const [rulesDraft, setRulesDraft] = useState<BroadcastGraphicEventRule[]>([]);
  const [rulesDirty, setRulesDirty] = useState(false);

  // Live countdown ticker when active slots have timers
  const activeSlots = graphicsState?.activeSlots || [];
  const hasTimedLive = activeSlots.some((s) => s.visible && s.durationSeconds > 0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!hasTimedLive || graphicsState?.animationsPaused) return;
    setNowMs(Date.now());
    const t = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [hasTimedLive, graphicsState?.animationsPaused]);

  // Sync event rules draft when state updates from backend
  useEffect(() => {
    if (rulesDirty) return;
    const existing = new Map(
      (graphicsState?.eventRules || []).map((r) => [r.trigger, r])
    );
    const merged: BroadcastGraphicEventRule[] = BROADCAST_EVENT_TRIGGERS.map((meta) => {
      const found = existing.get(meta.trigger);
      return (
        found || {
          trigger: meta.trigger,
          enabled: false,
          designId: '',
          designName: '',
          durationSeconds: 10,
          cooldownSeconds: meta.defaultCooldown,
          lastTriggeredAt: null,
        }
      );
    });
    setRulesDraft(merged);
  }, [graphicsState?.eventRules, rulesDirty]);

  const savedAdsOnly = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return designs.filter((d) => {
      if (d.isTemplate) return false;
      if (scopeFilter !== 'all' && d.scope !== scopeFilter) return false;
      if (typeFilter !== 'all' && d.designType !== typeFilter) return false;
      if (q && !d.name.toLowerCase().includes(q) && !d.designType.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [designs, scopeFilter, typeFilter, searchQuery]);

  const resolveDurationForShow = useCallback(
    (design: BroadcastAdDesignData): number | undefined => {
      const ov = durationOverrideMap[design.id];
      if (!ov || ov.mode === 'saved') return undefined;
      if (ov.mode === 'custom') {
        const parsed = Math.max(0, Math.min(3600, Math.round(Number(ov.customSec) || 0)));
        return parsed;
      }
      return ov.mode;
    },
    [durationOverrideMap]
  );

  const handleShowLive = async (design: BroadcastAdDesignData) => {
    try {
      setBusyAction(`show:${design.id}`);
      const overrideDuration = resolveDurationForShow(design);
      const res = await broadcastGraphicsService.showSavedLive(matchId, design.id, {
        durationSecondsOverride: overrideDuration,
        overlapPolicy: graphicsState?.overlapPolicy,
      });
      onGraphicsStateChange(res.graphicsState);
      await onRefreshDesigns();
      const durText =
        (overrideDuration ?? design.defaultDurationSeconds) === 0
          ? 'Permanent until hidden'
          : `${overrideDuration ?? design.defaultDurationSeconds}s`;
      onNotifySuccess(`"${design.name}" is now LIVE on OBS Broadcast (${durText}).`);
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to push advertisement live.'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleHideSlot = async (instanceId?: string) => {
    try {
      setBusyAction(instanceId ? `hide:${instanceId}` : 'hide:all');
      const next = await broadcastGraphicsService.hideLive(matchId, instanceId);
      onGraphicsStateChange(next);
      onNotifySuccess('Graphic hidden from live broadcast.');
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to hide graphic.'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearLive = async () => {
    try {
      setBusyAction('clear');
      const next = await broadcastGraphicsService.clearLive(matchId);
      onGraphicsStateChange(next);
      onNotifySuccess('Cleared all live broadcast graphics.');
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to clear live graphics.'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleTogglePauseAnimations = async () => {
    try {
      setBusyAction('pause');
      const next = await broadcastGraphicsService.pauseAnimations(
        matchId,
        !graphicsState?.animationsPaused
      );
      onGraphicsStateChange(next);
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to toggle animation pause.'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleOverlapPolicyChange = async (policy: GraphicsOverlapPolicy) => {
    try {
      setBusyAction('policy');
      const next = await broadcastGraphicsService.updateSettings(matchId, {
        overlapPolicy: policy,
      });
      onGraphicsStateChange(next);
      onNotifySuccess(
        policy === 'stack'
          ? 'Overlap mode set to Stack Multiple (show several ads simultaneously).'
          : 'Overlap mode set to Replace Previous (one active ad at a time).'
      );
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to update overlap policy.'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleDuplicate = async (design: BroadcastAdDesignData) => {
    try {
      setBusyAction(`dup:${design.id}`);
      await broadcastGraphicsService.duplicateDesign(design.id, `${design.name} (Copy)`);
      await onRefreshDesigns();
      onNotifySuccess(`Duplicated "${design.name}".`);
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to duplicate design.'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveDefaultDuration = async (design: BroadcastAdDesignData) => {
    const secs = Math.max(0, Math.min(3600, Math.round(Number(editingDurationVal) || 0)));
    try {
      setBusyAction(`dur:${design.id}`);
      await broadcastGraphicsService.updateDesign(design.id, {
        defaultDurationSeconds: secs,
      });
      setEditingDurationId(null);
      await onRefreshDesigns();
      onNotifySuccess(`Default duration for "${design.name}" saved as ${secs === 0 ? 'Permanent' : `${secs}s`}.`);
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to save default duration.'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await broadcastGraphicsService.deleteDesign(deleteTarget.id);
      setDeleteTarget(null);
      await onRefreshDesigns();
      onNotifySuccess(`Deleted "${deleteTarget.name}".`);
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to delete saved graphic.'));
    } finally {
      setDeleting(false);
    }
  };

  // Queue handlers
  const handleAddToQueue = async (design: BroadcastAdDesignData) => {
    const nextItem: BroadcastAdQueueItem = {
      queueItemId: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      designId: design.id,
      name: design.name,
      designType: design.designType,
      thumbnailDataUrl: design.thumbnailDataUrl || '',
      durationSeconds: design.defaultDurationSeconds > 0 ? design.defaultDurationSeconds : 10,
      delayAfterSeconds: 3,
      entryAnimation: design.entryAnimation,
      exitAnimation: design.exitAnimation,
    };
    const nextQueue = [...(graphicsState?.queue || []), nextItem];
    try {
      setBusyAction('queue:update');
      const nextState = await broadcastGraphicsService.updateQueue(matchId, {
        queue: nextQueue,
        queueAutoAdvance: graphicsState?.queueAutoAdvance ?? true,
      });
      onGraphicsStateChange(nextState);
      onNotifySuccess(`Added "${design.name}" to Broadcast Ad Queue.`);
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to add item to queue.'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleUpdateQueueItem = async (
    idx: number,
    patch: Partial<BroadcastAdQueueItem>
  ) => {
    const queue = [...(graphicsState?.queue || [])];
    if (!queue[idx]) return;
    queue[idx] = { ...queue[idx], ...patch };
    try {
      const nextState = await broadcastGraphicsService.updateQueue(matchId, {
        queue,
        queueAutoAdvance: graphicsState?.queueAutoAdvance ?? true,
      });
      onGraphicsStateChange(nextState);
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to update queue item.'));
    }
  };

  const handleMoveQueueItem = async (idx: number, dir: -1 | 1) => {
    const queue = [...(graphicsState?.queue || [])];
    const target = idx + dir;
    if (target < 0 || target >= queue.length) return;
    const [item] = queue.splice(idx, 1);
    queue.splice(target, 0, item);
    try {
      const nextState = await broadcastGraphicsService.updateQueue(matchId, {
        queue,
        queueAutoAdvance: graphicsState?.queueAutoAdvance ?? true,
      });
      onGraphicsStateChange(nextState);
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to reorder queue.'));
    }
  };

  const handleRemoveQueueItem = async (idx: number) => {
    const queue = [...(graphicsState?.queue || [])];
    queue.splice(idx, 1);
    try {
      const nextState = await broadcastGraphicsService.updateQueue(matchId, {
        queue,
        queueAutoAdvance: graphicsState?.queueAutoAdvance ?? true,
      });
      onGraphicsStateChange(nextState);
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to remove queue item.'));
    }
  };

  const handleControlQueue = async (action: 'start' | 'play_next' | 'pause' | 'stop') => {
    try {
      setBusyAction(`queue:${action}`);
      const nextState = await broadcastGraphicsService.controlQueue(matchId, action);
      onGraphicsStateChange(nextState);
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to control ad queue.'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveEventRules = async () => {
    try {
      setBusyAction('rules:save');
      const nextState = await broadcastGraphicsService.updateSettings(matchId, {
        eventRules: rulesDraft,
      });
      setRulesDirty(false);
      onGraphicsStateChange(nextState);
      onNotifySuccess('Event-triggered sponsor rules saved.');
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to save event rules.'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleTestTrigger = async (trigger: BroadcastGraphicEventTrigger) => {
    try {
      setBusyAction(`trigger:${trigger}`);
      const res = await broadcastGraphicsService.testEventTrigger(matchId, trigger);
      onGraphicsStateChange(res.graphicsState);
      if (res.triggered) {
        onNotifySuccess(`Triggered sponsor graphic for ${trigger}.`);
      } else {
        onNotifyError(
          `No enabled rule with a valid Saved Ad assigned for ${trigger} (save rules first).`
        );
      }
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to test event trigger.'));
    } finally {
      setBusyAction(null);
    }
  };

  const previewSlot: ActiveBroadcastGraphicSlot[] = useMemo(() => {
    if (!previewDesign) return [];
    return [
      {
        instanceId: `preview_${previewDesign.id}`,
        designId: previewDesign.id,
        name: previewDesign.name,
        canvasWidth: previewDesign.canvasWidth || 1920,
        canvasHeight: previewDesign.canvasHeight || 1080,
        elements: previewDesign.elements,
        entryAnimation: previewDesign.entryAnimation,
        exitAnimation: previewDesign.exitAnimation,
        durationSeconds: 0,
        startedAt: new Date().toISOString(),
        visible: true,
        triggerSource: 'saved_ad',
      },
    ];
  }, [previewDesign]);

  return (
    <div className="space-y-4">
      {/* LIVE ACTIVE SLOTS MONITOR STRIP */}
      <section className="rounded-xl border border-slate-800 bg-[#0b1120] text-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                activeSlots.length > 0 ? 'bg-red-500 animate-pulse' : 'bg-slate-600'
              }`}
            />
            <div className="min-w-0">
              <h3 className="font-display text-sm font-bold tracking-wide uppercase flex items-center gap-2">
                <span>Live Broadcast Graphics Output</span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] font-mono text-slate-200 tabular-nums">
                  {activeSlots.length} Active
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Pushed instantaneously to OBS Browser Source via Socket.IO — never reloads YouTube Live.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-[11px]">
              <button
                type="button"
                disabled={busyAction === 'policy'}
                onClick={() => handleOverlapPolicyChange('replace')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  (graphicsState?.overlapPolicy || 'replace') === 'replace'
                    ? 'bg-[#EA580C] text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Replace Active
              </button>
              <button
                type="button"
                disabled={busyAction === 'policy'}
                onClick={() => handleOverlapPolicyChange('stack')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  graphicsState?.overlapPolicy === 'stack'
                    ? 'bg-[#EA580C] text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Stack Multiple
              </button>
            </div>

            {activeSlots.length > 0 && (
              <>
                <button
                  type="button"
                  disabled={busyAction === 'pause'}
                  onClick={handleTogglePauseAnimations}
                  className="min-h-[32px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-100"
                >
                  {graphicsState?.animationsPaused ? (
                    <>
                      <Play className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Resume Motion</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5 text-amber-400" />
                      <span>Pause Motion</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={busyAction === 'clear'}
                  onClick={handleClearLive}
                  className="min-h-[32px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-bold text-white"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Clear Live</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onOpenStudioNew}
              className="min-h-[32px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-xs font-bold text-white shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>New Graphic / Open Studio</span>
            </button>
          </div>
        </div>

        {activeSlots.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {activeSlots.map((slot) => {
              const countdown = formatSlotRemainingLabel(
                slot.durationSeconds,
                slot.expiresAt,
                slot.pausedRemainingMs,
                nowMs
              );
              return (
                <div
                  key={slot.instanceId}
                  className="flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg border border-emerald-500/40 bg-slate-900/90"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-red-600 text-[10px] font-bold uppercase tracking-wider text-white">
                        LIVE
                      </span>
                      <p className="text-xs font-bold text-white truncate">{slot.name}</p>
                    </div>
                    <p className="text-[11px] font-mono text-emerald-300 tabular-nums mt-0.5">
                      {countdown}
                      {slot.triggerSource === 'event' && slot.triggerEventType
                        ? ` · ${slot.triggerEventType}`
                        : slot.triggerSource === 'queue'
                          ? ' · Queue'
                          : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyAction === `hide:${slot.instanceId}`}
                    onClick={() => handleHideSlot(slot.instanceId)}
                    className="min-h-[30px] px-2.5 py-1 rounded bg-slate-800 hover:bg-red-600 border border-slate-700 text-[11px] font-semibold text-white transition-colors shrink-0"
                  >
                    Hide Live
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-slate-400 border border-dashed border-slate-800 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
            <span>
              No promotional graphic is currently live on OBS. Click <strong className="text-white">SHOW LIVE</strong> on any Saved Ad below to broadcast immediately.
            </span>
          </div>
        )}
      </section>

      {/* SAVED ADVERTISEMENTS LIBRARY */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#EA580C]" />
              <span>Saved Advertisements &amp; Promotional Graphics ({savedAdsOnly.length})</span>
            </h3>
            <p className="text-xs text-slate-500">
              One-click Show Live anytime during the match with optional temporary duration override.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search saved ads..."
                className="min-h-[34px] pl-8 pr-3 text-xs border border-slate-300 rounded-lg bg-white w-44"
              />
            </div>

            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as 'all' | GraphicsScope)}
              className="min-h-[34px] px-2.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white"
            >
              <option value="all">All Scopes</option>
              <option value="match">This Match</option>
              <option value="tournament">Tournament</option>
              <option value="global">Global</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | GraphicsDesignType)}
              className="min-h-[34px] px-2.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white"
            >
              <option value="all">All Types</option>
              <option value="banner">Banner</option>
              <option value="lower_third">Lower Third</option>
              <option value="logo">Sponsor Logo</option>
              <option value="qr">QR Code</option>
              <option value="side_ad">Side Ad</option>
              <option value="full_banner">Full Width Bar</option>
              <option value="event_promo">Event Promo</option>
              <option value="custom">Custom</option>
            </select>

            <button
              type="button"
              onClick={() => onRefreshDesigns()}
              disabled={loadingDesigns}
              className="min-h-[34px] inline-flex items-center gap-1 px-2.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingDesigns ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {savedAdsOnly.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center space-y-2.5">
            <Film className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-bold text-slate-900">No Saved Advertisements Yet</p>
            <p className="text-xs text-slate-600 max-w-md mx-auto">
              Create your first sponsor banner, QR offer card, corner watermark logo, or lower third in the Live Graphics Studio and save it here for instant one-click reuse.
            </p>
            <button
              type="button"
              onClick={onOpenStudioNew}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-xs font-bold text-white"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Graphic</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {savedAdsOnly.map((design) => {
              const liveSlot = activeSlots.find((s) => s.designId === design.id && s.visible);
              const overrideState = durationOverrideMap[design.id] || {
                mode: 'saved',
                customSec: String(design.defaultDurationSeconds || 10),
              };
              const isShowing = busyAction === `show:${design.id}`;

              return (
                <article
                  key={design.id}
                  className={`rounded-xl border p-3 space-y-2.5 transition-colors ${
                    liveSlot
                      ? 'border-emerald-500 bg-emerald-50/40'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  {/* Thumbnail Header */}
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-950 border border-slate-800">
                    {design.thumbnailDataUrl ? (
                      <img
                        src={design.thumbnailDataUrl}
                        alt={design.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 px-3 text-center">
                        <Layers className="w-6 h-6 mb-1 text-slate-500" />
                        <span className="text-[11px] font-semibold text-slate-300 truncate max-w-full">
                          {design.elements.length} element{design.elements.length === 1 ? '' : 's'}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {summarizeAdPosition(
                            design.elements,
                            design.canvasWidth,
                            design.canvasHeight
                          )}
                        </span>
                      </div>
                    )}

                    <div className="absolute top-2 left-2 flex items-center gap-1">
                      <span className="px-1.5 py-0.5 rounded bg-slate-950/85 border border-slate-700 text-[10px] font-semibold uppercase text-slate-200">
                        {design.scope}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-950/85 border border-slate-700 text-[10px] font-mono text-slate-300">
                        {design.canvasWidth}×{design.canvasHeight}
                      </span>
                    </div>

                    {liveSlot && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold uppercase shadow">
                        <Radio className="w-3 h-3 animate-pulse" />
                        <span>
                          LIVE ·{' '}
                          {formatSlotRemainingLabel(
                            liveSlot.durationSeconds,
                            liveSlot.expiresAt,
                            liveSlot.pausedRemainingMs,
                            nowMs
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-slate-900 truncate" title={design.name}>
                        {design.name}
                      </h4>
                      <p className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                        <span className="capitalize">{design.designType.replace('_', ' ')}</span>
                        <span>·</span>
                        <span className="tabular-nums">Used {design.usageCount || 0}×</span>
                        <span>·</span>
                        <span className="font-mono text-slate-700 tabular-nums">
                          {design.defaultDurationSeconds === 0
                            ? 'Permanent'
                            : `${design.defaultDurationSeconds}s`}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Duration Override + Default Duration inline editor */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <select
                      aria-label={`Duration override for ${design.name}`}
                      value={String(overrideState.mode)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const mode =
                          raw === 'saved'
                            ? 'saved'
                            : raw === 'custom'
                              ? 'custom'
                              : Number(raw);
                        setDurationOverrideMap((prev) => ({
                          ...prev,
                          [design.id]: {
                            mode,
                            customSec: overrideState.customSec,
                          },
                        }));
                      }}
                      className="flex-1 min-w-[120px] min-h-[30px] px-2 text-[11px] font-semibold border border-slate-300 rounded-md bg-slate-50"
                    >
                      <option value="saved">
                        Saved ({design.defaultDurationSeconds === 0 ? 'Permanent' : `${design.defaultDurationSeconds}s`})
                      </option>
                      {GRAPHICS_DURATION_PRESETS.map((p) => (
                        <option key={p.seconds} value={String(p.seconds)}>
                          Override: {p.label}
                        </option>
                      ))}
                      <option value="custom">Custom Seconds...</option>
                    </select>

                    {overrideState.mode === 'custom' && (
                      <input
                        type="number"
                        min={0}
                        max={3600}
                        value={overrideState.customSec}
                        onChange={(e) =>
                          setDurationOverrideMap((prev) => ({
                            ...prev,
                            [design.id]: {
                              mode: 'custom',
                              customSec: e.target.value,
                            },
                          }))
                        }
                        className="w-16 min-h-[30px] px-2 text-xs font-mono border border-slate-300 rounded-md"
                        placeholder="sec"
                      />
                    )}

                    {editingDurationId === design.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={3600}
                          value={editingDurationVal}
                          onChange={(e) => setEditingDurationVal(e.target.value)}
                          className="w-14 min-h-[28px] px-1.5 text-[11px] font-mono border border-slate-300 rounded"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveDefaultDuration(design)}
                          className="px-2 py-1 text-[10px] font-bold bg-slate-900 text-white rounded"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDurationId(design.id);
                          setEditingDurationVal(String(design.defaultDurationSeconds || 0));
                        }}
                        title="Edit saved default duration (0 = Permanent)"
                        className="px-2 py-1 text-[10px] font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded bg-white"
                      >
                        Set Default
                      </button>
                    )}
                  </div>

                  {/* Primary & Secondary Actions */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
                    {liveSlot ? (
                      <button
                        type="button"
                        disabled={busyAction === `hide:${liveSlot.instanceId}`}
                        onClick={() => handleHideSlot(liveSlot.instanceId)}
                        className="flex-1 min-h-[34px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-bold text-white"
                      >
                        <Square className="w-3 h-3" />
                        <span>HIDE LIVE</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isShowing}
                        onClick={() => handleShowLive(design)}
                        className="flex-1 min-h-[34px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-xs font-bold text-white disabled:opacity-50"
                      >
                        <Radio className="w-3.5 h-3.5" />
                        <span>{isShowing ? 'Pushing...' : 'SHOW LIVE'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setPreviewDesign(design)}
                      title="Preview over simulated 16:9 stage"
                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenStudioEdit(design)}
                      title="Edit design in Live Graphics Studio"
                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={busyAction === `dup:${design.id}`}
                      onClick={() => handleDuplicate(design)}
                      title="Duplicate saved ad"
                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={busyAction === 'queue:update'}
                      onClick={() => handleAddToQueue(design)}
                      title="Add to Ad Playback Queue"
                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-[11px] font-semibold"
                    >
                      +Q
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(design)}
                      title="Delete saved ad"
                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* AD PLAYBACK QUEUE */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => setQueueOpen((v) => !v)}
          className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2">
            <ListVideo className="w-4 h-4 text-[#EA580C]" />
            <span className="font-display text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
              Broadcast Ad Playback Queue ({graphicsState?.queue?.length || 0})
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                graphicsState?.queueStatus === 'playing'
                  ? 'bg-emerald-100 text-emerald-800'
                  : graphicsState?.queueStatus === 'paused'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-200 text-slate-700'
              }`}
            >
              {graphicsState?.queueStatus || 'idle'}
            </span>
          </div>
          {queueOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>

        {queueOpen && (
          <div className="p-4 border-t border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={queueAddDesignId}
                  onChange={(e) => setQueueAddDesignId(e.target.value)}
                  className="min-h-[34px] px-2.5 text-xs border border-slate-300 rounded-lg bg-white min-w-[200px]"
                >
                  <option value="">Select Saved Ad to enqueue...</option>
                  {designs
                    .filter((d) => !d.isTemplate)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.defaultDurationSeconds === 0 ? 'Perm' : `${d.defaultDurationSeconds}s`})
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={!queueAddDesignId || busyAction === 'queue:update'}
                  onClick={() => {
                    const found = designs.find((d) => d.id === queueAddDesignId);
                    if (found) {
                      handleAddToQueue(found);
                      setQueueAddDesignId('');
                    }
                  }}
                  className="min-h-[34px] inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add to Queue</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={!graphicsState?.queue?.length || busyAction === 'queue:start'}
                  onClick={() => handleControlQueue('start')}
                  className="min-h-[32px] inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-40"
                >
                  <Play className="w-3 h-3" />
                  <span>Start Queue</span>
                </button>
                <button
                  type="button"
                  disabled={!graphicsState?.queue?.length || busyAction === 'queue:play_next'}
                  onClick={() => handleControlQueue('play_next')}
                  className="min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  <span>Next</span>
                </button>
                <button
                  type="button"
                  disabled={graphicsState?.queueStatus !== 'playing'}
                  onClick={() => handleControlQueue('pause')}
                  className="min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </button>
                <button
                  type="button"
                  disabled={graphicsState?.queueStatus === 'idle'}
                  onClick={() => handleControlQueue('stop')}
                  className="min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-40"
                >
                  <Square className="w-3 h-3" />
                  <span>Stop</span>
                </button>
              </div>
            </div>

            {!graphicsState?.queue?.length ? (
              <p className="text-xs text-slate-500">
                Queue is empty. Add saved sponsor graphics above to rotate ads automatically during breaks or live play.
              </p>
            ) : (
              <div className="space-y-2">
                {graphicsState.queue.map((item, idx) => {
                  const isCurrent =
                    graphicsState.queueStatus === 'playing' &&
                    graphicsState.currentQueueIndex === idx;
                  return (
                    <div
                      key={item.queueItemId}
                      className={`flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border text-xs ${
                        isCurrent
                          ? 'border-emerald-500 bg-emerald-50/50'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-md bg-slate-900 text-white font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">{item.name}</p>
                          <p className="text-[11px] text-slate-500 capitalize">
                            {item.designType.replace('_', ' ')}
                            {isCurrent ? ' · Playing Now' : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                          <span>Show (s):</span>
                          <input
                            type="number"
                            min={1}
                            max={600}
                            value={item.durationSeconds}
                            onChange={(e) =>
                              handleUpdateQueueItem(idx, {
                                durationSeconds: Math.max(1, Number(e.target.value) || 10),
                              })
                            }
                            className="w-14 min-h-[28px] px-1.5 font-mono border border-slate-300 rounded bg-white"
                          />
                        </label>
                        <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                          <span>Gap (s):</span>
                          <input
                            type="number"
                            min={0}
                            max={600}
                            value={item.delayAfterSeconds}
                            onChange={(e) =>
                              handleUpdateQueueItem(idx, {
                                delayAfterSeconds: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="w-14 min-h-[28px] px-1.5 font-mono border border-slate-300 rounded bg-white"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveQueueItem(idx, -1)}
                          className="p-1.5 rounded border border-slate-200 bg-white disabled:opacity-35"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === graphicsState.queue.length - 1}
                          onClick={() => handleMoveQueueItem(idx, 1)}
                          className="p-1.5 rounded border border-slate-200 bg-white disabled:opacity-35"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveQueueItem(idx)}
                          className="p-1.5 rounded border border-slate-200 bg-white text-slate-500 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* EVENT-TRIGGERED SPONSOR RULES */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => setRulesOpen((v) => !v)}
          className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-[#EA580C]" />
            <span className="font-display text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
              Event-Triggered Sponsor Automation ({rulesDraft.filter((r) => r.enabled).length} Enabled)
            </span>
          </div>
          {rulesOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>

        {rulesOpen && (
          <div className="p-4 border-t border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-600">
                Automatically show a Saved Ad on live match events (4, 6, Wicket, Timeout, Half-Time, All Out, Super Tackle). Cooldowns &amp; de-duplication prevent spam.
              </p>
              <button
                type="button"
                disabled={!rulesDirty || busyAction === 'rules:save'}
                onClick={handleSaveEventRules}
                className="min-h-[34px] px-4 py-1.5 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-xs font-bold text-white disabled:opacity-45"
              >
                {busyAction === 'rules:save' ? 'Saving...' : 'Save Event Rules'}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="py-2 pr-2">On</th>
                    <th className="py-2 pr-3">Event Trigger</th>
                    <th className="py-2 pr-3">Assigned Saved Ad</th>
                    <th className="py-2 pr-3">Duration (s)</th>
                    <th className="py-2 pr-3">Cooldown (s)</th>
                    <th className="py-2 text-right">Test</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {BROADCAST_EVENT_TRIGGERS.map((meta, idx) => {
                    const rule = rulesDraft[idx] || {
                      trigger: meta.trigger,
                      enabled: false,
                      designId: '',
                      designName: '',
                      durationSeconds: 10,
                      cooldownSeconds: meta.defaultCooldown,
                    };
                    const updateRule = (patch: Partial<BroadcastGraphicEventRule>) => {
                      setRulesDirty(true);
                      setRulesDraft((prev) =>
                        prev.map((r) => (r.trigger === meta.trigger ? { ...r, ...patch } : r))
                      );
                    };

                    return (
                      <tr key={meta.trigger}>
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={(e) => updateRule({ enabled: e.target.checked })}
                            className="w-4 h-4 rounded border-slate-300 text-[#EA580C]"
                          />
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <p className="font-bold text-slate-900">{meta.label}</p>
                          <p className="text-[10px] font-mono text-slate-500">{meta.sportHint}</p>
                        </td>
                        <td className="py-2 pr-3">
                          <select
                            value={rule.designId}
                            onChange={(e) => {
                              const selected = designs.find((d) => d.id === e.target.value);
                              updateRule({
                                designId: e.target.value,
                                designName: selected?.name || '',
                              });
                            }}
                            className="min-h-[32px] px-2 text-xs border border-slate-300 rounded-md bg-white w-52"
                          >
                            <option value="">-- Select Saved Ad --</option>
                            {designs
                              .filter((d) => !d.isTemplate)
                              .map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                          </select>
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="number"
                            min={1}
                            max={600}
                            value={rule.durationSeconds}
                            onChange={(e) =>
                              updateRule({
                                durationSeconds: Math.max(1, Number(e.target.value) || 10),
                              })
                            }
                            className="w-16 min-h-[30px] px-2 font-mono border border-slate-300 rounded"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="number"
                            min={0}
                            max={3600}
                            value={rule.cooldownSeconds}
                            onChange={(e) =>
                              updateRule({
                                cooldownSeconds: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="w-16 min-h-[30px] px-2 font-mono border border-slate-300 rounded"
                          />
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            disabled={!rule.designId || busyAction === `trigger:${meta.trigger}`}
                            onClick={() => handleTestTrigger(meta.trigger)}
                            className="min-h-[28px] inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                          >
                            <Zap className="w-3 h-3 text-[#EA580C]" />
                            <span>Test</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Lightweight Live Simulation Preview Modal */}
      <Modal
        open={Boolean(previewDesign)}
        onClose={() => setPreviewDesign(null)}
        title={`Live Broadcast Preview · ${previewDesign?.name || ''}`}
        subtitle="16:9 transparent overlay preview rendered with the exact OBS Browser Source renderer."
        maxWidthClass="max-w-4xl"
      >
        {previewDesign && (
          <div className="space-y-4">
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 border border-slate-700">
              {/* Simulated Turf Backdrop */}
              <div
                className="absolute inset-0 opacity-35"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 50% 45%, rgba(16,185,129,0.45), transparent 65%)',
                }}
              />
              <ScaledGraphicsPreviewFrame
                canvasWidth={previewDesign.canvasWidth || 1920}
                canvasHeight={previewDesign.canvasHeight || 1080}
                className="w-full h-full"
              >
                <ObsGraphicsLayer
                  activeSlotsOverride={previewSlot}
                  canvasWidth={previewDesign.canvasWidth || 1920}
                  canvasHeight={previewDesign.canvasHeight || 1080}
                  matchId={matchId}
                  tournamentId={tournamentId}
                />
              </ScaledGraphicsPreviewFrame>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPreviewDesign(null)}
                className="min-h-[36px] px-4 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = previewDesign;
                  setPreviewDesign(null);
                  onOpenStudioEdit(target);
                }}
                className="min-h-[36px] inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-slate-100 hover:bg-slate-200"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit in Studio</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = previewDesign;
                  setPreviewDesign(null);
                  handleShowLive(target);
                }}
                className="min-h-[36px] inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-[#EA580C] hover:bg-orange-600 rounded-lg"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>SHOW LIVE NOW</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete "${deleteTarget?.name || 'Saved Graphic'}"?`}
        message="This permanently removes the saved advertisement from your library. Any active live broadcast slots remain unaffected until cleared."
        confirmLabel="Delete Graphic"
        variant="danger"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
};
