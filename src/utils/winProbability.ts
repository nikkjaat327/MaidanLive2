import { LiveScoreData } from '../types/index.ts';
import {
  CricketDetails,
  calculateCricketRunRate,
  computeCricketChaseState,
  getMaxWickets,
  normalizeCricketDetails,
} from './cricketScoring.ts';
import { normalizeKabaddiDetails } from './kabaddiScoring.ts';
import { createInitialFootballDetails, FootballDetails } from './footballScoring.ts';
import { normalizeVolleyballDetails } from './volleyballScoring.ts';

export interface WinProbabilityResult {
  sport: string;
  teamAName: string;
  teamBName: string;
  teamAPercent: number;
  teamBPercent: number;
  favoredSide: 'A' | 'B' | 'EVEN';
  favoredTeamName: string;
  basisSummary: string;
}

function logistic(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function clampLivePct(probA: number): { a: number; b: number } {
  const pctA = Math.min(97, Math.max(3, Math.round(probA * 100)));
  return { a: pctA, b: 100 - pctA };
}

function resolveFavored(
  a: number,
  b: number,
  teamAName: string,
  teamBName: string
): { favoredSide: 'A' | 'B' | 'EVEN'; favoredTeamName: string } {
  if (Math.abs(a - b) <= 2) {
    return { favoredSide: 'EVEN', favoredTeamName: 'Even' };
  }
  return a > b
    ? { favoredSide: 'A', favoredTeamName: teamAName }
    : { favoredSide: 'B', favoredTeamName: teamBName };
}

export function computeLiveWinProbability(params: {
  sportType?: string;
  teamAName?: string;
  teamBName?: string;
  score?: LiveScoreData | null;
}): WinProbabilityResult {
  const sport = params.score?.sportType || params.sportType || 'Other';
  const teamAName = params.teamAName?.trim() || 'Team A';
  const teamBName = params.teamBName?.trim() || 'Team B';
  const score = params.score ?? null;

  // Declared official result overrides probability
  if (score?.resultStatus && score.resultStatus !== 'NOT_DECLARED') {
    if (score.resultStatus === 'TIE' || score.resultStatus === 'DRAW') {
      return {
        sport,
        teamAName,
        teamBName,
        teamAPercent: 50,
        teamBPercent: 50,
        favoredSide: 'EVEN',
        favoredTeamName: 'Match Tied / Drawn',
        basisSummary: score.resultDescription || 'Official match result declared',
      };
    }
    const winName = (score.winnerTeamName || '').trim().toLowerCase();
    const isBWinner =
      score.resultType === 'TEAM_B_WON' ||
      (winName && winName === teamBName.toLowerCase());
    const a = isBWinner ? 0 : 100;
    const b = 100 - a;
    return {
      sport,
      teamAName,
      teamBName,
      teamAPercent: a,
      teamBPercent: b,
      favoredSide: isBWinner ? 'B' : 'A',
      favoredTeamName: isBWinner ? teamBName : teamAName,
      basisSummary: score.resultDescription || `${isBWinner ? teamBName : teamAName} won`,
    };
  }

  if (sport === 'Cricket') {
    const d = normalizeCricketDetails(
      (score?.sportSpecificDetails || {}) as Partial<CricketDetails>
    );
    const chase = computeCricketChaseState(d, teamAName, teamBName);
    const maxWkts = getMaxWickets(d);

    if (chase.isMatchCompleted) {
      if (chase.outcome === 'TIED') {
        return {
          sport,
          teamAName,
          teamBName,
          teamAPercent: 50,
          teamBPercent: 50,
          favoredSide: 'EVEN',
          favoredTeamName: 'Tied',
          basisSummary: chase.chaseSummaryText,
        };
      }
      const bWon = chase.winnerSide === 'B';
      return {
        sport,
        teamAName,
        teamBName,
        teamAPercent: bWon ? 0 : 100,
        teamBPercent: bWon ? 100 : 0,
        favoredSide: bWon ? 'B' : 'A',
        favoredTeamName: bWon ? teamBName : teamAName,
        basisSummary: chase.chaseSummaryText,
      };
    }

    if (chase.isSecondInnings || chase.isInningsBreak) {
      const chasingIsA = chase.battingTeam === 'A';
      const target = Math.max(1, chase.target);
      const runsNeeded = Math.max(0, chase.runsRequired);
      const ballsLeft = Math.max(0, chase.ballsRemaining);
      const wktsLeft = Math.max(0, maxWkts - chase.wicketsLost);

      if (runsNeeded <= 0) {
        return {
          sport,
          teamAName,
          teamBName,
          teamAPercent: chasingIsA ? 100 : 0,
          teamBPercent: chasingIsA ? 0 : 100,
          favoredSide: chasingIsA ? 'A' : 'B',
          favoredTeamName: chasingIsA ? teamAName : teamBName,
          basisSummary: 'Target reached',
        };
      }

      if (ballsLeft <= 0 || wktsLeft <= 0) {
        return {
          sport,
          teamAName,
          teamBName,
          teamAPercent: chasingIsA ? 0 : 100,
          teamBPercent: chasingIsA ? 100 : 0,
          favoredSide: chasingIsA ? 'B' : 'A',
          favoredTeamName: chasingIsA ? teamBName : teamAName,
          basisSummary: chase.chaseSummaryText,
        };
      }

      const parRpo = d.oversLimit <= 20 ? 8.0 : 5.5;
      const rrrNum = ballsLeft > 0 ? (runsNeeded * 6) / ballsLeft : 36;
      const crrNum =
        chase.ballsBowled > 0 ? (chase.runsScored * 6) / chase.ballsBowled : parRpo;
      const wicketsRatio = wktsLeft / Math.max(1, maxWkts);
      const targetScale = target / Math.max(1, d.oversLimit);

      // Positive z favors the chasing team
      const rrrPressure = (parRpo + (targetScale - parRpo) * 0.35 - rrrNum) * 0.34;
      const crrMomentum =
        chase.ballsBowled >= 6 ? (crrNum - rrrNum) * 0.14 : 0;
      const wicketsBonus = (wicketsRatio - 0.55) * 2.2;
      const smallChaseEase = runsNeeded <= 12 && wktsLeft >= 3 && ballsLeft >= 6 ? 0.9 : 0;

      const chasingProb = logistic(rrrPressure + crrMomentum + wicketsBonus + smallChaseEase);
      const probA = chasingIsA ? chasingProb : 1 - chasingProb;
      const { a, b } = clampLivePct(probA);
      const fav = resolveFavored(a, b, teamAName, teamBName);

      return {
        sport,
        teamAName,
        teamBName,
        teamAPercent: a,
        teamBPercent: b,
        ...fav,
        basisSummary: `${chase.isInningsBreak ? 'Innings Break' : '2nd Inn Chase'} · Need ${runsNeeded} off ${ballsLeft}b (${wktsLeft} wkts left)`,
      };
    }

    // 1st Innings win probability based on CRR vs par + wickets lost
    const battingIsA = d.battingTeam !== 'B';
    const runs = battingIsA ? d.teamARuns : d.teamBRuns;
    const balls = battingIsA ? d.teamABalls : d.teamBBalls;
    const wkts = battingIsA ? d.teamAWickets : d.teamBWickets;

    if (balls === 0 && runs === 0 && wkts === 0) {
      return {
        sport,
        teamAName,
        teamBName,
        teamAPercent: 50,
        teamBPercent: 50,
        favoredSide: 'EVEN',
        favoredTeamName: 'Even',
        basisSummary: '1st Innings · Match underway (0.0 ov)',
      };
    }

    const parRate = d.oversLimit <= 10 ? 8.5 : d.oversLimit <= 20 ? 7.6 : 5.6;
    const crr = Number(calculateCricketRunRate(runs, balls));
    const progress = Math.min(1, balls / Math.max(6, d.oversLimit * 6));
    const wicketPenalty = wkts * 0.45;
    const battingAdvantage = ((crr - parRate) * 0.25 - wicketPenalty * 0.55) * (0.45 + 0.55 * progress);

    const battingProb = logistic(battingAdvantage);
    const probA = battingIsA ? battingProb : 1 - battingProb;
    const { a, b } = clampLivePct(probA);
    const fav = resolveFavored(a, b, teamAName, teamBName);

    return {
      sport,
      teamAName,
      teamBName,
      teamAPercent: a,
      teamBPercent: b,
      ...fav,
      basisSummary: `1st Inn · CRR ${crr.toFixed(2)} vs ${parRate.toFixed(1)} par · ${wkts} wkt${wkts === 1 ? '' : 's'} lost`,
    };
  }

  if (sport === 'Kabaddi') {
    const kd = normalizeKabaddiDetails(score?.sportSpecificDetails);
    const ptsA = score?.teamAScore ?? 0;
    const ptsB = score?.teamBScore ?? 0;
    const diff = ptsA - ptsB;
    const courtDiff = (kd.playersOnCourtA || 7) - (kd.playersOnCourtB || 7);
    const halfWeight = kd.clock.halfNumber >= 2 ? 0.16 : 0.1;
    const probA = logistic(diff * halfWeight + courtDiff * 0.12);
    const { a, b } = diff === 0 && courtDiff === 0 ? { a: 50, b: 50 } : clampLivePct(probA);
    const fav = resolveFavored(a, b, teamAName, teamBName);
    return {
      sport,
      teamAName,
      teamBName,
      teamAPercent: a,
      teamBPercent: b,
      ...fav,
      basisSummary: `${kd.half} · Margin ${Math.abs(diff)} pts · Court ${kd.playersOnCourtA} vs ${kd.playersOnCourtB}`,
    };
  }

  if (sport === 'Football') {
    const fb: FootballDetails = {
      ...createInitialFootballDetails(),
      ...((score?.sportSpecificDetails || {}) as Partial<FootballDetails>),
    };
    const goalsA = score?.teamAScore ?? 0;
    const goalsB = score?.teamBScore ?? 0;
    const goalDiff = goalsA - goalsB;
    const redDiff = (fb.teamBRedCards || 0) - (fb.teamARedCards || 0);
    const timeFactor = 1 + Math.min(1.2, (fb.timerMinutes || 0) / 75);
    const probA = logistic(goalDiff * 1.15 * timeFactor + redDiff * 0.55);
    const { a, b } = goalDiff === 0 && redDiff === 0 ? { a: 50, b: 50 } : clampLivePct(probA);
    const fav = resolveFavored(a, b, teamAName, teamBName);
    return {
      sport,
      teamAName,
      teamBName,
      teamAPercent: a,
      teamBPercent: b,
      ...fav,
      basisSummary: `${fb.half} (${fb.timerMinutes}') · Score ${goalsA} - ${goalsB}`,
    };
  }

  if (sport === 'Volleyball') {
    const vb = normalizeVolleyballDetails(score?.sportSpecificDetails as any);
    const setDiff = vb.teamASetsWon - vb.teamBSetsWon;
    const ptsDiff = (score?.teamAScore ?? 0) - (score?.teamBScore ?? 0);
    const probA = logistic(setDiff * 1.35 + ptsDiff * 0.14);
    const { a, b } = setDiff === 0 && ptsDiff === 0 ? { a: 50, b: 50 } : clampLivePct(probA);
    const fav = resolveFavored(a, b, teamAName, teamBName);
    return {
      sport,
      teamAName,
      teamBName,
      teamAPercent: a,
      teamBPercent: b,
      ...fav,
      basisSummary: `Sets ${vb.teamASetsWon}-${vb.teamBSetsWon} · Current Set ${score?.teamAScore ?? 0}-${score?.teamBScore ?? 0}`,
    };
  }

  const ptsA = score?.teamAScore ?? 0;
  const ptsB = score?.teamBScore ?? 0;
  const diff = ptsA - ptsB;
  const probA = logistic(diff * 0.15);
  const { a, b } = diff === 0 ? { a: 50, b: 50 } : clampLivePct(probA);
  const fav = resolveFavored(a, b, teamAName, teamBName);

  return {
    sport,
    teamAName,
    teamBName,
    teamAPercent: a,
    teamBPercent: b,
    ...fav,
    basisSummary: `Score ${ptsA} - ${ptsB}`,
  };
}
