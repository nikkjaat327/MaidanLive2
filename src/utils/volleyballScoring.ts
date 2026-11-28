export interface VolleyballSetScore {
  set: number;
  teamA: number;
  teamB: number;
  winner?: 'A' | 'B' | null;
}

export interface VolleyballEventItem {
  id: string;
  set: number;
  team: 'A' | 'B';
  eventType: string;
  points: number;
  playerName?: string;
  description?: string;
  scoreSnapshot: string;
  timestamp: string;
}

export interface VolleyballRules {
  bestOfSets: number; // Odd positive integer >= 1 (e.g., 1, 3, 5, 7, 9)
  pointsPerSet: number; // Default 25
  minMargin: number; // Default 2
  finalSetPoints: number; // Default 15
  finalSetMinMargin: number; // Default 2
  autoCompleteSets: boolean; // Default true
  allowManualWinnerDeclaration: boolean; // Default true
  allowMatchReopen: boolean; // Default true
}

export interface VolleyballDetails {
  rules: VolleyballRules;
  bestOfSets: number;
  winningThreshold: number;
  currentSet: number;
  servingTeam: 'A' | 'B';
  teamASetsWon: number;
  teamBSetsWon: number;
  setScores: VolleyballSetScore[];
  advantageTeam: 'A' | 'B' | null;
  isDeuce: boolean;
  matchCompleted: boolean;
  completedReason: 'THRESHOLD_REACHED' | 'MANUAL_DECISION' | '';
  manualWinnerSide: 'A' | 'B' | null;
  manualWinnerReason: string;
  reopenedCount: number;
  lastReopenedAt: string | null;
  allowCustomMultiPoint: boolean;
  tossWinner?: 'A' | 'B' | '';
  tossDecision?: 'SERVE' | 'RECEIVE' | '';
  eventHistory: VolleyballEventItem[];
}

export const VOLLEYBALL_SET_PRESETS = [3, 5, 7] as const;

export function createDefaultVolleyballRules(
  overrides?: Partial<VolleyballRules> | null
): VolleyballRules {
  const bestOfRaw = Number(overrides?.bestOfSets);
  const bestOfSets =
    Number.isInteger(bestOfRaw) && bestOfRaw >= 1 && bestOfRaw <= 15 && bestOfRaw % 2 === 1
      ? bestOfRaw
      : 5;
  const pointsPerSetRaw = Number(overrides?.pointsPerSet);
  const pointsPerSet =
    Number.isFinite(pointsPerSetRaw) && pointsPerSetRaw >= 5 && pointsPerSetRaw <= 99
      ? Math.trunc(pointsPerSetRaw)
      : 25;
  const minMarginRaw = Number(overrides?.minMargin);
  const minMargin =
    Number.isFinite(minMarginRaw) && minMarginRaw >= 1 && minMarginRaw <= 10
      ? Math.trunc(minMarginRaw)
      : 2;
  const finalSetPointsRaw = Number(overrides?.finalSetPoints);
  const finalSetPoints =
    Number.isFinite(finalSetPointsRaw) && finalSetPointsRaw >= 5 && finalSetPointsRaw <= 99
      ? Math.trunc(finalSetPointsRaw)
      : 15;
  const finalSetMinMarginRaw = Number(overrides?.finalSetMinMargin);
  const finalSetMinMargin =
    Number.isFinite(finalSetMinMarginRaw) &&
    finalSetMinMarginRaw >= 1 &&
    finalSetMinMarginRaw <= 10
      ? Math.trunc(finalSetMinMarginRaw)
      : 2;

  return {
    bestOfSets,
    pointsPerSet,
    minMargin,
    finalSetPoints,
    finalSetMinMargin,
    autoCompleteSets: overrides?.autoCompleteSets !== false,
    allowManualWinnerDeclaration: overrides?.allowManualWinnerDeclaration !== false,
    allowMatchReopen: overrides?.allowMatchReopen !== false,
  };
}

