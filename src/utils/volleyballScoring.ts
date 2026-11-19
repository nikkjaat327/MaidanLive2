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

export interface VolleyballDetails {
  currentSet: number;
  bestOfSets: 3 | 5;
  servingTeam: 'A' | 'B';
  teamASetsWon: number;
  teamBSetsWon: number;
  setScores: VolleyballSetScore[];
  allowCustomMultiPoint: boolean;
  eventHistory: VolleyballEventItem[];
}

export function createInitialVolleyballDetails(): VolleyballDetails {
  return {
    currentSet: 1,
    bestOfSets: 5,
    servingTeam: 'A',
    teamASetsWon: 0,
    teamBSetsWon: 0,
    setScores: [{ set: 1, teamA: 0, teamB: 0, winner: null }],
    allowCustomMultiPoint: false,
    eventHistory: [],
  };
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
  | { type: 'SET_BEST_OF'; bestOfSets: 3 | 5 }
  | { type: 'SET_CUSTOM_MULTI_POINT'; enabled: boolean };

export function applyVolleyballAction(
  current: VolleyballDetails,
  currentTeamAScore: number,
  currentTeamBScore: number,
  action: VolleyballActionPayload
): {
  details: VolleyballDetails;
  teamAScore: number;
  teamBScore: number;
  label: string;
  pointsAwarded: number;
  eventCategory: string;
  eventType: string;
} {
  const base = createInitialVolleyballDetails();
  const next: VolleyballDetails = {
    currentSet: current.currentSet || base.currentSet,
    bestOfSets: current.bestOfSets === 3 ? 3 : 5,
    servingTeam: current.servingTeam === 'B' ? 'B' : 'A',
    teamASetsWon: current.teamASetsWon || 0,
    teamBSetsWon: current.teamBSetsWon || 0,
    setScores:
      Array.isArray(current.setScores) && current.setScores.length > 0
        ? current.setScores.map((s) => ({ ...s }))
        : [{ set: 1, teamA: currentTeamAScore, teamB: currentTeamBScore, winner: null }],
    allowCustomMultiPoint: Boolean(current.allowCustomMultiPoint),
    eventHistory: Array.isArray(current.eventHistory) ? [...current.eventHistory] : [],
  };

  let teamAScore = Math.max(0, currentTeamAScore || 0);
  let teamBScore = Math.max(0, currentTeamBScore || 0);
  let label = 'Volleyball score updated';
  let pointsAwarded = 0;
  let eventCategory = 'VOLLEYBALL';
  let eventType: string = action.type;

  let activeIdx = next.setScores.findIndex((s) => s.set === next.currentSet);
  if (activeIdx === -1) {
    next.setScores.push({ set: next.currentSet, teamA: teamAScore, teamB: teamBScore, winner: null });
    activeIdx = next.setScores.length - 1;
  }

  if (action.type === 'POINT') {
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
    label = `Set ${next.currentSet}: Team ${action.team} ${action.delta >= 0 ? `+${action.delta}` : action.delta} (${teamAScore}-${teamBScore})`;
  } else if (action.type === 'STRUCTURED_POINT') {
    eventType = action.eventType;
    const rawPts = typeof action.points === 'number' && Number.isFinite(action.points) ? Math.trunc(action.points) : 1;
    // Standard rally scoring awards 1 point unless special/correction multi-point mode is enabled
    const pts = next.allowCustomMultiPoint ? Math.max(0, Math.min(15, rawPts)) : Math.min(1, Math.max(0, rawPts));
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
    label = `Set ${next.currentSet}: Team ${action.team} ${eventNames[action.eventType]} (+${pts})${action.playerName ? ` · ${action.playerName}` : ''} (${teamAScore}-${teamBScore})`;
    next.eventHistory = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        set: next.currentSet,
        team: action.team,
        eventType: action.eventType,
        points: pts,
        playerName: action.playerName?.trim() || '',
        description: action.description?.trim() || '',
        scoreSnapshot: `${teamAScore}-${teamBScore}`,
        timestamp: new Date().toISOString(),
      },
      ...next.eventHistory.slice(0, 49),
    ];
  } else if (action.type === 'COMPLETE_SET') {
    eventCategory = 'META';
    next.setScores[activeIdx].winner = action.winner;
    if (action.winner === 'A') next.teamASetsWon += 1;
    else next.teamBSetsWon += 1;

    const neededSets = Math.ceil(next.bestOfSets / 2);
    const matchDecided = next.teamASetsWon >= neededSets || next.teamBSetsWon >= neededSets;
    const completedSetNum = next.currentSet;

    if (!matchDecided && next.currentSet < next.bestOfSets) {
      const nextSetNum = next.currentSet + 1;
      next.currentSet = nextSetNum;
      next.setScores.push({ set: nextSetNum, teamA: 0, teamB: 0, winner: null });
      teamAScore = 0;
      teamBScore = 0;
      label = `Set ${completedSetNum} won by Team ${action.winner} · Starting Set ${nextSetNum}`;
    } else {
      label = `Set ${completedSetNum} won by Team ${action.winner} (Sets ${next.teamASetsWon}-${next.teamBSetsWon})`;
    }
  } else if (action.type === 'SET_CURRENT_SET') {
    eventCategory = 'META';
    const targetSet = Math.max(1, Math.min(next.bestOfSets, action.setNumber));
    next.currentSet = targetSet;
    const existing = next.setScores.find((s) => s.set === targetSet);
    if (existing) {
      teamAScore = existing.teamA;
      teamBScore = existing.teamB;
    } else {
      next.setScores.push({ set: targetSet, teamA: 0, teamB: 0, winner: null });
      teamAScore = 0;
      teamBScore = 0;
    }
    label = `Switched to Set ${targetSet}`;
  } else if (action.type === 'SET_SERVING_TEAM') {
    eventCategory = 'META';
    next.servingTeam = action.team;
    label = `Serving switched to Team ${action.team}`;
  } else if (action.type === 'SET_BEST_OF') {
    eventCategory = 'META';
    next.bestOfSets = action.bestOfSets;
    label = `Match format set to Best of ${action.bestOfSets}`;
  } else if (action.type === 'SET_CUSTOM_MULTI_POINT') {
    eventCategory = 'META';
    next.allowCustomMultiPoint = action.enabled;
    label = `Volleyball multi-point correction mode ${action.enabled ? 'enabled' : 'disabled'}`;
  }

  return {
    details: next,
    teamAScore,
    teamBScore,
    label,
    pointsAwarded,
    eventCategory,
    eventType,
  };
}
