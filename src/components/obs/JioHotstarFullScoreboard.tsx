import { Clock, Flame, Radio, Shield, Trophy } from 'lucide-react';
import type {
  BroadcastOverlayConfig,
  LiveScoreData,
  LiveStreamData,
} from '../../types/index.ts';
import type { MatchTimeoutInfo } from '../../utils/matchTimeout.ts';
import {
  DEFAULT_OVERLAY_CONFIG,
  sanitizeHexColor,
  VALID_FULL_SCOREBOARD_STYLES,
  type FullScoreboardStyleId,
} from '../../utils/overlayConfig.ts';
import { normalizeBroadcast } from '../../utils/normalizeBroadcast.ts';
import {
  computeCricketChaseState,
  deriveCricketInningsScorecard,
  normalizeCricketDetails,
  type CricketDetails,
} from '../../utils/cricketScoring.ts';
import {
  computeEffectiveKabaddiClock,
  normalizeKabaddiDetails,
  type KabaddiDetails,
} from '../../utils/kabaddiScoring.ts';
import {
  normalizeVolleyballDetails,
  type VolleyballDetails,
} from '../../utils/volleyballScoring.ts';
import {
  createInitialFootballDetails,
  type FootballDetails,
} from '../../utils/footballScoring.ts';
import { TeamAvatar } from '../common/TeamAvatar.tsx';

interface JioHotstarFullScoreboardProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  config?: Partial<BroadcastOverlayConfig> | null;
  timeoutInfo?: MatchTimeoutInfo;
  isPortrait?: boolean;
  variant?: 'canvas' | 'responsive';
  serverClockOffsetMs?: number;
  zIndex?: number;
  visible: boolean;
}

type HeroArchitecture =
  | 'classic_bar'
  | 'center_medallion'
  | 'split_towers'
  | 'chamfer_versus'
  | 'heritage_plaque';

interface FullScoreboardThemeTokens {
  rootBg: string;
  isLight: boolean;
  heroArch: HeroArchitecture;
  accentHex: string;
  headerBgClass: string;
  footerBgClass: string;
  heroCardClass: string;
  panelCardClass: string;
  panelHeaderClass: string;
  dividerClass: string;
  headingColorClass: string;
  mutedColorClass: string;
  accentTextClass: string;
  vsBadgeClass: string;
}

