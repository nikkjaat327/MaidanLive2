import type { LiveStreamData, ScoreHistoryItem } from '../types/index.ts';

export type MediaOrientation = 'portrait' | 'landscape';

export interface MediaLayoutState {
  stageOrientation: MediaOrientation;
  viewportOrientation: MediaOrientation;
  scoreboardMode: MediaOrientation;
  isCompactStage: boolean;
  isNarrowViewport: boolean;
}

export interface MediaDimensionsInput {
  containerWidth: number;
  containerHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  isFullscreen: boolean;
}

/**
 * Determines whether the stage overlay and page scoreboard should render in
 * Portrait or Landscape layout using real container dimensions + viewport awareness.
 */
export function resolveMediaLayoutMode(input: MediaDimensionsInput): MediaLayoutState {
  const vw = Math.max(0, input.viewportWidth || 0);
  const vh = Math.max(0, input.viewportHeight || 0);
  const cw = Math.max(0, input.containerWidth || 0);
  const ch = Math.max(0, input.containerHeight || 0);

  const viewportOrientation: MediaOrientation =
    vw > 0 && vh > 0 && vh > vw ? 'portrait' : 'landscape';

  const isNarrowViewport = vw > 0 && vw < 768;

  // Stage orientation uses actual player container geometry when available
  const containerAspect = cw > 0 && ch > 0 ? cw / ch : 16 / 9;
  const stageOrientation: MediaOrientation =
    containerAspect < 1.05 ? 'portrait' : 'landscape';

  // In non-fullscreen mobile portrait viewports, the below-video scoreboard card
  // should use the dedicated readable Portrait Scoreboard layout; in fullscreen
  // landscape (or desktop) it switches cleanly to Landscape broadcast bar.
  const scoreboardMode: MediaOrientation = input.isFullscreen
    ? stageOrientation
    : viewportOrientation === 'portrait' && isNarrowViewport
      ? 'portrait'
      : stageOrientation;

  const isCompactStage =
    !input.isFullscreen && ((cw > 0 && cw < 520) || (vw > 0 && vw < 640));

  return {
    stageOrientation,
    viewportOrientation,
    scoreboardMode,
    isCompactStage,
    isNarrowViewport,
  };
}

export interface RecentMatchEventBadge {
  key: string;
  label: string;
  detail: string;
  accent: 'orange' | 'emerald' | 'red' | 'amber' | 'sky';
  timestamp?: string;
}

const VALID_HIGHLIGHT_PATTERN =
  /\b(six|6|four|4|wicket|out|bowled|caught|lbw|stumped|run out|goal|penalty|red card|yellow card|super raid|super tackle|all out|all-out|do or die|set won|set win|match won|tie breaker|super over)\b/i;

/**
 * Extracts a genuine notable recent event from real score history entries.
 * Returns null if history is empty or recent action is a routine single/pause.
 */
