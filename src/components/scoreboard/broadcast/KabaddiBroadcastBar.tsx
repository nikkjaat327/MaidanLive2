import { LiveScoreData, LiveStreamData } from '../../../types/index.ts';
import { KabaddiDetails, createInitialKabaddiDetails } from '../../../utils/kabaddiScoring.ts';
import { deriveShortTeamName } from '../../../utils/matchResultValidation.ts';
import { BroadcastLogo } from './BroadcastLogo.tsx';

interface KabaddiBroadcastBarProps {
  stream: LiveStreamData;
  score: LiveScoreData;
  compact?: boolean;
}

export function KabaddiBroadcastBar({ stream, score, compact = false }: KabaddiBroadcastBarProps) {
  const d: KabaddiDetails = {
    ...createInitialKabaddiDetails(),
    ...(score.sportSpecificDetails || {}),
  };

  const nameA = stream.teamAName || 'Team A';
  const nameB = stream.teamBName || 'Team B';
  const shortA = deriveShortTeamName(nameA, 'TMA');
  const shortB = deriveShortTeamName(nameB, 'TMB');

  const clock = `${String(d.timerMinutes ?? 0).padStart(2, '0')}:${String(d.timerSeconds ?? 0).padStart(2, '0')}`;

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
          </div>
          <span className="font-mono tabular-nums font-bold text-lg sm:text-xl text-emerald-300 leading-none">
            {score.teamAScore}
          </span>
        </div>

        {/* Center Clock & Half */}
        <div className="flex flex-col items-center justify-center px-2.5 py-0.5 rounded bg-white/10 text-center shrink-0">
          <span className="font-mono tabular-nums text-xs sm:text-sm font-bold leading-tight text-white">
            {clock}
          </span>
          <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-amber-300 leading-tight">
            {d.half}
          </span>
        </div>

        {/* Team B */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="font-mono tabular-nums font-bold text-lg sm:text-xl text-sky-300 leading-none">
            {score.teamBScore}
          </span>
          <div className="flex items-center gap-1.5 min-w-0 justify-end">
            <span className="font-display font-bold text-xs sm:text-sm uppercase truncate text-right">
              <span className="sm:hidden">{shortB}</span>
              <span className="hidden sm:inline">{nameB}</span>
            </span>
            <BroadcastLogo logoUrl={stream.teamBLogo} alt={shortB} />
          </div>
        </div>
      </div>

      {/* Compact Breakdown Strip: Raid / Tackle / Bonus / All-Out / Super Tackle / Super Raid */}
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-2.5 sm:px-3.5 py-1 bg-white/[0.06] border-t border-white/10 text-[10px] font-mono tabular-nums text-slate-200">
          <span className="truncate">
            {shortA}: R {d.teamA.raidPoints} · T {d.teamA.tacklePoints} · B {d.teamA.bonusPoints} · AO {d.teamA.allOutPoints} · ST {d.teamA.superTackles}
          </span>
          {(d.superRaidNote || d.isTieBreaker) && (
            <span className="font-sans font-semibold text-amber-300 truncate">
              {d.isTieBreaker
                ? `Tie-Breaker ${d.tieBreakerScoreA}-${d.tieBreakerScoreB}`
                : d.superRaidNote}
            </span>
          )}
          <span className="truncate ml-auto">
            {shortB}: R {d.teamB.raidPoints} · T {d.teamB.tacklePoints} · B {d.teamB.bonusPoints} · AO {d.teamB.allOutPoints} · ST {d.teamB.superTackles}
          </span>
        </div>
      )}
    </div>
  );
}
