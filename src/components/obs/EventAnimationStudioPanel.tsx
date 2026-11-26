import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Box,
  Check,
  Copy,
  Crosshair,
  Download,
  Eye,
  Flame,
  Palette,
  Pin,
  PinOff,
  Play,
  Radio,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
  Type,
  Upload,
} from 'lucide-react';
import {
  applyStyleOptionToRule,
  BROADCAST_EVENT_KEYS,
  BROADCAST_EVENT_META,
  BroadcastEventKey,
  BroadcastEventTriggerPayload,
  createDefaultEventRule,
  DEFAULT_EVENT_ANIMATIONS,
  EVENT_ANIMATION_BOUNDS,
  EVENT_ANIMATION_PRESETS,
  EVENT_ENTRY_TRANSITIONS,
  EVENT_EXIT_TRANSITIONS,
  EVENT_IDLE_ANIMATIONS,
  EVENT_PATTERN_STYLES,
  EVENT_POSITION_PRESETS,
  EventAnimationConfigMap,
  EventAnimationPositionPreset,
  EventAnimationRuleConfig,
  EventEntryTransition,
  EventExitTransition,
  EventIdleAnimation,
  EventPatternStyle,
  EventSportGroup,
  getEventPositionPresetCoords,
  loadGlobalEventAnimationDefaults,
  normalizeEventAnimationsConfig,
  resolveEventStyleOption,
  saveGlobalEventAnimationDefaults,
} from '../../utils/eventAnimations.ts';

type InspectorTab = 'motion' | 'typography' | 'colors' | 'layout';

interface EventAnimationStudioPanelProps {
  streamId: string;
  sportType?: string;
  teamAName?: string;
  teamBName?: string;
  teamColorOverride?: string;
  eventAnimations: EventAnimationConfigMap;
  hasUnsavedChanges: boolean;
  saving: boolean;
  selectedEventKey: BroadcastEventKey;
  onSelectEventKey: (key: BroadcastEventKey) => void;
  stagePickActive: boolean;
  onToggleStagePick: (active: boolean) => void;
  pinPreview: boolean;
  onTogglePinPreview: (pinned: boolean) => void;
  onLocalConfigChange: (nextMap: EventAnimationConfigMap) => void;
  onDiscardUnsaved: () => void;
  onSaveEventAnimations: (nextMap: EventAnimationConfigMap, notice?: string) => Promise<void>;
  onPreviewOnStage: (
    payload: BroadcastEventTriggerPayload,
    nextMap?: EventAnimationConfigMap,
    options?: { replayEntry?: boolean; sticky?: boolean; durationMsOverride?: number }
  ) => void;
  onTriggerLiveBroadcast: (payload: {
    eventKey: BroadcastEventKey;
    styleId?: string;
    teamSide?: 'A' | 'B';
    teamName?: string;
    teamColor?: string;
    subtitle?: string;
  }) => Promise<void>;
}

const SPORT_FILTERS: readonly ('All' | EventSportGroup)[] = [
  'All',
  'Kabaddi',
  'Cricket',
  'Football',
  'Volleyball',
];

function inferDefaultFilterFromSport(sport?: string): 'All' | EventSportGroup {
  const s = String(sport || '').toLowerCase();
  if (s.includes('kabaddi')) return 'Kabaddi';
  if (s.includes('cricket')) return 'Cricket';
  if (s.includes('football') || s.includes('soccer')) return 'Football';
  if (s.includes('volley') || s.includes('badminton') || s.includes('tennis')) return 'Volleyball';
  return 'All';
}

