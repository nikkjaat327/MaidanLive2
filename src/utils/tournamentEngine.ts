import type { SportOption } from '../constants/sports.ts';
import type { PointsTableRow, TournamentFormat } from '../types/index.ts';

export interface TournamentTeamInput {
  id: string;
  name: string;
  shortName?: string;
  logoUrl?: string;
}

export interface GeneratedFixtureDraft {
  roundNumber: number;
  roundName: string;
  groupName: string;
  matchNumber: number;
  teamAId: string | null;
  teamBId: string | null;
  teamAName: string;
  teamBName: string;
  teamALogo: string;
  teamBLogo: string;
  isBye: boolean;
  status: 'SCHEDULED' | 'BYE';
  tempKey: string;
  nextTempKey?: string;
  nextFixtureSlot?: 'A' | 'B' | '';
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function getRoundName(roundSize: number): string {
  if (roundSize === 2) return 'Final';
  if (roundSize === 4) return 'Semi-Finals';
  if (roundSize === 8) return 'Quarter-Finals';
  return `Round of ${roundSize}`;
}

export function generateKnockoutDrafts(teams: TournamentTeamInput[]): GeneratedFixtureDraft[] {
  if (teams.length < 2) return [];
  const bracketSize = nextPowerOfTwo(teams.length);
  const totalRounds = Math.log2(bracketSize);
  const drafts: GeneratedFixtureDraft[] = [];

  // Seed slots with BYEs evenly placed on opposite halves where possible
  const slots: Array<TournamentTeamInput | null> = new Array(bracketSize).fill(null);
  for (let i = 0; i < teams.length; i++) {
    slots[i] = teams[i];
  }
  // Spread teams so BYEs do not pair against BYEs unnecessarily
  const orderedSlots: Array<TournamentTeamInput | null> = [];
  const byeCount = bracketSize - teams.length;
  let teamIdx = 0;
  let remainingByes = byeCount;
  for (let i = 0; i < bracketSize / 2; i++) {
    orderedSlots.push(teams[teamIdx++] || null);
    if (remainingByes > 0) {
      orderedSlots.push(null);
      remainingByes -= 1;
    } else {
      orderedSlots.push(teams[teamIdx++] || null);
    }
  }

  let matchNumber = 1;
  const roundKeys: string[][] = [];

  for (let r = 1; r <= totalRounds; r++) {
    const matchesInRound = bracketSize / Math.pow(2, r);
    const roundSize = matchesInRound * 2;
    const roundName = getRoundName(roundSize);
    const keys: string[] = [];

    for (let m = 0; m < matchesInRound; m++) {
      const tempKey = `R${r}-M${m}`;
      keys.push(tempKey);

      if (r === 1) {
        const tA = orderedSlots[m * 2] || null;
        const tB = orderedSlots[m * 2 + 1] || null;
        const isBye = Boolean((tA && !tB) || (!tA && tB));
        drafts.push({
          roundNumber: r,
          roundName,
          groupName: '',
          matchNumber: matchNumber++,
          teamAId: tA ? tA.id : null,
          teamBId: tB ? tB.id : null,
          teamAName: tA ? tA.name : isBye ? 'BYE' : 'TBD',
          teamBName: tB ? tB.name : isBye ? 'BYE' : 'TBD',
          teamALogo: tA?.logoUrl || '',
          teamBLogo: tB?.logoUrl || '',
          isBye,
          status: isBye ? 'BYE' : 'SCHEDULED',
          tempKey,
        });
      } else {
        drafts.push({
          roundNumber: r,
          roundName,
          groupName: '',
          matchNumber: matchNumber++,
          teamAId: null,
          teamBId: null,
          teamAName: 'TBD',
          teamBName: 'TBD',
          teamALogo: '',
          teamBLogo: '',
          isBye: false,
          status: 'SCHEDULED',
          tempKey,
        });
      }
    }
    roundKeys.push(keys);
  }

  // Link nextTempKey + auto-advance Round 1 BYE teams into Round 2 slots cleanly
  const draftMap = new Map(drafts.map((d) => [d.tempKey, d]));
  for (let r = 0; r < roundKeys.length - 1; r++) {
    const curr = roundKeys[r];
    const next = roundKeys[r + 1];
    curr.forEach((key, idx) => {
      const targetKey = next[Math.floor(idx / 2)];
      const slot: 'A' | 'B' = idx % 2 === 0 ? 'A' : 'B';
      const d = draftMap.get(key);
      if (d) {
        d.nextTempKey = targetKey;
        d.nextFixtureSlot = slot;
        if (d.isBye) {
          const advancingTeamId = d.teamAId || d.teamBId;
          const advancingTeamName = d.teamAId ? d.teamAName : d.teamBName;
          const advancingLogo = d.teamAId ? d.teamALogo : d.teamBLogo;
          const nextDraft = draftMap.get(targetKey);
          if (nextDraft && advancingTeamId) {
            if (slot === 'A') {
              nextDraft.teamAId = advancingTeamId;
              nextDraft.teamAName = advancingTeamName;
              nextDraft.teamALogo = advancingLogo;
            } else {
              nextDraft.teamBId = advancingTeamId;
              nextDraft.teamBName = advancingTeamName;
              nextDraft.teamBLogo = advancingLogo;
            }
          }
        }
      }
    });
  }

  return drafts;
}

export function generateRoundRobinDrafts(
  teams: TournamentTeamInput[],
  groupName = '',
  startMatchNumber = 1
): GeneratedFixtureDraft[] {
  if (teams.length < 2) return [];
  const list: Array<TournamentTeamInput | null> = [...teams];
  if (list.length % 2 === 1) list.push(null); // Bye slot for odd team count
  const n = list.length;
  const totalRounds = n - 1;
  const drafts: GeneratedFixtureDraft[] = [];
  let matchNo = startMatchNumber;

  for (let round = 0; round < totalRounds; round++) {
    for (let i = 0; i < n / 2; i++) {
      const tA = list[i];
      const tB = list[n - 1 - i];
      if (!tA || !tB) continue; // Skip bye pairings in round-robin league play
      drafts.push({
        roundNumber: round + 1,
        roundName: groupName ? `${groupName} · Round ${round + 1}` : `Round ${round + 1}`,
        groupName,
        matchNumber: matchNo++,
        teamAId: tA.id,
        teamBId: tB.id,
        teamAName: tA.name,
        teamBName: tB.name,
        teamALogo: tA.logoUrl || '',
        teamBLogo: tB.logoUrl || '',
        isBye: false,
        status: 'SCHEDULED',
        tempKey: `${groupName || 'L'}-R${round + 1}-M${i}`,
      });
    }
    // Rotate all except index 0
    const fixed = list[0];
    const last = list.pop()!;
    list.splice(1, 0, last);
    list[0] = fixed;
  }

  return drafts;
}

export function generateTournamentFixtures(
  format: TournamentFormat,
  teams: TournamentTeamInput[],
  groupCount = 2
): GeneratedFixtureDraft[] {
  if (teams.length < 2) return [];

  if (format === 'KNOCKOUT') {
    return generateKnockoutDrafts(teams);
  }

  if (format === 'LEAGUE') {
    return generateRoundRobinDrafts(teams);
  }

  // GROUP_STAGE or GROUP_KNOCKOUT
  const groups = Math.max(1, Math.min(8, Math.floor(groupCount || 2)));
  const buckets: TournamentTeamInput[][] = Array.from({ length: groups }, () => []);
  teams.forEach((team, idx) => {
    buckets[idx % groups].push(team);
  });

  const drafts: GeneratedFixtureDraft[] = [];
  let nextMatchNum = 1;
  buckets.forEach((bucket, idx) => {
    const letter = String.fromCharCode(65 + idx);
    const groupDrafts = generateRoundRobinDrafts(bucket, `Group ${letter}`, nextMatchNum);
    nextMatchNum += groupDrafts.length;
    drafts.push(...groupDrafts);
  });

  if (format === 'GROUP_KNOCKOUT') {
    const knockoutRoundStart = Math.max(1, ...drafts.map((d) => d.roundNumber)) + 1;
    // Create placeholder knockout semi-finals/final slots if >=2 groups
    if (groups >= 2) {
      const sf1Key = 'KO-SF1';
      const sf2Key = 'KO-SF2';
      const finalKey = 'KO-FINAL';
      if (groups >= 2 && teams.length >= 4) {
        drafts.push(
          {
            roundNumber: knockoutRoundStart,
            roundName: 'Semi-Finals',
            groupName: 'Knockout',
            matchNumber: nextMatchNum++,
            teamAId: null,
            teamBId: null,
            teamAName: 'Group A #1',
            teamBName: 'Group B #2',
            teamALogo: '',
            teamBLogo: '',
            isBye: false,
            status: 'SCHEDULED',
            tempKey: sf1Key,
            nextTempKey: finalKey,
            nextFixtureSlot: 'A',
          },
          {
            roundNumber: knockoutRoundStart,
            roundName: 'Semi-Finals',
            groupName: 'Knockout',
            matchNumber: nextMatchNum++,
            teamAId: null,
            teamBId: null,
            teamAName: 'Group B #1',
            teamBName: 'Group A #2',
            teamALogo: '',
            teamBLogo: '',
            isBye: false,
            status: 'SCHEDULED',
            tempKey: sf2Key,
            nextTempKey: finalKey,
            nextFixtureSlot: 'B',
          },
          {
            roundNumber: knockoutRoundStart + 1,
            roundName: 'Final',
            groupName: 'Knockout',
            matchNumber: nextMatchNum++,
            teamAId: null,
            teamBId: null,
            teamAName: 'SF1 Winner',
            teamBName: 'SF2 Winner',
            teamALogo: '',
            teamBLogo: '',
            isBye: false,
            status: 'SCHEDULED',
            tempKey: finalKey,
          }
        );
      }
    }
  }

  return drafts;
}

export interface ConfirmedMatchStandingInput {
  teamAId?: string | null;
  teamBId?: string | null;
  teamAScore: number;
  teamBScore: number;
  resultStatus: string;
  winnerTeamId?: string | null;
  groupName?: string;
  sportSpecificDetails?: Record<string, any>;
}

function cricketBallsToOversFloat(balls: number): number {
  const safe = Math.max(0, Math.floor(balls || 0));
  return Math.floor(safe / 6) + (safe % 6) / 6;
}

export function calculatePointsTable(
  sportType: SportOption,
  teams: TournamentTeamInput[],
  confirmedMatches: ConfirmedMatchStandingInput[],
  teamGroupLookup?: Record<string, string>
): PointsTableRow[] {
  const rowsMap = new Map<string, PointsTableRow>();

  for (const team of teams) {
    rowsMap.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      shortName: team.shortName || team.name.slice(0, 3).toUpperCase(),
      logoUrl: team.logoUrl || '',
      groupName: teamGroupLookup?.[team.id] || '',
      played: 0,
      won: 0,
      lost: 0,
      drawn: 0,
      tied: 0,
      noResult: 0,
      points: 0,
      scoreFor: 0,
      scoreAgainst: 0,
      scoreDiff: 0,
      netRunRate: sportType === 'Cricket' ? 0 : null,
      oversFacedBalls: 0,
      oversBowledBalls: 0,
    });
  }

  for (const m of confirmedMatches) {
    if (!m.resultStatus || m.resultStatus === 'NOT_DECLARED') continue;
    if (!m.teamAId || !m.teamBId) continue;

    const rowA = rowsMap.get(m.teamAId);
    const rowB = rowsMap.get(m.teamBId);
    if (!rowA || !rowB) continue;

    if (m.groupName) {
      if (!rowA.groupName) rowA.groupName = m.groupName;
      if (!rowB.groupName) rowB.groupName = m.groupName;
    }

    rowA.played += 1;
    rowB.played += 1;

    const d = m.sportSpecificDetails || {};
    if (sportType === 'Cricket') {
      const runsA = Number(d.teamARuns ?? m.teamAScore ?? 0);
      const runsB = Number(d.teamBRuns ?? m.teamBScore ?? 0);
      const oversLimitBalls = Math.max(6, (Number(d.oversLimit) || 20) * 6);
      const maxWkts = Math.max(1, (Number(d.playersPerSide) || 11) - 1);
      const wktsA = Number(d.teamAWickets || 0);
      const wktsB = Number(d.teamBWickets || 0);
      const ballsA = wktsA >= maxWkts ? oversLimitBalls : Math.max(0, Number(d.teamABalls || 0));
      const ballsB = wktsB >= maxWkts ? oversLimitBalls : Math.max(0, Number(d.teamBBalls || 0));

      if (m.resultStatus !== 'NO_RESULT' && m.resultStatus !== 'ABANDONED') {
        rowA.scoreFor += runsA;
        rowA.scoreAgainst += runsB;
        rowA.oversFacedBalls = (rowA.oversFacedBalls || 0) + ballsA;
        rowA.oversBowledBalls = (rowA.oversBowledBalls || 0) + ballsB;

        rowB.scoreFor += runsB;
        rowB.scoreAgainst += runsA;
        rowB.oversFacedBalls = (rowB.oversFacedBalls || 0) + ballsB;
        rowB.oversBowledBalls = (rowB.oversBowledBalls || 0) + ballsA;
      }
    } else if (sportType === 'Volleyball') {
      const setsA = Number(d.teamASetsWon ?? 0);
      const setsB = Number(d.teamBSetsWon ?? 0);
      rowA.scoreFor += setsA;
      rowA.scoreAgainst += setsB;
      rowB.scoreFor += setsB;
      rowB.scoreAgainst += setsA;
    } else {
      rowA.scoreFor += m.teamAScore || 0;
      rowA.scoreAgainst += m.teamBScore || 0;
      rowB.scoreFor += m.teamBScore || 0;
      rowB.scoreAgainst += m.teamAScore || 0;
    }

    if (m.resultStatus === 'DECLARED' && m.winnerTeamId) {
      if (m.winnerTeamId === m.teamAId) {
        rowA.won += 1;
        rowA.points += sportType === 'Football' ? 3 : 2;
        rowB.lost += 1;
      } else if (m.winnerTeamId === m.teamBId) {
        rowB.won += 1;
        rowB.points += sportType === 'Football' ? 3 : 2;
        rowA.lost += 1;
      }
    } else if (m.resultStatus === 'DRAW') {
      rowA.drawn += 1;
      rowB.drawn += 1;
      rowA.points += 1;
      rowB.points += 1;
    } else if (m.resultStatus === 'TIE') {
      rowA.tied += 1;
      rowB.tied += 1;
      rowA.points += 1;
      rowB.points += 1;
    } else if (m.resultStatus === 'NO_RESULT' || m.resultStatus === 'ABANDONED') {
      rowA.noResult += 1;
      rowB.noResult += 1;
      rowA.points += 1;
      rowB.points += 1;
    }
  }

  const results = Array.from(rowsMap.values()).map((row) => {
    row.scoreDiff = row.scoreFor - row.scoreAgainst;
    if (sportType === 'Cricket') {
      const ovFaced = cricketBallsToOversFloat(row.oversFacedBalls || 0);
      const ovBowled = cricketBallsToOversFloat(row.oversBowledBalls || 0);
      if (ovFaced > 0 && ovBowled > 0) {
        row.netRunRate = Number((row.scoreFor / ovFaced - row.scoreAgainst / ovBowled).toFixed(3));
      } else {
        row.netRunRate = 0;
      }
    }
    return row;
  });

  return results.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (sportType === 'Cricket' && a.netRunRate !== null && b.netRunRate !== null) {
      if (b.netRunRate !== a.netRunRate) return b.netRunRate - a.netRunRate;
    }
    if (b.scoreDiff !== a.scoreDiff) return b.scoreDiff - a.scoreDiff;
    if (b.won !== a.won) return b.won - a.won;
    return a.teamName.localeCompare(b.teamName);
  });
}
