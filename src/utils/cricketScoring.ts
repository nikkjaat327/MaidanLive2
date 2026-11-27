export interface CricketExtras {
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
  penaltyRuns?: number;
}

export type CricketMatchPhase =
  | 'PRE_MATCH'
  | 'FIRST_INNINGS'
  | 'INNINGS_BREAK'
  | 'SECOND_INNINGS'
  | 'COMPLETED';

export type CricketCompletionReason =
  | 'OVERS_COMPLETED'
  | 'ALL_OUT'
  | 'TARGET_REACHED'
  | 'MANUAL'
  | '';

export interface CricketDeliveryLogItem {
  id: string;
  innings: 1 | 2;
  battingTeam: 'A' | 'B';
  overText: string;
  overNumber?: number;
  ballInOver?: number;
  eventType: string;
  batRuns: number;
  extraRuns: number;
  extraType: string;
  totalAdded?: number;
  isLegal?: boolean;
  countsAsBatterBall?: boolean;
  isWicket: boolean;
  wicketType?: string;
  dismissedPlayer?: string;
  newBatsman?: string;
  fielder?: string;
  striker?: string;
  nonStriker?: string;
  bowler?: string;
  token?: string;
  scoreSnapshot: string;
  description?: string;
  timestamp: string;
}

export interface CricketBatterRow {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: string;
  isOut: boolean;
  dismissalText: string;
  onStrike: boolean;
  battingOrder: number;
}

export interface CricketBowlerRow {
  name: string;
  balls: number;
  overs: string;
  maidens: number;
  runsConceded: number;
  wickets: number;
  economy: string;
  dotBalls: number;
  foursConceded: number;
  sixesConceded: number;
  wides: number;
  noBalls: number;
}

export interface CricketFallOfWicketItem {
  wicketNumber: number;
  runsAtDismissal: number;
  wicketsCount: number;
  batterName: string;
  oversText: string;
  scoreText: string;
  dismissalText: string;
}

export interface CricketOverSummaryItem {
  overNumber: number;
  bowler: string;
  runsInOver: number;
  wicketsInOver: number;
  balls: string[];
  cumulativeScore: string;
}

export interface CricketInningsScorecard {
  innings: 1 | 2;
  battingTeam: 'A' | 'B';
  bowlingTeam: 'A' | 'B';
  battingTeamName: string;
  bowlingTeamName: string;
  runs: number;
  wickets: number;
  balls: number;
  oversText: string;
  runRate: string;
  extras: Required<CricketExtras> & { total: number };
  batting: CricketBatterRow[];
  bowling: CricketBowlerRow[];
  fallOfWickets: CricketFallOfWicketItem[];
  oversSummary: CricketOverSummaryItem[];
  completed: boolean;
  completionReason: CricketCompletionReason;
}

export interface CricketChaseState {
  isSecondInnings: boolean;
  isInningsBreak: boolean;
  isMatchCompleted: boolean;
  battingTeam: 'A' | 'B';
  bowlingTeam: 'A' | 'B';
  target: number;
  runsScored: number;
  runsRequired: number;
  configuredOvers: number;
  configuredBalls: number;
  ballsBowled: number;
  ballsRemaining: number;
  wicketsLost: number;
  maxWickets: number;
  wicketsRemaining: number;
  crr: string;
  rrr: string | null;
  outcome: 'IN_PROGRESS' | 'INNINGS_BREAK' | 'CHASE_WON' | 'DEFEND_WON' | 'TIED' | 'FIRST_INNINGS_DONE';
  winnerSide: 'A' | 'B' | '';
  winningMarginText: string;
  chaseSummaryText: string;
}

export interface CricketDetails {
  battingTeam: 'A' | 'B';
  innings: 1 | 2;
  teamAShortName: string;
  teamBShortName: string;
  teamARuns: number;
  teamAWickets: number;
  teamABalls: number;
  teamBRuns: number;
  teamBWickets: number;
  teamBBalls: number;
  target: number;
  oversLimit: number;
  playersPerSide?: number;
  matchPhase?: CricketMatchPhase;
  firstInningsBattingTeam?: 'A' | 'B' | '';
  innings1Completed?: boolean;
  innings1Locked?: boolean;
  innings1CompletedAt?: string | null;
  innings1CompletionReason?: CricketCompletionReason;
  innings2Started?: boolean;
  innings2Locked?: boolean;
  innings2StartedAt?: string | null;
  innings2CompletedAt?: string | null;
  innings2CompletionReason?: CricketCompletionReason;
  extrasA: CricketExtras;
  extrasB: CricketExtras;
  batsman1: string;
  batsman2: string;
  bowler: string;
  tossWinner: 'A' | 'B' | '';
  tossDecision: 'BAT' | 'BOWL' | '';
  recentBalls: string[];
  lastOverSummary: string[];
  deliveryHistory: CricketDeliveryLogItem[];
  isSuperOver: boolean;
  superOverTeamARuns: number;
  superOverTeamAWickets: number;
  superOverTeamBRuns: number;
  superOverTeamBWickets: number;
}

export const CRICKET_OVER_PRESETS = [5, 6, 10, 12, 15, 20, 25, 30, 40, 50] as const;

export function createInitialCricketDetails(oversLimit = 20, playersPerSide = 11): CricketDetails {
  const safeOvers = Math.max(1, Math.min(90, Math.floor(Number(oversLimit) || 20)));
  const safePlayers = Math.max(2, Math.min(15, Math.floor(Number(playersPerSide) || 11)));
  return {
    battingTeam: 'A',
    innings: 1,
    teamAShortName: '',
    teamBShortName: '',
    teamARuns: 0,
    teamAWickets: 0,
    teamABalls: 0,
    teamBRuns: 0,
    teamBWickets: 0,
    teamBBalls: 0,
    target: 0,
    oversLimit: safeOvers,
    playersPerSide: safePlayers,
    matchPhase: 'FIRST_INNINGS',
    firstInningsBattingTeam: 'A',
    innings1Completed: false,
    innings1Locked: false,
    innings1CompletedAt: null,
    innings1CompletionReason: '',
    innings2Started: false,
    innings2Locked: false,
    innings2StartedAt: null,
    innings2CompletedAt: null,
    innings2CompletionReason: '',
    extrasA: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penaltyRuns: 0 },
    extrasB: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penaltyRuns: 0 },
    batsman1: '',
    batsman2: '',
    bowler: '',
    tossWinner: '',
    tossDecision: '',
    recentBalls: [],
    lastOverSummary: [],
    deliveryHistory: [],
    isSuperOver: false,
    superOverTeamARuns: 0,
    superOverTeamAWickets: 0,
    superOverTeamBRuns: 0,
    superOverTeamBWickets: 0,
  };
}

export function normalizeCricketDetails(raw?: Partial<CricketDetails> | null): CricketDetails {
  const base = createInitialCricketDetails(raw?.oversLimit ?? 20, raw?.playersPerSide ?? 11);
  const merged: CricketDetails = {
    ...base,
    ...(raw || {}),
    oversLimit: Math.max(1, Math.min(90, Math.floor(Number(raw?.oversLimit) || base.oversLimit))),
    playersPerSide: Math.max(
      2,
      Math.min(15, Math.floor(Number(raw?.playersPerSide) || base.playersPerSide || 11))
    ),
    extrasA: { ...base.extrasA, ...(raw?.extrasA || {}) },
    extrasB: { ...base.extrasB, ...(raw?.extrasB || {}) },
    recentBalls: Array.isArray(raw?.recentBalls) ? [...raw.recentBalls] : [],
    lastOverSummary: Array.isArray(raw?.lastOverSummary) ? [...raw.lastOverSummary] : [],
    deliveryHistory: Array.isArray(raw?.deliveryHistory) ? [...raw.deliveryHistory] : [],
  };

  if (!merged.firstInningsBattingTeam) {
    merged.firstInningsBattingTeam =
      merged.innings === 2 ? (merged.battingTeam === 'A' ? 'B' : 'A') : merged.battingTeam;
  }
  if (!merged.matchPhase) {
    if (merged.innings2Locked) merged.matchPhase = 'COMPLETED';
    else if (merged.innings === 2) merged.matchPhase = 'SECOND_INNINGS';
    else if (merged.innings1Completed || merged.innings1Locked) merged.matchPhase = 'INNINGS_BREAK';
    else merged.matchPhase = 'FIRST_INNINGS';
  }
  return merged;
}

