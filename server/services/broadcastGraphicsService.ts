import crypto from 'crypto';
import mongoose from 'mongoose';
import { BroadcastAdDesign } from '../models/BroadcastAdDesign.ts';
import type { IBroadcastAdDesign } from '../models/BroadcastAdDesign.ts';
import { BroadcastGraphicsState } from '../models/BroadcastGraphicsState.ts';
import { LiveStream } from '../models/LiveStream.ts';
import { ObsControllerProfile } from '../models/ObsControllerProfile.ts';
import type { IUser } from '../models/User.ts';
import type {
  ActiveBroadcastGraphicSlot,
  BroadcastAdDesignData,
  BroadcastAdQueueItem,
  BroadcastGraphicEventRule,
  BroadcastGraphicEventTrigger,
  BroadcastGraphicsStateData,
  GraphicsAnimationStyle,
  GraphicsDesignGroupMeta,
  GraphicsDesignType,
  GraphicsElement,
  GraphicsLayoutPresetId,
  GraphicsOverlapPolicy,
} from '../../src/types/broadcastGraphics.ts';
import { emitBroadcastStudioEvent, emitRoomOnlyEvent } from '../socket/index.ts';
import { writeBroadcastAudit } from './obsControllerService.ts';
import { recordActivity } from '../utils/audit.ts';
import { sanitizeText } from '../utils/sanitize.ts';

const VALID_ELEMENT_TYPES = new Set(['image', 'text', 'logo', 'qr', 'shape', 'icon']);
const VALID_ANIMATION_STYLES = new Set<GraphicsAnimationStyle>([
  'none',
  'fade-in',
  'fade-out',
  'slide-left',
  'slide-right',
  'slide-top',
  'slide-bottom',
  'slide-out-left',
  'slide-out-right',
  'slide-out-top',
  'slide-out-bottom',
  'zoom-in',
  'zoom-out',
  'pop-in',
  'pop-out',
  'bounce',
  'bounce-in',
  'rotate-in',
  'rotate-out',
  'flip-in',
  'blur-in',
  'blur-out',
  'pulse',
  'float',
  'glow',
  'blink',
  'shake',
  'rotate-loop',
  'marquee',
]);

const VALID_BORDER_STYLES = new Set(['solid', 'dashed', 'dotted']);
const VALID_IMAGE_MASKS = new Set(['none', 'circle', 'rounded', 'pill', 'diamond', 'hexagon', 'diagonal']);
const VALID_ANCHOR_POINTS = new Set(['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right']);

const VALID_DESIGN_TYPES = new Set<GraphicsDesignType>([
  'banner',
  'lower_third',
  'logo',
  'qr',
  'side_ad',
  'full_banner',
  'event_promo',
  'custom',
]);

const VALID_EVENT_TRIGGERS = new Set<BroadcastGraphicEventTrigger>([
  'MATCH_STARTING',
  'FIRST_HALF',
  'SECOND_HALF',
  'TIMEOUT',
  'HALF_TIME',
  'MATCH_BREAK',
  'FOUR',
  'SIX',
  'WICKET',
  'ALL_OUT',
  'SUPER_TACKLE',
  'MATCH_COMPLETED',
]);

// Server-authoritative slot expiration timers and queue advance timers
const slotExpirationTimers = new Map<string, NodeJS.Timeout>();
const queueDelayTimers = new Map<string, NodeJS.Timeout>();
const recentShowLiveStamp = new Map<string, number>();
const seenEventDedupeKeys = new Map<string, number>();

function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function sanitizeSafeUrl(raw: unknown, maxLen = 1000): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim().slice(0, maxLen);
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:text/')
  ) {
    return '';
  }
  if (
    trimmed.startsWith('/') ||
    lower.startsWith('https://') ||
    lower.startsWith('http://')
  ) {
    return trimmed;
  }
  return '';
}

