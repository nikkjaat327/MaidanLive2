export type BroadcastEventKey =
  | 'SUPER_RAID'
  | 'DO_OR_DIE_RAID'
  | 'SUPER_TACKLE'
  | 'ALL_OUT'
  | 'SIX'
  | 'FOUR'
  | 'WICKET'
  | 'NO_BALL'
  | 'GOAL'
  | 'FOUL'
  | 'SET_WIN';

export type EventSportGroup = 'Kabaddi' | 'Cricket' | 'Football' | 'Volleyball';

export type EventAnimationPositionPreset =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'custom';

export type EventMotionFamily =
  | 'star_shockwave'
  | 'pkl_ember_wipe'
  | 'neon_cyber_slam'
  | 'gold_ribbon_3d'
  | 'stadium_fireworks'
  | 'lightning_arc'
  | 'royal_crest'
  | 'laser_prism'
  | 'arena_banner_sweep'
  | 'flame_burst';

export type EventPatternStyle =
  | 'diagonal_slats'
  | 'hex_pulse'
  | 'radial_rays'
  | 'prism_shards'
  | 'stadium_rings'
  | 'flame_grid'
  | 'circuit_lines'
  | 'crown_crest'
  | 'cyber_scan'
  | 'gold_foil';

export interface EventAnimationOption {
  id: string;
  index: number;
  name: string;
  tagline: string;
  motionFamily: EventMotionFamily;
  pattern: EventPatternStyle;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  badgeText: string;
  headlineOverride?: string;
}

export interface EventAnimationRuleConfig {
  enabled: boolean;
  styleId: string;
  durationSeconds: number;
  positionPreset: EventAnimationPositionPreset;
  xPct: number;
  yPct: number;
  scale: number;
}

export type EventAnimationConfigMap = Record<BroadcastEventKey, EventAnimationRuleConfig>;

export interface BroadcastEventMeta {
  key: BroadcastEventKey;
  label: string;
  shortLabel: string;
  sport: EventSportGroup;
  defaultHeadline: string;
  defaultSubtitle: string;
  badge: string;
  defaultDurationSeconds: number;
  defaultPositionPreset: EventAnimationPositionPreset;
  defaultXPct: number;
  defaultYPct: number;
  defaultScale: number;
}

export interface BroadcastEventTriggerPayload {
  streamId: string;
  eventId: string;
  eventKey: BroadcastEventKey;
  sportType?: string;
  teamSide?: 'A' | 'B' | '';
  teamName?: string;
  opponentName?: string;
  teamColor?: string;
  playerName?: string;
  subtitle?: string;
  pointsLabel?: string;
  triggeredAtIso: string;
  manualOverride?: boolean;
  previewStyleId?: string;
}

export const BROADCAST_EVENT_KEYS: readonly BroadcastEventKey[] = [
  'SUPER_RAID',
  'DO_OR_DIE_RAID',
  'SUPER_TACKLE',
  'ALL_OUT',
  'SIX',
  'FOUR',
  'WICKET',
  'NO_BALL',
  'GOAL',
  'FOUL',
  'SET_WIN',
];

export const EVENT_ANIMATION_BOUNDS = {
  durationSeconds: { min: 1.5, max: 15, step: 0.5, defaultVal: 4 },
  xPct: { min: 8, max: 92, step: 1, defaultVal: 50 },
  yPct: { min: 10, max: 90, step: 1, defaultVal: 48 },
  scale: { min: 0.5, max: 1.8, step: 0.05, defaultVal: 1 },
} as const;

export const EVENT_POSITION_PRESETS: readonly {
  id: EventAnimationPositionPreset;
  label: string;
  xPct: number;
  yPct: number;
}[] = [
  { id: 'top-left', label: 'Top Left', xPct: 22, yPct: 18 },
  { id: 'top-center', label: 'Top Center', xPct: 50, yPct: 18 },
  { id: 'top-right', label: 'Top Right', xPct: 78, yPct: 18 },
  { id: 'center', label: 'Center Stage', xPct: 50, yPct: 48 },
  { id: 'bottom-left', label: 'Bottom Left', xPct: 22, yPct: 76 },
  { id: 'bottom-center', label: 'Lower Third', xPct: 50, yPct: 76 },
  { id: 'bottom-right', label: 'Bottom Right', xPct: 78, yPct: 76 },
  { id: 'custom', label: 'Custom X / Y', xPct: 50, yPct: 48 },
];

