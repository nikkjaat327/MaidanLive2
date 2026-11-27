import React from 'react';
import { TeamAvatar } from '../common/TeamAvatar.tsx';

interface BroadcastTeamWingProps {
  side: 'left' | 'right';
  name: string;
  shortName: string;
  logoUrl?: string;
  primaryText: string;
  secondaryText?: string;
  badgeText?: string;
  compact?: boolean;
  isPortrait?: boolean;
  pulseScore?: boolean;
}

export function BroadcastTeamWing({
  side,
  name,
  shortName,
  logoUrl,
  primaryText,
  secondaryText,
  badgeText,
  compact = false,
  isPortrait,
  pulseScore = false,
}: BroadcastTeamWingProps) {
  const isLeft = side === 'left';
  const bgClass = isLeft
    ? 'bg-gradient-to-r from-[#0B3B8C] via-[#102E6B] to-[#0E1F47]'
    : 'bg-gradient-to-l from-[#991B1B] via-[#7A1822] to-[#3B1221]';

  const renderTeamTitle = () => {
    if (isPortrait === true) return shortName;
    if (isPortrait === false) return name;
    return (
      <>
        <span className="portrait:hidden">{name}</span>
        <span className="hidden portrait:inline">{shortName}</span>
      </>
    );
  };

  return (
    <div
      className={`${bgClass} ${
        compact ? 'px-2.5 py-1.5 sm:px-3 sm:py-2' : 'px-3 py-2.5 sm:px-4 sm:py-3'
      } flex items-center justify-between gap-2 sm:gap-3 min-w-0`}
    >
      {isLeft ? (
        <>
          <div className="flex items-center gap-2 min-w-0">
            <TeamAvatar
              name={name}
              logoUrl={logoUrl}
              size={compact ? 'sm' : 'md'}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={`font-display font-bold tracking-tight text-white truncate ${
                    compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'
                  }`}
                >
                  {renderTeamTitle()}
                </span>
                {badgeText && (
                  <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded bg-white/15 text-[9px] font-bold uppercase tracking-wider text-amber-300 shrink-0">
                    {badgeText}
                  </span>
                )}
              </div>
              {secondaryText && (
                <p className="font-mono text-[10px] sm:text-[11px] text-blue-200/90 tabular-nums truncate">
                  {secondaryText}
                </p>
              )}
            </div>
          </div>

          <div className="text-right shrink-0">
            <span
              className={`inline-block font-display font-extrabold text-white tabular-nums leading-none ${
                compact ? 'text-lg sm:text-2xl' : 'text-xl sm:text-3xl'
              } ${pulseScore ? 'ml-score-pulse' : ''}`}
            >
              {primaryText}
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="text-left shrink-0">
            <span
              className={`inline-block font-display font-extrabold text-white tabular-nums leading-none ${
                compact ? 'text-lg sm:text-2xl' : 'text-xl sm:text-3xl'
              } ${pulseScore ? 'ml-score-pulse' : ''}`}
            >
              {primaryText}
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 min-w-0">
            <div className="min-w-0 text-right">
              <div className="flex items-center justify-end gap-1.5">
                {badgeText && (
                  <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded bg-white/15 text-[9px] font-bold uppercase tracking-wider text-amber-300 shrink-0">
                    {badgeText}
                  </span>
                )}
                <span
                  className={`font-display font-bold tracking-tight text-white truncate ${
                    compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'
                  }`}
                >
                  {renderTeamTitle()}
                </span>
              </div>
              {secondaryText && (
                <p className="font-mono text-[10px] sm:text-[11px] text-red-100/90 tabular-nums truncate">
                  {secondaryText}
                </p>
              )}
            </div>
            <TeamAvatar
              name={name}
              logoUrl={logoUrl}
              size={compact ? 'sm' : 'md'}
            />
          </div>
        </>
      )}
    </div>
  );
}