function sanitizeColor(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim().slice(0, 48);
  if (!trimmed) return fallback;
  if (/^(transparent|#[0-9a-fA-F]{3,8}|rgba?\([0-9.,\s%]+\))$/.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

function sanitizeAnimationStyle(val: unknown, fallback: GraphicsAnimationStyle): GraphicsAnimationStyle {
  if (typeof val === 'string' && VALID_ANIMATION_STYLES.has(val as GraphicsAnimationStyle)) {
    return val as GraphicsAnimationStyle;
  }
  return fallback;
}

function sanitizeEasing(raw: unknown): string {
  if (typeof raw !== 'string') return 'cubic-bezier(0.16, 1, 0.3, 1)';
  const t = raw.trim().slice(0, 64);
  if (
    ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'].includes(t) ||
    /^cubic-bezier\(\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*\)$/.test(t)
  ) {
    return t;
  }
  return 'cubic-bezier(0.16, 1, 0.3, 1)';
}

function sanitizeGradientConfig(gradRaw: any, defaultFrom: string, defaultTo: string, defaultAngle: number) {
  if (!gradRaw || typeof gradRaw !== 'object') return undefined;
  const stops = Array.isArray(gradRaw.stops)
    ? gradRaw.stops.slice(0, 6).map((s: any, idx: number) => ({
        color: sanitizeColor(s?.color, idx === 0 ? defaultFrom : defaultTo),
        position: Math.round(clampNum(s?.position, 0, 100, idx === 0 ? 0 : 100)),
      }))
    : undefined;
  return {
    enabled: Boolean(gradRaw.enabled),
    from: sanitizeColor(gradRaw.from, defaultFrom),
    to: sanitizeColor(gradRaw.to, defaultTo),
    angle: Math.round(clampNum(gradRaw.angle, 0, 360, defaultAngle)),
    ...(stops && stops.length >= 2 ? { stops } : {}),
  };
}

export function sanitizeDesignGroups(rawGroups: unknown): GraphicsDesignGroupMeta[] {
  if (!Array.isArray(rawGroups)) return [];
  return rawGroups.slice(0, 30).map((g: any, idx: number): GraphicsDesignGroupMeta => ({
    groupId: sanitizeText(g?.groupId, 64) || `grp_${idx}`,
    name: sanitizeText(g?.name, 80) || `Group ${idx + 1}`,
    opacity: clampNum(g?.opacity, 0, 1, 1),
    locked: Boolean(g?.locked),
    visible: g?.visible !== false,
    ...(g?.animation && typeof g.animation === 'object'
      ? {
          animation: {
            style: sanitizeAnimationStyle(g.animation.style, 'none'),
            exitStyle: sanitizeAnimationStyle(g.animation.exitStyle, 'none'),
            continuousStyle: sanitizeAnimationStyle(g.animation.continuousStyle, 'none'),
            durationMs: Math.round(clampNum(g.animation.durationMs, 100, 15000, 420)),
            delayMs: Math.round(clampNum(g.animation.delayMs, 0, 30000, 0)),
          },
        }
      : {}),
  }));
}

export function sanitizeGraphicsElements(rawElements: unknown): GraphicsElement[] {
  if (!Array.isArray(rawElements)) return [];
  return rawElements.slice(0, 60).map((raw: any, index: number): GraphicsElement => {
    const type = VALID_ELEMENT_TYPES.has(raw?.type) ? raw.type : 'shape';
    const animRaw = raw?.animation && typeof raw.animation === 'object' ? raw.animation : {};
    const gradient = sanitizeGradientConfig(raw?.gradient, '#0f172a', '#1e293b', 135);
    const gradientText = sanitizeGradientConfig(raw?.gradientText, '#ffffff', '#fb923c', 90);
    const cropRaw = raw?.crop && typeof raw.crop === 'object' ? raw.crop : null;

    return {
      id: sanitizeText(raw?.id, 64) || `el_${index}_${crypto.randomBytes(3).toString('hex')}`,
      type,
      layerName: sanitizeText(raw?.layerName, 80) || `${type.toUpperCase()} ${index + 1}`,
      ...(typeof raw?.groupId === 'string' && raw.groupId.trim()
        ? { groupId: sanitizeText(raw.groupId, 64) }
        : {}),
      x: Math.round(clampNum(raw?.x, -2000, 4000, 100)),
      y: Math.round(clampNum(raw?.y, -2000, 4000, 100)),
      width: Math.round(clampNum(raw?.width, 8, 3840, 320)),
      height: Math.round(clampNum(raw?.height, 2, 3840, 120)),
      rotation: Math.round(clampNum(raw?.rotation, -360, 360, 0)),
      scaleX: clampNum(raw?.scaleX, 0.1, 5, 1),
      scaleY: clampNum(raw?.scaleY, 0.1, 5, 1),
      anchorPoint: VALID_ANCHOR_POINTS.has(raw?.anchorPoint) ? raw.anchorPoint : 'center',
      lockAspectRatio: Boolean(raw?.lockAspectRatio),
      opacity: clampNum(raw?.opacity, 0, 1, 1),
      zIndex: Math.round(clampNum(raw?.zIndex, 0, 1000, index + 1)),
      visible: raw?.visible !== false,
      locked: Boolean(raw?.locked),
      backgroundColor: sanitizeColor(raw?.backgroundColor, 'transparent'),
      backgroundOpacity: clampNum(raw?.backgroundOpacity, 0, 1, 1),
      ...(gradient ? { gradient } : {}),
      borderWidth: Math.round(clampNum(raw?.borderWidth, 0, 32, 0)),
      borderColor: sanitizeColor(raw?.borderColor, '#ffffff'),
      borderStyle: VALID_BORDER_STYLES.has(raw?.borderStyle) ? raw.borderStyle : 'solid',
      borderRadius: Math.round(clampNum(raw?.borderRadius, 0, 9999, 0)),
      shadowEnabled: Boolean(raw?.shadowEnabled),
      shadowColor: sanitizeColor(raw?.shadowColor, 'rgba(0,0,0,0.45)'),
      shadowBlur: Math.round(clampNum(raw?.shadowBlur, 0, 120, 16)),
      shadowOffsetX: Math.round(clampNum(raw?.shadowOffsetX, -60, 60, 0)),
      shadowOffsetY: Math.round(clampNum(raw?.shadowOffsetY, -60, 60, 6)),
      paddingX: Math.round(clampNum(raw?.paddingX, 0, 200, 0)),
      paddingY: Math.round(clampNum(raw?.paddingY, 0, 200, 0)),
      marginTop: Math.round(clampNum(raw?.marginTop, 0, 200, 0)),
      marginRight: Math.round(clampNum(raw?.marginRight, 0, 200, 0)),
      marginBottom: Math.round(clampNum(raw?.marginBottom, 0, 200, 0)),
      marginLeft: Math.round(clampNum(raw?.marginLeft, 0, 200, 0)),

      // Image / Logo
      ...(typeof raw?.assetId === 'string' && raw.assetId.trim()
        ? { assetId: sanitizeText(raw.assetId, 80) }
        : {}),
      ...(raw?.src !== undefined ? { src: sanitizeSafeUrl(raw.src, 1200) } : {}),
      objectFit:
        raw?.objectFit === 'cover' || raw?.objectFit === 'fill' ? raw.objectFit : 'contain',
      ...(cropRaw
        ? {
            crop: {
              top: clampNum(cropRaw.top, 0, 45, 0),
              right: clampNum(cropRaw.right, 0, 45, 0),
              bottom: clampNum(cropRaw.bottom, 0, 45, 0),
              left: clampNum(cropRaw.left, 0, 45, 0),
            },
          }
        : {}),
      ...(typeof raw?.logoPreset === 'string'
        ? { logoPreset: sanitizeText(raw.logoPreset, 30) as any }
        : {}),
      flipX: Boolean(raw?.flipX),
      flipY: Boolean(raw?.flipY),
      imageMask: VALID_IMAGE_MASKS.has(raw?.imageMask) ? raw.imageMask : 'none',
      imageAlign:
        raw?.imageAlign === 'top' ||
        raw?.imageAlign === 'bottom' ||
        raw?.imageAlign === 'left' ||
        raw?.imageAlign === 'right'
          ? raw.imageAlign
          : 'center',

      // Text
      ...(raw?.text !== undefined ? { text: String(raw.text).slice(0, 600) } : {}),
      ...(typeof raw?.fontFamily === 'string'
        ? { fontFamily: sanitizeText(raw.fontFamily, 120) }
        : {}),
      fontSize: Math.round(clampNum(raw?.fontSize, 10, 240, 28)),
      fontWeight: sanitizeText(raw?.fontWeight, 12) || '700',
      fontColor: sanitizeColor(raw?.fontColor, '#ffffff'),
      ...(gradientText ? { gradientText } : {}),
      textAlign:
        raw?.textAlign === 'left' || raw?.textAlign === 'right' ? raw.textAlign : 'center',
      verticalAlign:
        raw?.verticalAlign === 'top' || raw?.verticalAlign === 'bottom' ? raw.verticalAlign : 'middle',
      letterSpacing: clampNum(raw?.letterSpacing, -4, 40, 0),
      lineHeight: clampNum(raw?.lineHeight, 0.8, 3, 1.2),
      wordWrap: raw?.wordWrap !== false,
      textOutlineWidth: clampNum(raw?.textOutlineWidth, 0, 12, 0),
      textOutlineColor: sanitizeColor(raw?.textOutlineColor, '#000000'),
      ...(typeof raw?.textShadow === 'string'
        ? { textShadow: sanitizeText(raw.textShadow, 80) }
        : {}),
      textShadowColor: sanitizeColor(raw?.textShadowColor, 'rgba(0,0,0,0.65)'),
      textShadowBlur: Math.round(clampNum(raw?.textShadowBlur, 0, 40, 0)),
      textShadowX: Math.round(clampNum(raw?.textShadowX, -30, 30, 0)),
      textShadowY: Math.round(clampNum(raw?.textShadowY, -30, 30, 2)),
      italic: Boolean(raw?.italic),
      underline: Boolean(raw?.underline),
      strikethrough: Boolean(raw?.strikethrough),
      textTransform:
        raw?.textTransform === 'uppercase' ||
        raw?.textTransform === 'lowercase' ||
        raw?.textTransform === 'capitalize'
          ? raw.textTransform
          : 'none',
      textDirection: raw?.textDirection === 'rtl' ? 'rtl' : 'ltr',

      // QR
      ...(typeof raw?.qrLinkType === 'string'
        ? { qrLinkType: sanitizeText(raw.qrLinkType, 30) as any }
        : {}),
      ...(raw?.qrUrl !== undefined ? { qrUrl: sanitizeSafeUrl(raw.qrUrl, 600) } : {}),
      ...(typeof raw?.qrTargetId === 'string'
        ? { qrTargetId: sanitizeText(raw.qrTargetId, 80) }
        : {}),
      qrFgColor: sanitizeColor(raw?.qrFgColor, '#0f172a'),
      qrBgColor: sanitizeColor(raw?.qrBgColor, '#ffffff'),
      ...(raw?.qrCenterLogoUrl !== undefined
        ? { qrCenterLogoUrl: sanitizeSafeUrl(raw.qrCenterLogoUrl, 1000) }
        : {}),
      qrCenterLogoSizePct: clampNum(raw?.qrCenterLogoSizePct, 10, 35, 22),
      ...(raw?.qrCaption !== undefined ? { qrCaption: sanitizeText(raw.qrCaption, 80) } : {}),
      qrCaptionColor: sanitizeColor(raw?.qrCaptionColor, '#ffffff'),

      // Shape
      ...(typeof raw?.shapeKind === 'string'
        ? { shapeKind: sanitizeText(raw.shapeKind, 30) as any }
        : {}),
      strokeWidth: Math.round(clampNum(raw?.strokeWidth, 0, 32, 0)),

      // Vector Icon
      ...(typeof raw?.iconName === 'string'
        ? { iconName: sanitizeText(raw.iconName, 40) }
        : {}),
      iconColor: sanitizeColor(raw?.iconColor, '#ffffff'),
      iconStrokeWidth: clampNum(raw?.iconStrokeWidth, 1, 4, 2),

      animation: {
        style: sanitizeAnimationStyle(animRaw.style, 'fade-in'),
        exitStyle: sanitizeAnimationStyle(animRaw.exitStyle, 'fade-out'),
        continuousStyle: sanitizeAnimationStyle(animRaw.continuousStyle, 'none'),
        durationMs: Math.round(clampNum(animRaw.durationMs, 100, 15000, 420)),
        exitDurationMs: Math.round(clampNum(animRaw.exitDurationMs, 100, 15000, 340)),
        delayMs: Math.round(clampNum(animRaw.delayMs, 0, 30000, 0)),
        speed:
          animRaw.speed === 'slow' || animRaw.speed === 'fast' ? animRaw.speed : 'normal',
        direction:
          animRaw.direction === 'reverse' || animRaw.direction === 'alternate'
            ? animRaw.direction
            : 'normal',
        easing: sanitizeEasing(animRaw.easing),
        repeatCount: Math.round(clampNum(animRaw.repeatCount, 0, 20, 0)),
        intensity:
          animRaw.intensity === 'subtle' || animRaw.intensity === 'strong'
            ? animRaw.intensity
            : 'medium',
        loop: Boolean(animRaw.loop),
        startTrigger: animRaw.startTrigger === 'continuous' ? 'continuous' : 'on_enter',
        endBehavior:
          animRaw.endBehavior === 'hide' || animRaw.endBehavior === 'loop'
            ? animRaw.endBehavior
            : 'hold',
        startTimeMs: Math.round(clampNum(animRaw.startTimeMs, 0, 86400000, 0)),
        endTimeMs:
          typeof animRaw.endTimeMs === 'number' && Number.isFinite(animRaw.endTimeMs) && animRaw.endTimeMs > 0
            ? Math.round(clampNum(animRaw.endTimeMs, 100, 86400000, 10000))
            : null,
      },
    };
  });
}

export function sanitizeThumbnailUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 90_000) return '';
  if (
    /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed) ||
    sanitizeSafeUrl(trimmed)
  ) {
    return trimmed;
  }
  return '';
}

