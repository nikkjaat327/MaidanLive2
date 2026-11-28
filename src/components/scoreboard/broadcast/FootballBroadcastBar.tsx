import { LiveScoreData, LiveStreamData } from '../../../types/index.ts';
import { FootballDetails, createInitialFootballDetails } from '../../../utils/footballScoring.ts';
import { deriveShortTeamName } from '../../../utils/matchResultValidation.ts';
import { BroadcastLogo } from './BroadcastLogo.tsx';

interface FootballBroadcastBarProps {
  stream: LiveStreamData;
  score: LiveScoreData;
}

const HALF_ABBR: Record<FootballDetails['half'], string> = {
  '1st Half': '1H',
  'Half Time': 'HT',
  '2nd Half': '2H',
  'Extra Time': 'ET',
  Penalties: 'PEN',
  'Full Time': 'FT',
};

export function FootballBroadcastBar({ stream, score }: FootballBroadcastBarProps) {
  const d: FootballDetails = {
    ...createInitialFootballDetails(),
    ...(score.sportSpecificDetails || {}),
  };

  const nameA = stream.teamAName || 'Team A';
  const nameB = stream.teamBName || 'Team B';
  const shortA = deriveShortTeamName(nameA, 'TMA');
  const shortB = deriveShortTeamName(nameB, 'TMB');

  const clock = `${String(d.timerMinutes ?? 0).padStart(2, '0')}:${String(d.timerSeconds ?? 0).padStart(2, '0')}`;
  const showPenalties = d.half === 'Penalties' || d.teamAPenalties > 0 || d.teamBPenalties > 0;
  const hasCards =
    d.teamAYellowCards > 0 ||
    d.teamARedCards > 0 ||
    d.teamBYellowCards > 0 ||
    d.teamBRedCards > 0;

  return (
    <div className="w-full bg-slate-950/90 backdrop-blur-md text-white rounded-md shadow-xl overflow-hidden border border-white/10">
      {/* Main Broadcast Score Bug */}
      <div className="flex items-center justify-between gap-2 px-2.5 sm:px-3.5 py-1.5">
        {/* Left: Clock & Period */}
        <div className="flex items-center gap-1.5 bg-white/10 px-2 py-0.5 rounded shrink-0 font-mono tabular-nums">
          <span className="text-[10px] font-bold text-emerald-300 uppercase">
            {HALF_ABBR[d.half] || d.half}
          </span>
          <span className="text-xs sm:text-sm font-bold text-white">{clock}</span>
          {d.extraTimeMinutes > 0 && (
            <span className="text-[10px] font-bold text-amber-300">+{d.extraTimeMinutes}&apos;</span>
          )}
        </div>

        {/* Center: Team A Score - Team B Score (Equal Wings) */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0 justify-end">
            <span className="font-display font-bold text-xs sm:text-sm uppercase truncate text-right">
              <span className="hidden portrait:inline">{shortA}</span>
              <span className="portrait:hidden">{nameA}</span>
            </span>
            <BroadcastLogo logoUrl={stream.teamALogo} alt={shortA} />
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-600 text-white font-mono tabular-nums font-bold text-base sm:text-lg leading-none shrink-0">
            <span>{score.teamAScore}</span>
            <span className="text-emerald-200 text-xs">-</span>
            <span>{score.teamBScore}</span>
          </div>

          <div className="flex items-center gap-1.5 min-w-0">
            <BroadcastLogo logoUrl={stream.teamBLogo} alt={shortB} />
            <span className="font-display font-bold text-xs sm:text-sm uppercase truncate">
              <span className="hidden portrait:inline">{shortB}</span>
              <span className="portrait:hidden">{nameB}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Sub-strip: Penalties & Disciplinary Cards (shown only when present) */}
      {(showPenalties || hasCards) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 sm:px-3.5 py-1 bg-white/[0.06] border-t border-white/10 text-[10px] font-mono tabular-nums">
          <div className="flex items-center gap-2">
            {d.teamAYellowCards > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-200">
                <span className="w-2 h-2.5 rounded-[1px] bg-amber-400 inline-block" />
                {d.teamAYellowCards}
              </span>
            )}
            {d.teamARedCards > 0 && (
              <span className="inline-flex items-center gap-1 text-red-200">
                <span className="w-2 h-2.5 rounded-[1px] bg-red-500 inline-block" />
                {d.teamARedCards}
              </span>
            )}
          </div>

          {showPenalties && (
            <span className="font-bold text-amber-300 mx-auto">
              PENALTIES {shortA} {d.teamAPenalties} - {d.teamBPenalties} {shortB}
            </span>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {d.teamBYellowCards > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-200">
                <span className="w-2 h-2.5 rounded-[1px] bg-amber-400 inline-block" />
                {d.teamBYellowCards}
              </span>
            )}
            {d.teamBRedCards > 0 && (
              <span className="inline-flex items-center gap-1 text-red-200">
                <span className="w-2 h-2.5 rounded-[1px] bg-red-500 inline-block" />
                {d.teamBRedCards}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
