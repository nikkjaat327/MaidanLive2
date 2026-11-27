import type { SportOption } from '../constants/sports.ts';
import type { LiveStreamData, MatchDraftPlayerData, PlayerData } from '../types/index.ts';
import { resolveTeamId } from './dedupe.ts';

export const SPORT_PLAYER_POSITIONS: Record<SportOption, string[]> = {
  Cricket: [
    'Batsman',
    'Bowler',
    'All-Rounder',
    'Wicketkeeper',
    'Opening Batsman',
    'Captain',
  ],
  Kabaddi: [
    'Raider',
    'Left Corner',
    'Right Corner',
    'Left Cover',
    'Right Cover',
    'All-Rounder',
    'Defender',
  ],
  Football: [
    'Goalkeeper',
    'Defender',
    'Midfielder',
    'Forward / Striker',
    'Winger',
    'Substitute',
  ],
  Volleyball: [
    'Setter',
    'Outside Hitter',
    'Opposite Hitter',
    'Middle Blocker',
    'Libero',
    'Universal',
  ],
  Other: [
    'Player',
    'Captain',
    'Attacker',
    'Defender',
    'All-Rounder',
    'Substitute',
  ],
};

export function getSportPositions(sport?: SportOption | string | null): string[] {
  if (sport && sport in SPORT_PLAYER_POSITIONS) {
    return SPORT_PLAYER_POSITIONS[sport as SportOption];
  }
  return SPORT_PLAYER_POSITIONS.Other;
}

export interface UnifiedMatchPlayer {
  id: string;
  dbPlayerId?: string;
  name: string;
  position: string;
  jerseyNumber?: number | null;
  teamSide: 'A' | 'B' | '';
  isDraftOnly: boolean;
}

export function sanitizeDraftPlayersClient(
  raw: MatchDraftPlayerData[] | undefined | null
): MatchDraftPlayerData[] {
  if (!Array.isArray(raw)) return [];
  const out: MatchDraftPlayerData[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const name = String(item.name || '').trim().slice(0, 80);
    if (!name) continue;
    const position = String(item.position || '').trim().slice(0, 60);
    const jerseyNumRaw =
      item.jerseyNumber !== undefined && item.jerseyNumber !== null && String(item.jerseyNumber) !== ''
        ? Number(item.jerseyNumber)
        : null;
    const jerseyNumber =
      jerseyNumRaw !== null && Number.isFinite(jerseyNumRaw) && jerseyNumRaw >= 0 && jerseyNumRaw <= 999
        ? Math.floor(jerseyNumRaw)
        : null;
    out.push({
      ...(item.id ? { id: String(item.id).trim().slice(0, 64) } : {}),
      name,
      ...(position ? { position } : {}),
      ...(jerseyNumber !== null ? { jerseyNumber } : {}),
    });
    if (out.length >= 30) break;
  }
  return out;
}

