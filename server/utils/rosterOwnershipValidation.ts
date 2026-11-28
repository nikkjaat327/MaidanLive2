import type { SportType } from '../models/LiveStream.ts';

export interface TeamRosterSets {
  strictTeamA: Set<string>;
  strictTeamB: Set<string>;
}

function normName(val: unknown): string {
  return typeof val === 'string' ? val.trim().toLowerCase() : '';
}

export function buildTeamRosterSets(params: {
  teamAId?: unknown;
  teamBId?: unknown;
  teamAPlayers?: Array<{ name?: string | null }> | null;
  teamBPlayers?: Array<{ name?: string | null }> | null;
  dbPlayers?: Array<{ name?: string | null; teamId?: unknown }> | null;
}): TeamRosterSets {
  const setA = new Set<string>();
  const setB = new Set<string>();

  for (const p of params.teamAPlayers || []) {
    const n = normName(p?.name);
    if (n) setA.add(n);
  }
  for (const p of params.teamBPlayers || []) {
    const n = normName(p?.name);
    if (n) setB.add(n);
  }

  const teamAStr = params.teamAId ? String(params.teamAId) : '';
  const teamBStr = params.teamBId ? String(params.teamBId) : '';

  for (const p of params.dbPlayers || []) {
    const n = normName(p?.name);
    if (!n) continue;
    const rawTid =
      p?.teamId && typeof p.teamId === 'object' && '_id' in (p.teamId as any)
        ? String((p.teamId as any)._id)
        : p?.teamId
          ? String(p.teamId)
          : '';
    if (!rawTid) continue;
    if (teamAStr && rawTid === teamAStr) setA.add(n);
    if (teamBStr && rawTid === teamBStr) setB.add(n);
  }

  const strictTeamA = new Set<string>();
  const strictTeamB = new Set<string>();
  for (const n of setA) {
    if (!setB.has(n)) strictTeamA.add(n);
  }
  for (const n of setB) {
    if (!setA.has(n)) strictTeamB.add(n);
  }

  return { strictTeamA, strictTeamB };
}

export function validateSportPlayerOwnership(params: {
  sportType: SportType | string;
  rosters: TeamRosterSets;
  battingTeam?: 'A' | 'B';
  action?: Record<string, any> | null;
  batsman1?: string;
  batsman2?: string;
  bowler?: string;
  playerName?: string;
  assistPlayerName?: string;
}): { valid: boolean; message?: string } {
  const { rosters, sportType } = params;
  if (rosters.strictTeamA.size === 0 && rosters.strictTeamB.size === 0) {
    return { valid: true };
  }

  const belongsStrictlyTo = (name: unknown, team: 'A' | 'B'): boolean => {
    const n = normName(name);
    if (!n) return false;
    return team === 'A' ? rosters.strictTeamA.has(n) : rosters.strictTeamB.has(n);
  };

  if (sportType === 'Cricket') {
    const act = params.action || {};
    const effectiveBatTeam: 'A' | 'B' =
      act.type === 'START_SECOND_INNINGS' && (act.battingTeam === 'A' || act.battingTeam === 'B')
        ? act.battingTeam
        : params.battingTeam === 'B'
          ? 'B'
          : 'A';
    const effectiveBowlTeam: 'A' | 'B' = effectiveBatTeam === 'A' ? 'B' : 'A';

    if (act.type === 'SUBSTITUTE_PLAYER') {
      const subTeam: 'A' | 'B' =
        act.team === 'A' || act.team === 'B'
          ? act.team
          : act.role === 'BOWLER'
            ? effectiveBowlTeam
            : effectiveBatTeam;
      const oppTeam: 'A' | 'B' = subTeam === 'A' ? 'B' : 'A';
      for (const candidate of [act.playerOut, act.playerIn]) {
        if (belongsStrictlyTo(candidate, oppTeam)) {
          return {
            valid: false,
            message: `Invalid Cricket substitution: "${String(candidate).trim()}" belongs to Team ${oppTeam}, not Team ${subTeam}.`,
          };
        }
      }
      return { valid: true };
    }

    const batterCandidates = [
      params.batsman1,
      params.batsman2,
      act.batsman1,
      act.batsman2,
      act.striker,
      act.nonStriker,
      act.newBatsman,
      act.dismissedPlayer,
    ];
    for (const candidate of batterCandidates) {
      if (belongsStrictlyTo(candidate, effectiveBowlTeam)) {
        return {
          valid: false,
          message: `Invalid Cricket batter selection: "${String(candidate).trim()}" belongs to the bowling team (Team ${effectiveBowlTeam}).`,
        };
      }
    }

    const bowlerFielderCandidates = [params.bowler, act.bowler, act.nextBowler, act.fielder];
    for (const candidate of bowlerFielderCandidates) {
      if (belongsStrictlyTo(candidate, effectiveBatTeam)) {
        return {
          valid: false,
          message: `Invalid Cricket bowler/fielder selection: "${String(candidate).trim()}" belongs to the batting team (Team ${effectiveBatTeam}).`,
        };
      }
    }
    return { valid: true };
  }

  const act = params.action || {};
  const teamSide: 'A' | 'B' | '' = act.team === 'A' || act.team === 'B' ? act.team : '';
  if (teamSide) {
    const oppSide: 'A' | 'B' = teamSide === 'A' ? 'B' : 'A';
    if (sportType === 'Football') {
      for (const candidate of [
        params.playerName,
        params.assistPlayerName,
        act.playerName,
        act.assistPlayerName,
        act.playerOutName,
      ]) {
        if (belongsStrictlyTo(candidate, oppSide)) {
          return {
            valid: false,
            message: `Invalid Football player selection: "${String(candidate).trim()}" belongs to Team ${oppSide}.`,
          };
        }
      }
    } else if (sportType === 'Volleyball') {
      for (const candidate of [params.playerName, act.playerName]) {
        if (belongsStrictlyTo(candidate, oppSide)) {
          return {
            valid: false,
            message: `Invalid Volleyball player selection: "${String(candidate).trim()}" belongs to Team ${oppSide}.`,
          };
        }
      }
    } else if (sportType === 'Kabaddi') {
      const evType = String(act.eventType || act.type || '');
      const isTackleAction =
        evType === 'TACKLE_POINT' || evType === 'SUPER_TACKLE' || evType.includes('TACKLE');
      if (isTackleAction) {
        if (belongsStrictlyTo(act.defenderName || params.playerName, oppSide)) {
          return {
            valid: false,
            message: `Invalid Kabaddi defender selection: "${String(act.defenderName || params.playerName).trim()}" belongs to Team ${oppSide}.`,
          };
        }
      } else if (belongsStrictlyTo(act.raiderName || act.playerName || params.playerName, oppSide)) {
        return {
          valid: false,
          message: `Invalid Kabaddi player selection: "${String(act.raiderName || act.playerName || params.playerName).trim()}" belongs to Team ${oppSide}.`,
        };
      }
    }
  }

  return { valid: true };
}