export function getMaxWickets(details: Pick<CricketDetails, 'playersPerSide'>): number {
  return Math.max(1, (Math.floor(Number(details.playersPerSide) || 11)) - 1);
}

export function formatCricketOvers(totalBalls: number): string {
  const safeBalls = Math.max(0, Math.floor(totalBalls || 0));
  const overs = Math.floor(safeBalls / 6);
  const rem = safeBalls % 6;
  return `${overs}.${rem}`;
}

export function calculateCricketRunRate(runs: number, balls: number): string {
  if (!balls || balls <= 0) return '0.00';
  return ((runs * 6) / balls).toFixed(2);
}

export function getTotalExtras(extras?: CricketExtras): number {
  if (!extras) return 0;
  return (
    (extras.wides || 0) +
    (extras.noBalls || 0) +
    (extras.byes || 0) +
    (extras.legByes || 0) +
    (extras.penaltyRuns || 0)
  );
}

export function isBowlerCreditedWicket(wicketType?: string): boolean {
  const norm = String(wicketType || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!norm) return true;
  return ![
    'RUN_OUT',
    'RUNOUT',
    'RETIRED_HURT',
    'RETIRED_OUT',
    'RETIRED',
    'OBSTRUCTING_FIELD',
    'OBSTRUCTING_THE_FIELD',
    'TIMED_OUT',
    'HIT_BALL_TWICE',
    'HANDLED_THE_BALL',
  ].includes(norm);
}

export function computeCricketChaseState(
  rawDetails: Partial<CricketDetails> | CricketDetails,
  teamAName = 'Team A',
  teamBName = 'Team B'
): CricketChaseState {
  const d = normalizeCricketDetails(rawDetails);
  const configuredOvers = Math.max(1, d.oversLimit || 20);
  const configuredBalls = configuredOvers * 6;
  const maxWickets = getMaxWickets(d);

  const isBreak = d.matchPhase === 'INNINGS_BREAK' || (d.innings === 1 && Boolean(d.innings1Completed));
  const firstBatting: 'A' | 'B' =
    d.firstInningsBattingTeam === 'A' || d.firstInningsBattingTeam === 'B'
      ? d.firstInningsBattingTeam
      : d.innings === 2
        ? d.battingTeam === 'A'
          ? 'B'
          : 'A'
        : d.battingTeam;
  const secondBatting: 'A' | 'B' = firstBatting === 'A' ? 'B' : 'A';
  const activeBatting: 'A' | 'B' = d.innings === 2 ? d.battingTeam : firstBatting;
  const activeBowling: 'A' | 'B' = activeBatting === 'A' ? 'B' : 'A';

  const runsScored = activeBatting === 'A' ? d.teamARuns : d.teamBRuns;
  const ballsBowled = activeBatting === 'A' ? d.teamABalls : d.teamBBalls;
  const wicketsLost = activeBatting === 'A' ? d.teamAWickets : d.teamBWickets;

  const firstRuns = firstBatting === 'A' ? d.teamARuns : d.teamBRuns;
  const target = d.innings === 2 ? (d.target > 0 ? d.target : firstRuns + 1) : d.target || 0;

  const runsRequired = d.innings === 2 && target > 0 ? Math.max(0, target - runsScored) : 0;
  const ballsRemaining = Math.max(0, configuredBalls - ballsBowled);
  const wicketsRemaining = Math.max(0, maxWickets - wicketsLost);
  const crr = calculateCricketRunRate(runsScored, ballsBowled);

  const defendingTeamName = firstBatting === 'A' ? teamAName : teamBName;
  const chasingTeamName = secondBatting === 'A' ? teamAName : teamBName;

  if (d.innings === 1) {
    if (isBreak) {
      const computedTarget = target > 0 ? target : firstRuns + 1;
      return {
        isSecondInnings: false,
        isInningsBreak: true,
        isMatchCompleted: false,
        battingTeam: firstBatting,
        bowlingTeam: secondBatting,
        target: computedTarget,
        runsScored: firstRuns,
        runsRequired: 0,
        configuredOvers,
        configuredBalls,
        ballsBowled,
        ballsRemaining,
        wicketsLost,
        maxWickets,
        wicketsRemaining,
        crr,
        rrr: null,
        outcome: 'INNINGS_BREAK',
        winnerSide: '',
        winningMarginText: '',
        chaseSummaryText: `${chasingTeamName} need ${computedTarget} run${computedTarget === 1 ? '' : 's'} to win (${configuredOvers} ov)`,
      };
    }

    return {
      isSecondInnings: false,
      isInningsBreak: false,
      isMatchCompleted: false,
      battingTeam: activeBatting,
      bowlingTeam: activeBowling,
      target: 0,
      runsScored,
      runsRequired: 0,
      configuredOvers,
      configuredBalls,
      ballsBowled,
      ballsRemaining,
      wicketsLost,
      maxWickets,
      wicketsRemaining,
      crr,
      rrr: null,
      outcome: 'IN_PROGRESS',
      winnerSide: '',
      winningMarginText: '',
      chaseSummaryText: `1st Innings · ${formatCricketOvers(ballsBowled)}/${configuredOvers} ov`,
    };
  }

  // 2nd innings evaluation
  const chaseWon = target > 0 && runsScored >= target;
  const inningsExhausted = ballsBowled >= configuredBalls || wicketsLost >= maxWickets;
  const isCompleted = Boolean(d.innings2Locked || d.matchPhase === 'COMPLETED' || chaseWon || inningsExhausted);

  if (chaseWon) {
    const wkRem = Math.max(0, maxWickets - wicketsLost);
    const marginText = `by ${wkRem} wicket${wkRem === 1 ? '' : 's'}`;
    return {
      isSecondInnings: true,
      isInningsBreak: false,
      isMatchCompleted: true,
      battingTeam: activeBatting,
      bowlingTeam: activeBowling,
      target,
      runsScored,
      runsRequired: 0,
      configuredOvers,
      configuredBalls,
      ballsBowled,
      ballsRemaining,
      wicketsLost,
      maxWickets,
      wicketsRemaining: wkRem,
      crr,
      rrr: null,
      outcome: 'CHASE_WON',
      winnerSide: activeBatting,
      winningMarginText: marginText,
      chaseSummaryText: `${chasingTeamName} won ${marginText}`,
    };
  }

  if (inningsExhausted || d.innings2Locked || d.matchPhase === 'COMPLETED') {
    const targetBaseline = target > 0 ? target - 1 : firstRuns;
    if (runsScored === targetBaseline) {
      return {
        isSecondInnings: true,
        isInningsBreak: false,
        isMatchCompleted: true,
        battingTeam: activeBatting,
        bowlingTeam: activeBowling,
        target,
        runsScored,
        runsRequired: Math.max(0, target - runsScored),
        configuredOvers,
        configuredBalls,
        ballsBowled,
        ballsRemaining,
        wicketsLost,
        maxWickets,
        wicketsRemaining,
        crr,
        rrr: null,
        outcome: 'TIED',
        winnerSide: '',
        winningMarginText: 'Match Tied',
        chaseSummaryText: 'MATCH TIED',
      };
    }
    const runMargin = Math.max(1, targetBaseline - runsScored);
    const marginText = `by ${runMargin} run${runMargin === 1 ? '' : 's'}`;
    return {
      isSecondInnings: true,
      isInningsBreak: false,
      isMatchCompleted: true,
      battingTeam: activeBatting,
      bowlingTeam: activeBowling,
      target,
      runsScored,
      runsRequired: Math.max(0, target - runsScored),
      configuredOvers,
      configuredBalls,
      ballsBowled,
      ballsRemaining,
      wicketsLost,
      maxWickets,
      wicketsRemaining,
      crr,
      rrr: null,
      outcome: 'DEFEND_WON',
      winnerSide: activeBowling,
      winningMarginText: marginText,
      chaseSummaryText: `${defendingTeamName} won ${marginText}`,
    };
  }

  const rrr =
    runsRequired > 0 && ballsRemaining > 0
      ? ((runsRequired * 6) / ballsRemaining).toFixed(2)
      : null;

  return {
    isSecondInnings: true,
    isInningsBreak: false,
    isMatchCompleted: false,
    battingTeam: activeBatting,
    bowlingTeam: activeBowling,
    target,
    runsScored,
    runsRequired,
    configuredOvers,
    configuredBalls,
    ballsBowled,
    ballsRemaining,
    wicketsLost,
    maxWickets,
    wicketsRemaining,
    crr,
    rrr,
    outcome: 'IN_PROGRESS',
    winnerSide: '',
    winningMarginText: '',
    chaseSummaryText: `Need ${runsRequired} run${runsRequired === 1 ? '' : 's'} from ${ballsRemaining} ball${ballsRemaining === 1 ? '' : 's'}`,
  };
}

