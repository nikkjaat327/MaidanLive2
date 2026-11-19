import React from 'react';

interface BroadcastCenterShieldProps {
  sport: string;
  statusLabel: string;
  timerOrClock?: string;
  periodLabel?: string;
  isLive?: boolean;
  compact?: boolean;
}

export function BroadcastCenterShield({
  sport,
  statusLabel,
  timerOrClock,
  periodLabel,
  isLive = false,
  compact = false,
}: BroadcastCenterShieldProps) {
  return (
    <div
      className={`bg-gradient-to-b from-[#1A243B] to-[#0A1120] border-x border-slate-700/70 flex flex-col items-center justify-center text-center shrink-0 ${
        compact ? 'px-2.5 py-1.5 min-w-[74px] sm:min-w-[96px]' : 'px-3 py-2 sm:px-5 min-w-[88px] sm:min-w-[126px]'
      }`}
    >
      <div className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-[#EA580C]/20 border border-[#EA580C]/40">
        {isLive && (
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
        )}
        <span className="font-display text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider text-orange-300">
          {statusLabel}
        </span>
      </div>

      {timerOrClock ? (
        <span
          className={`font-mono font-bold text-white tabular-nums leading-tight mt-0.5 ${
            compact ? 'text-[11px] sm:text-xs' : 'text-xs sm:text-sm'
          }`}
        >
          {timerOrClock}
        </span>
      ) : (
        <span className="font-display text-[10px] font-bold text-slate-300 mt-0.5">{sport}</span>
      )}

      {periodLabel && (
        <span className="text-[9px] sm:text-[10px] font-medium text-slate-400 truncate max-w-[110px]">
          {periodLabel}
        </span>
      )}
    </div>
  );
}
