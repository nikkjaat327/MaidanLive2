import { useEffect, useMemo, useState } from 'react';
import { LiveScoreData, LiveStreamData, PlayerData } from '../../types/index.ts';
import {
  CricketDetails,
  computeCricketChaseState,
  deriveCricketInningsScorecard,
  normalizeCricketDetails,
} from '../../utils/cricketScoring.ts';
import { mergeMatchRoster, type UnifiedMatchPlayer } from '../../utils/sportPositions.ts';

interface CricketScorecardPanelProps {
  stream: Pick<LiveStreamData, 'teamAName' | 'teamBName' | 'gameName'> &
    Partial<Pick<LiveStreamData, 'teamAId' | 'teamBId' | 'teamAPlayers' | 'teamBPlayers'>>;
  score: LiveScoreData | null;
  players?: PlayerData[];
  lineupPlayers?: {
    teamA: Array<PlayerData | UnifiedMatchPlayer>;
    teamB: Array<PlayerData | UnifiedMatchPlayer>;
  };
  compact?: boolean;
}

export function CricketScorecardPanel({
  stream,
  score,
  players = [],
  lineupPlayers,
  compact = false,
}: CricketScorecardPanelProps) {
  const details = normalizeCricketDetails(
    (score?.sportSpecificDetails || {}) as Partial<CricketDetails>
  );
  const teamAName = stream.teamAName || 'Team A';
  const teamBName = stream.teamBName || 'Team B';

  const card1 = deriveCricketInningsScorecard(details, 1, teamAName, teamBName);
  const card2 = deriveCricketInningsScorecard(details, 2, teamAName, teamBName);
  const chase = computeCricketChaseState(details, teamAName, teamBName);

  const hasSecondInningsData =
    details.innings === 2 ||
    Boolean(details.innings2Started) ||
    card2.balls > 0 ||
    card2.runs > 0 ||
    card2.wickets > 0 ||
    card2.batting.length > 0;

  const [selectedInnings, setSelectedInnings] = useState<1 | 2>(
    details.innings === 2 && hasSecondInningsData ? 2 : 1
  );
  const [showOversBreakdown, setShowOversBreakdown] = useState(false);

  useEffect(() => {
    if (details.innings === 2 && hasSecondInningsData) {
      setSelectedInnings(2);
    }
  }, [details.innings, hasSecondInningsData]);

  const activeCard = selectedInnings === 2 && hasSecondInningsData ? card2 : card1;

  const roster = useMemo(() => {
    const combinedDb: PlayerData[] = [...players];
    const pushIfDb = (arr: Array<PlayerData | UnifiedMatchPlayer> | undefined, teamSide: 'A' | 'B') => {
      if (!Array.isArray(arr)) return;
      for (const item of arr) {
        if ('teamSide' in item) {
          combinedDb.push({
            id: item.dbPlayerId || item.id,
            name: item.name,
            teamId: teamSide === 'A' ? stream.teamAId : stream.teamBId,
            sportType: 'Cricket',
            role: item.position || '',
            position: item.position || '',
            jerseyNumber: item.jerseyNumber ?? null,
            avatarUrl: '',
            createdAt: '',
          });
        } else {
          combinedDb.push({
            ...item,
            teamId:
              item.teamId || (teamSide === 'A' ? stream.teamAId : stream.teamBId) || null,
          });
        }
      }
    };
    pushIfDb(lineupPlayers?.teamA, 'A');
    pushIfDb(lineupPlayers?.teamB, 'B');
    return mergeMatchRoster(stream, combinedDb);
  }, [stream, players, lineupPlayers]);

  const battingSideRoster = activeCard.battingTeam === 'A' ? roster.teamA : roster.teamB;
  const bowlingSideRoster = activeCard.bowlingTeam === 'A' ? roster.teamA : roster.teamB;

  const battedSet = new Set(activeCard.batting.map((b) => b.name.trim().toLowerCase()));
  const yetToBat = battingSideRoster.filter(
    (p) => !battedSet.has(p.name.trim().toLowerCase())
  );

  const bowledSet = new Set(activeCard.bowling.map((bw) => bw.name.trim().toLowerCase()));
  const remainingBowlers = bowlingSideRoster.filter(
    (p) => !bowledSet.has(p.name.trim().toLowerCase())
  );
  const currentBowlerLower = (details.bowler || '').trim().toLowerCase();
  const isCurrentInningsActive =
    details.innings === activeCard.innings &&
    details.matchPhase !== 'COMPLETED' &&
    !(activeCard.innings === 1 && details.innings1Completed);

  return (
    <div className="space-y-4">
      {/* Summary Header & Chase / Result Status */}
      <div
        className={`rounded-lg border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs ${
          chase.isInningsBreak
            ? 'bg-orange-50 border-orange-200 text-orange-950'
            : chase.isMatchCompleted
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : 'bg-slate-50 border-slate-200 text-slate-800'
        }`}
      >
        <div className="font-semibold">
          {chase.chaseSummaryText}
        </div>
        <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-[11px]">
          <span>CRR: {chase.crr}</span>
          {chase.rrr !== null && <span className="text-orange-700 font-semibold">RRR: {chase.rrr}</span>}
          <span>Overs: {chase.configuredOvers}</span>
        </div>
      </div>

      {/* Innings Segmented Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
          <button
            type="button"
            onClick={() => setSelectedInnings(1)}
            className={`min-h-[36px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              selectedInnings === 1
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            1st Innings · {card1.battingTeamName} ({card1.runs}/{card1.wickets})
          </button>
          <button
            type="button"
            disabled={!hasSecondInningsData}
            onClick={() => setSelectedInnings(2)}
            className={`min-h-[36px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors disabled:opacity-50 ${
              selectedInnings === 2
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2nd Innings · {card2.battingTeamName}{' '}
            {hasSecondInningsData ? `(${card2.runs}/${card2.wickets})` : '(Yet to start)'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowOversBreakdown((v) => !v)}
          className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {showOversBreakdown
            ? 'Hide Over-by-Over'
            : `Over-by-Over (${activeCard.oversSummary.length})`}
        </button>
      </div>

      {/* Batting Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="text-xs font-bold text-slate-900 uppercase tracking-wide">
            {activeCard.battingTeamName} Batting
          </div>
          <div className="text-xs font-mono font-bold tabular-nums text-slate-900">
            {activeCard.runs}/{activeCard.wickets}{' '}
            <span className="text-slate-500 font-normal">
              ({activeCard.oversText} ov · RR {activeCard.runRate})
            </span>
          </div>
        </div>

        {activeCard.batting.length === 0 ? (
          <div className="p-4 text-xs text-slate-500 text-center">
            No batter deliveries recorded yet for this innings. Set batter names or record deliveries to populate the batting card.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] text-slate-500 uppercase bg-white">
                  <th className="py-2 px-3 font-semibold">Batter</th>
                  <th className="py-2 px-2 text-right font-semibold">R</th>
                  <th className="py-2 px-2 text-right font-semibold">B</th>
                  {!compact && <th className="py-2 px-2 text-right font-semibold">4s</th>}
                  {!compact && <th className="py-2 px-2 text-right font-semibold">6s</th>}
                  <th className="py-2 px-3 text-right font-semibold">SR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeCard.batting.map((b) => (
                  <tr key={b.name} className={b.onStrike ? 'bg-orange-50/40' : ''}>
                    <td className="py-2 px-3">
                      <div className="font-semibold text-slate-900">
                        {b.name}
                        {b.onStrike && !b.isOut && (
                          <span className="text-orange-600 font-bold ml-0.5">*</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">{b.dismissalText}</div>
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-bold tabular-nums text-slate-900">
                      {b.runs}
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-600">
                      {b.balls}
                    </td>
                    {!compact && (
                      <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-600">
                        {b.fours}
                      </td>
                    )}
                    {!compact && (
                      <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-600">
                        {b.sixes}
                      </td>
                    )}
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                      {b.strikeRate}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Yet to Bat (Remaining Squad Players) */}
        {yetToBat.length > 0 && (
          <div className="px-3.5 py-2.5 bg-white border-t border-slate-100 text-xs">
            <span className="font-semibold text-slate-700 mr-2">
              {activeCard.batting.length === 0 ? 'Squad:' : 'Yet to bat:'}
            </span>
            <span className="text-slate-600 leading-relaxed">
              {yetToBat.map((p, idx) => (
                <span key={p.id || p.name}>
                  {idx > 0 && <span className="text-slate-400 mx-1.5">·</span>}
                  <span className="font-medium text-slate-800">
                    {p.jerseyNumber != null ? `#${p.jerseyNumber} ` : ''}
                    {p.name}
                  </span>
                  {p.position ? (
                    <span className="text-[11px] text-slate-500"> ({p.position})</span>
                  ) : null}
                </span>
              ))}
            </span>
          </div>
        )}

        {/* Extras & Total */}
        <div className="px-3.5 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="text-slate-600">
            <span className="font-semibold text-slate-800">Extras:</span>{' '}
            <span className="font-mono font-bold text-slate-900">{activeCard.extras.total}</span>{' '}
            <span className="text-slate-500">
              (wd {activeCard.extras.wides}, nb {activeCard.extras.noBalls}, b {activeCard.extras.byes}, lb {activeCard.extras.legByes}
              {activeCard.extras.penaltyRuns > 0 ? `, p ${activeCard.extras.penaltyRuns}` : ''})
            </span>
          </div>
          <div className="font-semibold text-slate-900 font-mono tabular-nums">
            Total: {activeCard.runs}/{activeCard.wickets} ({activeCard.oversText} ov)
          </div>
        </div>
      </div>

      {/* Fall of Wickets */}
      {activeCard.fallOfWickets.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Fall of Wickets
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            {activeCard.fallOfWickets.map((fow) => (
              <span
                key={`${fow.wicketNumber}-${fow.batterName}`}
                className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-200 px-2.5 py-1 text-slate-800"
              >
                <strong className="font-mono tabular-nums">{fow.scoreText}</strong>
                <span>
                  ({fow.batterName}, {fow.oversText} ov)
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Bowling Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-900 uppercase tracking-wide">
          {activeCard.bowlingTeamName} Bowling
        </div>

        {activeCard.bowling.length === 0 ? (
          <div className="p-4 text-xs text-slate-500 text-center">
            No bowler spells recorded yet for this innings.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] text-slate-500 uppercase bg-white">
                  <th className="py-2 px-3 font-semibold">Bowler</th>
                  <th className="py-2 px-2 text-right font-semibold">O</th>
                  <th className="py-2 px-2 text-right font-semibold">M</th>
                  <th className="py-2 px-2 text-right font-semibold">R</th>
                  <th className="py-2 px-2 text-right font-semibold">W</th>
                  <th className="py-2 px-3 text-right font-semibold">Econ</th>
                  {!compact && <th className="py-2 px-2 text-right font-semibold">0s</th>}
                  {!compact && <th className="py-2 px-2 text-right font-semibold">4s</th>}
                  {!compact && <th className="py-2 px-3 text-right font-semibold">6s</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeCard.bowling.map((bw) => {
                  const isActiveBowler =
                    isCurrentInningsActive &&
                    currentBowlerLower &&
                    bw.name.trim().toLowerCase() === currentBowlerLower;
                  return (
                    <tr key={bw.name} className={isActiveBowler ? 'bg-sky-50/60' : ''}>
                      <td className="py-2 px-3 font-semibold text-slate-900">
                        {bw.name}
                        {isActiveBowler && (
                          <span className="ml-1 text-[10px] font-bold uppercase text-sky-700">
                            (Bowling)
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-700">
                        {bw.overs}
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-600">
                        {bw.maidens}
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-700">
                        {bw.runsConceded}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold tabular-nums text-slate-900">
                        {bw.wickets}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                        {bw.economy}
                      </td>
                      {!compact && (
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-500">
                          {bw.dotBalls}
                        </td>
                      )}
                      {!compact && (
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-500">
                          {bw.foursConceded}
                        </td>
                      )}
                      {!compact && (
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-500">
                          {bw.sixesConceded}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {remainingBowlers.length > 0 && (
          <div className="px-3.5 py-2.5 bg-slate-50/70 border-t border-slate-100 text-xs">
            <span className="font-semibold text-slate-700 mr-2">
              {activeCard.bowling.length === 0 ? 'Bowling squad:' : 'Did not bowl:'}
            </span>
            <span className="text-slate-600 leading-relaxed">
              {remainingBowlers.map((p, idx) => (
                <span key={p.id || p.name}>
                  {idx > 0 && <span className="text-slate-400 mx-1.5">·</span>}
                  <span className="font-medium text-slate-800">
                    {p.jerseyNumber != null ? `#${p.jerseyNumber} ` : ''}
                    {p.name}
                  </span>
                  {p.position ? (
                    <span className="text-[11px] text-slate-500"> ({p.position})</span>
                  ) : null}
                </span>
              ))}
            </span>
          </div>
        )}
      </div>

      {/* Over-by-Over Breakdown */}
      {showOversBreakdown && (
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Over-by-Over Breakdown
          </p>
          {activeCard.oversSummary.length === 0 ? (
            <p className="text-xs text-slate-500">No completed or active overs yet.</p>
          ) : (
            <div className="space-y-2">
              {activeCard.oversSummary.map((ov) => (
                <div
                  key={ov.overNumber}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                >
                  <div className="font-semibold text-slate-800">
                    Over {ov.overNumber}{' '}
                    <span className="font-normal text-slate-500">({ov.bowler})</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 font-mono tabular-nums">
                    {ov.balls.map((b, idx) => (
                      <span
                        key={`${ov.overNumber}-${idx}`}
                        className={`inline-flex items-center justify-center min-w-[24px] h-6 px-1 rounded text-[11px] font-bold ${
                          b.includes('W') && !b.startsWith('Wd')
                            ? 'bg-red-600 text-white'
                            : b === '4' || b === '6'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white border border-slate-200 text-slate-800'
                        }`}
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                  <div className="font-mono font-bold tabular-nums text-slate-900">
                    {ov.runsInOver} runs · {ov.cumulativeScore}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
