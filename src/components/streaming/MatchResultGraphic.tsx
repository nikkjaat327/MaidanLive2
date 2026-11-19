import { Award, Trophy } from 'lucide-react';
import { LiveScoreData, LiveStreamData } from '../../types/index.ts';

interface MatchResultGraphicProps {
  stream: LiveStreamData;
  score: LiveScoreData;
}

export function MatchResultGraphic({ stream, score }: MatchResultGraphicProps) {
  if (!score.resultStatus || score.resultStatus === 'NOT_DECLARED') return null;

  const badgeText =
    score.resultStatus === 'DECLARED'
      ? 'OFFICIAL WINNER'
      : score.resultStatus === 'DRAW'
        ? 'MATCH DRAWN'
        : score.resultStatus === 'TIE'
          ? 'MATCH TIED'
          : score.resultStatus === 'ABANDONED'
            ? 'MATCH ABANDONED'
            : 'NO RESULT';

  return (
    <div className="bg-slate-950 border border-amber-400/40 rounded-xl p-4 sm:p-5 text-white shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[11px] font-extrabold uppercase tracking-wider">
            <Trophy className="w-3.5 h-3.5" />
            <span>{badgeText}</span>
          </div>
          <h3 className="text-base sm:text-lg font-bold text-white break-words">
            {score.resultDescription || score.winnerTeamName || badgeText}
          </h3>
          {score.finalSummary && (
            <p className="text-xs text-slate-300 max-w-2xl">{score.finalSummary}</p>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-right shrink-0">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Final Score</p>
          <p className="font-mono tabular-nums text-base sm:text-lg font-bold text-emerald-400 mt-0.5">
            {stream.teamAName || 'Team A'} {score.teamAScore} – {score.teamBScore}{' '}
            {stream.teamBName || 'Team B'}
          </p>
        </div>
      </div>

      {score.mvpPlayerName && (
        <div className="mt-3 pt-3 border-t border-slate-800 flex items-center gap-2 text-xs text-amber-300">
          <Award className="w-4 h-4 shrink-0" />
          <span className="font-semibold">Player of the Match / MVP:</span>
          <span className="text-white font-bold">{score.mvpPlayerName}</span>
        </div>
      )}
    </div>
  );
}
