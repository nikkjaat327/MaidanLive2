import { Activity, Award, Clock, Shield, Target } from 'lucide-react';
import { LiveScoreData, LiveStreamData } from '../../types/index.ts';
import {
  CricketDetails,
  computeCricketChaseState,
  formatCricketOvers,
  getCricketCreaseSummary,
  getCurrentOverBalls,
  getTotalExtras,
  normalizeCricketDetails,
} from '../../utils/cricketScoring.ts';
import {
  KabaddiDetails,
  computeEffectiveKabaddiClock,
  normalizeKabaddiDetails,
} from '../../utils/kabaddiScoring.ts';
import {
  FootballDetails,
  createInitialFootballDetails,
} from '../../utils/footballScoring.ts';
import {
  VolleyballDetails,
  normalizeVolleyballDetails,
} from '../../utils/volleyballScoring.ts';
import { SportOption } from '../../constants/sports.ts';
import { MatchStatusBadge } from '../common/MatchStatusBadge.tsx';
import { usePlayerChangeFlash } from '../../hooks/usePlayerChangeFlash.ts';

export interface ScoreboardSummaryProps {
  stream: Pick<
    LiveStreamData,
    'teamAName' | 'teamBName' | 'gameName' | 'status' | 'tournamentName' | 'roundName'
  >;
  score: LiveScoreData | null;
  variant?: 'detail' | 'compact';
  className?: string;
}

