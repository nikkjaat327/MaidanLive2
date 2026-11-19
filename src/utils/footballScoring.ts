export interface FootballTimelineEvent {
  id: string;
  team: 'A' | 'B';
  eventType: string;
  minuteLabel: string;
  playerName?: string;
  assistPlayerName?: string;
  playerOutName?: string;
  description?: string;
  scoreSnapshot: string;
  timestamp: string;
}

export interface FootballDetails {
  half: '1st Half' | 'Half Time' | '2nd Half' | 'Extra Time' | 'Penalties' | 'Full Time';
  timerMinutes: number;
  timerSeconds: number;
  extraTimeMinutes: number;
  teamAPenalties: number;
  teamBPenalties: number;
  teamAYellowCards: number;
  teamARedCards: number;
  teamBYellowCards: number;
  teamBRedCards: number;
  events: FootballTimelineEvent[];
}

export function createInitialFootballDetails(): FootballDetails {
  return {
    half: '1st Half',
    timerMinutes: 0,
    timerSeconds: 0,
    extraTimeMinutes: 0,
    teamAPenalties: 0,
    teamBPenalties: 0,
    teamAYellowCards: 0,
    teamARedCards: 0,
    teamBYellowCards: 0,
    teamBRedCards: 0,
    events: [],
  };
}

export type FootballEventType =
  | 'GOAL'
  | 'PENALTY_GOAL'
  | 'OWN_GOAL'
  | 'PENALTY_MISS'
  | 'YELLOW_CARD'
  | 'RED_CARD'
  | 'SECOND_YELLOW'
  | 'SUBSTITUTION'
  | 'SHOOTOUT_SCORED'
  | 'SHOOTOUT_MISSED'
  | 'CUSTOM_EVENT';

export type FootballActionPayload =
  | { type: 'GOAL'; team: 'A' | 'B'; delta: number }
  | { type: 'CARD'; team: 'A' | 'B'; card: 'yellow' | 'red'; delta: number }
  | { type: 'PENALTY'; team: 'A' | 'B'; delta: number }
  | {
      type: 'STRUCTURED_EVENT';
      team: 'A' | 'B';
      eventType: FootballEventType;
      minute?: number;
      addedMinute?: number;
      playerName?: string;
      assistPlayerName?: string;
      playerOutName?: string;
      description?: string;
      goalsDelta?: number;
    }
  | {
      type: 'SET_META';
      half?: FootballDetails['half'];
      timerMinutes?: number;
      timerSeconds?: number;
      extraTimeMinutes?: number;
    };