export function formatAdDesign(doc: any): BroadcastAdDesignData {
  return {
    id: String(doc._id || doc.id),
    name: doc.name || 'Untitled Ad',
    designType: VALID_DESIGN_TYPES.has(doc.designType) ? doc.designType : 'custom',
    isTemplate: Boolean(doc.isTemplate),
    scope: doc.scope === 'tournament' || doc.scope === 'match' ? doc.scope : 'global',
    ownerUserId: doc.ownerUserId ? String(doc.ownerUserId) : '',
    tournamentId: doc.tournamentId ? String(doc.tournamentId) : null,
    matchId: doc.matchId ? String(doc.matchId) : null,
    canvasWidth: Number(doc.canvasWidth) || 1920,
    canvasHeight: Number(doc.canvasHeight) || 1080,
    layoutPreset: (doc.layoutPreset || 'custom_position') as GraphicsLayoutPresetId,
    elements: Array.isArray(doc.elements) ? doc.elements : [],
    groups: Array.isArray(doc.groups) ? doc.groups : [],
    entryAnimation: sanitizeAnimationStyle(doc.entryAnimation, 'slide-bottom'),
    exitAnimation: sanitizeAnimationStyle(doc.exitAnimation, 'fade-out'),
    defaultDurationSeconds: Math.max(0, Number(doc.defaultDurationSeconds ?? 10)),
    timelineEnabled: Boolean(doc.timelineEnabled),
    totalDurationSeconds: Math.max(1, Number(doc.totalDurationSeconds ?? 12)),
    thumbnailDataUrl: doc.thumbnailDataUrl || '',
    usageCount: Number(doc.usageCount) || 0,
    lastUsedAt: doc.lastUsedAt ? new Date(doc.lastUsedAt).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : undefined,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : undefined,
  };
}

export function formatGraphicsState(doc: any): BroadcastGraphicsStateData {
  return {
    matchId: String(doc.matchId),
    tournamentId: doc.tournamentId ? String(doc.tournamentId) : null,
    broadcastSessionId: doc.broadcastSessionId || '',
    overlapPolicy: doc.overlapPolicy === 'stack' ? 'stack' : 'replace',
    animationsPaused: Boolean(doc.animationsPaused),
    activeSlots: Array.isArray(doc.activeSlots) ? doc.activeSlots : [],
    queue: Array.isArray(doc.queue) ? doc.queue : [],
    queueStatus:
      doc.queueStatus === 'playing' || doc.queueStatus === 'paused' ? doc.queueStatus : 'idle',
    queuePhase:
      doc.queuePhase === 'showing' ||
      doc.queuePhase === 'gap' ||
      doc.queuePhase === 'paused'
        ? doc.queuePhase
        : 'idle',
    currentQueueIndex: Number(doc.currentQueueIndex) || 0,
    queueAutoAdvance: Boolean(doc.queueAutoAdvance),
    queueItemStartedAt: doc.queueItemStartedAt
      ? new Date(doc.queueItemStartedAt).toISOString()
      : null,
    queueNextActionAt: doc.queueNextActionAt
      ? new Date(doc.queueNextActionAt).toISOString()
      : null,
    queuePausedRemainingMs:
      typeof doc.queuePausedRemainingMs === 'number' ? doc.queuePausedRemainingMs : null,
    eventRules: Array.isArray(doc.eventRules) ? doc.eventRules : [],
    serverNowIso: new Date().toISOString(),
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : undefined,
  };
}

