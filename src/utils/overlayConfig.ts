import {
  DEFAULT_EVENT_ANIMATIONS,
  normalizeEventAnimationsConfig,
  type EventAnimationConfigMap,
} from './eventAnimations.ts';

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
  | 'dynamic_capsule'
  | 'ipl_neon_ribbon'
  | 'world_cup_crest'
  | 'premier_league_bar'
  | 'pro_kabaddi_raid'
  | 'olympic_gold_clean'
  | 'cyber_grid_matrix'
  | 'retro_arcade_pixel'
  | 'champions_shield'
  | 'stealth_carbon_pro'
  | 'sunset_gradient_arc'
  | 'minimal_mono_line'
  | 'stadium_jumboscreen'
  | 'tactical_hex_pod'
  | 'arena_spotlight_bar'
  | 'custom_designer';

export type SponsorAdAnimation =
  | 'none'
  | 'pulse'
  | 'float'
  | 'glow'
  | 'shimmer'
  | 'bounce';

export type SponsorAdTransition =
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-top'
  | 'slide-bottom'
  | 'zoom'
  | 'pop'
  | 'none';

export type TimeoutDisplayMode = 'fullscreen_ad' | 'full_scoreboard' | 'none';

export type TimeoutAdPosition = 'center' | OverlayPosition;

export type TimeoutAdLayout = 'fullscreen_card' | 'floating_showcase' | 'banner_strip';

export type FullScoreboardSportCategory =
  | 'Cricket'
  | 'Kabaddi'
  | 'Football'
  | 'Volleyball'
  | 'Multi-Sport';

export type FullScoreboardStyleId =
  | 'cricket_broadcast_classic'
  | 'cricket_world_cup_royal'
  | 'cricket_ipl_stadium_neon'
  | 'cricket_test_heritage'
  | 'kabaddi_pro_mat_fire'
  | 'kabaddi_championship_gold'
  | 'kabaddi_dugout_tactical'
  | 'kabaddi_royal_akhada'
  | 'football_european_ucl'
  | 'football_premier_studio'
  | 'football_world_turf'
  | 'football_derby_crimson'
  | 'volleyball_vnl_court'
  | 'volleyball_olympic_clean'
  | 'volleyball_beach_sunset'
  | 'volleyball_neon_net'
  | 'multisport_jiohotstar_prime'
  | 'multisport_olympic_medallion'
  | 'multisport_esports_chamfer'
  | 'multisport_minimal_broadcast';

export interface FullScoreboardStyleMeta {
  id: FullScoreboardStyleId;
  name: string;
  shortName: string;
  sport: FullScoreboardSportCategory;
  accentHex: string;
  tagline: string;
}

export const FULL_SCOREBOARD_STYLES: readonly FullScoreboardStyleMeta[] = [
  // Cricket (4)
  {
    id: 'cricket_broadcast_classic',
    name: 'Cricket Pavilion Classic',
    shortName: 'Pavilion',
    sport: 'Cricket',
    accentHex: '#2563EB',
    tagline: 'Emerald pitch header, side-by-side batting/bowling ledger & run-rate ribbon',
  },
  {
    id: 'cricket_world_cup_royal',
    name: 'Cricket World Crown',
    shortName: 'WC Royal',
    sport: 'Cricket',
    accentHex: '#F59E0B',
    tagline: 'Deep royal indigo arena card with central gold crest medallion',
  },
  {
    id: 'cricket_ipl_stadium_neon',
    name: 'T20 Floodlight Neon',
    shortName: 'T20 Neon',
    sport: 'Cricket',
    accentHex: '#EC4899',
    tagline: 'High-contrast magenta & violet T20 scorecard with oversized strike badges',
  },
  {
    id: 'cricket_test_heritage',
    name: 'Test Match Heritage',
    shortName: 'Heritage',
    sport: 'Cricket',
    accentHex: '#10B981',
    tagline: 'Crisp cream & forest-green Lords-inspired full innings scorecard',
  },
  // Kabaddi (4)
  {
    id: 'kabaddi_pro_mat_fire',
    name: 'Pro Kabaddi Mat Fire',
    shortName: 'Mat Fire',
    sport: 'Kabaddi',
    accentHex: '#EA580C',
    tagline: 'Fiery saffron & charcoal combat layout spotlighting raid vs tackle breakdown',
  },
  {
    id: 'kabaddi_championship_gold',
    name: 'Kabaddi Championship Gold',
    shortName: 'Champ Gold',
    sport: 'Kabaddi',
    accentHex: '#EAB308',
    tagline: 'Obsidian & brushed gold tournament board with court player tokens',
  },
  {
    id: 'kabaddi_dugout_tactical',
    name: 'Kabaddi Tactical Matrix',
    shortName: 'Tactical',
    sport: 'Kabaddi',
    accentHex: '#06B6D4',
    tagline: 'Split teal radar deck highlighting super tackles, bonus & do-or-die pressure',
  },
  {
    id: 'kabaddi_royal_akhada',
    name: 'Royal Akhada Vermilion',
    shortName: 'Akhada',
    sport: 'Kabaddi',
    accentHex: '#DC2626',
    tagline: 'Bold vermilion & amber traditional arena full-match scorecard',
  },
  // Football (4)
  {
    id: 'football_european_ucl',
    name: 'European Starlight UCL',
    shortName: 'Starlight',
    sport: 'Football',
    accentHex: '#38BDF8',
    tagline: 'Midnight starfield stadium deck with centered match clock & timeline feed',
  },
  {
    id: 'football_premier_studio',
    name: 'Premier Matchday Studio',
    shortName: 'Matchday',
    sport: 'Football',
    accentHex: '#A855F7',
    tagline: 'Sharp violet & mint broadcast summary with card/penalty telemetry grid',
  },
  {
    id: 'football_world_turf',
    name: 'World Cup Pitch Green',
    shortName: 'Pitch Green',
    sport: 'Football',
    accentHex: '#22C55E',
    tagline: 'Deep stadium turf dark-green theme with crisp horizontal score towers',
  },
  {
    id: 'football_derby_crimson',
    name: 'Derby Night Crimson',
    shortName: 'Derby Night',
    sport: 'Football',
    accentHex: '#F43F5E',
    tagline: 'High-drama crimson & obsidian derby plate built for prime-time fixtures',
  },
  // Volleyball (4)
  {
    id: 'volleyball_vnl_court',
    name: 'Volleyball Nations Court',
    shortName: 'VNL Court',
    sport: 'Volleyball',
    accentHex: '#3B82F6',
    tagline: 'Hardwood-amber & sky-blue multi-set scoreboard highlighting active serve',
  },
  {
    id: 'volleyball_olympic_clean',
    name: 'Olympic Hall Alabaster',
    shortName: 'Olympic Hall',
    sport: 'Volleyball',
    accentHex: '#0EA5E9',
    tagline: 'High-legibility slate & glacial white indoor court set matrix',
  },
  {
    id: 'volleyball_beach_sunset',
    name: 'Arena Sunset Rally',
    shortName: 'Sunset Rally',
    sport: 'Volleyball',
    accentHex: '#F97316',
    tagline: 'Warm sunset coral & navy court scoreboard with bold set-score cards',
  },
  {
    id: 'volleyball_neon_net',
    name: 'Neon Net Pro Tour',
    shortName: 'Neon Net',
    sport: 'Volleyball',
    accentHex: '#14B8A6',
    tagline: 'Electric teal & ultraviolet arena tour board for rapid rally tracking',
  },
  // Multi-Sport / Universal (4)
  {
    id: 'multisport_jiohotstar_prime',
    name: 'Broadcast Prime Blue',
    shortName: 'Prime Blue',
    sport: 'Multi-Sport',
    accentHex: '#3B82F6',
    tagline: 'Signature MaidanLive full-screen match center for all sports',
  },
  {
    id: 'multisport_olympic_medallion',
    name: 'Championship Medallion',
    shortName: 'Medallion',
    sport: 'Multi-Sport',
    accentHex: '#F59E0B',
    tagline: 'Centered championship emblem flanked by oversized dual team score blocks',
  },
  {
    id: 'multisport_esports_chamfer',
    name: 'Cyber Chamfer Arena',
    shortName: 'Chamfer HUD',
    sport: 'Multi-Sport',
    accentHex: '#8B5CF6',
    tagline: 'Razor-angled cyber sports broadcast deck with high-contrast telemetry tiles',
  },
  {
    id: 'multisport_minimal_broadcast',
    name: 'Clean Monochrome Studio',
    shortName: 'Monochrome',
    sport: 'Multi-Sport',
    accentHex: '#94A3B8',
    tagline: 'Ultra-crisp obsidian slate broadcast sheet with distraction-free typography',
  },
];