const THEME_MAP: Record<FullScoreboardStyleId, FullScoreboardThemeTokens> = {
  // Cricket (4)
  cricket_broadcast_classic: {
    rootBg:
      'radial-gradient(ellipse at top center, rgba(16, 185, 129, 0.25) 0%, rgba(10, 25, 47, 0.98) 48%, rgba(4, 9, 20, 0.99) 100%)',
    isLight: false,
    heroArch: 'classic_bar',
    accentHex: '#10B981',
    headerBgClass: 'border-emerald-400/20 bg-[#061423]/90',
    footerBgClass: 'border-emerald-400/20 bg-[#040D18]/95',
    heroCardClass: 'rounded-2xl border border-emerald-400/30 bg-[#0B1D33]/95',
    panelCardClass: 'rounded-xl border border-emerald-400/20 bg-[#081526]/92',
    panelHeaderClass: 'border-b border-emerald-400/15 bg-emerald-500/10',
    dividerClass: 'divide-emerald-400/10',
    headingColorClass: 'text-white',
    mutedColorClass: 'text-slate-300',
    accentTextClass: 'text-emerald-300',
    vsBadgeClass: 'rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300',
  },
  cricket_world_cup_royal: {
    rootBg:
      'radial-gradient(circle at 50% 18%, rgba(245, 158, 11, 0.28) 0%, rgba(23, 37, 84, 0.97) 48%, rgba(7, 11, 30, 0.99) 100%)',
    isLight: false,
    heroArch: 'center_medallion',
    accentHex: '#F59E0B',
    headerBgClass: 'border-amber-400/25 bg-[#0A1336]/90',
    footerBgClass: 'border-amber-400/20 bg-[#070C26]/95',
    heroCardClass: 'rounded-2xl border border-amber-400/35 bg-[#101D4B]/95',
    panelCardClass: 'rounded-xl border border-amber-400/20 bg-[#0B1438]/92',
    panelHeaderClass: 'border-b border-amber-400/20 bg-amber-500/10',
    dividerClass: 'divide-white/10',
    headingColorClass: 'text-white',
    mutedColorClass: 'text-indigo-200',
    accentTextClass: 'text-amber-300',
    vsBadgeClass: 'rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 border border-amber-200',
  },
  cricket_ipl_stadium_neon: {
    rootBg:
      'radial-gradient(ellipse at top right, rgba(236, 72, 153, 0.34) 0%, rgba(30, 14, 58, 0.98) 46%, rgba(8, 5, 22, 0.99) 100%)',
    isLight: false,
    heroArch: 'chamfer_versus',
    accentHex: '#EC4899',
    headerBgClass: 'border-pink-500/30 bg-[#14072A]/90',
    footerBgClass: 'border-pink-500/25 bg-[#0B041B]/95',
    heroCardClass: 'rounded-xl border-2 border-pink-500/45 bg-gradient-to-r from-[#1D0B3B]/95 via-[#2A1054]/95 to-[#1D0B3B]/95',
    panelCardClass: 'rounded-xl border border-fuchsia-400/25 bg-[#15082E]/92',
    panelHeaderClass: 'border-b border-fuchsia-400/20 bg-fuchsia-500/15',
    dividerClass: 'divide-fuchsia-400/10',
    headingColorClass: 'text-white',
    mutedColorClass: 'text-fuchsia-200',
    accentTextClass: 'text-pink-300',
    vsBadgeClass: 'rounded-lg bg-gradient-to-r from-pink-500 to-cyan-500 text-white border border-white/30',
  },
  cricket_test_heritage: {
    rootBg:
      'linear-gradient(160deg, #06281E 0%, #0D3B2E 45%, #051F17 100%)',
    isLight: true,
    heroArch: 'heritage_plaque',
    accentHex: '#065F46',
    headerBgClass: 'border-emerald-900/20 bg-[#F8F6F0] text-slate-900',
    footerBgClass: 'border-emerald-900/20 bg-[#F2EFE6] text-slate-800',
    heroCardClass: 'rounded-xl border-2 border-amber-600/50 bg-[#FCFBF7] text-slate-900',
    panelCardClass: 'rounded-xl border border-slate-300 bg-[#FAF8F2] text-slate-900',
    panelHeaderClass: 'border-b border-slate-300 bg-[#EAE6D9] text-slate-900',
    dividerClass: 'divide-slate-200',
    headingColorClass: 'text-slate-900',
    mutedColorClass: 'text-slate-600',
    accentTextClass: 'text-emerald-800',
    vsBadgeClass: 'rounded-full bg-emerald-800 text-amber-100 border border-amber-500',
  },
  // Kabaddi (4)
  kabaddi_pro_mat_fire: {
    rootBg:
      'radial-gradient(ellipse at top center, rgba(234, 88, 12, 0.38) 0%, rgba(28, 14, 10, 0.98) 48%, rgba(10, 6, 4, 0.99) 100%)',
    isLight: false,
    heroArch: 'split_towers',
    accentHex: '#EA580C',
    headerBgClass: 'border-orange-500/30 bg-[#1B0B05]/92',
    footerBgClass: 'border-orange-500/25 bg-[#120704]/95',
    heroCardClass: 'rounded-2xl border border-orange-500/40 bg-[#231008]/95',
    panelCardClass: 'rounded-xl border border-orange-400/25 bg-[#1A0C06]/92',
    panelHeaderClass: 'border-b border-orange-400/20 bg-orange-500/15',
    dividerClass: 'divide-orange-400/10',
    headingColorClass: 'text-white',
    mutedColorClass: 'text-orange-100/80',
    accentTextClass: 'text-amber-300',
    vsBadgeClass: 'rounded-lg bg-[#EA580C] text-white border border-amber-300/60',
  },
  kabaddi_championship_gold: {
    rootBg:
      'radial-gradient(circle at 50% 10%, rgba(234, 179, 8, 0.30) 0%, rgba(20, 18, 12, 0.98) 46%, rgba(6, 6, 5, 0.99) 100%)',
    isLight: false,
    heroArch: 'heritage_plaque',
    accentHex: '#EAB308',
    headerBgClass: 'border-yellow-500/30 bg-[#14120A]/92',
    footerBgClass: 'border-yellow-500/25 bg-[#0B0A05]/96',
    heroCardClass: 'rounded-2xl border-2 border-yellow-500/45 bg-[#1A160B]/95',
    panelCardClass: 'rounded-xl border border-yellow-500/25 bg-[#121008]/92',
    panelHeaderClass: 'border-b border-yellow-500/20 bg-yellow-500/12',
    dividerClass: 'divide-yellow-500/10',
    headingColorClass: 'text-white',
    mutedColorClass: 'text-amber-100/75',
    accentTextClass: 'text-yellow-300',
    vsBadgeClass: 'rounded-full bg-yellow-500 text-slate-950 border border-yellow-200',
  },
  kabaddi_dugout_tactical: {
    rootBg:
      'radial-gradient(ellipse at top left, rgba(6, 182, 212, 0.30) 0%, rgba(9, 25, 36, 0.98) 48%, rgba(4, 10, 18, 0.99) 100%)',
    isLight: false,
    heroArch: 'classic_bar',
    accentHex: '#06B6D4',
    headerBgClass: 'border-cyan-400/25 bg-[#071722]/90',
    footerBgClass: 'border-cyan-400/20 bg-[#051018]/95',
    heroCardClass: 'rounded-xl border border-cyan-400/35 bg-[#092030]/95',
    panelCardClass: 'rounded-xl border border-cyan-400/20 bg-[#071824]/92',
    panelHeaderClass: 'border-b border-cyan-400/20 bg-cyan-500/10',
    dividerClass: 'divide-cyan-400/10',
    headingColorClass: 'text-white',
    mutedColorClass: 'text-cyan-100/80',
    accentTextClass: 'text-cyan-300',
    vsBadgeClass: 'rounded-md bg-cyan-500/25 border border-cyan-400/60 text-cyan-200',
  },
  kabaddi_royal_akhada: {
    rootBg:
      'radial-gradient(ellipse at top, rgba(220, 38, 38, 0.35) 0%, rgba(36, 11, 14, 0.98) 48%, rgba(14, 4, 6, 0.99) 100%)',
    isLight: false,
    heroArch: 'center_medallion',
    accentHex: '#DC2626',
    headerBgClass: 'border-red-500/30 bg-[#1D080A]/92',
    footerBgClass: 'border-red-500/25 bg-[#120406]/95',
    heroCardClass: 'rounded-2xl border border-red-500/40 bg-[#250A0E]/95',
    panelCardClass: 'rounded-xl border border-red-400/25 bg-[#1B080A]/92',
    panelHeaderClass: 'border-b border-red-400/20 bg-red-500/12',
    dividerClass: 'divide-red-400/10',
    headingColorClass: 'text-white',
    mutedColorClass: 'text-rose-200/80',
    accentTextClass: 'text-amber-300',
    vsBadgeClass: 'rounded-full bg-red-600 text-amber-200 border border-amber-400',
  },
  // Football (4)
  football_european_ucl: {
    rootBg:
      'radial-gradient(ellipse at top center, rgba(56, 189, 248, 0.32) 0%, rgba(12, 23, 56, 0.98) 48%, rgba(4, 8, 24, 0.99) 100%)',
    isLight: false,
    heroArch: 'classic_bar',
    accentHex: '#38BDF8',
    headerBgClass: 'border-sky-400/25 bg-[#081230]/90',
    footerBgClass: 'border-sky-400/20 bg-[#050C22]/95',
    heroCardClass: 'rounded-2xl border border-sky-400/30 bg-[#0E1E4A]/95',
    panelCardClass: 'rounded-xl border border-sky-400/20 bg-[#0A1638]/92',
    panelHeaderClass: 'border-b border-sky-400/20 bg-sky-500/12',
    dividerClass: 'divide-sky-300/10',
    headingColorClass: 'text-white',
    mutedColorClass: 'text-sky-100/80',
    accentTextClass: 'text-sky-300',
    vsBadgeClass: 'rounded-full bg-sky-500/20 border border-sky-300/50 text-sky-200',
  },
  football_premier_studio: {
    rootBg:
      'radial-gradient(ellipse at top center, rgba(168, 85, 247, 0.34) 0%, rgba(36, 7, 46, 0.98) 48%, rgba(14, 3, 20, 0.99) 100%)',
    isLight: false,
    heroArch: 'chamfer_versus',
    accentHex: '#A855F7',
    headerBgClass: 'border-purple-400/30 bg-[#1B0524]/92',
    footerBgClass: 'border-purple-400/25 bg-[#120319]/95',
    heroCardClass: 'rounded-xl border-2 border-purple-500/45 bg-[#240933]/95',
    panelCardClass: 'rounded-xl border border-purple-400/25 bg-[#190725]/92',
    panelHeaderClass: 'border-b border-purple-400/20 bg-purple-500/15',
    dividerClass: 'divide-purple-300/10',
    headingColorClass: 'text-white',
    mutedColorClass: 'text-purple-200',
    accentTextClass: 'text-emerald-300',
    vsBadgeClass: 'rounded-lg bg-emerald-400 text-slate-950 border border-white/40',
  },
  football_world_turf: {
    rootBg:
      'radial-gradient(ellipse at top center, rgba(34, 197, 94, 0.28) 0%, rgba(7, 36, 20, 0.98) 48%, rgba(3, 15, 9, 0.99) 100%)',
    isLight: false,
    heroArch: 'split_towers',
    accentHex: '#22C55E',
    headerBgClass: 'border-green-400/25 bg-[#051E11]/92',
    footerBgClass: 'border-green-400/20 bg-[#04140B]/95',
    heroCardClass: 'rounded-2xl border border-green-400/35 bg-[#092C19]/95',
    panelCardClass: 'rounded-xl border border-green-400/20 bg-[#062012]/92',
    panelHeaderClass: 'border-b border-green-400/20 bg-green-500/12',
    dividerClass: 'divide-green-400/10',
    headingColorClass: 'text-white',
    mutedColorClass: 'text-emerald-100/80',
    accentTextClass: 'text-green-300',
    vsBadgeClass: 'rounded-full bg-green-500 text-slate-950 border border-green-200',
  },
  football_derby_crimson: {
    rootBg:
      'radial-gradient(ellipse at top center, rgba(244, 63, 94, 0.34) 0%, rgba(28, 10, 18, 0.98) 48%, rgba(10, 4, 8, 0.99) 100%)',
    isLight: false,
    heroArch: 'classic_bar',
    accentHex: '#F43F5E',
    headerBgClass: 'border-rose-500/30 bg-[#17060D]/92',
    footerBgClass: 'border-rose-500/25 bg-[#0F0409]/95',
    heroCardClass: 'rounded-2xl border border-rose-500/40 bg-[#210A13]/95',
    panelCardClass: 'rounded-xl border border-rose-400/20 bg-[#16070D]/92',
    panelHeaderClass: 'border-b border-rose-400/20 bg-rose-500/12',
    dividerClass: 'divide-rose-400/10',
    headingColorClass: 'text-white',
    mutedColorClass: 'text-rose-100/80',
    accentTextClass: 'text-rose-300',
    vsBadgeClass: 'rounded-lg bg-rose-600 text-white border border-rose-300/60',
  },
  // Volleyball (4)
  volleyball_vnl_court: {
    rootBg:
      'radial-gradient(ellipse at top center, rgba(59, 130, 246, 0.34) 0%, rgba(20, 28, 54, 0.98) 48%, rgba(8, 12, 26, 0.99) 100%)',
    isLight: false,
    heroArch: 'split_towers',
    accentHex: '#3B82F6',
    headerBgClass: 'border-blue-400/25 bg-[#0D1630]/92',
    footerBgClass: 'border-blue-400/20 bg-[#080E20]/95',
    heroCardClass: 'rounded-2xl border border-amber-400/35 bg-[#131E40]/95',
    panelCardClass: 'rounded-xl border border-blue-400/25 bg-[#0D1630]/92',
    panelHeaderClass: 'border-b border-blue-400/20 bg-blue-500/12',
    dividerClass: 'divide-blue-300/10',
    headingColorClass: 'text-white',
    mutedColorClass: 'text-slate-200',
    accentTextClass: 'text-amber-300',
    vsBadgeClass: 'rounded-full bg-amber-400 text-slate-950 border border-white/40',
  },
  volleyball_olympic_clean: {
    rootBg:
      'linear-gradient(160deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
    isLight: true,
    heroArch: 'classic_bar',
    accentHex: '#0284C7',
    headerBgClass: 'border-slate-300 bg-white text-slate-900',
    footerBgClass: 'border-slate-300 bg-slate-100 text-slate-800',
    heroCardClass: 'rounded-2xl border-2 border-sky-500/45 bg-white text-slate-900',
    panelCardClass: 'rounded-xl border border-slate-300 bg-slate-50 text-slate-900',
    panelHeaderClass: 'border-b border-slate-200 bg-sky-50 text-slate-900',
    dividerClass: 'divide-slate-200',
    headingColorClass: 'text-slate-900',
    mutedColorClass: 'text-slate-600',
    accentTextClass: 'text-sky-700',
    vsBadgeClass: 'rounded-full bg-sky-600 text-white border border-sky-400',
  },
  volleyball_beach_sunset: {
    rootBg:
      'radial-gradient(ellipse at top center, rgba(249, 115, 22, 0.34) 0%, rgba(28, 22, 54, 0.98) 48%, rgba(12, 10, 28, 0.99) 100%)',
    isLight: false,
    heroArch: 'classic_bar',
    accentHex: '#F97316',
    headerBgClass: 'border-orange-400/25 bg-[#181332]/92',
    footerBgClass: 'border-orange-400/20 bg-[#100C24]/95',
    heroCardClass: 'rounded-2xl border border-orange-400/35 bg-[#201942]/95',
    panelCardClass: 'rounded-xl border border-orange-400/20 bg-[#161232]/92',
    panelHeaderClass: 'border-b border-orange-400/20 bg-orange-500/12',
    dividerClass: 'divide-orange-300/10',
    headingColorClass: 'text-white',
    mutedColorClass: 'text-amber-100/80',
    accentTextClass: 'text-orange-300',
    vsBadgeClass: 'rounded-full bg-gradient-to-r from-orange-500 to-rose-500 text-white border border-white/30',
  },
  volleyball_neon_net: {
    rootBg:
      'radial-gradient(ellipse at top center, rgba(20, 184, 166, 0.34) 0%, rgba(13, 24, 38, 0.98) 48%, rgba(4, 10, 18, 0.99) 100%)',
    isLight: false,
    heroArch: 'chamfer_versus',
    accentHex: '#14B8A6',
    headerBgClass: 'border-teal-400/25 bg-[#081522]/92',
    footerBgClass: 'border-teal-400/20 bg-[#050E16]/95',
    heroCardClass: 'rounded-xl border-2 border-teal-400/40 bg-[#0B1F30]/95',
    panelCardClass: 'rounded-xl border border-teal-400/20 bg-[#081724]/92',
    panelHeaderClass: 'border-b border-teal-400/20 bg-teal-500/12',
    dividerClass: 'divide-teal-400/10',
    headingColorClass: 'text-white',
    mutedColorClass: 'text-teal-100/80',
    accentTextClass: 'text-teal-300',
    vsBadgeClass: 'rounded-lg bg-teal-400 text-slate-950 border border-white/40',
  },
  // Multi-Sport (4)
  multisport_jiohotstar_prime: {
    rootBg:
      'radial-gradient(ellipse at top center, rgba(37, 99, 235, 0.34) 0%, rgba(15, 23, 42, 0.98) 46%, rgba(4, 7, 18, 0.99) 100%)',
    isLight: false,
    heroArch: 'classic_bar',
    accentHex: '#3B82F6',
    headerBgClass: 'border-white/10 bg-[#070B1E]/85',
    footerBgClass: 'border-white/10 bg-[#06091A]/90',
    heroCardClass: 'rounded-2xl border border-white/15 bg-gradient-to-r from-[#0F172A]/95 via-[#131C3A]/95 to-[#0F172A]/95',
    panelCardClass: 'rounded-xl border border-white/10 bg-[#0B1129]/90',
    panelHeaderClass: 'border-b border-white/10 bg-white/5',
    dividerClass: 'divide-white/5',
    headingColorClass: 'text-white',
    mutedColorClass: 'text-slate-300',
    accentTextClass: 'text-amber-300',
    vsBadgeClass: 'rounded-full bg-white/10 border border-white/20 text-amber-300',
  },
  multisport_olympic_medallion: {
    rootBg:
      'radial-gradient(circle at 50% 22%, rgba(245, 158, 11, 0.25) 0%, rgba(15, 23, 42, 0.98) 50%, rgba(3, 6, 15, 0.99) 100%)',
    isLight: false,
    heroArch: 'center_medallion',
    accentHex: '#F59E0B',
    headerBgClass: 'border-amber-400/20 bg-[#090F1E]/90',
    footerBgClass: 'border-amber-400/20 bg-[#060A15]/95',
    heroCardClass: 'rounded-2xl border border-amber-400/35 bg-[#0F172A]/95',
    panelCardClass: 'rounded-xl border border-amber-400/20 bg-[#0B1222]/92',
    panelHeaderClass: 'border-b border-amber-400/15 bg-amber-500/10',
    dividerClass: 'divide-white/10',
    headingColorClass: 'text-white',
    mutedColorClass: 'text-slate-300',
    accentTextClass: 'text-amber-300',
    vsBadgeClass: 'rounded-full bg-amber-400 text-slate-950 border-2 border-white',
  },
  multisport_esports_chamfer: {
    rootBg:
      'radial-gradient(ellipse at top center, rgba(139, 92, 246, 0.34) 0%, rgba(10, 12, 28, 0.98) 48%, rgba(3, 5, 14, 0.99) 100%)',
    isLight: false,
    heroArch: 'chamfer_versus',
    accentHex: '#8B5CF6',
    headerBgClass: 'border-violet-400/30 bg-[#0A0C1D]/92',
    footerBgClass: 'border-violet-400/25 bg-[#060714]/96',
    heroCardClass: 'rounded-xl border-2 border-violet-500/45 bg-[#111532]/95',
    panelCardClass: 'rounded-xl border border-violet-400/25 bg-[#0B0E24]/92',
    panelHeaderClass: 'border-b border-violet-400/20 bg-violet-500/15',
    dividerClass: 'divide-violet-400/10',
    headingColorClass: 'text-white',
    mutedColorClass: 'text-violet-200',
    accentTextClass: 'text-violet-300',
    vsBadgeClass: 'rounded-md bg-violet-500 text-white border border-cyan-300',
  },
  multisport_minimal_broadcast: {
    rootBg:
      'linear-gradient(180deg, #09090B 0%, #111827 55%, #030712 100%)',
    isLight: false,
    heroArch: 'classic_bar',
    accentHex: '#94A3B8',
    headerBgClass: 'border-slate-700/70 bg-zinc-950/92',
    footerBgClass: 'border-slate-700/70 bg-zinc-950/95',
    heroCardClass: 'rounded-xl border border-slate-700/80 bg-zinc-900/95',
    panelCardClass: 'rounded-xl border border-slate-700/70 bg-zinc-900/90',
    panelHeaderClass: 'border-b border-slate-700/70 bg-zinc-800/70',
    dividerClass: 'divide-slate-800',
    headingColorClass: 'text-white',
    mutedColorClass: 'text-slate-300',
    accentTextClass: 'text-slate-200',
    vsBadgeClass: 'rounded bg-slate-800 border border-slate-600 text-white',
  },
};