export function applyFootballAction(
  current: FootballDetails,
  currentTeamAScore: number,
  currentTeamBScore: number,
  action: FootballActionPayload
): {
  details: FootballDetails;
  teamAScore: number;
  teamBScore: number;
  label: string;
  pointsAwarded: number;
  eventCategory: string;
  eventType: string;
} {
  const base = createInitialFootballDetails();
  const next: FootballDetails = {
    ...base,
    ...current,
    events: Array.isArray(current.events) ? [...current.events] : [],
  };
  let teamAScore = Math.max(0, currentTeamAScore || 0);
  let teamBScore = Math.max(0, currentTeamBScore || 0);
  let label = 'Football score updated';
  let pointsAwarded = 0;
  let eventCategory = 'FOOTBALL';
  let eventType: string = action.type;

  switch (action.type) {
    case 'GOAL': {
      pointsAwarded = action.delta;
      if (action.team === 'A') teamAScore = Math.max(0, teamAScore + action.delta);
      else teamBScore = Math.max(0, teamBScore + action.delta);
      label = action.delta > 0 ? `Goal for Team ${action.team}!` : `Adjusted Team ${action.team} goals`;
      break;
    }
    case 'CARD': {
      eventCategory = 'DISCIPLINE';
      if (action.team === 'A') {
        if (action.card === 'yellow') next.teamAYellowCards = Math.max(0, next.teamAYellowCards + action.delta);
        else next.teamARedCards = Math.max(0, next.teamARedCards + action.delta);
      } else {
        if (action.card === 'yellow') next.teamBYellowCards = Math.max(0, next.teamBYellowCards + action.delta);
        else next.teamBRedCards = Math.max(0, next.teamBRedCards + action.delta);
      }
      label = `Team ${action.team} ${action.card === 'yellow' ? 'Yellow' : 'Red'} Card`;
      break;
    }
    case 'PENALTY': {
      eventCategory = 'SHOOTOUT';
      if (action.team === 'A') next.teamAPenalties = Math.max(0, next.teamAPenalties + action.delta);
      else next.teamBPenalties = Math.max(0, next.teamBPenalties + action.delta);
      label = `Team ${action.team} Penalty shootout (${next.teamAPenalties}-${next.teamBPenalties})`;
      break;
    }
    case 'STRUCTURED_EVENT': {
      eventType = action.eventType;
      const minNum =
        typeof action.minute === 'number' && Number.isFinite(action.minute)
          ? Math.max(0, Math.trunc(action.minute))
          : next.timerMinutes;
      const addNum =
        typeof action.addedMinute === 'number' && Number.isFinite(action.addedMinute) && action.addedMinute > 0
          ? Math.trunc(action.addedMinute)
          : 0;
      const minuteLabel = `${minNum}${addNum > 0 ? `+${addNum}` : ''}'`;
      const pName = action.playerName?.trim() || '';
      const aName = action.assistPlayerName?.trim() || '';
      const outName = action.playerOutName?.trim() || '';

      switch (action.eventType) {
        case 'GOAL':
        case 'PENALTY_GOAL':
        case 'OWN_GOAL': {
          const g = typeof action.goalsDelta === 'number' ? Math.max(0, Math.trunc(action.goalsDelta)) : 1;
          pointsAwarded = g;
          if (action.team === 'A') teamAScore += g;
          else teamBScore += g;
          const kind =
            action.eventType === 'PENALTY_GOAL'
              ? 'Penalty Goal'
              : action.eventType === 'OWN_GOAL'
                ? 'Own Goal'
                : 'Goal';
          label = `${minuteLabel} ${kind} for Team ${action.team}${pName ? ` (${pName})` : ''}${aName ? ` · Assist: ${aName}` : ''}`;
          break;
        }
        case 'PENALTY_MISS': {
          pointsAwarded = 0;
          label = `${minuteLabel} Penalty Missed by Team ${action.team}${pName ? ` (${pName})` : ''}`;
          break;
        }
        case 'YELLOW_CARD': {
          eventCategory = 'DISCIPLINE';
          pointsAwarded = 0;
          if (action.team === 'A') next.teamAYellowCards += 1;
          else next.teamBYellowCards += 1;
          label = `${minuteLabel} Yellow Card · Team ${action.team}${pName ? ` (${pName})` : ''}`;
          break;
        }
        case 'RED_CARD': {
          eventCategory = 'DISCIPLINE';
          pointsAwarded = 0;
          if (action.team === 'A') next.teamARedCards += 1;
          else next.teamBRedCards += 1;
          label = `${minuteLabel} Red Card · Team ${action.team}${pName ? ` (${pName})` : ''}`;
          break;
        }
        case 'SECOND_YELLOW': {
          eventCategory = 'DISCIPLINE';
          pointsAwarded = 0;
          if (action.team === 'A') {
            next.teamAYellowCards += 1;
            next.teamARedCards += 1;
          } else {
            next.teamBYellowCards += 1;
            next.teamBRedCards += 1;
          }
          label = `${minuteLabel} Second Yellow / Red Card · Team ${action.team}${pName ? ` (${pName})` : ''}`;
          break;
        }
        case 'SUBSTITUTION': {
          eventCategory = 'SUBSTITUTION';
          pointsAwarded = 0;
          label = `${minuteLabel} Sub (Team ${action.team}): ${pName || 'In'} replaces ${outName || 'Out'}`;
          break;
        }
        case 'SHOOTOUT_SCORED': {
          eventCategory = 'SHOOTOUT';
          pointsAwarded = 0; // Shootout does not add to main regular-time goal score
          if (action.team === 'A') next.teamAPenalties += 1;
          else next.teamBPenalties += 1;
          label = `Shootout Goal · Team ${action.team}${pName ? ` (${pName})` : ''} (${next.teamAPenalties}-${next.teamBPenalties})`;
          break;
        }
        case 'SHOOTOUT_MISSED': {
          eventCategory = 'SHOOTOUT';
          pointsAwarded = 0;
          label = `Shootout Missed · Team ${action.team}${pName ? ` (${pName})` : ''} (${next.teamAPenalties}-${next.teamBPenalties})`;
          break;
        }
        case 'CUSTOM_EVENT':
        default: {
          const g = typeof action.goalsDelta === 'number' ? Math.max(0, Math.trunc(action.goalsDelta)) : 0;
          pointsAwarded = g;
          if (g > 0) {
            if (action.team === 'A') teamAScore += g;
            else teamBScore += g;
          }
          label = `${minuteLabel} ${action.description?.trim() || `Team ${action.team} Custom Event`}`;
          break;
        }
      }

      next.events = [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          team: action.team,
          eventType: action.eventType,
          minuteLabel,
          playerName: pName,
          assistPlayerName: aName,
          playerOutName: outName,
          description: action.description?.trim() || '',
          scoreSnapshot: `${teamAScore}-${teamBScore}`,
          timestamp: new Date().toISOString(),
        },
        ...next.events.slice(0, 59),
      ];
      break;
    }
    case 'SET_META': {
      eventCategory = 'META';
      if (action.half) next.half = action.half;
      if (action.timerMinutes !== undefined) next.timerMinutes = Math.max(0, Math.min(130, action.timerMinutes));
      if (action.timerSeconds !== undefined) next.timerSeconds = Math.max(0, Math.min(59, action.timerSeconds));
      if (action.extraTimeMinutes !== undefined) next.extraTimeMinutes = Math.max(0, Math.min(30, action.extraTimeMinutes));
      label = `Match time/period: ${next.half} (${next.timerMinutes}')`;
      break;
    }
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