export const VALID_FULL_SCOREBOARD_STYLES: readonly FullScoreboardStyleId[] =
  FULL_SCOREBOARD_STYLES.map((s) => s.id);

export const TIMEOUT_AD_POSITIONS: readonly TimeoutAdPosition[] = [
  'center',
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export const TIMEOUT_AD_LAYOUTS: readonly TimeoutAdLayout[] = [
  'fullscreen_card',
  'floating_showcase',
  'banner_strip',
];

export const SPONSOR_AD_ANIMATIONS: readonly SponsorAdAnimation[] = [
  'none',
  'pulse',
  'float',
  'glow',
  'shimmer',
  'bounce',
];

export const SPONSOR_AD_TRANSITIONS: readonly SponsorAdTransition[] = [
  'fade',
  'slide-left',
  'slide-right',
  'slide-top',
  'slide-bottom',
  'zoom',
  'pop',
  'none',
];

export const TIMEOUT_DISPLAY_MODES: readonly TimeoutDisplayMode[] = [
  'fullscreen_ad',
  'full_scoreboard',
  'none',
];

export const SPONSOR_AD_TIMING_BOUNDS = {
  sponsorAdDurationSeconds: { min: 2, max: 300, step: 1, defaultVal: 12 },
  sponsorAdTransitionMs: { min: 100, max: 3000, step: 50, defaultVal: 450 },
  sponsorAdRepeatIntervalSeconds: { min: 0, max: 3600, step: 1, defaultVal: 20 },
  sponsorAdScale: { min: 0.65, max: 1.5, step: 0.05, defaultVal: 1 },
  sponsorAdOffsetX: { min: 0, max: 240, step: 4, defaultVal: 34 },
  sponsorAdOffsetY: { min: 0, max: 240, step: 4, defaultVal: 28 },
  timeoutAdDurationSeconds: { min: 0, max: 300, step: 1, defaultVal: 0 },
  timeoutAdTransitionMs: { min: 100, max: 3000, step: 50, defaultVal: 450 },
  timeoutAdScale: { min: 0.65, max: 1.4, step: 0.05, defaultVal: 1 },
} as const;

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
  {
    id: 'ipl_neon_ribbon',
    name: 'T20 Neon Ribbon',
    shortName: 'T20 Neon',
    tagline: 'High-voltage magenta & indigo stadium ribbon with illuminated score badges',
  },
  {
    id: 'world_cup_crest',
    name: 'World Cup Crest',
    shortName: 'WC Crest',
    tagline: 'Diagonal royal team wings framing a championship medallion core',
  },
  {
    id: 'premier_league_bar',
    name: 'Premier Matchday Bar',
    shortName: 'Premier Bar',
    tagline: 'Crisp European broadcast bar with razor-sharp center clock module',
  },
  {
    id: 'pro_kabaddi_raid',
    name: 'Pro Arena Raid Deck',
    shortName: 'Arena Raid',
    tagline: 'Fiery saffron & electric cyan combat plate built for high-tempo action',
  },
  {
    id: 'olympic_gold_clean',
    name: 'Olympic Gold Clean',
    shortName: 'Olympic Gold',
    tagline: 'Alabaster & metallic gold podium strip with razor-crisp contrast',
  },
  {
    id: 'cyber_grid_matrix',
    name: 'Cyber Grid Matrix',
    shortName: 'Cyber Grid',
    tagline: 'Futurist neon scanline grid with holographic edge telemetry rails',
  },
  {
    id: 'retro_arcade_pixel',
    name: 'Arcade Versus Deck',
    shortName: 'Arcade VS',
    tagline: 'Crisp arcade fight-card frame with vibrant angled health-bar wings',
  },
  {
    id: 'champions_shield',
    name: 'Champions Armor Shield',
    shortName: 'Champ Armor',
    tagline: 'Brushed gunmetal deck with twin crest shields & metallic center seal',
  },
  {
    id: 'stealth_carbon_pro',
    name: 'Stealth Carbon Pro',
    shortName: 'Carbon Pro',
    tagline: 'Matte carbon fiber deck with precision crimson & emerald LED pips',
  },
  {
    id: 'sunset_gradient_arc',
    name: 'Sunset Broadcast Arc',
    shortName: 'Sunset Arc',
    tagline: 'Warm saffron-to-crimson TV gradient bar with luminous pill counters',
  },
  {
    id: 'minimal_mono_line',
    name: 'Minimal Hairline Strip',
    shortName: 'Hairline',
    tagline: 'Ultra-clean smoked hairline frame with zero visual clutter',
  },
  {
    id: 'stadium_jumboscreen',
    name: 'Stadium Jumbotron',
    shortName: 'Jumbotron',
    tagline: 'Bold floodlit arena LED display with wide marquee telemetry ticker',
  },
  {
    id: 'tactical_hex_pod',
    name: 'Tactical Hex Nexus',
    shortName: 'Hex Nexus',
    tagline: 'Hexagonal tactical center hub linking dual armored team wings',
  },
  {
    id: 'arena_spotlight_bar',
    name: 'Arena Spotlight Bar',
    shortName: 'Spotlight',
    tagline: 'Floodlit broadcast stage deck with oversized high-contrast score tiles',
  },
  {
    id: 'custom_designer',
    name: 'Custom Designed Scoreboard',
    shortName: 'Custom Build',
    tagline: 'Your bespoke scoreboard built with custom colors, borders, glow & typography',
  },
];