export function validateVolleyballRules(
  input: Partial<VolleyballRules> & { bestOfSets?: unknown }
): { valid: boolean; error?: string; rules: VolleyballRules } {
  const fallback = createDefaultVolleyballRules();

  if (input.bestOfSets !== undefined) {
    const raw = Number(input.bestOfSets);
    if (!Number.isInteger(raw) || raw < 1 || raw > 15 || raw % 2 === 0) {
      return {
        valid: false,
        error: 'Total sets must be a valid odd number between 1 and 15 (e.g., 1, 3, 5, 7, 9).',
        rules: fallback,
      };
    }
  }

  if (input.pointsPerSet !== undefined) {
    const pts = Number(input.pointsPerSet);
    if (!Number.isInteger(pts) || pts < 5 || pts > 99) {
      return {
        valid: false,
        error: 'Points per set must be an integer between 5 and 99.',
        rules: fallback,
      };
    }
  }

  if (input.minMargin !== undefined) {
    const margin = Number(input.minMargin);
    if (!Number.isInteger(margin) || margin < 1 || margin > 10) {
      return {
        valid: false,
        error: 'Minimum winning margin must be an integer between 1 and 10.',
        rules: fallback,
      };
    }
  }

  if (input.finalSetPoints !== undefined) {
    const fPts = Number(input.finalSetPoints);
    if (!Number.isInteger(fPts) || fPts < 5 || fPts > 99) {
      return {
        valid: false,
        error: 'Final deciding set points must be an integer between 5 and 99.',
        rules: fallback,
      };
    }
  }

  if (input.finalSetMinMargin !== undefined) {
    const fMargin = Number(input.finalSetMinMargin);
    if (!Number.isInteger(fMargin) || fMargin < 1 || fMargin > 10) {
      return {
        valid: false,
        error: 'Final deciding set minimum margin must be an integer between 1 and 10.',
        rules: fallback,
      };
    }
  }

  return {
    valid: true,
    rules: createDefaultVolleyballRules(input),
  };
}

export function getVolleyballSetTargets(
  setNumber: number,
  rules: VolleyballRules
): { targetPoints: number; requiredMargin: number; isDecidingSet: boolean } {
  const isDecidingSet = rules.bestOfSets > 1 && setNumber >= rules.bestOfSets;
  return {
    targetPoints: isDecidingSet ? rules.finalSetPoints : rules.pointsPerSet,
    requiredMargin: isDecidingSet ? rules.finalSetMinMargin : rules.minMargin,
    isDecidingSet,
  };
}

export interface VolleyballAdvantageEval {
  isDeuce: boolean;
  advantageTeam: 'A' | 'B' | null;
  qualifiesForSetWin: 'A' | 'B' | null;
  targetPoints: number;
  requiredMargin: number;
  isDecidingSet: boolean;
}

export function computeVolleyballAdvantageState(
  scoreA: number,
  scoreB: number,
  currentSet: number,
  rules: VolleyballRules,
  explicitAdvantageTeam?: 'A' | 'B' | null
): VolleyballAdvantageEval {
  const { targetPoints, requiredMargin, isDecidingSet } = getVolleyballSetTargets(currentSet, rules);
  const safeA = Math.max(0, Math.trunc(Number(scoreA) || 0));
  const safeB = Math.max(0, Math.trunc(Number(scoreB) || 0));
  const diff = safeA - safeB;

  const qualifiesForSetWin: 'A' | 'B' | null =
    safeA >= targetPoints && diff >= requiredMargin
      ? 'A'
      : safeB >= targetPoints && -diff >= requiredMargin
        ? 'B'
        : null;

  if (qualifiesForSetWin) {
    return {
      isDeuce: false,
      advantageTeam: null,
      qualifiesForSetWin,
      targetPoints,
      requiredMargin,
      isDecidingSet,
    };
  }

  const deuceFloor = Math.max(0, targetPoints - 1);
  if (requiredMargin >= 2 && safeA >= deuceFloor && safeB >= deuceFloor) {
    if (diff === 0) {
      return {
        isDeuce: true,
        advantageTeam: explicitAdvantageTeam ?? null,
        qualifiesForSetWin: null,
        targetPoints,
        requiredMargin,
        isDecidingSet,
      };
    }
    return {
      isDeuce: false,
      advantageTeam: diff > 0 ? 'A' : 'B',
      qualifiesForSetWin: null,
      targetPoints,
      requiredMargin,
      isDecidingSet,
    };
  }

  return {
    isDeuce: false,
    advantageTeam: explicitAdvantageTeam ?? null,
    qualifiesForSetWin: null,
    targetPoints,
    requiredMargin,
    isDecidingSet,
  };
}

export function createInitialVolleyballDetails(
  rulesOverride?: Partial<VolleyballRules> | null
): VolleyballDetails {
  const rules = createDefaultVolleyballRules(rulesOverride);
  return {
    rules,
    bestOfSets: rules.bestOfSets,
    winningThreshold: Math.ceil(rules.bestOfSets / 2),
    currentSet: 1,
    servingTeam: 'A',
    teamASetsWon: 0,
    teamBSetsWon: 0,
    setScores: [{ set: 1, teamA: 0, teamB: 0, winner: null }],
    advantageTeam: null,
    isDeuce: false,
    matchCompleted: false,
    completedReason: '',
    manualWinnerSide: null,
    manualWinnerReason: '',
    reopenedCount: 0,
    lastReopenedAt: null,
    allowCustomMultiPoint: false,
    tossWinner: '',
    tossDecision: '',
    eventHistory: [],
  };
}

