import type { ReactNode } from 'react';
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../../types/index.ts';
import {
  computeCricketChaseState,
  formatCricketOvers,
  getMaxWickets,
  normalizeCricketDetails,
} from '../../utils/cricketScoring.ts';
import { computeEffectiveKabaddiClock, normalizeKabaddiDetails } from '../../utils/kabaddiScoring.ts';
import { createInitialFootballDetails, type FootballDetails } from '../../utils/footballScoring.ts';
import { normalizeVolleyballDetails } from '../../utils/volleyballScoring.ts';
import { deriveShortTeamName } from '../../utils/matchResultValidation.ts';
import { resolveMatchStatus } from '../../utils/matchStatus.ts';
import type { ObsThemeTokens } from './obsTheme.ts';

export type ScoreboardSportKind = 'Cricket' | 'Kabaddi' | 'Football' | 'Volleyball' | 'Other';

export interface ScoreboardViewModel {
  sport: ScoreboardSportKind;
  sportLabel: string;
  tournamentName: string;
  // Team A (or Batting team for Cricket)
  primaryShort: string;
  primaryName: string;
  primaryLogo?: string;
  primaryAccent: string;
  primaryScore: string;
  primarySub: string;
  primaryServing?: boolean;
  // Team B (or Bowling/Opponent team for Cricket)
  secondaryShort: string;
  secondaryName: string;
  secondaryLogo?: string;
  secondaryAccent: string;
  secondaryScore: string;
  secondarySub: string;
  secondaryServing?: boolean;
  // Center / match clock & status
  centerPrimary: string;
  centerSecondary: string;
  statusPillLabel: string;
  statusPillVariant: 'live' | 'break' | 'warning' | 'final' | 'upcoming';
  showLiveDot: boolean;
  resultDeclared: boolean;
  isCricket: boolean;
  // Cricket / Telemetry chips
  situationBanner: string;
  situationAccent: 'chase' | 'break' | 'result' | 'warning' | 'info';
  statChips: Array<{ label: string; value: string; accent?: 'primary' | 'secondary' | 'normal' }>;
  battersText: string;
  bowlerText: string;
  leftStatsText?: string;
  rightStatsText?: string;
  recentBalls: string[];
  footerNote: string;
  mvpPlayerName: string;
  pulseKeySeed: string;
  // Raw Kabaddi details when applicable for KabaddiAnimations banner
  kabaddiBannerData: {
    streamId: string;
    teamAName: string;
    teamBName: string;
    d: ReturnType<typeof normalizeKabaddiDetails>;
    effClock: ReturnType<typeof computeEffectiveKabaddiClock>;
  } | null;
  customSlot?: ReactNode;
}

const FOOTBALL_HALF_ABBR: Record<FootballDetails['half'], string> = {
  '1st Half': '1H',
  'Half Time': 'HT',
  '2nd Half': '2H',
  'Extra Time': 'ET',
  Penalties: 'PEN',
  'Full Time': 'FT',
};