export function calculateRequiredRunRate(details: CricketDetails): string | null {
  return computeCricketChaseState(details).rrr;
}

export function formatDismissalText(d: Pick<CricketDeliveryLogItem, 'wicketType' | 'bowler' | 'fielder'>): string {
  const wType = (d.wicketType || 'Out').trim();
  const norm = wType.toUpperCase().replace(/[\s-]+/g, '_');
  const bowler = d.bowler?.trim();
  const fielder = d.fielder?.trim();

  if (norm === 'BOWLED') return bowler ? `b ${bowler}` : 'b';
  if (norm === 'LBW') return bowler ? `lbw b ${bowler}` : 'lbw';
  if (norm === 'CAUGHT' || norm === 'CAUGHT_AND_BOWLED' || norm === 'C_AND_B') {
    if (norm === 'CAUGHT_AND_BOWLED' || norm === 'C_AND_B' || (fielder && bowler && fielder.toLowerCase() === bowler.toLowerCase())) {
      return bowler ? `c & b ${bowler}` : 'c & b';
    }
    if (fielder && bowler) return `c ${fielder} b ${bowler}`;
    if (bowler) return `c & b ${bowler}`;
    return 'caught';
  }
  if (norm === 'STUMPED') {
    if (fielder && bowler) return `st ${fielder} b ${bowler}`;
    return bowler ? `st b ${bowler}` : 'stumped';
  }
  if (norm === 'RUN_OUT' || norm === 'RUNOUT') {
    return fielder ? `run out (${fielder})` : 'run out';
  }
  if (norm === 'HIT_WICKET') return bowler ? `hit wicket b ${bowler}` : 'hit wicket';
  if (norm === 'RETIRED_HURT') return 'retired hurt';
  if (norm === 'RETIRED_OUT' || norm === 'RETIRED') return 'retired out';
  return bowler ? `${wType.toLowerCase()} b ${bowler}` : wType.toLowerCase();
}

