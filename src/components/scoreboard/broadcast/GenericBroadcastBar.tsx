import { LiveScoreData, LiveStreamData } from '../../../types/index.ts';
import { deriveShortTeamName } from '../../../utils/matchResultValidation.ts';
import { BroadcastLogo } from './BroadcastLogo.tsx';

interface GenericBroadcastBarProps {
  stream: LiveStreamData;
  score: LiveScoreData;
}

export function GenericBroadcastBar({ stream, score }: GenericBroadcastBarProps) {
  const nameA = stream.teamAName || 'Team A';
  const nameB = stream.teamBName || 'Team B';
  const shortA = deriveShortTeamName(nameA, 'TMA');
  const shortB = deriveShortTeamName(nameB, 'TMB');

  return (
    <div className="w-full max-w-[660px] bg-slate-950/90 backdrop-blur-md text-white rounded-md shadow-xl overflow-hidden border border-white/10">
      <div className="flex items-center justify-between gap-3 px-3 py-1.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
          <span className="font-display font-bold text-xs sm:text-sm uppercase truncate text-right">
            <span className="hidden portrait:inline">{shortA}</span>
            <span className="portrait:hidden">{nameA}</span>
          </span>
          <BroadcastLogo logoUrl={stream.teamALogo} alt={shortA} />
        </div>

        <div className="flex items-center gap-2 px-2.5 py-0.5 rounded bg-white/10 font-mono tabular-nums font-bold text-base sm:text-lg leading-none shrink-0">
          <span className="text-emerald-300">{score.teamAScore}</span>
          <span className="text-slate-400 text-xs">-</span>
          <span className="text-sky-300">{score.teamBScore}</span>
        </div>

        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <BroadcastLogo logoUrl={stream.teamBLogo} alt={shortB} />
          <span className="font-display font-bold text-xs sm:text-sm uppercase truncate">
            <span className="hidden portrait:inline">{shortB}</span>
            <span className="portrait:hidden">{nameB}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