export const BROADCAST_EVENT_META: Record<BroadcastEventKey, BroadcastEventMeta> = {
  SUPER_RAID: {
    key: 'SUPER_RAID',
    label: 'Super Raid',
    shortLabel: 'Super Raid',
    sport: 'Kabaddi',
    defaultHeadline: 'SUPER RAID!',
    defaultSubtitle: '3+ POINTS IN A SINGLE RAID',
    badge: 'PKL MOMENTUM',
    defaultDurationSeconds: 4.5,
    defaultPositionPreset: 'center',
    defaultXPct: 50,
    defaultYPct: 46,
    defaultScale: 1,
  },
  DO_OR_DIE_RAID: {
    key: 'DO_OR_DIE_RAID',
    label: 'Do or Die Raid',
    shortLabel: 'Do or Die',
    sport: 'Kabaddi',
    defaultHeadline: 'DO OR DIE RAID',
    defaultSubtitle: 'MUST SCORE OR GET TACKLED OUT',
    badge: 'HIGH PRESSURE',
    defaultDurationSeconds: 4,
    defaultPositionPreset: 'top-center',
    defaultXPct: 50,
    defaultYPct: 20,
    defaultScale: 1,
  },
  SUPER_TACKLE: {
    key: 'SUPER_TACKLE',
    label: 'Super Tackle',
    shortLabel: 'Super Tackle',
    sport: 'Kabaddi',
    defaultHeadline: 'SUPER TACKLE!',
    defaultSubtitle: 'DEFENSE LOCKS DOWN · +2 POINTS',
    badge: 'IRON DEFENSE',
    defaultDurationSeconds: 4.5,
    defaultPositionPreset: 'center',
    defaultXPct: 50,
    defaultYPct: 46,
    defaultScale: 1,
  },
  ALL_OUT: {
    key: 'ALL_OUT',
    label: 'All Out',
    shortLabel: 'All Out',
    sport: 'Kabaddi',
    defaultHeadline: 'ALL OUT!',
    defaultSubtitle: 'COMPLETE WIPEOUT · +2 BONUS POINTS',
    badge: 'LONA AWARDED',
    defaultDurationSeconds: 5,
    defaultPositionPreset: 'center',
    defaultXPct: 50,
    defaultYPct: 48,
    defaultScale: 1.05,
  },
  SIX: {
    key: 'SIX',
    label: 'Six',
    shortLabel: 'Six (6)',
    sport: 'Cricket',
    defaultHeadline: 'MAXIMUM SIX!',
    defaultSubtitle: 'SOARING OVER THE BOUNDARY ROPES',
    badge: '+6 RUNS',
    defaultDurationSeconds: 4,
    defaultPositionPreset: 'center',
    defaultXPct: 50,
    defaultYPct: 46,
    defaultScale: 1,
  },
  FOUR: {
    key: 'FOUR',
    label: 'Four',
    shortLabel: 'Four (4)',
    sport: 'Cricket',
    defaultHeadline: 'CRACKING FOUR!',
    defaultSubtitle: 'RACING TO THE BOUNDARY',
    badge: '+4 RUNS',
    defaultDurationSeconds: 3.5,
    defaultPositionPreset: 'bottom-center',
    defaultXPct: 50,
    defaultYPct: 74,
    defaultScale: 1,
  },
  WICKET: {
    key: 'WICKET',
    label: 'Wicket',
    shortLabel: 'Wicket',
    sport: 'Cricket',
    defaultHeadline: 'WICKET!',
    defaultSubtitle: 'MASSIVE BREAKTHROUGH',
    badge: 'OUT!',
    defaultDurationSeconds: 4.5,
    defaultPositionPreset: 'center',
    defaultXPct: 50,
    defaultYPct: 46,
    defaultScale: 1,
  },
  NO_BALL: {
    key: 'NO_BALL',
    label: 'No Ball',
    shortLabel: 'No Ball',
    sport: 'Cricket',
    defaultHeadline: 'NO BALL!',
    defaultSubtitle: 'FREE HIT INCOMING · +1 EXTRA',
    badge: 'FREE HIT',
    defaultDurationSeconds: 3.5,
    defaultPositionPreset: 'top-center',
    defaultXPct: 50,
    defaultYPct: 20,
    defaultScale: 0.95,
  },
  GOAL: {
    key: 'GOAL',
    label: 'Goal',
    shortLabel: 'Goal!',
    sport: 'Football',
    defaultHeadline: 'GOOOAL!',
    defaultSubtitle: 'BACK OF THE NET',
    badge: 'MATCH GOAL',
    defaultDurationSeconds: 5,
    defaultPositionPreset: 'center',
    defaultXPct: 50,
    defaultYPct: 48,
    defaultScale: 1.05,
  },
  FOUL: {
    key: 'FOUL',
    label: 'Foul / Card',
    shortLabel: 'Foul',
    sport: 'Football',
    defaultHeadline: 'FOUL!',
    defaultSubtitle: 'REFEREE STOPPAGE & CARD ALERT',
    badge: 'DISCIPLINE',
    defaultDurationSeconds: 3.5,
    defaultPositionPreset: 'top-center',
    defaultXPct: 50,
    defaultYPct: 20,
    defaultScale: 0.95,
  },
  SET_WIN: {
    key: 'SET_WIN',
    label: 'Set Win',
    shortLabel: 'Set Win',
    sport: 'Volleyball',
    defaultHeadline: 'SET WON!',
    defaultSubtitle: 'SET VICTORY CLINCHED',
    badge: 'SET POINT',
    defaultDurationSeconds: 5,
    defaultPositionPreset: 'center',
    defaultXPct: 50,
    defaultYPct: 48,
    defaultScale: 1.05,
  },
};

interface StyleBlueprint {
  suffix: string;
  name: string;
  tagline: string;
  motionFamily: EventMotionFamily;
  pattern: EventPatternStyle;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
}