export function deriveCricketInningsScorecard(
  rawDetails: Partial<CricketDetails> | CricketDetails,
  inningsNum: 1 | 2,
  teamAName = 'Team A',
  teamBName = 'Team B'
): CricketInningsScorecard {
  const d = normalizeCricketDetails(rawDetails);
  const firstBatting: 'A' | 'B' =
    d.firstInningsBattingTeam === 'A' || d.firstInningsBattingTeam === 'B'
      ? d.firstInningsBattingTeam
      : d.innings === 2
        ? d.battingTeam === 'A'
          ? 'B'
          : 'A'
        : d.battingTeam;
  const battingTeam: 'A' | 'B' = inningsNum === 1 ? firstBatting : firstBatting === 'A' ? 'B' : 'A';
  const bowlingTeam: 'A' | 'B' = battingTeam === 'A' ? 'B' : 'A';

  const battingTeamName = battingTeam === 'A' ? teamAName : teamBName;
  const bowlingTeamName = bowlingTeam === 'A' ? teamAName : teamBName;

  const runs = battingTeam === 'A' ? d.teamARuns : d.teamBRuns;
  const wickets = battingTeam === 'A' ? d.teamAWickets : d.teamBWickets;
  const balls = battingTeam === 'A' ? d.teamABalls : d.teamBBalls;
  const ex = battingTeam === 'A' ? d.extrasA : d.extrasB;
  const extras = {
    wides: ex?.wides || 0,
    noBalls: ex?.noBalls || 0,
    byes: ex?.byes || 0,
    legByes: ex?.legByes || 0,
    penaltyRuns: ex?.penaltyRuns || 0,
    total: getTotalExtras(ex),
  };

  // deliveryHistory is stored newest-first; reverse to chronological order
  const chronological = [...(d.deliveryHistory || [])]
    .filter((item) => item.innings === inningsNum)
    .reverse();

  const batterMap = new Map<string, CricketBatterRow>();
  const ensureBatter = (name: string): CricketBatterRow | null => {
    const clean = (name || '').trim();
    if (!clean) return null;
    const key = clean.toLowerCase();
    let row = batterMap.get(key);
    if (!row) {
      row = {
        name: clean,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        strikeRate: '0.0',
        isOut: false,
        dismissalText: 'not out',
        onStrike: false,
        battingOrder: batterMap.size + 1,
      };
      batterMap.set(key, row);
    }
    return row;
  };

  interface BowlerAccum {
    name: string;
    balls: number;
    maidens: number;
    runsConceded: number;
    wickets: number;
    dotBalls: number;
    foursConceded: number;
    sixesConceded: number;
    wides: number;
    noBalls: number;
  }
  const bowlerMap = new Map<string, BowlerAccum>();
  const ensureBowler = (name: string): BowlerAccum | null => {
    const clean = (name || '').trim();
    if (!clean) return null;
    const key = clean.toLowerCase();
    let row = bowlerMap.get(key);
    if (!row) {
      row = {
        name: clean,
        balls: 0,
        maidens: 0,
        runsConceded: 0,
        wickets: 0,
        dotBalls: 0,
        foursConceded: 0,
        sixesConceded: 0,
        wides: 0,
        noBalls: 0,
      };
      bowlerMap.set(key, row);
    }
    return row;
  };

  const fallOfWickets: CricketFallOfWicketItem[] = [];
  const oversMap = new Map<
    number,
    {
      overNumber: number;
      bowler: string;
      runsInOver: number;
      wicketsInOver: number;
      balls: string[];
      cumulativeScore: string;
      legalCount: number;
      bowlerRunsInOver: number;
      singleBowler: boolean;
    }
  >();

  let runningLegalBalls = 0;
  let runningRuns = 0;
  let runningWickets = 0;

  for (const ev of chronological) {
    const extraType = (ev.extraType || 'NONE').toUpperCase();
    const isLegal =
      typeof ev.isLegal === 'boolean'
        ? ev.isLegal
        : extraType !== 'WIDE' && extraType !== 'NO_BALL' && extraType !== 'PENALTY';
    const batRuns = Math.max(0, Number(ev.batRuns || 0));
    const extraRuns = Math.max(0, Number(ev.extraRuns || 0));
    const totalAdded =
      typeof ev.totalAdded === 'number' ? ev.totalAdded : batRuns + extraRuns;

    const overIndex = Math.floor(runningLegalBalls / 6) + 1;
    if (isLegal) runningLegalBalls += 1;
    runningRuns += totalAdded;
    if (ev.isWicket) runningWickets += 1;

    const striker = ensureBatter(ev.striker || '');
    const nonStriker = ensureBatter(ev.nonStriker || '');
    void nonStriker;

    if (striker) {
      striker.runs += batRuns;
      const countsBall =
        typeof ev.countsAsBatterBall === 'boolean'
          ? ev.countsAsBatterBall
          : extraType !== 'WIDE';
      if (countsBall) striker.balls += 1;
      if (batRuns === 4) striker.fours += 1;
      if (batRuns === 6) striker.sixes += 1;
    }

    const bowlerRow = ensureBowler(ev.bowler || '');
    if (bowlerRow) {
      if (isLegal) bowlerRow.balls += 1;
      // Runs charged to bowler: batRuns + wides + noBalls (byes/legByes/penalty excluded)
      const bowlerChargedRuns =
        batRuns + (extraType === 'WIDE' || extraType === 'NO_BALL' ? extraRuns : 0);
      bowlerRow.runsConceded += bowlerChargedRuns;
      if (extraType === 'WIDE') bowlerRow.wides += extraRuns;
      if (extraType === 'NO_BALL') bowlerRow.noBalls += 1;
      if (batRuns === 4) bowlerRow.foursConceded += 1;
      if (batRuns === 6) bowlerRow.sixesConceded += 1;
      if (isLegal && bowlerChargedRuns === 0 && !ev.isWicket) {
        bowlerRow.dotBalls += 1;
      }
      if (ev.isWicket && isBowlerCreditedWicket(ev.wicketType)) {
        bowlerRow.wickets += 1;
      }
    }

    // Over-by-over accumulation
    let overEntry = oversMap.get(overIndex);
    if (!overEntry) {
      overEntry = {
        overNumber: overIndex,
        bowler: ev.bowler || '',
        runsInOver: 0,
        wicketsInOver: 0,
        balls: [],
        cumulativeScore: ev.scoreSnapshot || `${runningRuns}/${runningWickets}`,
        legalCount: 0,
        bowlerRunsInOver: 0,
        singleBowler: true,
      };
      oversMap.set(overIndex, overEntry);
    }
    if (ev.bowler && overEntry.bowler && ev.bowler.toLowerCase() !== overEntry.bowler.toLowerCase()) {
      overEntry.singleBowler = false;
    } else if (ev.bowler && !overEntry.bowler) {
      overEntry.bowler = ev.bowler;
    }

    const token =
      ev.token ||
      (ev.isWicket
        ? totalAdded > 0
          ? `${totalAdded}+W`
          : 'W'
        : extraType === 'WIDE'
          ? totalAdded > 1
            ? `Wd+${totalAdded - 1}`
            : 'Wd'
          : extraType === 'NO_BALL'
            ? totalAdded > 1
              ? `Nb+${totalAdded - 1}`
              : 'Nb'
            : extraType === 'BYE'
              ? `B${extraRuns}`
              : extraType === 'LEG_BYE'
                ? `Lb${extraRuns}`
                : String(batRuns));

    overEntry.balls.push(token);
    overEntry.runsInOver += totalAdded;
    if (ev.isWicket) overEntry.wicketsInOver += 1;
    if (isLegal) overEntry.legalCount += 1;
    overEntry.bowlerRunsInOver +=
      batRuns + (extraType === 'WIDE' || extraType === 'NO_BALL' ? extraRuns : 0);
    overEntry.cumulativeScore = ev.scoreSnapshot || `${runningRuns}/${runningWickets}`;

    if (
      overEntry.legalCount === 6 &&
      overEntry.singleBowler &&
      overEntry.bowlerRunsInOver === 0 &&
      overEntry.bowler
    ) {
      const mBowler = ensureBowler(overEntry.bowler);
      if (mBowler) mBowler.maidens += 1;
    }

    if (ev.isWicket) {
      const dismissedName = (ev.dismissedPlayer || ev.striker || `Batter ${runningWickets}`).trim();
      const dBatter = ensureBatter(dismissedName);
      const dismissalText = formatDismissalText(ev);
      if (dBatter) {
        dBatter.isOut = (ev.wicketType || '').toUpperCase() !== 'RETIRED_HURT';
        dBatter.dismissalText = dismissalText;
      }
      if (ev.newBatsman) {
        ensureBatter(ev.newBatsman);
      }
      fallOfWickets.push({
        wicketNumber: runningWickets,
        runsAtDismissal: runningRuns,
        wicketsCount: runningWickets,
        batterName: dismissedName,
        oversText: ev.overText || formatCricketOvers(runningLegalBalls),
        scoreText: `${runningWickets}-${runningRuns}`,
        dismissalText,
      });
    }
  }

  // If this innings is currently active, make sure crease batters & bowler appear even at 0 balls
  const isCurrentInnings =
    d.innings === inningsNum && d.matchPhase !== 'COMPLETED' && !(inningsNum === 1 && d.innings1Completed);
  if (isCurrentInnings) {
    if (d.batsman1) {
      const b1 = ensureBatter(d.batsman1);
      if (b1 && !b1.isOut) b1.onStrike = true;
    }
    if (d.batsman2) {
      ensureBatter(d.batsman2);
    }
    if (d.bowler) {
      ensureBowler(d.bowler);
    }
  }

  const batting = Array.from(batterMap.values())
    .sort((a, b) => a.battingOrder - b.battingOrder)
    .map((b) => ({
      ...b,
      strikeRate: b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '0.0',
    }));

  const bowling: CricketBowlerRow[] = Array.from(bowlerMap.values()).map((bw) => ({
    name: bw.name,
    balls: bw.balls,
    overs: formatCricketOvers(bw.balls),
    maidens: bw.maidens,
    runsConceded: bw.runsConceded,
    wickets: bw.wickets,
    economy: bw.balls > 0 ? ((bw.runsConceded * 6) / bw.balls).toFixed(2) : '0.00',
    dotBalls: bw.dotBalls,
    foursConceded: bw.foursConceded,
    sixesConceded: bw.sixesConceded,
    wides: bw.wides,
    noBalls: bw.noBalls,
  }));

  const oversSummary: CricketOverSummaryItem[] = Array.from(oversMap.values()).map((ov) => ({
    overNumber: ov.overNumber,
    bowler: ov.bowler || 'Bowler',
    runsInOver: ov.runsInOver,
    wicketsInOver: ov.wicketsInOver,
    balls: ov.balls,
    cumulativeScore: ov.cumulativeScore,
  }));

  const completed =
    inningsNum === 1
      ? Boolean(d.innings1Completed || d.innings1Locked || d.innings === 2)
      : Boolean(d.innings2Locked || d.matchPhase === 'COMPLETED');
  const completionReason =
    inningsNum === 1 ? d.innings1CompletionReason || '' : d.innings2CompletionReason || '';

  return {
    innings: inningsNum,
    battingTeam,
    bowlingTeam,
    battingTeamName,
    bowlingTeamName,
    runs,
    wickets,
    balls,
    oversText: formatCricketOvers(balls),
    runRate: calculateCricketRunRate(runs, balls),
    extras,
    batting,
    bowling,
    fallOfWickets,
    oversSummary,
    completed,
    completionReason,
  };
}

