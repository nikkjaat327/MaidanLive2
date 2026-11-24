import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Palette, RotateCcw, Sparkles, Type } from 'lucide-react';
import type { BroadcastOverlayConfig } from '../../types/index.ts';
import {
  BRAND_LOGO_BOUNDS,
  CUSTOM_DESIGN_BOUNDS,
  CUSTOM_FONT_FAMILIES,
  CUSTOM_FONT_WEIGHTS,
  CUSTOM_LAYOUT_VARIANTS,
  DEFAULT_CUSTOM_SCOREBOARD_DESIGN,
  OVERLAY_POSITIONS,
  normalizeCustomScoreboardDesign,
  resolveBrandLogoUrl,
  type CustomScoreboardDesign,
  type CustomScoreboardFontFamily,
  type CustomScoreboardFontWeight,
  type CustomScoreboardLayoutVariant,
  type OverlayPosition,
} from '../../utils/overlayConfig.ts';

interface CustomScoreboardDesignerProps {
  config: BroadcastOverlayConfig;
  onChange: (patch: Partial<BroadcastOverlayConfig>) => void;
  disabled?: boolean;
  darkSurface?: boolean;
  serverLogoUrl?: string;
}

const POSITION_SHORT_LABELS: Record<OverlayPosition, string> = {
  'top-left': 'Top Left',
  'top-center': 'Top Center',
  'top-right': 'Top Right',
  'bottom-left': 'Bot Left',
  'bottom-center': 'Bot Center',
  'bottom-right': 'Bot Right',
};

const LAYOUT_VARIANT_LABELS: Record<CustomScoreboardLayoutVariant, string> = {
  classic_bar: 'Classic Bar',
  split_wings: 'Split Wings',
  floating_pill: 'Floating Pill',
  angled_ribbon: 'Angled Ribbon',
  compact_tower: 'Compact Bug',
};

const FONT_FAMILY_LABELS: Record<CustomScoreboardFontFamily, string> = {
  display: 'Display',
  sans: 'Clean Sans',
  mono: 'Tech Mono',
};

const FONT_WEIGHT_LABELS: Record<CustomScoreboardFontWeight, string> = {
  bold: 'Bold',
  extrabold: 'ExtraBold',
  black: 'Black',
};

const DESIGNER_PRESETS: Array<{
  id: string;
  label: string;
  swatch: string;
  design: CustomScoreboardDesign;
}> = [
  {
    id: 'neon_cyber',
    label: 'Neon Cyber',
    swatch: 'linear-gradient(135deg, #EC4899 0%, #7C3AED 100%)',
    design: { ...DEFAULT_CUSTOM_SCOREBOARD_DESIGN },
  },
  {
    id: 'championship_gold',
    label: 'Champ Gold',
    swatch: 'linear-gradient(135deg, #F59E0B 0%, #B45309 100%)',
    design: {
      ...DEFAULT_CUSTOM_SCOREBOARD_DESIGN,
      layoutVariant: 'split_wings',
      primaryColor: '#F59E0B',
      secondaryColor: '#38BDF8',
      backgroundColor: '#0B1120',
      backgroundOpacity: 0.94,
      accentColor: '#FBBF24',
      textColor: '#FEFCE8',
      subStripColor: '#050814',
      borderColor: '#F59E0B',
      borderWidth: 2,
      glowColor: '#F59E0B',
      glowIntensity: 18,
      borderRadius: 14,
      fontFamily: 'display',
      fontWeight: 'black',
    },
  },
  {
    id: 'arena_carbon',
    label: 'Arena Carbon',
    swatch: 'linear-gradient(135deg, #EF4444 0%, #1E293B 100%)',
    design: {
      ...DEFAULT_CUSTOM_SCOREBOARD_DESIGN,
      layoutVariant: 'angled_ribbon',
      primaryColor: '#EF4444',
      secondaryColor: '#10B981',
      backgroundColor: '#111827',
      backgroundOpacity: 0.96,
      accentColor: '#F87171',
      textColor: '#F8FAFC',
      subStripColor: '#030712',
      borderColor: '#475569',
      borderWidth: 2,
      glowColor: '#EF4444',
      glowIntensity: 10,
      borderRadius: 6,
      fontFamily: 'mono',
      fontWeight: 'black',
    },
  },
  {
    id: 'clean_ice',
    label: 'Clean Ice',
    swatch: 'linear-gradient(135deg, #E2E8F0 0%, #2563EB 100%)',
    design: {
      ...DEFAULT_CUSTOM_SCOREBOARD_DESIGN,
      layoutVariant: 'floating_pill',
      primaryColor: '#2563EB',
      secondaryColor: '#EA580C',
      backgroundColor: '#F8FAFC',
      backgroundOpacity: 0.95,
      accentColor: '#1D4ED8',
      textColor: '#0F172A',
      subStripColor: '#E2E8F0',
      borderColor: '#94A3B8',
      borderWidth: 2,
      glowColor: '#38BDF8',
      glowIntensity: 8,
      borderRadius: 24,
      fontFamily: 'sans',
      fontWeight: 'extrabold',
      showGradient: false,
    },
  },
];

