export type OverlayMode = 'full' | 'compact' | 'score_only' | 'hidden';

export type OverlayPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type OverlayScale = 'small' | 'medium' | 'large';

export type OverlayTheme =
  | 'maidan_dark'
  | 'stadium_blue'
  | 'red_broadcast'
  | 'minimal_white'
  | 'team_colors';

export type ScoreboardStyleId =
  | 'broadcast_classic'
  | 'floating_pill'
  | 'esports_angular'
  | 'stacked_glass'
  | 'espn_ticker'
  | 'split_versus_card'
  | 'minimal_corner_bug'
  | 'championship_marquee'
  | 'vertical_hud_dock'
  | 'dynamic_capsule';

export interface ScoreboardStyleMeta {
  id: ScoreboardStyleId;
  name: string;
  shortName: string;
  tagline: string;
}

export const SCOREBOARD_STYLES: readonly ScoreboardStyleMeta[] = [
  {
    id: 'broadcast_classic',
    name: 'Broadcast Classic',
    shortName: 'Classic',
    tagline: 'Signature angled TV bar with brand shield & live telemetry strip',
  },
  {
    id: 'floating_pill',
    name: 'Floating Pill Bar',
    shortName: 'Floating Pill',
    tagline: 'Sleek rounded-full obsidian capsule with circular center badge',
  },
  {
    id: 'esports_angular',
    name: 'Esports Chamfer HUD',
    shortName: 'Esports HUD',
    tagline: 'Sharp diagonal cyber cuts, neon edge rim & hexagonal center core',
  },
  {
    id: 'stacked_glass',
    name: 'Stacked Frosted Glass',
    shortName: 'Frosted Glass',
    tagline: 'Dual-tier translucent glassmorphic cards with glowing accent rails',
  },
  {
    id: 'espn_ticker',
    name: 'Flat Ticker Strip',
    shortName: 'Flat Ticker',
    tagline: 'Crisp full-bleed flat broadcast strip with sharp vertical dividers',
  },
  {
    id: 'split_versus_card',
    name: 'Center VS Tower',
    shortName: 'VS Tower',
    tagline: 'Elevated central clock & VS pedestal flanked by wing scorecards',
  },
  {
    id: 'minimal_corner_bug',
    name: 'Minimal Corner Bug',
    shortName: 'Corner Bug',
    tagline: 'Ultra-compact stacked TV bug leaving 95%+ of the match unobstructed',
  },
  {
    id: 'championship_marquee',
    name: 'Championship Plaque',
    shortName: 'Champ Gold',
    tagline: 'Top tournament crown header over a beveled championship ribbon',
  },
  {
    id: 'vertical_hud_dock',
    name: 'Stacked Team Table',
    shortName: 'Team Stack',
    tagline: 'Two-row versus score matrix with dedicated right telemetry wing',
  },
  {
    id: 'dynamic_capsule',
    name: 'Modular Bento Pods',
    shortName: 'Bento Pods',
    tagline: 'Detached floating pods for Brand, Teams, Center Score & Stat Pill',
  },
];

export const VALID_SCOREBOARD_STYLES: readonly ScoreboardStyleId[] = SCOREBOARD_STYLES.map(
  (s) => s.id
);

export interface BroadcastOverlayConfig {
  visible: boolean;
  mode: OverlayMode;
  position: OverlayPosition;
  scale: OverlayScale;
  theme: OverlayTheme;
  style: ScoreboardStyleId;
  teamAColor: string;
  teamBColor: string;
  showTournamentName: boolean;
  showTeamLogos: boolean;
  showRunRate: boolean;
  showRequiredRunRate: boolean;
  showTarget: boolean;
  showRunsRequired: boolean;
  showBallsRemaining: boolean;
  showBatters: boolean;
  showBowler: boolean;
  showRecentOver: boolean;
  showLiveIndicator: boolean;
  showMatchStatus: boolean;
  customScale: number;
  textScale: number;
  scoreScale: number;
  logoScale: number;
  teamNameScale: number;
  metaScale: number;
}

