import { LiveScoreData, LiveStreamData } from '../../../types/index.ts';
import {
  VolleyballDetails,
  createInitialVolleyballDetails,
} from '../../../utils/volleyballScoring.ts';
import { deriveShortTeamName } from '../../../utils/matchResultValidation.ts';
import { BroadcastLogo } from './BroadcastLogo.tsx';

interface VolleyballBroadcastBarProps {
  stream: LiveStreamData;
  score: LiveScoreData;
  compact?: boolean;
}

export function VolleyballBroadcastBar({
  stream,
  score,
  compact = false,
}: VolleyballBroadcastBarProps) {
  const d: VolleyballDetails = {
    ...createInitialVolleyballDetails(),
    ...(score.sportSpecificDetails || {}),
  };

  const nameA = stream.teamAName || 'Team A';
  const nameB = stream.teamBName || 'Team B';
  const shortA = deriveShortTeamName(nameA, 'TMA');
  const shortB = deriveShortTeamName(nameB, 'TMB');

  const isDecidingSet = d.currentSet === d.bestOfSets;
  const completedSets = (d.setScores || []).filter((s) => s.winner === 'A' || s.winner === 'B');

  return (
    <div className="w-full max-w-[740px] bg-slate-950/90 backdrop-blur-md text-white rounded-md shadow-xl overflow-hidden border border-white/10">
      {/* Main Broadcast Score Strip */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-2.5 sm:px-3.5 py-1.5">
        {/* Team A */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <BroadcastLogo logoUrl={stream.teamALogo} alt={shortA} />
            <span className="font-display font-bold text-xs sm:text-sm uppercase truncate">
              <span className="sm:hidden">{shortA}</span>
              <span className="hidden sm:inline">{nameA}</span>
            </span>
            {d.servingTeam === 'A' && (
              <span
                title="Serving"
                aria-label="Serving"
                className="w-2 h-2 rounded-full bg-amber-400 shrink-0"
              />
            )}
          </div>
          <div className="flex items-baseline gap-2 shrink-0 font-mono tabular-nums">
            <span className="text-[11px] font-semibold text-slate-300">
              S{d.teamASetsWon}
            </span>
            <span className="text-lg sm:text-xl font-bold text-emerald-300 leading-none">
              {score.teamAScore}
            </span>
          </div>
        </div>

        {/* Center Set Meta */}
        <div className="flex flex-col items-center justify-center px-2.5 py-0.5 rounded bg-white/10 text-center shrink-0">
          <span className="text-[11px] font-mono tabular-nums font-bold text-white leading-tight">
            SET {d.currentSet}/{d.bestOfSets}
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-300 leading-tight">
            {isDecidingSet ? 'DECIDER' : `BO${d.bestOfSets}`}
          </span>
        </div>

        {/* Team B */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-baseline gap-2 shrink-0 font-mono tabular-nums">
            <span className="text-lg sm:text-xl font-bold text-sky-300 leading-none">
              {score.teamBScore}
            </span>
            <span className="text-[11px] font-semibold text-slate-300">
              S{d.teamBSetsWon}
            </span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0 justify-end">
            {d.servingTeam === 'B' && (
              <span
                title="Serving"
                aria-label="Serving"
                className="w-2 h-2 rounded-full bg-amber-400 shrink-0"
              />
            )}
            <span className="font-display font-bold text-xs sm:text-sm uppercase truncate text-right">
              <span className="sm:hidden">{shortB}</span>
              <span className="hidden sm:inline">{nameB}</span>
            </span>
            <BroadcastLogo logoUrl={stream.teamBLogo} alt={shortB} />
          </div>
        </div>
      </div>

      {/* Previous Completed Sets Strip */}
      {completedSets.length > 0 && !compact && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2.5 sm:px-3.5 py-1 bg-white/[0.06] border-t border-white/10 text-[10px] font-mono tabular-nums text-slate-200">
          <span className="uppercase text-slate-400 font-sans font-semibold">Sets:</span>
          {completedSets.map((s) => (
            <span key={s.set} className="inline-flex items-center gap-1">
              <span className="text-slate-400">S{s.set}</span>
              <span className="font-semibold text-white">
                {s.teamA}-{s.teamB}
              </span>
              {s.winner && (
                <span className="text-emerald-300 font-sans font-semibold">
                  ({s.winner === 'A' ? shortA : shortB})
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