const TEN_BROADCAST_STYLE_ARCHETYPES: Record<BroadcastEventKey, readonly StyleBlueprint[]> = {
  SUPER_RAID: [
    { suffix: 'pkl_ember', name: 'PKL Mat Inferno', tagline: 'Saffron fire plates with flying ember trails', motionFamily: 'pkl_ember_wipe', pattern: 'flame_grid', primaryHex: '#EA580C', secondaryHex: '#B91C1C', accentHex: '#FACC15' },
    { suffix: 'hotstar_star', name: 'Hotstar Shockwave', tagline: '3D starburst shockwave & sapphire-gold sweep', motionFamily: 'star_shockwave', pattern: 'radial_rays', primaryHex: '#1D4ED8', secondaryHex: '#7C3AED', accentHex: '#FBBF24' },
    { suffix: 'neon_cyber', name: 'Cyber Raid Slam', tagline: 'Electric cyan & magenta chamfered HUD slam', motionFamily: 'neon_cyber_slam', pattern: 'cyber_scan', primaryHex: '#06B6D4', secondaryHex: '#D946EF', accentHex: '#FDE047' },
    { suffix: 'gold_ribbon', name: 'Royal Gold Ribbon', tagline: 'Championship 3D metallic gold wing ribbon', motionFamily: 'gold_ribbon_3d', pattern: 'gold_foil', primaryHex: '#D97706', secondaryHex: '#78350F', accentHex: '#FEF08A' },
    { suffix: 'fireworks', name: 'Arena Fireworks Burst', tagline: 'Stadium pyro sparks & dazzling radial rings', motionFamily: 'stadium_fireworks', pattern: 'stadium_rings', primaryHex: '#F97316', secondaryHex: '#9333EA', accentHex: '#38BDF8' },
    { suffix: 'lightning', name: 'Thunder Volt Strike', tagline: 'High-voltage lightning arc & obsidian shield', motionFamily: 'lightning_arc', pattern: 'circuit_lines', primaryHex: '#2563EB', secondaryHex: '#0F172A', accentHex: '#22D3EE' },
    { suffix: 'royal_crest', name: 'Maharaja Akhada Crest', tagline: 'Regal crimson-gold armored medallion', motionFamily: 'royal_crest', pattern: 'crown_crest', primaryHex: '#DC2626', secondaryHex: '#450A0A', accentHex: '#F59E0B' },
    { suffix: 'laser_prism', name: 'Prism Laser Velocity', tagline: 'Refracted neon laser shards & angled bars', motionFamily: 'laser_prism', pattern: 'prism_shards', primaryHex: '#EC4899', secondaryHex: '#4F46E5', accentHex: '#67E8F9' },
    { suffix: 'arena_sweep', name: 'Pro Arena Wide Sweep', tagline: 'Full-width slanted TV marquee ribbon', motionFamily: 'arena_banner_sweep', pattern: 'diagonal_slats', primaryHex: '#EA580C', secondaryHex: '#0F172A', accentHex: '#34D399' },
    { suffix: 'flame_burst', name: 'Supernova Magma Core', tagline: 'Superheated magma core with pulsing shock rings', motionFamily: 'flame_burst', pattern: 'hex_pulse', primaryHex: '#F43F5E', secondaryHex: '#991B1B', accentHex: '#FDE047' },
  ],
  DO_OR_DIE_RAID: [
    { suffix: 'crimson_siren', name: 'Crimson Hazard Alert', tagline: 'Pulsing red-amber tactical broadcast alert', motionFamily: 'lightning_arc', pattern: 'diagonal_slats', primaryHex: '#DC2626', secondaryHex: '#7F1D1D', accentHex: '#FBBF24' },
    { suffix: 'pkl_ember', name: 'PKL Pressure Cooker', tagline: 'Fiery saffron warning sweep with ember sparks', motionFamily: 'pkl_ember_wipe', pattern: 'flame_grid', primaryHex: '#EA580C', secondaryHex: '#450A0A', accentHex: '#EF4444' },
    { suffix: 'neon_cyber', name: 'Tactical Radar Lockdown', tagline: 'Neon crimson cyber radar scan & hazard chevron', motionFamily: 'neon_cyber_slam', pattern: 'cyber_scan', primaryHex: '#E11D48', secondaryHex: '#1E1B4B', accentHex: '#22D3EE' },
    { suffix: 'star_shockwave', name: 'Hotstar Redline Shockwave', tagline: 'High-stakes crimson shockwave plate', motionFamily: 'star_shockwave', pattern: 'radial_rays', primaryHex: '#B91C1C', secondaryHex: '#1E293B', accentHex: '#FDE047' },
    { suffix: 'flame_burst', name: 'Blazing Stakes Core', tagline: 'Intense amber-red flame ring burst', motionFamily: 'flame_burst', pattern: 'hex_pulse', primaryHex: '#F97316', secondaryHex: '#991B1B', accentHex: '#FEF08A' },
    { suffix: 'arena_sweep', name: 'Mat Hazard Ribbon', tagline: 'Diagonal hazard-stripe broadcast banner', motionFamily: 'arena_banner_sweep', pattern: 'diagonal_slats', primaryHex: '#EF4444', secondaryHex: '#090D16', accentHex: '#F59E0B' },
    { suffix: 'laser_prism', name: 'Viper Prism Surge', tagline: 'Sharp violet-scarlet laser warning plate', motionFamily: 'laser_prism', pattern: 'prism_shards', primaryHex: '#BE123C', secondaryHex: '#581C87', accentHex: '#38BDF8' },
    { suffix: 'gold_ribbon', name: 'Clutch Gold & Scarlet', tagline: '3D championship scarlet-gold clash plate', motionFamily: 'gold_ribbon_3d', pattern: 'gold_foil', primaryHex: '#B91C1C', secondaryHex: '#78350F', accentHex: '#FACC15' },
    { suffix: 'royal_crest', name: 'Gladiator Shield Alert', tagline: 'Armored dark steel crest with ember pulse', motionFamily: 'royal_crest', pattern: 'crown_crest', primaryHex: '#991B1B', secondaryHex: '#0F172A', accentHex: '#FB923C' },
    { suffix: 'fireworks', name: 'Stadium Tension Flare', tagline: 'Spark-flare floodlight ring ignition', motionFamily: 'stadium_fireworks', pattern: 'stadium_rings', primaryHex: '#E11D48', secondaryHex: '#0F172A', accentHex: '#FBBF24' },
  ],
  SUPER_TACKLE: [
    { suffix: 'steel_shockwave', name: 'Iron Shield Shockwave', tagline: 'Armored cyan-cobalt shockwave tackle', motionFamily: 'star_shockwave', pattern: 'hex_pulse', primaryHex: '#0284C7', secondaryHex: '#0F172A', accentHex: '#38BDF8' },
    { suffix: 'neon_cyber', name: 'Cyber Chain Lockdown', tagline: 'Electric teal-indigo cyber defense slam', motionFamily: 'neon_cyber_slam', pattern: 'cyber_scan', primaryHex: '#06B6D4', secondaryHex: '#312E81', accentHex: '#A7F3D0' },
    { suffix: 'pkl_ember', name: 'PKL Titanium Slam', tagline: 'Heavy slate & electric orange defense wipe', motionFamily: 'pkl_ember_wipe', pattern: 'diagonal_slats', primaryHex: '#2563EB', secondaryHex: '#1E293B', accentHex: '#FB923C' },
    { suffix: 'lightning', name: 'Thunder Grip Strike', tagline: 'Electric arc impact with neon blue sparks', motionFamily: 'lightning_arc', pattern: 'circuit_lines', primaryHex: '#0EA5E9', secondaryHex: '#1E1B4B', accentHex: '#FDE047' },
    { suffix: 'royal_crest', name: 'Spartan Defense Crest', tagline: 'Heavy metallic defense shield & 2-pt crown', motionFamily: 'royal_crest', pattern: 'crown_crest', primaryHex: '#0369A1', secondaryHex: '#0F172A', accentHex: '#F59E0B' },
    { suffix: 'gold_ribbon', name: 'Championship Wall 3D', tagline: 'Emerald & gold 3D broadcast defense wing', motionFamily: 'gold_ribbon_3d', pattern: 'gold_foil', primaryHex: '#059669', secondaryHex: '#064E3B', accentHex: '#FDE047' },
    { suffix: 'laser_prism', name: 'Hyper-Prism Intercept', tagline: 'Angled indigo-cyan laser refraction plate', motionFamily: 'laser_prism', pattern: 'prism_shards', primaryHex: '#4F46E5', secondaryHex: '#0F172A', accentHex: '#22D3EE' },
    { suffix: 'fireworks', name: 'Arena Roar Defense', tagline: 'Cobalt stadium spark explosion & shield', motionFamily: 'stadium_fireworks', pattern: 'stadium_rings', primaryHex: '#1D4ED8', secondaryHex: '#4C1D95', accentHex: '#34D399' },
    { suffix: 'arena_sweep', name: 'Tactical Wall Marquee', tagline: 'Crisp full-width blue-teal intercept bar', motionFamily: 'arena_banner_sweep', pattern: 'diagonal_slats', primaryHex: '#0891B2', secondaryHex: '#090D16', accentHex: '#FBBF24' },
    { suffix: 'flame_burst', name: 'Blue Plasma Burst', tagline: 'Supercharged plasma ring tackle detonation', motionFamily: 'flame_burst', pattern: 'radial_rays', primaryHex: '#2563EB', secondaryHex: '#7C3AED', accentHex: '#67E8F9' },
  ],
  ALL_OUT: [
    { suffix: 'lona_inferno', name: 'PKL Lona Inferno', tagline: 'Full crimson-gold wipeout with +2 bonus plate', motionFamily: 'flame_burst', pattern: 'flame_grid', primaryHex: '#DC2626', secondaryHex: '#7C2D12', accentHex: '#FACC15' },
    { suffix: 'star_shockwave', name: 'Hotstar Mega Wipeout', tagline: 'Massive concentric shockwaves & royal flare', motionFamily: 'star_shockwave', pattern: 'radial_rays', primaryHex: '#9333EA', secondaryHex: '#B91C1C', accentHex: '#FDE047' },
    { suffix: 'gold_ribbon', name: 'Imperial Gold Lona', tagline: 'Heavy 3D brushed gold championship sweep', motionFamily: 'gold_ribbon_3d', pattern: 'gold_foil', primaryHex: '#B45309', secondaryHex: '#451A03', accentHex: '#FEF08A' },
    { suffix: 'fireworks', name: 'Stadium Pyro Wipeout', tagline: 'Twin stadium fireworks & illuminated wings', motionFamily: 'stadium_fireworks', pattern: 'stadium_rings', primaryHex: '#EA580C', secondaryHex: '#881337', accentHex: '#38BDF8' },
    { suffix: 'neon_cyber', name: 'Cyber Demolition Slam', tagline: 'Neon magenta-orange glitch demolition plate', motionFamily: 'neon_cyber_slam', pattern: 'cyber_scan', primaryHex: '#E11D48', secondaryHex: '#1E1B4B', accentHex: '#22D3EE' },
    { suffix: 'royal_crest', name: 'Sovereign Knockout Crest', tagline: 'Crowned obsidian crest with scarlet wings', motionFamily: 'royal_crest', pattern: 'crown_crest', primaryHex: '#B91C1C', secondaryHex: '#090D16', accentHex: '#FBBF24' },
    { suffix: 'pkl_ember', name: 'Akhada Firestorm', tagline: 'Blazing orange storm sweep across the mat', motionFamily: 'pkl_ember_wipe', pattern: 'flame_grid', primaryHex: '#F97316', secondaryHex: '#7F1D1D', accentHex: '#FEF08A' },
    { suffix: 'lightning', name: 'Shock Strike Elimination', tagline: 'Twin lightning arcs & crimson thunder plate', motionFamily: 'lightning_arc', pattern: 'circuit_lines', primaryHex: '#DC2626', secondaryHex: '#0F172A', accentHex: '#38BDF8' },
    { suffix: 'laser_prism', name: 'Prism Shatter Out', tagline: 'Shattering neon shards on full elimination', motionFamily: 'laser_prism', pattern: 'prism_shards', primaryHex: '#EC4899', secondaryHex: '#312E81', accentHex: '#FDE047' },
    { suffix: 'arena_sweep', name: 'Arena Knockout Ribbon', tagline: 'Heavy horizontal TV knockout takeover strip', motionFamily: 'arena_banner_sweep', pattern: 'diagonal_slats', primaryHex: '#991B1B', secondaryHex: '#0F172A', accentHex: '#F59E0B' },
  ],
  SIX: [
    { suffix: 'hotstar_solar', name: 'Hotstar Solar Six', tagline: 'Signature golden comet & royal blue 6-plate', motionFamily: 'star_shockwave', pattern: 'radial_rays', primaryHex: '#1D4ED8', secondaryHex: '#4338CA', accentHex: '#FACC15' },
    { suffix: 't20_neon', name: 'T20 Neon Hyper-Six', tagline: 'High-voltage magenta & cyan stadium blast', motionFamily: 'neon_cyber_slam', pattern: 'cyber_scan', primaryHex: '#EC4899', secondaryHex: '#4C1D95', accentHex: '#22D3EE' },
    { suffix: 'fireworks', name: 'Stadium Fireworks 6', tagline: 'Explosive multi-color cricket night fireworks', motionFamily: 'stadium_fireworks', pattern: 'stadium_rings', primaryHex: '#F59E0B', secondaryHex: '#1E1B4B', accentHex: '#38BDF8' },
    { suffix: 'gold_crown', name: 'World Crown Gold 6', tagline: 'Royal brushed gold 3D trophy wing', motionFamily: 'gold_ribbon_3d', pattern: 'gold_foil', primaryHex: '#D97706', secondaryHex: '#1E293B', accentHex: '#FEF08A' },
    { suffix: 'lightning', name: 'Thunderbolt Maximum', tagline: 'Electric cyan-gold thunderbolt sky shot', motionFamily: 'lightning_arc', pattern: 'circuit_lines', primaryHex: '#0284C7', secondaryHex: '#0F172A', accentHex: '#FDE047' },
    { suffix: 'pkl_ember', name: 'Saffron Rocket Six', tagline: 'Blazing orange comet trail across the night sky', motionFamily: 'pkl_ember_wipe', pattern: 'flame_grid', primaryHex: '#EA580C', secondaryHex: '#7C2D12', accentHex: '#FDE047' },
    { suffix: 'laser_prism', name: 'Laser Prism Launch', tagline: 'Refracted violet-emerald stadium laser beams', motionFamily: 'laser_prism', pattern: 'prism_shards', primaryHex: '#7C3AED', secondaryHex: '#064E3B', accentHex: '#34D399' },
    { suffix: 'royal_crest', name: 'Royal Pavilion Crest 6', tagline: 'Deep emerald & gold heritage crest badge', motionFamily: 'royal_crest', pattern: 'crown_crest', primaryHex: '#059669', secondaryHex: '#0F172A', accentHex: '#FBBF24' },
    { suffix: 'arena_sweep', name: 'Supersonic Crowd Ribbon', tagline: 'Sleek angled broadcast speed ribbon', motionFamily: 'arena_banner_sweep', pattern: 'diagonal_slats', primaryHex: '#2563EB', secondaryHex: '#090D16', accentHex: '#FB923C' },
    { suffix: 'flame_burst', name: 'Supernova Crowd Ignition', tagline: 'Radiant plasma starburst with 3D 6 emblem', motionFamily: 'flame_burst', pattern: 'hex_pulse', primaryHex: '#DB2777', secondaryHex: '#1E1B4B', accentHex: '#FACC15' },
  ],
  FOUR: [
    { suffix: 'emerald_laser', name: 'Emerald Boundary Streak', tagline: 'Crisp turf-emerald laser speed sweep', motionFamily: 'laser_prism', pattern: 'diagonal_slats', primaryHex: '#059669', secondaryHex: '#064E3B', accentHex: '#34D399' },
    { suffix: 'hotstar_blue', name: 'Hotstar Crisp 4-Plate', tagline: 'Electric sapphire & sky-cyan broadcast ribbon', motionFamily: 'star_shockwave', pattern: 'radial_rays', primaryHex: '#0284C7', secondaryHex: '#1E3A8A', accentHex: '#38BDF8' },
    { suffix: 'neon_cyber', name: 'Neon Velocity Four', tagline: 'Cyber lime & cyan boundary flash strip', motionFamily: 'neon_cyber_slam', pattern: 'cyber_scan', primaryHex: '#10B981', secondaryHex: '#0F172A', accentHex: '#22D3EE' },
    { suffix: 'arena_sweep', name: 'Outfield Rocket Strip', tagline: 'Fast horizontal turf-to-rope TV sweep', motionFamily: 'arena_banner_sweep', pattern: 'diagonal_slats', primaryHex: '#16A34A', secondaryHex: '#0F172A', accentHex: '#FDE047' },
    { suffix: 'gold_ribbon', name: 'Classic Stroke Gold 4', tagline: '3D brushed gold & navy boundary badge', motionFamily: 'gold_ribbon_3d', pattern: 'gold_foil', primaryHex: '#1D4ED8', secondaryHex: '#0F172A', accentHex: '#FACC15' },
    { suffix: 'lightning', name: 'Razor Arc Boundary', tagline: 'Crisp electric lightning tracer to the fence', motionFamily: 'lightning_arc', pattern: 'circuit_lines', primaryHex: '#0891B2', secondaryHex: '#090D16', accentHex: '#67E8F9' },
    { suffix: 'fireworks', name: 'T20 Boundary Spark', tagline: 'Vibrant teal-indigo spark flare', motionFamily: 'stadium_fireworks', pattern: 'stadium_rings', primaryHex: '#0D9488', secondaryHex: '#312E81', accentHex: '#FBBF24' },
    { suffix: 'pkl_ember', name: 'Sunset Whip Four', tagline: 'Amber-orange crisp cover-drive flash', motionFamily: 'pkl_ember_wipe', pattern: 'flame_grid', primaryHex: '#D97706', secondaryHex: '#1E293B', accentHex: '#FEF08A' },
    { suffix: 'royal_crest', name: 'Pavilion Heritage 4', tagline: 'Forest green & platinum championship plaque', motionFamily: 'royal_crest', pattern: 'crown_crest', primaryHex: '#047857', secondaryHex: '#0F172A', accentHex: '#E2E8F0' },
    { suffix: 'flame_burst', name: 'Sonic Turf Pulse', tagline: 'Mint-cobalt shock ring boundary pop', motionFamily: 'flame_burst', pattern: 'hex_pulse', primaryHex: '#0EA5E9', secondaryHex: '#065F46', accentHex: '#A7F3D0' },
  ],
  WICKET: [
    { suffix: 'crimson_shatter', name: 'Stump Shatter Crimson', tagline: 'Explosive red shockwave with flying bails', motionFamily: 'flame_burst', pattern: 'radial_rays', primaryHex: '#DC2626', secondaryHex: '#450A0A', accentHex: '#FACC15' },
    { suffix: 'hotstar_wicket', name: 'Hotstar Breakthrough', tagline: 'Deep crimson & midnight navy dramatic drop', motionFamily: 'star_shockwave', pattern: 'diagonal_slats', primaryHex: '#B91C1C', secondaryHex: '#0F172A', accentHex: '#F87171' },
    { suffix: 'neon_cyber', name: 'Cyber Timber Strike', tagline: 'Sharp crimson-violet glitch strike plate', motionFamily: 'neon_cyber_slam', pattern: 'cyber_scan', primaryHex: '#E11D48', secondaryHex: '#1E1B4B', accentHex: '#38BDF8' },
    { suffix: 'lightning', name: 'Deadly Yorker Bolt', tagline: 'High-speed lightning strike & shattered wickets', motionFamily: 'lightning_arc', pattern: 'circuit_lines', primaryHex: '#991B1B', secondaryHex: '#090D16', accentHex: '#FDE047' },
    { suffix: 'pkl_ember', name: 'Fireball Dismissal', tagline: 'Scarlet-amber ember explosion plate', motionFamily: 'pkl_ember_wipe', pattern: 'flame_grid', primaryHex: '#EF4444', secondaryHex: '#7C2D12', accentHex: '#FEF08A' },
    { suffix: 'royal_crest', name: 'Obsidian Out Crest', tagline: 'Heavy dark obsidian badge with blood-red trim', motionFamily: 'royal_crest', pattern: 'crown_crest', primaryHex: '#B91C1C', secondaryHex: '#020617', accentHex: '#E2E8F0' },
    { suffix: 'laser_prism', name: 'Zing Bail Laser', tagline: 'Illuminated LED stump crimson laser shards', motionFamily: 'laser_prism', pattern: 'prism_shards', primaryHex: '#F43F5E', secondaryHex: '#312E81', accentHex: '#FDE047' },
    { suffix: 'fireworks', name: 'Stadium Roar Wicket', tagline: 'Crowd-roar crimson spark ring burst', motionFamily: 'stadium_fireworks', pattern: 'stadium_rings', primaryHex: '#DC2626', secondaryHex: '#1E293B', accentHex: '#FB923C' },
    { suffix: 'gold_ribbon', name: 'Golden Arm Breakthrough', tagline: 'Crimson & gold 3D marquee wicket ribbon', motionFamily: 'gold_ribbon_3d', pattern: 'gold_foil', primaryHex: '#991B1B', secondaryHex: '#78350F', accentHex: '#FACC15' },
    { suffix: 'arena_sweep', name: 'Pitch Side Out Strip', tagline: 'Clean diagonal red-obsidian TV alert bar', motionFamily: 'arena_banner_sweep', pattern: 'diagonal_slats', primaryHex: '#E11D48', secondaryHex: '#0F172A', accentHex: '#FFFFFF' },
  ],
  NO_BALL: [
    { suffix: 'amber_siren', name: 'Free Hit Siren Amber', tagline: 'Flashing amber-gold siren bar with FREE HIT flare', motionFamily: 'neon_cyber_slam', pattern: 'diagonal_slats', primaryHex: '#F59E0B', secondaryHex: '#78350F', accentHex: '#FEF08A' },
    { suffix: 'hotstar_noball', name: 'Hotstar Free Hit Alert', tagline: 'Crisp gold & navy boundary-ready notice', motionFamily: 'star_shockwave', pattern: 'radial_rays', primaryHex: '#D97706', secondaryHex: '#1E293B', accentHex: '#38BDF8' },
    { suffix: 'lightning', name: 'Front-Foot Laser Line', tagline: 'Glowing amber-red third-umpire crease flash', motionFamily: 'lightning_arc', pattern: 'cyber_scan', primaryHex: '#EA580C', secondaryHex: '#090D16', accentHex: '#FACC15' },
    { suffix: 'arena_sweep', name: 'Crease Violation Strip', tagline: 'High-contrast yellow-black hazard TV ribbon', motionFamily: 'arena_banner_sweep', pattern: 'diagonal_slats', primaryHex: '#EAB308', secondaryHex: '#0F172A', accentHex: '#EF4444' },
    { suffix: 'pkl_ember', name: 'Saffron Overstep Flare', tagline: 'Warm orange-gold sweeping alert plate', motionFamily: 'pkl_ember_wipe', pattern: 'flame_grid', primaryHex: '#F97316', secondaryHex: '#451A03', accentHex: '#FEF08A' },
    { suffix: 'laser_prism', name: 'Neon Free Hit Prism', tagline: 'Electric lime-amber prism alert bar', motionFamily: 'laser_prism', pattern: 'prism_shards', primaryHex: '#F59E0B', secondaryHex: '#1E1B4B', accentHex: '#22D3EE' },
    { suffix: 'gold_ribbon', name: 'Golden Opportunity 3D', tagline: 'Polished gold 3D FREE HIT announcement wing', motionFamily: 'gold_ribbon_3d', pattern: 'gold_foil', primaryHex: '#CA8A04', secondaryHex: '#1E293B', accentHex: '#FEF9C3' },
    { suffix: 'royal_crest', name: 'Umpire Call Shield', tagline: 'Authoritative dark slate & gold umpire badge', motionFamily: 'royal_crest', pattern: 'crown_crest', primaryHex: '#D97706', secondaryHex: '#0F172A', accentHex: '#F8FAFC' },
    { suffix: 'fireworks', name: 'Crowd Free-Hit Buzz', tagline: 'Gold spark ring ignition for the free hit', motionFamily: 'stadium_fireworks', pattern: 'stadium_rings', primaryHex: '#EAB308', secondaryHex: '#312E81', accentHex: '#34D399' },
    { suffix: 'flame_burst', name: 'Solar Warning Pulse', tagline: 'Glowing amber pulse ring & siren emblem', motionFamily: 'flame_burst', pattern: 'hex_pulse', primaryHex: '#F59E0B', secondaryHex: '#991B1B', accentHex: '#FEF08A' },
  ],
  GOAL: [
    { suffix: 'ucl_starlight', name: 'Champions Starlight Goal', tagline: 'Midnight starfield & electric cyan shockwave', motionFamily: 'star_shockwave', pattern: 'stadium_rings', primaryHex: '#0284C7', secondaryHex: '#1E1B4B', accentHex: '#38BDF8' },
    { suffix: 'premier_neon', name: 'Premier Electric Goal', tagline: 'Vibrant violet & neon mint goal explosion', motionFamily: 'neon_cyber_slam', pattern: 'cyber_scan', primaryHex: '#7C3AED', secondaryHex: '#0F172A', accentHex: '#34D399' },
    { suffix: 'world_gold', name: 'World Cup Gold Goal', tagline: 'Emerald pitch & 3D brushed gold celebration', motionFamily: 'gold_ribbon_3d', pattern: 'gold_foil', primaryHex: '#059669', secondaryHex: '#064E3B', accentHex: '#FACC15' },
    { suffix: 'fireworks', name: 'Stadium Confetti Roar', tagline: 'Full stadium fireworks & illuminated crest', motionFamily: 'stadium_fireworks', pattern: 'radial_rays', primaryHex: '#10B981', secondaryHex: '#1E293B', accentHex: '#FDE047' },
    { suffix: 'pkl_ember', name: 'Derby Crimson Goal', tagline: 'Blazing crimson & amber prime-time derby strike', motionFamily: 'pkl_ember_wipe', pattern: 'flame_grid', primaryHex: '#E11D48', secondaryHex: '#4C0519', accentHex: '#FBBF24' },
    { suffix: 'lightning', name: 'Screamer Thunderbolt', tagline: 'Electric bolt net-buster with neon sparks', motionFamily: 'lightning_arc', pattern: 'circuit_lines', primaryHex: '#2563EB', secondaryHex: '#090D16', accentHex: '#22D3EE' },
    { suffix: 'laser_prism', name: 'Turf Laser Velocity', tagline: 'Angled emerald-cyan laser prism ribbon', motionFamily: 'laser_prism', pattern: 'prism_shards', primaryHex: '#0D9488', secondaryHex: '#1E1B4B', accentHex: '#A7F3D0' },
    { suffix: 'royal_crest', name: 'Royal Club Crest Goal', tagline: 'Regal obsidian & gold club victory plate', motionFamily: 'royal_crest', pattern: 'crown_crest', primaryHex: '#1D4ED8', secondaryHex: '#0F172A', accentHex: '#F59E0B' },
    { suffix: 'arena_sweep', name: 'Matchday Full Sweep', tagline: 'Wide dynamic pitch-green TV celebration bar', motionFamily: 'arena_banner_sweep', pattern: 'diagonal_slats', primaryHex: '#16A34A', secondaryHex: '#090D16', accentHex: '#FFFFFF' },
    { suffix: 'flame_burst', name: 'Top-Bin Plasma Blast', tagline: 'High-impact plasma ring & glowing goal banner', motionFamily: 'flame_burst', pattern: 'hex_pulse', primaryHex: '#9333EA', secondaryHex: '#065F46', accentHex: '#FDE047' },
  ],
  FOUL: [
    { suffix: 'referee_amber', name: 'Referee Caution Flash', tagline: 'Bold yellow-amber card flare & crisp alert', motionFamily: 'neon_cyber_slam', pattern: 'diagonal_slats', primaryHex: '#EAB308', secondaryHex: '#1E293B', accentHex: '#EF4444' },
    { suffix: 'crimson_redcard', name: 'Direct Red Hazard', tagline: 'High-drama scarlet foul & red-card plate', motionFamily: 'flame_burst', pattern: 'flame_grid', primaryHex: '#DC2626', secondaryHex: '#450A0A', accentHex: '#FACC15' },
    { suffix: 'arena_sweep', name: 'Matchday Stoppage Bar', tagline: 'Sleek dark slate & gold referee alert strip', motionFamily: 'arena_banner_sweep', pattern: 'diagonal_slats', primaryHex: '#F59E0B', secondaryHex: '#090D16', accentHex: '#FFFFFF' },
    { suffix: 'lightning', name: 'Whistle Strike Alert', tagline: 'Sharp tactical cyan-crimson stoppage bolt', motionFamily: 'lightning_arc', pattern: 'cyber_scan', primaryHex: '#E11D48', secondaryHex: '#0F172A', accentHex: '#FDE047' },
    { suffix: 'star_shockwave', name: 'VAR Review Shockwave', tagline: 'Tactical indigo-amber discipline review plate', motionFamily: 'star_shockwave', pattern: 'radial_rays', primaryHex: '#D97706', secondaryHex: '#1E1B4B', accentHex: '#F87171' },
    { suffix: 'laser_prism', name: 'Tactical Card Prism', tagline: 'Angled obsidian & amber-red warning shards', motionFamily: 'laser_prism', pattern: 'prism_shards', primaryHex: '#DC2626', secondaryHex: '#1E293B', accentHex: '#FBBF24' },
    { suffix: 'pkl_ember', name: 'Heated Tackle Flash', tagline: 'Fiery orange-scarlet caution sweep', motionFamily: 'pkl_ember_wipe', pattern: 'flame_grid', primaryHex: '#EA580C', secondaryHex: '#7F1D1D', accentHex: '#FEF08A' },
    { suffix: 'royal_crest', name: 'Official Whistle Crest', tagline: 'Clean bronze-slate referee authority badge', motionFamily: 'royal_crest', pattern: 'crown_crest', primaryHex: '#B45309', secondaryHex: '#0F172A', accentHex: '#E2E8F0' },
    { suffix: 'gold_ribbon', name: 'Amber Discipline Wing', tagline: '3D brushed amber & charcoal card banner', motionFamily: 'gold_ribbon_3d', pattern: 'gold_foil', primaryHex: '#CA8A04', secondaryHex: '#0F172A', accentHex: '#FCA5A5' },
    { suffix: 'fireworks', name: 'Touchline Caution Ring', tagline: 'Amber-red floodlight pulse alert', motionFamily: 'stadium_fireworks', pattern: 'stadium_rings', primaryHex: '#F59E0B', secondaryHex: '#7F1D1D', accentHex: '#F8FAFC' },
  ],
  SET_WIN: [
    { suffix: 'vnl_sky_gold', name: 'VNL Championship Set', tagline: 'Electric sky-blue & gold court victory burst', motionFamily: 'star_shockwave', pattern: 'stadium_rings', primaryHex: '#2563EB', secondaryHex: '#0F172A', accentHex: '#FACC15' },
    { suffix: 'olympic_gold', name: 'Olympic Gold Set Crown', tagline: '3D brushed gold medallion & royal wing', motionFamily: 'gold_ribbon_3d', pattern: 'gold_foil', primaryHex: '#D97706', secondaryHex: '#1E293B', accentHex: '#FEF08A' },
    { suffix: 'neon_net', name: 'Neon Net Pro Rally', tagline: 'Electric teal & ultraviolet court victory slam', motionFamily: 'neon_cyber_slam', pattern: 'cyber_scan', primaryHex: '#14B8A6', secondaryHex: '#4C1D95', accentHex: '#FDE047' },
    { suffix: 'fireworks', name: 'Arena Confetti Set Win', tagline: 'Celebratory indoor stadium fireworks & confetti', motionFamily: 'stadium_fireworks', pattern: 'radial_rays', primaryHex: '#3B82F6', secondaryHex: '#312E81', accentHex: '#34D399' },
    { suffix: 'pkl_ember', name: 'Sunset Smash Set Win', tagline: 'Warm coral-saffron spike victory wipe', motionFamily: 'pkl_ember_wipe', pattern: 'flame_grid', primaryHex: '#F97316', secondaryHex: '#1E293B', accentHex: '#38BDF8' },
    { suffix: 'lightning', name: 'Ace Bolt Clincher', tagline: 'High-speed electric bolt court clincher', motionFamily: 'lightning_arc', pattern: 'circuit_lines', primaryHex: '#0EA5E9', secondaryHex: '#090D16', accentHex: '#FDE047' },
    { suffix: 'royal_crest', name: 'Hall of Champions Crest', tagline: 'Alabaster-gold & royal blue set winner crest', motionFamily: 'royal_crest', pattern: 'crown_crest', primaryHex: '#1D4ED8', secondaryHex: '#0F172A', accentHex: '#FBBF24' },
    { suffix: 'laser_prism', name: 'Prism Spike Victory', tagline: 'Faceted cyan-violet stadium laser shards', motionFamily: 'laser_prism', pattern: 'prism_shards', primaryHex: '#6366F1', secondaryHex: '#0F172A', accentHex: '#22D3EE' },
    { suffix: 'arena_sweep', name: 'Court Ribbon Clincher', tagline: 'Wide broadcast blue-amber set-score strip', motionFamily: 'arena_banner_sweep', pattern: 'diagonal_slats', primaryHex: '#0284C7', secondaryHex: '#090D16', accentHex: '#F59E0B' },
    { suffix: 'flame_burst', name: 'Match Surge Plasma', tagline: 'Radiant violet-gold shockwave set win', motionFamily: 'flame_burst', pattern: 'hex_pulse', primaryHex: '#7C3AED', secondaryHex: '#065F46', accentHex: '#FACC15' },
  ],
};