export function normalizeVolleyballDetails(
  raw?: Partial<VolleyballDetails> | Record<string, unknown> | null,
  overrideRules?: Partial<VolleyballRules> | null
): VolleyballDetails {
  const src = (raw || {}) as Partial<VolleyballDetails>;
  const legacyBestOf = Number(src.bestOfSets);
  const rawRules = (src.rules || {}) as Partial<VolleyballRules>;
  const mergedRules = createDefaultVolleyballRules({
    ...rawRules,
    ...(rawRules.bestOfSets === undefined &&
    Number.isInteger(legacyBestOf) &&
    legacyBestOf >= 1 &&
    legacyBestOf <= 15 &&
    legacyBestOf % 2 === 1
      ? { bestOfSets: legacyBestOf }
      : {}),
    ...(overrideRules || {}),
  });

  const bestOfSets = mergedRules.bestOfSets;
  const winningThreshold = Math.ceil(bestOfSets / 2);

  // Deduplicate setScores by set number within 1..bestOfSets and recompute exact sets won
  const setMap = new Map<number, VolleyballSetScore>();
  if (Array.isArray(src.setScores)) {
    for (const entry of src.setScores) {
      if (!entry || typeof entry !== 'object') continue;
      const setNum = Math.trunc(Number(entry.set));
      if (!Number.isInteger(setNum) || setNum < 1 || setNum > bestOfSets) continue;
      const winner: 'A' | 'B' | null =
        entry.winner === 'A' || entry.winner === 'B' ? entry.winner : null;
      setMap.set(setNum, {
        set: setNum,
        teamA: Math.max(0, Math.trunc(Number(entry.teamA) || 0)),
        teamB: Math.max(0, Math.trunc(Number(entry.teamB) || 0)),
        winner,
      });
    }
  }

  if (setMap.size === 0) {
    setMap.set(1, { set: 1, teamA: 0, teamB: 0, winner: null });
  }

  const rawCurrentSet = Math.trunc(Number(src.currentSet) || 1);
  const currentSet = Math.max(1, Math.min(bestOfSets, rawCurrentSet));
  if (!setMap.has(currentSet)) {
    setMap.set(currentSet, { set: currentSet, teamA: 0, teamB: 0, winner: null });
  }

  const sortedSets = Array.from(setMap.values()).sort((a, b) => a.set - b.set);

  // Enforce strict winning threshold & set limits when counting sets won
  let teamASetsWon = 0;
  let teamBSetsWon = 0;
  for (const s of sortedSets) {
    if (teamASetsWon >= winningThreshold || teamBSetsWon >= winningThreshold) {
      s.winner = null;
      continue;
    }
    if (s.winner === 'A') teamASetsWon += 1;
    else if (s.winner === 'B') teamBSetsWon += 1;
  }

  const activeSet = sortedSets.find((s) => s.set === currentSet) || sortedSets[0];
  const explicitAdv: 'A' | 'B' | null =
    src.advantageTeam === 'A' || src.advantageTeam === 'B' ? src.advantageTeam : null;
  const matchCompleted = Boolean(src.matchCompleted);

  const advEval = computeVolleyballAdvantageState(
    activeSet.teamA,
    activeSet.teamB,
    currentSet,
    mergedRules,
    matchCompleted ? null : explicitAdv
  );

  return {
    rules: mergedRules,
    bestOfSets,
    winningThreshold,
    currentSet,
    servingTeam: src.servingTeam === 'B' ? 'B' : 'A',
    teamASetsWon,
    teamBSetsWon,
    setScores: sortedSets,
    advantageTeam: matchCompleted ? null : advEval.advantageTeam,
    isDeuce: matchCompleted ? false : advEval.isDeuce,
    matchCompleted,
    completedReason:
      src.completedReason === 'THRESHOLD_REACHED' || src.completedReason === 'MANUAL_DECISION'
        ? src.completedReason
        : '',
    manualWinnerSide:
      src.manualWinnerSide === 'A' || src.manualWinnerSide === 'B' ? src.manualWinnerSide : null,
    manualWinnerReason: typeof src.manualWinnerReason === 'string' ? src.manualWinnerReason : '',
    reopenedCount: Math.max(0, Math.trunc(Number(src.reopenedCount) || 0)),
    lastReopenedAt: typeof src.lastReopenedAt === 'string' ? src.lastReopenedAt : null,
    allowCustomMultiPoint: Boolean(src.allowCustomMultiPoint),
    tossWinner: src.tossWinner === 'A' || src.tossWinner === 'B' ? src.tossWinner : '',
    tossDecision:
      src.tossDecision === 'SERVE' || src.tossDecision === 'RECEIVE' ? src.tossDecision : '',
    eventHistory: Array.isArray(src.eventHistory) ? src.eventHistory.slice(0, 50) : [],
  };
}

