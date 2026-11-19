import type { LiveScoreData, ScoreHistoryItem } from '../types/index.ts';
import type { SportOption } from '../constants/sports.ts';

export interface MomentumPoint {
  index: number;
  label: string;
  timeLabel: string;
  timestamp: string;
  teamAScore: number;
  teamBScore: number;
  deltaA: number;
  deltaB: number;
  leadMargin: number;
  runRateA: number | null;
  runRateB: number | null;
  teamABalls: number;
  teamBBalls: number;
  teamAWickets: number;
  teamBWickets: number;
  isWicket: boolean;
  action: string;
}

export interface BurstBarPoint {
  label: string;
  teamADelta: number;
  teamBDelta: number;
  wickets: number;
  action: string;
  timeLabel: string;
}

export interface MomentumSummary {
  totalUpdates: number;
  leadTeam: 'A' | 'B' | 'TIED';
  leadValue: number;
  leadText: string;
  recentTeamAGain: number;
  recentTeamBGain: number;
  recentMomentumText: string;
  peakLeadA: number;
  peakLeadB: number;
  largestSingleBurst: number;
  largestBurstLabel: string;
  cricketCrr: string | null;
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function toNum(val: unknown, fallback = 0): number {
  return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
}

function computeRunRate(runs: number, balls: number): number | null {
  if (balls <= 0) return null;
  return Number(((runs / balls) * 6).toFixed(2));
}

export function buildMomentumTimeline(
  history: ScoreHistoryItem[],
  score: LiveScoreData | null
): MomentumPoint[] {
  if (!Array.isArray(history) || history.length === 0) {
    return [];
  }

  const scoreHistoryOnly = history.filter(
    (item) => !item.entryType || item.entryType === 'SCORE_UPDATE'
  );
  if (scoreHistoryOnly.length === 0) {
    return [];
  }

  // If the scoreboard was reset during the session, visualize the active post-reset match
  const resetIdx = scoreHistoryOnly.findIndex((item) =>
    item.action.toLowerCase().includes('scoreboard reset to zero')
  );
  const activeHistoryNewestFirst =
    resetIdx >= 0 ? scoreHistoryOnly.slice(0, resetIdx) : scoreHistoryOnly;

  if (activeHistoryNewestFirst.length === 0) {
    return [];
  }

  // Convert to chronological order (oldest -> newest)
  const chronological = [...activeHistoryNewestFirst].reverse();
  const points: MomentumPoint[] = [];

  const firstPrev = chronological[0].previousScore || {};
  const firstPrevDetails = (firstPrev.sportSpecificDetails || {}) as Record<string, unknown>;
  const startBallsA = toNum(firstPrevDetails.teamABalls);
  const startBallsB = toNum(firstPrevDetails.teamBBalls);
  const startScoreA = toNum(firstPrev.teamAScore);
  const startScoreB = toNum(firstPrev.teamBScore);

  points.push({
    index: 0,
    label: 'Start',
    timeLabel: formatClock(chronological[0].createdAt),
    timestamp: chronological[0].createdAt,
    teamAScore: startScoreA,
    teamBScore: startScoreB,
    deltaA: 0,
    deltaB: 0,
    leadMargin: startScoreA - startScoreB,
    runRateA: computeRunRate(startScoreA, startBallsA),
    runRateB: computeRunRate(startScoreB, startBallsB),
    teamABalls: startBallsA,
    teamBBalls: startBallsB,
    teamAWickets: toNum(firstPrevDetails.teamAWickets),
    teamBWickets: toNum(firstPrevDetails.teamBWickets),
    isWicket: false,
    action: 'Match baseline',
  });

  chronological.forEach((item, idx) => {
    const prev = item.previousScore || {};
    const next = item.updatedScore || {};
    const prevDetails = (prev.sportSpecificDetails || {}) as Record<string, unknown>;
    const nextDetails = (next.sportSpecificDetails || {}) as Record<string, unknown>;

    const prevA = toNum(prev.teamAScore);
    const prevB = toNum(prev.teamBScore);
    const nextA = toNum(next.teamAScore);
    const nextB = toNum(next.teamBScore);

    const prevWicketsA = toNum(prevDetails.teamAWickets);
    const prevWicketsB = toNum(prevDetails.teamBWickets);
    const nextWicketsA = toNum(nextDetails.teamAWickets);
    const nextWicketsB = toNum(nextDetails.teamBWickets);

    const ballsA = toNum(nextDetails.teamABalls);
    const ballsB = toNum(nextDetails.teamBBalls);

    const isWicket =
      nextWicketsA > prevWicketsA ||
      nextWicketsB > prevWicketsB ||
      item.action.toLowerCase().includes('wicket');

    points.push({
      index: idx + 1,
      label: `#${idx + 1}`,
      timeLabel: formatClock(item.createdAt),
      timestamp: item.createdAt,
      teamAScore: nextA,
      teamBScore: nextB,
      deltaA: nextA - prevA,
      deltaB: nextB - prevB,
      leadMargin: nextA - nextB,
      runRateA: computeRunRate(nextA, ballsA),
      runRateB: computeRunRate(nextB, ballsB),
      teamABalls: ballsA,
      teamBBalls: ballsB,
      teamAWickets: nextWicketsA,
      teamBWickets: nextWicketsB,
      isWicket,
      action: item.action,
    });
  });

  // Ensure the final point reflects the live score if a silent sync happened
  if (score && points.length > 0) {
    const last = points[points.length - 1];
    if (last.teamAScore !== score.teamAScore || last.teamBScore !== score.teamBScore) {
      const details = (score.sportSpecificDetails || {}) as Record<string, unknown>;
      const ballsA = toNum(details.teamABalls);
      const ballsB = toNum(details.teamBBalls);
      points.push({
        index: points.length,
        label: `#${points.length}`,
        timeLabel: formatClock(score.lastUpdatedAt),
        timestamp: score.lastUpdatedAt,
        teamAScore: score.teamAScore,
        teamBScore: score.teamBScore,
        deltaA: score.teamAScore - last.teamAScore,
        deltaB: score.teamBScore - last.teamBScore,
        leadMargin: score.teamAScore - score.teamBScore,
        runRateA: computeRunRate(score.teamAScore, ballsA),
        runRateB: computeRunRate(score.teamBScore, ballsB),
        teamABalls: ballsA,
        teamBBalls: ballsB,
        teamAWickets: toNum(details.teamAWickets),
        teamBWickets: toNum(details.teamBWickets),
        isWicket: false,
        action: 'Live scoreboard state',
      });
    }
  }

  return points;
}

export function buildBurstSeries(
  timeline: MomentumPoint[],
  sportType: SportOption
): { mode: 'overs' | 'events'; data: BurstBarPoint[] } {
  const updates = timeline.slice(1);
  if (updates.length === 0) {
    return { mode: 'events', data: [] };
  }

  if (sportType === 'Cricket') {
    const hasBallProgression = updates.some((p) => p.teamABalls > 0 || p.teamBBalls > 0);
    if (hasBallProgression) {
      const overMap = new Map<string, BurstBarPoint>();

      for (const point of updates) {
        const activeTeamIsA = point.deltaA > 0 || (point.deltaB === 0 && point.teamABalls >= point.teamBBalls);
        const activeBalls = activeTeamIsA ? point.teamABalls : point.teamBBalls;
        const overNum = activeBalls > 0 ? Math.floor((activeBalls - 1) / 6) + 1 : 1;
        const key = `Ov ${overNum}`;

        const existing = overMap.get(key) || {
          label: key,
          teamADelta: 0,
          teamBDelta: 0,
          wickets: 0,
          action: `Over ${overNum} summary`,
          timeLabel: point.timeLabel,
        };

        existing.teamADelta += Math.max(0, point.deltaA);
        existing.teamBDelta += Math.max(0, point.deltaB);
        if (point.isWicket) existing.wickets += 1;
        existing.timeLabel = point.timeLabel;
        overMap.set(key, existing);
      }

      const overs = Array.from(overMap.values());
      if (overs.length > 0) {
        return { mode: 'overs', data: overs.slice(-16) };
      }
    }
  }

  // Default: per-event scoring bursts (last 20 scoring updates)
  const eventBars: BurstBarPoint[] = updates.slice(-20).map((point) => ({
    label: point.label,
    teamADelta: point.deltaA,
    teamBDelta: point.deltaB,
    wickets: point.isWicket ? 1 : 0,
    action: point.action,
    timeLabel: point.timeLabel,
  }));

  return { mode: 'events', data: eventBars };
}

export function computeMomentumSummary(
  timeline: MomentumPoint[],
  score: LiveScoreData | null,
  teamAName: string,
  teamBName: string
): MomentumSummary {
  const updates = timeline.slice(1);
  const currentA = score?.teamAScore ?? timeline[timeline.length - 1]?.teamAScore ?? 0;
  const currentB = score?.teamBScore ?? timeline[timeline.length - 1]?.teamBScore ?? 0;

  const diff = currentA - currentB;
  const leadTeam: 'A' | 'B' | 'TIED' = diff > 0 ? 'A' : diff < 0 ? 'B' : 'TIED';
  const leadValue = Math.abs(diff);
  const leadText =
    leadTeam === 'TIED'
      ? 'Scores Level'
      : `${leadTeam === 'A' ? teamAName : teamBName} +${leadValue}`;

  const recentWindow = updates.slice(-5);
  const recentTeamAGain = recentWindow.reduce((sum, p) => sum + p.deltaA, 0);
  const recentTeamBGain = recentWindow.reduce((sum, p) => sum + p.deltaB, 0);

  let recentMomentumText = 'Even Run';
  if (recentTeamAGain > recentTeamBGain) {
    recentMomentumText = `${teamAName} +${recentTeamAGain} vs +${recentTeamBGain}`;
  } else if (recentTeamBGain > recentTeamAGain) {
    recentMomentumText = `${teamBName} +${recentTeamBGain} vs +${recentTeamAGain}`;
  } else if (recentWindow.length > 0) {
    recentMomentumText = `Even (+${recentTeamAGain} each)`;
  }

  let peakLeadA = 0;
  let peakLeadB = 0;
  let largestSingleBurst = 0;
  let largestBurstLabel = 'None yet';

  for (const point of timeline) {
    if (point.leadMargin > peakLeadA) peakLeadA = point.leadMargin;
    if (point.leadMargin < 0 && Math.abs(point.leadMargin) > peakLeadB) {
      peakLeadB = Math.abs(point.leadMargin);
    }
    if (point.deltaA > largestSingleBurst) {
      largestSingleBurst = point.deltaA;
      largestBurstLabel = `${teamAName} (+${point.deltaA})`;
    }
    if (point.deltaB > largestSingleBurst) {
      largestSingleBurst = point.deltaB;
      largestBurstLabel = `${teamBName} (+${point.deltaB})`;
    }
  }

  let cricketCrr: string | null = null;
  if (score?.sportType === 'Cricket') {
    const details = (score.sportSpecificDetails || {}) as Record<string, unknown>;
    const battingTeam = details.battingTeam === 'B' ? 'B' : 'A';
    const runs = battingTeam === 'A' ? toNum(details.teamARuns) : toNum(details.teamBRuns);
    const balls = battingTeam === 'A' ? toNum(details.teamABalls) : toNum(details.teamBBalls);
    const crr = computeRunRate(runs, balls);
    if (crr !== null) {
      cricketCrr = `${crr.toFixed(2)} RPO`;
    }
  }

  return {
    totalUpdates: updates.length,
    leadTeam,
    leadValue,
    leadText,
    recentTeamAGain,
    recentTeamBGain,
    recentMomentumText,
    peakLeadA,
    peakLeadB,
    largestSingleBurst,
    largestBurstLabel,
    cricketCrr,
  };
}
