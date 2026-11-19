export interface KabaddiTeamBreakdown {
  raidPoints: number;
  tacklePoints: number;
  allOutPoints: number;
  bonusPoints: number;
  superTackles: number;
  superRaids: number;
  technicalPoints: number;
  penaltyPoints: number;
  emptyRaids: number;
  doOrDieRaids: number;
  playersOut: number;
}

export interface KabaddiRaidLogItem {
  id: string;
  team: 'A' | 'B';
  category: 'RAID' | 'TACKLE' | 'OTHER';
  eventType: string;
  points: number;
  playerName?: string;
  description?: string;
  half: string;
  scoreSnapshot: string;
  timestamp: string;
}

export interface KabaddiDetails {
  teamA: KabaddiTeamBreakdown;
  teamB: KabaddiTeamBreakdown;
  half: '1st Half' | 'Half Time' | '2nd Half' | 'Extra Time' | 'Tie-Breaker' | 'Full Time';
  timerMinutes: number;
  timerSeconds: number;
  superRaidNote: string;
  isTieBreaker: boolean;
  tieBreakerScoreA: number;
  tieBreakerScoreB: number;
  raidTimeline: KabaddiRaidLogItem[];
}

function defaultBreakdown(): KabaddiTeamBreakdown {
  return {
    raidPoints: 0,
    tacklePoints: 0,
    allOutPoints: 0,
    bonusPoints: 0,
    superTackles: 0,
    superRaids: 0,
    technicalPoints: 0,
    penaltyPoints: 0,
    emptyRaids: 0,
    doOrDieRaids: 0,
    playersOut: 0,
  };
}

export function createInitialKabaddiDetails(): KabaddiDetails {
  return {
    teamA: defaultBreakdown(),
    teamB: defaultBreakdown(),
    half: '1st Half',
    timerMinutes: 20,
    timerSeconds: 0,
    superRaidNote: '',
    isTieBreaker: false,
    tieBreakerScoreA: 0,
    tieBreakerScoreB: 0,
    raidTimeline: [],
  };
}

export type KabaddiEventType =
  | 'SUCCESSFUL_RAID'
  | 'EMPTY_RAID'
  | 'UNSUCCESSFUL_RAID'
  | 'BONUS_POINT'
  | 'MULTI_POINT_RAID'
  | 'SUPER_RAID'
  | 'ALL_OUT'
  | 'DO_OR_DIE_RAID'
  | 'CUSTOM_RAID'
  | 'SUCCESSFUL_TACKLE'
  | 'SUPER_TACKLE'
  | 'TEAM_TACKLE'
  | 'FAILED_TACKLE'
  | 'MULTI_POINT_TACKLE'
  | 'CUSTOM_TACKLE'
  | 'TECHNICAL_POINT'
  | 'PENALTY_POINT'
  | 'REVIVAL_OUT_ADJUST'
  | 'CUSTOM_EVENT';

export type KabaddiActionPayload =
  | {
      type: 'ADD_POINTS';
      team: 'A' | 'B';
      category:
        | 'raidPoints'
        | 'tacklePoints'
        | 'allOutPoints'
        | 'bonusPoints'
        | 'superTackles'
        | 'superRaids'
        | 'technicalPoints'
        | 'penaltyPoints';
      points: number;
      note?: string;
    }
  | {
      type: 'STRUCTURED_EVENT';
      team: 'A' | 'B';
      eventType: KabaddiEventType;
      points: number;
      bonusIncluded?: number;
      playerName?: string;
      description?: string;
      playersOutDelta?: number;
      isDoOrDie?: boolean;
    }
  | {
      type: 'SET_META';
      half?: KabaddiDetails['half'];
      timerMinutes?: number;
      timerSeconds?: number;
      superRaidNote?: string;
      isTieBreaker?: boolean;
      tieBreakerScoreA?: number;
      tieBreakerScoreB?: number;
    };

