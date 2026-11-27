import { ScoreHistoryItem } from '../types/index.ts';

export type MajorTimelineEventKind = 'WICKET' | 'BOUNDARY_SIX' | 'BOUNDARY_FOUR' | 'SUBSTITUTION';

export interface MajorTimelineEvent {
  id: string;
  kind: MajorTimelineEventKind;
  badge: string;
  title: string;
  subtitle: string;
  scoreSnapshot: string;
  timestamp: string;
  formattedTime: string;
}

export function formatTimelineEventTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatScoreBadge(item: ScoreHistoryItem): string {
  const upd = item.updatedScore;
  if (!upd || typeof upd !== 'object') return '';
  if (item.sportType === 'Cricket') {
    const details = (upd.sportSpecificDetails || {}) as Record<string, unknown>;
    const battingTeam = details.battingTeam === 'B' ? 'B' : 'A';
    const runs =
      battingTeam === 'B'
        ? Number(details.teamBRuns ?? upd.teamBScore ?? 0)
        : Number(details.teamARuns ?? upd.teamAScore ?? 0);
    const wkts =
      battingTeam === 'B'
        ? Number(details.teamBWickets ?? 0)
        : Number(details.teamAWickets ?? 0);
    return `${runs}/${wkts}`;
  }
  const a = Number(upd.teamAScore ?? 0);
  const b = Number(upd.teamBScore ?? 0);
  return `${a} - ${b}`;
}

export function classifyMajorTimelineEvent(
  item: ScoreHistoryItem,
  teamAName = 'Team A',
  teamBName = 'Team B'
): MajorTimelineEvent | null {
  if (!item || item.reverted) return null;
  if (
    item.entryType === 'UNDO' ||
    item.entryType === 'CORRECTION' ||
    item.entryType === 'COMMENTARY' ||
    item.entryType === 'RULES' ||
    item.entryType === 'RESULT'
  ) {
    return null;
  }

  const evType = String(item.eventType || '').toUpperCase();
  const evCat = String(item.eventCategory || '').toUpperCase();
  const d = (item.details || {}) as Record<string, unknown>;
  const dType = String(d.type || '').toUpperCase();
  const dEvType = String(d.eventType || '').toUpperCase();

  const isSubstitution =
    evType === 'SUBSTITUTION' ||
    evType === 'SUBSTITUTE_PLAYER' ||
    evCat === 'SUBSTITUTION' ||
    dType === 'SUBSTITUTION' ||
    dType === 'SUBSTITUTE_PLAYER' ||
    dEvType === 'SUBSTITUTION';

  const isWicket =
    evType === 'WICKET' ||
    dType === 'WICKET' ||
    dEvType === 'WICKET' ||
    Boolean(d.isWicket);

  const batRunsFromRuns = dType === 'RUNS' ? Number(d.runs ?? NaN) : NaN;
  const batRunsExplicit =
    dType === 'NO_BALL' || dType === 'STRUCTURED_DELIVERY' || dType === 'WICKET'
      ? Number(d.batRuns ?? NaN)
      : NaN;
  const legalPoints =
    item.sportType === 'Cricket' && evType === 'LEGAL_DELIVERY'
      ? Number(item.pointsAwarded ?? NaN)
      : NaN;

  const isSix =
    evType === 'SIX' ||
    batRunsFromRuns === 6 ||
    batRunsExplicit === 6 ||
    legalPoints === 6;

  const isFour =
    !isSix &&
    (evType === 'FOUR' ||
      batRunsFromRuns === 4 ||
      batRunsExplicit === 4 ||
      legalPoints === 4);

  if (!isSubstitution && !isWicket && !isSix && !isFour) {
    return null;
  }

  const scoreSnapshot = formatScoreBadge(item);
  const formattedTime = formatTimelineEventTime(item.createdAt);

  if (isSubstitution) {
    const playerIn = String(d.playerIn || d.playerName || item.playerName || '').trim();
    const playerOut = String(d.playerOut || d.playerOutName || item.assistPlayerName || '').trim();
    const teamLabel =
      item.teamSide === 'A' ? teamAName : item.teamSide === 'B' ? teamBName : '';
    const reason = String(d.reason || '').trim();
    const title =
      playerOut || playerIn
        ? `${playerOut || 'Player'} → ${playerIn || 'Substitute'}`
        : item.action || 'Player Substitution';
    const subtitleParts = [teamLabel, reason].filter(Boolean);
    return {
      id: item._id,
      kind: 'SUBSTITUTION',
      badge: 'SUB',
      title,
      subtitle: subtitleParts.join(' · ') || item.action || 'Substitution',
      scoreSnapshot,
      timestamp: item.createdAt,
      formattedTime,
    };
  }

  if (isWicket) {
    const dismissed = String(d.dismissedPlayer || item.playerName || d.striker || '').trim();
    const bowler = String(d.bowler || item.assistPlayerName || '').trim();
    const wType = String(d.wicketType || '')
      .replace(/_/g, ' ')
      .trim();
    const title = dismissed ? `${dismissed} out` : item.action || 'Wicket';
    const subtitle = [wType, bowler ? `b ${bowler}` : ''].filter(Boolean).join(' · ') || item.action;
    return {
      id: item._id,
      kind: 'WICKET',
      badge: 'WICKET',
      title,
      subtitle,
      scoreSnapshot,
      timestamp: item.createdAt,
      formattedTime,
    };
  }

  const batter = String(d.striker || item.playerName || '').trim();
  const bowler = String(d.bowler || item.assistPlayerName || '').trim();
  const runsVal = isSix ? 6 : 4;
  return {
    id: item._id,
    kind: isSix ? 'BOUNDARY_SIX' : 'BOUNDARY_FOUR',
    badge: isSix ? 'SIX · 6' : 'FOUR · 4',
    title: batter ? `${batter} · ${runsVal} runs` : item.action || `Boundary (${runsVal})`,
    subtitle: bowler ? `off ${bowler}` : item.action || `Boundary (${runsVal})`,
    scoreSnapshot,
    timestamp: item.createdAt,
    formattedTime,
  };
}

export function extractMajorTimelineEvents(
  history: ScoreHistoryItem[],
  teamAName = 'Team A',
  teamBName = 'Team B',
  limit = 5
): MajorTimelineEvent[] {
  if (!Array.isArray(history) || history.length === 0) return [];
  const sorted = [...history].sort((a, b) => {
    const tA = new Date(a.createdAt || 0).getTime();
    const tB = new Date(b.createdAt || 0).getTime();
    return tB - tA;
  });
  const events: MajorTimelineEvent[] = [];
  for (const item of sorted) {
    const mapped = classifyMajorTimelineEvent(item, teamAName, teamBName);
    if (mapped) {
      events.push(mapped);
      if (events.length >= limit) break;
    }
  }
  return events;
}