export function hasVolleyballScoringStarted(
  details?: Partial<VolleyballDetails> | Record<string, unknown> | null,
  teamAScore = 0,
  teamBScore = 0
): boolean {
  if ((teamAScore || 0) > 0 || (teamBScore || 0) > 0) return true;
  if (!details) return false;
  const d = normalizeVolleyballDetails(details);
  return Boolean(
    d.currentSet > 1 ||
      d.teamASetsWon > 0 ||
      d.teamBSetsWon > 0 ||
      d.matchCompleted ||
      d.eventHistory.length > 0 ||
      d.setScores.some((s) => s.teamA > 0 || s.teamB > 0 || s.winner === 'A' || s.winner === 'B')
  );
}

export function getVolleyballCompletionEligibility(details: VolleyballDetails): {
  completedSetCount: number;
  winningThreshold: number;
  thresholdWinnerSide: 'A' | 'B' | null;
  thresholdReached: boolean;
  canStartAnotherSet: boolean;
} {
  const winningThreshold = Math.ceil(details.bestOfSets / 2);
  const completedSetCount = details.setScores.filter(
    (s) => s.winner === 'A' || s.winner === 'B'
  ).length;
  const thresholdWinnerSide: 'A' | 'B' | null =
    details.teamASetsWon >= winningThreshold
      ? 'A'
      : details.teamBSetsWon >= winningThreshold
        ? 'B'
        : null;
  const thresholdReached = thresholdWinnerSide !== null;
  const canStartAnotherSet =
    !details.matchCompleted && !thresholdReached && details.setScores.length < details.bestOfSets;

  return {
    completedSetCount,
    winningThreshold,
    thresholdWinnerSide,
    thresholdReached,
    canStartAnotherSet,
  };
}

export function isVolleyballScoringLocked(
  details?: Partial<VolleyballDetails> | Record<string, unknown> | null,
  resultStatus?: string
): { locked: boolean; reason: string } {
  const norm = normalizeVolleyballDetails(details);
  if (norm.matchCompleted || (resultStatus && resultStatus !== 'NOT_DECLARED')) {
    return {
      locked: true,
      reason:
        'Volleyball match is completed and locked. Reopen / Resume the match to modify scores or sets.',
    };
  }
  return { locked: false, reason: '' };
}

export type VolleyballEventType =
  | 'ATTACK_POINT'
  | 'BLOCK_POINT'
  | 'SERVICE_ACE'
  | 'OPPONENT_ERROR'
  | 'NET_FAULT'
  | 'SERVICE_FAULT'
  | 'ROTATION_FAULT'
  | 'PENALTY_POINT'
  | 'CUSTOM_EVENT';

export type VolleyballActionPayload =
  | { type: 'POINT'; team: 'A' | 'B'; delta: number }
  | {
      type: 'STRUCTURED_POINT';
      team: 'A' | 'B';
      eventType: VolleyballEventType;
      points?: number;
      playerName?: string;
      description?: string;
    }
  | { type: 'COMPLETE_SET'; winner: 'A' | 'B' }
  | { type: 'SET_CURRENT_SET'; setNumber: number }
  | { type: 'SET_SERVING_TEAM'; team: 'A' | 'B' }
  | { type: 'SET_BEST_OF'; bestOfSets: number }
  | { type: 'UPDATE_RULES'; rules: Partial<VolleyballRules> }
  | { type: 'SET_ADVANTAGE'; team: 'A' | 'B' | null }
  | { type: 'SET_CUSTOM_MULTI_POINT'; enabled: boolean }
  | {
      type: 'SET_PRE_MATCH_SETUP';
      servingTeam?: 'A' | 'B';
      tossWinner?: 'A' | 'B' | '';
      tossDecision?: 'SERVE' | 'RECEIVE' | '';
    };