export const VALID_SCOREBOARD_STYLES: readonly ScoreboardStyleId[] = SCOREBOARD_STYLES.map(
  (s) => s.id
);

const VITE_BRAND_LOGO =
  typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_BRAND_LOGO_URL
    ? String((import.meta as { env?: Record<string, string> }).env?.VITE_BRAND_LOGO_URL).trim()
    : '';
const PROC_BRAND_LOGO =
  typeof process !== 'undefined' && (process.env?.VITE_BRAND_LOGO_URL || process.env?.BRAND_LOGO_URL)
    ? String(process.env.VITE_BRAND_LOGO_URL || process.env.BRAND_LOGO_URL).trim()
    : '';

export const DEFAULT_BRAND_LOGO_URL =
  VITE_BRAND_LOGO ||
  PROC_BRAND_LOGO ||
  'https://res.cloudinary.com/dbexuvouv/image/upload/v1795534866/maidanlive/logo/Neon_Sports_Broadcast_Logo_with_Slogan_hhyz1d.png';

export type CustomScoreboardLayoutVariant =
  | 'classic_bar'
  | 'split_wings'
  | 'floating_pill'
  | 'angled_ribbon'
  | 'compact_tower';

export type CustomScoreboardFontFamily = 'display' | 'sans' | 'mono';
export type CustomScoreboardFontWeight = 'bold' | 'extrabold' | 'black';

export interface CustomScoreboardDesign {
  layoutVariant: CustomScoreboardLayoutVariant;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  accentColor: string;
  textColor: string;
  subStripColor: string;
  borderColor: string;
  borderWidth: number;
  glowColor: string;
  glowIntensity: number;
  borderRadius: number;
  fontFamily: CustomScoreboardFontFamily;
  fontWeight: CustomScoreboardFontWeight;
  showBorders: boolean;
  showGradient: boolean;
  showShadow: boolean;
  showDivider: boolean;
  showTelemetryBar: boolean;
}

export const CUSTOM_LAYOUT_VARIANTS: readonly CustomScoreboardLayoutVariant[] = [
  'classic_bar',
  'split_wings',
  'floating_pill',
  'angled_ribbon',
  'compact_tower',
];

export const CUSTOM_FONT_FAMILIES: readonly CustomScoreboardFontFamily[] = [
  'display',
  'sans',
  'mono',
];

export const CUSTOM_FONT_WEIGHTS: readonly CustomScoreboardFontWeight[] = [
  'bold',
  'extrabold',
  'black',
];

export const CUSTOM_DESIGN_BOUNDS = {
  backgroundOpacity: { min: 0.35, max: 1, step: 0.05, defaultVal: 0.92 },
  borderWidth: { min: 0, max: 6, step: 1, defaultVal: 2 },
  glowIntensity: { min: 0, max: 40, step: 2, defaultVal: 16 },
  borderRadius: { min: 0, max: 32, step: 2, defaultVal: 12 },
} as const;