async function ensureGraphicsStateDoc(matchId: string) {
  let state = await BroadcastGraphicsState.findOne({ matchId });
  if (!state) {
    const [stream, profile] = await Promise.all([
      LiveStream.findById(matchId).select('tournamentId').lean(),
      ObsControllerProfile.findOne({ matchId }).select('broadcastSessionId').lean(),
    ]);
    state = await BroadcastGraphicsState.create({
      matchId,
      tournamentId: stream?.tournamentId || null,
      broadcastSessionId: profile?.broadcastSessionId || '',
      overlapPolicy: 'replace',
      animationsPaused: false,
      activeSlots: [],
      queue: [],
      queueStatus: 'idle',
      currentQueueIndex: 0,
      queueAutoAdvance: false,
      eventRules: [],
    });
  }
  return state;
}

function clearTimerForSlot(matchId: string, instanceId: string) {
  const key = `${matchId}:${instanceId}`;
  const t = slotExpirationTimers.get(key);
  if (t) {
    clearTimeout(t);
    slotExpirationTimers.delete(key);
  }
}

function clearAllTimersForMatch(matchId: string) {
  const prefix = `${matchId}:`;
  for (const [key, t] of slotExpirationTimers.entries()) {
    if (key.startsWith(prefix)) {
      clearTimeout(t);
      slotExpirationTimers.delete(key);
    }
  }
  const qTimer = queueDelayTimers.get(matchId);
  if (qTimer) {
    clearTimeout(qTimer);
    queueDelayTimers.delete(matchId);
  }
}

async function broadcastGraphicsUpdate(matchId: string, stateDoc: any, syncBridge = true) {
  const payload = formatGraphicsState(stateDoc);
  emitRoomOnlyEvent(matchId, 'graphics:state_updated', {
    matchId,
    streamId: matchId,
    graphicsState: payload,
  });
  emitBroadcastStudioEvent(matchId, 'graphics:state_updated', {
    matchId,
    graphicsState: payload,
  });

  if (syncBridge) {
    // Non-blocking sync timestamp + studio bridge notification (never reloads OBS source or restarts stream)
    ObsControllerProfile.updateOne(
      { matchId },
      { $set: { lastSyncedAt: new Date() } }
    ).catch(() => {});
  }

  return payload;
}

function scheduleSlotExpiration(matchId: string, instanceId: string, expiresAtIso: string) {
  clearTimerForSlot(matchId, instanceId);
  const delayMs = new Date(expiresAtIso).getTime() - Date.now();
  if (delayMs <= 0) {
    handleSlotExpired(matchId, instanceId).catch(() => {});
    return;
  }
  const timer = setTimeout(() => {
    slotExpirationTimers.delete(`${matchId}:${instanceId}`);
    handleSlotExpired(matchId, instanceId).catch(() => {});
  }, Math.min(delayMs, 2_147_483_640));
  slotExpirationTimers.set(`${matchId}:${instanceId}`, timer);
}

type SlotExpiredHook = (slot: ActiveBroadcastGraphicSlot, matchId: string) => Promise<void> | void;
const slotExpiredListeners: SlotExpiredHook[] = [];

export function registerSlotExpiredListener(fn: SlotExpiredHook) {
  slotExpiredListeners.push(fn);
}

async function handleSlotExpired(matchId: string, instanceId: string) {
  const state = await BroadcastGraphicsState.findOne({ matchId });
  if (!state || state.animationsPaused) return;

  const beforeLen = Array.isArray(state.activeSlots) ? state.activeSlots.length : 0;
  const expiredSlot = (state.activeSlots || []).find((s) => s.instanceId === instanceId);
  if (!expiredSlot) return;

  state.activeSlots = (state.activeSlots || []).filter((s) => s.instanceId !== instanceId);
  if (state.activeSlots.length !== beforeLen) {
    state.markModified?.('activeSlots');
    await state.save();
    await broadcastGraphicsUpdate(matchId, state, false);
  }

  for (const listener of slotExpiredListeners) {
    Promise.resolve(listener(expiredSlot, matchId)).catch(() => {});
  }

  // Advance manual playback queue with strict deadline compensation
  if (
    expiredSlot.triggerSource === 'queue' &&
    state.queueStatus === 'playing' &&
    state.queueAutoAdvance
  ) {
    const prevIdx = state.currentQueueIndex || 0;
    const prevQueueItem = state.queue?.[prevIdx];
    const delaySec = Math.max(0, Number(prevQueueItem?.delayAfterSeconds) || 0);
    const nextIndex = prevIdx + 1;

    if (nextIndex >= (state.queue?.length || 0)) {
      state.queueStatus = 'idle';
      state.queuePhase = 'idle';
      state.currentQueueIndex = 0;
      state.queueItemStartedAt = null;
      state.queueNextActionAt = null;
      state.queuePausedRemainingMs = null;
      await state.save();
      await broadcastGraphicsUpdate(matchId, state, false);
      return;
    }

    const baseEndMs = expiredSlot.expiresAt
      ? new Date(expiredSlot.expiresAt).getTime()
      : Date.now();
    const targetNextAtMs = baseEndMs + delaySec * 1000;
    const remainingGapMs = Math.max(0, targetNextAtMs - Date.now());

    state.currentQueueIndex = nextIndex;
    if (remainingGapMs <= 40) {
      state.queuePhase = 'showing';
      await state.save();
      await advanceQueuePlayback(matchId);
      return;
    }

    state.queuePhase = 'gap';
    state.queueNextActionAt = new Date(targetNextAtMs);
    await state.save();
    await broadcastGraphicsUpdate(matchId, state, false);

    const existingQ = queueDelayTimers.get(matchId);
    if (existingQ) clearTimeout(existingQ);

    const t = setTimeout(() => {
      queueDelayTimers.delete(matchId);
      advanceQueuePlayback(matchId).catch(() => {});
    }, remainingGapMs);
    queueDelayTimers.set(matchId, t);
  }
}

async function advanceQueuePlayback(matchId: string) {
  const state = await BroadcastGraphicsState.findOne({ matchId });
  if (!state || state.queueStatus !== 'playing') return;
  const idx = Math.max(0, Number(state.currentQueueIndex) || 0);
  const item = state.queue?.[idx];
  if (!item) {
    state.queueStatus = 'idle';
    state.queuePhase = 'idle';
    state.currentQueueIndex = 0;
    state.queueItemStartedAt = null;
    state.queueNextActionAt = null;
    state.queuePausedRemainingMs = null;
    await state.save();
    await broadcastGraphicsUpdate(matchId, state, false);
    return;
  }

  const design = await BroadcastAdDesign.findById(item.designId).lean();
  if (!design) {
    const nextIdx = idx + 1;
    if (nextIdx >= state.queue.length) {
      state.queueStatus = 'idle';
      state.queuePhase = 'idle';
      state.currentQueueIndex = 0;
      state.queueItemStartedAt = null;
      state.queueNextActionAt = null;
      await state.save();
      await broadcastGraphicsUpdate(matchId, state, false);
    } else {
      state.currentQueueIndex = nextIdx;
      await state.save();
      await advanceQueuePlayback(matchId);
    }
    return;
  }

  const now = new Date();
  const durMs = Math.max(1, Number(item.durationSeconds) || 10) * 1000;
  state.queuePhase = 'showing';
  state.queueItemStartedAt = now;
  state.queueNextActionAt = new Date(now.getTime() + durMs);
  state.queuePausedRemainingMs = null;
  await state.save();

  await showSavedDesignLive({
    matchId,
    designId: item.designId,
    durationSecondsOverride: item.durationSeconds,
    triggerSource: 'queue',
  });
}

