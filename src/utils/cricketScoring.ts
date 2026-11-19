export interface CricketExtras {
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
  penaltyRuns?: number;
}

export interface CricketDeliveryLogItem {
  id: string;
  innings: 1 | 2;
  battingTeam: 'A' | 'B';
  overText: string;
  eventType: string;
  batRuns: number;
  extraRuns: number;
  extraType: string;
  isWicket: boolean;
  wicketType?: string;
  dismissedPlayer?: string;
  newBatsman?: string;
  bowler?: string;
  scoreSnapshot: string;
  description?: string;
  timestamp: string;
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

export function createInitialCricketDetails(): CricketDetails {
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
    oversLimit: 20,
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

export function calculateRequiredRunRate(details: CricketDetails): string | null {
  if (details.innings !== 2 || !details.target || details.target <= 0) return null;
  const chasingRuns = details.battingTeam === 'A' ? details.teamARuns : details.teamBRuns;
  const chasingBalls = details.battingTeam === 'A' ? details.teamABalls : details.teamBBalls;
  const runsNeeded = Math.max(0, details.target - chasingRuns);
  if (runsNeeded === 0) return '0.00';
  const totalLimitBalls = (details.oversLimit || 20) * 6;
  const remainingBalls = totalLimitBalls - chasingBalls;
  if (remainingBalls <= 0) return null;
  return ((runsNeeded * 6) / remainingBalls).toFixed(2);
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
  | { type: 'RUNS'; runs: number }
  | { type: 'WIDE'; extraRuns?: number }
  | { type: 'NO_BALL'; extraRuns?: number }
  | { type: 'BYE'; runs: number }
  | { type: 'LEG_BYE'; runs: number }
  | { type: 'WICKET' }
  | { type: 'CHANGE_STRIKER' }
  | { type: 'END_OVER' }
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
      bowler?: string;
      description?: string;
      countsAsLegalBall?: boolean;
    }
  | { type: 'SWITCH_INNINGS'; battingTeam: 'A' | 'B'; innings: 1 | 2; setTargetFromFirstInnings?: boolean }
  | {
      type: 'UPDATE_META';
      batsman1?: string;
      batsman2?: string;
      bowler?: string;
      target?: number;
      oversLimit?: number;
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

export function applyCricketAction(
  current: CricketDetails,
  action: CricketActionPayload
): {
  details: CricketDetails;
  teamAScore: number;
  teamBScore: number;
  label: string;
  pointsAwarded: number;
  eventCategory: string;
  eventType: string;
} {
  const base = createInitialCricketDetails();
  const next: CricketDetails = {
    ...base,
    ...current,
    extrasA: { ...base.extrasA, ...(current.extrasA || {}) },
    extrasB: { ...base.extrasB, ...(current.extrasB || {}) },
    recentBalls: [...(current.recentBalls || [])],
    lastOverSummary: [...(current.lastOverSummary || [])],
    deliveryHistory: Array.isArray(current.deliveryHistory) ? [...current.deliveryHistory] : [],
  };

  const isA = next.battingTeam === 'A';
  let label = 'Cricket score updated';
  let pointsAwarded = 0;
  let eventCategory = 'CRICKET';
  let eventType: string = action.type;

  const pushBallEvent = (token: string, legalBallIncrement: number) => {
    const prevBalls = isA ? next.teamABalls : next.teamBBalls;
    const newBalls = prevBalls + legalBallIncrement;
    const updatedRecent = [...next.recentBalls.slice(-11), token];
    next.recentBalls = updatedRecent;
    if (legalBallIncrement > 0 && newBalls > 0 && newBalls % 6 === 0) {
      next.lastOverSummary = updatedRecent.slice(-6);
    } else if (next.lastOverSummary.length === 0) {
      next.lastOverSummary = updatedRecent.slice(-6);
    }
  };

  const activeExtras = isA ? next.extrasA : next.extrasB;

  switch (action.type) {
    case 'RUNS': {
      const r = Math.max(0, action.runs);
      pushBallEvent(String(r), 1);
      if (isA) {
        next.teamARuns += r;
        next.teamABalls += 1;
      } else {
        next.teamBRuns += r;
        next.teamBBalls += 1;
      }
      pointsAwarded = r;
      label = r === 0 ? 'Dot ball' : `+${r} run${r > 1 ? 's' : ''}`;
      break;
    }
    case 'WIDE': {
      const total = 1 + Math.max(0, action.extraRuns || 0);
      if (isA) {
        next.teamARuns += total;
        next.extrasA.wides += total;
      } else {
        next.teamBRuns += total;
        next.extrasB.wides += total;
      }
      pushBallEvent(total > 1 ? `Wd+${total - 1}` : 'Wd', 0);
      pointsAwarded = total;
      label = `Wide (+${total})`;
      break;
    }
    case 'NO_BALL': {
      const total = 1 + Math.max(0, action.extraRuns || 0);
      if (isA) {
        next.teamARuns += total;
        next.extrasA.noBalls += 1;
      } else {
        next.teamBRuns += total;
        next.extrasB.noBalls += 1;
      }
      pushBallEvent(total > 1 ? `Nb+${total - 1}` : 'Nb', 0);
      pointsAwarded = total;
      label = `No Ball (+${total})`;
      break;
    }
    case 'BYE': {
      const r = Math.max(1, action.runs || 1);
      pushBallEvent(`B${r}`, 1);
      if (isA) {
        next.teamARuns += r;
        next.teamABalls += 1;
        next.extrasA.byes += r;
      } else {
        next.teamBRuns += r;
        next.teamBBalls += 1;
        next.extrasB.byes += r;
      }
      pointsAwarded = r;
      label = `Bye (+${r})`;
      break;
    }
    case 'LEG_BYE': {
      const r = Math.max(1, action.runs || 1);
      pushBallEvent(`Lb${r}`, 1);
      if (isA) {
        next.teamARuns += r;
        next.teamABalls += 1;
        next.extrasA.legByes += r;
      } else {
        next.teamBRuns += r;
        next.teamBBalls += 1;
        next.extrasB.legByes += r;
      }
      pointsAwarded = r;
      label = `Leg Bye (+${r})`;
      break;
    }
    case 'WICKET': {
      pushBallEvent('W', 1);
      if (isA) {
        next.teamAWickets = Math.min(10, next.teamAWickets + 1);
        next.teamABalls += 1;
      } else {
        next.teamBWickets = Math.min(10, next.teamBWickets + 1);
        next.teamBBalls += 1;
      }
      pointsAwarded = 0;
      label = 'Wicket!';
      break;
    }
    case 'CHANGE_STRIKER': {
      eventCategory = 'META';
      const temp = next.batsman1;
      next.batsman1 = next.batsman2;
      next.batsman2 = temp;
      label = next.batsman1
        ? `Striker rotated: ${next.batsman1} on strike`
        : 'Striker rotated';
      break;
    }
    case 'END_OVER': {
      eventCategory = 'META';
      const activeBalls = isA ? next.teamABalls : next.teamBBalls;
      const rem = activeBalls % 6;
      if (rem !== 0) {
        const pad = 6 - rem;
        if (isA) next.teamABalls += pad;
        else next.teamBBalls += pad;
      }
      const temp = next.batsman1;
      next.batsman1 = next.batsman2;
      next.batsman2 = temp;
      next.lastOverSummary = next.recentBalls.slice(-6);
      const oversDone = Math.floor((isA ? next.teamABalls : next.teamBBalls) / 6);
      label = `End of Over ${oversDone}`;
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

      // Wide/No-ball always carry at least 1 penalty run when selected unless already provided
      if ((extraType === 'WIDE' || extraType === 'NO_BALL') && extraRuns === 0) {
        extraRuns = 1;
      }

      const isLegalBall =
        typeof action.countsAsLegalBall === 'boolean'
          ? action.countsAsLegalBall
          : extraType !== 'WIDE' &&
            extraType !== 'NO_BALL' &&
            action.eventType !== 'PENALTY_RUNS';

      const totalAdded = batRuns + extraRuns;
      pointsAwarded = totalAdded;

      if (extraType === 'WIDE') activeExtras.wides += extraRuns;
      else if (extraType === 'NO_BALL') activeExtras.noBalls += extraRuns;
      else if (extraType === 'BYE') activeExtras.byes += extraRuns;
      else if (extraType === 'LEG_BYE') activeExtras.legByes += extraRuns;
      else if (extraType === 'PENALTY') {
        activeExtras.penaltyRuns = (activeExtras.penaltyRuns || 0) + extraRuns;
      }

      let token = String(batRuns);
      if (action.isWicket) {
        token = totalAdded > 0 ? `${totalAdded}+W` : 'W';
      } else if (extraType === 'WIDE') {
        token = totalAdded > 1 ? `Wd+${totalAdded - 1}` : 'Wd';
      } else if (extraType === 'NO_BALL') {
        token = totalAdded > 1 ? `Nb+${totalAdded - 1}` : 'Nb';
      } else if (extraType === 'BYE') {
        token = `B${extraRuns}`;
      } else if (extraType === 'LEG_BYE') {
        token = `Lb${extraRuns}`;
      } else if (extraType === 'PENALTY') {
        token = `P${extraRuns}`;
      }

      pushBallEvent(token, isLegalBall ? 1 : 0);

      if (isA) {
        next.teamARuns += totalAdded;
        if (isLegalBall) next.teamABalls += 1;
        if (action.isWicket) next.teamAWickets = Math.min(10, next.teamAWickets + 1);
      } else {
        next.teamBRuns += totalAdded;
        if (isLegalBall) next.teamBBalls += 1;
        if (action.isWicket) next.teamBWickets = Math.min(10, next.teamBWickets + 1);
      }

      if (action.bowler?.trim()) {
        next.bowler = action.bowler.trim();
      }
      if (action.isWicket && action.newBatsman?.trim()) {
        if (
          action.dismissedPlayer?.trim() &&
          next.batsman2 &&
          next.batsman2.toLowerCase() === action.dismissedPlayer.trim().toLowerCase()
        ) {
          next.batsman2 = action.newBatsman.trim();
        } else {
          next.batsman1 = action.newBatsman.trim();
        }
      }

      const activeRuns = isA ? next.teamARuns : next.teamBRuns;
      const activeWkts = isA ? next.teamAWickets : next.teamBWickets;
      const activeBalls = isA ? next.teamABalls : next.teamBBalls;
      const overText = formatCricketOvers(activeBalls);

      const parts: string[] = [];
      if (action.isWicket) {
        parts.push(
          `Wicket${action.wicketType ? ` (${action.wicketType})` : ''}${
            action.dismissedPlayer ? `: ${action.dismissedPlayer}` : ''
          }`
        );
      }
      if (extraType !== 'NONE') {
        parts.push(`${extraType.replace('_', ' ')} +${extraRuns}`);
      }
      if (batRuns > 0) {
        parts.push(`${batRuns} bat run${batRuns > 1 ? 's' : ''}`);
      }
      if (parts.length === 0) {
        parts.push(action.eventType === 'CUSTOM_EVENT' ? 'Custom Event' : 'Dot ball');
      }
      if (action.description?.trim()) {
        parts.push(action.description.trim());
      }
      label = `[${overText} ov] ${parts.join(' · ')}`;

      next.deliveryHistory = [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          innings: next.innings,
          battingTeam: next.battingTeam,
          overText,
          eventType: action.eventType,
          batRuns,
          extraRuns,
          extraType,
          isWicket: Boolean(action.isWicket),
          wicketType: action.wicketType || '',
          dismissedPlayer: action.dismissedPlayer || '',
          newBatsman: action.newBatsman || '',
          bowler: next.bowler || '',
          scoreSnapshot: `${activeRuns}/${activeWkts}`,
          description: action.description?.trim() || '',
          timestamp: new Date().toISOString(),
        },
        ...next.deliveryHistory.slice(0, 59),
      ];
      break;
    }
    case 'SWITCH_INNINGS': {
      eventCategory = 'META';
      next.battingTeam = action.battingTeam;
      next.innings = action.innings;
      if (action.setTargetFromFirstInnings) {
        const firstRuns = action.battingTeam === 'B' ? next.teamARuns : next.teamBRuns;
        next.target = firstRuns + 1;
      }
      next.recentBalls = [];
      label = `Switched to Innings ${action.innings} (Team ${action.battingTeam} batting)`;
      break;
    }
    case 'UPDATE_META': {
      eventCategory = 'META';
      if (action.batsman1 !== undefined) next.batsman1 = action.batsman1;
      if (action.batsman2 !== undefined) next.batsman2 = action.batsman2;
      if (action.bowler !== undefined) next.bowler = action.bowler;
      if (action.target !== undefined) next.target = Math.max(0, Number(action.target) || 0);
      if (action.oversLimit !== undefined) next.oversLimit = Math.max(1, Number(action.oversLimit) || 20);
      if (action.teamAShortName !== undefined) next.teamAShortName = action.teamAShortName.trim().toUpperCase().slice(0, 6);
      if (action.teamBShortName !== undefined) next.teamBShortName = action.teamBShortName.trim().toUpperCase().slice(0, 6);
      if (action.tossWinner !== undefined) next.tossWinner = action.tossWinner;
      if (action.tossDecision !== undefined) next.tossDecision = action.tossDecision;
      if (action.isSuperOver !== undefined) next.isSuperOver = action.isSuperOver;
      if (action.superOverTeamARuns !== undefined) next.superOverTeamARuns = Math.max(0, Number(action.superOverTeamARuns) || 0);
      if (action.superOverTeamAWickets !== undefined) next.superOverTeamAWickets = Math.max(0, Math.min(2, Number(action.superOverTeamAWickets) || 0));
      if (action.superOverTeamBRuns !== undefined) next.superOverTeamBRuns = Math.max(0, Number(action.superOverTeamBRuns) || 0);
      if (action.superOverTeamBWickets !== undefined) next.superOverTeamBWickets = Math.max(0, Math.min(2, Number(action.superOverTeamBWickets) || 0));
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
  };
}
