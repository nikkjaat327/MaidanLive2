import { LiveScoreData, LiveStreamData } from '../../../types/index.ts';
import {
  CricketDetails,
  calculateCricketRunRate,
  calculateRequiredRunRate,
  createInitialCricketDetails,
  formatCricketOvers,
  getTotalExtras,
} from '../../../utils/cricketScoring.ts';
import { deriveShortTeamName } from '../../../utils/matchResultValidation.ts';
import { BroadcastLogo } from './BroadcastLogo.tsx';

interface CricketBroadcastBarProps {
  stream: LiveStreamData;
  score: LiveScoreData;
  compact?: boolean;
}

export function CricketBroadcastBar({ stream, score, compact = false }: CricketBroadcastBarProps) {
  const d: CricketDetails = {
    ...createInitialCricketDetails(),
    ...(score.sportSpecificDetails || {}),
  };

  const nameA = stream.teamAName || 'Team A';
  const nameB = stream.teamBName || 'Team B';
  const shortA = d.teamAShortName || deriveShortTeamName(nameA, 'TMA');
  const shortB = d.teamBShortName || deriveShortTeamName(nameB, 'TMB');

  const isBattingA = d.battingTeam === 'A';
  const batShort = isBattingA ? shortA : shortB;
  const batLogo = isBattingA ? stream.teamALogo : stream.teamBLogo;
  const bowlShort = isBattingA ? shortB : shortA;

  const runs = isBattingA ? d.teamARuns : d.teamBRuns;
  const wickets = isBattingA ? d.teamAWickets : d.teamBWickets;
  const balls = isBattingA ? d.teamABalls : d.teamBBalls;
  const extras = isBattingA ? getTotalExtras(d.extrasA) : getTotalExtras(d.extrasB);

  const crr = calculateCricketRunRate(runs, balls);
  const rrr = calculateRequiredRunRate(d);
  const runsNeeded = d.innings === 2 && d.target > 0 ? Math.max(0, d.target - runs) : null;
  const remainingBalls = Math.max(0, (d.oversLimit || 20) * 6 - balls);

  const lastOver = d.lastOverSummary && d.lastOverSummary.length > 0
    ? d.lastOverSummary
    : d.recentBalls.slice(-6);

  const hasPlayers = Boolean(d.batsman1 || d.batsman2 || d.bowler);

  return (
    <div className="w-full max-w-[780px] bg-slate-950/90 backdrop-blur-md text-white rounded-md shadow-xl overflow-hidden border border-white/10">
      {/* Main TV Broadcast Horizontal Strip */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2.5 sm:px-3.5 py-1.5">
        {/* Left: Batting Team + Score + Overs */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 shrink-0">
            {d.isSuperOver ? 'S/O' : `${d.innings === 2 ? '2ND' : '1ST'}`}
          </span>
          <BroadcastLogo logoUrl={batLogo} alt={batShort} />
          <span className="font-display font-bold text-xs sm:text-sm tracking-wide uppercase truncate">
            <span className="sm:hidden">{batShort}</span>
            <span className="hidden sm:inline">{isBattingA ? nameA : nameB} ({batShort})</span>
          </span>
          <span className="font-mono tabular-nums font-bold text-base sm:text-lg text-white leading-none ml-1">
            {runs}/{wickets}
          </span>
          <span className="font-mono tabular-nums text-[11px] sm:text-xs text-slate-300">
            ({formatCricketOvers(balls)}{d.oversLimit ? `/${d.oversLimit}` : ''})
          </span>
        </div>

        {/* Center/Right: Opponent Summary + CRR/RRR/Target */}
        <div className="flex items-center gap-2.5 sm:gap-3 text-[11px] font-mono tabular-nums text-slate-200 ml-auto">
          <span className="text-slate-300">
            {bowlShort}{' '}
            {isBattingA
              ? `${d.teamBRuns}/${d.teamBWickets} (${formatCricketOvers(d.teamBBalls)})`
              : `${d.teamARuns}/${d.teamAWickets} (${formatCricketOvers(d.teamABalls)})`}
          </span>
          <span className="text-emerald-300 font-semibold">CRR {crr}</span>
          {rrr !== null && (
            <span className="text-amber-300 font-semibold">RRR {rrr}</span>
          )}
          {d.target > 0 && (
            <span className="hidden sm:inline text-white font-semibold">TGT {d.target}</span>
          )}
          <span className="hidden md:inline text-slate-400">EXT {extras}</span>
        </div>
      </div>

      {/* Sub-strip: Target Chase / Super Over / Batters & Bowler / Last Over */}
      {(runsNeeded !== null || d.isSuperOver || hasPlayers || lastOver.length > 0) && !compact && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2.5 sm:px-3.5 py-1 bg-white/[0.06] border-t border-white/10 text-[10px] sm:text-[11px] text-slate-200">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 min-w-0">
            {d.isSuperOver && (
              <span className="font-mono tabular-nums font-semibold text-amber-300">
                SUPER OVER: {shortA} {d.superOverTeamARuns}/{d.superOverTeamAWickets} · {shortB} {d.superOverTeamBRuns}/{d.superOverTeamBWickets}
              </span>
            )}
            {runsNeeded !== null && score.resultStatus === 'NOT_DECLARED' && (
              <span className="font-semibold text-amber-200">
                Need {runsNeeded} in {remainingBalls}b
              </span>
            )}
            {d.batsman1 && (
              <span className="truncate max-w-[140px]">
                <span className="text-emerald-400 font-semibold">*</span> {d.batsman1}
              </span>
            )}
            {d.batsman2 && (
              <span className="hidden sm:inline truncate max-w-[130px] text-slate-300">
                {d.batsman2}
              </span>
            )}
            {d.bowler && (
              <span className="truncate max-w-[140px] text-slate-300">
                BWL: <span className="text-white">{d.bowler}</span>
              </span>
            )}
          </div>

          {lastOver.length > 0 && (
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 mr-0.5">Last</span>
              {lastOver.slice(-6).map((b, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded text-[10px] font-mono tabular-nums font-bold ${
                    b === 'W'
                      ? 'bg-red-600 text-white'
                      : b === '4'
                        ? 'bg-sky-600 text-white'
                        : b === '6'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white/15 text-slate-100'
                  }`}
                >
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
