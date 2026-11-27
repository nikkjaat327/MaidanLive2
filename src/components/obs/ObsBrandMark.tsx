import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { BroadcastOverlayConfig } from '../../types/index.ts';
import {
  BRAND_LOGO_BOUNDS,
  DEFAULT_OVERLAY_CONFIG,
  resolveBrandLogoUrl,
  type OverlayPosition,
} from '../../utils/overlayConfig.ts';
import { useEnvBrandLogo } from '../../hooks/useEnvBrandLogo.ts';
import type { ObsThemeTokens } from './obsTheme.ts';

interface ObsBrandMarkProps {
  theme: ObsThemeTokens;
  compact?: boolean;
  accentColor?: string;
  iconPx?: number;
  fontPx?: number;
  padX?: number;
  padY?: number;
  serverLogoUrl?: string | null;
}

export function ObsBrandMark({
  theme,
  compact = false,
  accentColor,
  iconPx,
  padX,
  padY,
  serverLogoUrl,
}: ObsBrandMarkProps) {
  const envLogo = useEnvBrandLogo(serverLogoUrl);
  const logoUrl = resolveBrandLogoUrl(null, envLogo);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  if (!logoUrl || failed) {
    return null;
  }

  const resolvedIcon = iconPx ?? (compact ? 14 : 16);
  const resolvedPadX = padX ?? (compact ? 10 : 12);
  const resolvedPadY = padY ?? (compact ? 6 : 8);
  const logoHeight = Math.max(16, Math.round(resolvedIcon * 1.4));

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
      className="flex items-center justify-center shrink-0 select-none"
    >
      <img
        src={logoUrl}
        alt="Broadcast Logo"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={{ height: logoHeight, width: 'auto' }}
        className="object-contain max-w-[96px] shrink-0"
      />
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
  const envLogo = useEnvBrandLogo(serverLogoUrl);
  const logoUrl = resolveBrandLogoUrl(config, envLogo);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  if (!show || !logoUrl || failed) {
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
      <img
        src={logoUrl}
        alt="Broadcast Logo"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={{ height: heightStyle, width: 'auto' }}
        className="object-contain max-w-[320px] drop-shadow-[0_4px_14px_rgba(0,0,0,0.75)]"
      />
    </div>
  );
}

export function EnvBrandLogoImg({
  alt = 'Brand Logo',
  className = 'h-6 w-auto object-contain shrink-0',
}: {
  alt?: string;
  className?: string;
}) {
  const envLogo = useEnvBrandLogo();
  const logoUrl = resolveBrandLogoUrl(null, envLogo);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  if (!logoUrl || failed) {
    return null;
  }

  return (
    <img
      src={logoUrl}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
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