export function EventAnimationStudioPanel({
  streamId,
  sportType,
  teamAName,
  teamColorOverride,
  eventAnimations,
  hasUnsavedChanges,
  saving,
  selectedEventKey,
  onSelectEventKey,
  stagePickActive,
  onToggleStagePick,
  pinPreview,
  onTogglePinPreview,
  onLocalConfigChange,
  onDiscardUnsaved,
  onSaveEventAnimations,
  onPreviewOnStage,
  onTriggerLiveBroadcast,
}: EventAnimationStudioPanelProps) {
  const [sportFilter, setSportFilter] = useState<'All' | EventSportGroup>(() =>
    inferDefaultFilterFromSport(sportType)
  );
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('motion');
  const [autoPreviewOnEdit, setAutoPreviewOnEdit] = useState<boolean>(true);
  const [triggeringLive, setTriggeringLive] = useState<boolean>(false);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);

  const normalizedMap = useMemo(
    () => normalizeEventAnimationsConfig(eventAnimations),
    [eventAnimations]
  );

  const visibleEventKeys = useMemo(() => {
    if (sportFilter === 'All') return BROADCAST_EVENT_KEYS;
    return BROADCAST_EVENT_KEYS.filter(
      (k) => BROADCAST_EVENT_META[k].sport === sportFilter
    );
  }, [sportFilter]);

  const activeRule = normalizedMap[selectedEventKey];
  const activeMeta = BROADCAST_EVENT_META[selectedEventKey];
  const activePresets = EVENT_ANIMATION_PRESETS[selectedEventKey];
  const activeStyle = resolveEventStyleOption(selectedEventKey, activeRule.styleId);

  const buildSamplePayload = (
    key: BroadcastEventKey,
    ruleForPayload?: EventAnimationRuleConfig
  ): BroadcastEventTriggerPayload => {
    const meta = BROADCAST_EVENT_META[key];
    const r = ruleForPayload || normalizedMap[key];
    return {
      streamId,
      eventId: `preview-${key}-${Date.now()}`,
      eventKey: key,
      sportType: meta.sport,
      teamSide: 'A',
      teamName: teamAName || 'HOME SQUAD',
      teamColor: teamColorOverride || '#EA580C',
      subtitle: (r.customSubtitle || '').trim() || meta.defaultSubtitle,
      pointsLabel: (r.customBadgeText || '').trim() || meta.badge,
      triggeredAtIso: new Date().toISOString(),
      manualOverride: true,
      previewStyleId: r.styleId,
    };
  };

  const patchActiveRule = (
    partial: Partial<EventAnimationRuleConfig>,
    previewOpts?: {
      forcePreview?: boolean;
      replayEntry?: boolean;
      stickyOverride?: boolean;
      durationMsOverride?: number;
    }
  ) => {
    const nextRule: EventAnimationRuleConfig = {
      ...activeRule,
      ...partial,
    };
    const nextMap: EventAnimationConfigMap = {
      ...normalizedMap,
      [selectedEventKey]: nextRule,
    };
    onLocalConfigChange(nextMap);

    const shouldPreview = previewOpts?.forcePreview ?? autoPreviewOnEdit;
    if (shouldPreview) {
      onPreviewOnStage(buildSamplePayload(selectedEventKey, nextRule), nextMap, {
        replayEntry: previewOpts?.replayEntry ?? false,
        sticky: previewOpts?.stickyOverride ?? pinPreview,
        durationMsOverride: previewOpts?.durationMsOverride,
      });
    }
  };

  const handleSelectEventWithAutoPreview = (key: BroadcastEventKey) => {
    onSelectEventKey(key);
    if (autoPreviewOnEdit) {
      const targetRule = normalizedMap[key];
      onPreviewOnStage(buildSamplePayload(key, targetRule), normalizedMap, {
        replayEntry: true,
        sticky: pinPreview,
      });
    }
  };

  const handleApplyPresetOption = (styleId: string) => {
    const nextRule = applyStyleOptionToRule(activeRule, selectedEventKey, styleId);
    const nextMap: EventAnimationConfigMap = {
      ...normalizedMap,
      [selectedEventKey]: nextRule,
    };
    onLocalConfigChange(nextMap);
    if (autoPreviewOnEdit) {
      onPreviewOnStage(buildSamplePayload(selectedEventKey, nextRule), nextMap, {
        replayEntry: true,
        sticky: pinPreview,
      });
    }
  };

  const handleSelectPresetPosition = (preset: EventAnimationPositionPreset) => {
    if (preset === 'custom') {
      patchActiveRule({ positionPreset: 'custom' });
      return;
    }
    const coords = getEventPositionPresetCoords(preset);
    patchActiveRule({
      positionPreset: preset,
      xPct: coords.xPct,
      yPct: coords.yPct,
    });
  };

  const handleApplyVisualsToAllEvents = () => {
    const nextMap = { ...normalizedMap };
    for (const key of BROADCAST_EVENT_KEYS) {
      if (key === selectedEventKey) continue;
      nextMap[key] = {
        ...nextMap[key],
        primaryHex: activeRule.primaryHex,
        secondaryHex: activeRule.secondaryHex,
        accentHex: activeRule.accentHex,
        textColorHex: activeRule.textColorHex,
        badgeTextColorHex: activeRule.badgeTextColorHex,
        subtitleColorHex: activeRule.subtitleColorHex,
        borderColorHex: activeRule.borderColorHex,
        bgOpacity: activeRule.bgOpacity,
        logoSizePx: activeRule.logoSizePx,
        badgeTextSizePx: activeRule.badgeTextSizePx,
        teamTextSizePx: activeRule.teamTextSizePx,
        headlineTextSizePx: activeRule.headlineTextSizePx,
        subtitleTextSizePx: activeRule.subtitleTextSizePx,
        containerWidthPx: activeRule.containerWidthPx,
        containerPaddingX: activeRule.containerPaddingX,
        containerPaddingY: activeRule.containerPaddingY,
        containerRadiusPx: activeRule.containerRadiusPx,
        borderWidthPx: activeRule.borderWidthPx,
        entryTransition: activeRule.entryTransition,
        exitTransition: activeRule.exitTransition,
        idleAnimation: activeRule.idleAnimation,
        pattern: activeRule.pattern,
        showShockwaves: activeRule.showShockwaves,
        showSparks: activeRule.showSparks,
        showSheen: activeRule.showSheen,
        durationSeconds: activeRule.durationSeconds,
        scale: activeRule.scale,
      };
    }
    onLocalConfigChange(nextMap);
    setTemplateNotice(
      `Copied ${activeMeta.shortLabel} colors, sizes, container & transitions to all 11 events. Click Save to apply live!`
    );
    window.setTimeout(() => setTemplateNotice(null), 4000);
  };

  const handleSaveGlobalTemplate = () => {
    saveGlobalEventAnimationDefaults(normalizedMap);
    setTemplateNotice('Saved all 11 event rules as your Global Studio Preset.');
    window.setTimeout(() => setTemplateNotice(null), 3500);
  };

  const handleApplyGlobalTemplate = async () => {
    const loaded = loadGlobalEventAnimationDefaults();
    if (!loaded) {
      setTemplateNotice('No saved Global Studio Preset found in this browser yet.');
      window.setTimeout(() => setTemplateNotice(null), 3500);
      return;
    }
    onLocalConfigChange(loaded);
    await onSaveEventAnimations(loaded, 'Applied Global Studio Preset & saved to this match.');
  };

  const handleResetAllEvents = async () => {
    onLocalConfigChange(DEFAULT_EVENT_ANIMATIONS);
    await onSaveEventAnimations(
      DEFAULT_EVENT_ANIMATIONS,
      'Reset all 11 event animations to pro defaults.'
    );
  };

  const handleTriggerLive = async () => {
    setTriggeringLive(true);
    try {
      await onTriggerLiveBroadcast({
        eventKey: selectedEventKey,
        styleId: activeRule.styleId,
        teamSide: 'A',
        teamName: teamAName || 'HOME SQUAD',
        teamColor: teamColorOverride || '#EA580C',
        subtitle: (activeRule.customSubtitle || '').trim() || activeMeta.defaultSubtitle,
      });
    } finally {
      setTriggeringLive(false);
    }
  };

  return (
    <section
      id="event-animations-studio"
      className="rounded-xl border border-cyan-500/35 bg-slate-900/95 p-4 sm:p-5 space-y-4 shadow-[0_0_32px_rgba(6,182,212,0.08)]"
    >
      {/* Top Studio Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Flame className="w-4 h-4 text-cyan-400 shrink-0" />
            <h2 className="font-display text-sm sm:text-base font-extrabold uppercase tracking-wide text-white">
              Pro Match Event Animations Studio
            </h2>
            <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/35 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
              11 Events · Full Designer
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Customize logo size, every text line size, container box, colors, transitions, hold animations &amp; duration per event. Edits preview live on stage and stay safe until you click Save.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSaveGlobalTemplate}
            className="min-h-[32px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-950 border border-slate-700 text-slate-200 hover:border-cyan-400/50 hover:text-cyan-200"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Save Template</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleApplyGlobalTemplate}
            className="min-h-[32px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-950 border border-slate-700 text-slate-200 hover:border-emerald-400/50 hover:text-emerald-200"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span>Load Template</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleResetAllEvents}
            className="min-h-[32px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-950 border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All</span>
          </button>
        </div>
      </div>

      {/* Explicit Save / Discard Unsaved Bar (never auto-reverted by background polling) */}
      {hasUnsavedChanges && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-amber-400/50 bg-amber-500/10 text-amber-100">
          <div className="flex items-center gap-2 text-xs font-semibold min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">
              Unsaved style changes active in preview — click Save to push live to OBS &amp; viewers.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={saving}
              onClick={onDiscardUnsaved}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              Discard Changes
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                onSaveEventAnimations(
                  normalizedMap,
                  'Saved all Event Animation customizations to live broadcast!'
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_14px_rgba(16,185,129,0.4)]"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save All Changes'}</span>
            </button>
          </div>
        </div>
      )}

      {templateNotice && (
        <div className="px-3 py-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-xs font-medium text-cyan-200">
          {templateNotice}
        </div>
      )}

      {/* Sport Filter Tabs + Auto-Preview & Pin Toggles */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {SPORT_FILTERS.map((sf) => (
              <button
                key={sf}
                type="button"
                onClick={() => {
                  setSportFilter(sf);
                  if (sf !== 'All' && BROADCAST_EVENT_META[selectedEventKey].sport !== sf) {
                    const firstInSport = BROADCAST_EVENT_KEYS.find(
                      (k) => BROADCAST_EVENT_META[k].sport === sf
                    );
                    if (firstInSport) handleSelectEventWithAutoPreview(firstInSport);
                  }
                }}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition-colors ${
                  sportFilter === sf
                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/60 shadow-[0_0_12px_rgba(34,211,238,0.2)]'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {sf}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoPreviewOnEdit}
                onChange={(e) => setAutoPreviewOnEdit(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-600 text-cyan-500"
              />
              <span>Auto-Preview Every Edit</span>
            </label>

            <button
              type="button"
              onClick={() => {
                const nextPinned = !pinPreview;
                onTogglePinPreview(nextPinned);
                if (nextPinned) {
                  onPreviewOnStage(buildSamplePayload(selectedEventKey, activeRule), normalizedMap, {
                    replayEntry: true,
                    sticky: true,
                  });
                } else {
                  onPreviewOnStage(buildSamplePayload(selectedEventKey, activeRule), normalizedMap, {
                    replayEntry: false,
                    sticky: false,
                  });
                }
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                pinPreview
                  ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/60'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
              title="Keep animation pinned visible on Stage Preview while adjusting sliders & colors"
            >
              {pinPreview ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
              <span>{pinPreview ? 'Stage Pinned' : 'Pin on Stage'}</span>
            </button>
          </div>
        </div>

        {/* 11-Event Selector Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {visibleEventKeys.map((key) => {
            const meta = BROADCAST_EVENT_META[key];
            const rule = normalizedMap[key];
            const style = resolveEventStyleOption(key, rule.styleId);
            const selected = key === selectedEventKey;
            return (
              <div
                key={key}
                className={`rounded-xl border p-2.5 transition-all cursor-pointer ${
                  selected
                    ? 'border-cyan-400/80 bg-cyan-500/10 shadow-[0_0_18px_rgba(34,211,238,0.22)]'
                    : 'border-slate-800 bg-slate-950/90 hover:border-slate-700'
                }`}
                onClick={() => handleSelectEventWithAutoPreview(key)}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        style={{ background: rule.accentHex || style.accentHex }}
                        className="w-2 h-2 rounded-full shrink-0"
                      />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {meta.sport}
                      </span>
                    </div>
                    <p className="text-xs font-extrabold text-white truncate mt-0.5">
                      {meta.label}
                    </p>
                  </div>

                  <button
                    type="button"
                    title={`Replay timed ${meta.label} animation on Stage`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEventKey(key);
                      onPreviewOnStage(buildSamplePayload(key, rule), normalizedMap, {
                        replayEntry: true,
                        sticky: pinPreview,
                      });
                    }}
                    className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 flex items-center justify-center text-cyan-300 shrink-0"
                  >
                    <Play className="w-3 h-3 fill-current" />
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between gap-1 text-[10px] font-mono text-slate-400">
                  <span className="truncate">{style.name}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded font-bold shrink-0 ${
                      rule.enabled
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {rule.enabled ? `${rule.durationSeconds}s` : 'OFF'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Event Full Granular Inspector */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/85 p-4 space-y-4">
        {/* Selected Event Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              style={{
                background: `linear-gradient(135deg, ${activeRule.primaryHex}, ${activeRule.secondaryHex})`,
                borderColor: activeRule.borderColorHex,
              }}
              className="w-10 h-10 rounded-xl border-2 flex items-center justify-center shrink-0"
            >
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-display text-sm font-extrabold uppercase tracking-wide text-white truncate">
                  {activeMeta.label}
                </h3>
                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-bold uppercase text-slate-300">
                  {activeMeta.sport}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                {activeStyle.name} · Logo {activeRule.logoSizePx}px · Box {activeRule.containerWidthPx}px · Headline {activeRule.headlineTextSizePx}px · {activeRule.durationSeconds}s
              </p>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs font-bold text-white cursor-pointer">
            <input
              type="checkbox"
              checked={activeRule.enabled}
              onChange={(e) => patchActiveRule({ enabled: e.target.checked })}
              className="w-4 h-4 rounded border-slate-600 text-emerald-500"
            />
            <span>{activeRule.enabled ? 'Auto-Trigger ON' : 'Disabled'}</span>
          </label>
        </div>

        {/* Sub-Tabs for Clean, Zero-Clutter Full Customization */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
          {(
            [
              { id: 'motion', label: 'Presets & Motion', icon: Sparkles },
              { id: 'typography', label: 'Logo & Text Sizes', icon: Type },
              { id: 'colors', label: 'Colors & Container', icon: Palette },
              { id: 'layout', label: 'Position & Time', icon: Sliders },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = inspectorTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setInspectorTab(tab.id)}
                className={`min-h-[34px] inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  active
                    ? 'bg-gradient-to-r from-cyan-500/25 to-purple-500/25 text-cyan-200 border border-cyan-400/50 shadow-[0_0_12px_rgba(34,211,238,0.18)]'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: PRESETS, TRANSITIONS, IDLE ANIMATIONS & FX */}
        {inspectorTab === 'motion' && (
          <div className="space-y-4">
            {/* 10 Presets */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  10 Pro Presets for {activeMeta.label}
                </label>
                <span className="text-[10px] font-mono text-cyan-300">
                  Click any preset to apply &amp; preview
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 max-h-[250px] overflow-y-auto pr-1 sidebar-neon-scroll">
                {activePresets.map((opt) => {
                  const isSelected = activeRule.styleId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleApplyPresetOption(opt.id)}
                      className={`relative rounded-xl border p-2 text-left transition-all flex flex-col justify-between gap-1 ${
                        isSelected
                          ? 'border-cyan-400 bg-cyan-500/15 shadow-[0_0_16px_rgba(34,211,238,0.22)]'
                          : 'border-slate-800 bg-slate-900/90 hover:border-slate-600'
                      }`}
                    >
                      <div
                        style={{
                          background: `linear-gradient(120deg, ${opt.secondaryHex} 0%, ${opt.primaryHex} 65%, ${opt.accentHex} 100%)`,
                        }}
                        className="h-4 w-full rounded flex items-center justify-between px-1.5"
                      >
                        <span className="text-[9px] font-black text-white/95">#{opt.index}</span>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <p className="text-[11px] font-extrabold text-white leading-tight truncate">
                        {opt.name}
                      </p>
                      <p className="text-[10px] text-slate-400 leading-tight line-clamp-1">
                        {opt.tagline}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Entry / Exit / Idle / Pattern */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  Entry Transition (10 Options)
                </label>
                <select
                  value={activeRule.entryTransition}
                  onChange={(e) =>
                    patchActiveRule(
                      { entryTransition: e.target.value as EventEntryTransition },
                      { forcePreview: true, replayEntry: true }
                    )
                  }
                  className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-semibold text-white"
                >
                  {EVENT_ENTRY_TRANSITIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                    Exit Transition (10 Options)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      onPreviewOnStage(buildSamplePayload(selectedEventKey, activeRule), normalizedMap, {
                        replayEntry: true,
                        sticky: false,
                        durationMsOverride: 1500,
                      })
                    }
                    className="text-[10px] font-bold text-cyan-300 hover:underline"
                  >
                    Test Entry + Exit
                  </button>
                </div>
                <select
                  value={activeRule.exitTransition}
                  onChange={(e) =>
                    patchActiveRule(
                      { exitTransition: e.target.value as EventExitTransition },
                      {
                        forcePreview: true,
                        replayEntry: true,
                        stickyOverride: false,
                        durationMsOverride: 1500,
                      }
                    )
                  }
                  className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-semibold text-white"
                >
                  {EVENT_EXIT_TRANSITIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  Continuous Hold Animation (7 Options)
                </label>
                <select
                  value={activeRule.idleAnimation}
                  onChange={(e) =>
                    patchActiveRule({ idleAnimation: e.target.value as EventIdleAnimation })
                  }
                  className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-semibold text-white"
                >
                  {EVENT_IDLE_ANIMATIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  Backdrop Texture Pattern (10 Options)
                </label>
                <select
                  value={activeRule.pattern}
                  onChange={(e) =>
                    patchActiveRule({ pattern: e.target.value as EventPatternStyle })
                  }
                  className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-semibold text-white"
                >
                  {EVENT_PATTERN_STYLES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Particle & Light FX Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              {[
                { key: 'showShockwaves' as const, label: 'Shockwave Rings' },
                { key: 'showSparks' as const, label: 'Pyro Sparks & Embers' },
                { key: 'showSheen' as const, label: 'Light Sheen Sweep' },
              ].map((fx) => (
                <label
                  key={fx.key}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200 cursor-pointer"
                >
                  <span>{fx.label}</span>
                  <input
                    type="checkbox"
                    checked={activeRule[fx.key]}
                    onChange={(e) => patchActiveRule({ [fx.key]: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 text-cyan-500"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: LOGO SIZE, EVERY SINGLE LINE TEXT SIZE, CUSTOM COPY */}
        {inspectorTab === 'typography' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Logo / Emblem Size */}
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5 sm:col-span-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                  <span>Event Logo / Emblem Medallion Size</span>
                  <span className="font-mono text-cyan-300">{activeRule.logoSizePx}px</span>
                </div>
                <input
                  type="range"
                  min={EVENT_ANIMATION_BOUNDS.logoSizePx.min}
                  max={EVENT_ANIMATION_BOUNDS.logoSizePx.max}
                  step={EVENT_ANIMATION_BOUNDS.logoSizePx.step}
                  value={activeRule.logoSizePx}
                  onChange={(e) => patchActiveRule({ logoSizePx: Number(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              {/* Line 1: Top Badge & Sport Tag Size */}
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                  <span>Line 1: Badge &amp; Sport Size</span>
                  <span className="font-mono text-cyan-300">{activeRule.badgeTextSizePx}px</span>
                </div>
                <input
                  type="range"
                  min={EVENT_ANIMATION_BOUNDS.badgeTextSizePx.min}
                  max={EVENT_ANIMATION_BOUNDS.badgeTextSizePx.max}
                  step={EVENT_ANIMATION_BOUNDS.badgeTextSizePx.step}
                  value={activeRule.badgeTextSizePx}
                  onChange={(e) => patchActiveRule({ badgeTextSizePx: Number(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              {/* Line 1b: Team Name Pill Size */}
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                  <span>Line 1b: Team Pill Text Size</span>
                  <span className="font-mono text-cyan-300">{activeRule.teamTextSizePx}px</span>
                </div>
                <input
                  type="range"
                  min={EVENT_ANIMATION_BOUNDS.teamTextSizePx.min}
                  max={EVENT_ANIMATION_BOUNDS.teamTextSizePx.max}
                  step={EVENT_ANIMATION_BOUNDS.teamTextSizePx.step}
                  value={activeRule.teamTextSizePx}
                  onChange={(e) => patchActiveRule({ teamTextSizePx: Number(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              {/* Line 2: Hero Headline Size */}
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                  <span>Line 2: Main Headline Text Size</span>
                  <span className="font-mono text-cyan-300">{activeRule.headlineTextSizePx}px</span>
                </div>
                <input
                  type="range"
                  min={EVENT_ANIMATION_BOUNDS.headlineTextSizePx.min}
                  max={EVENT_ANIMATION_BOUNDS.headlineTextSizePx.max}
                  step={EVENT_ANIMATION_BOUNDS.headlineTextSizePx.step}
                  value={activeRule.headlineTextSizePx}
                  onChange={(e) => patchActiveRule({ headlineTextSizePx: Number(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              {/* Line 3: Subtitle / Player Line Size */}
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                  <span>Line 3: Bottom Subtitle Size</span>
                  <span className="font-mono text-cyan-300">{activeRule.subtitleTextSizePx}px</span>
                </div>
                <input
                  type="range"
                  min={EVENT_ANIMATION_BOUNDS.subtitleTextSizePx.min}
                  max={EVENT_ANIMATION_BOUNDS.subtitleTextSizePx.max}
                  step={EVENT_ANIMATION_BOUNDS.subtitleTextSizePx.step}
                  value={activeRule.subtitleTextSizePx}
                  onChange={(e) => patchActiveRule({ subtitleTextSizePx: Number(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>

            {/* Custom Text Overrides */}
            <div className="pt-2 border-t border-slate-800 space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Custom Text Overrides (Leave blank to use live match text)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                    Custom Badge Text
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    placeholder={activeMeta.badge}
                    value={activeRule.customBadgeText}
                    onChange={(e) => patchActiveRule({ customBadgeText: e.target.value })}
                    className="w-full min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder:text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                    Custom Headline
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    placeholder={activeMeta.defaultHeadline}
                    value={activeRule.customHeadline}
                    onChange={(e) => patchActiveRule({ customHeadline: e.target.value })}
                    className="w-full min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder:text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                    Custom Subtitle
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    placeholder={activeMeta.defaultSubtitle}
                    value={activeRule.customSubtitle}
                    onChange={(e) => patchActiveRule({ customSubtitle: e.target.value })}
                    className="w-full min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder:text-slate-600"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ALL COLORS & CONTAINER DIMENSIONS */}
        {inspectorTab === 'colors' && (
          <div className="space-y-4">
            {/* 7 Color Pickers */}
            <div className="space-y-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Custom Palette &amp; Line Colors
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {(
                  [
                    { key: 'primaryHex', label: 'Primary Glow' },
                    { key: 'secondaryHex', label: 'Secondary Base' },
                    { key: 'accentHex', label: 'Accent / Badge Bg' },
                    { key: 'borderColorHex', label: 'Border Color' },
                    { key: 'textColorHex', label: 'Headline Text' },
                    { key: 'badgeTextColorHex', label: 'Badge Text' },
                    { key: 'subtitleColorHex', label: 'Subtitle Text' },
                  ] as const
                ).map((c) => (
                  <label
                    key={c.key}
                    className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer hover:border-slate-700"
                  >
                    <input
                      type="color"
                      value={activeRule[c.key]}
                      onChange={(e) => patchActiveRule({ [c.key]: e.target.value })}
                      className="w-7 h-7 rounded border-0 bg-transparent cursor-pointer shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="block text-[10px] font-semibold text-slate-300 truncate">
                        {c.label}
                      </span>
                      <span className="block font-mono text-[10px] text-slate-400 uppercase">
                        {activeRule[c.key]}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Container Size, Padding, Radius, Border, Opacity */}
            <div className="pt-2 border-t border-slate-800 space-y-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300">
                <Box className="w-3.5 h-3.5 text-cyan-400" />
                <span>Container Box Dimensions &amp; Opacity</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="flex justify-between text-[11px] font-semibold text-slate-200 mb-1">
                    <span>Container Width</span>
                    <span className="font-mono text-cyan-300">{activeRule.containerWidthPx}px</span>
                  </div>
                  <input
                    type="range"
                    min={EVENT_ANIMATION_BOUNDS.containerWidthPx.min}
                    max={EVENT_ANIMATION_BOUNDS.containerWidthPx.max}
                    step={EVENT_ANIMATION_BOUNDS.containerWidthPx.step}
                    value={activeRule.containerWidthPx}
                    onChange={(e) =>
                      patchActiveRule({ containerWidthPx: Number(e.target.value) })
                    }
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="flex justify-between text-[11px] font-semibold text-slate-200 mb-1">
                    <span>Background Opacity</span>
                    <span className="font-mono text-cyan-300">
                      {Math.round(activeRule.bgOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={EVENT_ANIMATION_BOUNDS.bgOpacity.min}
                    max={EVENT_ANIMATION_BOUNDS.bgOpacity.max}
                    step={EVENT_ANIMATION_BOUNDS.bgOpacity.step}
                    value={activeRule.bgOpacity}
                    onChange={(e) => patchActiveRule({ bgOpacity: Number(e.target.value) })}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="flex justify-between text-[11px] font-semibold text-slate-200 mb-1">
                    <span>Horizontal Padding</span>
                    <span className="font-mono text-cyan-300">{activeRule.containerPaddingX}px</span>
                  </div>
                  <input
                    type="range"
                    min={EVENT_ANIMATION_BOUNDS.containerPaddingX.min}
                    max={EVENT_ANIMATION_BOUNDS.containerPaddingX.max}
                    step={EVENT_ANIMATION_BOUNDS.containerPaddingX.step}
                    value={activeRule.containerPaddingX}
                    onChange={(e) =>
                      patchActiveRule({ containerPaddingX: Number(e.target.value) })
                    }
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="flex justify-between text-[11px] font-semibold text-slate-200 mb-1">
                    <span>Vertical Padding</span>
                    <span className="font-mono text-cyan-300">{activeRule.containerPaddingY}px</span>
                  </div>
                  <input
                    type="range"
                    min={EVENT_ANIMATION_BOUNDS.containerPaddingY.min}
                    max={EVENT_ANIMATION_BOUNDS.containerPaddingY.max}
                    step={EVENT_ANIMATION_BOUNDS.containerPaddingY.step}
                    value={activeRule.containerPaddingY}
                    onChange={(e) =>
                      patchActiveRule({ containerPaddingY: Number(e.target.value) })
                    }
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="flex justify-between text-[11px] font-semibold text-slate-200 mb-1">
                    <span>Corner Radius</span>
                    <span className="font-mono text-cyan-300">{activeRule.containerRadiusPx}px</span>
                  </div>
                  <input
                    type="range"
                    min={EVENT_ANIMATION_BOUNDS.containerRadiusPx.min}
                    max={EVENT_ANIMATION_BOUNDS.containerRadiusPx.max}
                    step={EVENT_ANIMATION_BOUNDS.containerRadiusPx.step}
                    value={activeRule.containerRadiusPx}
                    onChange={(e) =>
                      patchActiveRule({ containerRadiusPx: Number(e.target.value) })
                    }
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="flex justify-between text-[11px] font-semibold text-slate-200 mb-1">
                    <span>Border Thickness</span>
                    <span className="font-mono text-cyan-300">{activeRule.borderWidthPx}px</span>
                  </div>
                  <input
                    type="range"
                    min={EVENT_ANIMATION_BOUNDS.borderWidthPx.min}
                    max={EVENT_ANIMATION_BOUNDS.borderWidthPx.max}
                    step={EVENT_ANIMATION_BOUNDS.borderWidthPx.step}
                    value={activeRule.borderWidthPx}
                    onChange={(e) => patchActiveRule({ borderWidthPx: Number(e.target.value) })}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SCREEN POSITION, MASTER SCALE, ADMIN DURATION */}
        {inspectorTab === 'layout' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Position Presets & Coordinates */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  Screen Position &amp; Manual X / Y
                </label>
                <button
                  type="button"
                  onClick={() => onToggleStagePick(!stagePickActive)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                    stagePickActive
                      ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.45)]'
                      : 'bg-slate-900 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/10'
                  }`}
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>{stagePickActive ? 'Click Stage Preview Now' : 'Pick on Stage Preview'}</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {EVENT_POSITION_PRESETS.map((p) => {
                  const active = activeRule.positionPreset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPresetPosition(p.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                        active
                          ? 'bg-[#EA580C] text-white border-[#EA580C]'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1">
                    <span>Horizontal X%</span>
                    <span className="font-mono text-cyan-300">{activeRule.xPct}%</span>
                  </div>
                  <input
                    type="range"
                    min={EVENT_ANIMATION_BOUNDS.xPct.min}
                    max={EVENT_ANIMATION_BOUNDS.xPct.max}
                    step={EVENT_ANIMATION_BOUNDS.xPct.step}
                    value={activeRule.xPct}
                    onChange={(e) =>
                      patchActiveRule({
                        positionPreset: 'custom',
                        xPct: Number(e.target.value),
                      })
                    }
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1">
                    <span>Vertical Y%</span>
                    <span className="font-mono text-cyan-300">{activeRule.yPct}%</span>
                  </div>
                  <input
                    type="range"
                    min={EVENT_ANIMATION_BOUNDS.yPct.min}
                    max={EVENT_ANIMATION_BOUNDS.yPct.max}
                    step={EVENT_ANIMATION_BOUNDS.yPct.step}
                    value={activeRule.yPct}
                    onChange={(e) =>
                      patchActiveRule({
                        positionPreset: 'custom',
                        yPct: Number(e.target.value),
                      })
                    }
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Admin-Only Duration + Scale + Sync-All Utility */}
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-200 block">
                      Animation Duration (Admin Only)
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Hidden from viewers &amp; OBS broadcast audience
                    </span>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-slate-950 border border-cyan-500/40 font-mono text-xs font-extrabold text-cyan-300">
                    {activeRule.durationSeconds.toFixed(1)}s
                  </span>
                </div>
                <input
                  type="range"
                  min={EVENT_ANIMATION_BOUNDS.durationSeconds.min}
                  max={EVENT_ANIMATION_BOUNDS.durationSeconds.max}
                  step={EVENT_ANIMATION_BOUNDS.durationSeconds.step}
                  value={activeRule.durationSeconds}
                  onChange={(e) =>
                    patchActiveRule({ durationSeconds: Number(e.target.value) })
                  }
                  className="w-full accent-orange-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-500">
                  <span>1.5s</span>
                  <span>5.0s</span>
                  <span>10.0s</span>
                  <span>15.0s</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-200">
                    Master Zoom Scale
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-200">
                    {Math.round(activeRule.scale * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={EVENT_ANIMATION_BOUNDS.scale.min}
                  max={EVENT_ANIMATION_BOUNDS.scale.max}
                  step={EVENT_ANIMATION_BOUNDS.scale.step}
                  value={activeRule.scale}
                  onChange={(e) => patchActiveRule({ scale: Number(e.target.value) })}
                  className="w-full accent-purple-400 cursor-pointer"
                />
              </div>

              <button
                type="button"
                onClick={handleApplyVisualsToAllEvents}
                className="w-full min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Apply {activeMeta.shortLabel} Colors, Sizes &amp; Motion to All 11 Events</span>
              </button>
            </div>
          </div>
        )}

        {/* Bottom Per-Event Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onPreviewOnStage(buildSamplePayload(selectedEventKey, activeRule), normalizedMap, {
                  replayEntry: true,
                  sticky: false,
                })
              }
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-cyan-200 border border-cyan-500/40"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Replay Timed ({activeRule.durationSeconds}s)</span>
            </button>

            <button
              type="button"
              disabled={triggeringLive}
              onClick={handleTriggerLive}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-orange-600 to-rose-600 hover:from-orange-500 hover:to-rose-500 text-white shadow-[0_0_16px_rgba(234,88,12,0.35)] disabled:opacity-60"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>{triggeringLive ? 'Firing Live...' : 'Trigger Live on OBS'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const defRule = createDefaultEventRule(selectedEventKey);
                patchActiveRule(defRule, { forcePreview: true, replayEntry: true });
              }}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset {activeMeta.shortLabel}</span>
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() =>
                onSaveEventAnimations(
                  normalizedMap,
                  `Saved "${activeMeta.label}" animation (${activeStyle.name}, ${activeRule.durationSeconds}s) to live broadcast!`
                )
              }
              className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_16px_rgba(16,185,129,0.35)] disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : `Save ${activeMeta.shortLabel}`}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
