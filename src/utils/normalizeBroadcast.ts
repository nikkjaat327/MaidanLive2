import { LiveScoreData, LiveStreamData, NormalizedBroadcast } from '../types/index.ts';
import {
  CricketDetails,
  computeCricketChaseState,
  formatCricketOvers,
  getTotalExtras,
  normalizeCricketDetails,
} from './cricketScoring.ts';
import { KabaddiDetails, createInitialKabaddiDetails } from './kabaddiScoring.ts';
import { FootballDetails, createInitialFootballDetails } from './footballScoring.ts';
import { VolleyballDetails, createInitialVolleyballDetails } from './volleyballScoring.ts';

function shortCode(name: string, explicit?: string): string {
  if (explicit && explicit.trim()) return explicit.trim().toUpperCase().slice(0, 6);
  const words = (name || 'TM')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }
  return (words[0] || 'TM').slice(0, 3).toUpperCase();
}

export function normalizeBroadcast(
  stream: LiveStreamData,
  scoreOverride?: LiveScoreData | null
): NormalizedBroadcast {
  const score = scoreOverride !== undefined ? scoreOverride : stream.score || null;
  const sport = score?.sportType || stream.gameName || 'Other';
  const details = (score?.sportSpecificDetails || {}) as Record<string, any>;

  const teamAName = stream.teamAName || 'Team A';
  const teamBName = stream.teamBName || 'Team B';
  const title =
    stream.matchTitle ||
    (stream.teamAName && stream.teamBName
      ? `${stream.teamAName} vs ${stream.teamBName}`
      : stream.teamAName || stream.teamBName || 'MaidanLive Broadcast');

  const venueObj = typeof stream.venueId === 'object' && stream.venueId ? stream.venueId : null;
  const venueName = venueObj
    ? [venueObj.name, venueObj.city].filter(Boolean).join(', ')
    : stream.location || '';

  let teamAPrimary = String(score?.teamAScore ?? 0);
  let teamBPrimary = String(score?.teamBScore ?? 0);
  let teamASecondary = '';
  let teamBSecondary = '';
  let teamABadge = '';
  let teamBBadge = '';

  let statusLabel =
    stream.status === 'LIVE' ? 'LIVE' : stream.status === 'UPCOMING' ? 'UPCOMING' : 'FINAL';
  let timerOrClock = score?.matchStatus || '';
  let periodLabel: string = sport;
  const subStripItems: NormalizedBroadcast['subStripItems'] = [];

  if (sport === 'Cricket') {
    const cd = normalizeCricketDetails(details as Partial<CricketDetails>);
    const chase = computeCricketChaseState(cd, teamAName, teamBName);
    teamAPrimary = `${cd.teamARuns}/${cd.teamAWickets}`;
    teamBPrimary = `${cd.teamBRuns}/${cd.teamBWickets}`;
    teamASecondary = `${formatCricketOvers(cd.teamABalls)} ov`;
    teamBSecondary = `${formatCricketOvers(cd.teamBBalls)} ov`;
    if (stream.status === 'LIVE' && !chase.isInningsBreak && !chase.isMatchCompleted) {
      teamABadge = cd.battingTeam === 'A' ? 'BATTING' : '';
      teamBBadge = cd.battingTeam === 'B' ? 'BATTING' : '';
    }

    const activeExtras = cd.battingTeam === 'A' ? cd.extrasA : cd.extrasB;

    if (chase.isInningsBreak) {
      statusLabel = 'INNINGS BREAK';
      periodLabel = 'Innings Break';
      timerOrClock = `Target ${chase.target}`;
    } else if (chase.isMatchCompleted || (score?.resultStatus && score.resultStatus !== 'NOT_DECLARED')) {
      statusLabel = 'FINAL';
      periodLabel = `Innings ${cd.innings}`;
      timerOrClock = chase.winningMarginText || score?.resultDescription || 'Completed';
    } else {
      periodLabel = `Innings ${cd.innings}`;
      timerOrClock =
        cd.innings === 2 && chase.target > 0
          ? `Target ${chase.target}`
          : score?.matchStatus || `${cd.oversLimit} Ov Match`;
    }

    subStripItems.push({ label: 'CRR', value: chase.crr, accent: 'emerald' });
    if (chase.isInningsBreak && chase.target > 0) {
      subStripItems.push({
        label: 'Target',
        value: `${chase.target} (${cd.oversLimit} ov)`,
        accent: 'orange',
      });
    } else if (cd.innings === 2 && chase.target > 0 && !chase.isMatchCompleted) {
      subStripItems.push({
        label: 'Equation',
        value: `Need ${chase.runsRequired} in ${chase.ballsRemaining}b`,
        accent: 'orange',
      });
    } else if (chase.isMatchCompleted) {
      subStripItems.push({
        label: 'Result',
        value: chase.chaseSummaryText,
        accent: 'emerald',
      });
    }
    if (chase.rrr) {
      subStripItems.push({ label: 'RRR', value: chase.rrr, accent: 'orange' });
    }
    if (cd.batsman1 || cd.batsman2) {
      const battersDisplay = [cd.batsman1 ? `${cd.batsman1}*` : '', cd.batsman2]
        .filter(Boolean)
        .join(' & ');
      subStripItems.push({
        label: 'Batters',
        value: battersDisplay,
        accent: 'slate',
      });
    }
    if (cd.bowler) {
      subStripItems.push({ label: 'Bowler', value: cd.bowler, accent: 'slate' });
    }
    const totalExtras = getTotalExtras(activeExtras);
    if (totalExtras > 0) {
      subStripItems.push({ label: 'Extras', value: String(totalExtras), accent: 'slate' });
    }
    if (cd.isSuperOver) {
      subStripItems.push({
        label: 'Super Over',
        value: `${cd.superOverTeamARuns}/${cd.superOverTeamAWickets} vs ${cd.superOverTeamBRuns}/${cd.superOverTeamBWickets}`,
        accent: 'red',
      });
    }

    return {
      id: stream.id || stream._id || '',
      sourceType: stream.fixtureId ? 'match' : 'stream',
      sport,
      status: stream.status,
      title,
      tournamentName: stream.tournamentName || '',
      tournamentId: stream.tournamentId,
      roundName: stream.roundName || '',
      venueName,
      matchDate: stream.matchDate,
      activeProvider: stream.activeStreamingProvider || stream.streamingProvider || 'youtube',
      youtubeVideoId: stream.youtubeVideoId || '',
      replayVideoId: stream.replayVideoId || '',
      replayAvailable: Boolean(stream.replayAvailable),
      replayPublished: Boolean(stream.replayPublished),
      mediamtxPlaybackUrl: stream.mediamtxPlaybackUrl || '',
      mediamtxWebrtcUrl: stream.mediamtxWebrtcUrl || '',
      mediamtxPublishStatus: stream.mediamtxPublishStatus || 'IDLE',
      viewerCountVisibility: stream.viewerCountVisibility || 'public',
      activeViewers: typeof stream.activeViewers === 'number' ? stream.activeViewers : null,
      chatEnabled: stream.chatEnabled !== false,
      highlightsEnabled: stream.highlightsEnabled !== false,
      scoreboardVisibleByDefault: stream.scoreboardVisibleByDefault !== false,
      teamA: {
        id: stream.teamAId,
        name: teamAName,
        shortName: shortCode(teamAName, cd.teamAShortName),
        logoUrl: stream.teamALogo || '',
        primaryText: teamAPrimary,
        secondaryText: teamASecondary,
        badgeText: teamABadge,
      },
      teamB: {
        id: stream.teamBId,
        name: teamBName,
        shortName: shortCode(teamBName, cd.teamBShortName),
        logoUrl: stream.teamBLogo || '',
        primaryText: teamBPrimary,
        secondaryText: teamBSecondary,
        badgeText: teamBBadge,
      },
      centerMeta: {
        statusLabel,
        timerOrClock,
        periodLabel,
        isLive: stream.status === 'LIVE' && !chase.isMatchCompleted,
      },
      subStripItems,
      resultBannerText:
        score?.resultDescription ||
        score?.winnerTeamName ||
        (chase.isMatchCompleted ? chase.chaseSummaryText : ''),
      resultDeclared: Boolean(score?.resultStatus && score.resultStatus !== 'NOT_DECLARED'),
      winnerName: score?.winnerTeamName || '',
      mvpName: score?.mvpPlayerName || '',
      score,
      raw: stream,
    };
  }

  if (sport === 'Kabaddi') {
    const kd = { ...createInitialKabaddiDetails(), ...(details as Partial<KabaddiDetails>) };
    teamASecondary = `Raid ${kd.teamA.raidPoints} · Tackle ${kd.teamA.tacklePoints}`;
    teamBSecondary = `Raid ${kd.teamB.raidPoints} · Tackle ${kd.teamB.tacklePoints}`;
    if (kd.teamA.playersOut > 0) teamABadge = `${Math.max(0, 7 - kd.teamA.playersOut)} ON MAT`;
    if (kd.teamB.playersOut > 0) teamBBadge = `${Math.max(0, 7 - kd.teamB.playersOut)} ON MAT`;

    periodLabel = kd.half || '1st Half';
    timerOrClock = `${String(kd.timerMinutes).padStart(2, '0')}:${String(kd.timerSeconds).padStart(
      2,
      '0'
    )}`;

    if (kd.teamA.allOutPoints > 0 || kd.teamB.allOutPoints > 0) {
      subStripItems.push({
        label: 'All-Out Pts',
        value: `${kd.teamA.allOutPoints} - ${kd.teamB.allOutPoints}`,
        accent: 'orange',
      });
    }
    if (kd.teamA.bonusPoints > 0 || kd.teamB.bonusPoints > 0) {
      subStripItems.push({
        label: 'Bonus Pts',
        value: `${kd.teamA.bonusPoints} - ${kd.teamB.bonusPoints}`,
        accent: 'blue',
      });
    }
    if (kd.teamA.superTackles > 0 || kd.teamB.superTackles > 0) {
      subStripItems.push({
        label: 'Super Tackles',
        value: `${kd.teamA.superTackles} - ${kd.teamB.superTackles}`,
        accent: 'emerald',
      });
    }
    if (kd.superRaidNote) {
      subStripItems.push({ label: 'Highlight', value: kd.superRaidNote, accent: 'red' });
    }
    if (kd.isTieBreaker) {
      subStripItems.push({
        label: 'Tie-Breaker',
        value: `${kd.tieBreakerScoreA} - ${kd.tieBreakerScoreB}`,
        accent: 'orange',
      });
    }
  } else if (sport === 'Football') {
    const fd = { ...createInitialFootballDetails(), ...(details as Partial<FootballDetails>) };
    if (fd.teamAYellowCards > 0 || fd.teamARedCards > 0) {
      teamASecondary = `YC ${fd.teamAYellowCards} · RC ${fd.teamARedCards}`;
    }
    if (fd.teamBYellowCards > 0 || fd.teamBRedCards > 0) {
      teamBSecondary = `YC ${fd.teamBYellowCards} · RC ${fd.teamBRedCards}`;
    }
    periodLabel = fd.half || '1st Half';
    timerOrClock = `${String(fd.timerMinutes).padStart(2, '0')}:${String(fd.timerSeconds).padStart(
      2,
      '0'
    )}${fd.extraTimeMinutes > 0 ? ` +${fd.extraTimeMinutes}'` : ''}`;

    if (fd.teamAPenalties > 0 || fd.teamBPenalties > 0) {
      subStripItems.push({
        label: 'Penalties',
        value: `${fd.teamAPenalties} - ${fd.teamBPenalties}`,
        accent: 'orange',
      });
    }
    if (fd.extraTimeMinutes > 0) {
      subStripItems.push({
        label: 'Added Time',
        value: `+${fd.extraTimeMinutes} min`,
        accent: 'slate',
      });
    }
  } else if (sport === 'Volleyball') {
    const vd = { ...createInitialVolleyballDetails(), ...(details as Partial<VolleyballDetails>) };
    teamASecondary = `Sets: ${vd.teamASetsWon}`;
    teamBSecondary = `Sets: ${vd.teamBSetsWon}`;
    if (stream.status === 'LIVE') {
      teamABadge = vd.servingTeam === 'A' ? 'SERVING' : '';
      teamBBadge = vd.servingTeam === 'B' ? 'SERVING' : '';
    }
    periodLabel = `Set ${vd.currentSet} of ${vd.bestOfSets || 5}`;
    timerOrClock = `Sets ${vd.teamASetsWon}-${vd.teamBSetsWon}`;

    if (Array.isArray(vd.setScores)) {
      vd.setScores.forEach((s) => {
        subStripItems.push({
          label: `S${s.set}`,
          value: `${s.teamA}-${s.teamB}`,
          accent: s.set === vd.currentSet ? 'orange' : 'slate',
        });
      });
    }
  } else {
    periodLabel = typeof details.periodLabel === 'string' && details.periodLabel ? details.periodLabel : sport;
    timerOrClock = score?.matchStatus || '';
    if (typeof details.notes === 'string' && details.notes.trim()) {
      subStripItems.push({ label: 'Match Note', value: details.notes.trim(), accent: 'slate' });
    }
  }

  return {
    id: stream.id || stream._id || '',
    sourceType: stream.fixtureId ? 'match' : 'stream',
    sport,
    status: stream.status,
    title,
    tournamentName: stream.tournamentName || '',
    tournamentId: stream.tournamentId,
    roundName: stream.roundName || '',
    venueName,
    matchDate: stream.matchDate,
    activeProvider: stream.activeStreamingProvider || stream.streamingProvider || 'youtube',
    youtubeVideoId: stream.youtubeVideoId || '',
    replayVideoId: stream.replayVideoId || '',
    replayAvailable: Boolean(stream.replayAvailable),
    replayPublished: Boolean(stream.replayPublished),
    mediamtxPlaybackUrl: stream.mediamtxPlaybackUrl || '',
    mediamtxWebrtcUrl: stream.mediamtxWebrtcUrl || '',
    mediamtxPublishStatus: stream.mediamtxPublishStatus || 'IDLE',
    viewerCountVisibility: stream.viewerCountVisibility || 'public',
    activeViewers: typeof stream.activeViewers === 'number' ? stream.activeViewers : null,
    chatEnabled: stream.chatEnabled !== false,
    highlightsEnabled: stream.highlightsEnabled !== false,
    scoreboardVisibleByDefault: stream.scoreboardVisibleByDefault !== false,
    teamA: {
      id: stream.teamAId,
      name: teamAName,
      shortName: shortCode(teamAName),
      logoUrl: stream.teamALogo || '',
      primaryText: teamAPrimary,
      secondaryText: teamASecondary,
      badgeText: teamABadge,
    },
    teamB: {
      id: stream.teamBId,
      name: teamBName,
      shortName: shortCode(teamBName),
      logoUrl: stream.teamBLogo || '',
      primaryText: teamBPrimary,
      secondaryText: teamBSecondary,
      badgeText: teamBBadge,
    },
    centerMeta: {
      statusLabel,
      timerOrClock,
      periodLabel,
      isLive: stream.status === 'LIVE',
    },
    subStripItems,
    resultBannerText: score?.resultDescription || score?.winnerTeamName || '',
    resultDeclared: Boolean(score?.resultStatus && score.resultStatus !== 'NOT_DECLARED'),
    winnerName: score?.winnerTeamName || '',
    mvpName: score?.mvpPlayerName || '',
    score,
    raw: stream,
  };
}
