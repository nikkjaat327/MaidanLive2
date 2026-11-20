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

export interface BroadcastOverlayConfig {
  visible: boolean;
  mode: OverlayMode;
  position: OverlayPosition;
  scale: OverlayScale;
  theme: OverlayTheme;
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

export const DEFAULT_OVERLAY_CONFIG: BroadcastOverlayConfig = {
  visible: true,
  mode: 'full',
  position: 'bottom-left',
  scale: 'medium',
  theme: 'maidan_dark',
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
};

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export function sanitizeHexColor(val: unknown, fallback: string): string {
  if (typeof val === 'string' && HEX_COLOR_RE.test(val.trim())) {
    return val.trim().toUpperCase();
  }
  return fallback;
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

  const bool = (val: unknown, def: boolean): boolean =>
    typeof val === 'boolean' ? val : def;

  return {
    visible: bool(src.visible, DEFAULT_OVERLAY_CONFIG.visible),
    mode,
    position,
    scale,
    theme,
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

  return next;
}
