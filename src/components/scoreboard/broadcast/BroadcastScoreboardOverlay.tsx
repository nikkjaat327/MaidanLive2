import { Trophy } from 'lucide-react';
import { LiveScoreData, LiveStreamData } from '../../../types/index.ts';
import { CricketBroadcastBar } from './CricketBroadcastBar.tsx';
import { KabaddiBroadcastBar } from './KabaddiBroadcastBar.tsx';
import { VolleyballBroadcastBar } from './VolleyballBroadcastBar.tsx';
import { FootballBroadcastBar } from './FootballBroadcastBar.tsx';
import { GenericBroadcastBar } from './GenericBroadcastBar.tsx';

interface BroadcastScoreboardOverlayProps {
  stream: LiveStreamData;
  score: LiveScoreData;
  compact?: boolean;
}

export function BroadcastScoreboardOverlay({
  stream,
  score,
  compact = false,
}: BroadcastScoreboardOverlayProps) {
  const resultDeclared = Boolean(score.resultStatus && score.resultStatus !== 'NOT_DECLARED');

  const renderSportBar = () => {
    switch (score.sportType) {
      case 'Cricket':
        return <CricketBroadcastBar stream={stream} score={score} compact={compact} />;
      case 'Kabaddi':
        return <KabaddiBroadcastBar stream={stream} score={score} compact={compact} />;
      case 'Volleyball':
        return <VolleyballBroadcastBar stream={stream} score={score} compact={compact} />;
      case 'Football':
        return <FootballBroadcastBar stream={stream} score={score} />;
      default:
        return <GenericBroadcastBar stream={stream} score={score} />;
    }
  };

  return (
    <div className="flex flex-col items-start gap-1 max-w-full">
      {renderSportBar()}
      {resultDeclared && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] sm:text-[11px] font-bold tracking-wide shadow-md max-w-full">
          <Trophy className="w-3 h-3 shrink-0" />
          <span className="uppercase shrink-0">
            {score.resultStatus === 'DECLARED'
              ? 'WINNER'
              : score.resultStatus === 'DRAW'
                ? 'DRAW'
                : score.resultStatus === 'TIE'
                  ? 'TIE'
                  : 'NO RESULT'}
          </span>
          <span className="truncate font-semibold">
            {score.resultDescription || score.winnerTeamName}
          </span>
        </div>
      )}
    </div>
  );
}
