import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { BroadcastOverlayConfig } from '../../types/index.ts';
import { DEFAULT_OVERLAY_CONFIG, type OverlayPosition } from '../../utils/overlayConfig.ts';

interface BroadcastSponsorAdBannerProps {
  config?: Partial<BroadcastOverlayConfig> | null;
  variant?: 'canvas' | 'responsive';
  zIndex?: number;
  className?: string;
}

export function BroadcastSponsorAdBanner({
  config,
  variant = 'canvas',
  zIndex = 26,
  className = '',
}: BroadcastSponsorAdBannerProps) {
  const visible = Boolean(config?.sponsorAdVisible);
  const name = (config?.sponsorAdName || '').trim();
  const tagline = (config?.sponsorAdTagline || '').trim();
  const logoUrl = (config?.sponsorAdLogoUrl || '').trim();
  const cta = (config?.sponsorAdCta || '').trim();
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);

  if (!visible || (!name && !tagline && !logoUrl)) {
    return null;
  }

  const pos: OverlayPosition =
    config?.sponsorAdPosition ?? DEFAULT_OVERLAY_CONFIG.sponsorAdPosition;
  const isResponsive = variant === 'responsive';
  const offsetX = isResponsive ? 12 : 34;
  const offsetY = isResponsive ? 12 : 28;

  const posStyle: CSSProperties = {
    position: 'absolute',
    zIndex,
    pointerEvents: 'none',
  };

  if (pos.startsWith('top')) posStyle.top = `${offsetY}px`;
  else posStyle.bottom = `${isResponsive ? 56 : 168}px`;

  if (pos.endsWith('left')) {
    posStyle.left = `${offsetX}px`;
  } else if (pos.endsWith('right')) {
    posStyle.right = `${offsetX}px`;
  } else {
    posStyle.left = '50%';
    posStyle.transform = 'translateX(-50%)';
  }

  const initials = (name || 'SP').slice(0, 2).toUpperCase();

  return (
    <div
      style={posStyle}
      data-obs-sponsor-ad="true"
      className={`select-none ${isResponsive ? 'max-w-[260px]' : 'max-w-[520px]'} ${className}`}
    >
      <div
        className={`relative overflow-hidden rounded-xl border border-amber-400/50 bg-slate-950/92 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.75),0_0_24px_rgba(245,158,11,0.22)] flex items-center ${
          isResponsive ? 'gap-2 px-2.5 py-1.5' : 'gap-3.5 px-4 py-2.5'
        }`}
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-amber-400 via-[#EA580C] to-pink-500"
        />

        {logoUrl && !logoFailed ? (
          <div
            className={`rounded-lg bg-white p-1 border border-white/20 shrink-0 flex items-center justify-center overflow-hidden ${
              isResponsive ? 'w-8 h-8' : 'w-14 h-14'
            }`}
          >
            <img
              src={logoUrl}
              alt={name || 'Sponsor'}
              referrerPolicy="no-referrer"
              onError={() => setLogoFailed(true)}
              className="w-full h-full object-contain"
            />
          </div>
        ) : (
          <div
            className={`rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white font-display font-black shrink-0 flex items-center justify-center shadow ${
              isResponsive ? 'w-8 h-8 text-xs' : 'w-14 h-14 text-xl'
            }`}
          >
            {initials}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 font-mono font-extrabold uppercase tracking-widest text-amber-300 ${
                isResponsive ? 'text-[8px]' : 'text-[10px]'
              }`}
            >
              SPONSORED AD
            </span>
            {cta && (
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded bg-[#EA580C] text-white font-display font-bold uppercase tracking-wide truncate ${
                  isResponsive ? 'text-[8px]' : 'text-[10px]'
                }`}
              >
                {cta}
              </span>
            )}
          </div>
          {name && (
            <p
              className={`font-display font-extrabold text-white truncate leading-tight mt-0.5 ${
                isResponsive ? 'text-xs' : 'text-lg'
              }`}
            >
              {name}
            </p>
          )}
          {tagline && (
            <p
              className={`text-slate-300 truncate leading-snug ${
                isResponsive ? 'text-[10px]' : 'text-xs'
              }`}
            >
              {tagline}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
