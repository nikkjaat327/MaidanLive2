import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { BroadcastOverlayConfig } from '../../types/index.ts';
import {
  BRAND_LOGO_BOUNDS,
  DEFAULT_OVERLAY_CONFIG,
  resolveBrandLogoUrl,
  type OverlayPosition,
} from '../../utils/overlayConfig.ts';
import type { ObsThemeTokens } from './obsTheme.ts';

interface ObsBrandMarkProps {
  theme: ObsThemeTokens;
  compact?: boolean;
  accentColor?: string;
  iconPx?: number;
  fontPx?: number;
  padX?: number;
  padY?: number;
}

export function ObsBrandMark({
  theme,
  compact = false,
  accentColor,
  iconPx,
  fontPx,
  padX,
  padY,
}: ObsBrandMarkProps) {
  const resolvedIcon = iconPx ?? (compact ? 14 : 16);
  const resolvedFont = fontPx ?? (compact ? 10 : 11);
  const resolvedPadX = padX ?? (compact ? 10 : 12);
  const resolvedPadY = padY ?? (compact ? 6 : 8);

  return (
    <div
      style={{
        background: accentColor
          ? `linear-gradient(135deg, ${accentColor} 0%, #0F172A 150%)`
          : theme.brandBg,
        color: theme.brandText,
        paddingLeft: resolvedPadX,
        paddingRight: resolvedPadX,
        paddingTop: resolvedPadY,
        paddingBottom: resolvedPadY,
      }}
      className="flex items-center gap-1.5 shrink-0 select-none"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ width: resolvedIcon, height: resolvedIcon }}
        className="shrink-0"
      >
        <path
          d="M12 2L20 5.5V11.8C20 16.9 16.6 20.8 12 22.5C7.4 20.8 4 16.9 4 11.8V5.5L12 2Z"
          fill="currentColor"
          fillOpacity="0.2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M8.2 14.8V9.2L12 12.6L15.8 9.2V14.8"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        style={{ fontSize: resolvedFont }}
        className="font-display font-extrabold tracking-wider uppercase leading-none whitespace-nowrap"
      >
        MAIDAN<span className="opacity-80">LIVE</span>
      </span>
    </div>
  );
}

