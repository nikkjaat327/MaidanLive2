import { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { LiveScoreData } from '../../types/index.ts';
import { computeLiveWinProbability } from '../../utils/winProbability.ts';

export interface WinProbabilityWidgetProps {
  sportType?: string;
  teamAName?: string;
  teamBName?: string;
  score?: LiveScoreData | null;
  className?: string;
}

export function WinProbabilityWidget({
  sportType,
  teamAName,
  teamBName,
  score,
  className = '',
}: WinProbabilityWidgetProps) {
  const prob = useMemo(
    () =>
      computeLiveWinProbability({
        sportType: score?.sportType || sportType,
        teamAName,
        teamBName,
        score,
      }),
    [sportType, teamAName, teamBName, score]
  );

  return (
    <div
      aria-label="Win Probability"
      className={`pt-3 border-t border-slate-800/80 space-y-2 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <TrendingUp className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-200">
            Win Probability
          </h3>
        </div>
        <span className="text-[11px] font-mono tabular-nums text-slate-400 truncate">
          {prob.favoredSide === 'EVEN'
            ? 'Match evenly poised'
            : `${prob.favoredTeamName} favored`}
        </span>
      </div>

      {/* Team Percentage Labels */}
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className={`font-semibold truncate ${
              prob.favoredSide === 'A' ? 'text-orange-300' : 'text-slate-300'
            }`}
          >
            {prob.teamAName}
          </span>
          <span className="font-mono tabular-nums text-sm font-extrabold text-orange-300 shrink-0">
            {prob.teamAPercent}%
          </span>
        </div>

        <div className="flex items-baseline gap-2 min-w-0 justify-end">
          <span className="font-mono tabular-nums text-sm font-extrabold text-sky-300 shrink-0">
            {prob.teamBPercent}%
          </span>
          <span
            className={`font-semibold truncate text-right ${
              prob.favoredSide === 'B' ? 'text-sky-300' : 'text-slate-300'
            }`}
          >
            {prob.teamBName}
          </span>
        </div>
      </div>

      {/* Dual-Team Split Meter */}
      <div
        role="img"
        aria-label={`Win probability: ${prob.teamAName} ${prob.teamAPercent}%, ${prob.teamBName} ${prob.teamBPercent}%`}
        className="h-2.5 w-full rounded-full overflow-hidden bg-slate-900 border border-slate-800 flex"
      >
        <div
          style={{ width: `${prob.teamAPercent}%` }}
          className="h-full bg-[#EA580C] transition-[width] duration-300 ease-out"
        />
        <div
          style={{ width: `${prob.teamBPercent}%` }}
          className="h-full bg-sky-500 transition-[width] duration-300 ease-out"
        />
      </div>

      <p className="text-[11px] font-mono tabular-nums text-slate-400 truncate">
        {prob.basisSummary}
      </p>
    </div>
  );
}