export async function getGraphicsStateForMatch(matchId: string): Promise<BroadcastGraphicsStateData> {
  if (!mongoose.Types.ObjectId.isValid(matchId)) {
    return {
      matchId,
      broadcastSessionId: '',
      overlapPolicy: 'replace',
      animationsPaused: false,
      activeSlots: [],
      queue: [],
      queueStatus: 'idle',
      currentQueueIndex: 0,
      queueAutoAdvance: false,
      eventRules: [],
    };
  }
  const state = await ensureGraphicsStateDoc(matchId);
  if (!state.animationsPaused && Array.isArray(state.activeSlots) && state.activeSlots.length > 0) {
    const now = Date.now();
    const valid = state.activeSlots.filter((slot) => {
      if (!slot.expiresAt) return true;
      return new Date(slot.expiresAt).getTime() > now;
    });
    if (valid.length !== state.activeSlots.length) {
      state.activeSlots = valid;
      state.markModified?.('activeSlots');
      await state.save();
    } else {
      // Ensure timers exist for active timed slots (e.g. after server restart)
      for (const slot of valid) {
        if (slot.expiresAt && !slotExpirationTimers.has(`${matchId}:${slot.instanceId}`)) {
          scheduleSlotExpiration(matchId, slot.instanceId, slot.expiresAt);
        }
      }
    }
  }
  return formatGraphicsState(state);
}

export async function showRawGraphicLive(params: {
  matchId: string;
  designId?: string | null;
  scheduleId?: string | null;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  elements: GraphicsElement[];
  groups?: GraphicsDesignGroupMeta[];
  entryAnimation: GraphicsAnimationStyle;
  exitAnimation: GraphicsAnimationStyle;
  durationSeconds: number;
  overlapPolicy?: GraphicsOverlapPolicy;
  actor?: IUser | null;
  triggerSource?: 'live_edit' | 'saved_ad' | 'queue' | 'schedule' | 'event';
  triggerEventType?: BroadcastGraphicEventTrigger | '';
}): Promise<BroadcastGraphicsStateData> {
  const { matchId, actor } = params;
  const state = await ensureGraphicsStateDoc(matchId);

  if (params.overlapPolicy === 'replace' || params.overlapPolicy === 'stack') {
    state.overlapPolicy = params.overlapPolicy;
  }

  const policy = state.overlapPolicy || 'replace';
  if (policy === 'replace') {
    for (const oldSlot of state.activeSlots || []) {
      clearTimerForSlot(matchId, oldSlot.instanceId);
    }
    state.activeSlots = [];
  }

  const durationSec = Math.max(0, Math.min(86400, Number(params.durationSeconds) || 0));
  const now = new Date();
  const expiresAtIso =
    durationSec > 0 ? new Date(now.getTime() + durationSec * 1000).toISOString() : null;
  const instanceId = `gfx_${crypto.randomBytes(6).toString('hex')}`;

  const newSlot: ActiveBroadcastGraphicSlot = {
    instanceId,
    designId: params.designId || null,
    scheduleId: params.scheduleId || null,
    name: sanitizeText(params.name, 140) || 'Live Graphic',
    canvasWidth: clampNum(params.canvasWidth, 320, 3840, 1920),
    canvasHeight: clampNum(params.canvasHeight, 320, 3840, 1080),
    elements: sanitizeGraphicsElements(params.elements),
    ...(Array.isArray(params.groups) && params.groups.length > 0
      ? { groups: sanitizeDesignGroups(params.groups) }
      : {}),
    entryAnimation: sanitizeAnimationStyle(params.entryAnimation, 'slide-bottom'),
    exitAnimation: sanitizeAnimationStyle(params.exitAnimation, 'fade-out'),
    durationSeconds: durationSec,
    startedAt: now.toISOString(),
    expiresAt: expiresAtIso,
    pausedRemainingMs: null,
    visible: true,
    triggerSource: params.triggerSource || 'live_edit',
    triggerEventType: params.triggerEventType || '',
    shownByName: actor?.name || 'Broadcast System',
  };

  state.animationsPaused = false;
  state.pausedAt = null;
  state.activeSlots = [...(state.activeSlots || []), newSlot].slice(-8);
  if (actor?._id) state.lastUpdatedBy = actor._id as mongoose.Types.ObjectId;
  state.markModified?.('activeSlots');
  await state.save();

  if (expiresAtIso) {
    scheduleSlotExpiration(matchId, instanceId, expiresAtIso);
  }

  const updated = await broadcastGraphicsUpdate(matchId, state, true);

  if (actor) {
    await writeBroadcastAudit({
      matchId,
      actionType:
        params.triggerSource === 'event'
          ? 'GRAPHICS_EVENT_TRIGGERED'
          : params.triggerSource === 'schedule'
            ? 'GRAPHICS_SCHEDULE_EXECUTED'
            : 'GRAPHICS_SHOWN_LIVE',
      actor,
      obsStatus: 'SUCCESS',
      metadata: {
        instanceId,
        designId: params.designId || null,
        scheduleId: params.scheduleId || null,
        name: newSlot.name,
        durationSeconds: durationSec,
        triggerSource: newSlot.triggerSource,
      },
    });
    await recordActivity(
      actor,
      'SHOW_BROADCAST_GRAPHIC',
      'LiveStream',
      matchId,
      `Displayed live broadcast graphic "${newSlot.name}" (${durationSec > 0 ? `${durationSec}s` : 'permanent'})`
    );
  }

  return updated;
}

