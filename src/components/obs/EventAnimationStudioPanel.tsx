import { useMemo, useState } from 'react';
import {
  Check,
  Crosshair,
  Download,
  Eye,
  Flame,
  Play,
  Radio,
  RotateCcw,
  Save,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  BROADCAST_EVENT_KEYS,
  BROADCAST_EVENT_META,
  BroadcastEventKey,
  BroadcastEventTriggerPayload,
  createDefaultEventRule,
  DEFAULT_EVENT_ANIMATIONS,
  EVENT_ANIMATION_BOUNDS,
  EVENT_ANIMATION_PRESETS,
  EVENT_POSITION_PRESETS,
  EventAnimationConfigMap,
  EventAnimationPositionPreset,
  EventAnimationRuleConfig,
  EventSportGroup,
  getEventPositionPresetCoords,
  loadGlobalEventAnimationDefaults,
  normalizeEventAnimationsConfig,
  resolveEventStyleOption,
  saveGlobalEventAnimationDefaults,
} from '../../utils/eventAnimations.ts';

interface EventAnimationStudioPanelProps {
  streamId: string;
  sportType?: string;
  teamAName?: string;
  teamBName?: string;
  teamAColor?: string;
  eventAnimations: EventAnimationConfigMap;
  saving: boolean;
  selectedEventKey: BroadcastEventKey;
  onSelectEventKey: (key: BroadcastEventKey) => void;
  stagePickActive: boolean;
  onToggleStagePick: (active: boolean) => void;
  onLocalConfigChange: (nextMap: EventAnimationConfigMap) => void;
  onSaveEventAnimations: (nextMap: EventAnimationConfigMap, notice?: string) => Promise<void>;
  onPreviewOnStage: (payload: BroadcastEventTriggerPayload, nextMap?: EventAnimationConfigMap) => void;
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
  saving,
  selectedEventKey,
  onSelectEventKey,
  stagePickActive,
  onToggleStagePick,
  onLocalConfigChange,
  onSaveEventAnimations,
  onPreviewOnStage,
  onTriggerLiveBroadcast,
}: EventAnimationStudioPanelProps & { teamColorOverride?: string }) {
  const [sportFilter, setSportFilter] = useState<'All' | EventSportGroup>(() =>
    inferDefaultFilterFromSport(sportType)
  );
  const [autoPreviewOnStyleClick, setAutoPreviewOnStyleClick] = useState<boolean>(true);
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
    styleId?: string
  ): BroadcastEventTriggerPayload => {
    const meta = BROADCAST_EVENT_META[key];
    return {
      streamId,
      eventId: `preview-${key}-${Date.now()}`,
      eventKey: key,
      sportType: meta.sport,
      teamSide: 'A',
      teamName: teamAName || 'HOME SQUAD',
      teamColor: teamColorOverride || '#EA580C',
      subtitle: meta.defaultSubtitle,
      pointsLabel: meta.badge,
      triggeredAtIso: new Date().toISOString(),
      manualOverride: true,
      previewStyleId: styleId,
    };
  };

  const patchActiveRule = (
    partial: Partial<EventAnimationRuleConfig>,
    triggerPreview = false,
    previewStyleId?: string
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
    if (triggerPreview) {
      onPreviewOnStage(buildSamplePayload(selectedEventKey, previewStyleId || nextRule.styleId), nextMap);
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
    await onSaveEventAnimations(DEFAULT_EVENT_ANIMATIONS, 'Reset all 11 event animations to pro defaults.');
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
        subtitle: activeMeta.defaultSubtitle,
      });
    } finally {
      setTriggeringLive(false);
    }
  };

  return (
    <section
      id="event-animations-studio"
      className="rounded-xl border border-cyan-500/35 bg-slate-900/95 p-4 sm:p-5 space-y-5 shadow-[0_0_32px_rgba(6,182,212,0.08)]"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-cyan-400 shrink-0" />
            <h2 className="font-display text-sm sm:text-base font-extrabold uppercase tracking-wide text-white">
              Pro Match Event Animations Studio
            </h2>
            <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/35 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
              10 Styles / Event
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure JioHotstar &amp; Pro Kabaddi kinetic stingers per event (style, position, duration, scale) and save individually. Viewers never see the duration timer.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSaveGlobalTemplate}
            className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-950 border border-slate-700 text-slate-200 hover:border-cyan-400/50 hover:text-cyan-200"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Save Global Template</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleApplyGlobalTemplate}
            className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-950 border border-slate-700 text-slate-200 hover:border-emerald-400/50 hover:text-emerald-200"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span>Load Global</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleResetAllEvents}
            className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-950 border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All</span>
          </button>
        </div>
      </div>

      {templateNotice && (
        <div className="px-3 py-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-xs font-medium text-cyan-200">
          {templateNotice}
        </div>
      )}

      {/* Sport Filter Tabs + Event Selector Grid */}
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
                    if (firstInSport) onSelectEventKey(firstInSport);
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

          <label className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoPreviewOnStyleClick}
              onChange={(e) => setAutoPreviewOnStyleClick(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-600 text-cyan-500"
            />
            <span>Auto-preview on Stage when clicking styles</span>
          </label>
        </div>

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
                onClick={() => onSelectEventKey(key)}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        style={{ background: style.accentHex }}
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
                    title={`Quick preview ${meta.label} on Stage`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEventKey(key);
                      onPreviewOnStage(buildSamplePayload(key, rule.styleId), normalizedMap);
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

      {/* Selected Event Full Manual Inspector */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/85 p-4 space-y-5">
        {/* Selected Event Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              style={{
                background: `linear-gradient(135deg, ${activeStyle.primaryHex}, ${activeStyle.secondaryHex})`,
                borderColor: activeStyle.accentHex,
              }}
              className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
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
                Active Style #{activeStyle.index}: <span className="text-cyan-300 font-semibold">{activeStyle.name}</span> · Pos ({activeRule.xPct}%, {activeRule.yPct}%) · {activeRule.durationSeconds}s
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
            <span>{activeRule.enabled ? 'Auto-Trigger Enabled' : 'Disabled'}</span>
          </label>
        </div>

        {/* 10 Broadcast Animation Options Grid */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
              Select Animation Option (10 Pro Presets for {activeMeta.label})
            </label>
            <span className="text-[10px] font-mono text-cyan-300">
              {activePresets.length} presets
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {activePresets.map((opt) => {
              const isSelected = activeRule.styleId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    patchActiveRule({ styleId: opt.id }, autoPreviewOnStyleClick, opt.id)
                  }
                  className={`relative rounded-xl border p-2.5 text-left transition-all flex flex-col justify-between gap-1.5 ${
                    isSelected
                      ? 'border-cyan-400 bg-cyan-500/15 shadow-[0_0_16px_rgba(34,211,238,0.22)]'
                      : 'border-slate-800 bg-slate-900/90 hover:border-slate-600'
                  }`}
                >
                  {/* Visual Swatch Strip */}
                  <div
                    style={{
                      background: `linear-gradient(120deg, ${opt.secondaryHex} 0%, ${opt.primaryHex} 65%, ${opt.accentHex} 100%)`,
                    }}
                    className="h-5 w-full rounded-md border border-white/15 flex items-center justify-between px-2"
                  >
                    <span className="text-[9px] font-black text-white/95 drop-shadow">
                      #{opt.index}
                    </span>
                    {isSelected && <Check className="w-3 h-3 text-white drop-shadow" />}
                  </div>

                  <div>
                    <p className="text-[11px] font-extrabold text-white leading-tight line-clamp-1">
                      {opt.name}
                    </p>
                    <p className="text-[10px] text-slate-400 leading-tight line-clamp-2 mt-0.5">
                      {opt.tagline}
                    </p>
                  </div>

                  <span className="text-[9px] font-mono uppercase text-slate-400 truncate">
                    {opt.motionFamily.replace(/_/g, ' ')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Manual Position + Duration + Scale Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2 border-t border-slate-800/90">
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

          {/* Admin-Only Duration + Scale Controls */}
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
                  Banner Size Scale
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
          </div>
        </div>

        {/* Bottom Per-Event Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onPreviewOnStage(
                  buildSamplePayload(selectedEventKey, activeRule.styleId),
                  normalizedMap
                )
              }
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-cyan-200 border border-cyan-500/40"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview on Stage</span>
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
                patchActiveRule(defRule, false);
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