export type CricketDeliveryEventType =
  | 'LEGAL_DELIVERY'
  | 'WIDE'
  | 'NO_BALL'
  | 'BYE'
  | 'LEG_BYE'
  | 'WICKET'
  | 'PENALTY_RUNS'
  | 'MULTIPLE_EXTRAS'
  | 'CUSTOM_EVENT';

export type CricketActionPayload =
  | {
      type: 'RUNS';
      runs: number;
      striker?: string;
      nonStriker?: string;
      bowler?: string;
      description?: string;
    }
  | {
      type: 'WIDE';
      extraRuns?: number;
      striker?: string;
      nonStriker?: string;
      bowler?: string;
    }
  | {
      type: 'NO_BALL';
      extraRuns?: number;
      batRuns?: number;
      striker?: string;
      nonStriker?: string;
      bowler?: string;
    }
  | {
      type: 'BYE';
      runs: number;
      striker?: string;
      nonStriker?: string;
      bowler?: string;
    }
  | {
      type: 'LEG_BYE';
      runs: number;
      striker?: string;
      nonStriker?: string;
      bowler?: string;
    }
  | {
      type: 'WICKET';
      wicketType?: string;
      dismissedPlayer?: string;
      newBatsman?: string;
      fielder?: string;
      batRuns?: number;
      striker?: string;
      nonStriker?: string;
      bowler?: string;
    }
  | { type: 'CHANGE_STRIKER' }
  | { type: 'END_OVER'; nextBowler?: string }
  | { type: 'COMPLETE_INNINGS'; reason?: CricketCompletionReason }
  | {
      type: 'START_SECOND_INNINGS';
      battingTeam: 'A' | 'B';
      batsman1?: string;
      batsman2?: string;
      bowler?: string;
      oversLimit?: number;
      target?: number;
    }
  | {
      type: 'STRUCTURED_DELIVERY';
      eventType: CricketDeliveryEventType;
      batRuns?: number;
      extraRuns?: number;
      extraType?: 'NONE' | 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE' | 'PENALTY';
      isWicket?: boolean;
      wicketType?: string;
      dismissedPlayer?: string;
      newBatsman?: string;
      fielder?: string;
      striker?: string;
      nonStriker?: string;
      bowler?: string;
      description?: string;
      countsAsLegalBall?: boolean;
    }
  | {
      type: 'SWITCH_INNINGS';
      battingTeam: 'A' | 'B';
      innings: 1 | 2;
      setTargetFromFirstInnings?: boolean;
    }
  | {
      type: 'UPDATE_META';
      batsman1?: string;
      batsman2?: string;
      bowler?: string;
      target?: number;
      oversLimit?: number;
      playersPerSide?: number;
      teamAShortName?: string;
      teamBShortName?: string;
      tossWinner?: 'A' | 'B' | '';
      tossDecision?: 'BAT' | 'BOWL' | '';
      isSuperOver?: boolean;
      superOverTeamARuns?: number;
      superOverTeamAWickets?: number;
      superOverTeamBRuns?: number;
      superOverTeamBWickets?: number;
    };

export function isCricketScoringLocked(details: Partial<CricketDetails>): {
  locked: boolean;
  reason: string;
} {
  const d = normalizeCricketDetails(details);
  if (d.matchPhase === 'COMPLETED' || d.innings2Locked) {
    return { locked: true, reason: 'Match is already completed. Scoring is locked.' };
  }
  if (d.innings === 1 && (d.matchPhase === 'INNINGS_BREAK' || d.innings1Locked || d.innings1Completed)) {
    return {
      locked: true,
      reason: '1st Innings is completed and locked. Start 2nd Innings to resume scoring.',
    };
  }
  return { locked: false, reason: '' };
}

