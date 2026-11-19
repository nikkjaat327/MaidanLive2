import { LiveScoreData, LiveStreamData } from '../types/index.ts';

export type StandardMatchStatus =
  | 'UPCOMING'
  | 'LIVE'
  | 'BREAK'
  | 'INNINGS BREAK'
  | 'DELAYED'
  | 'INTERRUPTED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface MatchStatusMeta {
  status: StandardMatchStatus;
  label: string;
  shortLabel: string;
  badgeClass: string;
  darkBadgeClass: string;
  dotClass: string;
}

const STATUS_META_MAP: Record<StandardMatchStatus, MatchStatusMeta> = {
  UPCOMING: {
    status: 'UPCOMING',
    label: 'Upcoming',
    shortLabel: 'UPCOMING',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    darkBadgeClass: 'bg-sky-500/20 text-sky-200 border-sky-400/30',
    dotClass: 'bg-sky-500',
  },
  LIVE: {
    status: 'LIVE',
    label: 'Live',
    shortLabel: 'LIVE',
    badgeClass: 'bg-red-600 text-white border-red-600',
    darkBadgeClass: 'bg-red-600 text-white border-red-500',
    dotClass: 'bg-white',
  },
  BREAK: {
    status: 'BREAK',
    label: 'Break',
    shortLabel: 'BREAK',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-200',
    darkBadgeClass: 'bg-amber-500/20 text-amber-200 border-amber-400/30',
    dotClass: 'bg-amber-500',
  },
  'INNINGS BREAK': {
    status: 'INNINGS BREAK',
    label: 'Innings Break',
    shortLabel: 'INN BREAK',
    badgeClass: 'bg-orange-50 text-orange-900 border-orange-200',
    darkBadgeClass: 'bg-orange-500/20 text-orange-200 border-orange-400/30',
    dotClass: 'bg-orange-500',
  },
  DELAYED: {
    status: 'DELAYED',
    label: 'Delayed',
    shortLabel: 'DELAYED',
    badgeClass: 'bg-yellow-50 text-yellow-900 border-yellow-300',
    darkBadgeClass: 'bg-yellow-500/20 text-yellow-200 border-yellow-400/30',
    dotClass: 'bg-yellow-500',
  },
  INTERRUPTED: {
    status: 'INTERRUPTED',
    label: 'Interrupted',
    shortLabel: 'INTERRUPTED',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    darkBadgeClass: 'bg-rose-500/20 text-rose-200 border-rose-400/30',
    dotClass: 'bg-rose-500',
  },
  COMPLETED: {
    status: 'COMPLETED',
    label: 'Completed',
    shortLabel: 'FINAL',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    darkBadgeClass: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30',
    dotClass: 'bg-emerald-500',
  },
  CANCELLED: {
    status: 'CANCELLED',
    label: 'Cancelled',
    shortLabel: 'CANCELLED',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    darkBadgeClass: 'bg-slate-700/60 text-slate-300 border-slate-600',
    dotClass: 'bg-slate-400',
  },
};

export const STANDARD_MATCH_STATUSES: StandardMatchStatus[] = [
  'UPCOMING',
  'LIVE',
  'BREAK',
  'INNINGS BREAK',
  'DELAYED',
  'INTERRUPTED',
  'COMPLETED',
  'CANCELLED',
];

export function resolveMatchStatus(
  stream?: Pick<LiveStreamData, 'status'> | null,
  score?: Pick<LiveScoreData, 'matchStatus' | 'resultStatus'> | null,
  rawOverride?: string | null
): StandardMatchStatus {
  const rawStatus = (rawOverride || score?.matchStatus || '').trim().toUpperCase();

  if (score?.resultStatus === 'ABANDONED' || rawStatus.includes('CANCEL') || rawStatus.includes('ABANDON')) {
    return 'CANCELLED';
  }
  if (score?.resultStatus && score.resultStatus !== 'NOT_DECLARED') {
    return 'COMPLETED';
  }
  if (rawStatus.includes('INNINGS BREAK') || rawStatus === 'INNINGS_BREAK') {
    return 'INNINGS BREAK';
  }
  if (
    rawStatus.includes('HALF TIME') ||
    rawStatus.includes('HALFTIME') ||
    rawStatus.includes('BREAK') ||
    rawStatus.includes('TIMEOUT') ||
    rawStatus.includes('DRINKS') ||
    rawStatus.includes('TEA') ||
    rawStatus.includes('LUNCH')
  ) {
    return 'BREAK';
  }
  if (rawStatus.includes('DELAY')) {
    return 'DELAYED';
  }
  if (rawStatus.includes('INTERRUPT') || rawStatus.includes('RAIN') || rawStatus.includes('SUSPEND')) {
    return 'INTERRUPTED';
  }
  if (rawStatus.includes('COMPLET') || rawStatus === 'FULL TIME' || rawStatus === 'FINAL' || rawStatus === 'ENDED' || rawStatus === 'DRAWN' || rawStatus === 'TIED' || rawStatus === 'NO RESULT') {
    return 'COMPLETED';
  }
  if (rawStatus === 'UPCOMING' || rawStatus === 'SCHEDULED') {
    return 'UPCOMING';
  }
  if (rawStatus === 'LIVE') {
    return 'LIVE';
  }

  if (stream?.status === 'ENDED') return 'COMPLETED';
  if (stream?.status === 'UPCOMING') return 'UPCOMING';
  if (stream?.status === 'LIVE') return 'LIVE';
  return 'UPCOMING';
}

export function getMatchStatusMeta(status: StandardMatchStatus): MatchStatusMeta {
  return STATUS_META_MAP[status] || STATUS_META_MAP.UPCOMING;
}