export async function showSavedDesignLive(params: {
  matchId: string;
  designId: string;
  scheduleId?: string | null;
  durationSecondsOverride?: number | null;
  overlapPolicyOverride?: GraphicsOverlapPolicy;
  actor?: IUser | null;
  triggerSource?: 'saved_ad' | 'queue' | 'schedule' | 'event';
  triggerEventType?: BroadcastGraphicEventTrigger | '';
}): Promise<{ state: BroadcastGraphicsStateData; design: BroadcastAdDesignData }> {
  const { matchId, designId } = params;
  const dedupeKey = `${matchId}:${designId}:${params.triggerSource || 'saved_ad'}`;
  const lastAt = recentShowLiveStamp.get(dedupeKey) || 0;
  if (params.triggerSource === 'saved_ad' && Date.now() - lastAt < 350) {
    const current = await getGraphicsStateForMatch(matchId);
    const existingDesign = await BroadcastAdDesign.findById(designId).lean();
    if (!existingDesign) {
      const err: any = new Error('Saved advertisement design not found.');
      err.statusCode = 404;
      throw err;
    }
    return { state: current, design: formatAdDesign(existingDesign) };
  }
  recentShowLiveStamp.set(dedupeKey, Date.now());
  if (recentShowLiveStamp.size > 300) {
    const firstKey = recentShowLiveStamp.keys().next().value;
    if (firstKey) recentShowLiveStamp.delete(firstKey);
  }

  const design = await BroadcastAdDesign.findById(designId);
  if (!design) {
    const err: any = new Error('Saved advertisement design not found.');
    err.statusCode = 404;
    throw err;
  }

  if (design.scope === 'match' && design.matchId && String(design.matchId) !== String(matchId)) {
    const err: any = new Error('This match-scoped advertisement belongs to a different match.');
    err.statusCode = 403;
    throw err;
  }

  const effectiveDuration =
    typeof params.durationSecondsOverride === 'number' &&
    Number.isFinite(params.durationSecondsOverride) &&
    params.durationSecondsOverride >= 0
      ? Math.round(params.durationSecondsOverride)
      : Number(design.defaultDurationSeconds ?? 10);

  design.usageCount = (Number(design.usageCount) || 0) + 1;
  design.lastUsedAt = new Date();
  await design.save();

  const state = await showRawGraphicLive({
    matchId,
    designId: String(design._id),
    scheduleId: params.scheduleId || null,
    name: design.name,
    canvasWidth: design.canvasWidth || 1920,
    canvasHeight: design.canvasHeight || 1080,
    elements: (design.elements || []) as GraphicsElement[],
    groups: (design.groups || []) as GraphicsDesignGroupMeta[],
    entryAnimation: (design.entryAnimation || 'slide-bottom') as GraphicsAnimationStyle,
    exitAnimation: (design.exitAnimation || 'fade-out') as GraphicsAnimationStyle,
    durationSeconds: effectiveDuration,
    overlapPolicy: params.overlapPolicyOverride,
    actor: params.actor,
    triggerSource: params.triggerSource || 'saved_ad',
    triggerEventType: params.triggerEventType || '',
  });

  return { state, design: formatAdDesign(design) };
}

export async function hideLiveGraphics(
  matchId: string,
  instanceId?: string,
  actor?: IUser | null
): Promise<BroadcastGraphicsStateData> {
  const state = await ensureGraphicsStateDoc(matchId);
  if (instanceId) {
    clearTimerForSlot(matchId, instanceId);
    state.activeSlots = (state.activeSlots || []).filter((s) => s.instanceId !== instanceId);
  } else {
    clearAllTimersForMatch(matchId);
    state.activeSlots = [];
  }
  state.markModified?.('activeSlots');
  if (actor?._id) state.lastUpdatedBy = actor._id as mongoose.Types.ObjectId;
  await state.save();

  const updated = await broadcastGraphicsUpdate(matchId, state, true);
  if (actor) {
    await writeBroadcastAudit({
      matchId,
      actionType: 'GRAPHICS_HIDDEN',
      actor,
      obsStatus: 'SUCCESS',
      metadata: { instanceId: instanceId || 'ALL' },
    });
  }
  return updated;
}

export async function clearLiveGraphics(
  matchId: string,
  actor?: IUser | null,
  newSessionId?: string
): Promise<BroadcastGraphicsStateData> {
  clearAllTimersForMatch(matchId);
  const state = await ensureGraphicsStateDoc(matchId);
  state.activeSlots = [];
  state.animationsPaused = false;
  state.pausedAt = null;
  if (newSessionId !== undefined) {
    state.broadcastSessionId = newSessionId;
    state.queueStatus = 'idle';
    state.currentQueueIndex = 0;
  }
  state.markModified?.('activeSlots');
  if (actor?._id) state.lastUpdatedBy = actor._id as mongoose.Types.ObjectId;
  await state.save();

  const updated = await broadcastGraphicsUpdate(matchId, state, true);
  if (actor) {
    await writeBroadcastAudit({
      matchId,
      actionType: 'GRAPHICS_CLEARED',
      actor,
      obsStatus: 'SUCCESS',
      metadata: { broadcastSessionId: state.broadcastSessionId },
    });
  }
  return updated;
}

export async function pauseResumeGraphicsAnimations(
  matchId: string,
  paused: boolean,
  actor?: IUser | null
): Promise<BroadcastGraphicsStateData> {
  const state = await ensureGraphicsStateDoc(matchId);
  const now = Date.now();

  if (paused && !state.animationsPaused) {
    state.animationsPaused = true;
    state.pausedAt = new Date(now);
    state.activeSlots = (state.activeSlots || []).map((slot) => {
      clearTimerForSlot(matchId, slot.instanceId);
      const remaining = slot.expiresAt
        ? Math.max(0, new Date(slot.expiresAt).getTime() - now)
        : null;
      return {
        ...slot,
        pausedRemainingMs: remaining,
      };
    });
  } else if (!paused && state.animationsPaused) {
    state.animationsPaused = false;
    state.pausedAt = null;
    state.activeSlots = (state.activeSlots || []).map((slot) => {
      if (typeof slot.pausedRemainingMs === 'number' && slot.pausedRemainingMs > 0) {
        const nextExp = new Date(now + slot.pausedRemainingMs).toISOString();
        scheduleSlotExpiration(matchId, slot.instanceId, nextExp);
        return {
          ...slot,
          expiresAt: nextExp,
          pausedRemainingMs: null,
        };
      }
      return {
        ...slot,
        pausedRemainingMs: null,
      };
    });
  }

  state.markModified?.('activeSlots');
  if (actor?._id) state.lastUpdatedBy = actor._id as mongoose.Types.ObjectId;
  await state.save();
  return broadcastGraphicsUpdate(matchId, state, false);
}

export async function updateGraphicsSettings(
  matchId: string,
  payload: {
    overlapPolicy?: GraphicsOverlapPolicy;
    eventRules?: BroadcastGraphicEventRule[];
  },
  actor?: IUser | null
): Promise<BroadcastGraphicsStateData> {
  const state = await ensureGraphicsStateDoc(matchId);
  if (payload.overlapPolicy === 'replace' || payload.overlapPolicy === 'stack') {
    state.overlapPolicy = payload.overlapPolicy;
  }
  if (Array.isArray(payload.eventRules)) {
    state.eventRules = payload.eventRules
      .filter((r) => r && VALID_EVENT_TRIGGERS.has(r.trigger))
      .slice(0, 24)
      .map((r) => ({
        trigger: r.trigger,
        enabled: Boolean(r.enabled && r.designId),
        designId: sanitizeText(r.designId, 80),
        designName: sanitizeText(r.designName, 140),
        durationSeconds: Math.round(clampNum(r.durationSeconds, 0, 3600, 10)),
        cooldownSeconds: Math.round(clampNum(r.cooldownSeconds, 3, 3600, 15)),
        lastTriggeredAt: r.lastTriggeredAt || null,
      }));
    state.markModified?.('eventRules');
  }
  if (actor?._id) state.lastUpdatedBy = actor._id as mongoose.Types.ObjectId;
  await state.save();
  return broadcastGraphicsUpdate(matchId, state, false);
}

