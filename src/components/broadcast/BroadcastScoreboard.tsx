import React, { useEffect, useRef, useState } from 'react';
import { NormalizedBroadcast } from '../../types/index.ts';
import { BroadcastTeamWing } from './BroadcastTeamWing.tsx';
import { BroadcastCenterShield } from './BroadcastCenterShield.tsx';
import { TeamAvatar } from '../common/TeamAvatar.tsx';
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
        className={`bg-[#0A1120] border border-slate-700/85 rounded-xl overflow-hidden shadow-2xl text-white ${className}`}
      >
        {/* Portrait Header: Brand / Sport Status + Clock / Period */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-950/95 border-b border-slate-800/90">
          <div className="flex items-center gap-2 min-w-0">
            {cfg.showBrandLogo && logoUrl && !logoFailed && (
              <img
                src={logoUrl}
                alt="Broadcast Logo"
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                style={{
                  height: `${Math.max(18, Math.min(28, Math.round(cfg.brandLogoSize * 0.3)))}px`,
                  opacity: cfg.brandLogoOpacity,
                }}
                className="w-auto object-contain shrink-0"
              />
            )}
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#EA580C]/20 border border-[#EA580C]/40 shrink-0">
              {broadcast.centerMeta.isLive && (
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              )}
              <span className="font-display text-[10px] font-extrabold uppercase tracking-wider text-orange-300">
                {broadcast.centerMeta.statusLabel}
              </span>
            </span>
            <span className="text-[11px] font-semibold text-slate-300 truncate">
              {broadcast.centerMeta.periodLabel || broadcast.sport}
            </span>
          </div>

          {broadcast.centerMeta.timerOrClock && (
            <span className="font-mono text-xs font-bold tabular-nums text-emerald-300 bg-white/10 px-2 py-0.5 rounded shrink-0">
              {broadcast.centerMeta.timerOrClock}
            </span>
          )}
        </div>

        {/* Stacked High-Contrast Team Rows for Easy Portrait Reading */}
        <div className="divide-y divide-slate-800/80">
          {/* Team A Row */}
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-gradient-to-r from-[#0B3B8C]/65 via-[#102E6B]/45 to-transparent">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <TeamAvatar
                name={broadcast.teamA.name}
                logoUrl={broadcast.teamA.logoUrl}
                size={compact ? 'sm' : 'md'}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`font-display font-bold text-white truncate ${
                      compact ? 'text-sm' : 'text-base'
                    }`}
                  >
                    {broadcast.teamA.name}
                  </span>
                  {broadcast.teamA.badgeText && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-400/20 border border-amber-400/35 text-[9px] font-bold uppercase tracking-wider text-amber-300 shrink-0">
                      {broadcast.teamA.badgeText}
                    </span>
                  )}
                </div>
                {broadcast.teamA.secondaryText && (
                  <p className="font-mono text-[11px] text-blue-200/90 tabular-nums truncate mt-0.5">
                    {broadcast.teamA.secondaryText}
                  </p>
                )}
              </div>
            </div>

            <div className="text-right shrink-0">
              <span
                className={`inline-block font-display font-extrabold text-white tabular-nums leading-none ${
                  compact ? 'text-2xl' : 'text-[28px]'
                } ${pulseA ? 'ml-score-pulse' : ''}`}
              >
                {broadcast.teamA.primaryText}
              </span>
            </div>
          </div>

          {/* Team B Row */}
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-gradient-to-r from-[#991B1B]/60 via-[#7A1822]/40 to-transparent">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <TeamAvatar
                name={broadcast.teamB.name}
                logoUrl={broadcast.teamB.logoUrl}
                size={compact ? 'sm' : 'md'}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`font-display font-bold text-white truncate ${
                      compact ? 'text-sm' : 'text-base'
                    }`}
                  >
                    {broadcast.teamB.name}
                  </span>
                  {broadcast.teamB.badgeText && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-400/20 border border-amber-400/35 text-[9px] font-bold uppercase tracking-wider text-amber-300 shrink-0">
                      {broadcast.teamB.badgeText}
                    </span>
                  )}
                </div>
                {broadcast.teamB.secondaryText && (
                  <p className="font-mono text-[11px] text-red-100/90 tabular-nums truncate mt-0.5">
                    {broadcast.teamB.secondaryText}
                  </p>
                )}
              </div>
            </div>

            <div className="text-right shrink-0">
              <span
                className={`inline-block font-display font-extrabold text-white tabular-nums leading-none ${
                  compact ? 'text-2xl' : 'text-[28px]'
                } ${pulseB ? 'ml-score-pulse' : ''}`}
              >
                {broadcast.teamB.primaryText}
              </span>
            </div>
          </div>
        </div>

        {/* Portrait Sub-Info Strip (Equation / CRR / Raid Clock / Set Scores) */}
        {!hideSubStrip && broadcast.subStripItems.length > 0 && !compact && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2 bg-slate-950/90 border-t border-slate-800/90 text-[11px]">
            {broadcast.subStripItems.slice(0, 4).map((item, idx) => (
              <span key={`${item.label}-${idx}`} className="inline-flex items-center gap-1">
                <span className="text-slate-400 font-semibold uppercase text-[10px]">
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
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch">
        <BroadcastTeamWing
          side="left"
          name={broadcast.teamA.name}
          shortName={broadcast.teamA.shortName}
          logoUrl={broadcast.teamA.logoUrl}
          primaryText={broadcast.teamA.primaryText}
          secondaryText={broadcast.teamA.secondaryText}
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
          badgeText={broadcast.teamB.badgeText}
          compact={compact}
          isPortrait={false}
          pulseScore={pulseB}
        />
      </div>
    </div>
  );
}
