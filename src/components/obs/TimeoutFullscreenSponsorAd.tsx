import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Clock, ExternalLink, Megaphone, Sparkles } from 'lucide-react';
import type {
  BroadcastOverlayConfig,
  LiveScoreData,
  LiveStreamData,
  SponsorOverlayData,
} from '../../types/index.ts';
import type { MatchTimeoutInfo } from '../../utils/matchTimeout.ts';
import {
  DEFAULT_OVERLAY_CONFIG,
  type TimeoutAdLayout,
  type TimeoutAdPosition,
} from '../../utils/overlayConfig.ts';
import {
  getSponsorLoopAnimation,
  getSponsorTransitionAnimation,
} from '../../utils/sponsorAnimation.ts';
import { normalizeBroadcast } from '../../utils/normalizeBroadcast.ts';

interface TimeoutFullscreenSponsorAdProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  config?: Partial<BroadcastOverlayConfig> | null;
  timeoutInfo: MatchTimeoutInfo;
  fallbackSponsorOverlays?: SponsorOverlayData[];
  variant?: 'canvas' | 'responsive';
  isPortrait?: boolean;
  zIndex?: number;
  visible: boolean;
}

function formatCountdown(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return '';
  const safe = Math.max(0, Math.round(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return m > 0 ? `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${s}s`;
}

function resolveFlexAlignment(pos: TimeoutAdPosition): string {
  switch (pos) {
    case 'top-left':
      return 'items-start justify-start';
    case 'top-center':
      return 'items-start justify-center';
    case 'top-right':
      return 'items-start justify-end';
    case 'bottom-left':
      return 'items-end justify-start';
    case 'bottom-center':
      return 'items-end justify-center';
    case 'bottom-right':
      return 'items-end justify-end';
    default:
      return 'items-center justify-center';
  }
}

export function TimeoutFullscreenSponsorAd({
  stream,
  score,
  config,
  timeoutInfo,
  fallbackSponsorOverlays = [],
  variant = 'canvas',
  isPortrait = false,
  zIndex = 32,
  visible,
}: TimeoutFullscreenSponsorAdProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const [autoHidden, setAutoHidden] = useState(false);

  const timeoutOverlay =
    (config?.timeoutAdSponsorId
      ? fallbackSponsorOverlays.find(
          (o) => o?.isVisible !== false && o.sponsor?.id === config.timeoutAdSponsorId
        )
      : null) ||
    fallbackSponsorOverlays.find(
      (o) => o?.isVisible !== false && o.showOnTimeoutFullscreen && o.sponsor
    ) ||
    fallbackSponsorOverlays.find((o) => o?.isVisible !== false && o.sponsor) ||
    null;

  const spName =
    (config?.timeoutAdTitle || '').trim() ||
    (config?.sponsorAdName || '').trim() ||
    timeoutOverlay?.sponsor?.name ||
    'Official Broadcast Partner';
  const spTagline =
    (config?.timeoutAdSubtitle || '').trim() ||
    (config?.sponsorAdTagline || '').trim() ||
    timeoutOverlay?.announcementText ||
    timeoutOverlay?.sponsor?.tagline ||
    timeoutOverlay?.sponsor?.sponsorshipType ||
    'Proudly Supporting Live Grassroots & Arena Sports';
  const spLogoUrl =
    (config?.timeoutAdLogoUrl || '').trim() ||
    (config?.sponsorAdLogoUrl || '').trim() ||
    timeoutOverlay?.sponsor?.logoUrl ||
    '';
  const spCta =
    (config?.timeoutAdCta || '').trim() ||
    (config?.sponsorAdCta || '').trim() ||
    timeoutOverlay?.sponsor?.ctaText ||
    timeoutOverlay?.sponsor?.sponsorshipType ||
    'OFFICIAL PARTNER';
  const spBadgeText =
    (config?.timeoutAdBadgeText || '').trim() || DEFAULT_OVERLAY_CONFIG.timeoutAdBadgeText;
  const websiteUrl =
    variant === 'responsive' ? (timeoutOverlay?.sponsor?.websiteUrl || '').trim() : '';

  const durationSeconds =
    config?.timeoutAdDurationSeconds ?? DEFAULT_OVERLAY_CONFIG.timeoutAdDurationSeconds;
  const layout: TimeoutAdLayout =
    config?.timeoutAdLayout ?? DEFAULT_OVERLAY_CONFIG.timeoutAdLayout;
  const position: TimeoutAdPosition =
    config?.timeoutAdPosition ?? DEFAULT_OVERLAY_CONFIG.timeoutAdPosition;
  const animation =
    config?.timeoutAdAnimation ??
    config?.sponsorAdAnimation ??
    DEFAULT_OVERLAY_CONFIG.timeoutAdAnimation;
  const transition =
    config?.timeoutAdTransition ??
    config?.sponsorAdTransition ??
    DEFAULT_OVERLAY_CONFIG.timeoutAdTransition;
  const transitionMs =
    config?.timeoutAdTransitionMs ??
    config?.sponsorAdTransitionMs ??
    DEFAULT_OVERLAY_CONFIG.timeoutAdTransitionMs;
  const adScale = config?.timeoutAdScale ?? DEFAULT_OVERLAY_CONFIG.timeoutAdScale;

  useEffect(() => {
    setLogoFailed(false);
  }, [spLogoUrl]);

  useEffect(() => {
    setAutoHidden(false);
    if (!visible || !durationSeconds || durationSeconds <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setAutoHidden(true);
    }, durationSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [
    visible,
    durationSeconds,
    spName,
    config?.timeoutAdSponsorId,
    config?.timeoutAdLayout,
    config?.timeoutAdPosition,
  ]);

  if (!visible || autoHidden) return null;

  const isCanvas = variant === 'canvas';
  const broadcast = normalizeBroadcast(stream, score);
  const transitionAnim = getSponsorTransitionAnimation(transition, 'visible', transitionMs);
  const loopAnim = getSponsorLoopAnimation(animation);
  const countdownText = formatCountdown(timeoutInfo.remainingSec);
  const initials = (spName || 'SP').slice(0, 2).toUpperCase();
  const alignClass = resolveFlexAlignment(position);
  const scaleStyle: CSSProperties | undefined =
    adScale !== 1 ? { transform: `scale(${adScale})` } : undefined;

  if (layout === 'banner_strip') {
    const anchorTop = position.startsWith('top');
    return (
      <div
        data-timeout-fullscreen-ad="true"
        style={{
          zIndex,
          ...(transitionAnim ? { animation: transitionAnim } : {}),
        }}
        className={`absolute inset-x-0 ${
          anchorTop ? (isCanvas ? 'top-8' : 'top-3') : isCanvas ? 'bottom-8' : 'bottom-3'
        } px-4 sm:px-10 flex justify-center pointer-events-none select-none`}
      >
        <div
          style={{ ...loopAnimStyle(loopAnim), ...scaleStyle }}
          className={`pointer-events-auto relative overflow-hidden w-full rounded-2xl border border-amber-400/50 bg-slate-950/95 backdrop-blur-md shadow-[0_18px_50px_rgba(0,0,0,0.85)] ${
            isCanvas ? 'max-w-[1520px] px-8 py-5' : 'max-w-3xl px-3 py-2.5 sm:px-5 sm:py-3.5'
          }`}
        >
          {animation === 'shimmer' && (
            <div
              aria-hidden="true"
              style={{ animation: 'mlSponsorShimmerSweep 2.4s ease-in-out infinite' }}
              className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            />
          )}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-[#EA580C] to-pink-500"
          />
          <div className="flex items-center justify-between gap-3 sm:gap-6">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
              {spLogoUrl && !logoFailed ? (
                <div
                  className={`rounded-xl bg-white p-1.5 border border-amber-300/60 shrink-0 flex items-center justify-center overflow-hidden ${
                    isCanvas ? 'w-20 h-20' : 'w-10 h-10 sm:w-14 sm:h-14'
                  }`}
                >
                  <img
                    src={spLogoUrl}
                    alt={spName}
                    referrerPolicy="no-referrer"
                    onError={() => setLogoFailed(true)}
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div
                  className={`rounded-xl bg-gradient-to-br from-amber-400 to-[#EA580C] text-white font-display font-black shrink-0 flex items-center justify-center ${
                    isCanvas ? 'w-20 h-20 text-3xl' : 'w-10 h-10 sm:w-14 sm:h-14 text-sm sm:text-xl'
                  }`}
                >
                  {initials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded bg-amber-500 text-slate-950 font-display font-black uppercase tracking-wider ${
                      isCanvas ? 'px-3 py-0.5 text-sm' : 'px-1.5 py-0.5 text-[9px] sm:text-[11px]'
                    }`}
                  >
                    <Clock className={isCanvas ? 'w-4 h-4' : 'w-3 h-3'} />
                    <span>
                      {timeoutInfo.isTimeout ? timeoutInfo.label || 'TEAM TIMEOUT' : spBadgeText}
                    </span>
                  </span>
                  {countdownText && (
                    <span
                      className={`font-mono font-black tabular-nums rounded bg-red-600 text-white ${
                        isCanvas ? 'px-2.5 py-0.5 text-base' : 'px-1.5 py-0.5 text-[9px] sm:text-xs'
                      }`}
                    >
                      {countdownText}
                    </span>
                  )}
                  <span
                    className={`rounded bg-[#EA580C] text-white font-display font-bold uppercase tracking-wide ${
                      isCanvas ? 'px-2.5 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[8px] sm:text-[10px]'
                    }`}
                  >
                    {spCta}
                  </span>
                </div>
                <p
                  className={`font-display font-black text-white truncate mt-1 ${
                    isCanvas ? 'text-4xl' : 'text-sm sm:text-xl'
                  }`}
                >
                  {spName}
                </p>
                {spTagline && (
                  <p
                    className={`text-slate-300 truncate ${
                      isCanvas ? 'text-xl' : 'text-[10px] sm:text-xs'
                    }`}
                  >
                    {spTagline}
                  </p>
                )}
              </div>
            </div>

            {websiteUrl && (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-slate-950 hover:bg-amber-300 font-display text-xs font-extrabold uppercase tracking-wide shrink-0"
              >
                <span>Visit</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (layout === 'floating_showcase') {
    return (
      <div
        data-timeout-fullscreen-ad="true"
        style={{
          zIndex,
          ...(transitionAnim ? { animation: transitionAnim } : {}),
        }}
        className={`absolute inset-0 pointer-events-none select-none flex ${alignClass} ${
          isCanvas ? 'p-12' : 'p-3 sm:p-6'
        }`}
      >
        <div
          style={{ ...loopAnimStyle(loopAnim), ...scaleStyle }}
          className={`pointer-events-auto relative overflow-hidden rounded-2xl border border-amber-400/55 bg-slate-950/94 backdrop-blur-md shadow-[0_24px_70px_rgba(0,0,0,0.85)] text-white ${
            isCanvas
              ? isPortrait
                ? 'w-[760px] p-8'
                : 'w-[780px] p-8'
              : 'w-full max-w-md p-3.5 sm:p-5'
          }`}
        >
          {animation === 'shimmer' && (
            <div
              aria-hidden="true"
              style={{ animation: 'mlSponsorShimmerSweep 2.4s ease-in-out infinite' }}
              className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            />
          )}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-[#EA580C] to-pink-500"
          />

          <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-white/10">
            <span
              className={`inline-flex items-center gap-1.5 rounded bg-amber-500 text-slate-950 font-display font-black uppercase tracking-wider ${
                isCanvas ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[10px]'
              }`}
            >
              <Clock className={isCanvas ? 'w-4 h-4' : 'w-3 h-3'} />
              <span>{timeoutInfo.isTimeout ? timeoutInfo.label || 'TEAM TIMEOUT' : 'SPONSOR BREAK'}</span>
            </span>
            {countdownText && (
              <span
                className={`font-mono font-black tabular-nums rounded bg-red-600 text-white ${
                  isCanvas ? 'px-3 py-1 text-base' : 'px-2 py-0.5 text-[10px]'
                }`}
              >
                {countdownText}
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {spLogoUrl && !logoFailed ? (
              <div
                className={`rounded-xl bg-white p-2 border border-amber-300/60 shrink-0 flex items-center justify-center overflow-hidden ${
                  isCanvas ? 'w-36 h-36' : 'w-16 h-16 sm:w-20 sm:h-20'
                }`}
              >
                <img
                  src={spLogoUrl}
                  alt={spName}
                  referrerPolicy="no-referrer"
                  onError={() => setLogoFailed(true)}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div
                className={`rounded-xl bg-gradient-to-br from-amber-400 via-[#EA580C] to-rose-600 text-white font-display font-black shrink-0 flex items-center justify-center ${
                  isCanvas ? 'w-36 h-36 text-5xl' : 'w-16 h-16 sm:w-20 sm:h-20 text-xl'
                }`}
              >
                {initials}
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 font-mono font-bold uppercase ${
                    isCanvas ? 'px-2.5 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[9px]'
                  }`}
                >
                  {spBadgeText}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded bg-[#EA580C] text-white font-display font-bold uppercase ${
                    isCanvas ? 'px-2.5 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[9px]'
                  }`}
                >
                  {spCta}
                </span>
              </div>
              <h3
                className={`font-display font-black text-white leading-tight truncate ${
                  isCanvas ? 'text-4xl' : 'text-lg sm:text-xl'
                }`}
              >
                {spName}
              </h3>
              {spTagline && (
                <p
                  className={`text-slate-300 line-clamp-2 ${
                    isCanvas ? 'text-lg' : 'text-[11px] sm:text-xs'
                  }`}
                >
                  {spTagline}
                </p>
              )}
              {websiteUrl && (
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 hover:underline pt-0.5"
                >
                  <span>Visit Sponsor</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default: fullscreen_card
  return (
    <div
      data-timeout-fullscreen-ad="true"
      style={{
        zIndex,
        ...(transitionAnim ? { animation: transitionAnim } : {}),
      }}
      className={`absolute inset-0 overflow-hidden select-none flex flex-col justify-between bg-[#050814]/96 text-white ${
        isCanvas ? 'pointer-events-none' : 'pointer-events-auto'
      }`}
    >
      {/* Ambient Radial Spotlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 48%, rgba(245, 158, 11, 0.20) 0%, rgba(234, 88, 12, 0.12) 32%, rgba(9, 13, 28, 0.96) 72%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-[#EA580C] to-pink-500"
      />

      {/* Top Broadcast Timeout & Live Score Bar */}
      <div
        className={`relative z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-slate-950/75 backdrop-blur-md ${
          isCanvas ? 'px-10 py-5' : 'px-3 py-2 sm:px-5 sm:py-3'
        }`}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md bg-amber-500 text-slate-950 font-display font-black uppercase tracking-wider shrink-0 shadow-lg ${
              isCanvas ? 'px-4 py-1.5 text-lg' : 'px-2 py-0.5 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs'
            }`}
          >
            <Clock className={isCanvas ? 'w-5 h-5' : 'w-3 h-3 sm:w-3.5 sm:h-3.5'} />
            <span>{timeoutInfo.isTimeout ? timeoutInfo.label || 'TEAM TIMEOUT' : 'SPONSOR BREAK'}</span>
          </span>
          {countdownText && (
            <span
              className={`font-mono font-black tabular-nums rounded-md bg-red-600/90 text-white border border-red-400/50 shrink-0 ${
                isCanvas ? 'px-3.5 py-1 text-xl' : 'px-2 py-0.5 text-[11px] sm:text-xs'
              }`}
            >
              {countdownText}
            </span>
          )}
          <span
            className={`truncate font-semibold text-slate-200 hidden sm:inline ${
              isCanvas ? 'text-xl' : 'text-xs sm:text-sm'
            }`}
          >
            {broadcast.tournamentName || broadcast.title}
          </span>
        </div>

        <div
          className={`flex items-center gap-2 font-mono font-extrabold tabular-nums shrink-0 rounded-lg bg-white/5 border border-white/10 ${
            isCanvas ? 'px-5 py-2 text-2xl' : 'px-2.5 py-1 text-[11px] sm:text-sm'
          }`}
        >
          <span className="text-orange-300 truncate max-w-[110px] sm:max-w-[180px]">
            {broadcast.teamA.shortName} {broadcast.teamA.primaryText}
          </span>
          <span className="text-slate-500">-</span>
          <span className="text-sky-300 truncate max-w-[110px] sm:max-w-[180px]">
            {broadcast.teamB.primaryText} {broadcast.teamB.shortName}
          </span>
        </div>
      </div>

      {/* Positioned Sponsor Showcase Card */}
      <div
        className={`relative z-10 flex-1 min-h-0 flex ${alignClass} ${
          isCanvas ? (isPortrait ? 'px-10 py-10' : 'px-16 py-8') : 'px-3 py-3 sm:px-8 sm:py-5'
        }`}
      >
        <div
          style={{ ...loopAnimStyle(loopAnim), ...scaleStyle }}
          className={`relative overflow-hidden w-full rounded-3xl border border-amber-400/45 bg-gradient-to-br from-slate-900/95 via-[#0B1228]/95 to-slate-950/95 shadow-[0_30px_90px_rgba(0,0,0,0.85),0_0_60px_rgba(245,158,11,0.18)] ${
            isCanvas
              ? isPortrait
                ? 'max-w-[920px] p-12'
                : position === 'center'
                  ? 'max-w-[1440px] p-12'
                  : 'max-w-[1100px] p-10'
              : 'max-w-2xl p-4 sm:p-8'
          }`}
        >
          {animation === 'shimmer' && (
            <div
              aria-hidden="true"
              style={{ animation: 'mlSponsorShimmerSweep 2.4s ease-in-out infinite' }}
              className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            />
          )}

          <div
            className={`flex ${
              isCanvas && !isPortrait
                ? 'flex-row items-center gap-12 text-left'
                : isCanvas && isPortrait
                  ? 'flex-col items-center gap-8 text-center'
                  : 'flex-col sm:flex-row items-center gap-4 sm:gap-7 text-center sm:text-left'
            }`}
          >
            {spLogoUrl && !logoFailed ? (
              <div
                className={`rounded-2xl bg-white p-3 sm:p-5 border-2 border-amber-300/60 shadow-2xl shrink-0 flex items-center justify-center overflow-hidden ${
                  isCanvas
                    ? isPortrait
                      ? 'w-72 h-72'
                      : 'w-80 h-80'
                    : 'w-20 h-20 sm:w-36 sm:h-36'
                }`}
              >
                <img
                  src={spLogoUrl}
                  alt={spName}
                  referrerPolicy="no-referrer"
                  onError={() => setLogoFailed(true)}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div
                className={`rounded-2xl bg-gradient-to-br from-amber-400 via-[#EA580C] to-rose-600 text-white font-display font-black shrink-0 flex items-center justify-center shadow-2xl border border-white/25 ${
                  isCanvas
                    ? isPortrait
                      ? 'w-64 h-64 text-8xl'
                      : 'w-72 h-72 text-9xl'
                    : 'w-20 h-20 sm:w-36 sm:h-36 text-2xl sm:text-5xl'
                }`}
              >
                {initials}
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-2 sm:space-y-4">
              <div
                className={`flex flex-wrap items-center gap-2 ${
                  isCanvas && !isPortrait ? 'justify-start' : 'justify-center sm:justify-start'
                }`}
              >
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-300 font-mono font-extrabold uppercase tracking-widest ${
                    isCanvas ? 'px-4 py-1.5 text-base' : 'px-2.5 py-0.5 text-[9px] sm:text-xs'
                  }`}
                >
                  <Megaphone className={isCanvas ? 'w-4 h-4' : 'w-3 h-3'} />
                  <span>{spBadgeText}</span>
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full bg-[#EA580C] text-white font-display font-extrabold uppercase tracking-wide ${
                    isCanvas ? 'px-4 py-1.5 text-base' : 'px-2.5 py-0.5 text-[9px] sm:text-xs'
                  }`}
                >
                  <Sparkles className={isCanvas ? 'w-4 h-4' : 'w-3 h-3'} />
                  <span>{spCta}</span>
                </span>
              </div>

              <h2
                className={`font-display font-black tracking-tight text-white leading-none ${
                  isCanvas
                    ? isPortrait
                      ? 'text-6xl'
                      : 'text-7xl'
                    : 'text-xl sm:text-4xl'
                }`}
              >
                {spName}
              </h2>

              {spTagline && (
                <p
                  className={`text-slate-200 font-medium leading-snug ${
                    isCanvas ? 'text-3xl max-w-4xl' : 'text-xs sm:text-base line-clamp-2'
                  }`}
                >
                  {spTagline}
                </p>
              )}

              {websiteUrl && (
                <div className="pt-1">
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white text-slate-950 hover:bg-amber-300 font-display text-xs font-extrabold uppercase tracking-wide shadow transition-colors"
                  >
                    <span>Visit Sponsor</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Match Resume Strip */}
      <div
        className={`relative z-10 border-t border-white/10 bg-slate-950/80 flex items-center justify-between gap-3 text-slate-300 ${
          isCanvas ? 'px-10 py-4 text-lg' : 'px-3 py-1.5 sm:px-5 sm:py-2 text-[10px] sm:text-xs'
        }`}
      >
        <span className="font-mono uppercase tracking-wider truncate">
          {broadcast.sport} · {broadcast.title}
        </span>
        <span className="font-semibold text-amber-300 shrink-0">
          Live Play Resumes Shortly
        </span>
      </div>
    </div>
  );
}

function loopAnimStyle(loopAnim: string | undefined): CSSProperties {
  return loopAnim ? { animation: loopAnim } : {};
}