export function MaidanLiveFallbackLogoCrest({
  height,
  className = '',
}: {
  height: number | string;
  className?: string;
}) {
  return (
    <div
      style={{ height }}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/90 border border-pink-500/60 shadow-[0_0_20px_rgba(236,72,153,0.45),0_6px_18px_rgba(0,0,0,0.75)] backdrop-blur-md select-none ${className}`}
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="h-[78%] w-auto aspect-square shrink-0"
      >
        <defs>
          <linearGradient id="ml-crest-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#EC4899" />
            <stop offset="55%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#06B6D4" />
          </linearGradient>
        </defs>
        <path
          d="M16 2.5L27 7.2V15.4C27 22.1 22.4 27.5 16 29.6C9.6 27.5 5 22.1 5 15.4V7.2L16 2.5Z"
          fill="url(#ml-crest-grad)"
          fillOpacity="0.22"
          stroke="url(#ml-crest-grad)"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M10.5 20V11.5L16 16.5L21.5 11.5V20"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex flex-col justify-center leading-none pr-0.5">
        <span className="font-display font-black tracking-wider text-white uppercase whitespace-nowrap text-[clamp(11px,1.9em,22px)]">
          MAIDAN<span className="text-pink-400">LIVE</span>
        </span>
        <span className="font-mono font-bold tracking-[0.2em] text-cyan-300 uppercase whitespace-nowrap text-[clamp(7px,0.75em,10px)] mt-0.5">
          SPORTS BROADCAST
        </span>
      </div>
    </div>
  );
}

interface BroadcastBrandLogoBugProps {
  config?: Partial<BroadcastOverlayConfig> | null;
  serverLogoUrl?: string | null;
  variant?: 'canvas' | 'responsive';
  zIndex?: number;
  className?: string;
}

export function BroadcastBrandLogoBug({
  config,
  serverLogoUrl,
  variant = 'canvas',
  zIndex = 24,
  className = '',
}: BroadcastBrandLogoBugProps) {
  const show = config?.showBrandLogo ?? DEFAULT_OVERLAY_CONFIG.showBrandLogo;
  const logoUrl = resolveBrandLogoUrl(config, serverLogoUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  if (!show) {
    return null;
  }

  const pos: OverlayPosition =
    config?.brandLogoPosition ?? DEFAULT_OVERLAY_CONFIG.brandLogoPosition;
  const rawSize = config?.brandLogoSize ?? BRAND_LOGO_BOUNDS.brandLogoSize.defaultVal;
  const opacity = config?.brandLogoOpacity ?? BRAND_LOGO_BOUNDS.brandLogoOpacity.defaultVal;
  const rawOffX = config?.brandLogoOffsetX ?? BRAND_LOGO_BOUNDS.brandLogoOffsetX.defaultVal;
  const rawOffY = config?.brandLogoOffsetY ?? BRAND_LOGO_BOUNDS.brandLogoOffsetY.defaultVal;

  const isResponsive = variant === 'responsive';
  const offsetX = isResponsive ? Math.max(8, Math.round(rawOffX * 0.45)) : rawOffX;
  const offsetY = isResponsive ? Math.max(8, Math.round(rawOffY * 0.45)) : rawOffY;
  const heightStyle = isResponsive
    ? `clamp(24px, ${Math.round(rawSize * 0.52)}px, 96px)`
    : `${rawSize}px`;

  const posStyle: CSSProperties = {
    position: 'absolute',
    zIndex,
    opacity,
    pointerEvents: 'none',
  };

  if (pos.startsWith('top')) posStyle.top = `${offsetY}px`;
  else posStyle.bottom = `${offsetY}px`;

  if (pos.endsWith('left')) {
    posStyle.left = `${offsetX}px`;
  } else if (pos.endsWith('right')) {
    posStyle.right = `${offsetX}px`;
  } else {
    posStyle.left = '50%';
    posStyle.transform = 'translateX(-50%)';
  }

  return (
    <div style={posStyle} className={`select-none ${className}`} data-obs-brand-logo="true">
      {logoUrl && !failed ? (
        <img
          src={logoUrl}
          alt="MaidanLive Broadcast Logo"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          style={{ height: heightStyle, width: 'auto' }}
          className="object-contain max-w-[320px] drop-shadow-[0_4px_14px_rgba(0,0,0,0.75)]"
        />
      ) : (
        <MaidanLiveFallbackLogoCrest height={heightStyle} />
      )}
    </div>
  );
}

interface ObsTeamBadgeProps {
  logoUrl?: string;
  shortName: string;
  accentColor?: string;
  size?: 'sm' | 'md';
  sizePx?: number;
  showLogo?: boolean;
}

export function ObsTeamBadge({
  logoUrl,
  shortName,
  accentColor = '#EA580C',
  size = 'md',
  sizePx,
  showLogo = true,
}: ObsTeamBadgeProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  const resolvedPx = sizePx ?? (size === 'sm' ? 24 : 32);
  const textPx = Math.max(8, Math.round(resolvedPx * 0.34));

  if (showLogo && logoUrl && logoUrl.trim() && !failed) {
    return (
      <div
        style={{ width: resolvedPx, height: resolvedPx }}
        className="rounded-md overflow-hidden shrink-0 border border-white/20 bg-white/10 flex items-center justify-center shadow-inner"
      >
        <img
          src={logoUrl}
          alt={shortName}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      style={{
        width: resolvedPx,
        height: resolvedPx,
        fontSize: textPx,
        background: `linear-gradient(135deg, ${accentColor} 0%, rgba(15,23,42,0.92) 125%)`,
      }}
      className="rounded-md shrink-0 border border-white/20 text-white font-display font-extrabold tracking-wider uppercase flex items-center justify-center shadow-inner"
    >
      {shortName.slice(0, 3)}
    </div>
  );
}

interface ObsLiveStatusPillProps {
  label: string;
  isLive: boolean;
  variant?: 'live' | 'break' | 'warning' | 'final' | 'upcoming';
  compact?: boolean;
  fontPx?: number;
  padX?: number;
  padY?: number;
}

export function ObsLiveStatusPill({
  label,
  isLive,
  variant = 'live',
  compact = false,
  fontPx,
  padX,
  padY,
}: ObsLiveStatusPillProps) {
  const palette =
    variant === 'live'
      ? 'bg-red-600 text-white border-red-400/50'
      : variant === 'break'
        ? 'bg-amber-500 text-slate-950 border-amber-300/60'
        : variant === 'warning'
          ? 'bg-rose-600 text-white border-rose-300/50'
          : variant === 'final'
            ? 'bg-emerald-600 text-white border-emerald-300/40'
            : 'bg-slate-700 text-slate-100 border-slate-500/40';

  const resolvedFont = fontPx ?? (compact ? 9 : 10);
  const resolvedPadX = padX ?? (compact ? 8 : 10);
  const resolvedPadY = padY ?? 4;
  const dotSize = Math.max(5, Math.round(resolvedFont * 0.6));

  return (
    <span
      style={{
        fontSize: resolvedFont,
        paddingLeft: resolvedPadX,
        paddingRight: resolvedPadX,
        paddingTop: resolvedPadY,
        paddingBottom: resolvedPadY,
      }}
      className={`inline-flex items-center gap-1.5 rounded border font-display font-extrabold uppercase tracking-wider shrink-0 leading-none whitespace-nowrap ${palette}`}
    >
      {isLive && (
        <span
          style={{ width: dotSize, height: dotSize }}
          className="rounded-full bg-white animate-pulse shrink-0"
        />
      )}
      <span>{label}</span>
    </span>
  );
}
