import type { BroadcastOverlayConfig, OverlayTheme } from '../../utils/overlayConfig.ts';

export interface ObsThemeTokens {
  id: OverlayTheme;
  label: string;
  barBg: string;
  barBorder: string;
  brandBg: string;
  brandText: string;
  scorePillBg: string;
  scorePillText: string;
  subStripBg: string;
  subStripBorder: string;
  primaryText: string;
  secondaryText: string;
  mutedText: string;
  accentPrimary: string;
  accentSecondary: string;
  chaseHighlightBg: string;
  chaseHighlightText: string;
  divider: string;
  isLight: boolean;
}

export const OBS_THEME_MAP: Record<OverlayTheme, ObsThemeTokens> = {
  maidan_dark: {
    id: 'maidan_dark',
    label: 'MaidanLive Dark',
    barBg: 'linear-gradient(135deg, #070C1B 0%, #0E172E 52%, #090F1E 100%)',
    barBorder: 'rgba(255, 255, 255, 0.14)',
    brandBg: 'linear-gradient(135deg, #EA580C 0%, #C2410C 100%)',
    brandText: '#FFFFFF',
    scorePillBg: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
    scorePillText: '#FFFFFF',
    subStripBg: 'rgba(6, 10, 22, 0.92)',
    subStripBorder: 'rgba(255, 255, 255, 0.10)',
    primaryText: '#F8FAFC',
    secondaryText: '#CBD5E1',
    mutedText: '#94A3B8',
    accentPrimary: '#FB923C',
    accentSecondary: '#34D399',
    chaseHighlightBg: 'linear-gradient(90deg, rgba(234, 88, 12, 0.24) 0%, rgba(245, 158, 11, 0.16) 100%)',
    chaseHighlightText: '#FDE68A',
    divider: 'rgba(255, 255, 255, 0.14)',
    isLight: false,
  },
  stadium_blue: {
    id: 'stadium_blue',
    label: 'Stadium Blue',
    barBg: 'linear-gradient(135deg, #051636 0%, #0B2A63 55%, #061A40 100%)',
    barBorder: 'rgba(56, 189, 248, 0.28)',
    brandBg: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
    brandText: '#FFFFFF',
    scorePillBg: 'linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 100%)',
    scorePillText: '#FFFFFF',
    subStripBg: 'rgba(4, 15, 42, 0.94)',
    subStripBorder: 'rgba(56, 189, 248, 0.20)',
    primaryText: '#F8FAFC',
    secondaryText: '#BAE6FD',
    mutedText: '#7DD3FC',
    accentPrimary: '#FACC15',
    accentSecondary: '#38BDF8',
    chaseHighlightBg: 'linear-gradient(90deg, rgba(2, 132, 199, 0.35) 0%, rgba(14, 165, 233, 0.18) 100%)',
    chaseHighlightText: '#FEF08A',
    divider: 'rgba(125, 211, 252, 0.22)',
    isLight: false,
  },
  red_broadcast: {
    id: 'red_broadcast',
    label: 'Red Broadcast',
    barBg: 'linear-gradient(135deg, #16060B 0%, #2B0B14 50%, #15050A 100%)',
    barBorder: 'rgba(248, 113, 113, 0.28)',
    brandBg: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)',
    brandText: '#FFFFFF',
    scorePillBg: 'linear-gradient(135deg, #B91C1C 0%, #7F1D1D 100%)',
    scorePillText: '#FFFFFF',
    subStripBg: 'rgba(18, 4, 8, 0.94)',
    subStripBorder: 'rgba(248, 113, 113, 0.18)',
    primaryText: '#FFFFFF',
    secondaryText: '#FECACA',
    mutedText: '#FCA5A5',
    accentPrimary: '#FBBF24',
    accentSecondary: '#4ADE80',
    chaseHighlightBg: 'linear-gradient(90deg, rgba(220, 38, 38, 0.32) 0%, rgba(185, 28, 28, 0.18) 100%)',
    chaseHighlightText: '#FDE68A',
    divider: 'rgba(255, 255, 255, 0.16)',
    isLight: false,
  },
  minimal_white: {
    id: 'minimal_white',
    label: 'Minimal White',
    barBg: 'linear-gradient(135deg, rgba(255,255,255,0.97) 0%, rgba(241,245,249,0.97) 100%)',
    barBorder: 'rgba(15, 23, 42, 0.16)',
    brandBg: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
    brandText: '#FFFFFF',
    scorePillBg: 'linear-gradient(135deg, #EA580C 0%, #C2410C 100%)',
    scorePillText: '#FFFFFF',
    subStripBg: 'rgba(248, 250, 252, 0.96)',
    subStripBorder: 'rgba(15, 23, 42, 0.12)',
    primaryText: '#0F172A',
    secondaryText: '#334155',
    mutedText: '#64748B',
    accentPrimary: '#C2410C',
    accentSecondary: '#047857',
    chaseHighlightBg: 'linear-gradient(90deg, rgba(234, 88, 12, 0.12) 0%, rgba(245, 158, 11, 0.10) 100%)',
    chaseHighlightText: '#9A3412',
    divider: 'rgba(15, 23, 42, 0.14)',
    isLight: true,
  },
  team_colors: {
    id: 'team_colors',
    label: 'Team Accent Colors',
    barBg: 'linear-gradient(135deg, #080E1E 0%, #111827 55%, #070B16 100%)',
    barBorder: 'rgba(255, 255, 255, 0.18)',
    brandBg: 'linear-gradient(135deg, #EA580C 0%, #C2410C 100%)',
    brandText: '#FFFFFF',
    scorePillBg: 'linear-gradient(135deg, #1F2937 0%, #0F172A 100%)',
    scorePillText: '#FFFFFF',
    subStripBg: 'rgba(7, 11, 22, 0.94)',
    subStripBorder: 'rgba(255, 255, 255, 0.12)',
    primaryText: '#F8FAFC',
    secondaryText: '#E2E8F0',
    mutedText: '#94A3B8',
    accentPrimary: '#FBBF24',
    accentSecondary: '#34D399',
    chaseHighlightBg: 'linear-gradient(90deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.04) 100%)',
    chaseHighlightText: '#FDE68A',
    divider: 'rgba(255, 255, 255, 0.16)',
    isLight: false,
  },
};

export function resolveObsTheme(config: BroadcastOverlayConfig): ObsThemeTokens {
  return OBS_THEME_MAP[config.theme] || OBS_THEME_MAP.maidan_dark;
}