export const DEFAULT_CUSTOM_SCOREBOARD_DESIGN: CustomScoreboardDesign = {
  layoutVariant: 'classic_bar',
  primaryColor: '#EC4899',
  secondaryColor: '#3B82F6',
  backgroundColor: '#090D1A',
  backgroundOpacity: 0.92,
  accentColor: '#F59E0B',
  textColor: '#F8FAFC',
  subStripColor: '#050811',
  borderColor: '#A855F7',
  borderWidth: 2,
  glowColor: '#EC4899',
  glowIntensity: 16,
  borderRadius: 12,
  fontFamily: 'display',
  fontWeight: 'extrabold',
  showBorders: true,
  showGradient: true,
  showShadow: true,
  showDivider: true,
  showTelemetryBar: true,
};

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
  showBrandLogo: boolean;
  brandLogoUrl: string;
  brandLogoPosition: OverlayPosition;
  brandLogoSize: number;
  brandLogoOpacity: number;
  brandLogoOffsetX: number;
  brandLogoOffsetY: number;
  sponsorAdVisible: boolean;
  sponsorAdId: string;
  sponsorAdName: string;
  sponsorAdTagline: string;
  sponsorAdLogoUrl: string;
  sponsorAdCta: string;
  sponsorAdPosition: OverlayPosition;
  sponsorAdDurationSeconds: number;
  sponsorAdAnimation: SponsorAdAnimation;
  sponsorAdTransition: SponsorAdTransition;
  sponsorAdTransitionMs: number;
  sponsorAdRepeatIntervalSeconds: number;
  sponsorAdRepeatContinuously: boolean;
  sponsorAdScale: number;
  sponsorAdOffsetX: number;
  sponsorAdOffsetY: number;
  timeoutDisplayMode: TimeoutDisplayMode;
  timeoutFullscreenSponsorAdActive: boolean;
  timeoutAdSponsorId: string;
  timeoutAdTitle: string;
  timeoutAdSubtitle: string;
  timeoutAdLogoUrl: string;
  timeoutAdCta: string;
  timeoutAdBadgeText: string;
  timeoutAdPosition: TimeoutAdPosition;
  timeoutAdLayout: TimeoutAdLayout;
  timeoutAdDurationSeconds: number;
  timeoutAdAnimation: SponsorAdAnimation;
  timeoutAdTransition: SponsorAdTransition;
  timeoutAdTransitionMs: number;
  timeoutAdScale: number;
  fullScoreboardVisible: boolean;
  fullScoreboardStyle: FullScoreboardStyleId;
  customScoreboardDesign: CustomScoreboardDesign;
  eventAnimations: EventAnimationConfigMap;
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

export const BRAND_LOGO_BOUNDS = {
  brandLogoSize: { min: 28, max: 200, step: 2, defaultVal: 72 },
  brandLogoOpacity: { min: 0.2, max: 1, step: 0.05, defaultVal: 0.95 },
  brandLogoOffsetX: { min: 0, max: 200, step: 2, defaultVal: 24 },
  brandLogoOffsetY: { min: 0, max: 200, step: 2, defaultVal: 20 },
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
  showBrandLogo: true,
  brandLogoUrl: '',
  brandLogoPosition: 'top-left',
  brandLogoSize: BRAND_LOGO_BOUNDS.brandLogoSize.defaultVal,
  brandLogoOpacity: BRAND_LOGO_BOUNDS.brandLogoOpacity.defaultVal,
  brandLogoOffsetX: BRAND_LOGO_BOUNDS.brandLogoOffsetX.defaultVal,
  brandLogoOffsetY: BRAND_LOGO_BOUNDS.brandLogoOffsetY.defaultVal,
  sponsorAdVisible: false,
  sponsorAdId: '',
  sponsorAdName: '',
  sponsorAdTagline: '',
  sponsorAdLogoUrl: '',
  sponsorAdCta: '',
  sponsorAdPosition: 'top-right',
  sponsorAdDurationSeconds: SPONSOR_AD_TIMING_BOUNDS.sponsorAdDurationSeconds.defaultVal,
  sponsorAdAnimation: 'pulse',
  sponsorAdTransition: 'slide-right',
  sponsorAdTransitionMs: SPONSOR_AD_TIMING_BOUNDS.sponsorAdTransitionMs.defaultVal,
  sponsorAdRepeatIntervalSeconds: SPONSOR_AD_TIMING_BOUNDS.sponsorAdRepeatIntervalSeconds.defaultVal,
  sponsorAdRepeatContinuously: true,
  sponsorAdScale: SPONSOR_AD_TIMING_BOUNDS.sponsorAdScale.defaultVal,
  sponsorAdOffsetX: SPONSOR_AD_TIMING_BOUNDS.sponsorAdOffsetX.defaultVal,
  sponsorAdOffsetY: SPONSOR_AD_TIMING_BOUNDS.sponsorAdOffsetY.defaultVal,
  timeoutDisplayMode: 'fullscreen_ad',
  timeoutFullscreenSponsorAdActive: false,
  timeoutAdSponsorId: '',
  timeoutAdTitle: '',
  timeoutAdSubtitle: '',
  timeoutAdLogoUrl: '',
  timeoutAdCta: '',
  timeoutAdBadgeText: 'TIMEOUT PARTNER SPOTLIGHT',
  timeoutAdPosition: 'center',
  timeoutAdLayout: 'fullscreen_card',
  timeoutAdDurationSeconds: SPONSOR_AD_TIMING_BOUNDS.timeoutAdDurationSeconds.defaultVal,
  timeoutAdAnimation: 'pulse',
  timeoutAdTransition: 'zoom',
  timeoutAdTransitionMs: SPONSOR_AD_TIMING_BOUNDS.timeoutAdTransitionMs.defaultVal,
  timeoutAdScale: SPONSOR_AD_TIMING_BOUNDS.timeoutAdScale.defaultVal,
  fullScoreboardVisible: false,
  fullScoreboardStyle: 'multisport_jiohotstar_prime',
  customScoreboardDesign: { ...DEFAULT_CUSTOM_SCOREBOARD_DESIGN },
  eventAnimations: normalizeEventAnimationsConfig(DEFAULT_EVENT_ANIMATIONS),
};

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export function sanitizeHexColor(val: unknown, fallback: string): string {
  if (typeof val === 'string' && HEX_COLOR_RE.test(val.trim())) {
    return val.trim().toUpperCase();
  }
  return fallback;
}

export function sanitizeBrandLogoUrl(val: unknown): string {
  if (typeof val !== 'string') return '';
  const trimmed = val.trim().slice(0, 500);
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')) {
    return trimmed;
  }
  return '';
}