export const OVERLAY_MODES: readonly OverlayMode[] = ['full', 'compact', 'score_only', 'hidden'];

export const OVERLAY_POSITIONS: readonly OverlayPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export const OVERLAY_SCALES: readonly OverlayScale[] = ['small', 'medium', 'large'];

export const OVERLAY_THEMES: readonly OverlayTheme[] = [
  'maidan_dark',
  'stadium_blue',
  'red_broadcast',
  'minimal_white',
  'team_colors',
];

/**
 * Recalibrated scale multipliers:
 * - Clear 0.78 -> 1.12 -> 1.50 spread so Small, Medium, and Large look unmistakably distinct on 1080p OBS
 * - customScale (0.6x–1.65x) compounds smoothly with presets for fine sizing
 */
export const PRESET_SCALE_MULTIPLIERS: Record<OverlayScale, number> = {
  small: 0.78,
  medium: 1.12,
  large: 1.5,
};

export const OVERLAY_SLIDER_BOUNDS = {
  customScale: { min: 0.6, max: 1.65, step: 0.02, defaultVal: 1 },
  textScale: { min: 0.7, max: 1.65, step: 0.02, defaultVal: 1 },
  scoreScale: { min: 0.7, max: 1.75, step: 0.02, defaultVal: 1 },
  logoScale: { min: 0.65, max: 1.75, step: 0.02, defaultVal: 1 },
  teamNameScale: { min: 0.7, max: 1.65, step: 0.02, defaultVal: 1 },
  metaScale: { min: 0.7, max: 1.65, step: 0.02, defaultVal: 1 },
} as const;

export const DEFAULT_OVERLAY_CONFIG: BroadcastOverlayConfig = {
  visible: true,
  mode: 'full',
  position: 'bottom-center',
  scale: 'medium',
  theme: 'maidan_dark',
  style: 'broadcast_classic',
  teamAColor: '#EA580C',
  teamBColor: '#2563EB',
  showTournamentName: true,
  showTeamLogos: true,
  showRunRate: true,
  showRequiredRunRate: true,
  showTarget: true,
  showRunsRequired: true,
  showBallsRemaining: true,
  showBatters: true,
  showBowler: true,
  showRecentOver: true,
  showLiveIndicator: true,
  showMatchStatus: true,
  customScale: 1,
  textScale: 1,
  scoreScale: 1,
  logoScale: 1,
  teamNameScale: 1,
  metaScale: 1,
};

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export function sanitizeHexColor(val: unknown, fallback: string): string {
  if (typeof val === 'string' && HEX_COLOR_RE.test(val.trim())) {
    return val.trim().toUpperCase();
  }
  return fallback;
}

export function clampScaleNumber(val: unknown, min: number, max: number, fallback: number): number {
  const num = typeof val === 'number' ? val : typeof val === 'string' && val.trim() !== '' ? Number(val) : NaN;
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.min(max, Math.max(min, num));
  return Math.round(clamped * 100) / 100;
}