export async function updateGraphicsQueue(
  matchId: string,
  payload: {
    queue: BroadcastAdQueueItem[];
    queueAutoAdvance?: boolean;
  },
  actor?: IUser | null
): Promise<BroadcastGraphicsStateData> {
  const state = await ensureGraphicsStateDoc(matchId);
  state.queue = (Array.isArray(payload.queue) ? payload.queue : [])
    .slice(0, 50)
    .map((item, idx): BroadcastAdQueueItem => ({
      queueItemId: sanitizeText(item.queueItemId, 64) || `q_${idx}_${Date.now()}`,
      designId: sanitizeText(item.designId, 80),
      name: sanitizeText(item.name, 140) || 'Queued Ad',
      designType: VALID_DESIGN_TYPES.has(item.designType) ? item.designType : 'custom',
      thumbnailDataUrl: sanitizeThumbnailUrl(item.thumbnailDataUrl),
      durationSeconds: Math.round(clampNum(item.durationSeconds, 1, 3600, 10)),
      delayAfterSeconds: Math.round(clampNum(item.delayAfterSeconds, 0, 600, 2)),
      entryAnimation: sanitizeAnimationStyle(item.entryAnimation, 'slide-bottom'),
      exitAnimation: sanitizeAnimationStyle(item.exitAnimation, 'fade-out'),
    }));
  if (typeof payload.queueAutoAdvance === 'boolean') {
    state.queueAutoAdvance = payload.queueAutoAdvance;
  }
  if (state.currentQueueIndex >= state.queue.length) {
    state.currentQueueIndex = 0;
  }
  state.markModified?.('queue');
  if (actor?._id) state.lastUpdatedBy = actor._id as mongoose.Types.ObjectId;
  await state.save();

  if (actor) {
    await writeBroadcastAudit({
      matchId,
      actionType: 'GRAPHICS_QUEUE_UPDATED',
      actor,
      obsStatus: 'SUCCESS',
      metadata: { queueCount: state.queue.length, queueAutoAdvance: state.queueAutoAdvance },
    });
  }
  return broadcastGraphicsUpdate(matchId, state, false);
}

export async function controlGraphicsQueue(
  matchId: string,
  action: 'start' | 'play_next' | 'pause' | 'stop',
  actor?: IUser | null
): Promise<BroadcastGraphicsStateData> {
  const state = await ensureGraphicsStateDoc(matchId);
  const existingQ = queueDelayTimers.get(matchId);
  if (existingQ) {
    clearTimeout(existingQ);
    queueDelayTimers.delete(matchId);
  }

  if (action === 'stop') {
    for (const slot of state.activeSlots || []) {
      if (slot.triggerSource === 'queue') {
        clearTimerForSlot(matchId, slot.instanceId);
      }
    }
    state.activeSlots = (state.activeSlots || []).filter((s) => s.triggerSource !== 'queue');
    state.markModified?.('activeSlots');
    state.queueStatus = 'idle';
    state.queuePhase = 'idle';
    state.currentQueueIndex = 0;
    state.queueItemStartedAt = null;
    state.queueNextActionAt = null;
    state.queuePausedRemainingMs = null;
    await state.save();
    return broadcastGraphicsUpdate(matchId, state, false);
  }

  if (action === 'pause') {
    const now = Date.now();
    let remainingMs =
      state.queueNextActionAt
        ? Math.max(200, new Date(state.queueNextActionAt).getTime() - now)
        : null;

    const wasGap = state.queuePhase === 'gap';
    state.activeSlots = (state.activeSlots || []).map((slot) => {
      if (slot.triggerSource !== 'queue') return slot;
      clearTimerForSlot(matchId, slot.instanceId);
      const slotRem = slot.expiresAt
        ? Math.max(200, new Date(slot.expiresAt).getTime() - now)
        : remainingMs;
      if (remainingMs === null && typeof slotRem === 'number') {
        remainingMs = slotRem;
      }
      return {
        ...slot,
        pausedRemainingMs: slotRem ?? null,
      };
    });
    state.markModified?.('activeSlots');
    state.queueStatus = 'paused';
    state.queuePhase = wasGap ? 'paused' : 'paused';
    state.queuePausedRemainingMs = remainingMs ?? 5000;
    state.queueNextActionAt = null;
    await state.save();
    return broadcastGraphicsUpdate(matchId, state, false);
  }

  if (!state.queue || state.queue.length === 0) {
    const err: any = new Error('Playback queue is empty. Add saved advertisements first.');
    err.statusCode = 400;
    throw err;
  }

  if (action === 'play_next') {
    const cur = Math.max(0, Math.min(state.queue.length - 1, state.currentQueueIndex || 0));
    const targetIdx =
      state.queueStatus === 'idle' ? cur : cur + 1 >= state.queue.length ? 0 : cur + 1;
    const item = state.queue[targetIdx];
    const now = new Date();
    const durMs = Math.max(1, Number(item.durationSeconds) || 10) * 1000;

    state.currentQueueIndex = targetIdx;
    state.queuePhase = 'showing';
    state.queueItemStartedAt = now;
    state.queueNextActionAt = new Date(now.getTime() + durMs);
    state.queuePausedRemainingMs = null;
    await state.save();

    const { state: afterPlay } = await showSavedDesignLive({
      matchId,
      designId: item.designId,
      durationSecondsOverride: item.durationSeconds,
      actor,
      triggerSource: 'queue',
    });
    return afterPlay;
  }

  // 'start' (or resume from paused!)
  if (
    state.queueStatus === 'paused' &&
    typeof state.queuePausedRemainingMs === 'number' &&
    state.queuePausedRemainingMs > 0
  ) {
    const now = Date.now();
    const remMs = state.queuePausedRemainingMs;
    const hasPausedQueueSlot = (state.activeSlots || []).some((s) => s.triggerSource === 'queue');

    state.queueStatus = 'playing';
    state.queueAutoAdvance = true;
    state.queuePausedRemainingMs = null;

    if (hasPausedQueueSlot) {
      const nextExp = new Date(now + remMs).toISOString();
      state.queuePhase = 'showing';
      state.queueNextActionAt = new Date(nextExp);
      state.activeSlots = (state.activeSlots || []).map((slot) => {
        if (slot.triggerSource !== 'queue') return slot;
        scheduleSlotExpiration(matchId, slot.instanceId, nextExp);
        return {
          ...slot,
          expiresAt: nextExp,
          pausedRemainingMs: null,
        };
      });
      state.markModified?.('activeSlots');
      await state.save();
      return broadcastGraphicsUpdate(matchId, state, false);
    }

    // Resume gap timer before next item
    state.queuePhase = 'gap';
    state.queueNextActionAt = new Date(now + remMs);
    await state.save();
    const t = setTimeout(() => {
      queueDelayTimers.delete(matchId);
      advanceQueuePlayback(matchId).catch(() => {});
    }, remMs);
    queueDelayTimers.set(matchId, t);
    return broadcastGraphicsUpdate(matchId, state, false);
  }

  state.queueStatus = 'playing';
  state.queueAutoAdvance = true;
  if (state.currentQueueIndex >= state.queue.length) {
    state.currentQueueIndex = 0;
  }
  const idx = state.currentQueueIndex || 0;
  const item = state.queue[idx];
  const now = new Date();
  const durMs = Math.max(1, Number(item.durationSeconds) || 10) * 1000;
  state.queuePhase = 'showing';
  state.queueItemStartedAt = now;
  state.queueNextActionAt = new Date(now.getTime() + durMs);
  state.queuePausedRemainingMs = null;
  await state.save();

  const { state: afterStart } = await showSavedDesignLive({
    matchId,
    designId: item.designId,
    durationSecondsOverride: item.durationSeconds,
    actor,
    triggerSource: 'queue',
  });
  return afterStart;
}

