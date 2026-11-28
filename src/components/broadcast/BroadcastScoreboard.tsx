import React, { useEffect, useRef, useState } from 'react';
import { NormalizedBroadcast } from '../../types/index.ts';
import { BroadcastTeamWing } from './BroadcastTeamWing.tsx';
import { BroadcastCenterShield } from './BroadcastCenterShield.tsx';
import { normalizeOverlayConfig, resolveBrandLogoUrl } from '../../utils/overlayConfig.ts';
import { useEnvBrandLogo } from '../../hooks/useEnvBrandLogo.ts';

interface BroadcastScoreboardProps {
  broadcast: NormalizedBroadcast;
  compact?: boolean;
  layoutMode?: 'auto' | 'portrait' | 'landscape';
  hideSubStrip?: boolean;
  className?: string;
}

function useScoreChangePulse(primaryA: string, primaryB: string) {
  const prevRef = useRef<{ a: string; b: string }>({ a: primaryA, b: primaryB });
  const [pulseA, setPulseA] = useState(false);
  const [pulseB, setPulseB] = useState(false);

  useEffect(() => {
    let tA: number | undefined;
    let tB: number | undefined;
    if (prevRef.current.a !== primaryA) {
      prevRef.current.a = primaryA;
      setPulseA(true);
      tA = window.setTimeout(() => setPulseA(false), 480);
    }
    if (prevRef.current.b !== primaryB) {
      prevRef.current.b = primaryB;
      setPulseB(true);
      tB = window.setTimeout(() => setPulseB(false), 480);
    }
    return () => {
      if (tA) window.clearTimeout(tA);
      if (tB) window.clearTimeout(tB);
    };
  }, [primaryA, primaryB]);

  return { pulseA, pulseB };
}

