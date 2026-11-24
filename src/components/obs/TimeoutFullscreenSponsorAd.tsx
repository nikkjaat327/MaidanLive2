import { useEffect, useState } from 'react';
import { Clock, ExternalLink, Megaphone, Sparkles } from 'lucide-react';
import type {
  BroadcastOverlayConfig,
  LiveScoreData,
  LiveStreamData,
  SponsorOverlayData,
} from '../../types/index.ts';
import type { MatchTimeoutInfo } from '../../utils/matchTimeout.ts';
import { DEFAULT_OVERLAY_CONFIG } from '../../utils/overlayConfig.ts';
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

  const timeoutOverlay =
    fallbackSponsorOverlays.find((o) => o?.isVisible !== false && o.showOnTimeoutFullscreen && o.sponsor) ||
    fallbackSponsorOverlays.find((o) => o?.isVisible !== false && o.sponsor) ||
    null;

  const spName =
    (config?.sponsorAdName || '').trim() ||
    timeoutOverlay?.sponsor?.name ||
    'Official Broadcast Partner';
  const spTagline =
    (config?.sponsorAdTagline || '').trim() ||
    timeoutOverlay?.announcementText ||
    timeoutOverlay?.sponsor?.tagline ||
    timeoutOverlay?.sponsor?.sponsorshipType ||
    'Proudly Supporting Live Grassroots & Arena Sports';
  const spLogoUrl =
    (config?.sponsorAdLogoUrl || '').trim() || timeoutOverlay?.sponsor?.logoUrl || '';
  const spCta =
    (config?.sponsorAdCta || '').trim() ||
    timeoutOverlay?.sponsor?.ctaText ||
    timeoutOverlay?.sponsor?.sponsorshipType ||
    'OFFICIAL PARTNER';
  const websiteUrl =
    variant === 'responsive' ? (timeoutOverlay?.sponsor?.websiteUrl || '').trim() : '';

  useEffect(() => {
    setLogoFailed(false);
  }, [spLogoUrl]);

  if (!visible) return null;

  const isCanvas = variant === 'canvas';
  const broadcast = normalizeBroadcast(stream, score);
  const animation = config?.sponsorAdAnimation ?? DEFAULT_OVERLAY_CONFIG.sponsorAdAnimation;
  const transition = config?.sponsorAdTransition ?? DEFAULT_OVERLAY_CONFIG.sponsorAdTransition;
  const transitionMs =
    config?.sponsorAdTransitionMs ?? DEFAULT_OVERLAY_CONFIG.sponsorAdTransitionMs;
  const transitionAnim = getSponsorTransitionAnimation(transition, 'visible', transitionMs);
  const loopAnim = getSponsorLoopAnimation(animation);
  const countdownText = formatCountdown(timeoutInfo.remainingSec);
  const initials = (spName || 'SP').slice(0, 2).toUpperCase();

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
      {/* Ambient Radial Spotlight & Team Edge Gradients */}
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

      {/* Center Giant Sponsor Showcase Card */}
      <div
        className={`relative z-10 flex-1 min-h-0 flex items-center justify-center ${
          isCanvas ? (isPortrait ? 'px-10 py-10' : 'px-16 py-8') : 'px-3 py-3 sm:px-8 sm:py-5'
        }`}
      >
        <div
          style={loopAnim ? { animation: loopAnim } : undefined}
          className={`relative overflow-hidden w-full rounded-3xl border border-amber-400/45 bg-gradient-to-br from-slate-900/95 via-[#0B1228]/95 to-slate-950/95 shadow-[0_30px_90px_rgba(0,0,0,0.85),0_0_60px_rgba(245,158,11,0.18)] ${
            isCanvas
              ? isPortrait
                ? 'max-w-[920px] p-12'
                : 'max-w-[1440px] p-12'
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
            {/* Big Brand Visual */}
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

            {/* Sponsor Headline Copy & CTA */}
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
                  <span>TIMEOUT PARTNER SPOTLIGHT</span>
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