export const EVENT_ANIMATION_PRESETS: Record<BroadcastEventKey, readonly EventAnimationOption[]> =
  BROADCAST_EVENT_KEYS.reduce(
    (acc, key) => {
      const list = TEN_BROADCAST_STYLE_ARCHETYPES[key];
      acc[key] = list.map((bp, idx) => ({
        id: `${key.toLowerCase()}_${bp.suffix}`,
        index: idx + 1,
        name: bp.name,
        tagline: bp.tagline,
        motionFamily: bp.motionFamily,
        pattern: bp.pattern,
        primaryHex: bp.primaryHex,
        secondaryHex: bp.secondaryHex,
        accentHex: bp.accentHex,
        badgeText: BROADCAST_EVENT_META[key].badge,
      }));
      return acc;
    },
    {} as Record<BroadcastEventKey, readonly EventAnimationOption[]>
  );

export function createDefaultEventRule(key: BroadcastEventKey): EventAnimationRuleConfig {
  const meta = BROADCAST_EVENT_META[key];
  const firstStyle = EVENT_ANIMATION_PRESETS[key][0];
  return {
    enabled: true,
    styleId: firstStyle.id,
    durationSeconds: meta.defaultDurationSeconds,
    positionPreset: meta.defaultPositionPreset,
    xPct: meta.defaultXPct,
    yPct: meta.defaultYPct,
    scale: meta.defaultScale,
  };
}

