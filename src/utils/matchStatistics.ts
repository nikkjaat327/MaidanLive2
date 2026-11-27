import { LiveScoreData, ScoreHistoryItem } from '../types/index.ts';
import {
  CricketDetails,
  calculateCricketRunRate,
  computeCricketChaseState,
  formatCricketOvers,
  getTotalExtras,
  normalizeCricketDetails,
} from './cricketScoring.ts';
import { normalizeKabaddiDetails } from './kabaddiScoring.ts';
import { createInitialFootballDetails, FootballDetails } from './footballScoring.ts';
import { normalizeVolleyballDetails } from './volleyballScoring.ts';

export interface MatchStatisticItem {
  id: string;
  label: string;
  value: string;
  sublabel: string;
  highlight?: boolean;
}

export interface MatchTeamCumulativeRow {
  side: 'A' | 'B';
  teamName: string;
  primaryMetric: string;
  detailText: string;
  active?: boolean;
}

export interface MatchStatisticsSummary {
  sport: string;
  headerBadge: string;
  items: MatchStatisticItem[];
  teamBreakdown: MatchTeamCumulativeRow[];
}

export function deriveMatchStatisticsSummary(params: {
  sportType?: string;
  teamAName?: string;
  teamBName?: string;
  score?: LiveScoreData | null;
  history?: ScoreHistoryItem[];
}): MatchStatisticsSummary {
  const sport = params.score?.sportType || params.sportType || 'Other';
  const teamA = params.teamAName?.trim() || 'Team A';
  const teamB = params.teamBName?.trim() || 'Team B';
  const score = params.score ?? null;
  const history = Array.isArray(params.history) ? params.history : [];

  if (sport === 'Cricket') {
    const d = normalizeCricketDetails(
      (score?.sportSpecificDetails || {}) as Partial<CricketDetails>
    );
    const chase = computeCricketChaseState(d, teamA, teamB);
    const isBattingB = d.battingTeam === 'B';

    const runsA = Number(d.teamARuns ?? score?.teamAScore ?? 0);
    const runsB = Number(d.teamBRuns ?? score?.teamBScore ?? 0);
    const wktsA = Number(d.teamAWickets ?? 0);
    const wktsB = Number(d.teamBWickets ?? 0);
    const ballsA = Number(d.teamABalls ?? 0);
    const ballsB = Number(d.teamBBalls ?? 0);

    const activeRuns = isBattingB ? runsB : runsA;
    const activeBalls = isBattingB ? ballsB : ballsA;
    const activeWkts = isBattingB ? wktsB : wktsA;
    const activeTeam = isBattingB ? teamB : teamA;

    const currentRunRate = calculateCricketRunRate(activeRuns, activeBalls);
    const runRateA = calculateCricketRunRate(runsA, ballsA);
    const runRateB = calculateCricketRunRate(runsB, ballsB);

    const totalRuns = runsA + runsB;
    const totalWickets = wktsA + wktsB;
    const totalBalls = ballsA + ballsB;

    const exWides = (d.extrasA.wides || 0) + (d.extrasB.wides || 0);
    const exNoBalls = (d.extrasA.noBalls || 0) + (d.extrasB.noBalls || 0);
    const exByes = (d.extrasA.byes || 0) + (d.extrasB.byes || 0);
    const exLegByes = (d.extrasA.legByes || 0) + (d.extrasB.legByes || 0);
    const exPenalty = (d.extrasA.penaltyRuns || 0) + (d.extrasB.penaltyRuns || 0);
    const totalExtrasA = getTotalExtras(d.extrasA);
    const totalExtrasB = getTotalExtras(d.extrasB);
    const totalExtras = totalExtrasA + totalExtrasB;

    let fours = 0;
    let sixes = 0;
    let dotBalls = 0;

    if (d.deliveryHistory.length > 0) {
      for (const del of d.deliveryHistory) {
        if (del.batRuns === 4) fours += 1;
        else if (del.batRuns === 6) sixes += 1;
        const isLegal = del.isLegal !== false && del.extraType !== 'WIDE' && del.extraType !== 'NO_BALL';
        if (isLegal && (del.totalAdded ?? del.batRuns + del.extraRuns) === 0 && !del.isWicket) {
          dotBalls += 1;
        }
      }
    } else {
      for (const h of history) {
        if (h.reverted || h.entryType !== 'SCORE_UPDATE') continue;
        const det = (h.details || {}) as Record<string, unknown>;
        const ev = String(h.eventType || '').toUpperCase();
        const batRuns =
          det.type === 'RUNS'
            ? Number(det.runs ?? 0)
            : Number(det.batRuns ?? h.pointsAwarded ?? 0);
        if (ev === 'FOUR' || batRuns === 4) fours += 1;
        else if (ev === 'SIX' || batRuns === 6) sixes += 1;
        else if (
          ev === 'LEGAL_DELIVERY' &&
          Number(h.pointsAwarded ?? 0) === 0 &&
          !det.isWicket
        ) {
          dotBalls += 1;
        }
      }
    }

    const boundaryRuns = fours * 4 + sixes * 6;
    const projectedRuns =
      activeBalls > 0 && d.oversLimit > 0
        ? Math.round((activeRuns / activeBalls) * (d.oversLimit * 6))
        : 0;

    const extrasParts: string[] = [];
    if (exWides > 0) extrasParts.push(`Wd ${exWides}`);
    if (exNoBalls > 0) extrasParts.push(`Nb ${exNoBalls}`);
    if (exByes > 0) extrasParts.push(`B ${exByes}`);
    if (exLegByes > 0) extrasParts.push(`Lb ${exLegByes}`);
    if (exPenalty > 0) extrasParts.push(`Pen ${exPenalty}`);

    const items: MatchStatisticItem[] = [
      {
        id: 'crr',
        label: 'Current Run Rate',
        value: currentRunRate,
        sublabel:
          chase.isSecondInnings && !chase.isMatchCompleted && chase.rrr
            ? `Req RR ${chase.rrr}`
            : `${activeTeam} · ${activeRuns}/${activeWkts}`,
        highlight: true,
      },
      {
        id: 'extras',
        label: 'Total Extras',
        value: String(totalExtras),
        sublabel:
          extrasParts.length > 0 ? extrasParts.join(' · ') : 'Wd 0 · Nb 0 · B 0 · Lb 0',
      },
      {
        id: 'wickets',
        label: 'Total Wickets',
        value: String(totalWickets),
        sublabel: `${teamA} ${wktsA} · ${teamB} ${wktsB}`,
      },
      {
        id: 'total-runs',
        label: 'Cumulative Runs',
        value: String(totalRuns),
        sublabel: `${formatCricketOvers(totalBalls)} total ov bowled`,
      },
      {
        id: 'boundaries',
        label: 'Boundaries',
        value: `${fours + sixes}`,
        sublabel: `4s: ${fours} · 6s: ${sixes} (${boundaryRuns} runs)`,
      },
      {
        id: 'dots-or-proj',
        label: chase.isSecondInnings ? 'Chase Target' : 'Dot Balls',
        value: chase.isSecondInnings
          ? String(chase.target)
          : String(dotBalls),
        sublabel: chase.isSecondInnings
          ? chase.isMatchCompleted
            ? chase.chaseSummaryText
            : `Need ${chase.runsRequired} in ${chase.ballsRemaining}b`
          : projectedRuns > 0
            ? `Proj (${d.oversLimit} ov): ${projectedRuns}`
            : `${d.oversLimit} ov format`,
      },
    ];

    return {
      sport: 'Cricket',
      headerBadge: `Innings ${d.innings} · ${d.oversLimit} Overs`,
      items,
      teamBreakdown: [
        {
          side: 'A',
          teamName: teamA,
          primaryMetric: `${runsA}/${wktsA}`,
          detailText: `${formatCricketOvers(ballsA)} ov · RR ${runRateA} · Ext ${totalExtrasA}`,
          active: d.battingTeam === 'A' && !chase.isMatchCompleted && !chase.isInningsBreak,
        },
        {
          side: 'B',
          teamName: teamB,
          primaryMetric: `${runsB}/${wktsB}`,
          detailText: `${formatCricketOvers(ballsB)} ov · RR ${runRateB} · Ext ${totalExtrasB}`,
          active: d.battingTeam === 'B' && !chase.isMatchCompleted && !chase.isInningsBreak,
        },
      ],
    };
  }

  if (sport === 'Kabaddi') {
    const kd = normalizeKabaddiDetails(score?.sportSpecificDetails);
    const ptsA = score?.teamAScore ?? 0;
    const ptsB = score?.teamBScore ?? 0;
    const raidA = kd.teamA.raidPoints || 0;
    const raidB = kd.teamB.raidPoints || 0;
    const tackleA = kd.teamA.tacklePoints || 0;
    const tackleB = kd.teamB.tacklePoints || 0;
    const bonusA = kd.teamA.bonusPoints || 0;
    const bonusB = kd.teamB.bonusPoints || 0;
    const allOutA = kd.teamA.allOutsInflicted ?? Math.floor((kd.teamA.allOutPoints || 0) / 2);
    const allOutB = kd.teamB.allOutsInflicted ?? Math.floor((kd.teamB.allOutPoints || 0) / 2);
    const superRaids = (kd.teamA.superRaids || 0) + (kd.teamB.superRaids || 0);
    const superTackles = (kd.teamA.superTackles || 0) + (kd.teamB.superTackles || 0);

    return {
      sport: 'Kabaddi',
      headerBadge: `${kd.half} · Total ${ptsA + ptsB} pts`,
      items: [
        {
          id: 'total-pts',
          label: 'Total Match Points',
          value: String(ptsA + ptsB),
          sublabel: `${teamA} ${ptsA} · ${teamB} ${ptsB}`,
          highlight: true,
        },
        {
          id: 'raid-pts',
          label: 'Raid Points',
          value: String(raidA + raidB),
          sublabel: `${raidA} - ${raidB}`,
        },
        {
          id: 'tackle-pts',
          label: 'Tackle Points',
          value: String(tackleA + tackleB),
          sublabel: `${tackleA} - ${tackleB}`,
        },
        {
          id: 'bonus-pts',
          label: 'Bonus Points',
          value: String(bonusA + bonusB),
          sublabel: `${bonusA} - ${bonusB}`,
        },
        {
          id: 'all-outs',
          label: 'All-Outs',
          value: String(allOutA + allOutB),
          sublabel: `${allOutA} - ${allOutB}`,
        },
        {
          id: 'super-plays',
          label: 'Super Plays',
          value: String(superRaids + superTackles),
          sublabel: `SR ${superRaids} · ST ${superTackles}`,
        },
      ],
      teamBreakdown: [
        {
          side: 'A',
          teamName: teamA,
          primaryMetric: `${ptsA} pts`,
          detailText: `Raid ${raidA} · Tackle ${tackleA} · All-Out ${allOutA}`,
        },
        {
          side: 'B',
          teamName: teamB,
          primaryMetric: `${ptsB} pts`,
          detailText: `Raid ${raidB} · Tackle ${tackleB} · All-Out ${allOutB}`,
        },
      ],
    };
  }

  if (sport === 'Football') {
    const baseFb = createInitialFootballDetails();
    const rawFb = (score?.sportSpecificDetails || {}) as Partial<FootballDetails>;
    const fb: FootballDetails = { ...baseFb, ...rawFb, events: Array.isArray(rawFb.events) ? rawFb.events : [] };
    const goalsA = score?.teamAScore ?? 0;
    const goalsB = score?.teamBScore ?? 0;
    const totalYellows = (fb.teamAYellowCards || 0) + (fb.teamBYellowCards || 0);
    const totalReds = (fb.teamARedCards || 0) + (fb.teamBRedCards || 0);
    const totalFouls = (fb.teamAFouls || 0) + (fb.teamBFouls || 0);
    const totalSubs = fb.events.filter((e) => e.eventType === 'SUBSTITUTION').length;

    return {
      sport: 'Football',
      headerBadge: `${fb.half} · ${String(fb.timerMinutes).padStart(2, '0')}:${String(fb.timerSeconds).padStart(2, '0')}`,
      items: [
        {
          id: 'goals',
          label: 'Total Goals',
          value: String(goalsA + goalsB),
          sublabel: `${teamA} ${goalsA} · ${teamB} ${goalsB}`,
          highlight: true,
        },
        {
          id: 'cards',
          label: 'Cards Issued',
          value: String(totalYellows + totalReds),
          sublabel: `Yellow ${totalYellows} · Red ${totalReds}`,
        },
        {
          id: 'fouls',
          label: 'Total Fouls',
          value: String(totalFouls),
          sublabel: `${fb.teamAFouls || 0} - ${fb.teamBFouls || 0}`,
        },
        {
          id: 'subs',
          label: 'Substitutions',
          value: String(totalSubs),
          sublabel: `${fb.events.length} match events`,
        },
      ],
      teamBreakdown: [
        {
          side: 'A',
          teamName: teamA,
          primaryMetric: `${goalsA}`,
          detailText: `YC ${fb.teamAYellowCards || 0} · RC ${fb.teamARedCards || 0} · Fouls ${fb.teamAFouls || 0}`,
        },
        {
          side: 'B',
          teamName: teamB,
          primaryMetric: `${goalsB}`,
          detailText: `YC ${fb.teamBYellowCards || 0} · RC ${fb.teamBRedCards || 0} · Fouls ${fb.teamBFouls || 0}`,
        },
      ],
    };
  }

  if (sport === 'Volleyball') {
    const vb = normalizeVolleyballDetails(score?.sportSpecificDetails as any);
    const totalSetPointsA = vb.setScores.reduce((sum, s) => {
      const pts =
        s.set === vb.currentSet && !s.winner
          ? Math.max(s.teamA || 0, score?.teamAScore ?? 0)
          : s.teamA || 0;
      return sum + pts;
    }, 0);
    const totalSetPointsB = vb.setScores.reduce((sum, s) => {
      const pts =
        s.set === vb.currentSet && !s.winner
          ? Math.max(s.teamB || 0, score?.teamBScore ?? 0)
          : s.teamB || 0;
      return sum + pts;
    }, 0);
    const completedSets = vb.setScores.filter((s) => Boolean(s.winner)).length;
    const targetPoints =
      vb.currentSet >= vb.bestOfSets ? vb.rules.finalSetPoints : vb.rules.pointsPerSet;

    return {
      sport: 'Volleyball',
      headerBadge: `Set ${vb.currentSet} of ${vb.bestOfSets}`,
      items: [
        {
          id: 'sets-won',
          label: 'Sets Score',
          value: `${vb.teamASetsWon} - ${vb.teamBSetsWon}`,
          sublabel: `${completedSets} sets completed`,
          highlight: true,
        },
        {
          id: 'rally-pts',
          label: 'Cumulative Points',
          value: String(totalSetPointsA + totalSetPointsB),
          sublabel: `${teamA} ${totalSetPointsA} · ${teamB} ${totalSetPointsB}`,
        },
        {
          id: 'current-set',
          label: `Set ${vb.currentSet} Score`,
          value: `${score?.teamAScore ?? 0} - ${score?.teamBScore ?? 0}`,
          sublabel: `Target ${targetPoints} pts`,
        },
        {
          id: 'point-diff',
          label: 'Point Differential',
          value:
            totalSetPointsA === totalSetPointsB
              ? '0'
              : totalSetPointsA > totalSetPointsB
                ? `+${totalSetPointsA - totalSetPointsB}`
                : `+${totalSetPointsB - totalSetPointsA}`,
          sublabel:
            totalSetPointsA === totalSetPointsB
              ? 'Even overall'
              : totalSetPointsA > totalSetPointsB
                ? `${teamA} ahead`
                : `${teamB} ahead`,
        },
      ],
      teamBreakdown: [
        {
          side: 'A',
          teamName: teamA,
          primaryMetric: `${vb.teamASetsWon} sets`,
          detailText: `${totalSetPointsA} total points`,
        },
        {
          side: 'B',
          teamName: teamB,
          primaryMetric: `${vb.teamBSetsWon} sets`,
          detailText: `${totalSetPointsB} total points`,
        },
      ],
    };
  }

  const ptsA = score?.teamAScore ?? 0;
  const ptsB = score?.teamBScore ?? 0;
  const validEvents = history.filter((h) => !h.reverted && h.entryType === 'SCORE_UPDATE');
  const subsCount = validEvents.filter(
    (h) => String(h.eventCategory || h.eventType || '').toUpperCase().includes('SUBSTITUT')
  ).length;
  const diff = Math.abs(ptsA - ptsB);

  return {
    sport,
    headerBadge: score?.matchStatus || 'Live',
    items: [
      {
        id: 'total-score',
        label: 'Cumulative Score',
        value: String(ptsA + ptsB),
        sublabel: `${teamA} ${ptsA} · ${teamB} ${ptsB}`,
        highlight: true,
      },
      {
        id: 'margin',
        label: 'Score Margin',
        value: String(diff),
        sublabel:
          ptsA === ptsB ? 'Tied' : ptsA > ptsB ? `${teamA} leads` : `${teamB} leads`,
      },
      {
        id: 'events',
        label: 'Scoring Events',
        value: String(validEvents.length),
        sublabel: `${subsCount} substitutions`,
      },
    ],
    teamBreakdown: [
      {
        side: 'A',
        teamName: teamA,
        primaryMetric: `${ptsA}`,
        detailText: `${validEvents.filter((h) => h.teamSide === 'A').length} logged plays`,
      },
      {
        side: 'B',
        teamName: teamB,
        primaryMetric: `${ptsB}`,
        detailText: `${validEvents.filter((h) => h.teamSide === 'B').length} logged plays`,
      },
    ],
  };
}
