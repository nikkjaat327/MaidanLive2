import { useEffect, useState } from 'react';
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
