import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Megaphone } from 'lucide-react';
import { SponsorOverlayData } from '../../types/index.ts';
import {
  getSponsorLoopAnimation,
  getSponsorTransitionAnimation,
} from '../../utils/sponsorAnimation.ts';

interface SponsorOverlayBannerProps {
  overlays: SponsorOverlayData[];
  suppress?: boolean;
}

export function SponsorOverlayBanner({ overlays, suppress = false }: SponsorOverlayBannerProps) {
  const visibleOverlays = useMemo(
    () => overlays.filter((o) => o && o.isVisible !== false && o.sponsor),
    [overlays]
  );
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'visible' | 'exiting' | 'hidden'>('visible');
  const [cycle, setCycle] = useState(0);

  const active =
    visibleOverlays.length > 0 ? visibleOverlays[index % visibleOverlays.length] : null;

  const durationMs = Math.max(2, active?.durationSeconds || 12) * 1000;
  const transition = active?.transition || 'fade';
  const transitionMs =
    transition === 'none'
      ? 0
      : Math.max(100, Math.min(3000, active?.transitionDurationMs || 450));
  const repeatIntervalMs = Math.max(0, (active?.repeatIntervalSeconds ?? 0) * 1000);
  const repeatContinuously = active?.repeatContinuously !== false;

  useEffect(() => {
    setIndex(0);
    setPhase('visible');
    setCycle((c) => c + 1);
  }, [visibleOverlays.length]);

  useEffect(() => {
    if (suppress || !active) return;

    // Single overlay that repeats continuously with 0s pause stays visible cleanly
    if (
      visibleOverlays.length === 1 &&
      repeatContinuously &&
      repeatIntervalMs === 0 &&
      phase === 'visible'
    ) {
      return;
    }

    if (phase === 'visible') {
      const t = window.setTimeout(() => {
        if (transitionMs > 0) setPhase('exiting');
        else setPhase('hidden');
      }, durationMs);
      return () => window.clearTimeout(t);
    }

    if (phase === 'exiting') {
      const t = window.setTimeout(() => {
        setPhase('hidden');
      }, transitionMs);
      return () => window.clearTimeout(t);
    }

    if (phase === 'hidden') {
      if (!repeatContinuously && visibleOverlays.length === 1) {
        return;
      }
      const waitMs = visibleOverlays.length > 1 ? Math.max(150, repeatIntervalMs) : repeatIntervalMs;
      const t = window.setTimeout(() => {
        setIndex((prev) => (prev + 1) % visibleOverlays.length);
        setCycle((c) => c + 1);
        setPhase('visible');
      }, waitMs);
      return () => window.clearTimeout(t);
    }
  }, [
    suppress,
    active,
    phase,
    durationMs,
    transitionMs,
    repeatIntervalMs,
    repeatContinuously,
    visibleOverlays.length,
  ]);

  if (suppress || visibleOverlays.length === 0 || !active || !active.sponsor || phase === 'hidden') {
    return null;
  }

  const sponsor = active.sponsor;
  const transitionAnim = getSponsorTransitionAnimation(transition, phase, transitionMs);
  const loopAnim = getSponsorLoopAnimation(active.animation);

  const innerCard = (
    <div
      style={loopAnim ? { animation: loopAnim } : undefined}
      className="pointer-events-auto relative overflow-hidden inline-flex items-center gap-2.5 px-3 py-1.5 rounded bg-slate-950/88 border border-white/15 backdrop-blur-md text-white shadow-lg max-w-full"
    >
      {active.animation === 'shimmer' && (
        <div
          aria-hidden="true"
          style={{ animation: 'mlSponsorShimmerSweep 2.4s ease-in-out infinite' }}
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent"
        />
      )}
      {sponsor.logoUrl && (
        <img
          src={sponsor.logoUrl}
          alt={sponsor.name}
          className="w-6 h-6 rounded object-contain bg-white/95 p-0.5 shrink-0"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <div className="min-w-0 text-left">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-300 font-bold">
          {active.mode === 'ANNOUNCEMENT' && <Megaphone className="w-3 h-3 shrink-0" />}
          <span className="truncate">{sponsor.sponsorshipType || 'Official Sponsor'}</span>
        </div>
        <p className="text-xs font-semibold truncate">
          {active.mode === 'ANNOUNCEMENT' && active.announcementText
            ? `${sponsor.name}: ${active.announcementText}`
            : sponsor.name}
        </p>
      </div>
      {sponsor.websiteUrl && <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />}
    </div>
  );

  return (
    <div
      key={`ov-tr-${active.id}-${cycle}-${phase === 'exiting' ? 'out' : 'in'}`}
      style={transitionAnim ? { animation: transitionAnim } : undefined}
    >
      {sponsor.websiteUrl ? (
        <a
          href={sponsor.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block max-w-full"
        >
          {innerCard}
        </a>
      ) : (
        innerCard
      )}
    </div>
  );
}