export interface ApplyVolleyballActionResult {
  details: VolleyballDetails;
  teamAScore: number;
  teamBScore: number;
  label: string;
  pointsAwarded: number;
  eventCategory: string;
  eventType: string;
  autoCompletedSet?: boolean;
  autoCompletedMatch?: boolean;
  autoWinnerSide?: 'A' | 'B' | null;
  blockedReason?: string;
}

function finalizeSetWin(
  next: VolleyballDetails,
  activeIdx: number,
  winner: 'A' | 'B',
  currentScoreA: number,
  currentScoreB: number
): {
  teamAScore: number;
  teamBScore: number;
  autoCompletedMatch: boolean;
  autoWinnerSide: 'A' | 'B' | null;
  nextSetStarted: number | null;
} {
  next.setScores[activeIdx].winner = winner;
  next.setScores[activeIdx].teamA = currentScoreA;
  next.setScores[activeIdx].teamB = currentScoreB;

  let setsA = 0;
  let setsB = 0;
  for (const s of next.setScores) {
    if (s.winner === 'A') setsA += 1;
    else if (s.winner === 'B') setsB += 1;
  }
  next.teamASetsWon = setsA;
  next.teamBSetsWon = setsB;
  next.advantageTeam = null;
  next.isDeuce = false;

  const threshold = Math.ceil(next.bestOfSets / 2);
  const matchDecided = setsA >= threshold || setsB >= threshold;

  if (!matchDecided && next.currentSet < next.bestOfSets) {
    const nextSetNum = next.currentSet + 1;
    next.currentSet = nextSetNum;
    const existingNext = next.setScores.find((s) => s.set === nextSetNum);
    if (!existingNext) {
      next.setScores.push({ set: nextSetNum, teamA: 0, teamB: 0, winner: null });
      next.setScores.sort((a, b) => a.set - b.set);
      return {
        teamAScore: 0,
        teamBScore: 0,
        autoCompletedMatch: false,
        autoWinnerSide: null,
        nextSetStarted: nextSetNum,
      };
    }
    return {
      teamAScore: existingNext.teamA,
      teamBScore: existingNext.teamB,
      autoCompletedMatch: false,
      autoWinnerSide: null,
      nextSetStarted: nextSetNum,
    };
  }

  if (matchDecided) {
    const winSide: 'A' | 'B' = setsA >= threshold ? 'A' : 'B';
    next.matchCompleted = true;
    next.completedReason = 'THRESHOLD_REACHED';
    return {
      teamAScore: currentScoreA,
      teamBScore: currentScoreB,
      autoCompletedMatch: true,
      autoWinnerSide: winSide,
      nextSetStarted: null,
    };
  }

  return {
    teamAScore: currentScoreA,
    teamBScore: currentScoreB,
    autoCompletedMatch: false,
    autoWinnerSide: null,
    nextSetStarted: null,
  };
}