export function applyCricketAction(
  current: Partial<CricketDetails>,
  action: CricketActionPayload
): {
  details: CricketDetails;
  teamAScore: number;
  teamBScore: number;
  label: string;
  pointsAwarded: number;
  eventCategory: string;
  eventType: string;
  autoCompletedInnings1?: boolean;
  autoCompletedMatch?: boolean;
} {
  const next = normalizeCricketDetails(current);
  const isA = next.battingTeam === 'A';
  const maxWickets = getMaxWickets(next);
  const configuredBalls = Math.max(1, next.oversLimit) * 6;
  const activeExtras = isA ? next.extrasA : next.extrasB;

  let label = 'Cricket score updated';
  let pointsAwarded = 0;
  let eventCategory = 'CRICKET';
  let eventType: string = action.type;
  let autoCompletedInnings1 = false;
  let autoCompletedMatch = false;

  const swapStriker = () => {
    const tmp = next.batsman1;
    next.batsman1 = next.batsman2;
    next.batsman2 = tmp;
  };

  const pushBallEvent = (token: string, legalBallIncrement: number) => {
    const prevBalls = isA ? next.teamABalls : next.teamBBalls;
    const newBalls = prevBalls + legalBallIncrement;
    const updatedRecent = [...next.recentBalls.slice(-11), token];
    if (legalBallIncrement > 0 && newBalls > 0 && newBalls % 6 === 0) {
      next.lastOverSummary = updatedRecent.slice(-6);
      next.recentBalls = [];
    } else {
      next.recentBalls = updatedRecent;
    }
  };

  const checkAutoTransitions = () => {
    const activeRuns = next.battingTeam === 'A' ? next.teamARuns : next.teamBRuns;
    const activeWkts = next.battingTeam === 'A' ? next.teamAWickets : next.teamBWickets;
    const activeBalls = next.battingTeam === 'A' ? next.teamABalls : next.teamBBalls;

    if (next.innings === 1 && !next.innings1Locked) {
      const oversDone = activeBalls >= configuredBalls;
      const allOut = activeWkts >= maxWickets;
      if (oversDone || allOut) {
        next.innings1Completed = true;
        next.innings1Locked = true;
        next.innings1CompletedAt = new Date().toISOString();
        next.innings1CompletionReason = allOut ? 'ALL_OUT' : 'OVERS_COMPLETED';
        next.matchPhase = 'INNINGS_BREAK';
        next.firstInningsBattingTeam = next.battingTeam;
        next.target = activeRuns + 1;
        autoCompletedInnings1 = true;
      }
    } else if (next.innings === 2 && !next.innings2Locked) {
      const targetReached = next.target > 0 && activeRuns >= next.target;
      const oversDone = activeBalls >= configuredBalls;
      const allOut = activeWkts >= maxWickets;
      if (targetReached || oversDone || allOut) {
        next.innings2Locked = true;
        next.innings2CompletedAt = new Date().toISOString();
        next.innings2CompletionReason = targetReached
          ? 'TARGET_REACHED'
          : allOut
            ? 'ALL_OUT'
            : 'OVERS_COMPLETED';
        next.matchPhase = 'COMPLETED';
        autoCompletedMatch = true;
      }
    }
  };

  const recordDeliveryLog = (params: {
    eventType: string;
    token: string;
    batRuns: number;
    extraRuns: number;
    extraType: string;
    totalAdded: number;
    isLegal: boolean;
    isWicket: boolean;
    wicketType?: string;
    dismissedPlayer?: string;
    newBatsman?: string;
    fielder?: string;
    strikerBefore: string;
    nonStrikerBefore: string;
    bowlerUsed: string;
    description?: string;
  }) => {
    const activeRuns = next.battingTeam === 'A' ? next.teamARuns : next.teamBRuns;
    const activeWkts = next.battingTeam === 'A' ? next.teamAWickets : next.teamBWickets;
    const activeBalls = next.battingTeam === 'A' ? next.teamABalls : next.teamBBalls;
    const overText = formatCricketOvers(activeBalls);
    const overNumber = Math.max(1, Math.floor(Math.max(0, activeBalls - (params.isLegal ? 1 : 0)) / 6) + 1);
    const ballInOver = params.isLegal ? ((activeBalls - 1) % 6) + 1 : (activeBalls % 6);

    next.deliveryHistory = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        innings: next.innings,
        battingTeam: next.battingTeam,
        overText,
        overNumber,
        ballInOver,
        eventType: params.eventType,
        batRuns: params.batRuns,
        extraRuns: params.extraRuns,
        extraType: params.extraType,
        totalAdded: params.totalAdded,
        isLegal: params.isLegal,
        isWicket: params.isWicket,
        wicketType: params.wicketType || '',
        dismissedPlayer: params.dismissedPlayer || '',
        newBatsman: params.newBatsman || '',
        fielder: params.fielder || '',
        striker: params.strikerBefore,
        nonStriker: params.nonStrikerBefore,
        bowler: params.bowlerUsed,
        token: params.token,
        scoreSnapshot: `${activeRuns}/${activeWkts}`,
        description: params.description || '',
        timestamp: new Date().toISOString(),
      },
      ...next.deliveryHistory.slice(0, 999),
    ];
  };

  // Convert convenience actions to unified delivery logic
  const processDelivery = (opts: {
    eventType: string;
    batRuns: number;
    extraRuns: number;
    extraType: string;
    isLegal: boolean;
    isWicket: boolean;
    wicketType?: string;
    dismissedPlayer?: string;
    newBatsman?: string;
    fielder?: string;
    striker?: string;
    nonStriker?: string;
    bowler?: string;
    description?: string;
  }) => {
    const lockCheck = isCricketScoringLocked(next);
    if (lockCheck.locked) {
      label = lockCheck.reason;
      return;
    }

    if (opts.striker?.trim()) next.batsman1 = opts.striker.trim();
    if (opts.nonStriker?.trim()) next.batsman2 = opts.nonStriker.trim();
    if (opts.bowler?.trim()) next.bowler = opts.bowler.trim();

    const strikerBefore = next.batsman1.trim();
    const nonStrikerBefore = next.batsman2.trim();
    const bowlerUsed = next.bowler.trim();

    const batRuns = Math.max(0, Math.trunc(opts.batRuns || 0));
    const extraRuns = Math.max(0, Math.trunc(opts.extraRuns || 0));
    const totalAdded = batRuns + extraRuns;
    pointsAwarded = totalAdded;

    if (opts.extraType === 'WIDE') activeExtras.wides += extraRuns;
    else if (opts.extraType === 'NO_BALL') activeExtras.noBalls += extraRuns;
    else if (opts.extraType === 'BYE') activeExtras.byes += extraRuns;
    else if (opts.extraType === 'LEG_BYE') activeExtras.legByes += extraRuns;
    else if (opts.extraType === 'PENALTY') {
      activeExtras.penaltyRuns = (activeExtras.penaltyRuns || 0) + extraRuns;
    }

    let token = String(batRuns);
    if (opts.isWicket) {
      token = totalAdded > 0 ? `${totalAdded}+W` : 'W';
    } else if (opts.extraType === 'WIDE') {
      token = totalAdded > 1 ? `Wd+${totalAdded - 1}` : 'Wd';
    } else if (opts.extraType === 'NO_BALL') {
      token = totalAdded > 1 ? `Nb+${totalAdded - 1}` : 'Nb';
    } else if (opts.extraType === 'BYE') {
      token = `B${extraRuns}`;
    } else if (opts.extraType === 'LEG_BYE') {
      token = `Lb${extraRuns}`;
    } else if (opts.extraType === 'PENALTY') {
      token = `P${extraRuns}`;
    }

    pushBallEvent(token, opts.isLegal ? 1 : 0);

    const wNorm = String(opts.wicketType || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    const isActualDismissal = opts.isWicket && wNorm !== 'RETIRED_HURT';

    if (isA) {
      next.teamARuns += totalAdded;
      if (opts.isLegal) next.teamABalls += 1;
      if (isActualDismissal) next.teamAWickets = Math.min(maxWickets, next.teamAWickets + 1);
    } else {
      next.teamBRuns += totalAdded;
      if (opts.isLegal) next.teamBBalls += 1;
      if (isActualDismissal) next.teamBWickets = Math.min(maxWickets, next.teamBWickets + 1);
    }

    const activeBalls = isA ? next.teamABalls : next.teamBBalls;

    // 1) Handle strike rotation from runs crossed on the delivery
    let crossedRuns = 0;
    if (opts.extraType === 'BYE' || opts.extraType === 'LEG_BYE') {
      crossedRuns = extraRuns + batRuns;
    } else if (opts.extraType === 'WIDE') {
      crossedRuns = Math.max(0, extraRuns - 1) + batRuns;
    } else {
      crossedRuns = batRuns;
    }
    if (crossedRuns % 2 === 1 && next.batsman1 && next.batsman2) {
      swapStriker();
    }

    // 2) Handle wicket batter replacement AFTER crossing check
    const resolvedDismissed =
      opts.dismissedPlayer?.trim() || (opts.isWicket ? strikerBefore : '');
    if (opts.isWicket && opts.newBatsman?.trim()) {
      if (
        resolvedDismissed &&
        next.batsman2 &&
        next.batsman2.toLowerCase() === resolvedDismissed.toLowerCase()
      ) {
        next.batsman2 = opts.newBatsman.trim();
      } else {
        next.batsman1 = opts.newBatsman.trim();
      }
    }

    // 3) Automatic over completion strike rotation on every 6th legal ball
    if (opts.isLegal && activeBalls > 0 && activeBalls % 6 === 0 && next.batsman1 && next.batsman2) {
      swapStriker();
    }

    recordDeliveryLog({
      eventType: opts.eventType,
      token,
      batRuns,
      extraRuns,
      extraType: opts.extraType,
      totalAdded,
      isLegal: opts.isLegal,
      isWicket: opts.isWicket,
      wicketType: opts.wicketType,
      dismissedPlayer: resolvedDismissed,
      newBatsman: opts.newBatsman?.trim() || '',
      fielder: opts.fielder?.trim() || '',
      strikerBefore,
      nonStrikerBefore,
      bowlerUsed,
      description: opts.description?.trim() || '',
    });

    const overText = formatCricketOvers(activeBalls);
    const parts: string[] = [];
    if (opts.isWicket) {
      parts.push(
        `Wicket${opts.wicketType ? ` (${opts.wicketType})` : ''}${
          resolvedDismissed ? `: ${resolvedDismissed}` : ''
        }`
      );
    }
    if (opts.extraType !== 'NONE') {
      parts.push(`${opts.extraType.replace('_', ' ')} +${extraRuns}`);
    }
    if (batRuns > 0) {
      parts.push(`${batRuns} run${batRuns > 1 ? 's' : ''}`);
    }
    if (parts.length === 0) {
      parts.push(opts.eventType === 'CUSTOM_EVENT' ? 'Custom Event' : 'Dot ball');
    }
    if (opts.description?.trim()) {
      parts.push(opts.description.trim());
    }
    label = `[${overText} ov] ${parts.join(' · ')}`;

    checkAutoTransitions();
  };

  switch (action.type) {
    case 'RUNS': {
      const r = Math.max(0, Math.trunc(action.runs || 0));
      processDelivery({
        eventType: 'LEGAL_DELIVERY',
        batRuns: r,
        extraRuns: 0,
        extraType: 'NONE',
        isLegal: true,
        isWicket: false,
        striker: action.striker,
        nonStriker: action.nonStriker,
        bowler: action.bowler,
        description: action.description,
      });
      break;
    }
    case 'WIDE': {
      const total = 1 + Math.max(0, Math.trunc(action.extraRuns || 0));
      processDelivery({
        eventType: 'WIDE',
        batRuns: 0,
        extraRuns: total,
        extraType: 'WIDE',
        isLegal: false,
        isWicket: false,
        striker: action.striker,
        nonStriker: action.nonStriker,
        bowler: action.bowler,
      });
      break;
    }
    case 'NO_BALL': {
      const nbPenalty = 1 + Math.max(0, Math.trunc(action.extraRuns || 0));
      const batR = Math.max(0, Math.trunc(action.batRuns || 0));
      processDelivery({
        eventType: 'NO_BALL',
        batRuns: batR,
        extraRuns: nbPenalty,
        extraType: 'NO_BALL',
        isLegal: false,
        isWicket: false,
        striker: action.striker,
        nonStriker: action.nonStriker,
        bowler: action.bowler,
      });
      break;
    }
    case 'BYE': {
      const r = Math.max(1, Math.trunc(action.runs || 1));
      processDelivery({
        eventType: 'BYE',
        batRuns: 0,
        extraRuns: r,
        extraType: 'BYE',
        isLegal: true,
        isWicket: false,
        striker: action.striker,
        nonStriker: action.nonStriker,
        bowler: action.bowler,
      });
      break;
    }
    case 'LEG_BYE': {
      const r = Math.max(1, Math.trunc(action.runs || 1));
      processDelivery({
        eventType: 'LEG_BYE',
        batRuns: 0,
        extraRuns: r,
        extraType: 'LEG_BYE',
        isLegal: true,
        isWicket: false,
        striker: action.striker,
        nonStriker: action.nonStriker,
        bowler: action.bowler,
      });
      break;
    }
    case 'WICKET': {
      processDelivery({
        eventType: 'WICKET',
        batRuns: Math.max(0, Math.trunc(action.batRuns || 0)),
        extraRuns: 0,
        extraType: 'NONE',
        isLegal: true,
        isWicket: true,
        wicketType: action.wicketType || 'Out',
        dismissedPlayer: action.dismissedPlayer,
        newBatsman: action.newBatsman,
        fielder: action.fielder,
        striker: action.striker,
        nonStriker: action.nonStriker,
        bowler: action.bowler,
      });
      break;
    }
    case 'CHANGE_STRIKER': {
      eventCategory = 'META';
      swapStriker();
      label = next.batsman1
        ? `Striker rotated: ${next.batsman1} on strike`
        : 'Striker rotated';
      break;
    }
    case 'END_OVER': {
      eventCategory = 'META';
      const lockCheck = isCricketScoringLocked(next);
      if (lockCheck.locked) {
        label = lockCheck.reason;
        break;
      }
      const activeBalls = isA ? next.teamABalls : next.teamBBalls;
      const rem = activeBalls % 6;
      if (rem !== 0) {
        const pad = 6 - rem;
        if (isA) next.teamABalls += pad;
        else next.teamBBalls += pad;
      }
      if (next.batsman1 && next.batsman2) swapStriker();
      if (action.nextBowler?.trim()) {
        next.bowler = action.nextBowler.trim();
      }
      next.lastOverSummary = next.recentBalls.slice(-6);
      next.recentBalls = [];
      const oversDone = Math.floor((isA ? next.teamABalls : next.teamBBalls) / 6);
      label = `End of Over ${oversDone}`;
      checkAutoTransitions();
      break;
    }
    case 'COMPLETE_INNINGS': {
      eventCategory = 'META';
      if (next.innings === 1) {
        const firstRuns = isA ? next.teamARuns : next.teamBRuns;
        next.innings1Completed = true;
        next.innings1Locked = true;
        next.innings1CompletedAt = new Date().toISOString();
        next.innings1CompletionReason = action.reason || 'MANUAL';
        next.matchPhase = 'INNINGS_BREAK';
        next.firstInningsBattingTeam = next.battingTeam;
        next.target = firstRuns + 1;
        label = `1st Innings Completed (${firstRuns}/${isA ? next.teamAWickets : next.teamBWickets}). Target: ${next.target}`;
      } else {
        next.innings2Locked = true;
        next.innings2CompletedAt = new Date().toISOString();
        next.innings2CompletionReason = action.reason || 'MANUAL';
        next.matchPhase = 'COMPLETED';
        label = '2nd Innings Completed';
      }
      break;
    }
    case 'START_SECOND_INNINGS': {
      eventCategory = 'META';
      const firstSide: 'A' | 'B' =
        next.firstInningsBattingTeam === 'A' || next.firstInningsBattingTeam === 'B'
          ? next.firstInningsBattingTeam
          : next.battingTeam;
      const firstRuns = firstSide === 'A' ? next.teamARuns : next.teamBRuns;
      next.firstInningsBattingTeam = firstSide;
      next.innings1Completed = true;
      next.innings1Locked = true;
      next.innings = 2;
      next.battingTeam = action.battingTeam;
      next.innings2Started = true;
      next.innings2Locked = false;
      next.innings2StartedAt = new Date().toISOString();
      next.matchPhase = 'SECOND_INNINGS';
      next.target =
        typeof action.target === 'number' && action.target > 0 ? action.target : firstRuns + 1;
      if (typeof action.oversLimit === 'number' && action.oversLimit >= 1) {
        next.oversLimit = Math.max(1, Math.min(90, Math.floor(action.oversLimit)));
      }
      if (action.batsman1 !== undefined) next.batsman1 = action.batsman1.trim();
      if (action.batsman2 !== undefined) next.batsman2 = action.batsman2.trim();
      if (action.bowler !== undefined) next.bowler = action.bowler.trim();
      next.recentBalls = [];
      next.lastOverSummary = [];
      label = `2nd Innings Started · Target ${next.target}`;
      break;
    }
    case 'STRUCTURED_DELIVERY': {
      eventType = action.eventType;
      const batRuns = Math.max(0, Math.trunc(action.batRuns || 0));
      let extraRuns = Math.max(0, Math.trunc(action.extraRuns || 0));
      const extraType =
        action.extraType ||
        (action.eventType === 'WIDE'
          ? 'WIDE'
          : action.eventType === 'NO_BALL'
            ? 'NO_BALL'
            : action.eventType === 'BYE'
              ? 'BYE'
              : action.eventType === 'LEG_BYE'
                ? 'LEG_BYE'
                : action.eventType === 'PENALTY_RUNS'
                  ? 'PENALTY'
                  : 'NONE');

      if ((extraType === 'WIDE' || extraType === 'NO_BALL') && extraRuns === 0) {
        extraRuns = 1;
      }

      const isLegalBall =
        typeof action.countsAsLegalBall === 'boolean'
          ? action.countsAsLegalBall
          : extraType !== 'WIDE' &&
            extraType !== 'NO_BALL' &&
            action.eventType !== 'PENALTY_RUNS';

      processDelivery({
        eventType: action.eventType,
        batRuns,
        extraRuns,
        extraType,
        isLegal: isLegalBall,
        isWicket: Boolean(action.isWicket || action.eventType === 'WICKET'),
        wicketType: action.wicketType,
        dismissedPlayer: action.dismissedPlayer,
        newBatsman: action.newBatsman,
        fielder: action.fielder,
        striker: action.striker,
        nonStriker: action.nonStriker,
        bowler: action.bowler,
        description: action.description,
      });
      break;
    }
    case 'SWITCH_INNINGS': {
      eventCategory = 'META';
      const prevBatting = next.battingTeam;
      next.battingTeam = action.battingTeam;
      next.innings = action.innings;
      if (action.innings === 2) {
        next.firstInningsBattingTeam = action.battingTeam === 'A' ? 'B' : 'A';
        next.innings1Completed = true;
        next.innings1Locked = true;
        next.innings2Started = true;
        next.innings2Locked = false;
        next.innings2StartedAt = next.innings2StartedAt || new Date().toISOString();
        next.matchPhase = 'SECOND_INNINGS';
      } else {
        next.firstInningsBattingTeam = action.battingTeam;
        next.innings1Completed = false;
        next.innings1Locked = false;
        next.matchPhase = 'FIRST_INNINGS';
      }
      if (action.setTargetFromFirstInnings) {
        const firstRuns =
          action.battingTeam === 'B'
            ? next.teamARuns
            : prevBatting === 'B'
              ? next.teamBRuns
              : next.teamARuns;
        next.target = firstRuns + 1;
      }
      next.recentBalls = [];
      next.lastOverSummary = [];
      label = `Switched to Innings ${action.innings} (Team ${action.battingTeam} batting)`;
      break;
    }
    case 'UPDATE_META': {
      eventCategory = 'META';
      if (action.batsman1 !== undefined) next.batsman1 = action.batsman1;
      if (action.batsman2 !== undefined) next.batsman2 = action.batsman2;
      if (action.bowler !== undefined) next.bowler = action.bowler;
      if (action.target !== undefined) next.target = Math.max(0, Number(action.target) || 0);
      if (action.oversLimit !== undefined) {
        next.oversLimit = Math.max(1, Math.min(90, Math.floor(Number(action.oversLimit) || 20)));
      }
      if (action.playersPerSide !== undefined) {
        next.playersPerSide = Math.max(2, Math.min(15, Math.floor(Number(action.playersPerSide) || 11)));
      }
      if (action.teamAShortName !== undefined) {
        next.teamAShortName = action.teamAShortName.trim().toUpperCase().slice(0, 6);
      }
      if (action.teamBShortName !== undefined) {
        next.teamBShortName = action.teamBShortName.trim().toUpperCase().slice(0, 6);
      }
      if (action.tossWinner !== undefined) next.tossWinner = action.tossWinner;
      if (action.tossDecision !== undefined) next.tossDecision = action.tossDecision;
      if (action.isSuperOver !== undefined) next.isSuperOver = action.isSuperOver;
      if (action.superOverTeamARuns !== undefined) {
        next.superOverTeamARuns = Math.max(0, Number(action.superOverTeamARuns) || 0);
      }
      if (action.superOverTeamAWickets !== undefined) {
        next.superOverTeamAWickets = Math.max(0, Math.min(2, Number(action.superOverTeamAWickets) || 0));
      }
      if (action.superOverTeamBRuns !== undefined) {
        next.superOverTeamBRuns = Math.max(0, Number(action.superOverTeamBRuns) || 0);
      }
      if (action.superOverTeamBWickets !== undefined) {
        next.superOverTeamBWickets = Math.max(0, Math.min(2, Number(action.superOverTeamBWickets) || 0));
      }
      label = action.isSuperOver ? 'Updated Cricket Super Over & match info' : 'Updated match & player info';
      break;
    }
  }

  return {
    details: next,
    teamAScore: next.teamARuns,
    teamBScore: next.teamBRuns,
    label,
    pointsAwarded,
    eventCategory,
    eventType,
    autoCompletedInnings1,
    autoCompletedMatch,
  };
}