function useAutoPortraitDetect(explicitMode: 'auto' | 'portrait' | 'landscape') {
  const [autoPortrait, setAutoPortrait] = useState(() =>
    typeof window !== 'undefined'
      ? window.innerWidth < 768 && window.innerHeight > window.innerWidth
      : false
  );

  useEffect(() => {
    if (explicitMode !== 'auto' || typeof window === 'undefined') return;
    const sync = () => {
      setAutoPortrait(window.innerWidth < 768 && window.innerHeight > window.innerWidth);
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, [explicitMode]);

  if (explicitMode === 'portrait') return true;
  if (explicitMode === 'landscape') return false;
  return autoPortrait;
}

export function BroadcastScoreboard({
  broadcast,
  compact = false,
  layoutMode = 'auto',
  hideSubStrip = false,
  className = '',
}: BroadcastScoreboardProps) {
  const cfg = normalizeOverlayConfig(broadcast.raw?.overlayConfig);
  const envLogo = useEnvBrandLogo();
  const logoUrl = resolveBrandLogoUrl(cfg, envLogo);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);

  const isPortrait = useAutoPortraitDetect(layoutMode);
  const { pulseA, pulseB } = useScoreChangePulse(
    broadcast.teamA.primaryText,
    broadcast.teamB.primaryText
  );

  if (isPortrait) {
    return (
      <section
        aria-label={`${broadcast.sport} Portrait Live Scoreboard`}
        data-scoreboard-layout="portrait"
        className={`bg-[#0A1120] border border-slate-700/85 rounded-t-xl sm:rounded-xl overflow-hidden shadow-2xl text-white ${className}`}
      >
        {/* Symmetrical Equal-Width Portrait Score Strip */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch">
          <BroadcastTeamWing
            side="left"
            name={broadcast.teamA.name}
            shortName={broadcast.teamA.shortName}
            logoUrl={broadcast.teamA.logoUrl}
            primaryText={broadcast.teamA.primaryText}
            secondaryText={broadcast.teamA.secondaryText}
            playerLine={broadcast.teamA.playerLine}
            badgeText={broadcast.teamA.badgeText}
            compact
            isPortrait
            pulseScore={pulseA}
          />

          <BroadcastCenterShield
            sport={broadcast.sport}
            statusLabel={broadcast.centerMeta.statusLabel}
            timerOrClock={broadcast.centerMeta.timerOrClock}
            periodLabel={broadcast.centerMeta.periodLabel}
            isLive={broadcast.centerMeta.isLive}
            compact
          />

          <BroadcastTeamWing
            side="right"
            name={broadcast.teamB.name}
            shortName={broadcast.teamB.shortName}
            logoUrl={broadcast.teamB.logoUrl}
            primaryText={broadcast.teamB.primaryText}
            secondaryText={broadcast.teamB.secondaryText}
            playerLine={broadcast.teamB.playerLine}
            badgeText={broadcast.teamB.badgeText}
            compact
            isPortrait
            pulseScore={pulseB}
          />
        </div>

        {/* Portrait Sub-Info Strip (Equation / CRR / Raid Clock / Set Scores) */}
        {!hideSubStrip && broadcast.subStripItems.length > 0 && !compact && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 bg-slate-950/90 border-t border-slate-800/90 text-[10px]">
            {cfg.showBrandLogo && logoUrl && !logoFailed && (
              <img
                src={logoUrl}
                alt="Broadcast Logo"
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                style={{
                  height: `${Math.max(16, Math.min(24, Math.round(cfg.brandLogoSize * 0.28)))}px`,
                  opacity: cfg.brandLogoOpacity,
                }}
                className="w-auto object-contain shrink-0"
              />
            )}
            {broadcast.subStripItems.slice(0, 4).map((item, idx) => (
              <span key={`${item.label}-${idx}`} className="inline-flex items-center gap-1">
                <span className="text-slate-400 font-semibold uppercase text-[9px]">
                  {item.label}:
                </span>
                <span
                  className={`font-mono font-bold tabular-nums ${
                    item.accent === 'red'
                      ? 'text-red-300'
                      : item.accent === 'emerald'
                        ? 'text-emerald-300'
                        : item.accent === 'orange'
                          ? 'text-orange-300'
                          : item.accent === 'blue'
                            ? 'text-sky-300'
                            : 'text-white'
                  }`}
                >
                  {item.value}
                </span>
              </span>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <div
      data-scoreboard-layout="landscape"
      className={`bg-[#0A1120] border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl ${className}`}
    >
      {cfg.showBrandLogo && logoUrl && !logoFailed && (
        <div className="flex items-center justify-between px-3 py-1 bg-slate-950/90 border-b border-slate-800/80">
          <img
            src={logoUrl}
            alt="Broadcast Logo"
            referrerPolicy="no-referrer"
            onError={() => setLogoFailed(true)}
            style={{
              height: `${Math.max(18, Math.min(34, Math.round(cfg.brandLogoSize * 0.34)))}px`,
              opacity: cfg.brandLogoOpacity,
            }}
            className="w-auto object-contain"
          />
          {broadcast.tournamentName && (
            <span className="text-[10px] font-display font-bold uppercase tracking-wider text-slate-300 truncate max-w-[65%]">
              {broadcast.tournamentName}
            </span>
          )}
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch">
        <BroadcastTeamWing
          side="left"
          name={broadcast.teamA.name}
          shortName={broadcast.teamA.shortName}
          logoUrl={broadcast.teamA.logoUrl}
          primaryText={broadcast.teamA.primaryText}
          secondaryText={broadcast.teamA.secondaryText}
          playerLine={broadcast.teamA.playerLine}
          badgeText={broadcast.teamA.badgeText}
          compact={compact}
          isPortrait={false}
          pulseScore={pulseA}
        />

        <BroadcastCenterShield
          sport={broadcast.sport}
          statusLabel={broadcast.centerMeta.statusLabel}
          timerOrClock={broadcast.centerMeta.timerOrClock}
          periodLabel={broadcast.centerMeta.periodLabel}
          isLive={broadcast.centerMeta.isLive}
          compact={compact}
        />

        <BroadcastTeamWing
          side="right"
          name={broadcast.teamB.name}
          shortName={broadcast.teamB.shortName}
          logoUrl={broadcast.teamB.logoUrl}
          primaryText={broadcast.teamB.primaryText}
          secondaryText={broadcast.teamB.secondaryText}
          playerLine={broadcast.teamB.playerLine}
          badgeText={broadcast.teamB.badgeText}
          compact={compact}
          isPortrait={false}
          pulseScore={pulseB}
        />
      </div>
    </div>
  );
}