export function applyVolleyballAction(
  current: Partial<VolleyballDetails> | Record<string, unknown> | null,
  currentTeamAScore: number,
  currentTeamBScore: number,
  action: VolleyballActionPayload
): ApplyVolleyballActionResult {
  const next = normalizeVolleyballDetails(current);
  let teamAScore = Math.max(0, Math.trunc(Number(currentTeamAScore) || 0));
  let teamBScore = Math.max(0, Math.trunc(Number(currentTeamBScore) || 0));
  let label = 'Volleyball score updated';
  let pointsAwarded = 0;
  let eventCategory = 'VOLLEYBALL';
  let eventType: string = action.type;
  let autoCompletedSet = false;
  let autoCompletedMatch = false;
  let autoWinnerSide: 'A' | 'B' | null = null;

  if (next.matchCompleted) {
    return {
      details: next,
      teamAScore,
      teamBScore,
      label: 'Match is completed and locked.',
      pointsAwarded: 0,
      eventCategory: 'CONTROL',
      eventType: action.type,
      blockedReason:
        'Volleyball match is completed and locked. Reopen or Resume the match to make changes.',
    };
  }

  let activeIdx = next.setScores.findIndex((s) => s.set === next.currentSet);
  if (activeIdx === -1) {
    next.setScores.push({ set: next.currentSet, teamA: teamAScore, teamB: teamBScore, winner: null });
    next.setScores.sort((a, b) => a.set - b.set);
    activeIdx = next.setScores.findIndex((s) => s.set === next.currentSet);
  } else {
    // Sync current active scores onto the active set entry cleanly
    next.setScores[activeIdx].teamA = teamAScore;
    next.setScores[activeIdx].teamB = teamBScore;
  }

  const evaluateAfterPoint = (scoredTeam: 'A' | 'B', isPositivePoint: boolean) => {
    // If explicit advantage belonged to the opposing team and this team scored, clear manual advantage
    let carryExplicitAdv: 'A' | 'B' | null = next.advantageTeam;
    if (isPositivePoint && carryExplicitAdv && carryExplicitAdv !== scoredTeam) {
      carryExplicitAdv = null;
    } else if (!isPositivePoint) {
      carryExplicitAdv = null;
    }

    const adv = computeVolleyballAdvantageState(
      teamAScore,
      teamBScore,
      next.currentSet,
      next.rules,
      carryExplicitAdv
    );
    next.advantageTeam = adv.advantageTeam;
    next.isDeuce = adv.isDeuce;

    if (
      next.rules.autoCompleteSets &&
      adv.qualifiesForSetWin &&
      !next.setScores[activeIdx].winner
    ) {
      const completedSetNum = next.currentSet;
      const winSide = adv.qualifiesForSetWin;
      const fin = finalizeSetWin(next, activeIdx, winSide, teamAScore, teamBScore);
      teamAScore = fin.teamAScore;
      teamBScore = fin.teamBScore;
      autoCompletedSet = true;
      autoCompletedMatch = fin.autoCompletedMatch;
      autoWinnerSide = fin.autoWinnerSide;
      if (fin.autoCompletedMatch) {
        label = `${label} · Set ${completedSetNum} & Match won by Team ${winSide} (Sets ${next.teamASetsWon}-${next.teamBSetsWon})`;
      } else if (fin.nextSetStarted) {
        label = `${label} · Set ${completedSetNum} won by Team ${winSide} · Starting Set ${fin.nextSetStarted}`;
      }
    }
  };

  if (action.type === 'POINT') {
    if (next.setScores[activeIdx].winner) {
      return {
        details: next,
        teamAScore,
        teamBScore,
        label: `Set ${next.currentSet} is already completed.`,
        pointsAwarded: 0,
        eventCategory: 'CONTROL',
        eventType: 'POINT',
        blockedReason: `Set ${next.currentSet} is already completed. Switch to the next open set or use Undo.`,
      };
    }

    pointsAwarded = action.delta;
    if (action.team === 'A') {
      teamAScore = Math.max(0, teamAScore + action.delta);
      next.setScores[activeIdx].teamA = teamAScore;
      if (action.delta > 0) next.servingTeam = 'A';
    } else {
      teamBScore = Math.max(0, teamBScore + action.delta);
      next.setScores[activeIdx].teamB = teamBScore;
      if (action.delta > 0) next.servingTeam = 'B';
    }
    label = `Set ${next.currentSet}: Team ${action.team} ${
      action.delta >= 0 ? `+${action.delta}` : action.delta
    } (${teamAScore}-${teamBScore})`;
    evaluateAfterPoint(action.team, action.delta > 0);
  } else if (action.type === 'STRUCTURED_POINT') {
    if (next.setScores[activeIdx].winner) {
      return {
        details: next,
        teamAScore,
        teamBScore,
        label: `Set ${next.currentSet} is already completed.`,
        pointsAwarded: 0,
        eventCategory: 'CONTROL',
        eventType: action.eventType,
        blockedReason: `Set ${next.currentSet} is already completed. Switch to the next open set or use Undo.`,
      };
    }

    eventType = action.eventType;
    const rawPts =
      typeof action.points === 'number' && Number.isFinite(action.points)
        ? Math.trunc(action.points)
        : 1;
    const pts = next.allowCustomMultiPoint
      ? Math.max(0, Math.min(15, rawPts))
      : Math.min(1, Math.max(0, rawPts));
    pointsAwarded = pts;
    if (action.team === 'A') {
      teamAScore = Math.max(0, teamAScore + pts);
      next.setScores[activeIdx].teamA = teamAScore;
      if (pts > 0) next.servingTeam = 'A';
    } else {
      teamBScore = Math.max(0, teamBScore + pts);
      next.setScores[activeIdx].teamB = teamBScore;
      if (pts > 0) next.servingTeam = 'B';
    }

    const eventNames: Record<VolleyballEventType, string> = {
      ATTACK_POINT: 'Attack Point',
      BLOCK_POINT: 'Block Point',
      SERVICE_ACE: 'Service Ace',
      OPPONENT_ERROR: 'Opponent Error',
      NET_FAULT: 'Net Fault',
      SERVICE_FAULT: 'Service Fault',
      ROTATION_FAULT: 'Rotation Fault',
      PENALTY_POINT: 'Penalty Point',
      CUSTOM_EVENT: 'Custom Event',
    };
    const scoreSnap = `${teamAScore}-${teamBScore}`;
    label = `Set ${next.currentSet}: Team ${action.team} ${eventNames[action.eventType]} (+${pts})${
      action.playerName ? ` · ${action.playerName}` : ''
    } (${scoreSnap})`;
    next.eventHistory = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        set: next.currentSet,
        team: action.team,
        eventType: action.eventType,
        points: pts,
        playerName: action.playerName?.trim() || '',
        description: action.description?.trim() || '',
        scoreSnapshot: scoreSnap,
        timestamp: new Date().toISOString(),
      },
      ...next.eventHistory.slice(0, 49),
    ];
    evaluateAfterPoint(action.team, pts > 0);
  } else if (action.type === 'COMPLETE_SET') {
    eventCategory = 'META';
    const elig = getVolleyballCompletionEligibility(next);
    if (elig.thresholdReached) {
      return {
        details: next,
        teamAScore,
        teamBScore,
        label: 'Winning threshold already reached.',
        pointsAwarded: 0,
        eventCategory: 'META',
        eventType: 'COMPLETE_SET',
        blockedReason: `Winning threshold (${elig.winningThreshold} sets) is already reached. Cannot award additional sets.`,
      };
    }
    if (next.setScores[activeIdx].winner) {
      return {
        details: next,
        teamAScore,
        teamBScore,
        label: `Set ${next.currentSet} already awarded.`,
        pointsAwarded: 0,
        eventCategory: 'META',
        eventType: 'COMPLETE_SET',
        blockedReason: `Set ${next.currentSet} has already been awarded to Team ${next.setScores[activeIdx].winner}.`,
      };
    }

    const completedSetNum = next.currentSet;
    const fin = finalizeSetWin(next, activeIdx, action.winner, teamAScore, teamBScore);
    teamAScore = fin.teamAScore;
    teamBScore = fin.teamBScore;
    autoCompletedSet = true;
    autoCompletedMatch = fin.autoCompletedMatch;
    autoWinnerSide = fin.autoWinnerSide;

    if (fin.autoCompletedMatch) {
      label = `Set ${completedSetNum} won by Team ${action.winner} · Winning threshold reached (${next.teamASetsWon}-${next.teamBSetsWon})`;
    } else if (fin.nextSetStarted) {
      label = `Set ${completedSetNum} won by Team ${action.winner} · Starting Set ${fin.nextSetStarted}`;
    } else {
      label = `Set ${completedSetNum} won by Team ${action.winner} (Sets ${next.teamASetsWon}-${next.teamBSetsWon})`;
    }
  } else if (action.type === 'SET_CURRENT_SET') {
    eventCategory = 'META';
    const elig = getVolleyballCompletionEligibility(next);
    if (action.setNumber < 1 || action.setNumber > next.bestOfSets) {
      return {
        details: next,
        teamAScore,
        teamBScore,
        label: 'Invalid set number.',
        pointsAwarded: 0,
        eventCategory: 'META',
        eventType: 'SET_CURRENT_SET',
        blockedReason: `Set number must be between 1 and ${next.bestOfSets}.`,
      };
    }
    if (elig.thresholdReached && !next.setScores.some((s) => s.set === action.setNumber)) {
      return {
        details: next,
        teamAScore,
        teamBScore,
        label: 'Cannot start a new set after winning threshold.',
        pointsAwarded: 0,
        eventCategory: 'META',
        eventType: 'SET_CURRENT_SET',
        blockedReason: `Winning threshold (${elig.winningThreshold} sets) already reached.`,
      };
    }

    const targetSet = Math.max(1, Math.min(next.bestOfSets, Math.trunc(action.setNumber)));
    next.currentSet = targetSet;
    const existing = next.setScores.find((s) => s.set === targetSet);
    if (existing) {
      teamAScore = existing.teamA;
      teamBScore = existing.teamB;
    } else {
      next.setScores.push({ set: targetSet, teamA: 0, teamB: 0, winner: null });
      next.setScores.sort((a, b) => a.set - b.set);
      teamAScore = 0;
      teamBScore = 0;
    }
    // Clear manual advantage when switching sets and re-evaluate target set score
    const adv = computeVolleyballAdvantageState(teamAScore, teamBScore, targetSet, next.rules, null);
    next.advantageTeam = adv.advantageTeam;
    next.isDeuce = adv.isDeuce;
    label = `Switched to Set ${targetSet}`;
  } else if (action.type === 'SET_SERVING_TEAM') {
    eventCategory = 'META';
    const prevServing = next.servingTeam;
    next.servingTeam = action.team;
    // Clear manual advantage if serve explicitly switched outside deuce score advantage
    const adv = computeVolleyballAdvantageState(
      teamAScore,
      teamBScore,
      next.currentSet,
      next.rules,
      prevServing !== action.team ? null : next.advantageTeam
    );
    next.advantageTeam = adv.advantageTeam;
    next.isDeuce = adv.isDeuce;
    label = `Serving switched to Team ${action.team}`;
  } else if (action.type === 'SET_ADVANTAGE') {
    eventCategory = 'META';
    next.advantageTeam = action.team;
    label = action.team
      ? `Advantage set to Team ${action.team}`
      : 'Advantage cleared';
  } else if (action.type === 'SET_BEST_OF' || action.type === 'UPDATE_RULES') {
    eventCategory = 'RULES';
    const proposed =
      action.type === 'SET_BEST_OF'
        ? { ...next.rules, bestOfSets: action.bestOfSets }
        : { ...next.rules, ...action.rules };
    const validated = validateVolleyballRules(proposed);
    if (!validated.valid) {
      return {
        details: next,
        teamAScore,
        teamBScore,
        label: validated.error || 'Invalid Volleyball rules.',
        pointsAwarded: 0,
        eventCategory: 'RULES',
        eventType: action.type,
        blockedReason: validated.error || 'Invalid Volleyball rules.',
      };
    }

    const activeOrCompletedSets = next.setScores.filter(
      (s) => s.winner === 'A' || s.winner === 'B' || s.teamA > 0 || s.teamB > 0
    );
    const maxPlayedSetNumber = activeOrCompletedSets.reduce((acc, s) => Math.max(acc, s.set), 0);
    if (
      validated.rules.bestOfSets < activeOrCompletedSets.length ||
      validated.rules.bestOfSets < maxPlayedSetNumber
    ) {
      return {
        details: next,
        teamAScore,
        teamBScore,
        label: 'Cannot reduce total sets below played sets.',
        pointsAwarded: 0,
        eventCategory: 'RULES',
        eventType: action.type,
        blockedReason: `Cannot reduce total sets to Best of ${validated.rules.bestOfSets} because ${activeOrCompletedSets.length} set(s) (up to Set ${maxPlayedSetNumber}) already have recorded scores or winners.`,
      };
    }

    next.rules = validated.rules;
    next.bestOfSets = validated.rules.bestOfSets;
    next.winningThreshold = Math.ceil(validated.rules.bestOfSets / 2);
    if (next.currentSet > next.bestOfSets) {
      next.currentSet = next.bestOfSets;
    }
    // Trim any unplayed future sets above new bestOfSets
    next.setScores = next.setScores.filter((s) => s.set <= next.bestOfSets);
    const active = next.setScores.find((s) => s.set === next.currentSet);
    if (active) {
      teamAScore = active.teamA;
      teamBScore = active.teamB;
    }
    const adv = computeVolleyballAdvantageState(
      teamAScore,
      teamBScore,
      next.currentSet,
      next.rules,
      next.advantageTeam
    );
    next.advantageTeam = adv.advantageTeam;
    next.isDeuce = adv.isDeuce;
    label = `Volleyball rules updated: Best of ${next.bestOfSets} (Win threshold: ${next.winningThreshold} sets, ${next.rules.pointsPerSet} pts/set)`;
  } else if (action.type === 'SET_CUSTOM_MULTI_POINT') {
    eventCategory = 'META';
    next.allowCustomMultiPoint = action.enabled;
    label = `Volleyball multi-point correction mode ${action.enabled ? 'enabled' : 'disabled'}`;
  } else if (action.type === 'SET_PRE_MATCH_SETUP') {
    eventCategory = 'META';
    eventType = 'SET_PRE_MATCH_SETUP';
    if (action.tossWinner !== undefined) next.tossWinner = action.tossWinner;
    if (action.tossDecision !== undefined) next.tossDecision = action.tossDecision;
    if (action.servingTeam === 'A' || action.servingTeam === 'B') {
      next.servingTeam = action.servingTeam;
    } else if (action.tossWinner === 'A' || action.tossWinner === 'B') {
      next.servingTeam =
        action.tossDecision === 'RECEIVE'
          ? action.tossWinner === 'A'
            ? 'B'
            : 'A'
          : action.tossWinner;
    }
    label = `Volleyball Pre-Match: Team ${next.servingTeam} serves first`;
  }

  return {
    details: next,
    teamAScore,
    teamBScore,
    label,
    pointsAwarded,
    eventCategory,
    eventType,
    autoCompletedSet,
    autoCompletedMatch,
    autoWinnerSide,
  };
}