export function normalizeOverlayConfig(
  raw?: Partial<BroadcastOverlayConfig> | Record<string, unknown> | null
): BroadcastOverlayConfig {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<BroadcastOverlayConfig>;

  const mode: OverlayMode = OVERLAY_MODES.includes(src.mode as OverlayMode)
    ? (src.mode as OverlayMode)
    : DEFAULT_OVERLAY_CONFIG.mode;

  const position: OverlayPosition = OVERLAY_POSITIONS.includes(src.position as OverlayPosition)
    ? (src.position as OverlayPosition)
    : DEFAULT_OVERLAY_CONFIG.position;

  const scale: OverlayScale = OVERLAY_SCALES.includes(src.scale as OverlayScale)
    ? (src.scale as OverlayScale)
    : DEFAULT_OVERLAY_CONFIG.scale;

  const theme: OverlayTheme = OVERLAY_THEMES.includes(src.theme as OverlayTheme)
    ? (src.theme as OverlayTheme)
    : DEFAULT_OVERLAY_CONFIG.theme;

  const style: ScoreboardStyleId = VALID_SCOREBOARD_STYLES.includes(src.style as ScoreboardStyleId)
    ? (src.style as ScoreboardStyleId)
    : DEFAULT_OVERLAY_CONFIG.style;

  const bool = (val: unknown, def: boolean): boolean =>
    typeof val === 'boolean' ? val : def;

  return {
    visible: bool(src.visible, DEFAULT_OVERLAY_CONFIG.visible),
    mode,
    position,
    scale,
    theme,
    style,
    teamAColor: sanitizeHexColor(src.teamAColor, DEFAULT_OVERLAY_CONFIG.teamAColor),
    teamBColor: sanitizeHexColor(src.teamBColor, DEFAULT_OVERLAY_CONFIG.teamBColor),
    showTournamentName: bool(src.showTournamentName, DEFAULT_OVERLAY_CONFIG.showTournamentName),
    showTeamLogos: bool(src.showTeamLogos, DEFAULT_OVERLAY_CONFIG.showTeamLogos),
    showRunRate: bool(src.showRunRate, DEFAULT_OVERLAY_CONFIG.showRunRate),
    showRequiredRunRate: bool(src.showRequiredRunRate, DEFAULT_OVERLAY_CONFIG.showRequiredRunRate),
    showTarget: bool(src.showTarget, DEFAULT_OVERLAY_CONFIG.showTarget),
    showRunsRequired: bool(src.showRunsRequired, DEFAULT_OVERLAY_CONFIG.showRunsRequired),
    showBallsRemaining: bool(src.showBallsRemaining, DEFAULT_OVERLAY_CONFIG.showBallsRemaining),
    showBatters: bool(src.showBatters, DEFAULT_OVERLAY_CONFIG.showBatters),
    showBowler: bool(src.showBowler, DEFAULT_OVERLAY_CONFIG.showBowler),
    showRecentOver: bool(src.showRecentOver, DEFAULT_OVERLAY_CONFIG.showRecentOver),
    showLiveIndicator: bool(src.showLiveIndicator, DEFAULT_OVERLAY_CONFIG.showLiveIndicator),
    showMatchStatus: bool(src.showMatchStatus, DEFAULT_OVERLAY_CONFIG.showMatchStatus),
    customScale: clampScaleNumber(
      src.customScale,
      OVERLAY_SLIDER_BOUNDS.customScale.min,
      OVERLAY_SLIDER_BOUNDS.customScale.max,
      DEFAULT_OVERLAY_CONFIG.customScale
    ),
    textScale: clampScaleNumber(
      src.textScale,
      OVERLAY_SLIDER_BOUNDS.textScale.min,
      OVERLAY_SLIDER_BOUNDS.textScale.max,
      DEFAULT_OVERLAY_CONFIG.textScale
    ),
    scoreScale: clampScaleNumber(
      src.scoreScale,
      OVERLAY_SLIDER_BOUNDS.scoreScale.min,
      OVERLAY_SLIDER_BOUNDS.scoreScale.max,
      DEFAULT_OVERLAY_CONFIG.scoreScale
    ),
    logoScale: clampScaleNumber(
      src.logoScale,
      OVERLAY_SLIDER_BOUNDS.logoScale.min,
      OVERLAY_SLIDER_BOUNDS.logoScale.max,
      DEFAULT_OVERLAY_CONFIG.logoScale
    ),
    teamNameScale: clampScaleNumber(
      src.teamNameScale,
      OVERLAY_SLIDER_BOUNDS.teamNameScale.min,
      OVERLAY_SLIDER_BOUNDS.teamNameScale.max,
      DEFAULT_OVERLAY_CONFIG.teamNameScale
    ),
    metaScale: clampScaleNumber(
      src.metaScale,
      OVERLAY_SLIDER_BOUNDS.metaScale.min,
      OVERLAY_SLIDER_BOUNDS.metaScale.max,
      DEFAULT_OVERLAY_CONFIG.metaScale
    ),
  };
}