export function resolveBrandLogoUrl(
  config?: Partial<BroadcastOverlayConfig> | null,
  serverLogoUrl?: string | null
): string {
  const custom = sanitizeBrandLogoUrl(config?.brandLogoUrl);
  if (custom) return custom;
  const server = sanitizeBrandLogoUrl(serverLogoUrl);
  if (server) return server;
  return DEFAULT_BRAND_LOGO_URL;
}

/**
 * Displays the full team name on all landscape/wide screens, and shows the
 * compact team code name on portrait screens.
 */
export function resolveScoreboardTeamName(
  fullName: string,
  shortCode: string,
  isPortrait = false
): string {
  const safeFull = (fullName || '').trim() || (shortCode || '').trim() || 'TEAM';
  const safeShort = (shortCode || '').trim() || safeFull;
  return isPortrait ? safeShort : safeFull;
}

export function hexToRgba(hex: string, alpha = 1): string {
  const safe = sanitizeHexColor(hex, '#090D1A');
  const r = parseInt(safe.slice(1, 3), 16);
  const g = parseInt(safe.slice(3, 5), 16);
  const b = parseInt(safe.slice(5, 7), 16);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function clampScaleNumber(val: unknown, min: number, max: number, fallback: number): number {
  const num = typeof val === 'number' ? val : typeof val === 'string' && val.trim() !== '' ? Number(val) : NaN;
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.min(max, Math.max(min, num));
  return Math.round(clamped * 100) / 100;
}

export function normalizeCustomScoreboardDesign(
  raw?: Partial<CustomScoreboardDesign> | Record<string, unknown> | null
): CustomScoreboardDesign {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<CustomScoreboardDesign>;
  const bool = (val: unknown, def: boolean): boolean => (typeof val === 'boolean' ? val : def);

  const layoutVariant: CustomScoreboardLayoutVariant = CUSTOM_LAYOUT_VARIANTS.includes(
    src.layoutVariant as CustomScoreboardLayoutVariant
  )
    ? (src.layoutVariant as CustomScoreboardLayoutVariant)
    : DEFAULT_CUSTOM_SCOREBOARD_DESIGN.layoutVariant;

  const fontFamily: CustomScoreboardFontFamily = CUSTOM_FONT_FAMILIES.includes(
    src.fontFamily as CustomScoreboardFontFamily
  )
    ? (src.fontFamily as CustomScoreboardFontFamily)
    : DEFAULT_CUSTOM_SCOREBOARD_DESIGN.fontFamily;

  const fontWeight: CustomScoreboardFontWeight = CUSTOM_FONT_WEIGHTS.includes(
    src.fontWeight as CustomScoreboardFontWeight
  )
    ? (src.fontWeight as CustomScoreboardFontWeight)
    : DEFAULT_CUSTOM_SCOREBOARD_DESIGN.fontWeight;

  return {
    layoutVariant,
    primaryColor: sanitizeHexColor(src.primaryColor, DEFAULT_CUSTOM_SCOREBOARD_DESIGN.primaryColor),
    secondaryColor: sanitizeHexColor(
      src.secondaryColor,
      DEFAULT_CUSTOM_SCOREBOARD_DESIGN.secondaryColor
    ),
    backgroundColor: sanitizeHexColor(
      src.backgroundColor,
      DEFAULT_CUSTOM_SCOREBOARD_DESIGN.backgroundColor
    ),
    backgroundOpacity: clampScaleNumber(
      src.backgroundOpacity,
      CUSTOM_DESIGN_BOUNDS.backgroundOpacity.min,
      CUSTOM_DESIGN_BOUNDS.backgroundOpacity.max,
      DEFAULT_CUSTOM_SCOREBOARD_DESIGN.backgroundOpacity
    ),
    accentColor: sanitizeHexColor(src.accentColor, DEFAULT_CUSTOM_SCOREBOARD_DESIGN.accentColor),
    textColor: sanitizeHexColor(src.textColor, DEFAULT_CUSTOM_SCOREBOARD_DESIGN.textColor),
    subStripColor: sanitizeHexColor(
      src.subStripColor,
      DEFAULT_CUSTOM_SCOREBOARD_DESIGN.subStripColor
    ),
    borderColor: sanitizeHexColor(src.borderColor, DEFAULT_CUSTOM_SCOREBOARD_DESIGN.borderColor),
    borderWidth: Math.round(
      clampScaleNumber(
        src.borderWidth,
        CUSTOM_DESIGN_BOUNDS.borderWidth.min,
        CUSTOM_DESIGN_BOUNDS.borderWidth.max,
        DEFAULT_CUSTOM_SCOREBOARD_DESIGN.borderWidth
      )
    ),
    glowColor: sanitizeHexColor(src.glowColor, DEFAULT_CUSTOM_SCOREBOARD_DESIGN.glowColor),
    glowIntensity: Math.round(
      clampScaleNumber(
        src.glowIntensity,
        CUSTOM_DESIGN_BOUNDS.glowIntensity.min,
        CUSTOM_DESIGN_BOUNDS.glowIntensity.max,
        DEFAULT_CUSTOM_SCOREBOARD_DESIGN.glowIntensity
      )
    ),
    borderRadius: Math.round(
      clampScaleNumber(
        src.borderRadius,
        CUSTOM_DESIGN_BOUNDS.borderRadius.min,
        CUSTOM_DESIGN_BOUNDS.borderRadius.max,
        DEFAULT_CUSTOM_SCOREBOARD_DESIGN.borderRadius
      )
    ),
    fontFamily,
    fontWeight,
    showBorders: bool(src.showBorders, DEFAULT_CUSTOM_SCOREBOARD_DESIGN.showBorders),
    showGradient: bool(src.showGradient, DEFAULT_CUSTOM_SCOREBOARD_DESIGN.showGradient),
    showShadow: bool(src.showShadow, DEFAULT_CUSTOM_SCOREBOARD_DESIGN.showShadow),
    showDivider: bool(src.showDivider, DEFAULT_CUSTOM_SCOREBOARD_DESIGN.showDivider),
    showTelemetryBar: bool(src.showTelemetryBar, DEFAULT_CUSTOM_SCOREBOARD_DESIGN.showTelemetryBar),
  };
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

  const brandLogoPosition: OverlayPosition = OVERLAY_POSITIONS.includes(
    src.brandLogoPosition as OverlayPosition
  )
    ? (src.brandLogoPosition as OverlayPosition)
    : DEFAULT_OVERLAY_CONFIG.brandLogoPosition;

  const sponsorAdPosition: OverlayPosition = OVERLAY_POSITIONS.includes(
    src.sponsorAdPosition as OverlayPosition
  )
    ? (src.sponsorAdPosition as OverlayPosition)
    : DEFAULT_OVERLAY_CONFIG.sponsorAdPosition;

  const scale: OverlayScale = OVERLAY_SCALES.includes(src.scale as OverlayScale)
    ? (src.scale as OverlayScale)
    : DEFAULT_OVERLAY_CONFIG.scale;

  const theme: OverlayTheme = OVERLAY_THEMES.includes(src.theme as OverlayTheme)
    ? (src.theme as OverlayTheme)
    : DEFAULT_OVERLAY_CONFIG.theme;

  const style: ScoreboardStyleId = VALID_SCOREBOARD_STYLES.includes(src.style as ScoreboardStyleId)
    ? (src.style as ScoreboardStyleId)
    : DEFAULT_OVERLAY_CONFIG.style;

  const sponsorAdAnimation: SponsorAdAnimation = SPONSOR_AD_ANIMATIONS.includes(
    src.sponsorAdAnimation as SponsorAdAnimation
  )
    ? (src.sponsorAdAnimation as SponsorAdAnimation)
    : DEFAULT_OVERLAY_CONFIG.sponsorAdAnimation;

  const sponsorAdTransition: SponsorAdTransition = SPONSOR_AD_TRANSITIONS.includes(
    src.sponsorAdTransition as SponsorAdTransition
  )
    ? (src.sponsorAdTransition as SponsorAdTransition)
    : DEFAULT_OVERLAY_CONFIG.sponsorAdTransition;

  const timeoutDisplayMode: TimeoutDisplayMode = TIMEOUT_DISPLAY_MODES.includes(
    src.timeoutDisplayMode as TimeoutDisplayMode
  )
    ? (src.timeoutDisplayMode as TimeoutDisplayMode)
    : DEFAULT_OVERLAY_CONFIG.timeoutDisplayMode;

  const timeoutAdPosition: TimeoutAdPosition = TIMEOUT_AD_POSITIONS.includes(
    src.timeoutAdPosition as TimeoutAdPosition
  )
    ? (src.timeoutAdPosition as TimeoutAdPosition)
    : DEFAULT_OVERLAY_CONFIG.timeoutAdPosition;

  const timeoutAdLayout: TimeoutAdLayout = TIMEOUT_AD_LAYOUTS.includes(
    src.timeoutAdLayout as TimeoutAdLayout
  )
    ? (src.timeoutAdLayout as TimeoutAdLayout)
    : DEFAULT_OVERLAY_CONFIG.timeoutAdLayout;

  const timeoutAdAnimation: SponsorAdAnimation = SPONSOR_AD_ANIMATIONS.includes(
    src.timeoutAdAnimation as SponsorAdAnimation
  )
    ? (src.timeoutAdAnimation as SponsorAdAnimation)
    : DEFAULT_OVERLAY_CONFIG.timeoutAdAnimation;

  const timeoutAdTransition: SponsorAdTransition = SPONSOR_AD_TRANSITIONS.includes(
    src.timeoutAdTransition as SponsorAdTransition
  )
    ? (src.timeoutAdTransition as SponsorAdTransition)
    : DEFAULT_OVERLAY_CONFIG.timeoutAdTransition;

  const fullScoreboardStyle: FullScoreboardStyleId = VALID_FULL_SCOREBOARD_STYLES.includes(
    src.fullScoreboardStyle as FullScoreboardStyleId
  )
    ? (src.fullScoreboardStyle as FullScoreboardStyleId)
    : DEFAULT_OVERLAY_CONFIG.fullScoreboardStyle;

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
    showBrandLogo: bool(src.showBrandLogo, DEFAULT_OVERLAY_CONFIG.showBrandLogo),
    brandLogoUrl: sanitizeBrandLogoUrl(src.brandLogoUrl),
    brandLogoPosition,
    brandLogoSize: Math.round(
      clampScaleNumber(
        src.brandLogoSize,
        BRAND_LOGO_BOUNDS.brandLogoSize.min,
        BRAND_LOGO_BOUNDS.brandLogoSize.max,
        DEFAULT_OVERLAY_CONFIG.brandLogoSize
      )
    ),
    brandLogoOpacity: clampScaleNumber(
      src.brandLogoOpacity,
      BRAND_LOGO_BOUNDS.brandLogoOpacity.min,
      BRAND_LOGO_BOUNDS.brandLogoOpacity.max,
      DEFAULT_OVERLAY_CONFIG.brandLogoOpacity
    ),
    brandLogoOffsetX: Math.round(
      clampScaleNumber(
        src.brandLogoOffsetX,
        BRAND_LOGO_BOUNDS.brandLogoOffsetX.min,
        BRAND_LOGO_BOUNDS.brandLogoOffsetX.max,
        DEFAULT_OVERLAY_CONFIG.brandLogoOffsetX
      )
    ),
    brandLogoOffsetY: Math.round(
      clampScaleNumber(
        src.brandLogoOffsetY,
        BRAND_LOGO_BOUNDS.brandLogoOffsetY.min,
        BRAND_LOGO_BOUNDS.brandLogoOffsetY.max,
        DEFAULT_OVERLAY_CONFIG.brandLogoOffsetY
      )
    ),
    sponsorAdVisible: bool(src.sponsorAdVisible, DEFAULT_OVERLAY_CONFIG.sponsorAdVisible),
    sponsorAdId: typeof src.sponsorAdId === 'string' ? src.sponsorAdId.trim().slice(0, 80) : '',
    sponsorAdName: typeof src.sponsorAdName === 'string' ? src.sponsorAdName.trim().slice(0, 120) : '',
    sponsorAdTagline:
      typeof src.sponsorAdTagline === 'string' ? src.sponsorAdTagline.trim().slice(0, 200) : '',
    sponsorAdLogoUrl: sanitizeBrandLogoUrl(src.sponsorAdLogoUrl),
    sponsorAdCta: typeof src.sponsorAdCta === 'string' ? src.sponsorAdCta.trim().slice(0, 60) : '',
    sponsorAdPosition,
    sponsorAdDurationSeconds: Math.round(
      clampScaleNumber(
        src.sponsorAdDurationSeconds,
        SPONSOR_AD_TIMING_BOUNDS.sponsorAdDurationSeconds.min,
        SPONSOR_AD_TIMING_BOUNDS.sponsorAdDurationSeconds.max,
        DEFAULT_OVERLAY_CONFIG.sponsorAdDurationSeconds
      )
    ),
    sponsorAdAnimation,
    sponsorAdTransition,
    sponsorAdTransitionMs: Math.round(
      clampScaleNumber(
        src.sponsorAdTransitionMs,
        SPONSOR_AD_TIMING_BOUNDS.sponsorAdTransitionMs.min,
        SPONSOR_AD_TIMING_BOUNDS.sponsorAdTransitionMs.max,
        DEFAULT_OVERLAY_CONFIG.sponsorAdTransitionMs
      )
    ),
    sponsorAdRepeatIntervalSeconds: Math.round(
      clampScaleNumber(
        src.sponsorAdRepeatIntervalSeconds,
        SPONSOR_AD_TIMING_BOUNDS.sponsorAdRepeatIntervalSeconds.min,
        SPONSOR_AD_TIMING_BOUNDS.sponsorAdRepeatIntervalSeconds.max,
        DEFAULT_OVERLAY_CONFIG.sponsorAdRepeatIntervalSeconds
      )
    ),
    sponsorAdRepeatContinuously: bool(
      src.sponsorAdRepeatContinuously,
      DEFAULT_OVERLAY_CONFIG.sponsorAdRepeatContinuously
    ),
    sponsorAdScale: clampScaleNumber(
      src.sponsorAdScale,
      SPONSOR_AD_TIMING_BOUNDS.sponsorAdScale.min,
      SPONSOR_AD_TIMING_BOUNDS.sponsorAdScale.max,
      DEFAULT_OVERLAY_CONFIG.sponsorAdScale
    ),
    sponsorAdOffsetX: Math.round(
      clampScaleNumber(
        src.sponsorAdOffsetX,
        SPONSOR_AD_TIMING_BOUNDS.sponsorAdOffsetX.min,
        SPONSOR_AD_TIMING_BOUNDS.sponsorAdOffsetX.max,
        DEFAULT_OVERLAY_CONFIG.sponsorAdOffsetX
      )
    ),
    sponsorAdOffsetY: Math.round(
      clampScaleNumber(
        src.sponsorAdOffsetY,
        SPONSOR_AD_TIMING_BOUNDS.sponsorAdOffsetY.min,
        SPONSOR_AD_TIMING_BOUNDS.sponsorAdOffsetY.max,
        DEFAULT_OVERLAY_CONFIG.sponsorAdOffsetY
      )
    ),
    timeoutDisplayMode,
    timeoutFullscreenSponsorAdActive: bool(
      src.timeoutFullscreenSponsorAdActive,
      DEFAULT_OVERLAY_CONFIG.timeoutFullscreenSponsorAdActive
    ),
    timeoutAdSponsorId:
      typeof src.timeoutAdSponsorId === 'string' ? src.timeoutAdSponsorId.trim().slice(0, 80) : '',
    timeoutAdTitle:
      typeof src.timeoutAdTitle === 'string' ? src.timeoutAdTitle.trim().slice(0, 120) : '',
    timeoutAdSubtitle:
      typeof src.timeoutAdSubtitle === 'string' ? src.timeoutAdSubtitle.trim().slice(0, 200) : '',
    timeoutAdLogoUrl: sanitizeBrandLogoUrl(src.timeoutAdLogoUrl),
    timeoutAdCta:
      typeof src.timeoutAdCta === 'string' ? src.timeoutAdCta.trim().slice(0, 60) : '',
    timeoutAdBadgeText:
      typeof src.timeoutAdBadgeText === 'string' && src.timeoutAdBadgeText.trim()
        ? src.timeoutAdBadgeText.trim().slice(0, 60)
        : DEFAULT_OVERLAY_CONFIG.timeoutAdBadgeText,
    timeoutAdPosition,
    timeoutAdLayout,
    timeoutAdDurationSeconds: Math.round(
      clampScaleNumber(
        src.timeoutAdDurationSeconds,
        SPONSOR_AD_TIMING_BOUNDS.timeoutAdDurationSeconds.min,
        SPONSOR_AD_TIMING_BOUNDS.timeoutAdDurationSeconds.max,
        DEFAULT_OVERLAY_CONFIG.timeoutAdDurationSeconds
      )
    ),
    timeoutAdAnimation,
    timeoutAdTransition,
    timeoutAdTransitionMs: Math.round(
      clampScaleNumber(
        src.timeoutAdTransitionMs,
        SPONSOR_AD_TIMING_BOUNDS.timeoutAdTransitionMs.min,
        SPONSOR_AD_TIMING_BOUNDS.timeoutAdTransitionMs.max,
        DEFAULT_OVERLAY_CONFIG.timeoutAdTransitionMs
      )
    ),
    timeoutAdScale: clampScaleNumber(
      src.timeoutAdScale,
      SPONSOR_AD_TIMING_BOUNDS.timeoutAdScale.min,
      SPONSOR_AD_TIMING_BOUNDS.timeoutAdScale.max,
      DEFAULT_OVERLAY_CONFIG.timeoutAdScale
    ),
    fullScoreboardVisible: bool(
      src.fullScoreboardVisible,
      DEFAULT_OVERLAY_CONFIG.fullScoreboardVisible
    ),
    fullScoreboardStyle,
    customScoreboardDesign: normalizeCustomScoreboardDesign(src.customScoreboardDesign),
    eventAnimations: normalizeEventAnimationsConfig(src.eventAnimations),
  };
}