export function applyKabaddiAction(
  current: KabaddiDetails,
  currentTeamAScore: number,
  currentTeamBScore: number,
  action: KabaddiActionPayload
): {
  details: KabaddiDetails;
  teamAScore: number;
  teamBScore: number;
  label: string;
  pointsAwarded: number;
  eventCategory: string;
  eventType: string;
} {
  const base = createInitialKabaddiDetails();
  const next: KabaddiDetails = {
    ...base,
    ...current,
    teamA: { ...base.teamA, ...(current.teamA || {}) },
    teamB: { ...base.teamB, ...(current.teamB || {}) },
    raidTimeline: Array.isArray(current.raidTimeline) ? [...current.raidTimeline] : [],
  };
  let teamAScore = Math.max(0, currentTeamAScore || 0);
  let teamBScore = Math.max(0, currentTeamBScore || 0);
  let label = 'Kabaddi score updated';
  let pointsAwarded = 0;
  let eventCategory = 'KABADDI';
  let eventType: string = action.type;

  const addTeamPoints = (side: 'A' | 'B', delta: number) => {
    if (side === 'A') teamAScore = Math.max(0, teamAScore + delta);
    else teamBScore = Math.max(0, teamBScore + delta);
  };

  if (action.type === 'ADD_POINTS') {
    const target = action.team === 'A' ? next.teamA : next.teamB;
    const pts = Number.isFinite(action.points) ? Math.trunc(action.points) : 0;
    eventType = action.category;

    if (action.category === 'superTackles') {
      const scoreDelta = pts !== 0 ? pts : 2;
      target.superTackles = Math.max(0, (target.superTackles || 0) + (scoreDelta > 0 ? 1 : -1));
      target.tacklePoints = Math.max(0, (target.tacklePoints || 0) + scoreDelta);
      addTeamPoints(action.team, scoreDelta);
      pointsAwarded = scoreDelta;
      eventCategory = 'TACKLE';
      label = `Team ${action.team} Super Tackle (+${scoreDelta})`;
    } else if (action.category === 'superRaids') {
      // Single-count points: raidPoints gets exact raidPts, total team score gets exact raidPts (never double counted)
      const raidPts = Math.max(3, Math.abs(pts) || 3);
      target.superRaids = Math.max(0, (target.superRaids || 0) + 1);
      target.raidPoints = Math.max(0, (target.raidPoints || 0) + raidPts);
      addTeamPoints(action.team, raidPts);
      pointsAwarded = raidPts;
      eventCategory = 'RAID';
      next.superRaidNote = action.note?.trim() || `Team ${action.team} Super Raid (+${raidPts})`;
      label = `Team ${action.team} Super Raid (+${raidPts})`;
    } else {
      target[action.category] = Math.max(0, (target[action.category] || 0) + pts);
      addTeamPoints(action.team, pts);
      pointsAwarded = pts;
      eventCategory = action.category === 'tacklePoints' ? 'TACKLE' : 'RAID';
      const categoryNames: Record<string, string> = {
        raidPoints: 'Raid Point',
        tacklePoints: 'Tackle Point',
        allOutPoints: 'All-Out',
        bonusPoints: 'Bonus Point',
        technicalPoints: 'Technical Point',
        penaltyPoints: 'Penalty Point',
      };
      label = `Team ${action.team} ${categoryNames[action.category] || action.category} (${pts >= 0 ? `+${pts}` : pts})`;
    }
  } else if (action.type === 'STRUCTURED_EVENT') {
    const target = action.team === 'A' ? next.teamA : next.teamB;
    const opp = action.team === 'A' ? next.teamB : next.teamA;
    const pts = Math.max(0, Math.min(20, Math.trunc(action.points || 0)));
    const bonusPart = Math.max(0, Math.min(pts, Math.trunc(action.bonusIncluded || 0)));
    const raidOrTacklePart = Math.max(0, pts - bonusPart);
    eventType = action.eventType;

    if (action.isDoOrDie) {
      target.doOrDieRaids = (target.doOrDieRaids || 0) + 1;
    }

    switch (action.eventType) {
      case 'EMPTY_RAID': {
        target.emptyRaids = (target.emptyRaids || 0) + 1;
        eventCategory = 'RAID';
        pointsAwarded = 0;
        label = `Team ${action.team} Empty Raid${action.playerName ? ` (${action.playerName})` : ''}`;
        break;
      }
      case 'UNSUCCESSFUL_RAID': {
        // Unsuccessful raid awards 0 points to raiding team unless points explicitly passed for defender tackle separately
        eventCategory = 'RAID';
        pointsAwarded = 0;
        target.playersOut = Math.min(7, (target.playersOut || 0) + 1);
        label = `Team ${action.team} Unsuccessful Raid${action.playerName ? ` (${action.playerName})` : ''}`;
        break;
      }
      case 'FAILED_TACKLE': {
        eventCategory = 'TACKLE';
        pointsAwarded = 0;
        target.playersOut = Math.min(7, (target.playersOut || 0) + 1);
        label = `Team ${action.team} Failed Tackle${action.playerName ? ` (${action.playerName})` : ''}`;
        break;
      }
      case 'BONUS_POINT': {
        const bp = pts > 0 ? pts : 1;
        target.bonusPoints = (target.bonusPoints || 0) + bp;
        addTeamPoints(action.team, bp);
        pointsAwarded = bp;
        eventCategory = 'RAID';
        label = `Team ${action.team} Bonus Point (+${bp})${action.playerName ? ` · ${action.playerName}` : ''}`;
        break;
      }
      case 'SUPER_RAID': {
        const total = Math.max(3, pts);
        const b = Math.min(bonusPart, total);
        const r = total - b;
        target.superRaids = (target.superRaids || 0) + 1;
        target.raidPoints = (target.raidPoints || 0) + r;
        if (b > 0) target.bonusPoints = (target.bonusPoints || 0) + b;
        addTeamPoints(action.team, total);
        pointsAwarded = total;
        eventCategory = 'RAID';
        next.superRaidNote = action.description?.trim() || `Team ${action.team} Super Raid (+${total})`;
        label = `Team ${action.team} Super Raid (+${total})${action.playerName ? ` · ${action.playerName}` : ''}`;
        break;
      }
      case 'ALL_OUT': {
        const aoPts = pts > 0 ? pts : 2;
        target.allOutPoints = (target.allOutPoints || 0) + aoPts;
        opp.playersOut = 0; // All-out resets defenders to full 7 on court
        addTeamPoints(action.team, aoPts);
        pointsAwarded = aoPts;
        eventCategory = 'RAID';
        label = `Team ${action.team} All-Out (+${aoPts})`;
        break;
      }
      case 'SUCCESSFUL_TACKLE':
      case 'TEAM_TACKLE':
      case 'MULTI_POINT_TACKLE':
      case 'CUSTOM_TACKLE': {
        const tp = pts > 0 ? pts : 1;
        target.tacklePoints = (target.tacklePoints || 0) + tp;
        addTeamPoints(action.team, tp);
        pointsAwarded = tp;
        eventCategory = 'TACKLE';
        const pretty =
          action.eventType === 'TEAM_TACKLE'
            ? 'Team Tackle'
            : action.eventType === 'MULTI_POINT_TACKLE'
              ? 'Multi-Point Tackle'
              : action.eventType === 'CUSTOM_TACKLE'
                ? 'Custom Tackle'
                : 'Tackle';
        label = `Team ${action.team} ${pretty} (+${tp})${action.playerName ? ` · ${action.playerName}` : ''}`;
        break;
      }
      case 'SUPER_TACKLE': {
        const stPts = pts >= 2 ? pts : 2;
        target.superTackles = (target.superTackles || 0) + 1;
        target.tacklePoints = (target.tacklePoints || 0) + stPts;
        addTeamPoints(action.team, stPts);
        pointsAwarded = stPts;
        eventCategory = 'TACKLE';
        label = `Team ${action.team} Super Tackle (+${stPts})${action.playerName ? ` · ${action.playerName}` : ''}`;
        break;
      }
      case 'TECHNICAL_POINT': {
        const tPts = pts > 0 ? pts : 1;
        target.technicalPoints = (target.technicalPoints || 0) + tPts;
        addTeamPoints(action.team, tPts);
        pointsAwarded = tPts;
        eventCategory = 'OTHER';
        label = `Team ${action.team} Technical Point (+${tPts})`;
        break;
      }
      case 'PENALTY_POINT': {
        const pPts = pts > 0 ? pts : 1;
        target.penaltyPoints = (target.penaltyPoints || 0) + pPts;
        addTeamPoints(action.team, pPts);
        pointsAwarded = pPts;
        eventCategory = 'OTHER';
        label = `Team ${action.team} Penalty Point (+${pPts})`;
        break;
      }
      case 'REVIVAL_OUT_ADJUST': {
        const delta = Math.trunc(action.playersOutDelta || 0);
        target.playersOut = Math.max(0, Math.min(7, (target.playersOut || 0) + delta));
        eventCategory = 'OTHER';
        pointsAwarded = 0;
        label = `Team ${action.team} Players Out adjusted to ${target.playersOut}`;
        break;
      }
      case 'SUCCESSFUL_RAID':
      case 'MULTI_POINT_RAID':
      case 'DO_OR_DIE_RAID':
      case 'CUSTOM_RAID':
      case 'CUSTOM_EVENT':
      default: {
        // Non-double-counting split: raidOrTacklePart + bonusPart === pts
        const total = pts;
        if (total >= 3 && (action.eventType === 'MULTI_POINT_RAID' || action.eventType === 'SUCCESSFUL_RAID')) {
          target.superRaids = (target.superRaids || 0) + 1;
        }
        target.raidPoints = (target.raidPoints || 0) + raidOrTacklePart;
        if (bonusPart > 0) target.bonusPoints = (target.bonusPoints || 0) + bonusPart;
        addTeamPoints(action.team, total);
        pointsAwarded = total;
        eventCategory = action.eventType === 'CUSTOM_EVENT' ? 'OTHER' : 'RAID';
        const prefix =
          action.eventType === 'DO_OR_DIE_RAID'
            ? 'Do-or-Die Raid'
            : action.eventType === 'MULTI_POINT_RAID'
              ? 'Multi-Point Raid'
              : action.eventType === 'CUSTOM_RAID'
                ? 'Custom Raid'
                : action.eventType === 'CUSTOM_EVENT'
                  ? 'Custom Event'
                  : 'Successful Raid';
        label = `Team ${action.team} ${prefix} (+${total})${action.playerName ? ` · ${action.playerName}` : ''}`;
        if (action.description?.trim()) {
          label += ` — ${action.description.trim()}`;
        }
        break;
      }
    }

    next.raidTimeline = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        team: action.team,
        category: eventCategory as 'RAID' | 'TACKLE' | 'OTHER',
        eventType: action.eventType,
        points: pointsAwarded,
        playerName: action.playerName?.trim() || '',
        description: action.description?.trim() || '',
        half: next.half,
        scoreSnapshot: `${teamAScore}-${teamBScore}`,
        timestamp: new Date().toISOString(),
      },
      ...next.raidTimeline.slice(0, 49),
    ];
  } else if (action.type === 'SET_META') {
    eventCategory = 'META';
    if (action.half) next.half = action.half;
    if (action.timerMinutes !== undefined) next.timerMinutes = Math.max(0, Math.min(99, action.timerMinutes));
    if (action.timerSeconds !== undefined) next.timerSeconds = Math.max(0, Math.min(59, action.timerSeconds));
    if (action.superRaidNote !== undefined) next.superRaidNote = action.superRaidNote;
    if (action.isTieBreaker !== undefined) next.isTieBreaker = action.isTieBreaker;
    if (action.tieBreakerScoreA !== undefined) next.tieBreakerScoreA = Math.max(0, action.tieBreakerScoreA);
    if (action.tieBreakerScoreB !== undefined) next.tieBreakerScoreB = Math.max(0, action.tieBreakerScoreB);
    label = `Kabaddi match state: ${next.half}`;
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