export interface CricketCreaseBatterStat {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: string;
  onStrike: boolean;
}

export interface CricketCreaseBowlerStat {
  name: string;
  overs: string;
  maidens: number;
  runsConceded: number;
  wickets: number;
  economy: string;
}

export interface CricketCreaseSummary {
  innings: 1 | 2;
  batsman1: CricketCreaseBatterStat | null;
  batsman2: CricketCreaseBatterStat | null;
  bowler: CricketCreaseBowlerStat | null;
}

export function getCricketCreaseSummary(
  raw?: (Partial<CricketDetails> & { creaseSummary?: Partial<CricketCreaseSummary> }) | null,
  teamAName = 'Team A',
  teamBName = 'Team B'
): CricketCreaseSummary {
  const d = normalizeCricketDetails(raw);
  const inningsNum: 1 | 2 = d.innings === 2 ? 2 : 1;
  const fallback = raw?.creaseSummary;

  if (d.deliveryHistory.length === 0 && fallback) {
    return {
      innings: inningsNum,
      batsman1:
        fallback.batsman1 ||
        (d.batsman1
          ? {
              name: d.batsman1,
              runs: 0,
              balls: 0,
              fours: 0,
              sixes: 0,
              strikeRate: '0.0',
              onStrike: true,
            }
          : null),
      batsman2:
        fallback.batsman2 ||
        (d.batsman2
          ? {
              name: d.batsman2,
              runs: 0,
              balls: 0,
              fours: 0,
              sixes: 0,
              strikeRate: '0.0',
              onStrike: false,
            }
          : null),
      bowler:
        fallback.bowler ||
        (d.bowler
          ? {
              name: d.bowler,
              overs: '0.0',
              maidens: 0,
              runsConceded: 0,
              wickets: 0,
              economy: '0.00',
            }
          : null),
    };
  }

  const card = deriveCricketInningsScorecard(d, inningsNum, teamAName, teamBName);
  const findBatter = (name: string): CricketBatterRow | undefined => {
    const clean = name.trim().toLowerCase();
    if (!clean) return undefined;
    return card.batting.find((b) => b.name.trim().toLowerCase() === clean);
  };
  const findBowler = (name: string): CricketBowlerRow | undefined => {
    const clean = name.trim().toLowerCase();
    if (!clean) return undefined;
    return card.bowling.find((bw) => bw.name.trim().toLowerCase() === clean);
  };

  const b1Name = (d.batsman1 || '').trim();
  const b2Name = (d.batsman2 || '').trim();
  const bwName = (d.bowler || '').trim();

  const b1Row = b1Name ? findBatter(b1Name) : undefined;
  const b2Row = b2Name ? findBatter(b2Name) : undefined;
  const bwRow = bwName ? findBowler(bwName) : undefined;

  const batsman1: CricketCreaseBatterStat | null = b1Name
    ? {
        name: b1Row?.name || b1Name,
        runs: b1Row?.runs ?? 0,
        balls: b1Row?.balls ?? 0,
        fours: b1Row?.fours ?? 0,
        sixes: b1Row?.sixes ?? 0,
        strikeRate: b1Row?.strikeRate ?? '0.0',
        onStrike: true,
      }
    : null;

  const batsman2: CricketCreaseBatterStat | null = b2Name
    ? {
        name: b2Row?.name || b2Name,
        runs: b2Row?.runs ?? 0,
        balls: b2Row?.balls ?? 0,
        fours: b2Row?.fours ?? 0,
        sixes: b2Row?.sixes ?? 0,
        strikeRate: b2Row?.strikeRate ?? '0.0',
        onStrike: false,
      }
    : null;

  const bowler: CricketCreaseBowlerStat | null = bwName
    ? {
        name: bwRow?.name || bwName,
        overs: bwRow?.overs ?? '0.0',
        maidens: bwRow?.maidens ?? 0,
        runsConceded: bwRow?.runsConceded ?? 0,
        wickets: bwRow?.wickets ?? 0,
        economy: bwRow?.economy ?? '0.00',
      }
    : null;

  return {
    innings: inningsNum,
    batsman1,
    batsman2,
    bowler,
  };
}