export function applyOverlayQueryParams(
  base: BroadcastOverlayConfig,
  search: string
): BroadcastOverlayConfig {
  if (!search) return base;
  const params = new URLSearchParams(search);
  const next: BroadcastOverlayConfig = {
    ...base,
    customScoreboardDesign: { ...base.customScoreboardDesign },
    eventAnimations: normalizeEventAnimationsConfig(base.eventAnimations),
  };

  const mode = params.get('mode');
  if (mode && OVERLAY_MODES.includes(mode as OverlayMode)) {
    next.mode = mode as OverlayMode;
    if (mode === 'hidden') next.visible = false;
  }

  const position = params.get('position');
  if (position && OVERLAY_POSITIONS.includes(position as OverlayPosition)) {
    next.position = position as OverlayPosition;
  }

  const brandLogoPosition = params.get('brandLogoPosition');
  if (brandLogoPosition && OVERLAY_POSITIONS.includes(brandLogoPosition as OverlayPosition)) {
    next.brandLogoPosition = brandLogoPosition as OverlayPosition;
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

  const sponsorAdPosition = params.get('sponsorAdPosition');
  if (sponsorAdPosition && OVERLAY_POSITIONS.includes(sponsorAdPosition as OverlayPosition)) {
    next.sponsorAdPosition = sponsorAdPosition as OverlayPosition;
  }

  const sponsorAdAnimation = params.get('sponsorAdAnimation');
  if (sponsorAdAnimation && SPONSOR_AD_ANIMATIONS.includes(sponsorAdAnimation as SponsorAdAnimation)) {
    next.sponsorAdAnimation = sponsorAdAnimation as SponsorAdAnimation;
  }

  const sponsorAdTransition = params.get('sponsorAdTransition');
  if (
    sponsorAdTransition &&
    SPONSOR_AD_TRANSITIONS.includes(sponsorAdTransition as SponsorAdTransition)
  ) {
    next.sponsorAdTransition = sponsorAdTransition as SponsorAdTransition;
  }

  const timeoutDisplayMode = params.get('timeoutDisplayMode');
  if (timeoutDisplayMode && TIMEOUT_DISPLAY_MODES.includes(timeoutDisplayMode as TimeoutDisplayMode)) {
    next.timeoutDisplayMode = timeoutDisplayMode as TimeoutDisplayMode;
  }

  const timeoutAdPosition = params.get('timeoutAdPosition');
  if (timeoutAdPosition && TIMEOUT_AD_POSITIONS.includes(timeoutAdPosition as TimeoutAdPosition)) {
    next.timeoutAdPosition = timeoutAdPosition as TimeoutAdPosition;
  }

  const timeoutAdLayout = params.get('timeoutAdLayout');
  if (timeoutAdLayout && TIMEOUT_AD_LAYOUTS.includes(timeoutAdLayout as TimeoutAdLayout)) {
    next.timeoutAdLayout = timeoutAdLayout as TimeoutAdLayout;
  }

  const timeoutAdAnimation = params.get('timeoutAdAnimation');
  if (
    timeoutAdAnimation &&
    SPONSOR_AD_ANIMATIONS.includes(timeoutAdAnimation as SponsorAdAnimation)
  ) {
    next.timeoutAdAnimation = timeoutAdAnimation as SponsorAdAnimation;
  }

  const timeoutAdTransition = params.get('timeoutAdTransition');
  if (
    timeoutAdTransition &&
    SPONSOR_AD_TRANSITIONS.includes(timeoutAdTransition as SponsorAdTransition)
  ) {
    next.timeoutAdTransition = timeoutAdTransition as SponsorAdTransition;
  }

  const fullScoreboardStyle = params.get('fullScoreboardStyle');
  if (
    fullScoreboardStyle &&
    VALID_FULL_SCOREBOARD_STYLES.includes(fullScoreboardStyle as FullScoreboardStyleId)
  ) {
    next.fullScoreboardStyle = fullScoreboardStyle as FullScoreboardStyleId;
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
    'showBrandLogo',
    'sponsorAdVisible',
    'sponsorAdRepeatContinuously',
    'timeoutFullscreenSponsorAdActive',
    'fullScoreboardVisible',
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

  const logoNumKeys = [
    'brandLogoSize',
    'brandLogoOpacity',
    'brandLogoOffsetX',
    'brandLogoOffsetY',
  ] as const;

  for (const key of logoNumKeys) {
    const raw = params.get(key);
    if (raw !== null) {
      const bounds = BRAND_LOGO_BOUNDS[key];
      next[key] = clampScaleNumber(raw, bounds.min, bounds.max, next[key]);
    }
  }

  const sponsorTimingKeys = [
    'sponsorAdDurationSeconds',
    'sponsorAdTransitionMs',
    'sponsorAdRepeatIntervalSeconds',
    'sponsorAdOffsetX',
    'sponsorAdOffsetY',
    'timeoutAdDurationSeconds',
    'timeoutAdTransitionMs',
  ] as const;

  for (const key of sponsorTimingKeys) {
    const raw = params.get(key);
    if (raw !== null) {
      const bounds = SPONSOR_AD_TIMING_BOUNDS[key];
      next[key] = Math.round(clampScaleNumber(raw, bounds.min, bounds.max, next[key]));
    }
  }

  const sponsorFloatKeys = ['sponsorAdScale', 'timeoutAdScale'] as const;
  for (const key of sponsorFloatKeys) {
    const raw = params.get(key);
    if (raw !== null) {
      const bounds = SPONSOR_AD_TIMING_BOUNDS[key];
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