export async function triggerBroadcastGraphicEvent(
  matchId: string,
  trigger: BroadcastGraphicEventTrigger,
  dedupeKey?: string
): Promise<boolean> {
  try {
    if (!mongoose.Types.ObjectId.isValid(matchId) || !VALID_EVENT_TRIGGERS.has(trigger)) {
      return false;
    }
    if (dedupeKey) {
      const fullDedupe = `${matchId}:${trigger}:${dedupeKey}`;
      if (seenEventDedupeKeys.has(fullDedupe)) return false;
      seenEventDedupeKeys.set(fullDedupe, Date.now());
      if (seenEventDedupeKeys.size > 500) {
        const firstKey = seenEventDedupeKeys.keys().next().value;
        if (firstKey) seenEventDedupeKeys.delete(firstKey);
      }
    }

    const state = await BroadcastGraphicsState.findOne({ matchId });
    if (!state || !Array.isArray(state.eventRules) || state.eventRules.length === 0) {
      return false;
    }

    const ruleIndex = state.eventRules.findIndex(
      (r) => r.trigger === trigger && r.enabled && Boolean(r.designId)
    );
    if (ruleIndex === -1) return false;

    const rule = state.eventRules[ruleIndex];
    const cooldownMs = Math.max(3, Number(rule.cooldownSeconds) || 15) * 1000;
    const lastTriggeredMs = rule.lastTriggeredAt ? new Date(rule.lastTriggeredAt).getTime() : 0;
    if (Date.now() - lastTriggeredMs < cooldownMs) {
      return false;
    }

    state.eventRules[ruleIndex] = {
      ...rule,
      lastTriggeredAt: new Date().toISOString(),
    };
    state.markModified?.('eventRules');
    await state.save();

    await showSavedDesignLive({
      matchId,
      designId: rule.designId,
      durationSecondsOverride: rule.durationSeconds > 0 ? rule.durationSeconds : undefined,
      triggerSource: 'event',
      triggerEventType: trigger,
    });
    return true;
  } catch (err) {
    console.warn('[BroadcastGraphics] Event trigger error (non-fatal):', err);
    return false;
  }
}

export async function createOrSaveAdDesign(params: {
  designId?: string;
  name: string;
  designType?: GraphicsDesignType;
  isTemplate?: boolean;
  scope?: 'global' | 'tournament' | 'match';
  tournamentId?: string | null;
  matchId?: string | null;
  canvasWidth?: number;
  canvasHeight?: number;
  layoutPreset?: string;
  elements: GraphicsElement[];
  groups?: GraphicsDesignGroupMeta[];
  entryAnimation?: GraphicsAnimationStyle;
  exitAnimation?: GraphicsAnimationStyle;
  defaultDurationSeconds?: number;
  timelineEnabled?: boolean;
  totalDurationSeconds?: number;
  thumbnailDataUrl?: string;
  actor: IUser;
}): Promise<BroadcastAdDesignData> {
  const scope: 'global' | 'tournament' | 'match' =
    params.scope === 'tournament' || params.scope === 'match' ? params.scope : 'global';
  const cleanName = sanitizeText(params.name, 140) || 'Untitled Broadcast Ad';
  const cleanElements = sanitizeGraphicsElements(params.elements);
  const cleanGroups = sanitizeDesignGroups(params.groups);
  const cleanThumb = sanitizeThumbnailUrl(params.thumbnailDataUrl);

  const payload = {
    name: cleanName,
    designType: VALID_DESIGN_TYPES.has(params.designType as GraphicsDesignType)
      ? params.designType!
      : 'custom',
    isTemplate: Boolean(params.isTemplate),
    scope,
    tournamentId:
      scope !== 'global' && params.tournamentId && mongoose.Types.ObjectId.isValid(params.tournamentId)
        ? new mongoose.Types.ObjectId(params.tournamentId)
        : null,
    matchId:
      scope === 'match' && params.matchId && mongoose.Types.ObjectId.isValid(params.matchId)
        ? new mongoose.Types.ObjectId(params.matchId)
        : null,
    canvasWidth: Math.round(clampNum(params.canvasWidth, 320, 3840, 1920)),
    canvasHeight: Math.round(clampNum(params.canvasHeight, 320, 3840, 1080)),
    layoutPreset: (sanitizeText(params.layoutPreset, 60) || 'custom_position') as GraphicsLayoutPresetId,
    elements: cleanElements,
    groups: cleanGroups,
    entryAnimation: sanitizeAnimationStyle(params.entryAnimation, 'slide-bottom'),
    exitAnimation: sanitizeAnimationStyle(params.exitAnimation, 'fade-out'),
    defaultDurationSeconds: Math.round(clampNum(params.defaultDurationSeconds, 0, 86400, 10)),
    timelineEnabled: Boolean(params.timelineEnabled),
    totalDurationSeconds: Math.round(clampNum(params.totalDurationSeconds, 1, 86400, 12)),
    thumbnailDataUrl: cleanThumb,
    updatedBy: params.actor._id as mongoose.Types.ObjectId,
  };

  let saved: IBroadcastAdDesign;
  if (params.designId && mongoose.Types.ObjectId.isValid(params.designId)) {
    const existing = await BroadcastAdDesign.findById(params.designId);
    if (!existing) {
      const err: any = new Error('Saved advertisement design not found.');
      err.statusCode = 404;
      throw err;
    }
    const isAdmin = params.actor.role === 'SUPER_ADMIN' || params.actor.role === 'ADMIN';
    if (!isAdmin && String(existing.ownerUserId) !== String(params.actor._id)) {
      const err: any = new Error('Forbidden: You can only update your own saved designs.');
      err.statusCode = 403;
      throw err;
    }
    Object.assign(existing, payload);
    existing.markModified?.('elements');
    existing.markModified?.('groups');
    saved = await existing.save();
  } else {
    saved = await BroadcastAdDesign.create({
      ...payload,
      ownerUserId: params.actor._id as mongoose.Types.ObjectId,
      createdBy: params.actor._id as mongoose.Types.ObjectId,
      usageCount: 0,
    });
  }

  await writeBroadcastAudit({
    matchId: params.matchId || null,
    actionType: 'GRAPHICS_SAVED',
    actor: params.actor,
    obsStatus: 'SUCCESS',
    metadata: {
      designId: String(saved._id),
      name: saved.name,
      scope: saved.scope,
      isTemplate: saved.isTemplate,
    },
  });

  return formatAdDesign(saved);
}
