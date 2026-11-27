import type { ScoreHistoryItem } from '../types/index.ts';

export type CommentaryCategory = 'UPDATE' | 'HIGHLIGHT' | 'COMMENTARY';
export type CommentaryFilter = 'ALL' | CommentaryCategory;

export interface CommentaryFeedEntry {
  id: string;
  category: CommentaryCategory;
  categoryLabel: string;
  text: string;
  authorName: string;
  createdAt: string;
  formattedTime: string;
  scoreSnapshot: string;
}

export function normalizeCommentaryCategory(
  value?: string | null
): CommentaryCategory {
  const upper = String(value || '')
    .trim()
    .toUpperCase();
  if (upper === 'HIGHLIGHT' || upper === 'HIGHLIGHTS') return 'HIGHLIGHT';
  if (upper === 'UPDATE' || upper === 'UPDATES' || upper === 'MATCH_UPDATE') {
    return 'UPDATE';
  }
  return 'COMMENTARY';
}

export function formatCommentaryCategoryLabel(
  category: CommentaryCategory
): string {
  switch (category) {
    case 'HIGHLIGHT':
      return 'Highlight';
    case 'UPDATE':
      return 'Match Update';
    default:
      return 'Commentary';
  }
}

export function formatCommentaryTime(isoOrDate?: string | Date): string {
  if (!isoOrDate) return '--:--';
  const date = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatCommentaryScoreSnapshot(
  scoreObj?: Record<string, any> | null
): string {
  if (!scoreObj || typeof scoreObj !== 'object') return '';
  const sport = String(scoreObj.sportType || '').trim();
  const details = scoreObj.sportSpecificDetails;

  if (sport === 'Cricket' && details && typeof details === 'object') {
    const battingTeam = details.battingTeam === 'B' ? 'B' : 'A';
    const hasTeamCounts =
      typeof details.teamARuns === 'number' || typeof details.teamBRuns === 'number';
    if (hasTeamCounts) {
      const runs =
        battingTeam === 'B'
          ? Number(details.teamBRuns ?? 0)
          : Number(details.teamARuns ?? 0);
      const wickets =
        battingTeam === 'B'
          ? Number(details.teamBWickets ?? 0)
          : Number(details.teamAWickets ?? 0);
      const balls =
        battingTeam === 'B'
          ? Number(details.teamBBalls ?? 0)
          : Number(details.teamABalls ?? 0);
      const oversText =
        balls > 0 ? ` (${Math.floor(balls / 6)}.${balls % 6} ov)` : '';
      return `${runs}/${wickets}${oversText}`;
    }

    const inningsIdx = details.currentInnings === 2 || details.innings === 2 ? 2 : 1;
    const inningsList = Array.isArray(details.innings) ? details.innings : [];
    const activeInnings =
      inningsList.find((inn: any) => inn?.inningsNumber === inningsIdx) ||
      inningsList[inningsList.length - 1];
    if (activeInnings) {
      const runs = Number(activeInnings.runs) || 0;
      const wickets = Number(activeInnings.wickets) || 0;
      const overs = activeInnings.overs ? ` (${activeInnings.overs} ov)` : '';
      return `${runs}/${wickets}${overs}`;
    }
  }

  const a = Number(scoreObj.teamAScore ?? 0);
  const b = Number(scoreObj.teamBScore ?? 0);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
  return `${a} - ${b}`;
}

export function extractCommentaryFeedEntries(
  history: ScoreHistoryItem[] = [],
  filter: CommentaryFilter = 'ALL'
): CommentaryFeedEntry[] {
  if (!Array.isArray(history) || history.length === 0) return [];

  const sorted = [...history]
    .filter((item) => item && item.entryType === 'COMMENTARY' && !item.reverted)
    .sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });

  const entries: CommentaryFeedEntry[] = [];

  for (const item of sorted) {
    const rawCat =
      (typeof item.details?.commentaryCategory === 'string' &&
        item.details.commentaryCategory) ||
      item.eventType ||
      'COMMENTARY';
    const category = normalizeCommentaryCategory(rawCat);

    if (filter !== 'ALL' && category !== filter) continue;

    const text = String(item.action || '').trim();
    if (!text) continue;

    const authorFromObj =
      item.updatedBy && typeof item.updatedBy === 'object'
        ? item.updatedBy.name
        : undefined;
    const authorFromDetails =
      typeof item.details?.authorName === 'string'
        ? item.details.authorName
        : undefined;
    const authorName = (authorFromObj || authorFromDetails || 'Broadcaster').trim();

    const snapshotFromDetails =
      typeof item.details?.scoreSnapshotText === 'string'
        ? item.details.scoreSnapshotText
        : '';
    const scoreSnapshot =
      snapshotFromDetails || formatCommentaryScoreSnapshot(item.updatedScore);

    entries.push({
      id: item._id,
      category,
      categoryLabel: formatCommentaryCategoryLabel(category),
      text,
      authorName,
      createdAt: item.createdAt,
      formattedTime: formatCommentaryTime(item.createdAt),
      scoreSnapshot,
    });
  }

  return entries;
}