export function buildScoreboardViewModel(
  stream: LiveStreamData,
  score: LiveScoreData | null,
  config: BroadcastOverlayConfig,
  theme: ObsThemeTokens,
  nowMs: number
): ScoreboardViewModel {
  const rawSport = (score?.sportType || stream.gameName || 'Other') as ScoreboardSportKind;
  const sport: ScoreboardSportKind =
    rawSport === 'Cricket' ||
    rawSport === 'Kabaddi' ||
    rawSport === 'Football' ||
    rawSport === 'Volleyball'
      ? rawSport
      : 'Other';

  const nameA = stream.teamAName || 'Team A';
  const nameB = stream.teamBName || 'Team B';
  const shortA = deriveShortTeamName(nameA, 'TMA');
  const shortB = deriveShortTeamName(nameB, 'TMB');
  const stdStatus = resolveMatchStatus(stream, score);
  const resultDeclared = Boolean(score?.resultStatus && score.resultStatus !== 'NOT_DECLARED');
  const tournamentName = config.showTournamentName ? stream.tournamentName || '' : '';

  if (sport === 'Cricket') {
    const details = normalizeCricketDetails((score?.sportSpecificDetails || {}) as Record<string, unknown>);
    const cShortA = details.teamAShortName || shortA;
    const cShortB = details.teamBShortName || shortB;
    const chase = computeCricketChaseState(details, nameA, nameB);
    const isBattingA = details.battingTeam === 'A';

    const batShort = isBattingA ? cShortA : cShortB;
    const batName = isBattingA ? nameA : nameB;
    const batLogo = isBattingA ? stream.teamALogo : stream.teamBLogo;
    const batAccent = isBattingA ? config.teamAColor : config.teamBColor;

    const bowlShort = isBattingA ? cShortB : cShortA;
    const bowlName = isBattingA ? nameB : nameA;
    const bowlLogo = isBattingA ? stream.teamBLogo : stream.teamALogo;
    const bowlAccent = isBattingA ? config.teamBColor : config.teamAColor;

    const runs = isBattingA ? details.teamARuns : details.teamBRuns;
    const wickets = isBattingA ? details.teamAWickets : details.teamBWickets;
    const balls = isBattingA ? details.teamABalls : details.teamBBalls;

    const bowlRuns = isBattingA ? details.teamBRuns : details.teamARuns;
    const bowlWickets = isBattingA ? details.teamBWickets : details.teamAWickets;
    const bowlBalls = isBattingA ? details.teamBBalls : details.teamABalls;

    const maxWickets = getMaxWickets(details);
    const configuredBalls = Math.max(1, details.oversLimit) * 6;
    const isAllOut = wickets >= maxWickets;
    const isOversDone = balls >= configuredBalls;

    const isAbandoned =
      score?.resultStatus === 'ABANDONED' ||
      score?.resultStatus === 'NO_RESULT' ||
      stdStatus === 'CANCELLED';
    const isInterrupted = stdStatus === 'INTERRUPTED' || stdStatus === 'DELAYED';
    const isCompleted =
      chase.isMatchCompleted ||
      (Boolean(score?.resultStatus) && score?.resultStatus !== 'NOT_DECLARED');

    let statusPillLabel = 'LIVE';
    let statusPillVariant: ScoreboardViewModel['statusPillVariant'] = 'live';
    let showLiveDot = stream.status === 'LIVE' && !isCompleted && !isAbandoned;

    if (isAbandoned) {
      statusPillLabel = score?.resultStatus === 'NO_RESULT' ? 'NO RESULT' : 'ABANDONED';
      statusPillVariant = 'warning';
      showLiveDot = false;
    } else if (isInterrupted) {
      statusPillLabel =
        (score?.matchStatus || '').toUpperCase().includes('RAIN')
          ? 'RAIN DELAY'
          : stdStatus === 'DELAYED'
            ? 'DELAYED'
            : 'INTERRUPTED';
      statusPillVariant = 'warning';
      showLiveDot = false;
    } else if (chase.isInningsBreak) {
      statusPillLabel = 'INN BREAK';
      statusPillVariant = 'break';
      showLiveDot = false;
    } else if (isCompleted) {
      statusPillLabel = chase.outcome === 'TIED' || score?.resultStatus === 'TIE' ? 'TIED' : 'FINAL';
      statusPillVariant = 'final';
      showLiveDot = false;
    } else if (stream.status === 'UPCOMING') {
      statusPillLabel = 'UPCOMING';
      statusPillVariant = 'upcoming';
      showLiveDot = false;
    } else if (details.isSuperOver) {
      statusPillLabel = 'SUPER OVER';
      statusPillVariant = 'live';
    }

    let situationBanner = '';
    let situationAccent: ScoreboardViewModel['situationAccent'] = 'info';

    if (isAbandoned) {
      situationBanner = score?.resultDescription || score?.matchStatus || 'Match Abandoned';
      situationAccent = 'warning';
    } else if (isInterrupted) {
      situationBanner = score?.matchStatus || 'Play Interrupted';
      situationAccent = 'warning';
    } else if (isCompleted) {
      situationBanner = score?.resultDescription || chase.chaseSummaryText || 'Match Completed';
      situationAccent = 'result';
    } else if (chase.isInningsBreak) {
      const parts = ['INNINGS BREAK'];
      if (config.showTarget && chase.target > 0) parts.push(`TARGET ${chase.target}`);
      parts.push(`${bowlShort} NEED ${chase.target}`);
      situationBanner = parts.join(' · ');
      situationAccent = 'break';
    } else if (chase.isSecondInnings && chase.target > 0) {
      const parts: string[] = [];
      if (config.showRunsRequired && config.showBallsRemaining) {
        parts.push(`NEED ${chase.runsRequired} OFF ${chase.ballsRemaining}B`);
      } else if (config.showRunsRequired) {
        parts.push(`NEED ${chase.runsRequired} RUNS`);
      } else if (config.showBallsRemaining) {
        parts.push(`${chase.ballsRemaining} BALLS REM`);
      }
      if (parts.length > 0) {
        situationBanner = parts.join(' · ');
        situationAccent = 'chase';
      }
    } else if (isAllOut) {
      situationBanner = `${batShort} ALL OUT`;
    } else if (isOversDone) {
      situationBanner = `${batShort} INNINGS DONE`;
    }

    const statChips: ScoreboardViewModel['statChips'] = [];
    if (config.showRunRate) {
      statChips.push({ label: 'CRR', value: String(chase.crr), accent: 'secondary' });
    }
    if (chase.isSecondInnings && config.showTarget && chase.target > 0 && !isCompleted) {
      statChips.push({ label: 'TGT', value: String(chase.target), accent: 'normal' });
    }
    if (chase.isSecondInnings && config.showRequiredRunRate && chase.rrr !== null && !isCompleted) {
      statChips.push({ label: 'RRR', value: String(chase.rrr), accent: 'primary' });
    }

    const showCrease = !chase.isInningsBreak && !isCompleted && !isAbandoned;
    const battersText =
      showCrease && config.showBatters
        ? [details.batsman1 ? `* ${details.batsman1}` : '', details.batsman2 || '']
            .filter(Boolean)
            .join('  |  ')
        : '';
    const bowlerText =
      showCrease && config.showBowler && details.bowler ? `BWL ${details.bowler}` : '';

    const recentBalls =
      config.showRecentOver && !isAbandoned
        ? (details.recentBalls || []).slice(-6)
        : [];

    const oversDisplay = `${formatCricketOvers(balls)}/${details.oversLimit} OV`;
    const bowlSummary =
      chase.isSecondInnings || bowlBalls > 0 || bowlRuns > 0
        ? `${bowlRuns}/${bowlWickets} (${formatCricketOvers(bowlBalls)})`
        : 'Bowling';

    return {
      sport: 'Cricket',
      sportLabel: 'CRICKET',
      tournamentName,
      primaryShort: batShort,
      primaryName: batName,
      primaryLogo: batLogo,
      primaryAccent: batAccent,
      primaryScore: `${runs}/${wickets}`,
      primarySub: oversDisplay,
      secondaryShort: bowlShort,
      secondaryName: bowlName,
      secondaryLogo: bowlLogo,
      secondaryAccent: bowlAccent,
      secondaryScore:
        chase.isSecondInnings || bowlBalls > 0 || bowlRuns > 0
          ? `${bowlRuns}/${bowlWickets}`
          : '—',
      secondarySub: bowlSummary,
      centerPrimary: oversDisplay,
      centerSecondary: `${details.innings === 2 ? '2ND' : '1ST'} INN`,
      statusPillLabel,
      statusPillVariant,
      showLiveDot,
      resultDeclared: isCompleted,
      isCricket: true,
      situationBanner,
      situationAccent,
      statChips,
      battersText,
      bowlerText,
      recentBalls,
      footerNote: details.isSuperOver
        ? `SUPER OVER: ${cShortA} ${details.superOverTeamARuns}/${details.superOverTeamAWickets} · ${cShortB} ${details.superOverTeamBRuns}/${details.superOverTeamBWickets}`
        : '',
      mvpPlayerName: isCompleted && score?.mvpPlayerName ? score.mvpPlayerName : '',
      pulseKeySeed: `${runs}-${wickets}-${balls}`,
      kabaddiBannerData: null,
    };
  }

  if (sport === 'Kabaddi') {
    const d = normalizeKabaddiDetails(score?.sportSpecificDetails);
    const vis = d.viewerDisplaySettings;
    const effClock = computeEffectiveKabaddiClock(d, nowMs);
    const scoreA = score?.teamAScore ?? 0;
    const scoreB = score?.teamBScore ?? 0;

    let banner = '';
    let bannerAccent: ScoreboardViewModel['situationAccent'] = 'info';
    if (resultDeclared) {
      banner = score?.resultDescription || score?.winnerTeamName || 'FINAL';
      bannerAccent = 'result';
    } else if (vis.showDoOrDieBanner && effClock.doOrDieVisible && d.doOrDie.team) {
      banner = `DO OR DIE · ${d.doOrDie.team === 'A' ? shortA : shortB}`;
      bannerAccent = 'warning';
    } else if (vis.showTimeoutBanner && d.clock.timeoutActive) {
      banner = `TIMEOUT · ${d.clock.timeoutTeam === 'A' ? shortA : shortB} (${effClock.timeoutRemainingSec}s)`;
      bannerAccent = 'break';
    } else if (d.superRaidNote) {
      banner = d.superRaidNote;
      bannerAccent = 'chase';
    }

    const showClock = config.showMatchStatus && vis.showMatchTimer;
    const matSuffixA = vis.showPlayersOnCourtDots
      ? ` · Mat ${d.playersOnCourtA}/${d.rules.playersPerSide}`
      : '';
    const matSuffixB = vis.showPlayersOnCourtDots
      ? ` · Mat ${d.playersOnCourtB}/${d.rules.playersPerSide}`
      : '';

    return {
      sport: 'Kabaddi',
      sportLabel: 'KABADDI',
      tournamentName: vis.showTournamentLogo ? tournamentName : '',
      primaryShort: shortA,
      primaryName: vis.showTeamNames ? nameA : shortA,
      primaryLogo: stream.teamALogo,
      primaryAccent: config.teamAColor,
      primaryScore: vis.showScores ? String(scoreA) : '•',
      primarySub: `R ${d.teamA.raidPoints} · T ${d.teamA.tacklePoints} · B ${d.teamA.bonusPoints} · AO ${d.teamA.allOutPoints}`,
      secondaryShort: shortB,
      secondaryName: vis.showTeamNames ? nameB : shortB,
      secondaryLogo: stream.teamBLogo,
      secondaryAccent: config.teamBColor,
      secondaryScore: vis.showScores ? String(scoreB) : '•',
      secondarySub: `R ${d.teamB.raidPoints} · T ${d.teamB.tacklePoints} · B ${d.teamB.bonusPoints} · AO ${d.teamB.allOutPoints}`,
      centerPrimary: showClock ? effClock.formattedClock : '',
      centerSecondary: config.showMatchStatus
        ? [
            vis.showHalf ? d.clock.halfLabel || d.half : '',
            vis.showRaidTimer && d.clock.raidTimerEnabled && !d.matchCompleted
              ? `R${effClock.raidRemainingSec}s`
              : '',
          ]
            .filter(Boolean)
            .join(' · ')
        : '',
      statusPillLabel: resultDeclared ? 'FINAL' : stdStatus === 'LIVE' ? 'LIVE' : stdStatus,
      statusPillVariant: resultDeclared ? 'final' : stdStatus === 'LIVE' ? 'live' : 'break',
      showLiveDot: stream.status === 'LIVE' && !resultDeclared,
      resultDeclared,
      isCricket: false,
      situationBanner: banner,
      situationAccent: bannerAccent,
      statChips: [],
      battersText: '',
      bowlerText: '',
      leftStatsText: `${shortA}: R ${d.teamA.raidPoints} · T ${d.teamA.tacklePoints} · B ${d.teamA.bonusPoints} · AO ${d.teamA.allOutPoints}${matSuffixA}`,
      rightStatsText: `${shortB}: R ${d.teamB.raidPoints} · T ${d.teamB.tacklePoints} · B ${d.teamB.bonusPoints} · AO ${d.teamB.allOutPoints}${matSuffixB}`,
      recentBalls: [],
      footerNote: '',
      mvpPlayerName: resultDeclared && score?.mvpPlayerName ? score.mvpPlayerName : '',
      pulseKeySeed: `${scoreA}-${scoreB}`,
      kabaddiBannerData: {
        streamId: stream.id,
        teamAName: nameA,
        teamBName: nameB,
        d,
        effClock,
      },
    };
  }

  if (sport === 'Football') {
    const d: FootballDetails = {
      ...createInitialFootballDetails(),
      ...((score?.sportSpecificDetails || {}) as Partial<FootballDetails>),
    };
    const scoreA = score?.teamAScore ?? 0;
    const scoreB = score?.teamBScore ?? 0;
    const clock = `${String(d.timerMinutes ?? 0).padStart(2, '0')}:${String(d.timerSeconds ?? 0).padStart(2, '0')}`;
    const showPenalties = d.half === 'Penalties' || d.teamAPenalties > 0 || d.teamBPenalties > 0;
    const halfAbbr = FOOTBALL_HALF_ABBR[d.half] || d.half;

    const statChips: ScoreboardViewModel['statChips'] = [];
    if (d.teamAYellowCards > 0 || d.teamARedCards > 0) {
      statChips.push({
        label: `${shortA} CARDS`,
        value: `YC ${d.teamAYellowCards} · RC ${d.teamARedCards}`,
      });
    }
    if (d.teamBYellowCards > 0 || d.teamBRedCards > 0) {
      statChips.push({
        label: `${shortB} CARDS`,
        value: `YC ${d.teamBYellowCards} · RC ${d.teamBRedCards}`,
      });
    }

    return {
      sport: 'Football',
      sportLabel: 'FOOTBALL',
      tournamentName,
      primaryShort: shortA,
      primaryName: nameA,
      primaryLogo: stream.teamALogo,
      primaryAccent: config.teamAColor,
      primaryScore: String(scoreA),
      primarySub: showPenalties ? `PEN ${d.teamAPenalties}` : 'Goals',
      secondaryShort: shortB,
      secondaryName: nameB,
      secondaryLogo: stream.teamBLogo,
      secondaryAccent: config.teamBColor,
      secondaryScore: String(scoreB),
      secondarySub: showPenalties ? `PEN ${d.teamBPenalties}` : 'Goals',
      centerPrimary: clock,
      centerSecondary: `${halfAbbr}${d.extraTimeMinutes > 0 ? ` +${d.extraTimeMinutes}'` : ''}`,
      statusPillLabel: resultDeclared ? 'FINAL' : stdStatus === 'LIVE' ? 'LIVE' : stdStatus,
      statusPillVariant: resultDeclared ? 'final' : stdStatus === 'LIVE' ? 'live' : 'break',
      showLiveDot: stream.status === 'LIVE' && !resultDeclared,
      resultDeclared,
      isCricket: false,
      situationBanner: resultDeclared
        ? score?.resultDescription || score?.winnerTeamName || 'FULL TIME'
        : showPenalties
          ? `PENS ${shortA} ${d.teamAPenalties} - ${d.teamBPenalties} ${shortB}`
          : '',
      situationAccent: resultDeclared ? 'result' : 'chase',
      statChips,
      battersText: '',
      bowlerText: '',
      recentBalls: [],
      footerNote: showPenalties ? `Penalties: ${shortA} ${d.teamAPenalties} - ${d.teamBPenalties} ${shortB}` : '',
      mvpPlayerName: resultDeclared && score?.mvpPlayerName ? score.mvpPlayerName : '',
      pulseKeySeed: `${scoreA}-${scoreB}`,
      kabaddiBannerData: null,
    };
  }

  if (sport === 'Volleyball') {
    const d = normalizeVolleyballDetails((score?.sportSpecificDetails || {}) as Record<string, unknown>);
    const scoreA = score?.teamAScore ?? 0;
    const scoreB = score?.teamBScore ?? 0;
    const completedSets = (d.setScores || []).filter((s) => s.winner === 'A' || s.winner === 'B');

    let banner = '';
    let accent: ScoreboardViewModel['situationAccent'] = 'info';
    if (resultDeclared) {
      banner = score?.resultDescription || score?.winnerTeamName || 'FINAL';
      accent = 'result';
    } else if (d.advantageTeam) {
      banner = `ADVANTAGE ${d.advantageTeam === 'A' ? shortA : shortB}`;
      accent = 'chase';
    } else if (d.isDeuce) {
      banner = `DEUCE (${scoreA}-${scoreB})`;
      accent = 'break';
    }

    return {
      sport: 'Volleyball',
      sportLabel: 'VOLLEYBALL',
      tournamentName,
      primaryShort: shortA,
      primaryName: nameA,
      primaryLogo: stream.teamALogo,
      primaryAccent: config.teamAColor,
      primaryScore: String(scoreA),
      primarySub: `Sets: ${d.teamASetsWon}`,
      primaryServing: d.servingTeam === 'A' && !resultDeclared,
      secondaryShort: shortB,
      secondaryName: nameB,
      secondaryLogo: stream.teamBLogo,
      secondaryAccent: config.teamBColor,
      secondaryScore: String(scoreB),
      secondarySub: `Sets: ${d.teamBSetsWon}`,
      secondaryServing: d.servingTeam === 'B' && !resultDeclared,
      centerPrimary: `SET ${d.currentSet}/${d.bestOfSets}`,
      centerSecondary: `S${d.teamASetsWon} - S${d.teamBSetsWon}`,
      statusPillLabel: resultDeclared ? 'FINAL' : stdStatus === 'LIVE' ? 'LIVE' : stdStatus,
      statusPillVariant: resultDeclared ? 'final' : stdStatus === 'LIVE' ? 'live' : 'break',
      showLiveDot: stream.status === 'LIVE' && !resultDeclared,
      resultDeclared,
      isCricket: false,
      situationBanner: banner,
      situationAccent: accent,
      statChips: completedSets.map((s) => ({
        label: `S${s.set}`,
        value: `${s.teamA}-${s.teamB}`,
      })),
      battersText: '',
      bowlerText: '',
      recentBalls: [],
      footerNote: '',
      mvpPlayerName: resultDeclared && score?.mvpPlayerName ? score.mvpPlayerName : '',
      pulseKeySeed: `${scoreA}-${scoreB}-${d.currentSet}`,
      kabaddiBannerData: null,
    };
  }

  // Other / Generic sport
  const scoreA = score?.teamAScore ?? 0;
  const scoreB = score?.teamBScore ?? 0;
  const sportLabel = (score?.sportType || stream.gameName || 'MATCH').toUpperCase();

  return {
    sport: 'Other',
    sportLabel,
    tournamentName,
    primaryShort: shortA,
    primaryName: nameA,
    primaryLogo: stream.teamALogo,
    primaryAccent: config.teamAColor,
    primaryScore: String(scoreA),
    primarySub: sportLabel,
    secondaryShort: shortB,
    secondaryName: nameB,
    secondaryLogo: stream.teamBLogo,
    secondaryAccent: config.teamBColor,
    secondaryScore: String(scoreB),
    secondarySub: sportLabel,
    centerPrimary: sportLabel,
    centerSecondary: config.showMatchStatus ? score?.matchStatus || stdStatus : '',
    statusPillLabel: resultDeclared ? 'FINAL' : stdStatus === 'LIVE' ? 'LIVE' : stdStatus,
    statusPillVariant: resultDeclared ? 'final' : stdStatus === 'LIVE' ? 'live' : 'break',
    showLiveDot: stream.status === 'LIVE' && !resultDeclared,
    resultDeclared,
    isCricket: false,
    situationBanner: resultDeclared
      ? score?.resultDescription || score?.winnerTeamName || 'FINAL'
      : config.showMatchStatus && score?.matchStatus
        ? score.matchStatus
        : '',
    situationAccent: resultDeclared ? 'result' : 'info',
    statChips: [],
    battersText: '',
    bowlerText: '',
    recentBalls: [],
    footerNote: '',
    mvpPlayerName: resultDeclared && score?.mvpPlayerName ? score.mvpPlayerName : '',
    pulseKeySeed: `${scoreA}-${scoreB}`,
    kabaddiBannerData: null,
    customSlot: theme ? undefined : undefined,
  };
}