const COLOR_FIELDS: Array<{
  key: keyof Pick<
    CustomScoreboardDesign,
    | 'primaryColor'
    | 'secondaryColor'
    | 'backgroundColor'
    | 'accentColor'
    | 'textColor'
    | 'subStripColor'
    | 'borderColor'
    | 'glowColor'
  >;
  label: string;
}> = [
  { key: 'primaryColor', label: 'Team A / Left' },
  { key: 'secondaryColor', label: 'Team B / Right' },
  { key: 'backgroundColor', label: 'Bar Base' },
  { key: 'subStripColor', label: 'Sub-Strip' },
  { key: 'accentColor', label: 'Center Accent' },
  { key: 'textColor', label: 'Text Color' },
  { key: 'borderColor', label: 'Border Rim' },
  { key: 'glowColor', label: 'Neon Glow' },
];

export function CustomScoreboardDesigner({
  config,
  onChange,
  disabled = false,
  darkSurface = true,
  serverLogoUrl,
}: CustomScoreboardDesignerProps) {
  const [logoUrlInput, setLogoUrlInput] = useState(config.brandLogoUrl || '');
  const [localLogoDraft, setLocalLogoDraft] = useState<{
    brandLogoSize?: number;
    brandLogoOpacity?: number;
    brandLogoOffsetX?: number;
    brandLogoOffsetY?: number;
  }>({});
  const [localDesignDraft, setLocalDesignDraft] = useState<Partial<CustomScoreboardDesign> | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const pendingPatchRef = useRef<Partial<BroadcastOverlayConfig>>({});

  useEffect(() => {
    setLogoUrlInput(config.brandLogoUrl || '');
  }, [config.brandLogoUrl]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const design = normalizeCustomScoreboardDesign({
    ...config.customScoreboardDesign,
    ...(localDesignDraft || {}),
  });

  const effectiveLogoUrl = resolveBrandLogoUrl(config, serverLogoUrl);
  const logoSize = localLogoDraft.brandLogoSize ?? config.brandLogoSize ?? BRAND_LOGO_BOUNDS.brandLogoSize.defaultVal;
  const logoOpacity =
    localLogoDraft.brandLogoOpacity ?? config.brandLogoOpacity ?? BRAND_LOGO_BOUNDS.brandLogoOpacity.defaultVal;
  const logoOffsetX =
    localLogoDraft.brandLogoOffsetX ?? config.brandLogoOffsetX ?? BRAND_LOGO_BOUNDS.brandLogoOffsetX.defaultVal;
  const logoOffsetY =
    localLogoDraft.brandLogoOffsetY ?? config.brandLogoOffsetY ?? BRAND_LOGO_BOUNDS.brandLogoOffsetY.defaultVal;

  function flushPatchDebounced(patch: Partial<BroadcastOverlayConfig>) {
    pendingPatchRef.current = {
      ...pendingPatchRef.current,
      ...patch,
      ...(patch.customScoreboardDesign
        ? {
            customScoreboardDesign: normalizeCustomScoreboardDesign({
              ...(pendingPatchRef.current.customScoreboardDesign || config.customScoreboardDesign),
              ...patch.customScoreboardDesign,
            }),
          }
        : {}),
    };

    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      const toSend = { ...pendingPatchRef.current };
      pendingPatchRef.current = {};
      setLocalLogoDraft({});
      setLocalDesignDraft(null);
      if (Object.keys(toSend).length > 0) {
        onChange(toSend);
      }
    }, 180);
  }

  function updateDesignField(
    patch: Partial<CustomScoreboardDesign>,
    debounce = false
  ) {
    const mergedDesign = normalizeCustomScoreboardDesign({
      ...design,
      ...patch,
    });
    const fullPatch: Partial<BroadcastOverlayConfig> = {
      style: 'custom_designer',
      customScoreboardDesign: mergedDesign,
    };
    if (debounce) {
      setLocalDesignDraft((prev) => ({ ...(prev || {}), ...patch }));
      flushPatchDebounced(fullPatch);
    } else {
      setLocalDesignDraft(null);
      onChange(fullPatch);
    }
  }

  function updateLogoNumberField(
    key: 'brandLogoSize' | 'brandLogoOpacity' | 'brandLogoOffsetX' | 'brandLogoOffsetY',
    value: number
  ) {
    setLocalLogoDraft((prev) => ({ ...prev, [key]: value }));
    flushPatchDebounced({ [key]: value });
  }

  const cardBg = darkSurface
    ? 'bg-slate-950 border-slate-800 text-slate-100'
    : 'bg-slate-50 border-slate-200 text-slate-900';
  const subCardBg = darkSurface
    ? 'bg-slate-900/80 border-slate-800'
    : 'bg-white border-slate-200';
  const labelMuted = darkSurface ? 'text-slate-400' : 'text-slate-500';
  const inputCls = darkSurface
    ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500'
    : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400';

  return (
    <div className="space-y-4">
      {/* SECTION 1: BROADCAST BRAND LOGO PLACEMENT & SIZE */}
      <div className={`rounded-xl border p-3.5 space-y-3 ${cardBg}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-pink-500 shrink-0" />
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider">
                Broadcast Logo Overlay (All Screens)
              </h3>
              <p className={`text-[10px] ${labelMuted}`}>
                Position &amp; resize your brand logo across OBS, Control Room &amp; Player
              </p>
            </div>
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={config.showBrandLogo !== false}
              disabled={disabled}
              onChange={(e) => onChange({ showBrandLogo: e.target.checked })}
              className="w-4 h-4 rounded border-slate-500 text-pink-500"
            />
            <span>Show</span>
          </label>
        </div>

        {/* Logo Preview + URL Override */}
        <div className={`rounded-lg border p-2.5 flex items-center gap-3 ${subCardBg}`}>
          <div className="w-14 h-12 rounded-md bg-slate-900/90 border border-slate-700/70 flex items-center justify-center p-1 shrink-0 overflow-hidden">
            <img
              src={effectiveLogoUrl}
              alt="Brand Logo Preview"
              referrerPolicy="no-referrer"
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <input
                type="url"
                value={logoUrlInput}
                disabled={disabled}
                onChange={(e) => setLogoUrlInput(e.target.value)}
                onBlur={() => {
                  if (logoUrlInput.trim() !== (config.brandLogoUrl || '')) {
                    onChange({ brandLogoUrl: logoUrlInput.trim() });
                  }
                }}
                placeholder="Using .env BRAND_LOGO_URL (or paste custom URL)"
                className={`flex-1 min-w-0 min-h-[32px] px-2.5 text-[11px] rounded-md border ${inputCls}`}
              />
              {logoUrlInput.trim() && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setLogoUrlInput('');
                    onChange({ brandLogoUrl: '' });
                  }}
                  title="Reset to .env logo"
                  className="px-2 py-1.5 text-[10px] font-semibold rounded-md border border-slate-600 hover:bg-slate-700/40 shrink-0"
                >
                  .env Default
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Logo 6-Position Grid */}
        <div className="space-y-1.5">
          <span className={`block text-[10px] font-bold uppercase tracking-wider ${labelMuted}`}>
            Logo Corner / Position
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {OVERLAY_POSITIONS.map((pos) => {
              const active = (config.brandLogoPosition || 'top-left') === pos;
              return (
                <button
                  key={pos}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ brandLogoPosition: pos })}
                  className={`min-h-[32px] px-2 py-1 text-[11px] font-semibold rounded-lg border transition-colors ${
                    active
                      ? 'bg-pink-600 text-white border-pink-500'
                      : darkSurface
                        ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {POSITION_SHORT_LABELS[pos]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Logo Size, Opacity & Offsets */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className={`p-2 rounded-lg border space-y-1 ${subCardBg}`}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold">Logo Size</span>
              <span className="font-mono font-bold text-pink-400">{logoSize}px</span>
            </div>
            <input
              type="range"
              min={BRAND_LOGO_BOUNDS.brandLogoSize.min}
              max={BRAND_LOGO_BOUNDS.brandLogoSize.max}
              step={BRAND_LOGO_BOUNDS.brandLogoSize.step}
              value={logoSize}
              onChange={(e) => updateLogoNumberField('brandLogoSize', Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
            />
          </div>

          <div className={`p-2 rounded-lg border space-y-1 ${subCardBg}`}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold">Opacity</span>
              <span className="font-mono font-bold text-pink-400">
                {Math.round(logoOpacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={BRAND_LOGO_BOUNDS.brandLogoOpacity.min}
              max={BRAND_LOGO_BOUNDS.brandLogoOpacity.max}
              step={BRAND_LOGO_BOUNDS.brandLogoOpacity.step}
              value={logoOpacity}
              onChange={(e) => updateLogoNumberField('brandLogoOpacity', Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
            />
          </div>

          <div className={`p-2 rounded-lg border space-y-1 ${subCardBg}`}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold">Edge Margin X</span>
              <span className="font-mono font-bold text-pink-400">{logoOffsetX}px</span>
            </div>
            <input
              type="range"
              min={BRAND_LOGO_BOUNDS.brandLogoOffsetX.min}
              max={BRAND_LOGO_BOUNDS.brandLogoOffsetX.max}
              step={BRAND_LOGO_BOUNDS.brandLogoOffsetX.step}
              value={logoOffsetX}
              onChange={(e) => updateLogoNumberField('brandLogoOffsetX', Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
            />
          </div>

          <div className={`p-2 rounded-lg border space-y-1 ${subCardBg}`}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold">Edge Margin Y</span>
              <span className="font-mono font-bold text-pink-400">{logoOffsetY}px</span>
            </div>
            <input
              type="range"
              min={BRAND_LOGO_BOUNDS.brandLogoOffsetY.min}
              max={BRAND_LOGO_BOUNDS.brandLogoOffsetY.max}
              step={BRAND_LOGO_BOUNDS.brandLogoOffsetY.step}
              value={logoOffsetY}
              onChange={(e) => updateLogoNumberField('brandLogoOffsetY', Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
            />
          </div>
        </div>
      </div>

      {/* SECTION 2: CUSTOM SCOREBOARD DESIGNER */}
      <div className={`rounded-xl border p-3.5 space-y-3.5 ${cardBg}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-purple-400 shrink-0" />
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider">
                Custom Scoreboard Builder
              </h3>
              <p className={`text-[10px] ${labelMuted}`}>
                Build your own broadcast scoreboard with custom palette, borders, glow &amp; fonts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {config.style !== 'custom_designer' && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange({ style: 'custom_designer' })}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-purple-600 hover:bg-purple-500 text-white"
              >
                <Sparkles className="w-3 h-3" />
                <span>Use Custom Style</span>
              </button>
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange({
                  style: 'custom_designer',
                  customScoreboardDesign: { ...DEFAULT_CUSTOM_SCOREBOARD_DESIGN },
                })
              }
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg border border-slate-600 hover:bg-slate-700/30"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Starter Palettes */}
        <div className="space-y-1.5">
          <span className={`block text-[10px] font-bold uppercase tracking-wider ${labelMuted}`}>
            Quick Starter Templates
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {DESIGNER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    style: 'custom_designer',
                    customScoreboardDesign: { ...preset.design },
                  })
                }
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${subCardBg} hover:border-purple-500`}
              >
                <span
                  style={{ background: preset.swatch }}
                  className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/30"
                />
                <span className="truncate">{preset.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Layout Structure Variant */}
        <div className="space-y-1.5">
          <span className={`block text-[10px] font-bold uppercase tracking-wider ${labelMuted}`}>
            Frame Geometry
          </span>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            {CUSTOM_LAYOUT_VARIANTS.map((variant) => {
              const active = design.layoutVariant === variant;
              return (
                <button
                  key={variant}
                  type="button"
                  disabled={disabled}
                  onClick={() => updateDesignField({ layoutVariant: variant })}
                  className={`px-2 py-1.5 rounded-lg border text-[10px] font-bold transition-colors ${
                    active
                      ? 'bg-purple-600 text-white border-purple-500'
                      : darkSurface
                        ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {LAYOUT_VARIANT_LABELS[variant]}
                </button>
              );
            })}
          </div>
        </div>

        {/* 8 Color Pickers */}
        <div className="space-y-1.5">
          <span className={`block text-[10px] font-bold uppercase tracking-wider ${labelMuted}`}>
            Custom Colors
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {COLOR_FIELDS.map((cf) => (
              <label
                key={cf.key}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-pointer ${subCardBg}`}
              >
                <input
                  type="color"
                  value={design[cf.key]}
                  disabled={disabled}
                  onChange={(e) => updateDesignField({ [cf.key]: e.target.value.toUpperCase() }, true)}
                  className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer shrink-0"
                />
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold truncate">{cf.label}</span>
                  <span className={`block text-[9px] font-mono ${labelMuted}`}>
                    {design[cf.key]}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Frame Geometry Sliders */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className={`p-2 rounded-lg border space-y-1 ${subCardBg}`}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold">Background Opacity</span>
              <span className="font-mono font-bold text-purple-400">
                {Math.round(design.backgroundOpacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={CUSTOM_DESIGN_BOUNDS.backgroundOpacity.min}
              max={CUSTOM_DESIGN_BOUNDS.backgroundOpacity.max}
              step={CUSTOM_DESIGN_BOUNDS.backgroundOpacity.step}
              value={design.backgroundOpacity}
              onChange={(e) => updateDesignField({ backgroundOpacity: Number(e.target.value) }, true)}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
          </div>

          <div className={`p-2 rounded-lg border space-y-1 ${subCardBg}`}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold">Corner Radius</span>
              <span className="font-mono font-bold text-purple-400">{design.borderRadius}px</span>
            </div>
            <input
              type="range"
              min={CUSTOM_DESIGN_BOUNDS.borderRadius.min}
              max={CUSTOM_DESIGN_BOUNDS.borderRadius.max}
              step={CUSTOM_DESIGN_BOUNDS.borderRadius.step}
              value={design.borderRadius}
              onChange={(e) => updateDesignField({ borderRadius: Number(e.target.value) }, true)}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
          </div>

          <div className={`p-2 rounded-lg border space-y-1 ${subCardBg}`}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold">Border Width</span>
              <span className="font-mono font-bold text-purple-400">{design.borderWidth}px</span>
            </div>
            <input
              type="range"
              min={CUSTOM_DESIGN_BOUNDS.borderWidth.min}
              max={CUSTOM_DESIGN_BOUNDS.borderWidth.max}
              step={CUSTOM_DESIGN_BOUNDS.borderWidth.step}
              value={design.borderWidth}
              onChange={(e) => updateDesignField({ borderWidth: Number(e.target.value) }, true)}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
          </div>

          <div className={`p-2 rounded-lg border space-y-1 ${subCardBg}`}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold">Neon Glow</span>
              <span className="font-mono font-bold text-purple-400">{design.glowIntensity}px</span>
            </div>
            <input
              type="range"
              min={CUSTOM_DESIGN_BOUNDS.glowIntensity.min}
              max={CUSTOM_DESIGN_BOUNDS.glowIntensity.max}
              step={CUSTOM_DESIGN_BOUNDS.glowIntensity.step}
              value={design.glowIntensity}
              onChange={(e) => updateDesignField({ glowIntensity: Number(e.target.value) }, true)}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
          </div>
        </div>

        {/* Typography & Feature Toggles */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${labelMuted}`}>
              <Type className="w-3 h-3" />
              Font Family
            </span>
            <select
              value={design.fontFamily}
              disabled={disabled}
              onChange={(e) =>
                updateDesignField({ fontFamily: e.target.value as CustomScoreboardFontFamily })
              }
              className={`w-full min-h-[34px] px-2.5 text-xs font-semibold rounded-lg border ${inputCls}`}
            >
              {CUSTOM_FONT_FAMILIES.map((ff) => (
                <option key={ff} value={ff}>
                  {FONT_FAMILY_LABELS[ff]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <span className={`block text-[10px] font-bold uppercase tracking-wider ${labelMuted}`}>
              Font Weight
            </span>
            <select
              value={design.fontWeight}
              disabled={disabled}
              onChange={(e) =>
                updateDesignField({ fontWeight: e.target.value as CustomScoreboardFontWeight })
              }
              className={`w-full min-h-[34px] px-2.5 text-xs font-semibold rounded-lg border ${inputCls}`}
            >
              {CUSTOM_FONT_WEIGHTS.map((fw) => (
                <option key={fw} value={fw}>
                  {FONT_WEIGHT_LABELS[fw]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {(
            [
              { key: 'showBorders', label: 'Show Borders' },
              { key: 'showGradient', label: 'Team Gradient' },
              { key: 'showShadow', label: 'Drop Shadow' },
              { key: 'showDivider', label: 'Center Divider' },
              { key: 'showTelemetryBar', label: 'Sub-Strip Stats' },
            ] as const
          ).map((tog) => (
            <label
              key={tog.key}
              className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${subCardBg}`}
            >
              <span className="truncate">{tog.label}</span>
              <input
                type="checkbox"
                checked={design[tog.key]}
                disabled={disabled}
                onChange={(e) => updateDesignField({ [tog.key]: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-slate-500 text-purple-500 shrink-0"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
