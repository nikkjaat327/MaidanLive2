import { useEffect, useState } from 'react';
import type { ObsThemeTokens } from './obsTheme.ts';

interface ObsBrandMarkProps {
  theme: ObsThemeTokens;
  compact?: boolean;
  accentColor?: string;
}

export function ObsBrandMark({ theme, compact = false, accentColor }: ObsBrandMarkProps) {
  return (
    <div
      style={{
        background: accentColor
          ? `linear-gradient(135deg, ${accentColor} 0%, #0F172A 150%)`
          : theme.brandBg,
        color: theme.brandText,
      }}
      className={`flex items-center gap-1.5 shrink-0 select-none ${
        compact ? 'px-2.5 py-1.5' : 'px-3 py-2'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} shrink-0`}
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
        className={`font-display font-extrabold tracking-wider uppercase leading-none ${
          compact ? 'text-[10px]' : 'text-[11px]'
        }`}
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
  showLogo?: boolean;
}

export function ObsTeamBadge({
  logoUrl,
  shortName,
  accentColor = '#EA580C',
  size = 'md',
  showLogo = true,
}: ObsTeamBadgeProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  const dim = size === 'sm' ? 'w-6 h-6 text-[9px]' : 'w-8 h-8 text-[10px]';

  if (showLogo && logoUrl && logoUrl.trim() && !failed) {
    return (
      <div
        className={`${dim} rounded-md overflow-hidden shrink-0 border border-white/20 bg-white/10 flex items-center justify-center shadow-inner`}
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
        background: `linear-gradient(135deg, ${accentColor} 0%, rgba(15,23,42,0.92) 125%)`,
      }}
      className={`${dim} rounded-md shrink-0 border border-white/20 text-white font-display font-extrabold tracking-wider uppercase flex items-center justify-center shadow-inner`}
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
}

export function ObsLiveStatusPill({
  label,
  isLive,
  variant = 'live',
  compact = false,
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

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border font-display font-extrabold uppercase tracking-wider shrink-0 leading-none ${palette} ${
        compact ? 'px-2 py-1 text-[9px]' : 'px-2.5 py-1 text-[10px]'
      }`}
    >
      {isLive && (
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
      )}
      <span>{label}</span>
    </span>
  );
}