export function extractRecentImportantEvent(
  history: ScoreHistoryItem[] | null | undefined,
  sport?: string
): RecentMatchEventBadge | null {
  if (!Array.isArray(history) || history.length === 0) return null;
  const latest = history[0];
  if (!latest || latest.reverted) return null;

  // Ignore old events older than 20 seconds when createdAt exists
  if (latest.createdAt) {
    const ageMs = Date.now() - new Date(latest.createdAt).getTime();
    if (Number.isFinite(ageMs) && ageMs > 20_000) {
      return null;
    }
  }

  if (latest.entryType === 'UNDO' || latest.entryType === 'RULES') {
    return null;
  }

  const eventRaw = String(latest.eventType || '').trim();
  const descRaw = String(latest.action || '').trim();
  const combined = `${eventRaw} ${descRaw}`.trim();
  const points = Number(latest.pointsAwarded || 0);

  if (!combined) return null;
  if (/undo|revert|pause|resume|clock|edit|sync/i.test(eventRaw)) {
    return null;
  }

  const key = `${latest._id || latest.createdAt || combined}`;
  const upperEvent = eventRaw.toUpperCase();

  // Cricket highlights
  if (upperEvent.includes('SIX') || points === 6 || /\bsix\b/i.test(combined)) {
    return {
      key,
      label: 'SIX',
      detail: descRaw || 'Maximum hit!',
      accent: 'emerald',
      timestamp: latest.createdAt,
    };
  }
  if (upperEvent.includes('FOUR') || points === 4 || /\bfour\b/i.test(combined)) {
    return {
      key,
      label: 'FOUR',
      detail: descRaw || 'Boundary scored',
      accent: 'sky',
      timestamp: latest.createdAt,
    };
  }
  if (upperEvent.includes('WICKET') || /\bwicket\b/i.test(upperEvent)) {
    return {
      key,
      label: 'WICKET',
      detail: descRaw || 'Dismissal!',
      accent: 'red',
      timestamp: latest.createdAt,
    };
  }

  // Kabaddi highlights
  if (upperEvent.includes('SUPER_RAID') || /\bsuper\s*raid\b/i.test(combined)) {
    return {
      key,
      label: 'SUPER RAID',
      detail: descRaw || (points > 0 ? `+${points} pts` : 'Big raid!'),
      accent: 'orange',
      timestamp: latest.createdAt,
    };
  }
  if (upperEvent.includes('SUPER_TACKLE') || /\bsuper\s*tackle\b/i.test(combined)) {
    return {
      key,
      label: 'SUPER TACKLE',
      detail: descRaw || '+2 tackle pts',
      accent: 'emerald',
      timestamp: latest.createdAt,
    };
  }
  if (upperEvent.includes('ALL_OUT') || /\ball[\s-]*out\b/i.test(combined)) {
    return {
      key,
      label: 'ALL OUT',
      detail: descRaw || 'Team all out!',
      accent: 'amber',
      timestamp: latest.createdAt,
    };
  }
  if (upperEvent.includes('DO_OR_DIE') || /\bdo[\s-]*or[\s-]*die\b/i.test(combined)) {
    return {
      key,
      label: 'DO OR DIE',
      detail: descRaw || 'Must-score raid',
      accent: 'red',
      timestamp: latest.createdAt,
    };
  }

  // Football highlights
  if (upperEvent.includes('GOAL') || /\bgoal\b/i.test(combined)) {
    return {
      key,
      label: 'GOAL',
      detail: descRaw || 'Goal scored!',
      accent: 'emerald',
      timestamp: latest.createdAt,
    };
  }
  if (upperEvent.includes('RED_CARD') || /\bred card\b/i.test(combined)) {
    return {
      key,
      label: 'RED CARD',
      detail: descRaw || 'Sending off',
      accent: 'red',
      timestamp: latest.createdAt,
    };
  }

  // Volleyball set win / match win / other significant events
  if (upperEvent.includes('SET_WIN') || /\bset\s*(won|win|complete)\b/i.test(combined)) {
    return {
      key,
      label: 'SET WON',
      detail: descRaw || 'Set completed',
      accent: 'amber',
      timestamp: latest.createdAt,
    };
  }

  if (VALID_HIGHLIGHT_PATTERN.test(combined) || (sport === 'Kabaddi' && points >= 3)) {
    return {
      key,
      label: eventRaw ? eventRaw.replace(/_/g, ' ').slice(0, 18) : 'HIGHLIGHT',
      detail: descRaw || (points > 0 ? `+${points}` : 'Match update'),
      accent: 'orange',
      timestamp: latest.createdAt,
    };
  }

  return null;
}

/**
 * Checks whether the current pathname belongs strictly to the Admin Panel
 * (excluding public customer portal, broadcaster desk, OBS viewer, and camera companion).
 */
export function isAdminPanelPath(pathname: string): boolean {
  if (!pathname) return false;
  if (pathname.startsWith('/admin/login')) return false;
  if (pathname.startsWith('/broadcast/overlay/view')) return false;
  return pathname.startsWith('/admin') || pathname.startsWith('/broadcast/overlay');
}

export interface AdminEmbedPreviewTarget {
  streamId: string;
  title: string;
  provider: 'youtube' | 'mediamtx';
  youtubeVideoId: string;
  mediamtxPlaybackUrl: string;
  mediamtxWebrtcUrl: string;
  status: LiveStreamData['status'];
}

const VALID_YT_ID = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Resolves an active embedded video stream started in MaidanLive for the Admin Header
 * Preview button. Returns null if no embedded stream is currently started/configured.
 */
export function resolveAdminEmbedPreviewTarget(
  streams: LiveStreamData[],
  preferredStreamId?: string
): AdminEmbedPreviewTarget | null {
  if (!Array.isArray(streams) || streams.length === 0) return null;

  const isStartedEmbed = (s: LiveStreamData): boolean => {
    if (s.status !== 'LIVE') return false;
    const provider = s.activeStreamingProvider || s.streamingProvider || 'youtube';
    if (provider === 'mediamtx') {
      return Boolean(s.mediamtxPlaybackUrl?.trim() || s.mediamtxWebrtcUrl?.trim());
    }
    return Boolean(s.youtubeVideoId && VALID_YT_ID.test(s.youtubeVideoId.trim()));
  };

  const liveEmbeds = streams.filter(isStartedEmbed);
  if (liveEmbeds.length === 0) return null;

  const chosen =
    (preferredStreamId &&
      liveEmbeds.find((s) => String(s.id || s._id || '') === preferredStreamId)) ||
    liveEmbeds[0];

  if (!chosen) return null;

  const provider =
    chosen.activeStreamingProvider || chosen.streamingProvider || 'youtube';

  return {
    streamId: String(chosen.id || chosen._id || ''),
    title:
      chosen.matchTitle ||
      (chosen.teamAName && chosen.teamBName
        ? `${chosen.teamAName} vs ${chosen.teamBName}`
        : chosen.teamAName || chosen.teamBName || 'MaidanLive Stream'),
    provider,
    youtubeVideoId: (chosen.youtubeVideoId || '').trim(),
    mediamtxPlaybackUrl: (chosen.mediamtxPlaybackUrl || '').trim(),
    mediamtxWebrtcUrl: (chosen.mediamtxWebrtcUrl || '').trim(),
    status: chosen.status,
  };
}