function formatClock(mins?: number, secs?: number): string {
  const m = Math.max(0, Math.floor(mins || 0));
  const s = Math.max(0, Math.floor(secs || 0));
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function ScoreboardSummary({
  stream,
  score,
  variant = 'detail',
  className = '',
}: ScoreboardSummaryProps) {
  const sportType: SportOption =
    (score?.sportType as SportOption) || (stream.gameName as SportOption) || 'Other';
  const teamA = stream.teamAName || 'Team A';
  const teamB = stream.teamBName || 'Team B';
  const scoreA = score?.teamAScore ?? 0;
  const scoreB = score?.teamBScore ?? 0;
  const rawDetails = (score?.sportSpecificDetails || {}) as Record<string, unknown>;
  const isCompact = variant === 'compact';

  const cricketCreaseForFlash =
    sportType === 'Cricket'
      ? getCricketCreaseSummary(rawDetails as Partial<CricketDetails>, teamA, teamB)
      : null;
  const playerFlash = usePlayerChangeFlash(
    cricketCreaseForFlash?.batsman1?.name,
    cricketCreaseForFlash?.batsman2?.name,
    cricketCreaseForFlash?.bowler?.name
  );

  const resultBanner =
    score?.resultStatus && score.resultStatus !== 'NOT_DECLARED' ? (
      <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-900">
        <Award className="w-4 h-4 text-emerald-700 shrink-0" />
        <span className="truncate">
          {score.resultDescription || `${score.winnerTeamName} won`}
          {score.mvpPlayerName ? ` · POTM: ${score.mvpPlayerName}` : ''}
        </span>
      </div>
    ) : null;

  const renderCricketSummary = () => {
    const details: CricketDetails = normalizeCricketDetails(rawDetails as Partial<CricketDetails>);
    const chase = computeCricketChaseState(details, teamA, teamB);
    const crease = getCricketCreaseSummary(
      rawDetails as Partial<CricketDetails>,
      teamA,
      teamB
    );
    const isBattingA = details.battingTeam !== 'B';
    const runsA = details.teamARuns ?? scoreA;
    const runsB = details.teamBRuns ?? scoreB;
    const wktsA = details.teamAWickets ?? 0;
    const wktsB = details.teamBWickets ?? 0;
    const ballsA = details.teamABalls ?? 0;
    const ballsB = details.teamBBalls ?? 0;

    const activeExtras = isBattingA ? details.extrasA : details.extrasB;
    const extrasTotal = getTotalExtras(activeExtras);
    const currentOverBalls = getCurrentOverBalls(details);
    const hasBatters = Boolean(crease.batsman1 || crease.batsman2);
    const hasBowler = Boolean(crease.bowler);

    const chaseLine =
      chase.isInningsBreak || chase.isSecondInnings || chase.isMatchCompleted
        ? chase.chaseSummaryText
        : details.tossWinner
          ? `${details.tossWinner === 'A' ? teamA : teamB} won the toss & chose to ${
              details.tossDecision === 'BOWL' ? 'bowl' : 'bat'
            }`
          : chase.chaseSummaryText;

    return (
      <div className="space-y-3">
        {/* Team Scores Comparison */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className={`rounded-lg border p-3 ${
              isBattingA && !chase.isInningsBreak && !chase.isMatchCompleted
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-900 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold truncate">
                {teamA} {details.teamAShortName ? `(${details.teamAShortName})` : ''}
              </span>
              {isBattingA && !chase.isInningsBreak && !chase.isMatchCompleted && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  BAT
                </span>
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-2 font-mono tabular-nums">
              <span className="text-xl sm:text-2xl font-bold">
                {runsA}/{wktsA}
              </span>
              <span
                className={`text-xs ${
                  isBattingA && !chase.isInningsBreak && !chase.isMatchCompleted
                    ? 'text-slate-300'
                    : 'text-slate-500'
                }`}
              >
                ({formatCricketOvers(ballsA)} ov)
              </span>
            </div>
          </div>

          <div
            className={`rounded-lg border p-3 ${
              !isBattingA && !chase.isInningsBreak && !chase.isMatchCompleted
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-900 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold truncate">
                {teamB} {details.teamBShortName ? `(${details.teamBShortName})` : ''}
              </span>
              {!isBattingA && !chase.isInningsBreak && !chase.isMatchCompleted && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  BAT
                </span>
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-2 font-mono tabular-nums">
              <span className="text-xl sm:text-2xl font-bold">
                {runsB}/{wktsB}
              </span>
              <span
                className={`text-xs ${
                  !isBattingA && !chase.isInningsBreak && !chase.isMatchCompleted
                    ? 'text-slate-300'
                    : 'text-slate-500'
                }`}
              >
                ({formatCricketOvers(ballsB)} ov)
              </span>
            </div>
          </div>
        </div>

        {/* Equation & Rates */}
        <div
          className={`flex flex-wrap items-center justify-between gap-2 text-xs border rounded-lg px-3 py-2 ${
            chase.isInningsBreak
              ? 'bg-orange-50 border-orange-200 text-orange-950'
              : chase.isMatchCompleted
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-slate-50 border-slate-200 text-slate-800'
          }`}
        >
          <span className="font-semibold">{chaseLine}</span>
          <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-slate-600">
            <span>CRR {chase.crr}</span>
            {chase.rrr !== null && (
              <span className="text-orange-700 font-semibold">RRR {chase.rrr}</span>
            )}
            {chase.target > 0 && !chase.isMatchCompleted && (
              <span className="font-semibold text-slate-800">Target {chase.target}</span>
            )}
            {!isCompact && <span>Extras {extrasTotal}</span>}
          </div>
        </div>

        {/* Batters, Bowler & Current Over Deliveries (Detail Mode) */}
        {!isCompact && (hasBatters || hasBowler || currentOverBalls.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {(hasBatters || hasBowler) && (
              <div className="rounded-lg border border-slate-200 p-3 bg-white space-y-2 text-xs">
                <div className={`grid grid-cols-1 ${hasBatters && hasBowler ? 'sm:grid-cols-2' : ''} gap-3`}>
                  {hasBatters && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                        <span>On Crease</span>
                        <span className="font-mono">R (B) · SR</span>
                      </div>
                      <div className="space-y-1">
                        {crease.batsman1 && (
                          <div className="flex items-center justify-between gap-2">
                            <span
                              key={`s-${playerFlash.strikerAnimKey}`}
                              className={`truncate font-semibold text-[#EA580C] ${
                                playerFlash.strikerFlash ? 'ml-player-change' : ''
                              }`}
                            >
                              {crease.batsman1.name}
                              {crease.batsman1.onStrike ? '*' : ''}
                            </span>
                            <span className="font-mono tabular-nums text-slate-900 shrink-0">
                              <strong>{crease.batsman1.runs}</strong>{' '}
                              <span className="text-slate-500">
                                ({crease.batsman1.balls}) · {crease.batsman1.strikeRate}
                              </span>
                            </span>
                          </div>
                        )}
                        {crease.batsman2 && (
                          <div className="flex items-center justify-between gap-2">
                            <span
                              key={`ns-${playerFlash.nonStrikerAnimKey}`}
                              className={`truncate font-semibold text-slate-800 ${
                                playerFlash.nonStrikerFlash ? 'ml-player-change' : ''
                              }`}
                            >
                              {crease.batsman2.name}
                              {crease.batsman2.onStrike ? '*' : ''}
                            </span>
                            <span className="font-mono tabular-nums text-slate-900 shrink-0">
                              <strong>{crease.batsman2.runs}</strong>{' '}
                              <span className="text-slate-500">
                                ({crease.batsman2.balls}) · {crease.batsman2.strikeRate}
                              </span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {hasBowler && crease.bowler && (
                    <div className={`space-y-1 ${hasBatters ? 'sm:border-l sm:border-slate-100 sm:pl-3' : ''}`}>
                      <div className="flex items-center justify-between text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                        <span>Bowling</span>
                        <span className="font-mono">O-M-R-W · Econ</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span
                          key={`bw-${playerFlash.bowlerAnimKey}`}
                          className={`truncate font-semibold text-slate-900 ${
                            playerFlash.bowlerFlash ? 'ml-player-change' : ''
                          }`}
                        >
                          {crease.bowler.name}
                        </span>
                        <span className="font-mono tabular-nums text-slate-800 shrink-0">
                          <strong>
                            {crease.bowler.overs}-{crease.bowler.maidens}-
                            {crease.bowler.runsConceded}-{crease.bowler.wickets}
                          </strong>{' '}
                          <span className="text-slate-500">· {crease.bowler.economy}</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentOverBalls.length > 0 && (
              <div className="rounded-lg border border-slate-200 p-3 bg-white">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Current Over
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {currentOverBalls.map((ball, idx) => {
                    const isWkt = ball.includes('W') && !ball.startsWith('Wd');
                    const isBoundary = ball === '4' || ball === '6';
                    return (
                      <span
                        key={`${ball}-${idx}`}
                        className={`inline-flex items-center justify-center min-w-[26px] h-[26px] px-1.5 rounded font-mono text-[11px] font-bold tabular-nums ${
                          isWkt
                            ? 'bg-red-600 text-white'
                            : isBoundary
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 text-slate-800 border border-slate-200'
                        }`}
                      >
                        {ball}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {details.isSuperOver && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums text-amber-950">
            <span className="font-sans font-bold uppercase tracking-wider text-[11px]">
              Super Over
            </span>
            <span>
              {teamA}: {details.superOverTeamARuns}/{details.superOverTeamAWickets} · {teamB}:{' '}
              {details.superOverTeamBRuns}/{details.superOverTeamBWickets}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderKabaddiSummary = () => {
    const details = normalizeKabaddiDetails(rawDetails as Partial<KabaddiDetails>);
    const eff = computeEffectiveKabaddiClock(details);
    const statRows = [
      { label: 'Raid Points', a: details.teamA.raidPoints, b: details.teamB.raidPoints },
      { label: 'Tackle Points', a: details.teamA.tacklePoints, b: details.teamB.tacklePoints },
      { label: 'Bonus Points', a: details.teamA.bonusPoints, b: details.teamB.bonusPoints },
      { label: 'All-Out / ST', a: `${details.teamA.allOutPoints} (${details.teamA.superTackles})`, b: `${details.teamB.allOutPoints} (${details.teamB.superTackles})` },
    ];

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 items-center gap-2 rounded-lg bg-slate-900 text-white p-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-300 truncate">{teamA}</p>
            <p className="font-mono text-2xl font-bold tabular-nums">{scoreA}</p>
            <p className="text-[10px] font-mono text-emerald-300">
              {details.playersOnCourtA}/{details.rules.playersPerSide} on mat
            </p>
          </div>
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              {details.clock.halfLabel || details.half}
            </p>
            <p className="font-mono text-sm font-semibold tabular-nums text-slate-200 mt-0.5">
              {eff.formattedClock}
            </p>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-xs text-slate-300 truncate">{teamB}</p>
            <p className="font-mono text-2xl font-bold tabular-nums">{scoreB}</p>
            <p className="text-[10px] font-mono text-emerald-300">
              {details.playersOnCourtB}/{details.rules.playersPerSide} on mat
            </p>
          </div>
        </div>

        {details.superRaidNote && (
          <div className="rounded-lg bg-sky-50 border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-600 shrink-0" />
            <span>{details.superRaidNote}</span>
          </div>
        )}

        {!isCompact && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {statRows.map((row) => (
              <div
                key={row.label}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <p className="text-[11px] font-medium text-slate-500">{row.label}</p>
                <p className="mt-1 font-mono text-sm font-bold tabular-nums text-slate-900">
                  {row.a} <span className="text-slate-400 font-normal">vs</span> {row.b}
                </p>
              </div>
            ))}
          </div>
        )}

        {details.isTieBreaker && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-center justify-between text-xs font-semibold text-amber-950">
            <span>5-Raid Tie Breaker</span>
            <span className="font-mono tabular-nums">
              {details.tieBreakerScoreA} - {details.tieBreakerScoreB}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderFootballSummary = () => {
    const details: FootballDetails = {
      ...createInitialFootballDetails(),
      ...(rawDetails as Partial<FootballDetails>),
    };

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 items-center gap-2 rounded-lg bg-slate-900 text-white p-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-300 truncate">{teamA}</p>
            <p className="font-mono text-2xl font-bold tabular-nums">{scoreA}</p>
          </div>
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              {details.half}
            </p>
            <p className="font-mono text-sm font-semibold tabular-nums text-slate-200 mt-0.5">
              {formatClock(details.timerMinutes, details.timerSeconds)}
              {details.extraTimeMinutes > 0 ? ` +${details.extraTimeMinutes}'` : ''}
            </p>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-xs text-slate-300 truncate">{teamB}</p>
            <p className="font-mono text-2xl font-bold tabular-nums">{scoreB}</p>
          </div>
        </div>

        {!isCompact && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between">
              <span className="font-medium text-slate-700 truncate">{teamA} Cards</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                Y:{details.teamAYellowCards || 0} · R:{details.teamARedCards || 0}
              </span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between">
              <span className="font-medium text-slate-700 truncate">{teamB} Cards</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                Y:{details.teamBYellowCards || 0} · R:{details.teamBRedCards || 0}
              </span>
            </div>
          </div>
        )}

        {(details.half === 'Penalties' ||
          (details.teamAPenalties || 0) > 0 ||
          (details.teamBPenalties || 0) > 0) && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-center justify-between text-xs font-semibold text-amber-950">
            <span>Penalty Shootout</span>
            <span className="font-mono tabular-nums">
              {details.teamAPenalties || 0} - {details.teamBPenalties || 0}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderVolleyballSummary = () => {
    const details = normalizeVolleyballDetails(rawDetails as Partial<VolleyballDetails>);
    const setScores = details.setScores;

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 items-center gap-2 rounded-lg bg-slate-900 text-white p-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-300 truncate">
              {teamA} {details.servingTeam === 'A' && !details.matchCompleted ? '●' : ''}
              {details.advantageTeam === 'A' && !details.matchCompleted ? ' · ADV' : ''}
            </p>
            <div className="flex items-baseline gap-2 font-mono tabular-nums mt-0.5">
              <span className="text-2xl font-bold">{scoreA}</span>
              <span className="text-xs text-slate-400">
                ({details.teamASetsWon}/{details.winningThreshold} sets)
              </span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Set {details.currentSet}/{details.bestOfSets}
            </p>
            <p className="text-[11px] text-slate-300 mt-0.5">
              {details.matchCompleted
                ? 'Match Final'
                : details.advantageTeam
                  ? `ADV ${details.advantageTeam === 'A' ? teamA : teamB}`
                  : details.isDeuce
                    ? 'DEUCE'
                    : `Best of ${details.bestOfSets}`}
            </p>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-xs text-slate-300 truncate">
              {details.advantageTeam === 'B' && !details.matchCompleted ? 'ADV · ' : ''}
              {details.servingTeam === 'B' && !details.matchCompleted ? '● ' : ''}
              {teamB}
            </p>
            <div className="flex items-baseline justify-end gap-2 font-mono tabular-nums mt-0.5">
              <span className="text-xs text-slate-400">
                ({details.teamBSetsWon}/{details.winningThreshold} sets)
              </span>
              <span className="text-2xl font-bold">{scoreB}</span>
            </div>
          </div>
        </div>

        {!isCompact && setScores.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Set History
            </span>
            {setScores.map((set, idx) => (
              <span
                key={`set-${set.set ?? idx}`}
                className="px-2.5 py-1 rounded border border-slate-200 bg-slate-50 font-mono text-xs font-semibold tabular-nums text-slate-800"
              >
                S{set.set ?? idx + 1}: {set.teamA}-{set.teamB}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderGenericSummary = () => {
    const periodLabel = typeof rawDetails.periodLabel === 'string' ? rawDetails.periodLabel : '';
    const notes = typeof rawDetails.notes === 'string' ? rawDetails.notes : '';

    return (
      <div className="space-y-2.5">
        <div className="grid grid-cols-3 items-center gap-2 rounded-lg bg-slate-900 text-white p-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-300 truncate">{teamA}</p>
            <p className="font-mono text-2xl font-bold tabular-nums">{scoreA}</p>
          </div>
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              {periodLabel || score?.matchStatus || 'Match Score'}
            </p>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-xs text-slate-300 truncate">{teamB}</p>
            <p className="font-mono text-2xl font-bold tabular-nums">{scoreB}</p>
          </div>
        </div>
        {!isCompact && notes && (
          <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            {notes}
          </p>
        )}
      </div>
    );
  };

  return (
    <section
      aria-label={`${sportType} Scoreboard Summary`}
      className={`bg-white border border-slate-200 rounded-xl ${
        isCompact ? 'p-3' : 'p-4 sm:p-5'
      } ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {sportType === 'Cricket' ? (
            <Target className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <Shield className="w-4 h-4 text-slate-700 shrink-0" />
          )}
          <h3 className="font-display text-sm font-bold text-slate-900 truncate">
            {sportType} Scoreboard Summary
          </h3>
          {stream.roundName && (
            <span className="text-xs text-slate-500 truncate hidden sm:inline">
              · {stream.roundName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {score?.lastUpdatedAt && !isCompact && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-500 font-mono tabular-nums">
              <Clock className="w-3 h-3" />
              {new Date(score.lastUpdatedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          <MatchStatusBadge stream={stream} score={score} compact={isCompact} />
        </div>
      </div>

      {sportType === 'Cricket'
        ? renderCricketSummary()
        : sportType === 'Kabaddi'
          ? renderKabaddiSummary()
          : sportType === 'Football'
            ? renderFootballSummary()
            : sportType === 'Volleyball'
              ? renderVolleyballSummary()
              : renderGenericSummary()}

      {resultBanner}
    </section>
  );
}