export const DEFAULT_EVENT_ANIMATIONS: EventAnimationConfigMap = BROADCAST_EVENT_KEYS.reduce(
  (acc, key) => {
    acc[key] = createDefaultEventRule(key);
    return acc;
  },
  {} as EventAnimationConfigMap
);

function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' ? val : typeof val === 'string' && val.trim() !== '' ? Number(val) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
}

export function getEventPositionPresetCoords(
  preset: EventAnimationPositionPreset
): { xPct: number; yPct: number } {
  const found = EVENT_POSITION_PRESETS.find((p) => p.id === preset);
  return found ? { xPct: found.xPct, yPct: found.yPct } : { xPct: 50, yPct: 48 };
}

export function normalizeEventAnimationsConfig(
  raw?: Partial<Record<BroadcastEventKey, Partial<EventAnimationRuleConfig>>> | Record<string, unknown> | null
): EventAnimationConfigMap {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = {} as EventAnimationConfigMap;

  for (const key of BROADCAST_EVENT_KEYS) {
    const def = DEFAULT_EVENT_ANIMATIONS[key];
    const entry = (src[key] && typeof src[key] === 'object' ? src[key] : {}) as Partial<EventAnimationRuleConfig>;
    const presets = EVENT_ANIMATION_PRESETS[key];
    const validStyleIds = new Set(presets.map((p) => p.id));
    const styleId =
      typeof entry.styleId === 'string' && validStyleIds.has(entry.styleId)
        ? entry.styleId
        : def.styleId;

    const validPresets = new Set(EVENT_POSITION_PRESETS.map((p) => p.id));
    const positionPreset: EventAnimationPositionPreset =
      typeof entry.positionPreset === 'string' && validPresets.has(entry.positionPreset as EventAnimationPositionPreset)
        ? (entry.positionPreset as EventAnimationPositionPreset)
        : def.positionPreset;

    const fallbackCoords =
      positionPreset === 'custom'
        ? { xPct: def.xPct, yPct: def.yPct }
        : getEventPositionPresetCoords(positionPreset);

    out[key] = {
      enabled: typeof entry.enabled === 'boolean' ? entry.enabled : def.enabled,
      styleId,
      durationSeconds: clampNum(
        entry.durationSeconds,
        EVENT_ANIMATION_BOUNDS.durationSeconds.min,
        EVENT_ANIMATION_BOUNDS.durationSeconds.max,
        def.durationSeconds
      ),
      positionPreset,
      xPct: clampNum(
        entry.xPct,
        EVENT_ANIMATION_BOUNDS.xPct.min,
        EVENT_ANIMATION_BOUNDS.xPct.max,
        fallbackCoords.xPct
      ),
      yPct: clampNum(
        entry.yPct,
        EVENT_ANIMATION_BOUNDS.yPct.min,
        EVENT_ANIMATION_BOUNDS.yPct.max,
        fallbackCoords.yPct
      ),
      scale: clampNum(
        entry.scale,
        EVENT_ANIMATION_BOUNDS.scale.min,
        EVENT_ANIMATION_BOUNDS.scale.max,
        def.scale
      ),
    };
  }

  return out;
}

export function resolveEventStyleOption(
  eventKey: BroadcastEventKey,
  styleId?: string | null
): EventAnimationOption {
  const options = EVENT_ANIMATION_PRESETS[eventKey];
  if (!styleId) return options[0];
  return options.find((o) => o.id === styleId) || options[0];
}

const GLOBAL_EVENT_DEFAULTS_STORAGE_KEY = 'maidanlive_global_event_animations_v1';

export function saveGlobalEventAnimationDefaults(config: EventAnimationConfigMap): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        GLOBAL_EVENT_DEFAULTS_STORAGE_KEY,
        JSON.stringify(normalizeEventAnimationsConfig(config))
      );
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function loadGlobalEventAnimationDefaults(): EventAnimationConfigMap | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(GLOBAL_EVENT_DEFAULTS_STORAGE_KEY);
    if (!raw) return null;
    return normalizeEventAnimationsConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}
