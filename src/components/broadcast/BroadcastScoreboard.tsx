import React from 'react';
import { NormalizedBroadcast } from '../../types/index.ts';
import { BroadcastTeamWing } from './BroadcastTeamWing.tsx';
import { BroadcastCenterShield } from './BroadcastCenterShield.tsx';
import { normalizeOverlayConfig, resolveBrandLogoUrl } from '../../utils/overlayConfig.ts';

interface BroadcastScoreboardProps {
  broadcast: NormalizedBroadcast;
  compact?: boolean;
  className?: string;
}

export function BroadcastScoreboard({
  broadcast,
  compact = false,
  className = '',
}: BroadcastScoreboardProps) {
  const cfg = normalizeOverlayConfig(broadcast.raw?.overlayConfig);
  const logoUrl = resolveBrandLogoUrl(cfg);

  return (
    <div
      className={`bg-[#0A1120] border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl ${className}`}
    >
      {cfg.showBrandLogo && logoUrl && (
        <div className="flex items-center justify-between px-3 py-1 bg-slate-950/90 border-b border-slate-800/80">
          <img
            src={logoUrl}
            alt="MaidanLive"
            referrerPolicy="no-referrer"
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
        />
      </div>
    </div>
  );
}
