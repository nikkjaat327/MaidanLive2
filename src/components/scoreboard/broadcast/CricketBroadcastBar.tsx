import { LiveScoreData, LiveStreamData } from '../../../types/index.ts';
import {
  CricketDetails,
  computeCricketChaseState,
  formatCricketOvers,
  getCricketBowlerLine,
  getCurrentOverBalls,
  getTotalExtras,
  normalizeCricketDetails,
} from '../../../utils/cricketScoring.ts';
import { deriveShortTeamName } from '../../../utils/matchResultValidation.ts';
import { BroadcastLogo } from './BroadcastLogo.tsx';

interface CricketBroadcastBarProps {
  stream: LiveStreamData;
  score: LiveScoreData;
  compact?: boolean;
}

export function CricketBroadcastBar({ stream, score, compact = false }: CricketBroadcastBarProps) {
  const d: CricketDetails = normalizeCricketDetails(
    (score.sportSpecificDetails || {}) as Partial<CricketDetails>
  );

  const nameA = stream.teamAName || 'Team A';
  const nameB = stream.teamBName || 'Team B';
  const shortA = d.teamAShortName || deriveShortTeamName(nameA, 'TMA');
  const shortB = d.teamBShortName || deriveShortTeamName(nameB, 'TMB');
  const chase = computeCricketChaseState(d, nameA, nameB);

  const isBattingA = d.battingTeam === 'A';
  const batShort = isBattingA ? shortA : shortB;
  const batName = isBattingA ? nameA : nameB;
  const batLogo = isBattingA ? stream.teamALogo : stream.teamBLogo;
  const bowlShort = isBattingA ? shortB : shortA;
  const bowlName = isBattingA ? nameB : nameA;
  const bowlLogo = isBattingA ? stream.teamBLogo : stream.teamALogo;

  const runs = isBattingA ? d.teamARuns : d.teamBRuns;
  const wickets = isBattingA ? d.teamAWickets : d.teamBWickets;
  const balls = isBattingA ? d.teamABalls : d.teamBBalls;

  const bowlRuns = isBattingA ? d.teamBRuns : d.teamARuns;
  const bowlWickets = isBattingA ? d.teamBWickets : d.teamAWickets;
  const bowlBalls = isBattingA ? d.teamBBalls : d.teamABalls;
  const extras = isBattingA ? getTotalExtras(d.extrasA) : getTotalExtras(d.extrasB);

  const lastOver = getCurrentOverBalls(d);
  const showCrease = !chase.isInningsBreak && !chase.isMatchCompleted && score.resultStatus === 'NOT_DECLARED';
  const battersLine = showCrease
    ? [d.batsman1 ? `* ${d.batsman1}` : '', d.batsman2 || ''].filter(Boolean).join(' · ')
    : '';
  const bowlerLine = showCrease ? getCricketBowlerLine(d) : '';

  const phaseBadge = d.isSuperOver
    ? 'S/O'
    : chase.isInningsBreak
      ? 'BRK'
      : chase.isMatchCompleted || score.resultStatus !== 'NOT_DECLARED'
        ? 'FIN'
        : `${d.innings === 2 ? '2ND' : '1ST'}`;

  return (
    <div className="w-full bg-slate-950/90 backdrop-blur-md text-white rounded-md shadow-xl overflow-hidden border border-white/10">
      {/* Main TV Broadcast Horizontal Strip — Exact Equal Left & Right Wings */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-2.5 sm:px-3.5 py-1.5">
        {/* Left: Batting Team + Score + Overs + ONLY Batters */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <BroadcastLogo logoUrl={batLogo} alt={batShort} />
            <div className="min-w-0">
              <span className="font-display font-bold text-xs sm:text-sm tracking-wide uppercase truncate block leading-tight">
                <span className="hidden portrait:inline">{batShort}</span>
                <span className="portrait:hidden">{batName}</span>
              </span>
              {battersLine && (
                <span className="text-[10px] text-emerald-200/95 truncate block leading-tight">
                  {battersLine}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-baseline gap-1 shrink-0 font-mono tabular-nums">
            <span className="font-bold text-base sm:text-lg text-white leading-none">
              {runs}/{wickets}
            </span>
            <span className="text-[10px] sm:text-xs text-slate-300">
              ({formatCricketOvers(balls)}{d.oversLimit ? `/${d.oversLimit}` : ''})
            </span>
          </div>
        </div>

        {/* Center Match Divider & Phase */}
        <div className="flex flex-col items-center justify-center px-2.5 py-0.5 rounded bg-white/10 text-center shrink-0">
          <span
            className={`text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded leading-none ${
              chase.isInningsBreak
                ? 'bg-orange-400 text-slate-950'
                : 'bg-emerald-500 text-slate-950'
            }`}
          >
            {phaseBadge}
          </span>
          <span className="text-[9px] font-mono tabular-nums text-emerald-300 mt-0.5 leading-none">
            CRR {chase.crr}
          </span>
        </div>

        {/* Right: Bowling Team + Score + ONLY Bowler + Figures */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="font-mono tabular-nums text-xs sm:text-sm font-bold text-slate-200 leading-none shrink-0">
            {chase.isSecondInnings || bowlBalls > 0 || bowlRuns > 0
              ? `${bowlRuns}/${bowlWickets} (${formatCricketOvers(bowlBalls)})`
              : '—'}
          </span>

          <div className="flex items-center gap-2 min-w-0 justify-end">
            <div className="min-w-0 text-right">
              <span className="font-display font-bold text-xs sm:text-sm tracking-wide uppercase truncate block leading-tight">
                <span className="hidden portrait:inline">{bowlShort}</span>
                <span className="portrait:hidden">{bowlName}</span>
              </span>
              {bowlerLine && (
                <span className="text-[10px] font-mono tabular-nums text-sky-200/95 truncate block leading-tight">
                  {bowlerLine}
                </span>
              )}
            </div>
            <BroadcastLogo logoUrl={bowlLogo} alt={bowlShort} />
          </div>
        </div>
      </div>

      {/* Sub-strip: Target Chase / Innings Break / Super Over / Rates / Current Over */}
      {(chase.isInningsBreak ||
        (chase.isSecondInnings && chase.target > 0) ||
        chase.isMatchCompleted ||
        d.isSuperOver ||
        lastOver.length > 0 ||
        extras > 0) &&
        !compact && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2.5 sm:px-3.5 py-1 bg-white/[0.06] border-t border-white/10 text-[10px] sm:text-[11px] text-slate-200">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 min-w-0 font-mono tabular-nums">
            {d.isSuperOver && (
              <span className="font-semibold text-amber-300">
                SUPER OVER: {shortA} {d.superOverTeamARuns}/{d.superOverTeamAWickets} · {shortB}{' '}
                {d.superOverTeamBRuns}/{d.superOverTeamBWickets}
              </span>
            )}
            {chase.isInningsBreak && (
              <span className="font-sans font-semibold text-orange-300">
                INNINGS BREAK · Target {chase.target}
              </span>
            )}
            {chase.isSecondInnings && !chase.isMatchCompleted && chase.target > 0 && score.resultStatus === 'NOT_DECLARED' && (
              <span className="font-sans font-semibold text-amber-200">
                Need {chase.runsRequired} in {chase.ballsRemaining}b
              </span>
            )}
            {chase.isMatchCompleted && (
              <span className="font-sans font-semibold text-emerald-300">{chase.chaseSummaryText}</span>
            )}
            {chase.rrr !== null && (
              <span className="text-amber-300 font-semibold">RRR {chase.rrr}</span>
            )}
            {chase.target > 0 && !chase.isMatchCompleted && (
              <span className="text-white font-semibold">TGT {chase.target}</span>
            )}
            <span className="hidden md:inline text-slate-400">EXT {extras}</span>
          </div>

          {lastOver.length > 0 && (
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 mr-0.5">Over</span>
              {lastOver.map((b, i) => (
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