export function mergeMatchRoster(
  stream: Pick<LiveStreamData, 'teamAId' | 'teamBId' | 'teamAPlayers' | 'teamBPlayers'> | null | undefined,
  dbPlayers: PlayerData[] = []
): {
  teamA: UnifiedMatchPlayer[];
  teamB: UnifiedMatchPlayer[];
  all: UnifiedMatchPlayer[];
} {
  const teamA: UnifiedMatchPlayer[] = [];
  const teamB: UnifiedMatchPlayer[] = [];
  const other: UnifiedMatchPlayer[] = [];

  const seenA = new Set<string>();
  const seenB = new Set<string>();
  const seenAll = new Set<string>();

  const pushSide = (
    target: UnifiedMatchPlayer[],
    seenSet: Set<string>,
    item: UnifiedMatchPlayer
  ) => {
    const key = item.name.trim().toLowerCase();
    if (!key || seenSet.has(key)) return;
    seenSet.add(key);
    target.push(item);
    const allKey = `${item.teamSide}:${key}`;
    if (!seenAll.has(allKey)) {
      seenAll.add(allKey);
    }
  };

  // 1. Drafted players stored on match document take top billing for instant match setup usage
  const draftA = Array.isArray(stream?.teamAPlayers) ? stream!.teamAPlayers! : [];
  draftA.forEach((p, idx) => {
    const cleanName = String(p?.name || '').trim();
    if (!cleanName) return;
    const rawId = p?.id ? String(p.id).trim() : '';
    const isMongoId = /^[a-f\d]{24}$/i.test(rawId);
    pushSide(teamA, seenA, {
      id: rawId || `draft_A_${idx}_${cleanName}`,
      ...(isMongoId ? { dbPlayerId: rawId } : {}),
      name: cleanName,
      position: String(p?.position || '').trim(),
      jerseyNumber: p?.jerseyNumber ?? null,
      teamSide: 'A',
      isDraftOnly: !isMongoId,
    });
  });

  const draftB = Array.isArray(stream?.teamBPlayers) ? stream!.teamBPlayers! : [];
  draftB.forEach((p, idx) => {
    const cleanName = String(p?.name || '').trim();
    if (!cleanName) return;
    const rawId = p?.id ? String(p.id).trim() : '';
    const isMongoId = /^[a-f\d]{24}$/i.test(rawId);
    pushSide(teamB, seenB, {
      id: rawId || `draft_B_${idx}_${cleanName}`,
      ...(isMongoId ? { dbPlayerId: rawId } : {}),
      name: cleanName,
      position: String(p?.position || '').trim(),
      jerseyNumber: p?.jerseyNumber ?? null,
      teamSide: 'B',
      isDraftOnly: !isMongoId,
    });
  });

  // 2. Database players linked via teamAId / teamBId (deduped against drafted names, enriching dbPlayerId if same name)
  const enrichOrPush = (
    target: UnifiedMatchPlayer[],
    seenSet: Set<string>,
    side: 'A' | 'B' | '',
    p: PlayerData
  ) => {
    const cleanName = String(p.name || '').trim();
    if (!cleanName) return;
    const pid = String(p.id || p._id || '');
    const key = cleanName.toLowerCase();
    const existing = target.find((item) => item.name.trim().toLowerCase() === key);
    if (existing) {
      if (!existing.dbPlayerId && pid) {
        existing.dbPlayerId = pid;
        existing.id = pid;
        existing.isDraftOnly = false;
      }
      if (!existing.position && (p.position || p.role)) {
        existing.position = p.position || p.role || '';
      }
      if (existing.jerseyNumber == null && p.jerseyNumber != null) {
        existing.jerseyNumber = p.jerseyNumber;
      }
      return;
    }
    pushSide(target, seenSet, {
      id: pid || `db_${side}_${cleanName}`,
      dbPlayerId: pid || undefined,
      name: cleanName,
      position: p.position || p.role || '',
      jerseyNumber: p.jerseyNumber ?? null,
      teamSide: side,
      isDraftOnly: false,
    });
  };

  for (const p of dbPlayers) {
    const tid = resolveTeamId(p.teamId);
    if (stream?.teamAId && tid === stream.teamAId) {
      enrichOrPush(teamA, seenA, 'A', p);
    } else if (stream?.teamBId && tid === stream.teamBId) {
      enrichOrPush(teamB, seenB, 'B', p);
    } else {
      const seenOther = new Set(other.map((x) => x.name.trim().toLowerCase()));
      enrichOrPush(other, seenOther, '', p);
    }
  }

  // Build deduplicated combined list: Team A, Team B, then any unassigned DB players
  const all: UnifiedMatchPlayer[] = [...teamA, ...teamB];
  for (const item of other) {
    const k = item.name.trim().toLowerCase();
    if (!seenA.has(k) && !seenB.has(k)) {
      all.push(item);
    }
  }

  return { teamA, teamB, all };
}

export function formatUnifiedPlayerLabel(player: UnifiedMatchPlayer): string {
  const jersey = player.jerseyNumber != null ? `#${player.jerseyNumber} ` : '';
  const pos = player.position ? ` — ${player.position}` : '';
  return `${jersey}${player.name}${pos}`;
}