export function applyOverlayQueryParams(
  base: BroadcastOverlayConfig,
  search: string
): BroadcastOverlayConfig {
  if (!search) return base;
  const params = new URLSearchParams(search);
  const next: BroadcastOverlayConfig = { ...base };

  const mode = params.get('mode');
  if (mode && OVERLAY_MODES.includes(mode as OverlayMode)) {
    next.mode = mode as OverlayMode;
    if (mode === 'hidden') next.visible = false;
  }

  const position = params.get('position');
  if (position && OVERLAY_POSITIONS.includes(position as OverlayPosition)) {
    next.position = position as OverlayPosition;
  }

  const scale = params.get('scale');
  if (scale && OVERLAY_SCALES.includes(scale as OverlayScale)) {
    next.scale = scale as OverlayScale;
  }

  const theme = params.get('theme');
  if (theme && OVERLAY_THEMES.includes(theme as OverlayTheme)) {
    next.theme = theme as OverlayTheme;
  }

  const style = params.get('style');
  if (style && VALID_SCOREBOARD_STYLES.includes(style as ScoreboardStyleId)) {
    next.style = style as ScoreboardStyleId;
  }

  const teamAColor = params.get('teamAColor');
  if (teamAColor && HEX_COLOR_RE.test(teamAColor)) {
    next.teamAColor = teamAColor.toUpperCase();
  }
  const teamBColor = params.get('teamBColor');
  if (teamBColor && HEX_COLOR_RE.test(teamBColor)) {
    next.teamBColor = teamBColor.toUpperCase();
  }

  const boolKeys = [
    'visible',
    'showTournamentName',
    'showTeamLogos',
    'showRunRate',
    'showRequiredRunRate',
    'showTarget',
    'showRunsRequired',
    'showBallsRemaining',
    'showBatters',
    'showBowler',
    'showRecentOver',
    'showLiveIndicator',
    'showMatchStatus',
  ] as const;

  for (const key of boolKeys) {
    const val = params.get(key);
    if (val === 'true' || val === '1') next[key] = true;
    else if (val === 'false' || val === '0') next[key] = false;
  }

  const scaleKeys = [
    'customScale',
    'textScale',
    'scoreScale',
    'logoScale',
    'teamNameScale',
    'metaScale',
  ] as const;

  for (const key of scaleKeys) {
    const raw = params.get(key);
    if (raw !== null) {
      const bounds = OVERLAY_SLIDER_BOUNDS[key];
      next[key] = clampScaleNumber(raw, bounds.min, bounds.max, next[key]);
    }
  }

  return next;
}

export interface OverlayRenderMetrics {
  overallScale: number;
  barWidthPct: number;
  scoreFontPx: number;
  teamNameFontPx: number;
  subTeamFontPx: number;
  metaFontPx: number;
  metaLabelPx: number;
  logoMdPx: number;
  logoSmPx: number;
  brandIconPx: number;
  brandFontPx: number;
  brandPadX: number;
  brandPadY: number;
  pillFontPx: number;
  pillPadX: number;
  pillPadY: number;
  stripPadX: number;
  stripPadY: number;
  subStripPadX: number;
  subStripPadY: number;
  sectionGapPx: number;
  scorePillPadX: number;
  scorePillPadY: number;
  ballChipPx: number;
  ballChipFontPx: number;
}

function clampPx(val: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, val)));
}

/**
 * Computes responsive bar width percentage and pixel typography/spacing/logo sizing
 * from the scale preset plus granular sliders so the overlay scales unmistakably on
 * 1920x1080 landscape and 1080x1920 portrait OBS canvases without horizontal overflow.
 */
