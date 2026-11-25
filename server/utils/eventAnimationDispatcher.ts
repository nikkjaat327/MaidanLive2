import { LiveStream } from '../models/LiveStream.ts';
import { emitBroadcastStudioEvent, emitStreamEvent } from '../socket/index.ts';
import {
  BROADCAST_EVENT_KEYS,
  BROADCAST_EVENT_META,
  BroadcastEventKey,
  BroadcastEventTriggerPayload,
  normalizeEventAnimationsConfig,
} from '../../src/utils/eventAnimations.ts';
import { normalizeOverlayConfig } from '../../src/utils/overlayConfig.ts';

const VALID_EVENT_KEY_SET = new Set<string>(BROADCAST_EVENT_KEYS);

export async function emitBroadcastEventAnimation(params: {
  streamId: string;
  eventKey: BroadcastEventKey;
  eventId?: string;
  stream?: {
    teamAName?: string;
    teamBName?: string;
    gameName?: string;
    overlayConfig?: unknown;
  } | null;
  teamSide?: 'A' | 'B' | '';
  teamName?: string;
  teamColor?: string;
  playerName?: string;
  subtitle?: string;
  pointsLabel?: string;
  previewStyleId?: string;
  manualOverride?: boolean;
}): Promise<BroadcastEventTriggerPayload | null> {
  const { streamId, eventKey } = params;
  if (!streamId || !VALID_EVENT_KEY_SET.has(eventKey)) {
    return null;
  }

  let streamDoc = params.stream || null;
  if (!streamDoc) {
    streamDoc = await LiveStream.findById(streamId)
      .select('teamAName teamBName gameName overlayConfig')
      .lean();
  }

  const overlayConfig = normalizeOverlayConfig(
    (streamDoc?.overlayConfig || null) as Record<string, unknown> | null
  );
  const eventAnimations = normalizeEventAnimationsConfig(overlayConfig.eventAnimations);
  const rule = eventAnimations[eventKey];

  if (!params.manualOverride && rule && rule.enabled === false) {
    return null;
  }

  const meta = BROADCAST_EVENT_META[eventKey];
  const side = params.teamSide === 'A' || params.teamSide === 'B' ? params.teamSide : '';
  const resolvedTeamName =
    params.teamName ||
    (side === 'A'
      ? streamDoc?.teamAName || 'Team A'
      : side === 'B'
        ? streamDoc?.teamBName || 'Team B'
        : '');
  const resolvedTeamColor =
    params.teamColor ||
    (side === 'A'
      ? overlayConfig.teamAColor
      : side === 'B'
        ? overlayConfig.teamBColor
        : '');

  const payload: BroadcastEventTriggerPayload = {
    streamId,
    eventId:
      params.eventId ||
      `evt_${eventKey}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    eventKey,
    sportType: streamDoc?.gameName || meta.sport,
    teamSide: side,
    teamName: resolvedTeamName,
    opponentName:
      side === 'A'
        ? streamDoc?.teamBName || ''
        : side === 'B'
          ? streamDoc?.teamAName || ''
          : '',
    teamColor: resolvedTeamColor,
    playerName: params.playerName || '',
    subtitle: params.subtitle || meta.defaultSubtitle,
    pointsLabel: params.pointsLabel || meta.badge,
    triggeredAtIso: new Date().toISOString(),
    manualOverride: Boolean(params.manualOverride),
    previewStyleId: params.previewStyleId,
  };

  emitStreamEvent(streamId, 'broadcast:event_animation', payload);
  emitBroadcastStudioEvent(streamId, 'broadcast:event_animation', payload);
  return payload;
}
