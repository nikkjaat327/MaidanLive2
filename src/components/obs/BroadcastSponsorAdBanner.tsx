import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { BroadcastOverlayConfig } from '../../types/index.ts';
import { DEFAULT_OVERLAY_CONFIG, type OverlayPosition } from '../../utils/overlayConfig.ts';
import {
  getSponsorLoopAnimation,
  getSponsorTransitionAnimation,
  useSponsorAdCycle,
} from '../../utils/sponsorAnimation.ts';

interface BroadcastSponsorAdBannerProps {
  config?: Partial<BroadcastOverlayConfig> | null;
  variant?: 'canvas' | 'responsive';
  zIndex?: number;
  className?: string;
  suppress?: boolean;
}

export function BroadcastSponsorAdBanner({
  config,
  variant = 'canvas',
  zIndex = 26,
  className = '',
  suppress = false,
}: BroadcastSponsorAdBannerProps) {
  const visible = Boolean(config?.sponsorAdVisible) && !suppress;
  const name = (config?.sponsorAdName || '').trim();
  const tagline = (config?.sponsorAdTagline || '').trim();
  const logoUrl = (config?.sponsorAdLogoUrl || '').trim();
  const cta = (config?.sponsorAdCta || '').trim();
  const [logoFailed, setLogoFailed] = useState(false);

  const durationSeconds =
    config?.sponsorAdDurationSeconds ?? DEFAULT_OVERLAY_CONFIG.sponsorAdDurationSeconds;
  const animation = config?.sponsorAdAnimation ?? DEFAULT_OVERLAY_CONFIG.sponsorAdAnimation;
  const transition = config?.sponsorAdTransition ?? DEFAULT_OVERLAY_CONFIG.sponsorAdTransition;
  const transitionMs =
    config?.sponsorAdTransitionMs ?? DEFAULT_OVERLAY_CONFIG.sponsorAdTransitionMs;
  const repeatIntervalSeconds =
    config?.sponsorAdRepeatIntervalSeconds ??
    DEFAULT_OVERLAY_CONFIG.sponsorAdRepeatIntervalSeconds;
  const repeatContinuously =
    config?.sponsorAdRepeatContinuously ?? DEFAULT_OVERLAY_CONFIG.sponsorAdRepeatContinuously;
  const adScale = config?.sponsorAdScale ?? DEFAULT_OVERLAY_CONFIG.sponsorAdScale;
  const cfgOffsetX = config?.sponsorAdOffsetX ?? DEFAULT_OVERLAY_CONFIG.sponsorAdOffsetX;
  const cfgOffsetY = config?.sponsorAdOffsetY ?? DEFAULT_OVERLAY_CONFIG.sponsorAdOffsetY;

  const hasContent = Boolean(name || tagline || logoUrl);
  const { phase, cycleCount } = useSponsorAdCycle({
    enabled: visible && hasContent,
    durationSeconds,
    transitionMs,
    transition,
    repeatIntervalSeconds,
    repeatContinuously,
    cycleKey: `${config?.sponsorAdId || ''}|${name}|${tagline}|${logoUrl}`,
  });

  useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);

  if (!visible || !hasContent || phase === 'hidden') {
    return null;
  }

  const pos: OverlayPosition =
    config?.sponsorAdPosition ?? DEFAULT_OVERLAY_CONFIG.sponsorAdPosition;
  const isResponsive = variant === 'responsive';
  const offsetX = isResponsive ? Math.max(8, Math.round(cfgOffsetX * 0.35)) : cfgOffsetX;
  const offsetY = isResponsive ? Math.max(8, Math.round(cfgOffsetY * 0.35)) : cfgOffsetY;

  const isTop = pos.startsWith('top');
  const isLeft = pos.endsWith('left');
  const isRight = pos.endsWith('right');
  const isCenter = !isLeft && !isRight;

  const posStyle: CSSProperties = {
    position: 'absolute',
    zIndex,
    pointerEvents: 'none',
    transformOrigin: `${isTop ? 'top' : 'bottom'} ${isLeft ? 'left' : isRight ? 'right' : 'center'}`,
  };

  if (isTop) posStyle.top = `${offsetY}px`;
  else posStyle.bottom = `${(isResponsive ? 46 : 140) + offsetY}px`;

  if (isLeft) {
    posStyle.left = `${offsetX}px`;
    if (adScale !== 1) posStyle.transform = `scale(${adScale})`;
  } else if (isRight) {
    posStyle.right = `${offsetX}px`;
    if (adScale !== 1) posStyle.transform = `scale(${adScale})`;
  } else {
    posStyle.left = '50%';
    posStyle.transform =
      adScale !== 1 ? `translateX(-50%) scale(${adScale})` : 'translateX(-50%)';
  }

  const initials = (name || 'SP').slice(0, 2).toUpperCase();
  const transitionAnim = getSponsorTransitionAnimation(transition, phase, transitionMs);
  const loopAnim = getSponsorLoopAnimation(animation);

  return (
    <div
      style={posStyle}
      data-obs-sponsor-ad="true"
      className={`select-none ${isResponsive ? 'max-w-[260px]' : 'max-w-[520px]'} ${className}`}
    >
      <div
        key={`sp-tr-${cycleCount}-${phase === 'exiting' ? 'out' : 'in'}`}
        style={transitionAnim ? { animation: transitionAnim } : undefined}
      >
        <div
          style={loopAnim ? { animation: loopAnim } : undefined}
          className={`relative overflow-hidden rounded-xl border border-amber-400/50 bg-slate-950/92 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.75),0_0_24px_rgba(245,158,11,0.22)] flex items-center ${
            isResponsive ? 'gap-2 px-2.5 py-1.5' : 'gap-3.5 px-4 py-2.5'
          }`}
        >
          {animation === 'shimmer' && (
            <div
              aria-hidden="true"
              style={{ animation: 'mlSponsorShimmerSweep 2.4s ease-in-out infinite' }}
              className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent"
            />
          )}

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
    </div>
  );
}