export function computeOverlayMetrics(
  config: BroadcastOverlayConfig,
  isPortrait = false
): OverlayRenderMetrics {
  const preset = PRESET_SCALE_MULTIPLIERS[config.scale] || PRESET_SCALE_MULTIPLIERS.medium;
  const custom = clampScaleNumber(
    config.customScale,
    OVERLAY_SLIDER_BOUNDS.customScale.min,
    OVERLAY_SLIDER_BOUNDS.customScale.max,
    1
  );
  const text = clampScaleNumber(
    config.textScale,
    OVERLAY_SLIDER_BOUNDS.textScale.min,
    OVERLAY_SLIDER_BOUNDS.textScale.max,
    1
  );
  const score = clampScaleNumber(
    config.scoreScale,
    OVERLAY_SLIDER_BOUNDS.scoreScale.min,
    OVERLAY_SLIDER_BOUNDS.scoreScale.max,
    1
  );
  const logo = clampScaleNumber(
    config.logoScale,
    OVERLAY_SLIDER_BOUNDS.logoScale.min,
    OVERLAY_SLIDER_BOUNDS.logoScale.max,
    1
  );
  const teamName = clampScaleNumber(
    config.teamNameScale,
    OVERLAY_SLIDER_BOUNDS.teamNameScale.min,
    OVERLAY_SLIDER_BOUNDS.teamNameScale.max,
    1
  );
  const meta = clampScaleNumber(
    config.metaScale,
    OVERLAY_SLIDER_BOUNDS.metaScale.min,
    OVERLAY_SLIDER_BOUNDS.metaScale.max,
    1
  );

  // Portrait canvas is 1080px wide vs 1920px landscape, so apply a gentle 0.88 multiplier
  const portraitDamp = isPortrait ? 0.88 : 1;
  const overallScale = Math.round(Math.min(2.4, Math.max(0.5, preset * custom * portraitDamp)) * 100) / 100;

  const barWidthPct = isPortrait
    ? overallScale < 0.92
      ? Math.round(Math.min(100, Math.max(72, 62 + overallScale * 36)))
      : 100
    : Math.round(Math.min(98, Math.max(46, 32 + overallScale * 38)));

  return {
    overallScale,
    barWidthPct,
    scoreFontPx: clampPx(22 * overallScale * score, 12, 84),
    teamNameFontPx: clampPx(16 * overallScale * text * teamName, 10, 60),
    subTeamFontPx: clampPx(12 * overallScale * text * teamName, 8.5, 40),
    metaFontPx: clampPx(12.5 * overallScale * text * meta, 9, 40),
    metaLabelPx: clampPx(10 * overallScale * text * meta, 7.5, 30),
    logoMdPx: clampPx(34 * overallScale * logo, 18, 112),
    logoSmPx: clampPx(26 * overallScale * logo, 15, 88),
    brandIconPx: clampPx(17 * overallScale * logo, 10, 56),
    brandFontPx: clampPx(12 * overallScale * text, 8, 36),
    brandPadX: clampPx(13 * overallScale, 6, 46),
    brandPadY: clampPx(8 * overallScale, 4, 30),
    pillFontPx: clampPx(10.5 * overallScale * text * meta, 7.5, 32),
    pillPadX: clampPx(10 * overallScale, 5, 30),
    pillPadY: clampPx(4.5 * overallScale, 2.5, 18),
    stripPadX: clampPx(15 * overallScale, 7, 48),
    stripPadY: clampPx(9 * overallScale, 4, 34),
    subStripPadX: clampPx(15 * overallScale, 7, 48),
    subStripPadY: clampPx(6.5 * overallScale, 3, 24),
    sectionGapPx: clampPx(13 * overallScale, 5, 42),
    scorePillPadX: clampPx(13 * overallScale, 6, 42),
    scorePillPadY: clampPx(6.5 * overallScale, 3, 26),
    ballChipPx: clampPx(21 * overallScale * meta, 13, 56),
    ballChipFontPx: clampPx(10.5 * overallScale * text * meta, 7.5, 30),
  };
}