function formatTimeoutCountdown(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '';
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}` : `${rem}s`;
}

export function JioHotstarFullScoreboard({
  stream,
  score,
  config,
  timeoutInfo,
  isPortrait = false,
  variant = 'canvas',
  serverClockOffsetMs = 0,
  zIndex = 31,
  visible,
}: JioHotstarFullScoreboardProps) {
  if (!visible) return null;

  const isCanvas = variant === 'canvas';
  const nowMs = Date.now() + serverClockOffsetMs;
  const broadcast = normalizeBroadcast(stream, score, nowMs);
  const sport = broadcast.sport;
  const teamAColor = sanitizeHexColor(config?.teamAColor, DEFAULT_OVERLAY_CONFIG.teamAColor);
  const teamBColor = sanitizeHexColor(config?.teamBColor, DEFAULT_OVERLAY_CONFIG.teamBColor);

  const requestedStyle = config?.fullScoreboardStyle;
  const styleId: FullScoreboardStyleId =
    requestedStyle && VALID_FULL_SCOREBOARD_STYLES.includes(requestedStyle)
      ? requestedStyle
      : DEFAULT_OVERLAY_CONFIG.fullScoreboardStyle;
  const theme = THEME_MAP[styleId];

  const timeoutCountdown = formatTimeoutCountdown(timeoutInfo?.remainingSec);

  const isSplitTowers = theme.heroArch === 'split_towers';
  const isMedallion = theme.heroArch === 'center_medallion';
  const isChamfer = theme.heroArch === 'chamfer_versus';
  const isHeritage = theme.heroArch === 'heritage_plaque';

  const heroClipStyle =
    isChamfer && isCanvas
      ? { clipPath: 'polygon(18px 0, calc(100% - 18px) 0, 100% 18px, 100% calc(100% - 18px), calc(100% - 18px) 100%, 18px 100%, 0 calc(100% - 18px), 0 18px)' }
      : undefined;

  return (
    <div
      data-jiohotstar-full-scoreboard="true"
      data-full-scoreboard-style={styleId}
      style={{
        zIndex,
        background: theme.rootBg,
      }}
      className={`absolute inset-0 overflow-hidden select-none text-white flex flex-col ${
        isCanvas ? 'pointer-events-none' : 'pointer-events-auto overflow-y-auto'
      }`}
    >
      {/* Top Broadcast Accent Beams */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1.5 flex"
      >
        <div className="flex-1" style={{ backgroundColor: teamAColor }} />
        <div className="w-28" style={{ backgroundColor: theme.accentHex }} />
        <div className="flex-1" style={{ backgroundColor: teamBColor }} />
      </div>

      {/* Header Strip */}
      <header
        className={`relative z-10 border-b backdrop-blur-md flex items-center justify-between gap-3 shrink-0 ${theme.headerBgClass} ${
          isCanvas ? 'px-12 py-5' : 'px-3 py-2 sm:px-5 sm:py-3'
        }`}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span
            style={{ backgroundColor: theme.accentHex }}
            className={`inline-flex items-center justify-center rounded-lg text-white shadow shrink-0 ${
              isCanvas ? 'w-11 h-11' : 'w-6 h-6 sm:w-8 sm:h-8'
            }`}
          >
            <Trophy className={isCanvas ? 'w-6 h-6' : 'w-3.5 h-3.5 sm:w-4 sm:h-4'} />
          </span>
          <div className="min-w-0">
            <p
              className={`font-display font-extrabold uppercase tracking-wider truncate ${
                theme.isLight ? 'text-slate-900' : theme.accentTextClass
              } ${isCanvas ? 'text-xl' : 'text-[10px] sm:text-xs'}`}
            >
              {broadcast.tournamentName || 'MATCH CENTER'}
              {broadcast.roundName ? ` · ${broadcast.roundName}` : ''}
            </p>
            <p
              className={`truncate ${theme.mutedColorClass} ${
                isCanvas ? 'text-base' : 'text-[9px] sm:text-[11px]'
              }`}
            >
              {sport}
              {broadcast.venueName ? ` · ${broadcast.venueName}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {timeoutInfo?.isTimeout ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full bg-amber-500 text-slate-950 font-display font-black uppercase tracking-wider shadow-lg ${
                isCanvas ? 'px-5 py-1.5 text-lg' : 'px-2.5 py-0.5 text-[10px] sm:text-xs'
              }`}
            >
              <Clock className={isCanvas ? 'w-5 h-5' : 'w-3 h-3'} />
              <span>
                {timeoutInfo.label || 'TEAM TIMEOUT'}
                {timeoutCountdown ? ` · ${timeoutCountdown}` : ''}
              </span>
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border font-mono font-extrabold uppercase tracking-wider ${
                broadcast.centerMeta.isLive
                  ? theme.isLight
                    ? 'bg-red-600 border-red-700 text-white'
                    : 'bg-red-600/20 border-red-400/50 text-red-200'
                  : theme.isLight
                    ? 'bg-emerald-600 border-emerald-700 text-white'
                    : 'bg-emerald-600/20 border-emerald-400/50 text-emerald-200'
              } ${isCanvas ? 'px-5 py-1.5 text-lg' : 'px-2.5 py-0.5 text-[10px] sm:text-xs'}`}
            >
              <Radio className={isCanvas ? 'w-4 h-4' : 'w-3 h-3'} />
              <span>{broadcast.centerMeta.statusLabel}</span>
            </span>
          )}
        </div>
      </header>

      {/* Main Content Container */}
      <div
        className={`relative z-10 flex-1 min-h-0 flex flex-col justify-between gap-2 sm:gap-4 ${
          isCanvas
            ? isPortrait
              ? 'px-10 py-8 gap-6'
              : 'px-12 py-7 gap-5'
            : 'px-3 py-2.5 sm:px-6 sm:py-4'
        }`}
      >
        {/* VS HERO SCOREBOARD CARD (Architecture varies across designs) */}
        <section
          style={heroClipStyle}
          className={`shadow-2xl overflow-hidden shrink-0 ${
            isSplitTowers ? '' : theme.heroCardClass
          } ${
            isSplitTowers
              ? ''
              : isHeritage
                ? isCanvas
                  ? 'p-7'
                  : 'p-3 sm:p-5'
                : isCanvas
                  ? 'p-6 sm:p-8'
                  : 'p-2.5 sm:p-5'
          }`}
        >
          {isHeritage && (
            <div
              className={`mb-2 sm:mb-3 pb-2 border-b ${
                theme.isLight ? 'border-slate-300' : 'border-amber-400/25'
              } flex items-center justify-between text-[10px] sm:text-xs font-mono font-bold uppercase tracking-widest ${
                theme.accentTextClass
              }`}
            >
              <span>OFFICIAL MATCH SCORECARD</span>
              <span>{broadcast.centerMeta.periodLabel || sport}</span>
            </div>
          )}

          <div
            className={`grid items-center gap-2 sm:gap-4 ${
              isCanvas && isPortrait ? 'grid-cols-1 gap-5' : 'grid-cols-12'
            }`}
          >
            {/* Team A */}
            <div
              className={`${isCanvas && isPortrait ? '' : 'col-span-5'} ${
                isSplitTowers
                  ? `${theme.heroCardClass} ${isCanvas ? 'p-5' : 'p-2.5 sm:p-4'}`
                  : ''
              } flex items-center gap-2.5 sm:gap-4 min-w-0`}
            >
              <div
                className="rounded-xl p-0.5 shrink-0"
                style={{ backgroundColor: teamAColor }}
              >
                <TeamAvatar
                  name={broadcast.teamA.name}
                  logoUrl={broadcast.teamA.logoUrl}
                  size={isCanvas ? 'lg' : 'md'}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`font-display font-black uppercase tracking-tight truncate ${
                      theme.headingColorClass
                    } ${isCanvas ? 'text-4xl' : 'text-sm sm:text-2xl'}`}
                  >
                    {isCanvas ? broadcast.teamA.name : broadcast.teamA.shortName}
                  </span>
                  {broadcast.teamA.badgeText && (
                    <span
                      className={`rounded font-mono font-bold uppercase shrink-0 ${
                        theme.isLight
                          ? 'bg-amber-100 border border-amber-400 text-amber-900'
                          : 'bg-amber-500/20 border border-amber-400/40 text-amber-300'
                      } ${
                        isCanvas ? 'px-2.5 py-0.5 text-sm' : 'px-1.5 py-0.5 text-[8px] sm:text-[10px]'
                      }`}
                    >
                      {broadcast.teamA.badgeText}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 sm:gap-3 mt-0.5">
                  <span
                    className={`font-mono font-black tabular-nums leading-none ${
                      theme.headingColorClass
                    } ${isCanvas ? 'text-6xl' : 'text-xl sm:text-4xl'}`}
                  >
                    {broadcast.teamA.primaryText}
                  </span>
                  {broadcast.teamA.secondaryText && (
                    <span
                      className={`font-mono truncate ${theme.mutedColorClass} ${
                        isCanvas ? 'text-2xl' : 'text-[10px] sm:text-sm'
                      }`}
                    >
                      {broadcast.teamA.secondaryText}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Center Match Status Core */}
            <div
              className={`${
                isCanvas && isPortrait ? '' : 'col-span-2'
              } flex flex-col items-center justify-center text-center px-1 ${
                isSplitTowers
                  ? `rounded-2xl border border-white/15 bg-black/40 ${
                      isCanvas ? 'py-5 px-2' : 'py-2 px-1'
                    }`
                  : ''
              }`}
            >
              <span
                className={`inline-flex items-center justify-center font-display font-black ${
                  theme.vsBadgeClass
                } ${
                  isMedallion
                    ? isCanvas
                      ? 'w-20 h-20 text-3xl shadow-xl'
                      : 'w-9 h-9 sm:w-12 sm:h-12 text-xs sm:text-base shadow'
                    : isCanvas
                      ? 'px-5 py-1.5 text-2xl'
                      : 'px-2.5 py-0.5 text-[10px] sm:text-sm'
                }`}
              >
                VS
              </span>
              {broadcast.centerMeta.periodLabel && (
                <span
                  className={`font-display font-bold uppercase tracking-wider mt-1.5 truncate max-w-full ${
                    theme.headingColorClass
                  } ${isCanvas ? 'text-lg' : 'text-[9px] sm:text-xs'}`}
                >
                  {broadcast.centerMeta.periodLabel}
                </span>
              )}
              {broadcast.centerMeta.timerOrClock && (
                <span
                  className={`font-mono font-bold truncate max-w-full ${
                    theme.accentTextClass
                  } ${isCanvas ? 'text-xl' : 'text-[9px] sm:text-xs'}`}
                >
                  {broadcast.centerMeta.timerOrClock}
                </span>
              )}
            </div>

            {/* Team B */}
            <div
              className={`${isCanvas && isPortrait ? '' : 'col-span-5'} ${
                isSplitTowers
                  ? `${theme.heroCardClass} ${isCanvas ? 'p-5' : 'p-2.5 sm:p-4'}`
                  : ''
              } flex items-center justify-end gap-2.5 sm:gap-4 min-w-0 text-right`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                  {broadcast.teamB.badgeText && (
                    <span
                      className={`rounded font-mono font-bold uppercase shrink-0 ${
                        theme.isLight
                          ? 'bg-amber-100 border border-amber-400 text-amber-900'
                          : 'bg-amber-500/20 border border-amber-400/40 text-amber-300'
                      } ${
                        isCanvas ? 'px-2.5 py-0.5 text-sm' : 'px-1.5 py-0.5 text-[8px] sm:text-[10px]'
                      }`}
                    >
                      {broadcast.teamB.badgeText}
                    </span>
                  )}
                  <span
                    className={`font-display font-black uppercase tracking-tight truncate ${
                      theme.headingColorClass
                    } ${isCanvas ? 'text-4xl' : 'text-sm sm:text-2xl'}`}
                  >
                    {isCanvas ? broadcast.teamB.name : broadcast.teamB.shortName}
                  </span>
                </div>
                <div className="flex items-baseline justify-end gap-2 sm:gap-3 mt-0.5">
                  {broadcast.teamB.secondaryText && (
                    <span
                      className={`font-mono truncate ${theme.mutedColorClass} ${
                        isCanvas ? 'text-2xl' : 'text-[10px] sm:text-sm'
                      }`}
                    >
                      {broadcast.teamB.secondaryText}
                    </span>
                  )}
                  <span
                    className={`font-mono font-black tabular-nums leading-none ${
                      theme.headingColorClass
                    } ${isCanvas ? 'text-6xl' : 'text-xl sm:text-4xl'}`}
                  >
                    {broadcast.teamB.primaryText}
                  </span>
                </div>
              </div>
              <div
                className="rounded-xl p-0.5 shrink-0"
                style={{ backgroundColor: teamBColor }}
              >
                <TeamAvatar
                  name={broadcast.teamB.name}
                  logoUrl={broadcast.teamB.logoUrl}
                  size={isCanvas ? 'lg' : 'md'}
                />
              </div>
            </div>
          </div>

          {broadcast.resultBannerText && (
            <div
              className={`mt-2 sm:mt-4 rounded-xl border text-center font-display font-bold ${
                theme.isLight
                  ? 'bg-emerald-100 border-emerald-400 text-emerald-900'
                  : 'bg-emerald-500/15 border-emerald-400/35 text-emerald-200'
              } ${isCanvas ? 'py-2.5 px-4 text-2xl' : 'py-1 px-2.5 text-[11px] sm:text-sm'}`}
            >
              {broadcast.resultBannerText}
            </div>
          )}
        </section>

        {/* SPORT-SPECIFIC FULL SCORECARD PANELS */}
        {sport === 'Cricket' && (() => {
          const cd = normalizeCricketDetails(
            (score?.sportSpecificDetails || {}) as Partial<CricketDetails>
          );
          const chase = computeCricketChaseState(cd, broadcast.teamA.name, broadcast.teamB.name);
          const card = deriveCricketInningsScorecard(
            cd,
            cd.innings,
            broadcast.teamA.name,
            broadcast.teamB.name
          );
          const batters = card.batting.slice(0, isCanvas ? 6 : 4);
          const bowlers = card.bowling.slice(0, isCanvas ? 5 : 3);

          return (
            <div className="flex-1 min-h-0 flex flex-col gap-2 sm:gap-4">
              {/* Chase / Rate Banner */}
              <div
                className={`${theme.panelCardClass} flex flex-wrap items-center justify-between gap-2 shrink-0 ${
                  isCanvas ? 'px-6 py-3.5 text-xl' : 'px-3 py-1.5 text-[10px] sm:text-xs'
                }`}
              >
                <span className={`font-semibold truncate ${theme.accentTextClass}`}>
                  {chase.chaseSummaryText}
                </span>
                <div className="flex flex-wrap items-center gap-3 sm:gap-5 font-mono tabular-nums font-bold">
                  <span className={theme.isLight ? 'text-emerald-700' : 'text-emerald-300'}>
                    CRR {chase.crr}
                  </span>
                  {chase.rrr && (
                    <span className={theme.isLight ? 'text-orange-700' : 'text-orange-300'}>
                      RRR {chase.rrr}
                    </span>
                  )}
                  <span className={theme.mutedColorClass}>Extras {card.extras.total}</span>
                </div>
              </div>

              {/* Batting + Bowling Grid */}
              <div
                className={`flex-1 min-h-0 grid gap-2 sm:gap-4 ${
                  isCanvas && isPortrait ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
                }`}
              >
                {/* Batting Table */}
                <div className={`${theme.panelCardClass} overflow-hidden flex flex-col`}>
                  <div
                    className={`${theme.panelHeaderClass} flex items-center justify-between font-display font-bold uppercase tracking-wider ${
                      isCanvas ? 'px-5 py-3 text-lg' : 'px-3 py-1.5 text-[10px] sm:text-xs'
                    }`}
                  >
                    <span className={`truncate ${theme.accentTextClass}`}>
                      {card.battingTeamName} Batting
                    </span>
                    <span className={`font-mono ${theme.headingColorClass}`}>
                      {card.runs}/{card.wickets} ({card.oversText} ov)
                    </span>
                  </div>
                  <div className={`flex-1 divide-y ${theme.dividerClass}`}>
                    {batters.length === 0 ? (
                      <div
                        className={`${theme.mutedColorClass} ${
                          isCanvas ? 'p-6 text-lg' : 'p-3 text-xs'
                        }`}
                      >
                        Innings batting details will appear here as balls are scored.
                      </div>
                    ) : (
                      batters.map((b, idx) => (
                        <div
                          key={`${b.name}-${idx}`}
                          className={`flex items-center justify-between gap-2 ${
                            isCanvas ? 'px-5 py-2.5 text-xl' : 'px-3 py-1 text-[10px] sm:text-xs'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className={`font-bold truncate ${theme.headingColorClass}`}>
                              {b.name}
                              {b.onStrike ? ' *' : ''}
                            </p>
                            {b.dismissalText && (
                              <p
                                className={`truncate ${theme.mutedColorClass} ${
                                  isCanvas ? 'text-sm' : 'text-[9px]'
                                }`}
                              >
                                {b.dismissalText}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 sm:gap-4 font-mono tabular-nums shrink-0">
                            <span className={`font-black ${theme.headingColorClass}`}>
                              {b.runs}
                              <span className={`font-normal ${theme.mutedColorClass}`}>
                                ({b.balls})
                              </span>
                            </span>
                            <span className={`hidden sm:inline ${theme.mutedColorClass}`}>
                              {b.fours}×4 {b.sixes}×6
                            </span>
                            <span className={theme.accentTextClass}>SR {b.strikeRate}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Bowling + Recent Balls */}
                <div className={`${theme.panelCardClass} overflow-hidden flex flex-col justify-between`}>
                  <div>
                    <div
                      className={`${theme.panelHeaderClass} flex items-center justify-between font-display font-bold uppercase tracking-wider ${
                        isCanvas ? 'px-5 py-3 text-lg' : 'px-3 py-1.5 text-[10px] sm:text-xs'
                      }`}
                    >
                      <span className={`truncate ${theme.accentTextClass}`}>
                        {card.bowlingTeamName} Bowling
                      </span>
                      <span className={`font-mono ${theme.mutedColorClass}`}>O · R · W · ECON</span>
                    </div>
                    <div className={`divide-y ${theme.dividerClass}`}>
                      {bowlers.length === 0 ? (
                        <div
                          className={`${theme.mutedColorClass} ${
                            isCanvas ? 'p-6 text-lg' : 'p-3 text-xs'
                          }`}
                        >
                          Bowling figures update after deliveries are bowled.
                        </div>
                      ) : (
                        bowlers.map((bw, idx) => (
                          <div
                            key={`${bw.name}-${idx}`}
                            className={`flex items-center justify-between gap-2 ${
                              isCanvas ? 'px-5 py-2.5 text-xl' : 'px-3 py-1 text-[10px] sm:text-xs'
                            }`}
                          >
                            <span className={`font-bold truncate ${theme.headingColorClass}`}>
                              {bw.name}
                            </span>
                            <div className="flex items-center gap-3 sm:gap-4 font-mono tabular-nums shrink-0">
                              <span className={theme.mutedColorClass}>{bw.overs}</span>
                              <span className={theme.headingColorClass}>{bw.runsConceded}</span>
                              <span className={`font-black ${theme.accentTextClass}`}>
                                {bw.wickets}W
                              </span>
                              <span
                                className={theme.isLight ? 'text-emerald-700' : 'text-emerald-300'}
                              >
                                {bw.economy}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {cd.recentBalls.length > 0 && (
                    <div
                      className={`border-t ${
                        theme.isLight ? 'border-slate-200 bg-slate-100' : 'border-white/10 bg-white/5'
                      } flex items-center justify-between gap-2 ${
                        isCanvas ? 'px-5 py-3' : 'px-3 py-1.5'
                      }`}
                    >
                      <span
                        className={`font-display font-bold uppercase tracking-wider shrink-0 ${
                          theme.mutedColorClass
                        } ${isCanvas ? 'text-base' : 'text-[9px] sm:text-xs'}`}
                      >
                        Recent Balls
                      </span>
                      <div className="flex items-center gap-1 sm:gap-1.5 overflow-hidden">
                        {cd.recentBalls.slice(-8).map((ball, i) => (
                          <span
                            key={`${ball}-${i}`}
                            className={`inline-flex items-center justify-center rounded-full font-mono font-extrabold ${
                              ball === 'W' || ball.includes('W')
                                ? 'bg-red-600 text-white'
                                : ball === '6'
                                  ? 'bg-emerald-600 text-white'
                                  : ball === '4'
                                    ? 'bg-sky-600 text-white'
                                    : theme.isLight
                                      ? 'bg-slate-200 text-slate-800 border border-slate-300'
                                      : 'bg-slate-800 text-slate-200 border border-white/15'
                            } ${
                              isCanvas
                                ? 'w-9 h-9 text-base'
                                : 'w-5 h-5 sm:w-6 sm:h-6 text-[9px] sm:text-[11px]'
                            }`}
                          >
                            {ball}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {sport === 'Kabaddi' && (() => {
          const kd = normalizeKabaddiDetails(
            (score?.sportSpecificDetails || {}) as Partial<KabaddiDetails>
          );
          const eff = computeEffectiveKabaddiClock(kd, nowMs);
          const recentRaids = [...(kd.raidTimeline || [])]
            .filter((r) => !r.reverted)
            .slice(-4)
            .reverse();
          const maxDots = Math.max(1, kd.rules.playersPerSide || 7);

          const statRows = [
            { label: 'Raid Points', a: kd.teamA.raidPoints, b: kd.teamB.raidPoints },
            { label: 'Tackle Points', a: kd.teamA.tacklePoints, b: kd.teamB.tacklePoints },
            { label: 'Bonus Points', a: kd.teamA.bonusPoints, b: kd.teamB.bonusPoints },
            { label: 'All-Out Points', a: kd.teamA.allOutPoints, b: kd.teamB.allOutPoints },
            { label: 'Super Tackles', a: kd.teamA.superTackles, b: kd.teamB.superTackles },
          ];

          return (
            <div
              className={`flex-1 min-h-0 grid gap-2 sm:gap-4 ${
                isCanvas && isPortrait ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
              }`}
            >
              {/* Team Comparison Breakdown */}
              <div className={`${theme.panelCardClass} overflow-hidden flex flex-col`}>
                <div
                  className={`${theme.panelHeaderClass} flex items-center justify-between font-display font-bold uppercase tracking-wider ${
                    isCanvas ? 'px-5 py-3 text-lg' : 'px-3 py-1.5 text-[10px] sm:text-xs'
                  }`}
                >
                  <span className={`truncate ${theme.accentTextClass}`}>
                    {broadcast.teamA.shortName}
                  </span>
                  <span className={theme.mutedColorClass}>Match Stats</span>
                  <span className={`truncate ${theme.headingColorClass}`}>
                    {broadcast.teamB.shortName}
                  </span>
                </div>
                <div className={`flex-1 divide-y ${theme.dividerClass} flex flex-col justify-center`}>
                  {statRows.map((row) => (
                    <div
                      key={row.label}
                      className={`flex items-center justify-between gap-2 ${
                        isCanvas ? 'px-6 py-2.5 text-xl' : 'px-3 py-1 text-[10px] sm:text-xs'
                      }`}
                    >
                      <span className={`font-mono font-black tabular-nums w-10 ${theme.accentTextClass}`}>
                        {row.a}
                      </span>
                      <span className={`font-semibold text-center flex-1 ${theme.headingColorClass}`}>
                        {row.label}
                      </span>
                      <span className={`font-mono font-black tabular-nums w-10 text-right ${theme.headingColorClass}`}>
                        {row.b}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mat Strength + Recent Raids */}
              <div className={`${theme.panelCardClass} overflow-hidden flex flex-col justify-between`}>
                <div
                  className={`${theme.panelHeaderClass} flex items-center justify-between ${
                    isCanvas ? 'px-5 py-3 text-lg' : 'px-3 py-1.5 text-[10px] sm:text-xs'
                  }`}
                >
                  <span className={`inline-flex items-center gap-1.5 font-display font-bold uppercase ${theme.accentTextClass}`}>
                    <Flame className="w-4 h-4" />
                    <span>Court Strength &amp; Raids</span>
                  </span>
                  <span className={`font-mono font-bold ${theme.headingColorClass}`}>
                    Clock {eff.formattedClock}
                  </span>
                </div>

                <div className={`space-y-2 ${isCanvas ? 'p-5' : 'p-2.5 sm:p-3'}`}>
                  {(
                    [
                      { name: broadcast.teamA.shortName, onCourt: kd.playersOnCourtA, color: teamAColor },
                      { name: broadcast.teamB.shortName, onCourt: kd.playersOnCourtB, color: teamBColor },
                    ] as const
                  ).map((row) => (
                    <div key={row.name} className="flex items-center justify-between gap-2">
                      <span
                        className={`font-bold truncate ${theme.headingColorClass} ${
                          isCanvas ? 'text-lg w-28' : 'text-[10px] sm:text-xs w-16'
                        }`}
                      >
                        {row.name} ({row.onCourt}/{maxDots})
                      </span>
                      <div className="flex items-center gap-1.5">
                        {Array.from({ length: maxDots }).map((_, idx) => {
                          const active = idx < row.onCourt;
                          return (
                            <span
                              key={idx}
                              style={active ? { backgroundColor: row.color } : undefined}
                              className={`rounded-full border ${
                                active ? 'border-white/50' : 'bg-slate-800 border-slate-700'
                              } ${isCanvas ? 'w-5 h-5' : 'w-2.5 h-2.5 sm:w-3.5 sm:h-3.5'}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className={`border-t divide-y ${theme.dividerClass}`}>
                  {recentRaids.length === 0 ? (
                    <p
                      className={`${theme.mutedColorClass} ${
                        isCanvas ? 'px-5 py-3 text-base' : 'px-3 py-1.5 text-[10px]'
                      }`}
                    >
                      Recent raid events appear live during play.
                    </p>
                  ) : (
                    recentRaids.map((raid) => (
                      <div
                        key={raid.id}
                        className={`flex items-center justify-between gap-2 ${
                          isCanvas ? 'px-5 py-2 text-base' : 'px-3 py-1 text-[10px] sm:text-xs'
                        }`}
                      >
                        <span className={`truncate ${theme.headingColorClass}`}>
                          <strong className={theme.accentTextClass}>
                            {raid.team === 'A' ? broadcast.teamA.shortName : broadcast.teamB.shortName}
                          </strong>{' '}
                          {raid.description || raid.eventType.replace(/_/g, ' ')}
                        </span>
                        <span
                          className={`font-mono font-bold shrink-0 ${
                            theme.isLight ? 'text-emerald-700' : 'text-emerald-300'
                          }`}
                        >
                          +{raid.points}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {sport === 'Volleyball' && (() => {
          const vd = normalizeVolleyballDetails(
            (score?.sportSpecificDetails || {}) as Partial<VolleyballDetails>
          );
          const sets = vd.setScores || [];
          return (
            <div
              className={`flex-1 min-h-0 flex flex-col justify-between gap-2 sm:gap-4 ${theme.panelCardClass} p-3 sm:p-6`}
            >
              <div className={`flex flex-wrap items-center justify-between gap-2 border-b pb-2 ${theme.dividerClass}`}>
                <span
                  className={`font-display font-bold uppercase tracking-wider ${theme.accentTextClass} ${
                    isCanvas ? 'text-2xl' : 'text-xs sm:text-base'
                  }`}
                >
                  Set-by-Set Scoreboard (Best of {vd.bestOfSets})
                </span>
                <span
                  className={`font-mono font-bold ${theme.headingColorClass} ${
                    isCanvas ? 'text-xl' : 'text-[10px] sm:text-sm'
                  }`}
                >
                  Serving: {vd.servingTeam === 'A' ? broadcast.teamA.shortName : broadcast.teamB.shortName}
                  {vd.isDeuce ? ' · DEUCE' : ''}
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-4 flex-1 items-center">
                {Array.from({ length: vd.bestOfSets }).map((_, idx) => {
                  const setNo = idx + 1;
                  const row = sets.find((s) => s.set === setNo);
                  const isCurrent = setNo === vd.currentSet;
                  return (
                    <div
                      key={setNo}
                      style={isCurrent ? { borderColor: theme.accentHex } : undefined}
                      className={`rounded-xl border text-center ${
                        isCurrent
                          ? theme.isLight
                            ? 'bg-sky-100'
                            : 'bg-amber-500/15'
                          : theme.isLight
                            ? 'border-slate-300 bg-white'
                            : 'border-white/10 bg-white/5'
                      } ${isCanvas ? 'p-5 space-y-2' : 'p-2 sm:p-3 space-y-1'}`}
                    >
                      <p
                        className={`font-mono font-bold uppercase ${
                          isCurrent ? theme.accentTextClass : theme.mutedColorClass
                        } ${isCanvas ? 'text-lg' : 'text-[10px] sm:text-xs'}`}
                      >
                        Set {setNo}
                      </p>
                      <p
                        className={`font-mono font-black tabular-nums ${theme.headingColorClass} ${
                          isCanvas ? 'text-4xl' : 'text-sm sm:text-2xl'
                        }`}
                      >
                        {row ? `${row.teamA} - ${row.teamB}` : '—'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {sport === 'Football' && (() => {
          const fd: FootballDetails = {
            ...createInitialFootballDetails(),
            ...((score?.sportSpecificDetails || {}) as Partial<FootballDetails>),
          };
          const events = [...(fd.events || [])].slice(-4).reverse();
          return (
            <div
              className={`flex-1 min-h-0 grid gap-2 sm:gap-4 ${
                isCanvas && isPortrait ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
              }`}
            >
              <div
                className={`${theme.panelCardClass} overflow-hidden flex flex-col justify-center divide-y ${theme.dividerClass}`}
              >
                {[
                  { label: 'Yellow Cards', a: fd.teamAYellowCards, b: fd.teamBYellowCards },
                  { label: 'Red Cards', a: fd.teamARedCards, b: fd.teamBRedCards },
                  { label: 'Penalties', a: fd.teamAPenalties, b: fd.teamBPenalties },
                ].map((row) => (
                  <div
                    key={row.label}
                    className={`flex items-center justify-between ${
                      isCanvas ? 'px-6 py-4 text-2xl' : 'px-3 py-1.5 text-xs sm:text-sm'
                    }`}
                  >
                    <span className={`font-mono font-black ${theme.accentTextClass}`}>{row.a}</span>
                    <span className={`font-semibold ${theme.headingColorClass}`}>{row.label}</span>
                    <span className={`font-mono font-black ${theme.headingColorClass}`}>{row.b}</span>
                  </div>
                ))}
              </div>

              <div className={`${theme.panelCardClass} overflow-hidden flex flex-col`}>
                <div
                  className={`${theme.panelHeaderClass} font-display font-bold uppercase tracking-wider ${theme.accentTextClass} ${
                    isCanvas ? 'px-5 py-3 text-lg' : 'px-3 py-1.5 text-[10px] sm:text-xs'
                  }`}
                >
                  Key Match Events
                </div>
                <div className={`divide-y ${theme.dividerClass} flex-1`}>
                  {events.length === 0 ? (
                    <p
                      className={`${theme.mutedColorClass} ${
                        isCanvas ? 'p-5 text-lg' : 'p-3 text-xs'
                      }`}
                    >
                      Goals, cards, and substitutions appear live here.
                    </p>
                  ) : (
                    events.map((ev) => (
                      <div
                        key={ev.id}
                        className={`flex items-center justify-between gap-2 ${
                          isCanvas ? 'px-5 py-2.5 text-lg' : 'px-3 py-1 text-[10px] sm:text-xs'
                        }`}
                      >
                        <span className={`font-mono font-bold shrink-0 ${theme.accentTextClass}`}>
                          {ev.minuteLabel}
                        </span>
                        <span className={`truncate flex-1 ${theme.headingColorClass}`}>
                          {ev.playerName || ev.eventType.replace(/_/g, ' ')}
                        </span>
                        <span className={`font-mono shrink-0 ${theme.mutedColorClass}`}>
                          {ev.team === 'A' ? broadcast.teamA.shortName : broadcast.teamB.shortName}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {sport === 'Other' && (
          <div
            className={`flex-1 min-h-0 ${theme.panelCardClass} flex flex-col items-center justify-center text-center gap-2 ${
              isCanvas ? 'p-8' : 'p-3 sm:p-5'
            }`}
          >
            <Shield className={`${isCanvas ? 'w-14 h-14' : 'w-6 h-6'} ${theme.accentTextClass}`} />
            <p
              className={`font-display font-bold ${theme.headingColorClass} ${
                isCanvas ? 'text-3xl' : 'text-sm sm:text-lg'
              }`}
            >
              {broadcast.title}
            </p>
            <p
              className={`${theme.mutedColorClass} ${
                isCanvas ? 'text-xl' : 'text-[11px] sm:text-sm'
              }`}
            >
              Match Status: {score?.matchStatus || broadcast.centerMeta.statusLabel}
            </p>
          </div>
        )}
      </div>

      {/* Bottom Ticker Strip */}
      <footer
        className={`relative z-10 border-t flex items-center justify-between gap-3 shrink-0 ${theme.footerBgClass} ${
          isCanvas ? 'px-12 py-3.5 text-base' : 'px-3 py-1.5 sm:px-5 sm:py-2 text-[10px] sm:text-xs'
        }`}
      >
        <span className={`font-mono uppercase tracking-wider truncate ${theme.mutedColorClass}`}>
          MaidanLive Broadcast Center · Full Match Scoreboard
        </span>
        <span className={`font-semibold shrink-0 ${theme.accentTextClass}`}>
          {broadcast.subStripItems
            .slice(0, 2)
            .map((item) => `${item.label}: ${item.value}`)
            .join(' · ') || 'Live Telemetry Sync'}
        </span>
      </footer>
    </div>
  );
}
