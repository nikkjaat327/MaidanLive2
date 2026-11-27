import crypto from 'crypto';
import OBSWebSocket, { EventSubscription } from 'obs-websocket-js';
import type { Socket as IoSocket } from 'socket.io';
import mongoose from 'mongoose';
import { ObsControllerProfile } from '../models/ObsControllerProfile.ts';
import type { IObsControllerProfile, MultiCameraLayoutType } from '../models/ObsControllerProfile.ts';
import { ObsBridge } from '../models/ObsBridge.ts';
import type { IObsBridge } from '../models/ObsBridge.ts';
import { ObsBridgePairing } from '../models/ObsBridgePairing.ts';
import { BroadcastCamera } from '../models/BroadcastCamera.ts';
import type { CameraConnectionStatus } from '../models/BroadcastCamera.ts';
import { BroadcastScene } from '../models/BroadcastScene.ts';
import { BroadcastAuditLog } from '../models/BroadcastAuditLog.ts';
import type { BroadcastAuditAction } from '../models/BroadcastAuditLog.ts';
import { LiveStream } from '../models/LiveStream.ts';
import { LiveScore } from '../models/LiveScore.ts';
import { User } from '../models/User.ts';
import type { IUser } from '../models/User.ts';
import { hasBroadcastAccess } from '../middleware/auth.ts';
import {
  buildVdoNinjaLinks,
  decryptObsSecret,
  encryptObsSecret,
  generateScopedToken,
  hashScopedToken,
  sanitizeVdoViewUrl,
  verifyScopedToken,
} from '../utils/obsCrypto.ts';
import {
  computeObsLayoutBoxes,
  LAYOUT_METADATA,
  MAX_CONTROL_ROOM_CAMERAS,
} from '../../src/utils/obsLayoutGeometry.ts';
import type { ObsLayoutType, PipPosition, PipSize } from '../../src/utils/obsLayoutGeometry.ts';
import {
  buildObsSceneItemTransform,
  normalizeOrientationMode,
  normalizePreviewFit,
  parseOrientationDegrees,
} from '../../src/utils/obsTransformGeometry.ts';
import type {
  CameraOrientationMode,
  CameraPreviewFit,
  ObsSceneTransformItem,
} from '../../src/utils/obsTransformGeometry.ts';
import { normalizeOverlayConfig } from '../../src/utils/overlayConfig.ts';
import { extractYouTubeVideoId } from '../../src/utils/youtube.ts';
import {
  emitBroadcastStudioEvent,
  emitCameraCompanionEvent,
  emitRoomOnlyEvent,
  emitStreamEvent,
  getSocketIO,
  registerObsAgentHandlers,
} from '../socket/index.ts';
import type { ObsAgentContext } from '../socket/index.ts';
import { recordActivity } from '../utils/audit.ts';
import { sanitizeText } from '../utils/sanitize.ts';
import {
  buildLarixCameraConfig,
  isValidMediaSourceUrl,
  verifyMediaMTXStreamHealth,
} from './mediamtxService.ts';
import { clearLiveGraphics, getGraphicsStateForMatch } from './broadcastGraphicsService.ts';
import { handleMatchSessionEndedForSchedules } from './broadcastAdScheduleService.ts';

interface DirectObsSession {
  matchId: string;
  obs: OBSWebSocket;
  connected: boolean;
  connecting: boolean;
  manualDisconnect: boolean;
  reconnectTimer: NodeJS.Timeout | null;
  reconnectAttempts: number;
  keepaliveTimer: NodeJS.Timeout | null;
  keepaliveFailures: number;
}

const OBS_EVENT_SUBSCRIPTIONS =
  ((EventSubscription && EventSubscription.All) || 4095) |
  ((EventSubscription && EventSubscription.InputVolumeMeters) || 65536);

const directSessions = new Map<string, DirectObsSession>();
const agentSockets = new Map<string, IoSocket>();
const bridgeSockets = new Map<string, IoSocket>();
const activeSceneSwitchLocks = new Map<string, { inFlight: boolean; lastSwitchAt: number }>();
const latestAudioMeterByMatch = new Map<string, any>();
const latestAudioMeterByBridge = new Map<string, any>();
const directAudioStateByMatch = new Map<
  string,
  {
    specialInputs: Record<string, any>;
    muteMap: Map<string, boolean>;
    peakHoldMap: Map<string, { db: number; ts: number }>;
    latestInputs: any[];
    lastEmitAt: number;
  }
>();
const HEARTBEAT_STALE_MS = 45_000;
const SCENE_SWITCH_COOLDOWN_MS = 350;
const DIRECT_AUDIO_MIN_DB = -60;
const DIRECT_AUDIO_PEAK_HOLD_MS = 1400;

function linearMulToDbServer(mul: unknown): number {
  const num = Number(mul);
  if (!Number.isFinite(num) || num <= 0.0001) return DIRECT_AUDIO_MIN_DB;
  const db = 20 * Math.log10(num);
  if (!Number.isFinite(db)) return DIRECT_AUDIO_MIN_DB;
  return Math.max(DIRECT_AUDIO_MIN_DB, Math.min(0, Math.round(db * 10) / 10));
}

function isLikelyAudioInputServer(input: any, specialInputs: Record<string, any> = {}): boolean {
  const name = String(input?.inputName || '').trim();
  if (!name) return false;
  if (Object.values(specialInputs || {}).some((v) => typeof v === 'string' && v.trim() === name)) {
    return true;
  }
  const kind = `${String(input?.inputKind || '')} ${String(input?.unversionedInputKind || '')}`.toLowerCase();
  return (
    kind.includes('wasapi_') ||
    kind.includes('coreaudio_') ||
    kind.includes('pulse_') ||
    kind.includes('alsa_') ||
    kind.includes('jack_') ||
    kind.includes('audio') ||
    kind.includes('ffmpeg_source') ||
    kind.includes('vlc_source') ||
    kind.includes('browser_source') ||
    kind.includes('dshow_input') ||
    kind.includes('ndi_source')
  );
}

function selectPrimaryAudioInputServer(params: {
  preferredInputName?: string;
  specialInputs?: Record<string, any>;
  meterInputs?: any[];
  obsInputs?: any[];
}) {
  const names = new Set<string>();
  for (const m of params.meterInputs || []) {
    if (m?.inputName && String(m.inputName).trim()) names.add(String(m.inputName).trim());
  }
  for (const v of Object.values(params.specialInputs || {})) {
    if (typeof v === 'string' && v.trim()) names.add(v.trim());
  }
  for (const inp of params.obsInputs || []) {
    if (isLikelyAudioInputServer(inp, params.specialInputs)) names.add(String(inp.inputName).trim());
  }
  const availableAudioInputs = Array.from(names);
  const preferred = String(params.preferredInputName || '').trim();
  if (preferred && availableAudioInputs.includes(preferred)) {
    return { primaryInputName: preferred, availableAudioInputs };
  }
  const mics = [params.specialInputs?.mic1, params.specialInputs?.mic2, params.specialInputs?.mic3];
  for (const mic of mics) {
    const clean = typeof mic === 'string' ? mic.trim() : '';
    if (clean && availableAudioInputs.includes(clean)) {
      return { primaryInputName: clean, availableAudioInputs };
    }
  }
  return {
    primaryInputName: availableAudioInputs[0] || preferred || '',
    availableAudioInputs,
  };
}

function evaluateAudioReadinessServer(params: {
  obsConnected: boolean;
  inputName: string;
  muted: boolean;
  peakDb: number;
  clipping: boolean;
}) {
  if (!params.obsConnected) return { status: 'OFFLINE', label: 'OBS Offline', readyForLive: false };
  if (!params.inputName) return { status: 'OFFLINE', label: 'No Audio Input Detected', readyForLive: false };
  if (params.muted) return { status: 'MUTED', label: 'Muted in OBS — Unmute Before Live', readyForLive: false };
  if (params.clipping || params.peakDb >= -1.5) {
    return { status: 'CLIPPING', label: 'Clipping! Lower Gain Below -3 dB', readyForLive: false };
  }
  if (params.peakDb >= -20) {
    return { status: 'OPTIMAL', label: 'Broadcast Audio Ready (-20 to -3 dB)', readyForLive: true };
  }
  if (params.peakDb >= -45) {
    return { status: 'LOW', label: 'Low Level — Aim for -18 to -6 dB', readyForLive: true };
  }
  return { status: 'SILENT', label: 'No Audio Signal Detected', readyForLive: false };
}

function buildDirectAudioMeterState(
  matchId: string,
  obsConnected: boolean,
  preferredInputName = '',
  obsInputs: any[] = [],
  meterInputs: any[] = [],
  nowMs = Date.now()
) {
  let state = directAudioStateByMatch.get(matchId);
  if (!state) {
    state = {
      specialInputs: {},
      muteMap: new Map(),
      peakHoldMap: new Map(),
      latestInputs: [],
      lastEmitAt: 0,
    };
    directAudioStateByMatch.set(matchId, state);
  }
  const { primaryInputName, availableAudioInputs } = selectPrimaryAudioInputServer({
    preferredInputName,
    specialInputs: state.specialInputs,
    meterInputs,
    obsInputs,
  });

  if (!obsConnected) {
    const readiness = evaluateAudioReadinessServer({
      obsConnected: false,
      inputName: primaryInputName,
      muted: false,
      peakDb: DIRECT_AUDIO_MIN_DB,
      clipping: false,
    });
    return {
      obsConnected: false,
      primaryInputName,
      availableAudioInputs,
      channelsDb: [DIRECT_AUDIO_MIN_DB, DIRECT_AUDIO_MIN_DB],
      magnitudeDb: DIRECT_AUDIO_MIN_DB,
      peakDb: DIRECT_AUDIO_MIN_DB,
      peakHoldDb: DIRECT_AUDIO_MIN_DB,
      muted: false,
      clipping: false,
      ...readiness,
      updatedAtMs: nowMs,
    };
  }

  const matched = (meterInputs || []).find((m: any) => String(m?.inputName || '').trim() === primaryInputName);
  const rawLevels = Array.isArray(matched?.inputLevelsMul) ? matched.inputLevelsMul : [];
  const left = Array.isArray(rawLevels[0]) ? rawLevels[0] : [0, 0, 0];
  const right = Array.isArray(rawLevels[1]) ? rawLevels[1] : left;
  const chDb = [
    linearMulToDbServer(left[1] ?? left[0] ?? 0),
    linearMulToDbServer(right[1] ?? right[0] ?? 0),
  ];
  const magDb = Math.max(linearMulToDbServer(left[0] ?? 0), linearMulToDbServer(right[0] ?? 0));
  const peakLinear = Math.max(
    Number(left[1] ?? 0),
    Number(right[1] ?? 0),
    Number(left[2] ?? 0),
    Number(right[2] ?? 0)
  );
  const peakDb = Math.max(chDb[0], chDb[1]);

  const prevHold = state.peakHoldMap.get(primaryInputName) || { db: DIRECT_AUDIO_MIN_DB, ts: nowMs };
  let nextHoldDb = prevHold.db;
  let nextHoldTs = prevHold.ts;
  if (peakDb >= prevHold.db) {
    nextHoldDb = peakDb;
    nextHoldTs = nowMs;
  } else if (nowMs - prevHold.ts > DIRECT_AUDIO_PEAK_HOLD_MS) {
    const elapsedSec = (nowMs - prevHold.ts - DIRECT_AUDIO_PEAK_HOLD_MS) / 1000;
    nextHoldDb = Math.max(peakDb, Math.round((prevHold.db - elapsedSec * 14) * 10) / 10);
  }
  state.peakHoldMap.set(primaryInputName, { db: nextHoldDb, ts: nextHoldTs });

  const muted = Boolean(state.muteMap.get(primaryInputName));
  const clipping = !muted && (peakDb >= -1.5 || peakLinear >= 0.985);
  const readiness = evaluateAudioReadinessServer({
    obsConnected: true,
    inputName: primaryInputName,
    muted,
    peakDb,
    clipping,
  });

  return {
    obsConnected: true,
    primaryInputName,
    availableAudioInputs,
    channelsDb: chDb,
    magnitudeDb: magDb,
    peakDb,
    peakHoldDb: Math.max(DIRECT_AUDIO_MIN_DB, Math.min(0, nextHoldDb)),
    muted,
    clipping,
    ...readiness,
    updatedAtMs: nowMs,
  };
}

export const OBS_BRIDGE_HEARTBEAT_INTERVAL_MS = Math.max(
  2_000,
  Number(process.env.OBS_BRIDGE_HEARTBEAT_INTERVAL_MS) || 5_000
);
export const OBS_BRIDGE_HEARTBEAT_LOST_MS = Math.max(
  10_000,
  Number(process.env.OBS_BRIDGE_HEARTBEAT_LOST_MS) || 20_000
);
export const OBS_BRIDGE_HEARTBEAT_OFFLINE_MS = Math.max(
  20_000,
  Number(process.env.OBS_BRIDGE_HEARTBEAT_OFFLINE_MS) || 45_000
);
export const OBS_BRIDGE_DISCONNECT_GRACE_MS = Math.max(
  10_000,
  Number(process.env.OBS_BRIDGE_DISCONNECT_GRACE_MS) || 35_000
);

export type BridgeConnectionStateValue = 'CONNECTED' | 'RECONNECTING' | 'CONNECTION_LOST' | 'OFFLINE';

export function calculateExponentialBackoffMs(
  attempt: number,
  options: { baseMs?: number; factor?: number; maxMs?: number; jitterRatio?: number; randomFn?: () => number } = {}
): number {
  const baseMs = options.baseMs ?? 1500;
  const factor = options.factor ?? 1.8;
  const maxMs = options.maxMs ?? 30_000;
  const jitterRatio = options.jitterRatio ?? 0.2;
  const randomFn = options.randomFn ?? Math.random;
  const exp = Math.min(maxMs, Math.round(baseMs * Math.pow(factor, Math.max(0, attempt))));
  if (jitterRatio <= 0) return exp;
  const delta = exp * jitterRatio;
  return Math.max(500, Math.round(exp + (randomFn() * 2 - 1) * delta));
}

export interface BridgeHealthEntry {
  key: string;
  bridgeId?: string;
  matchIds: string[];
  socketConnected: boolean;
  lastHeartbeatAtMs: number;
  disconnectedAtMs: number | null;
  missedHeartbeats: number;
  state: BridgeConnectionStateValue;
  lastDisconnectReason: string;
  reconnectAttempts: number;
}

/**
 * Stateful tracker that enforces missed-heartbeat tolerance and grace windows:
 * - Never marks OFFLINE from a single missed heartbeat or transient socket hiccup
 * - Transitions CONNECTED -> RECONNECTING -> CONNECTION_LOST -> OFFLINE predictably
 */
export class BridgeHeartbeatTracker {
  private entries = new Map<string, BridgeHealthEntry>();
  private readonly heartbeatIntervalMs: number;
  private readonly connectionLostAfterMs: number;
  private readonly offlineAfterMs: number;
  private readonly persistUntilAdminDisconnect: boolean;

  constructor(opts?: {
    heartbeatIntervalMs?: number;
    connectionLostAfterMs?: number;
    offlineAfterMs?: number;
    persistUntilAdminDisconnect?: boolean;
  }) {
    this.heartbeatIntervalMs = opts?.heartbeatIntervalMs ?? OBS_BRIDGE_HEARTBEAT_INTERVAL_MS;
    this.connectionLostAfterMs = opts?.connectionLostAfterMs ?? OBS_BRIDGE_HEARTBEAT_LOST_MS;
    this.offlineAfterMs = opts?.offlineAfterMs ?? OBS_BRIDGE_HEARTBEAT_OFFLINE_MS;
    this.persistUntilAdminDisconnect = Boolean(opts?.persistUntilAdminDisconnect);
  }

  recordConnected(key: string, matchIds: string[], nowMs = Date.now(), bridgeId?: string): BridgeHealthEntry {
    const prev = this.entries.get(key);
    const entry: BridgeHealthEntry = {
      key,
      bridgeId: bridgeId || prev?.bridgeId,
      matchIds: [...matchIds],
      socketConnected: true,
      lastHeartbeatAtMs: nowMs,
      disconnectedAtMs: null,
      missedHeartbeats: 0,
      state: 'CONNECTED',
      lastDisconnectReason: '',
      reconnectAttempts: 0,
    };
    this.entries.set(key, entry);
    return { ...entry };
  }

  recordHeartbeat(key: string, nowMs = Date.now()): BridgeHealthEntry | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    entry.socketConnected = true;
    entry.lastHeartbeatAtMs = nowMs;
    entry.disconnectedAtMs = null;
    entry.missedHeartbeats = 0;
    entry.state = 'CONNECTED';
    entry.reconnectAttempts = 0;
    return { ...entry };
  }

  recordDisconnected(key: string, reason: string, nowMs = Date.now()): BridgeHealthEntry | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    entry.socketConnected = false;
    if (!entry.disconnectedAtMs) {
      entry.disconnectedAtMs = nowMs;
    }
    entry.lastDisconnectReason = reason || 'transport disconnected';
    entry.state = 'RECONNECTING';
    return { ...entry };
  }

  evaluateAll(nowMs = Date.now()): Array<{ key: string; prevState: BridgeConnectionStateValue; entry: BridgeHealthEntry }> {
    const transitions: Array<{ key: string; prevState: BridgeConnectionStateValue; entry: BridgeHealthEntry }> = [];
    for (const [key, entry] of this.entries.entries()) {
      const prevState = entry.state;
      const elapsedSinceHb = Math.max(0, nowMs - entry.lastHeartbeatAtMs);
      const elapsedSinceDisc = entry.disconnectedAtMs ? Math.max(0, nowMs - entry.disconnectedAtMs) : 0;
      const effectiveElapsed = entry.socketConnected ? elapsedSinceHb : Math.max(elapsedSinceHb, elapsedSinceDisc);

      entry.missedHeartbeats = Math.max(
        0,
        Math.floor(effectiveElapsed / this.heartbeatIntervalMs) - (entry.socketConnected ? 1 : 0)
      );

      let nextState: BridgeConnectionStateValue = entry.state;
      if (!this.persistUntilAdminDisconnect && effectiveElapsed >= this.offlineAfterMs) {
        nextState = 'OFFLINE';
      } else if (effectiveElapsed >= this.connectionLostAfterMs || entry.missedHeartbeats >= 3) {
        nextState = 'CONNECTION_LOST';
      } else if (!entry.socketConnected || entry.missedHeartbeats >= 1) {
        nextState = 'RECONNECTING';
      } else {
        nextState = 'CONNECTED';
      }

      if (nextState !== prevState) {
        entry.state = nextState;
        transitions.push({ key, prevState, entry: { ...entry } });
      }
    }
    return transitions;
  }

  getEntry(key: string): BridgeHealthEntry | null {
    const entry = this.entries.get(key);
    return entry ? { ...entry } : null;
  }

  remove(key: string): void {
    this.entries.delete(key);
  }
}

const bridgeHealthTracker = new BridgeHeartbeatTracker({
  persistUntilAdminDisconnect: true,
});
let heartbeatMonitorTimer: NodeJS.Timeout | null = null;
const bridgeDisconnectTimers = new Map<string, NodeJS.Timeout>();

function clearBridgeDisconnectTimer(key: string): void {
  const timer = bridgeDisconnectTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    bridgeDisconnectTimers.delete(key);
  }
}

function getBridgeTrackingKey(context: ObsAgentContext): string {
  return context.bridgeId ? `bridge:${context.bridgeId}` : `match:${context.matchId || ''}`;
}

function normalizeBridgeCapabilities(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const clean = item.trim().slice(0, 64);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 32) break;
  }
  return out;
}

function hasMediaMTXControlCapability(capabilities: unknown): boolean {
  const list = normalizeBridgeCapabilities(capabilities);
  return list.includes('mediamtx_control') || list.includes('mediamtx_start');
}

function acquireSceneSwitchGuard(matchId: string): void {
  const now = Date.now();
  const state = activeSceneSwitchLocks.get(matchId);
  if (state?.inFlight) {
    const err: any = new Error('An OBS scene transition is already in progress. Please wait a moment.');
    err.statusCode = 409;
    throw err;
  }
  if (state && now - state.lastSwitchAt < SCENE_SWITCH_COOLDOWN_MS) {
    const err: any = new Error('Switching too rapidly — waiting for OBS Studio to settle.');
    err.statusCode = 429;
    throw err;
  }
  activeSceneSwitchLocks.set(matchId, { inFlight: true, lastSwitchAt: now });
}

function releaseSceneSwitchGuard(matchId: string): void {
  const prev = activeSceneSwitchLocks.get(matchId);
  activeSceneSwitchLocks.set(matchId, {
    inFlight: false,
    lastSwitchAt: prev?.lastSwitchAt || Date.now(),
  });
}

async function resolveMatchIdsForContext(context: ObsAgentContext): Promise<string[]> {
  if (context.bridgeId) {
    const bridge = await ObsBridge.findOne({ bridgeId: context.bridgeId }).lean();
    if (!bridge || bridge.status === 'REVOKED') return [];
    const set = new Set<string>();
    for (const id of bridge.assignedMatchIds || []) {
      const s = String(id);
      if (mongoose.Types.ObjectId.isValid(s)) set.add(s);
    }
    if (bridge.activeMatchId) {
      const s = String(bridge.activeMatchId);
      if (mongoose.Types.ObjectId.isValid(s)) set.add(s);
    }
    if (context.matchId && mongoose.Types.ObjectId.isValid(context.matchId) && set.size === 0) {
      set.add(context.matchId);
    }
    return Array.from(set);
  }
  if (context.matchId && mongoose.Types.ObjectId.isValid(context.matchId)) {
    return [context.matchId];
  }
  return [];
}

async function resolveAgentSocketForMatch(
  matchId: string
): Promise<{ socket: IoSocket; bridgeId: string | null } | null> {
  const directMatchAgent = agentSockets.get(matchId);
  if (directMatchAgent && directMatchAgent.connected) {
    return { socket: directMatchAgent, bridgeId: null };
  }

  const onlineBridges = await ObsBridge.find({
    status: 'ACTIVE',
    $or: [{ assignedMatchIds: matchId }, { activeMatchId: matchId }],
  })
    .sort({ lastConnectedAt: -1 })
    .lean();

  for (const br of onlineBridges) {
    const sock = bridgeSockets.get(br.bridgeId);
    if (sock && sock.connected) {
      return { socket: sock, bridgeId: br.bridgeId };
    }
  }

  for (const [bridgeId, sock] of bridgeSockets.entries()) {
    if (!sock.connected) continue;
    const ctx = (sock.data as any)?.obsContext as ObsAgentContext | undefined;
    if (ctx?.matchIds?.includes(matchId) || ctx?.matchId === matchId) {
      return { socket: sock, bridgeId };
    }
  }

  return null;
}

export async function isMatchBridgeOnline(matchId: string): Promise<boolean> {
  const resolved = await resolveAgentSocketForMatch(matchId);
  return Boolean(resolved);
}

function isMatchBridgeOnlineSync(matchId: string): boolean {
  const directMatchAgent = agentSockets.get(matchId);
  if (directMatchAgent && directMatchAgent.connected) return true;
  const directHealth = bridgeHealthTracker.getEntry(`match:${matchId}`);
  if (directHealth && (directHealth.state === 'RECONNECTING' || directHealth.state === 'CONNECTION_LOST')) {
    return true;
  }
  for (const [bridgeId, sock] of bridgeSockets.entries()) {
    const ctx = (sock.data as any)?.obsContext as ObsAgentContext | undefined;
    if (ctx?.matchIds?.includes(matchId) || ctx?.matchId === matchId) {
      if (sock.connected) return true;
      const health = bridgeHealthTracker.getEntry(`bridge:${bridgeId}`);
      if (health && health.state !== 'OFFLINE') return true;
    }
  }
  return false;
}

function getLiveMatchBridgeContextSync(matchId: string): ObsAgentContext | null {
  const directMatchAgent = agentSockets.get(matchId);
  if (directMatchAgent && directMatchAgent.connected) {
    return ((directMatchAgent.data as any)?.obsContext as ObsAgentContext | undefined) || null;
  }
  for (const sock of bridgeSockets.values()) {
    if (!sock.connected) continue;
    const ctx = (sock.data as any)?.obsContext as ObsAgentContext | undefined;
    if (ctx?.matchIds?.includes(matchId) || ctx?.matchId === matchId) {
      return ctx || null;
    }
  }
  return null;
}

function emitObsStateEvents(
  matchId: string,
  prevStatus: string,
  nextStatus: string,
  prevScenes: string[],
  nextScenes: string[] | undefined,
  prevActiveScene: string,
  nextActiveScene: string
) {
  if (prevStatus !== 'CONNECTED' && nextStatus === 'CONNECTED') {
    emitBroadcastStudioEvent(matchId, 'OBS_CONNECTED', {
      matchId,
      activeObsScene: nextActiveScene || prevActiveScene,
      obsScenes: nextScenes || prevScenes,
    });
  } else if (prevStatus === 'CONNECTED' && nextStatus !== 'CONNECTED' && nextStatus !== 'RECONNECTING' && nextStatus !== 'CONNECTION_LOST') {
    emitBroadcastStudioEvent(matchId, 'OBS_DISCONNECTED', {
      matchId,
      connectionStatus: nextStatus,
    });
  }

  if (Array.isArray(nextScenes)) {
    const prevKey = prevScenes.join('\u0000');
    const nextKey = nextScenes.join('\u0000');
    if (prevKey !== nextKey) {
      emitBroadcastStudioEvent(matchId, 'SCENE_LIST_UPDATED', {
        matchId,
        obsScenes: nextScenes,
        activeObsScene: nextActiveScene || prevActiveScene,
      });
    }
  }

  if (nextActiveScene && nextActiveScene !== prevActiveScene) {
    emitBroadcastStudioEvent(matchId, 'CURRENT_SCENE_CHANGED', {
      matchId,
      previousScene: prevActiveScene,
      activeObsScene: nextActiveScene,
    });
  }
}

export function disconnectBridgeSocket(bridgeId: string, reason = 'Bridge revoked by Administrator'): void {
  clearBridgeDisconnectTimer(`bridge:${bridgeId}`);
  bridgeHealthTracker.remove(`bridge:${bridgeId}`);
  const sock = bridgeSockets.get(bridgeId);
  if (sock) {
    try {
      sock.emit('server:bridge_revoked', { bridgeId, reason });
      sock.disconnect(true);
    } catch {
      // Ignore disconnect error
    }
    bridgeSockets.delete(bridgeId);
  }
}

export function initObsControllerBridge(): void {
  registerObsAgentHandlers({
    verifyAgentHandshake: async (auth) => {
      if (auth.bridgeId && auth.bridgeToken) {
        const bridge = await ObsBridge.findOne({ bridgeId: auth.bridgeId })
          .select('+tokenHash')
          .lean();
        if (!bridge) {
          return { ok: false, reason: 'Registered Bridge ID not found.' };
        }
        if (bridge.status === 'REVOKED') {
          return { ok: false, reason: 'This Windows OBS Bridge has been revoked by Administrator.' };
        }
        if (!verifyScopedToken(auth.bridgeToken, bridge.tokenHash)) {
          return { ok: false, reason: 'Invalid Bridge Token.' };
        }
        if (bridge.manualDisconnect && !auth.manualResume) {
          return {
            ok: false,
            reason:
              'Bridge was disconnected by Administrator from Control Room. Click Reconnect in OBS Bridge to resume.',
          };
        }
        const matchIds = Array.from(
          new Set(
            [...(bridge.assignedMatchIds || []).map(String), bridge.activeMatchId ? String(bridge.activeMatchId) : '']
              .filter((id) => mongoose.Types.ObjectId.isValid(id))
          )
        );
        return {
          ok: true,
          context: {
            bridgeId: bridge.bridgeId,
            matchId: matchIds[0] || undefined,
            matchIds,
            label: auth.label || bridge.label || bridge.name,
            platform: auth.platform || bridge.platform || 'win32',
            bridgeVersion: typeof auth.bridgeVersion === 'string' ? auth.bridgeVersion.trim().slice(0, 40) : '',
            capabilities: normalizeBridgeCapabilities(auth.capabilities),
          },
        };
      }

      if (auth.matchId && auth.agentToken) {
        if (!mongoose.Types.ObjectId.isValid(auth.matchId)) {
          return { ok: false, reason: 'Invalid match ID.' };
        }
        const profile = await ObsControllerProfile.findOne({ matchId: auth.matchId })
          .select('+agentTokenHash')
          .lean();
        if (!profile || !profile.agentTokenHash) {
          return { ok: false, reason: 'Agent token not initialized for this match.' };
        }
        if (!verifyScopedToken(auth.agentToken, profile.agentTokenHash)) {
          return { ok: false, reason: 'Invalid OBS agent token for this match.' };
        }
        return {
          ok: true,
          context: {
            matchId: auth.matchId,
            matchIds: [auth.matchId],
            label: auth.label || 'Local OBS Agent',
            platform: auth.platform || 'win32',
            bridgeVersion: typeof auth.bridgeVersion === 'string' ? auth.bridgeVersion.trim().slice(0, 40) : '',
            capabilities: normalizeBridgeCapabilities(auth.capabilities),
          },
        };
      }

      return { ok: false, reason: 'Provide bridgeId + bridgeToken or matchId + agentToken.' };
    },
    onAgentConnected: async (socket: IoSocket, context: ObsAgentContext) => {
      const normalizedCaps = normalizeBridgeCapabilities(context.capabilities);
      const normalizedVer = typeof context.bridgeVersion === 'string' ? context.bridgeVersion.trim().slice(0, 40) : '';
      const trackingKey = getBridgeTrackingKey(context);
      clearBridgeDisconnectTimer(trackingKey);

      const matchIds = await resolveMatchIdsForContext(context);
      (socket.data as any).obsContext = { ...context, matchIds };
      bridgeHealthTracker.recordConnected(trackingKey, matchIds, Date.now(), context.bridgeId);

      if (context.bridgeId) {
        const previousSocket = bridgeSockets.get(context.bridgeId);
        if (previousSocket && previousSocket.id !== socket.id) {
          console.info(`[OBSBridge] Replacing stale socket ${previousSocket.id} for bridge ${context.bridgeId} with ${socket.id}`);
          try {
            previousSocket.disconnect(true);
          } catch {
            // Ignore cleanup failure on superseded socket
          }
        }
        bridgeSockets.set(context.bridgeId, socket);
        await ObsBridge.findOneAndUpdate(
          { bridgeId: context.bridgeId },
          {
            $set: {
              connectionStatus: 'ONLINE',
              bridgeConnectionState: 'CONNECTED',
              missedHeartbeats: 0,
              lastDisconnectReason: '',
              reconnectAttempts: 0,
              manualDisconnect: false,
              manualDisconnectedAt: null,
              manualDisconnectedBy: '',
              lastConnectedAt: new Date(),
              lastHeartbeatAt: new Date(),
              lastError: '',
              platform: context.platform || 'win32',
              bridgeVersion: normalizedVer,
              bridgeCapabilities: normalizedCaps,
              ...(context.label ? { label: context.label } : {}),
            },
            $push: {
              diagnosticLogs: {
                $each: [
                  {
                    timestamp: new Date(),
                    level: 'info',
                    category: 'bridge_connected',
                    message: `Bridge connected cleanly (${socket.id}).`,
                    reason: 'connected',
                  },
                ],
                $slice: -30,
              },
            },
          }
        );
      } else if (context.matchId) {
        const previousSocket = agentSockets.get(context.matchId);
        if (previousSocket && previousSocket.id !== socket.id) {
          try {
            previousSocket.disconnect(true);
          } catch {
            // Ignore cleanup failure
          }
        }
        agentSockets.set(context.matchId, socket);
      }

      for (const mid of matchIds) {
        const curProfile = await ObsControllerProfile.findOne({ matchId: mid }).lean();
        await ObsControllerProfile.findOneAndUpdate(
          { matchId: mid },
          {
            $set: {
              connectionMode: 'local_agent',
              agentOnline: true,
              bridgeConnectionState: 'CONNECTED',
              missedHeartbeats: 0,
              lastDisconnectReason: '',
              reconnectAttempts: 0,
              agentLastSeenAt: new Date(),
              agentLabel: context.label || 'Local OBS Bridge',
              bridgeVersion: normalizedVer,
              bridgeCapabilities: normalizedCaps,
              lastError: '',
              ...(curProfile?.manualDisconnect
                ? {}
                : {
                    desiredConnected: true,
                    manualDisconnect: false,
                    manualDisconnectedAt: null,
                    manualDisconnectedBy: '',
                  }),
            },
          },
          { new: true }
        );
        await writeBroadcastAudit({
          matchId: mid,
          actionType: 'AGENT_CONNECTED',
          userName: context.label || 'Local OBS Bridge',
          userRole: 'AGENT',
          obsStatus: 'SUCCESS',
          metadata: context.bridgeId ? { bridgeId: context.bridgeId } : null,
        });
        emitBroadcastStudioEvent(mid, 'BRIDGE_CONNECTED', {
          matchId: mid,
          bridgeId: context.bridgeId || null,
          label: context.label,
          bridgeConnectionState: 'CONNECTED',
        });
        await emitFullStudioState(mid);
      }
    },
    onAgentDisconnected: async (socket: IoSocket, context: ObsAgentContext, reason: string) => {
      const trackingKey = getBridgeTrackingKey(context);
      if (context.bridgeId) {
        const current = bridgeSockets.get(context.bridgeId);
        if (current && current.id !== socket.id) return;
        bridgeSockets.delete(context.bridgeId);
      } else if (context.matchId) {
        const current = agentSockets.get(context.matchId);
        if (current && current.id !== socket.id) return;
        agentSockets.delete(context.matchId);
      }

      // Never override an explicit Admin disconnect or revocation with RECONNECTING noise
      if (context.bridgeId) {
        const existingBridge: any = await ObsBridge.findOne({ bridgeId: context.bridgeId }).lean();
        if (existingBridge && (existingBridge.status === 'REVOKED' || existingBridge.manualDisconnect)) {
          bridgeHealthTracker.remove(trackingKey);
          clearBridgeDisconnectTimer(trackingKey);
          return;
        }
      }

      const disconnectReason = String(reason || 'transport closed');
      console.warn(
        `[OBSBridge] Socket dropped (${context.bridgeId || context.matchId || 'agent'}) reason="${disconnectReason}" — keeping session alive in RECONNECTING mode until Admin disconnects`
      );
      bridgeHealthTracker.recordDisconnected(trackingKey, disconnectReason);

      const matchIds =
        Array.isArray(context.matchIds) && context.matchIds.length > 0
          ? context.matchIds
          : context.matchId
            ? [context.matchId]
            : [];

      // Transition to RECONNECTING immediately without wiping active YouTube/OBS stream flags
      if (context.bridgeId) {
        await ObsBridge.findOneAndUpdate(
          { bridgeId: context.bridgeId, manualDisconnect: { $ne: true }, status: { $ne: 'REVOKED' } },
          {
            $set: {
              connectionStatus: 'RECONNECTING',
              bridgeConnectionState: 'RECONNECTING',
              lastDisconnectedAt: new Date(),
              lastDisconnectReason: disconnectReason,
              lastError: `Temporary interruption (${disconnectReason}). Auto-reconnecting...`,
            },
            $push: {
              diagnosticLogs: {
                $each: [
                  {
                    timestamp: new Date(),
                    level: 'warn',
                    category: 'disconnect_reason',
                    message: `Bridge transport interrupted (${disconnectReason}); auto-reconnecting (never auto-disconnects unless Admin disconnects).`,
                    reason: disconnectReason,
                  },
                ],
                $slice: -30,
              },
            },
          }
        );
      }

      for (const mid of matchIds) {
        await ObsControllerProfile.findOneAndUpdate(
          { matchId: mid, connectionMode: 'local_agent', manualDisconnect: { $ne: true } },
          {
            $set: {
              bridgeConnectionState: 'RECONNECTING',
              lastDisconnectReason: disconnectReason,
              lastError: `Bridge reconnecting (${disconnectReason})...`,
            },
          }
        );
        emitBroadcastStudioEvent(mid, 'BRIDGE_RECONNECTING', {
          matchId: mid,
          bridgeId: context.bridgeId || null,
          reason: disconnectReason,
          bridgeConnectionState: 'RECONNECTING',
        });
        await emitFullStudioState(mid);
      }

      // Escalate diagnostic state to CONNECTION_LOST after grace period, NEVER auto-disconnecting to OFFLINE/DISCONNECTED
      clearBridgeDisconnectTimer(trackingKey);
      const persistLostStateTimer = setTimeout(async () => {
        bridgeDisconnectTimers.delete(trackingKey);
        if (context.bridgeId && bridgeSockets.get(context.bridgeId)?.connected) return;
        if (context.matchId && agentSockets.get(context.matchId)?.connected) return;

        if (context.bridgeId) {
          const br: any = await ObsBridge.findOne({ bridgeId: context.bridgeId }).lean();
          if (!br || br.status === 'REVOKED' || br.manualDisconnect) return;
          await ObsBridge.findOneAndUpdate(
            { bridgeId: context.bridgeId },
            {
              $set: {
                connectionStatus: 'CONNECTION_LOST',
                bridgeConnectionState: 'CONNECTION_LOST',
                obsStatus: 'CONNECTION_LOST',
                obsConnectionState: 'CONNECTION_LOST',
                lastDisconnectedAt: new Date(),
                lastDisconnectReason: disconnectReason,
                lastError: `Bridge reconnecting (${disconnectReason}) — awaiting automatic recovery.`,
              },
            }
          );
        }

        for (const mid of matchIds) {
          const stillHasOnlineBridge = await isMatchBridgeOnline(mid);
          if (stillHasOnlineBridge) continue;

          const profile = await ObsControllerProfile.findOne({ matchId: mid });
          if (profile && profile.connectionMode === 'local_agent' && !profile.manualDisconnect) {
            profile.bridgeConnectionState = 'CONNECTION_LOST';
            if (profile.connectionStatus === 'CONNECTED' || profile.connectionStatus === 'RECONNECTING' || profile.desiredConnected) {
              profile.connectionStatus = 'CONNECTION_LOST';
            }
            profile.lastDisconnectReason = disconnectReason;
            profile.lastError = `Local OBS Bridge reconnecting (${disconnectReason}) — will stay linked until Admin disconnects.`;
            await profile.save();
          }
          emitBroadcastStudioEvent(mid, 'BRIDGE_HEALTH_CHANGED', {
            matchId: mid,
            bridgeId: context.bridgeId || null,
            bridgeConnectionState: 'CONNECTION_LOST',
            reason: disconnectReason,
            manualDisconnect: false,
          });
          await emitFullStudioState(mid);
        }
      }, OBS_BRIDGE_DISCONNECT_GRACE_MS);
      persistLostStateTimer.unref?.();
      bridgeDisconnectTimers.set(trackingKey, persistLostStateTimer);
    },
    onAgentHeartbeat: async (context: ObsAgentContext, payload: Record<string, any>) => {
      const trackingKey = getBridgeTrackingKey(context);
      const prevEntry = bridgeHealthTracker.getEntry(trackingKey);
      const matchIds =
        Array.isArray(context.matchIds) && context.matchIds.length > 0
          ? context.matchIds
          : await resolveMatchIdsForContext(context);
      if (!prevEntry) {
        bridgeHealthTracker.recordConnected(trackingKey, matchIds, Date.now(), context.bridgeId);
      } else {
        bridgeHealthTracker.recordHeartbeat(trackingKey, Date.now());
      }
      clearBridgeDisconnectTimer(trackingKey);

      const obsState =
        typeof payload.obsConnectionState === 'string'
          ? (payload.obsConnectionState as BridgeConnectionStateValue)
          : payload.obsConnected
            ? 'CONNECTED'
            : undefined;
      const reconnectAttempts = Number.isFinite(Number(payload.reconnectAttempts))
        ? Number(payload.reconnectAttempts)
        : 0;

      if (context.bridgeId) {
        const updateSet: Record<string, any> = {
          connectionStatus: 'ONLINE',
          bridgeConnectionState: 'CONNECTED',
          missedHeartbeats: 0,
          reconnectAttempts,
          lastHeartbeatAt: new Date(),
        };
        if (obsState) {
          updateSet.obsConnectionState = obsState;
        }
        await ObsBridge.findOneAndUpdate({ bridgeId: context.bridgeId }, { $set: updateSet });
      }
      for (const mid of matchIds) {
        await ObsControllerProfile.findOneAndUpdate(
          { matchId: mid, connectionMode: 'local_agent' },
          {
            $set: {
              agentOnline: true,
              bridgeConnectionState: 'CONNECTED',
              missedHeartbeats: 0,
              agentLastSeenAt: new Date(),
            },
          }
        );
      }
    },
    onAgentDiagnostic: async (context: ObsAgentContext, payload: Record<string, any>) => {
      if (!context.bridgeId) return;
      const logItem = {
        timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
        level: String(payload.level || 'info').slice(0, 20),
        category: String(payload.category || 'diagnostic').slice(0, 60),
        message: String(payload.message || '').slice(0, 400),
        reason: String(payload.reason || '').slice(0, 200),
      };
      await ObsBridge.findOneAndUpdate(
        { bridgeId: context.bridgeId },
        {
          $set: {
            ...(logItem.reason ? { lastDisconnectReason: logItem.reason } : {}),
            ...(Number.isFinite(Number(payload.reconnectAttempts))
              ? { reconnectAttempts: Number(payload.reconnectAttempts), lastReconnectAttemptAt: new Date() }
              : {}),
          },
          $push: {
            diagnosticLogs: {
              $each: [logItem],
              $slice: -30,
            },
          },
        }
      );
    },
    onAgentStateUpdate: async (context: ObsAgentContext, payload: Record<string, any>) => {
      const trackingKey = getBridgeTrackingKey(context);
      bridgeHealthTracker.recordHeartbeat(trackingKey, Date.now());
      const isManualObsDisconnect = payload.manualDisconnect === true;
      let status =
        payload.connectionStatus === 'CONNECTED'
          ? 'CONNECTED'
          : payload.connectionStatus === 'CONNECTING'
            ? 'CONNECTING'
            : payload.connectionStatus === 'RECONNECTING'
              ? 'RECONNECTING'
              : payload.connectionStatus === 'CONNECTION_LOST'
                ? 'CONNECTION_LOST'
                : payload.connectionStatus === 'ERROR'
                  ? 'ERROR'
                  : isManualObsDisconnect
                    ? 'DISCONNECTED'
                    : 'RECONNECTING';
      const explicitObsState: BridgeConnectionStateValue =
        payload.obsConnectionState === 'CONNECTED' ||
        payload.obsConnectionState === 'RECONNECTING' ||
        payload.obsConnectionState === 'CONNECTION_LOST' ||
        payload.obsConnectionState === 'OFFLINE'
          ? payload.obsConnectionState === 'OFFLINE' && !isManualObsDisconnect
            ? 'CONNECTION_LOST'
            : payload.obsConnectionState
          : status === 'CONNECTED'
            ? 'CONNECTED'
            : status === 'CONNECTING' || status === 'RECONNECTING'
              ? 'RECONNECTING'
              : status === 'CONNECTION_LOST'
                ? 'CONNECTION_LOST'
                : 'OFFLINE';

      const activeObsScene = typeof payload.activeObsScene === 'string' ? payload.activeObsScene : '';
      const obsScenes = Array.isArray(payload.obsScenes)
        ? payload.obsScenes.filter((s: unknown): s is string => typeof s === 'string')
        : undefined;

      const mediamtxPayload =
        payload.mediamtx && typeof payload.mediamtx === 'object' ? payload.mediamtx : null;
      const obsMediaStates =
        payload.obsMediaStates && typeof payload.obsMediaStates === 'object'
          ? (payload.obsMediaStates as Record<string, string>)
          : null;
      const reportedBridgeVersion =
        typeof payload.bridgeVersion === 'string'
          ? payload.bridgeVersion.trim().slice(0, 40)
          : undefined;
      const reportedCapabilities = Array.isArray(payload.capabilities)
        ? normalizeBridgeCapabilities(payload.capabilities)
        : undefined;

      if (context.bridgeId) {
        const liveSock = bridgeSockets.get(context.bridgeId);
        if (liveSock) {
          const prevCtx = ((liveSock.data as any).obsContext || context) as ObsAgentContext;
          (liveSock.data as any).obsContext = {
            ...prevCtx,
            ...(reportedBridgeVersion !== undefined ? { bridgeVersion: reportedBridgeVersion } : {}),
            ...(reportedCapabilities !== undefined ? { capabilities: reportedCapabilities } : {}),
          };
        }
        const br = await ObsBridge.findOne({ bridgeId: context.bridgeId }).lean();
        if (!br || br.status === 'REVOKED') {
          disconnectBridgeSocket(context.bridgeId, 'Bridge revoked');
          return;
        }
        const bridgeUpdate: Record<string, any> = {
          connectionStatus: 'ONLINE',
          bridgeConnectionState: 'CONNECTED',
          missedHeartbeats: 0,
          obsStatus: status,
          obsConnectionState: explicitObsState,
          lastHeartbeatAt: new Date(),
          lastError: typeof payload.lastError === 'string' ? payload.lastError.slice(0, 500) : '',
        };
        if (reportedBridgeVersion !== undefined) {
          bridgeUpdate.bridgeVersion = reportedBridgeVersion;
        }
        if (reportedCapabilities !== undefined) {
          bridgeUpdate.bridgeCapabilities = reportedCapabilities;
        }
        if (typeof payload.obsVersion === 'string') bridgeUpdate.obsVersion = payload.obsVersion;
        if (typeof payload.obsWebSocketVersion === 'string') {
          bridgeUpdate.obsWebSocketVersion = payload.obsWebSocketVersion;
        }
        if (activeObsScene) bridgeUpdate.activeObsScene = activeObsScene;
        if (obsScenes) bridgeUpdate.obsScenes = obsScenes;
        if (typeof payload.previewObsScene === 'string') {
          bridgeUpdate.previewObsScene = payload.previewObsScene;
        }
        if (typeof payload.studioModeEnabled === 'boolean') {
          bridgeUpdate.studioModeEnabled = payload.studioModeEnabled;
        }
        if (typeof payload.currentTransitionName === 'string') {
          bridgeUpdate.currentTransitionName = payload.currentTransitionName;
        }
        if (Number.isFinite(Number(payload.currentTransitionDurationMs))) {
          bridgeUpdate.currentTransitionDurationMs = Math.max(
            0,
            Math.min(5000, Math.round(Number(payload.currentTransitionDurationMs)))
          );
        }
        if (Array.isArray(payload.obsTransitions)) {
          bridgeUpdate.obsTransitions = payload.obsTransitions
            .filter((t: any) => t && typeof t.transitionName === 'string' && t.transitionName.trim())
            .slice(0, 30)
            .map((t: any) => ({
              transitionName: String(t.transitionName).trim().slice(0, 120),
              transitionKind: String(t.transitionKind || '').trim().slice(0, 80),
              transitionFixed: Boolean(t.transitionFixed),
            }));
        }
        if (typeof payload.primaryAudioInput === 'string') {
          bridgeUpdate.primaryAudioInput = payload.primaryAudioInput;
        }
        if (payload.audioMeter && typeof payload.audioMeter === 'object') {
          latestAudioMeterByBridge.set(context.bridgeId, payload.audioMeter);
        }
        if (typeof payload.obsStreamActive === 'boolean' && (status === 'CONNECTED' || payload.obsStreamActive)) {
          bridgeUpdate.obsStreamActive = payload.obsStreamActive;
        }
        if (Number.isFinite(Number(payload.reconnectAttempts))) {
          bridgeUpdate.reconnectAttempts = Number(payload.reconnectAttempts);
        }
        if (mediamtxPayload) {
          bridgeUpdate.mediamtxState = mediamtxPayload;
        }
        await ObsBridge.findOneAndUpdate({ bridgeId: context.bridgeId }, { $set: bridgeUpdate });
      } else if (context.matchId) {
        const liveSock = agentSockets.get(context.matchId);
        if (liveSock) {
          const prevCtx = ((liveSock.data as any).obsContext || context) as ObsAgentContext;
          (liveSock.data as any).obsContext = {
            ...prevCtx,
            ...(reportedBridgeVersion !== undefined ? { bridgeVersion: reportedBridgeVersion } : {}),
            ...(reportedCapabilities !== undefined ? { capabilities: reportedCapabilities } : {}),
          };
        }
      }

      const matchIds = await resolveMatchIdsForContext(context);
      for (const mid of matchIds) {
        const prev = await ObsControllerProfile.findOne({ matchId: mid }).lean();
        const prevStatus = prev?.connectionStatus || 'DISCONNECTED';
        const prevScenes = Array.isArray(prev?.obsScenes) ? prev.obsScenes : [];
        const prevActiveScene = prev?.activeObsScene || '';
        const effectiveProfileStatus =
          prev?.manualDisconnect && !isManualObsDisconnect && status !== 'CONNECTED'
            ? 'DISCONNECTED'
            : status;

        const updateFields: Record<string, any> = {
          connectionMode: 'local_agent',
          agentOnline: true,
          bridgeConnectionState: 'CONNECTED',
          missedHeartbeats: 0,
          agentLastSeenAt: new Date(),
          connectionStatus: effectiveProfileStatus,
          lastError: typeof payload.lastError === 'string' ? payload.lastError : '',
          lastSyncedAt: new Date(),
          ...(effectiveProfileStatus === 'CONNECTED'
            ? {
                desiredConnected: true,
                manualDisconnect: false,
                manualDisconnectedAt: null,
                manualDisconnectedBy: '',
              }
            : isManualObsDisconnect
              ? {
                  desiredConnected: false,
                  manualDisconnect: true,
                }
              : {}),
        };
        if (context.label) updateFields.agentLabel = context.label;
        if (reportedBridgeVersion !== undefined) {
          updateFields.bridgeVersion = reportedBridgeVersion;
        }
        if (reportedCapabilities !== undefined) {
          updateFields.bridgeCapabilities = reportedCapabilities;
        }
        if (typeof payload.obsVersion === 'string') updateFields.obsVersion = payload.obsVersion;
        if (typeof payload.obsWebSocketVersion === 'string') {
          updateFields.obsWebSocketVersion = payload.obsWebSocketVersion;
        }
        if (activeObsScene || (status !== 'CONNECTED' && status !== 'RECONNECTING' && status !== 'CONNECTING')) {
          updateFields.activeObsScene = status === 'CONNECTED' ? activeObsScene : prevActiveScene;
        }
        if (obsScenes) updateFields.obsScenes = obsScenes;
        const normalizedInputs: Array<{
          inputName: string;
          inputKind: string;
          unversionedInputKind: string;
        }> = Array.isArray(payload.obsInputs)
          ? payload.obsInputs
              .filter((inp: any) => inp && typeof inp.inputName === 'string' && inp.inputName.trim())
              .slice(0, 100)
              .map((inp: any) => ({
                inputName: String(inp.inputName).trim().slice(0, 140),
                inputKind: String(inp.inputKind || '').trim().slice(0, 80),
                unversionedInputKind: String(inp.unversionedInputKind || '').trim().slice(0, 80),
              }))
          : [];
        if (Array.isArray(payload.obsInputs)) {
          updateFields.obsInputs = normalizedInputs;
        }
        if (mediamtxPayload) {
          updateFields.mediamtxState = mediamtxPayload;
        }
        const preservedStatus =
          (status === 'RECONNECTING' || status === 'CONNECTION_LOST' || status === 'DISCONNECTED') &&
          prev?.obsStreamActive &&
          payload.obsStreamActive !== false
            ? prev.obsStreamActive
            : undefined;
        if (typeof payload.obsStreamActive === 'boolean' && (status === 'CONNECTED' || payload.obsStreamActive)) {
          updateFields.obsStreamActive = payload.obsStreamActive;
        } else if (preservedStatus !== undefined) {
          updateFields.obsStreamActive = preservedStatus;
        }
        if (typeof payload.obsStreamTimecode === 'string') {
          updateFields.obsStreamTimecode = payload.obsStreamTimecode;
        }
        if (typeof payload.obsStreamBytes === 'number' || payload.obsStreamBytes === null) {
          updateFields.obsStreamBytes = payload.obsStreamBytes;
        }
        if (typeof payload.obsStreamDurationMs === 'number' || payload.obsStreamDurationMs === null) {
          updateFields.obsStreamDurationMs = payload.obsStreamDurationMs;
        }
        if (typeof payload.obsRecordActive === 'boolean') {
          updateFields.obsRecordActive = payload.obsRecordActive;
        }
        if (typeof payload.obsRecordTimecode === 'string') {
          updateFields.obsRecordTimecode = payload.obsRecordTimecode;
        }
        if (payload.obsStats && typeof payload.obsStats === 'object') {
          updateFields.obsStats = payload.obsStats;
        }
        if (typeof payload.previewObsScene === 'string') {
          updateFields.previewObsScene = payload.previewObsScene;
        }
        if (typeof payload.studioModeEnabled === 'boolean') {
          updateFields.studioModeEnabled = payload.studioModeEnabled;
        }
        if (typeof payload.currentTransitionName === 'string') {
          updateFields.currentTransitionName = payload.currentTransitionName;
        }
        if (Number.isFinite(Number(payload.currentTransitionDurationMs))) {
          updateFields.currentTransitionDurationMs = Math.max(
            0,
            Math.min(5000, Math.round(Number(payload.currentTransitionDurationMs)))
          );
        }
        if (Array.isArray(payload.obsTransitions)) {
          updateFields.obsTransitions = payload.obsTransitions
            .filter((t: any) => t && typeof t.transitionName === 'string' && t.transitionName.trim())
            .slice(0, 30)
            .map((t: any) => ({
              transitionName: String(t.transitionName).trim().slice(0, 120),
              transitionKind: String(t.transitionKind || '').trim().slice(0, 80),
              transitionFixed: Boolean(t.transitionFixed),
            }));
        }
        if (typeof payload.primaryAudioInput === 'string') {
          updateFields.primaryAudioInput = payload.primaryAudioInput;
        }
        if (payload.audioMeter && typeof payload.audioMeter === 'object') {
          latestAudioMeterByMatch.set(mid, payload.audioMeter);
        }

        await ObsControllerProfile.findOneAndUpdate({ matchId: mid }, { $set: updateFields }, { new: true });

        // Sync OBS input presence and local MediaMTX active ingest paths onto cameras
        if (Array.isArray(payload.obsInputs) || mediamtxPayload || obsMediaStates) {
          const inputSet = new Set(normalizedInputs.map((i) => i.inputName));
          const activeMtxPaths = new Set<string>(
            mediamtxPayload && mediamtxPayload.apiReachable && Array.isArray(mediamtxPayload.activePaths)
              ? mediamtxPayload.activePaths
                  .filter((p: any) => p && p.ready && typeof p.name === 'string')
                  .map((p: any) => p.name.replace(/^\/+/, ''))
              : []
          );
          const cams = await BroadcastCamera.find({ matchId: mid });
          for (const cam of cams) {
            let dirty = false;
            const targetInput = cam.obsInputName?.trim() || `ML_CAM_${cam.cameraNumber}`;
            if (Array.isArray(payload.obsInputs)) {
              const presentInObs = status === 'CONNECTED' && inputSet.has(targetInput);
              if (Boolean(cam.obsSourceAvailable) !== presentInObs) {
                cam.obsSourceAvailable = presentInObs;
                if (presentInObs) cam.obsSourceConfigured = true;
                dirty = true;
              }
            }
            if (obsMediaStates && typeof obsMediaStates[targetInput] === 'string') {
              const nextMediaState = String(obsMediaStates[targetInput]).slice(0, 40);
              if (cam.obsMediaState !== nextMediaState) {
                cam.obsMediaState = nextMediaState;
                dirty = true;
              }
            }
            if (
              cam.sourceType === 'mediamtx' &&
              mediamtxPayload &&
              mediamtxPayload.apiReachable &&
              cam.mediamtxStreamPath &&
              !cam.mediamtxRevoked
            ) {
              const cleanCamPath = cam.mediamtxStreamPath.replace(/^\/+/, '');
              const publisherLive = activeMtxPaths.has(cleanCamPath);
              if (publisherLive) {
                if (!cam.mediamtxPublisherConnected) {
                  cam.mediamtxLastConnectedAt = new Date();
                }
                cam.mediamtxPublisherConnected = true;
                cam.mediamtxDisconnectedAt = null;
                cam.lastHeartbeatAt = new Date();
                cam.lastError = '';
                dirty = true;
              } else if (cam.mediamtxPublisherConnected) {
                cam.mediamtxPublisherConnected = false;
                cam.mediamtxDisconnectedAt = new Date();
                dirty = true;
              }
            }
            if (dirty) {
              await cam.save();
            }
          }
        }

        if (activeObsScene && status === 'CONNECTED') {
          await reconcileCameraActiveStates(mid, activeObsScene);
        } else if (status !== 'CONNECTED' && status !== 'RECONNECTING' && status !== 'CONNECTING' && status !== 'CONNECTION_LOST') {
          await reconcileCameraActiveStates(mid, '');
        }

        emitObsStateEvents(mid, prevStatus, status, prevScenes, obsScenes, prevActiveScene, activeObsScene);
        await emitFullStudioState(mid);
      }
    },
    onAgentError: async (context: ObsAgentContext, errorMessage: string) => {
      if (context.bridgeId) {
        await ObsBridge.findOneAndUpdate(
          { bridgeId: context.bridgeId },
          {
            $set: {
              obsStatus: 'RECONNECTING',
              obsConnectionState: 'RECONNECTING',
              lastError: errorMessage.slice(0, 500),
              lastHeartbeatAt: new Date(),
            },
            $push: {
              diagnosticLogs: {
                $each: [
                  {
                    timestamp: new Date(),
                    level: 'warn',
                    category: 'ws_error',
                    message: errorMessage.slice(0, 400),
                    reason: 'obs_error',
                  },
                ],
                $slice: -30,
              },
            },
          }
        );
      }
      const matchIds = await resolveMatchIdsForContext(context);
      for (const mid of matchIds) {
        await ObsControllerProfile.findOneAndUpdate(
          { matchId: mid },
          {
            $set: {
              connectionStatus: 'RECONNECTING',
              lastError: errorMessage.slice(0, 500),
              agentLastSeenAt: new Date(),
            },
          }
        );
        await writeBroadcastAudit({
          matchId: mid,
          actionType: 'OBS_ERROR',
          userName: context.label || 'Local OBS Bridge',
          userRole: 'AGENT',
          obsStatus: 'FAILED',
          errorDetails: errorMessage,
        });
        emitBroadcastStudioEvent(mid, 'obs:error', { matchId: mid, message: errorMessage });
        await emitFullStudioState(mid);
      }
    },
    onAgentAudioLevels: async (context: ObsAgentContext, payload: Record<string, any>) => {
      const meter = payload?.audioMeter && typeof payload.audioMeter === 'object' ? payload.audioMeter : null;
      if (!meter) return;
      if (context.bridgeId) {
        latestAudioMeterByBridge.set(context.bridgeId, meter);
      }
      const matchIds =
        Array.isArray(context.matchIds) && context.matchIds.length > 0
          ? context.matchIds
          : await resolveMatchIdsForContext(context);
      for (const mid of matchIds) {
        latestAudioMeterByMatch.set(mid, meter);
        emitBroadcastStudioEvent(mid, 'obs:audio_levels', {
          matchId: mid,
          bridgeId: context.bridgeId || null,
          primaryAudioInput:
            typeof payload.primaryAudioInput === 'string'
              ? payload.primaryAudioInput
              : meter.primaryInputName || '',
          audioMeter: meter,
        });
      }
    },
  });

  if (heartbeatMonitorTimer) {
    clearInterval(heartbeatMonitorTimer);
  }
  heartbeatMonitorTimer = setInterval(async () => {
    try {
      const transitions = bridgeHealthTracker.evaluateAll(Date.now());
      for (const { key, entry } of transitions) {
        const mappedStatus =
          entry.state === 'OFFLINE'
            ? 'OFFLINE'
            : entry.state === 'CONNECTION_LOST'
              ? 'CONNECTION_LOST'
              : entry.state === 'RECONNECTING'
                ? 'RECONNECTING'
                : 'ONLINE';
        if (entry.bridgeId) {
          await ObsBridge.findOneAndUpdate(
            { bridgeId: entry.bridgeId, manualDisconnect: { $ne: true }, status: { $ne: 'REVOKED' } },
            {
              $set: {
                connectionStatus: mappedStatus,
                bridgeConnectionState: entry.state,
                missedHeartbeats: entry.missedHeartbeats,
              },
            }
          ).catch(() => {});
        }
        for (const mid of entry.matchIds) {
          await ObsControllerProfile.findOneAndUpdate(
            { matchId: mid, connectionMode: 'local_agent', manualDisconnect: { $ne: true } },
            {
              $set: {
                bridgeConnectionState: entry.state,
                missedHeartbeats: entry.missedHeartbeats,
              },
            }
          ).catch(() => {});
          emitBroadcastStudioEvent(mid, 'BRIDGE_HEALTH_CHANGED', {
            matchId: mid,
            bridgeId: entry.bridgeId || null,
            bridgeConnectionState: entry.state,
            missedHeartbeats: entry.missedHeartbeats,
            manualDisconnect: false,
            key,
          });
        }
      }
    } catch {
      // Non-blocking heartbeat sweep
    }
  }, OBS_BRIDGE_HEARTBEAT_INTERVAL_MS);
  heartbeatMonitorTimer.unref?.();

  // Auto-resume any Direct WS OBS profiles that were connected before server restart and never manually disconnected
  ObsControllerProfile.find({
    connectionMode: 'direct_ws',
    desiredConnected: true,
    manualDisconnect: { $ne: true },
  })
    .lean()
    .then((profiles) => {
      for (const p of profiles || []) {
        const mid = String((p as any).matchId || '');
        if (mid) {
          connectDirectObs(mid, null, true).catch(() => {});
        }
      }
    })
    .catch(() => {});
}

export async function writeBroadcastAudit(params: {
  matchId?: string | null;
  tournamentId?: string | null;
  actionType: BroadcastAuditAction;
  cameraId?: string;
  cameraName?: string;
  previousScene?: string;
  newScene?: string;
  previousCameraId?: string;
  newCameraId?: string;
  layoutSelected?: string;
  actor?: IUser | null;
  userName?: string;
  userRole?: string;
  adminOverride?: boolean;
  obsStatus: 'SUCCESS' | 'FAILED' | 'REJECTED';
  errorDetails?: string;
  metadata?: Record<string, unknown> | null;
}) {
  try {
    const doc = await BroadcastAuditLog.create({
      matchId: params.matchId || null,
      tournamentId: params.tournamentId || null,
      actionType: params.actionType,
      cameraId: params.cameraId || '',
      cameraName: params.cameraName || '',
      previousScene: params.previousScene || '',
      newScene: params.newScene || '',
      previousCameraId: params.previousCameraId || '',
      newCameraId: params.newCameraId || '',
      layoutSelected: params.layoutSelected || '',
      userId: params.actor?._id || null,
      userName: params.actor?.name || params.userName || 'System',
      userRole: params.actor?.role || params.userRole || 'SYSTEM',
      adminOverride: Boolean(params.adminOverride),
      obsStatus: params.obsStatus,
      errorDetails: (params.errorDetails || '').slice(0, 600),
      metadata: params.metadata || null,
      timestamp: new Date(),
    });
    if (params.matchId) {
      emitBroadcastStudioEvent(params.matchId, 'obs:audit_event', {
        matchId: params.matchId,
        log: formatAuditLog(doc.toObject ? doc.toObject() : doc),
      });
    }
  } catch (err) {
    console.error('[OBS Audit] Failed writing audit log:', err);
  }
}

export function formatAuditLog(doc: any) {
  return {
    id: String(doc._id || doc.id || ''),
    matchId: String(doc.matchId || ''),
    actionType: doc.actionType,
    cameraId: doc.cameraId || '',
    cameraName: doc.cameraName || '',
    previousScene: doc.previousScene || '',
    newScene: doc.newScene || '',
    previousCameraId: doc.previousCameraId || '',
    newCameraId: doc.newCameraId || '',
    layoutSelected: doc.layoutSelected || '',
    userId: doc.userId ? String(doc.userId) : null,
    userName: doc.userName || 'System',
    userRole: doc.userRole || '',
    adminOverride: Boolean(doc.adminOverride),
    obsStatus: doc.obsStatus || 'SUCCESS',
    errorDetails: doc.errorDetails || '',
    metadata: doc.metadata || null,
    timestamp: doc.timestamp || doc.createdAt,
  };
}

export async function ensureObsProfileForMatch(
  matchId: string,
  userId?: mongoose.Types.ObjectId | string | null
): Promise<IObsControllerProfile> {
  let profile = await ObsControllerProfile.findOne({ matchId });
  if (profile) {
    if (!profile.broadcastSessionId) {
      profile.broadcastSessionId = `mlsess_${generateScopedToken('s').raw.slice(2, 12)}`;
      profile.broadcastSessionStartedAt = profile.broadcastSessionStartedAt || new Date();
      await profile.save();
    }
    return profile;
  }

  const stream = await LiveStream.findById(matchId).lean();
  const roomSuffix = matchId.slice(-8);
  const vdoPwd = generateScopedToken('vdo').raw.slice(0, 14);
  const sessionId = `mlsess_${generateScopedToken('s').raw.slice(2, 12)}`;

  profile = await ObsControllerProfile.create({
    matchId,
    tournamentId: stream?.tournamentId || null,
    connectionMode: 'local_agent',
    obsProtocol: 'ws',
    obsHost: '127.0.0.1',
    obsPort: 4455,
    hasPassword: false,
    connectionStatus: 'DISCONNECTED',
    vdoRoomName: `maidanlive_${roomSuffix}`,
    vdoRoomPasswordEnc: encryptObsSecret(vdoPwd),
    broadcastSessionId: sessionId,
    broadcastSessionStartedAt: new Date(),
    scoreboardSourceName: 'MaidanLive_Scoreboard_Overlay',
    autoSyncScoreboardSource: true,
    updatedBy: userId || null,
  });

  return profile;
}

export function buildObsEnsureInputForCamera(
  camera: any,
  profile: any,
  roomPassword = ''
): { inputName: string; inputKind: string; inputSettings: Record<string, any> } | undefined {
  if (!camera) return undefined;
  const inputName = camera.obsInputName?.trim() || `ML_CAM_${camera.cameraNumber}`;

  if (camera.sourceType === 'vdoninja' && camera.vdoStreamId) {
    const links = buildVdoNinjaLinks({
      roomName: camera.vdoRoomName || profile?.vdoRoomName || 'maidanlive',
      streamId: camera.vdoStreamId,
      password: roomPassword,
      label: camera.label || camera.name,
      resolution: camera.resolution,
      fps: camera.fps,
      bitrateKbps: camera.bitrateKbps,
      lowBandwidthMode: camera.lowBandwidthMode,
      facingMode: camera.facingMode,
      includeCameraSelection: Boolean(camera.vdoCameraSelectionEnabled),
    });
    return {
      inputName,
      inputKind: 'browser_source',
      inputSettings: {
        url: links.obsViewUrl,
        width: 1920,
        height: 1080,
      },
    };
  }

  if (camera.sourceType === 'browser_source' && camera.connectionUrl) {
    return {
      inputName,
      inputKind: 'browser_source',
      inputSettings: {
        url: sanitizeVdoViewUrl(camera.connectionUrl),
        width: 1920,
        height: 1080,
      },
    };
  }

  if (camera.sourceType === 'mediamtx') {
    if (camera.mediamtxRevoked) return undefined;
    let obsPullUrl = '';
    if (camera.mediamtxStreamPath) {
      const plainKey = camera.mediamtxStreamKeyEnc ? decryptObsSecret(camera.mediamtxStreamKeyEnc) : '';
      const cfg = buildLarixCameraConfig({
        matchId: String(camera.matchId || profile?.matchId || ''),
        cameraId: camera.cameraId,
        cameraName: camera.label || camera.name,
        protocol: camera.streamProtocol === 'srt' ? 'srt' : 'rtmp',
        streamPath: camera.mediamtxStreamPath,
        streamKey: plainKey,
      });
      obsPullUrl = cfg.obsPullUrl;
    } else if (camera.connectionUrl) {
      obsPullUrl = camera.connectionUrl;
    }

    if (!obsPullUrl || !isValidMediaSourceUrl(obsPullUrl)) {
      return undefined;
    }

    return {
      inputName,
      inputKind: 'ffmpeg_source',
      inputSettings: {
        is_local_file: false,
        input: obsPullUrl,
        reconnect_delay_sec: 2,
        restart_on_activate: true,
        clear_on_media_end: false,
        close_when_inactive: false,
        hw_decode: true,
        buffering_mb: 2,
      },
    };
  }

  if (camera.sourceType === 'rtsp_ffmpeg' && camera.connectionUrl && isValidMediaSourceUrl(camera.connectionUrl)) {
    return {
      inputName,
      inputKind: 'ffmpeg_source',
      inputSettings: {
        is_local_file: false,
        input: camera.connectionUrl,
        reconnect_delay_sec: 2,
        restart_on_activate: true,
        clear_on_media_end: false,
        close_when_inactive: false,
        hw_decode: true,
      },
    };
  }

  return undefined;
}

export function computeEffectiveCameraStatus(
  camera: any,
  activeCameraId: string,
  activeObsScene: string,
  obsConnected: boolean,
  activeCameraIds: string[] = []
): CameraConnectionStatus {
  const isSelectedLive =
    obsConnected &&
    ((activeCameraId && camera.cameraId === activeCameraId) ||
      (Array.isArray(activeCameraIds) && activeCameraIds.includes(camera.cameraId)) ||
      (activeObsScene && camera.obsSceneName && camera.obsSceneName === activeObsScene));

  if (!camera.enabled) return 'DISCONNECTED';

  if (camera.status === 'ERROR' && camera.lastError) {
    return 'ERROR';
  }

  if (camera.sourceType === 'mediamtx') {
    if (camera.mediamtxRevoked) return 'DISCONNECTED';
    const hasLarixConfig = Boolean(
      camera.mediamtxStreamPath || camera.connectionUrl || camera.obsInputName || camera.obsSceneName
    );
    if (!hasLarixConfig) return 'NOT_CONFIGURED';
    const hbMs = camera.lastHeartbeatAt ? new Date(camera.lastHeartbeatAt).getTime() : 0;
    const isMediaPlaying =
      Boolean(camera.mediamtxPublisherConnected) ||
      camera.obsMediaState === 'OBS_MEDIA_STATE_PLAYING' ||
      Boolean(hbMs && Date.now() - hbMs <= HEARTBEAT_STALE_MS);
    if (isSelectedLive) return 'ACTIVE';
    if (isMediaPlaying) return 'CONNECTED';
    return 'DISCONNECTED';
  }

  const hasConfig =
    camera.sourceType === 'obs_input'
      ? Boolean(camera.obsInputName || camera.obsSceneName)
      : camera.sourceType === 'vdoninja'
        ? Boolean(camera.vdoStreamId && camera.vdoRoomName)
        : Boolean(camera.connectionUrl || camera.obsSceneName || camera.obsInputName);

  if (!hasConfig) return 'NOT_CONFIGURED';

  if (isSelectedLive) return 'ACTIVE';

  const hbMs = camera.lastHeartbeatAt ? new Date(camera.lastHeartbeatAt).getTime() : 0;
  if (hbMs && Date.now() - hbMs <= HEARTBEAT_STALE_MS) {
    return camera.status === 'CONNECTING' ? 'CONNECTING' : 'CONNECTED';
  }

  if (camera.status === 'CONNECTING' && hbMs && Date.now() - hbMs <= HEARTBEAT_STALE_MS) {
    return 'CONNECTING';
  }

  return 'DISCONNECTED';
}

export function formatSafeProfile(profile: any) {
  if (!profile) return null;
  const matchId = String(profile.matchId || '');
  const direct = directSessions.get(matchId);

  const realAgentOnline = isMatchBridgeOnlineSync(matchId);
  const liveCtx = realAgentOnline ? getLiveMatchBridgeContextSync(matchId) : null;
  const effectiveBridgeVersion = profile.bridgeVersion || liveCtx?.bridgeVersion || '';
  const profileCaps = normalizeBridgeCapabilities(profile.bridgeCapabilities);
  const effectiveCapabilities =
    profileCaps.length > 0 ? profileCaps : normalizeBridgeCapabilities(liveCtx?.capabilities);
  const isManualDisconnect = Boolean(profile.manualDisconnect);
  let effectiveStatus = profile.connectionStatus || 'DISCONNECTED';
  if (isManualDisconnect) {
    effectiveStatus = 'DISCONNECTED';
  } else if (profile.connectionMode === 'local_agent') {
    if (!realAgentOnline) {
      effectiveStatus =
        profile.desiredConnected ||
        profile.connectionStatus === 'CONNECTED' ||
        profile.connectionStatus === 'RECONNECTING' ||
        profile.connectionStatus === 'CONNECTION_LOST' ||
        profile.connectionStatus === 'CONNECTING'
          ? 'CONNECTION_LOST'
          : 'DISCONNECTED';
    } else if (effectiveStatus === 'DISCONNECTED' && profile.desiredConnected) {
      effectiveStatus = 'RECONNECTING';
    }
  } else if (profile.connectionMode === 'direct_ws') {
    if (direct?.connected) effectiveStatus = 'CONNECTED';
    else if (direct?.connecting) effectiveStatus = 'CONNECTING';
    else if (profile.connectionStatus === 'RECONNECTING') effectiveStatus = 'RECONNECTING';
    else if (profile.connectionStatus === 'CONNECTION_LOST') effectiveStatus = 'CONNECTION_LOST';
    else if (profile.desiredConnected) effectiveStatus = 'CONNECTION_LOST';
    else if (profile.connectionStatus === 'ERROR') effectiveStatus = 'ERROR';
    else effectiveStatus = 'DISCONNECTED';
  }

  return {
    id: String(profile._id || profile.id || ''),
    matchId,
    tournamentId: profile.tournamentId ? String(profile.tournamentId) : null,
    connectionMode: profile.connectionMode || 'local_agent',
    obsProtocol: profile.obsProtocol || 'ws',
    obsHost: profile.obsHost || '127.0.0.1',
    obsPort: Number(profile.obsPort) || 4455,
    hasPassword: Boolean(profile.hasPassword),
    hasAgentToken: Boolean(profile.agentTokenPrefix),
    agentTokenPrefix: profile.agentTokenPrefix || '',
    agentOnline: realAgentOnline,
    agentLastSeenAt: profile.agentLastSeenAt || null,
    agentLabel: profile.agentLabel || '',
    bridgeVersion: effectiveBridgeVersion,
    capabilities: effectiveCapabilities,
    mediamtxControlSupported: hasMediaMTXControlCapability(effectiveCapabilities),
    bridgeConnectionState: isManualDisconnect
      ? 'OFFLINE'
      : profile.bridgeConnectionState && profile.bridgeConnectionState !== 'OFFLINE'
        ? profile.bridgeConnectionState
        : realAgentOnline
          ? 'CONNECTED'
          : profile.desiredConnected
            ? 'CONNECTION_LOST'
            : 'OFFLINE',
    missedHeartbeats: Number(profile.missedHeartbeats || 0),
    lastDisconnectReason: profile.lastDisconnectReason || '',
    reconnectAttempts: Number(profile.reconnectAttempts || 0),
    desiredConnected: Boolean(profile.desiredConnected),
    manualDisconnect: isManualDisconnect,
    manualDisconnectedAt: profile.manualDisconnectedAt || null,
    manualDisconnectedBy: profile.manualDisconnectedBy || '',
    connectionStatus: effectiveStatus,
    lastError: profile.lastError || '',
    obsVersion: profile.obsVersion || '',
    obsWebSocketVersion: profile.obsWebSocketVersion || '',
    activeObsScene: profile.activeObsScene || '',
    previewObsScene: profile.previewObsScene || '',
    studioModeEnabled: Boolean(profile.studioModeEnabled),
    currentTransitionName: profile.currentTransitionName || '',
    currentTransitionDurationMs: Number(profile.currentTransitionDurationMs ?? 300),
    obsTransitions: Array.isArray(profile.obsTransitions) ? profile.obsTransitions : [],
    primaryAudioInput: profile.primaryAudioInput || '',
    audioMeter: effectiveStatus === 'CONNECTED' ? latestAudioMeterByMatch.get(matchId) || null : null,
    activeCameraId: profile.activeCameraId || '',
    activeCameraIds: Array.isArray(profile.activeCameraIds)
      ? profile.activeCameraIds
      : profile.activeCameraId
        ? [profile.activeCameraId]
        : [],
    activeLayoutType: profile.activeLayoutType || 'SINGLE',
    activePipPosition: profile.activePipPosition || 'bottom-right',
    activePipSize: profile.activePipSize || 'medium',
    activeSceneId: profile.activeSceneId || '',
    obsScenes: Array.isArray(profile.obsScenes) ? profile.obsScenes : [],
    obsInputs: Array.isArray(profile.obsInputs) ? profile.obsInputs : [],
    sceneLabels:
      profile.sceneLabels instanceof Map
        ? Object.fromEntries(profile.sceneLabels.entries())
        : profile.sceneLabels && typeof profile.sceneLabels === 'object'
          ? { ...profile.sceneLabels }
          : {},
    obsStreamActive: Boolean(profile.obsStreamActive),
    obsStreamTimecode: profile.obsStreamTimecode || '',
    obsStreamBytes: typeof profile.obsStreamBytes === 'number' ? profile.obsStreamBytes : null,
    obsStreamDurationMs:
      typeof profile.obsStreamDurationMs === 'number' ? profile.obsStreamDurationMs : null,
    obsRecordActive: Boolean(profile.obsRecordActive),
    obsRecordTimecode: profile.obsRecordTimecode || '',
    obsStats: profile.obsStats || null,
    vdoRoomName: profile.vdoRoomName || '',
    broadcastSessionId: profile.broadcastSessionId || '',
    broadcastSessionStartedAt: profile.broadcastSessionStartedAt || null,
    activeControllerUserId: profile.activeControllerUserId
      ? String(profile.activeControllerUserId)
      : null,
    activeControllerName: profile.activeControllerName || '',
    activeControllerRole: profile.activeControllerRole || '',
    activeControllerSince: profile.activeControllerSince || null,
    adminOverrideLocked: Boolean(profile.adminOverrideLocked),
    adminOverrideByUserId: profile.adminOverrideByUserId
      ? String(profile.adminOverrideByUserId)
      : null,
    adminOverrideByName: profile.adminOverrideByName || '',
    adminOverrideReason: profile.adminOverrideReason || '',
    adminOverrideLockedAt: profile.adminOverrideLockedAt || null,
    autoSyncScoreboardSource: profile.autoSyncScoreboardSource !== false,
    scoreboardSourceName: profile.scoreboardSourceName || 'MaidanLive_Scoreboard_Overlay',
    selectedSponsorIds: Array.isArray(profile.selectedSponsorIds)
      ? profile.selectedSponsorIds
      : [],
    mediamtxState: profile.mediamtxState
      ? {
          ...profile.mediamtxState,
          activePathCount:
            typeof profile.mediamtxState.activePathCount === 'number'
              ? profile.mediamtxState.activePathCount
              : Array.isArray(profile.mediamtxState.activePaths)
                ? profile.mediamtxState.activePaths.length
                : 0,
        }
      : null,
    lastSyncedAt: profile.lastSyncedAt || null,
    updatedAt: profile.updatedAt || null,
  };
}

export function formatSafeCamera(
  camera: any,
  profile: any,
  options: { includePrivateUrls?: boolean; roomPassword?: string; baseAppUrl?: string } = {}
) {
  const safeProfile = formatSafeProfile(profile);
  const obsConnected = safeProfile?.connectionStatus === 'CONNECTED';
  const effectiveStatus = computeEffectiveCameraStatus(
    camera,
    safeProfile?.activeCameraId || '',
    safeProfile?.activeObsScene || '',
    obsConnected,
    safeProfile?.activeCameraIds || []
  );

  let vdoLinks: { pushUrl: string; obsViewUrl: string; directorUrl: string } | null = null;
  if (options.includePrivateUrls && camera.sourceType === 'vdoninja' && camera.vdoStreamId) {
    vdoLinks = buildVdoNinjaLinks({
      roomName: camera.vdoRoomName || profile?.vdoRoomName || 'maidanlive',
      streamId: camera.vdoStreamId,
      password: options.roomPassword || '',
      label: camera.label || camera.name,
      resolution: camera.resolution,
      fps: camera.fps,
      bitrateKbps: camera.bitrateKbps,
      lowBandwidthMode: camera.lowBandwidthMode,
      facingMode: camera.facingMode,
      includeCameraSelection: Boolean(camera.vdoCameraSelectionEnabled),
    });
  }

  const targetInputName = camera.obsInputName?.trim() || `ML_CAM_${camera.cameraNumber}`;
  const obsInputsList = Array.isArray(safeProfile?.obsInputs) ? safeProfile.obsInputs : [];
  const presentInObs = Boolean(
    obsConnected && obsInputsList.some((inp: any) => inp.inputName === targetInputName)
  );

  let larixConfig: ReturnType<typeof buildLarixCameraConfig> | null = null;
  if (
    options.includePrivateUrls &&
    camera.sourceType === 'mediamtx' &&
    !camera.mediamtxRevoked &&
    camera.mediamtxStreamPath
  ) {
    const plainKey = camera.mediamtxStreamKeyEnc
      ? decryptObsSecret(camera.mediamtxStreamKeyEnc)
      : '';
    if (plainKey) {
      larixConfig = buildLarixCameraConfig({
        matchId: String(camera.matchId || profile?.matchId || ''),
        cameraId: camera.cameraId,
        cameraName: camera.label || camera.name,
        protocol: camera.streamProtocol === 'srt' ? 'srt' : 'rtmp',
        streamPath: camera.mediamtxStreamPath,
        streamKey: plainKey,
      });
    }
  }

  return {
    id: String(camera._id || camera.id || ''),
    matchId: String(camera.matchId || ''),
    tournamentId: camera.tournamentId ? String(camera.tournamentId) : null,
    cameraId: camera.cameraId,
    name: camera.name,
    label: camera.label || '',
    cameraNumber: Number(camera.cameraNumber) || 1,
    position: camera.position || '',
    cameraType: camera.cameraType || 'smartphone_vdo',
    sourceType: camera.sourceType || 'vdoninja',
    streamProtocol:
      camera.streamProtocol ||
      (camera.sourceType === 'mediamtx'
        ? 'rtmp'
        : camera.sourceType === 'vdoninja'
          ? 'vdoninja'
          : camera.sourceType || 'vdoninja'),
    connectionUrl: options.includePrivateUrls ? camera.connectionUrl || '' : '',
    vdoRoomName: camera.vdoRoomName || '',
    vdoStreamId: camera.vdoStreamId || '',
    vdoPushUrl: vdoLinks?.pushUrl || '',
    obsBrowserSourceUrl:
      vdoLinks?.obsViewUrl ||
      (options.includePrivateUrls && camera.sourceType !== 'mediamtx'
        ? sanitizeVdoViewUrl(camera.connectionUrl || '')
        : ''),
    pushTokenPrefix: camera.pushTokenPrefix || '',
    pushTokenExpiresAt: camera.pushTokenExpiresAt || null,
    mediamtxStreamPath: camera.mediamtxStreamPath || '',
    mediamtxStreamKeyPrefix: camera.mediamtxStreamKeyPrefix || '',
    mediamtxRevoked: Boolean(camera.mediamtxRevoked),
    mediamtxRevokedAt: camera.mediamtxRevokedAt || null,
    mediamtxPublisherConnected: Boolean(camera.mediamtxPublisherConnected),
    mediamtxLastConnectedAt: camera.mediamtxLastConnectedAt || null,
    mediamtxDisconnectedAt: camera.mediamtxDisconnectedAt || null,
    obsSourceConfigured: Boolean(camera.obsSourceConfigured || presentInObs),
    obsSourceAvailable: Boolean(presentInObs || camera.obsSourceAvailable),
    obsMediaState: camera.obsMediaState || '',
    larixConfig,
    broadcastSessionId: camera.broadcastSessionId || '',
    audioMuted: Boolean(camera.audioMuted ?? camera.telemetry?.audioMuted),
    obsInputMuted: typeof camera.obsInputMuted === 'boolean' ? camera.obsInputMuted : null,
    resolution: camera.resolution || '1280x720',
    fps: Number(camera.fps) || 30,
    bitrateKbps: Number(camera.bitrateKbps) || 2000,
    lowBandwidthMode: Boolean(camera.lowBandwidthMode),
    facingMode: camera.facingMode || 'environment',
    vdoCameraSelectionEnabled: Boolean(camera.vdoCameraSelectionEnabled),
    orientationMode: normalizeOrientationMode(camera.orientationMode),
    previewFit: normalizePreviewFit(camera.previewFit),
    portraitBackdropFill: camera.portraitBackdropFill !== false,
    obsSceneName: camera.obsSceneName || '',
    obsInputName: camera.obsInputName || '',
    description: camera.description || '',
    status: effectiveStatus,
    rawStatus: camera.status || 'NOT_CONFIGURED',
    lastError: camera.lastError || '',
    lastHeartbeatAt: camera.lastHeartbeatAt || null,
    telemetry: camera.telemetry || null,
    priority: Number(camera.priority) || 10,
    isDefault: Boolean(camera.isDefault),
    enabled: Boolean(camera.enabled),
    sortOrder: Number(camera.sortOrder) || Number(camera.cameraNumber) || 1,
    operatorUserId: camera.operatorUserId ? String(camera.operatorUserId) : null,
    operatorName: camera.operatorName || '',
    createdAt: camera.createdAt,
    updatedAt: camera.updatedAt,
  };
}

export function formatSafeScene(scene: any) {
  return {
    id: String(scene._id || scene.id || ''),
    matchId: String(scene.matchId || ''),
    name: scene.name,
    label: scene.label || '',
    obsSceneName: scene.obsSceneName,
    layoutType: scene.layoutType || 'SINGLE',
    cameraIds: Array.isArray(scene.cameraIds) ? scene.cameraIds : [],
    mainCameraId: scene.mainCameraId || '',
    pipPosition: scene.pipPosition || 'bottom-right',
    pipSize: scene.pipSize || 'medium',
    includeScoreboardOverlay: scene.includeScoreboardOverlay !== false,
    overlayMode: scene.overlayMode || 'full',
    overlayPosition: scene.overlayPosition || 'bottom-center',
    sponsorIds: Array.isArray(scene.sponsorIds) ? scene.sponsorIds : [],
    isDefault: Boolean(scene.isDefault),
    enabled: Boolean(scene.enabled),
    sortOrder: Number(scene.sortOrder) || 1,
  };
}

async function getRoomPasswordForProfile(profile: any): Promise<string> {
  if (!profile) return '';
  if (profile.vdoRoomPasswordEnc) {
    return decryptObsSecret(profile.vdoRoomPasswordEnc);
  }
  const withSecret = await ObsControllerProfile.findOne({ matchId: profile.matchId })
    .select('+vdoRoomPasswordEnc')
    .lean();
  if (!withSecret?.vdoRoomPasswordEnc) return '';
  return decryptObsSecret(withSecret.vdoRoomPasswordEnc);
}

export async function getStudioSnapshot(matchId: string, includePrivateUrls = true) {
  const profile = await ensureObsProfileForMatch(matchId);
  const cameraQuery = BroadcastCamera.find({ matchId }).sort({ sortOrder: 1, cameraNumber: 1 });
  if (includePrivateUrls) {
    cameraQuery.select('+mediamtxStreamKeyEnc');
  }
  const [cameras, scenes, auditLogs, graphicsState] = await Promise.all([
    cameraQuery.lean(),
    BroadcastScene.find({ matchId }).sort({ sortOrder: 1, createdAt: 1 }).lean(),
    BroadcastAuditLog.find({ matchId }).sort({ timestamp: -1 }).limit(60).lean(),
    getGraphicsStateForMatch(matchId),
  ]);

  const roomPassword = includePrivateUrls ? await getRoomPasswordForProfile(profile) : '';

  return {
    profile: formatSafeProfile(profile),
    cameras: cameras.map((cam) =>
      formatSafeCamera(cam, profile, { includePrivateUrls, roomPassword })
    ),
    scenes: scenes.map(formatSafeScene),
    auditLogs: auditLogs.map(formatAuditLog),
    graphicsState,
  };
}

export async function emitFullStudioState(matchId: string) {
  try {
    const snap = await getStudioSnapshot(matchId, false);
    emitBroadcastStudioEvent(matchId, 'obs:state', {
      matchId,
      profile: snap.profile,
      cameras: snap.cameras,
      scenes: snap.scenes,
    });
  } catch {
    // Non-blocking
  }
}

async function reconcileCameraActiveStates(matchId: string, activeObsScene: string) {
  const profile = await ObsControllerProfile.findOne({ matchId }).lean();
  const cameras = await BroadcastCamera.find({ matchId });
  const obsConnected =
    profile?.connectionMode === 'local_agent'
      ? Boolean((await isMatchBridgeOnline(matchId)) && profile?.connectionStatus === 'CONNECTED')
      : Boolean(directSessions.get(matchId)?.connected);

  for (const cam of cameras) {
    const nextStatus = computeEffectiveCameraStatus(
      cam,
      profile?.activeCameraId || '',
      activeObsScene,
      obsConnected,
      Array.isArray(profile?.activeCameraIds) ? profile.activeCameraIds : []
    );
    if (cam.status !== nextStatus && cam.status !== 'ERROR') {
      cam.status = nextStatus;
      await cam.save();
    }
  }
}

function clearReconnectTimer(session: DirectObsSession) {
  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }
}

function clearKeepaliveTimer(session: DirectObsSession) {
  if (session.keepaliveTimer) {
    clearInterval(session.keepaliveTimer);
    session.keepaliveTimer = null;
  }
}

function startDirectKeepalive(matchId: string, session: DirectObsSession) {
  clearKeepaliveTimer(session);
  session.keepaliveFailures = 0;
  session.keepaliveTimer = setInterval(async () => {
    const cur = directSessions.get(matchId);
    if (!cur || cur !== session || !cur.connected || cur.manualDisconnect) return;
    try {
      await Promise.race([
        cur.obs.call('GetVersion'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('OBS WS keepalive timeout')), 5000)
        ),
      ]);
      cur.keepaliveFailures = 0;
    } catch {
      cur.keepaliveFailures += 1;
      if (cur.keepaliveFailures >= 3 && !cur.manualDisconnect) {
        console.warn(`[DirectOBS] Keepalive missed ${cur.keepaliveFailures} pings on match ${matchId}; recycling WS cleanly.`);
        clearKeepaliveTimer(cur);
        cur.connected = false;
        try {
          await cur.obs.disconnect();
        } catch {
          // ignore
        }
        scheduleDirectReconnect(matchId).catch(() => {});
      }
    }
  }, 20_000);
  session.keepaliveTimer.unref?.();
}

async function scheduleDirectReconnect(matchId: string) {
  const session = directSessions.get(matchId);
  if (!session || session.manualDisconnect) return;

  const profile = await ObsControllerProfile.findOne({ matchId }).lean();
  if (!profile || profile.connectionMode !== 'direct_ws' || profile.manualDisconnect) return;

  clearReconnectTimer(session);
  const delayMs = calculateExponentialBackoffMs(session.reconnectAttempts, {
    baseMs: 1500,
    factor: 1.8,
    maxMs: 30_000,
    jitterRatio: 0.2,
  });
  session.reconnectAttempts += 1;

  session.reconnectTimer = setTimeout(() => {
    connectDirectObs(matchId, null, true).catch(() => {});
  }, delayMs);
}

export async function connectDirectObs(
  matchId: string,
  actor?: IUser | null,
  isAutoReconnect = false
): Promise<{ ok: boolean; profile: any; error?: string }> {
  const profile = await ObsControllerProfile.findOne({ matchId }).select('+obsPasswordEnc');
  if (!profile) {
    throw new Error('OBS profile not found for this match.');
  }

  const existing = directSessions.get(matchId);
  if (existing) {
    clearReconnectTimer(existing);
    clearKeepaliveTimer(existing);
    existing.manualDisconnect = true;
    try {
      await existing.obs.disconnect();
    } catch {
      // Ignore close errors
    }
    directSessions.delete(matchId);
  }

  const obs = new OBSWebSocket();
  const session: DirectObsSession = {
    matchId,
    obs,
    connected: false,
    connecting: true,
    manualDisconnect: false,
    reconnectTimer: null,
    reconnectAttempts: existing?.reconnectAttempts || 0,
    keepaliveTimer: null,
    keepaliveFailures: 0,
  };
  directSessions.set(matchId, session);

  profile.connectionMode = 'direct_ws';
  profile.connectionStatus = 'CONNECTING';
  profile.desiredConnected = true;
  profile.manualDisconnect = false;
  profile.manualDisconnectedAt = null;
  profile.manualDisconnectedBy = '';
  profile.lastError = '';
  await profile.save();
  await emitFullStudioState(matchId);

  const wsUrl = `${profile.obsProtocol === 'wss' ? 'wss' : 'ws'}://${profile.obsHost}:${profile.obsPort}`;
  const password = profile.obsPasswordEnc ? decryptObsSecret(profile.obsPasswordEnc) : undefined;

  const handleWsError = async (err: unknown) => {
    const errObj = err as { message?: string } | null | undefined;
    const errMsg = String(errObj?.message || err || 'OBS WebSocket error');
    console.warn(`[DirectOBS] WebSocket error on match ${matchId}: ${errMsg}`);
    await ObsControllerProfile.findOneAndUpdate(
      { matchId },
      { $set: { lastError: errMsg.slice(0, 500) } }
    ).catch(() => {});
  };

  obs.on('ConnectionError', handleWsError);
  (obs as unknown as { on: (ev: string, fn: (err: unknown) => void) => void }).on('error', handleWsError);

  obs.on('ConnectionClosed', async (err: any) => {
    const cur = directSessions.get(matchId);
    if (!cur || cur.obs !== obs) return;
    clearKeepaliveTimer(cur);
    cur.connected = false;
    cur.connecting = false;

    const reasonMsg =
      err?.message || (cur.manualDisconnect ? 'Disconnected by operator' : 'OBS WebSocket closed');
    await ObsControllerProfile.findOneAndUpdate(
      { matchId },
      {
        $set: {
          connectionStatus: cur.manualDisconnect ? 'DISCONNECTED' : 'RECONNECTING',
          lastError: cur.manualDisconnect ? '' : reasonMsg,
          lastDisconnectReason: reasonMsg,
          ...(cur.manualDisconnect
            ? {
                obsStreamActive: false,
                desiredConnected: false,
                manualDisconnect: true,
                manualDisconnectedAt: new Date(),
              }
            : {}),
        },
      }
    );
    if (cur.manualDisconnect) {
      await reconcileCameraActiveStates(matchId, '');
    }
    const offMeter = buildDirectAudioMeterState(matchId, false, '', [], []);
    latestAudioMeterByMatch.set(matchId, offMeter);
    emitBroadcastStudioEvent(matchId, 'obs:audio_levels', {
      matchId,
      primaryAudioInput: offMeter.primaryInputName || '',
      audioMeter: offMeter,
    });
    await writeBroadcastAudit({
      matchId,
      actionType: 'OBS_DISCONNECT',
      userName: cur.manualDisconnect ? actor?.name || 'Operator' : 'OBS WebSocket',
      obsStatus: cur.manualDisconnect ? 'SUCCESS' : 'FAILED',
      errorDetails: cur.manualDisconnect ? '' : reasonMsg,
    });
    emitBroadcastStudioEvent(matchId, 'OBS_DISCONNECTED', {
      matchId,
      connectionStatus: cur.manualDisconnect ? 'DISCONNECTED' : 'RECONNECTING',
      reason: reasonMsg,
      manualDisconnect: cur.manualDisconnect,
    });
    await emitFullStudioState(matchId);

    if (!cur.manualDisconnect) {
      scheduleDirectReconnect(matchId).catch(() => {});
    }
  });

  obs.on('CurrentProgramSceneChanged', async (ev: any) => {
    const newScene = String(ev?.sceneName || '');
    if (!newScene) return;
    const prev = await ObsControllerProfile.findOne({ matchId }).lean();
    await ObsControllerProfile.findOneAndUpdate(
      { matchId },
      {
        $set: {
          activeObsScene: newScene,
          lastSyncedAt: new Date(),
        },
      }
    );
    await reconcileCameraActiveStates(matchId, newScene);
    emitBroadcastStudioEvent(matchId, 'obs:scene_changed', {
      matchId,
      previousScene: prev?.activeObsScene || '',
      activeObsScene: newScene,
    });
    emitBroadcastStudioEvent(matchId, 'CURRENT_SCENE_CHANGED', {
      matchId,
      previousScene: prev?.activeObsScene || '',
      activeObsScene: newScene,
    });
    await emitFullStudioState(matchId);
  });

  obs.on('CurrentPreviewSceneChanged', async (ev: any) => {
    const previewScene = String(ev?.sceneName || '');
    await ObsControllerProfile.findOneAndUpdate(
      { matchId },
      { $set: { previewObsScene: previewScene, lastSyncedAt: new Date() } }
    );
    await emitFullStudioState(matchId);
  });

  obs.on('StudioModeStateChanged', async (ev: any) => {
    const enabled = Boolean(ev?.studioModeEnabled);
    await ObsControllerProfile.findOneAndUpdate(
      { matchId },
      { $set: { studioModeEnabled: enabled, lastSyncedAt: new Date() } }
    );
    await emitFullStudioState(matchId);
  });

  obs.on('CurrentSceneTransitionChanged', async (ev: any) => {
    await ObsControllerProfile.findOneAndUpdate(
      { matchId },
      { $set: { currentTransitionName: String(ev?.transitionName || ''), lastSyncedAt: new Date() } }
    );
    await emitFullStudioState(matchId);
  });

  obs.on('CurrentSceneTransitionDurationChanged', async (ev: any) => {
    if (Number.isFinite(Number(ev?.transitionDuration))) {
      await ObsControllerProfile.findOneAndUpdate(
        { matchId },
        {
          $set: {
            currentTransitionDurationMs: Math.max(0, Math.min(5000, Math.round(Number(ev.transitionDuration)))),
            lastSyncedAt: new Date(),
          },
        }
      );
    }
  });

  obs.on('InputMuteStateChanged', async (ev: any) => {
    const inputName = String(ev?.inputName || '').trim();
    if (!inputName) return;
    const dState = directAudioStateByMatch.get(matchId);
    if (dState) {
      dState.muteMap.set(inputName, Boolean(ev?.inputMuted));
      const prof = await ObsControllerProfile.findOne({ matchId }).select('primaryAudioInput obsInputs').lean();
      const meter = buildDirectAudioMeterState(
        matchId,
        session.connected,
        (prof as any)?.primaryAudioInput || '',
        Array.isArray((prof as any)?.obsInputs) ? (prof as any).obsInputs : [],
        dState.latestInputs
      );
      latestAudioMeterByMatch.set(matchId, meter);
      emitBroadcastStudioEvent(matchId, 'obs:audio_levels', {
        matchId,
        primaryAudioInput: meter.primaryInputName,
        audioMeter: meter,
      });
    }
  });

  obs.on('InputVolumeMeters', async (ev: any) => {
    if (!Array.isArray(ev?.inputs) || !session.connected) return;
    let dState = directAudioStateByMatch.get(matchId);
    if (!dState) {
      dState = {
        specialInputs: {},
        muteMap: new Map(),
        peakHoldMap: new Map(),
        latestInputs: [],
        lastEmitAt: 0,
      };
      directAudioStateByMatch.set(matchId, dState);
    }
    dState.latestInputs = ev.inputs;
    const nowMs = Date.now();
    if (nowMs - dState.lastEmitAt < 200) return;
    dState.lastEmitAt = nowMs;
    const cachedMeter = latestAudioMeterByMatch.get(matchId);
    const meter = buildDirectAudioMeterState(
      matchId,
      true,
      cachedMeter?.primaryInputName || profile.primaryAudioInput || '',
      Array.isArray(cachedMeter?.obsInputsCache) ? cachedMeter.obsInputsCache : [],
      dState.latestInputs,
      nowMs
    );
    latestAudioMeterByMatch.set(matchId, meter);
    emitBroadcastStudioEvent(matchId, 'obs:audio_levels', {
      matchId,
      primaryAudioInput: meter.primaryInputName,
      audioMeter: meter,
    });
  });

  obs.on('SceneListChanged', async (ev: any) => {
    const list = Array.isArray(ev?.scenes)
      ? ev.scenes.map((s: any) => String(s.sceneName || '')).filter(Boolean)
      : [];
    await ObsControllerProfile.findOneAndUpdate(
      { matchId },
      { $set: { obsScenes: list, lastSyncedAt: new Date() } }
    );
    emitBroadcastStudioEvent(matchId, 'SCENE_LIST_UPDATED', {
      matchId,
      obsScenes: list,
    });
    await emitFullStudioState(matchId);
  });

  obs.on('StreamStateChanged', async (ev: any) => {
    await ObsControllerProfile.findOneAndUpdate(
      { matchId },
      {
        $set: {
          obsStreamActive: Boolean(ev?.outputActive),
          lastSyncedAt: new Date(),
        },
      }
    );
    await emitFullStudioState(matchId);
  });

  obs.on('RecordStateChanged', async (ev: any) => {
    await ObsControllerProfile.findOneAndUpdate(
      { matchId },
      {
        $set: {
          obsRecordActive: Boolean(ev?.outputActive),
          lastSyncedAt: new Date(),
        },
      }
    );
    await emitFullStudioState(matchId);
  });

  try {
    const connectPromise = obs.connect(wsUrl, password || undefined, {
      rpcVersion: 1,
      eventSubscriptions: OBS_EVENT_SUBSCRIPTIONS,
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out connecting to OBS at ${wsUrl}`)), 6000)
    );
    await Promise.race([connectPromise, timeoutPromise]);

    session.connected = true;
    session.connecting = false;
    session.reconnectAttempts = 0;
    startDirectKeepalive(matchId, session);

    const snapshot = await pullDirectObsSnapshot(matchId, obs);
    await writeBroadcastAudit({
      matchId,
      actionType: 'OBS_CONNECT',
      newScene: snapshot.activeObsScene,
      actor: actor || null,
      userName: actor?.name || (isAutoReconnect ? 'Auto-Reconnect' : 'System'),
      obsStatus: 'SUCCESS',
    });

    emitBroadcastStudioEvent(matchId, 'OBS_CONNECTED', {
      matchId,
      activeObsScene: snapshot.activeObsScene,
      obsScenes: snapshot.obsScenes,
    });
    emitBroadcastStudioEvent(matchId, 'SCENE_LIST_UPDATED', {
      matchId,
      obsScenes: snapshot.obsScenes,
      activeObsScene: snapshot.activeObsScene,
    });
    await emitFullStudioState(matchId);
    return { ok: true, profile: formatSafeProfile(snapshot.profile) };
  } catch (err: any) {
    clearKeepaliveTimer(session);
    session.connected = false;
    session.connecting = false;

    const errMsg = err?.message || `Failed to connect to OBS WebSocket at ${wsUrl}`;
    const keepRetrying = !session.manualDisconnect && (isAutoReconnect || Boolean(profile.desiredConnected));
    if (!keepRetrying) {
      directSessions.delete(matchId);
    }

    profile.connectionStatus = keepRetrying
      ? session.reconnectAttempts >= 3
        ? 'CONNECTION_LOST'
        : 'RECONNECTING'
      : 'ERROR';
    profile.lastError = errMsg.slice(0, 500);
    await profile.save();

    await writeBroadcastAudit({
      matchId,
      actionType: 'OBS_ERROR',
      actor: actor || null,
      obsStatus: 'FAILED',
      errorDetails: errMsg,
    });
    emitBroadcastStudioEvent(matchId, 'obs:error', { matchId, message: errMsg });
    await emitFullStudioState(matchId);

    if (keepRetrying) {
      scheduleDirectReconnect(matchId).catch(() => {});
    }
    return { ok: false, profile: formatSafeProfile(profile), error: errMsg };
  }
}

async function pullDirectObsSnapshot(matchId: string, obs: OBSWebSocket) {
  const [
    versionRes,
    sceneListRes,
    inputListRes,
    streamStatusRes,
    recordStatusRes,
    statsRes,
    studioRes,
    transitionListRes,
    currentTransitionRes,
    specialInputsRes,
  ] = await Promise.all([
    obs.call('GetVersion'),
    obs.call('GetSceneList'),
    obs.call('GetInputList').catch(() => ({ inputs: [] })),
    obs
      .call('GetStreamStatus')
      .catch(() => ({ outputActive: false, outputTimecode: '', outputBytes: null, outputDuration: null })),
    obs.call('GetRecordStatus').catch(() => ({ outputActive: false, outputTimecode: '' })),
    obs.call('GetStats').catch(() => null),
    obs.call('GetStudioModeEnabled').catch(() => ({ studioModeEnabled: false })),
    obs.call('GetSceneTransitionList').catch(() => ({ currentSceneTransitionName: '', transitions: [] })),
    obs.call('GetCurrentSceneTransition').catch(() => ({ transitionName: '', transitionDuration: 300 })),
    obs.call('GetSpecialInputs').catch(() => ({})),
  ]);

  const studioModeEnabled = Boolean((studioRes as any)?.studioModeEnabled);
  let previewObsScene = '';
  if (studioModeEnabled) {
    const prevRes = await obs
      .call('GetCurrentPreviewScene')
      .catch(() => ({ currentPreviewSceneName: '' }));
    previewObsScene = String((prevRes as any)?.currentPreviewSceneName || (prevRes as any)?.sceneName || '');
  }

  const obsScenes = Array.isArray(sceneListRes?.scenes)
    ? sceneListRes.scenes.map((s: any) => String(s.sceneName || '')).filter(Boolean)
    : [];
  const obsInputs = Array.isArray((inputListRes as any)?.inputs)
    ? (inputListRes as any).inputs
        .map((inp: any) => ({
          inputName: String(inp.inputName || '').trim(),
          inputKind: String(inp.inputKind || '').trim(),
          unversionedInputKind: String(inp.unversionedInputKind || '').trim(),
        }))
        .filter((inp: any) => Boolean(inp.inputName))
    : [];
  const obsTransitions = Array.isArray((transitionListRes as any)?.transitions)
    ? (transitionListRes as any).transitions
        .map((t: any) => ({
          transitionName: String(t?.transitionName || '').trim(),
          transitionKind: String(t?.transitionKind || '').trim(),
          transitionFixed: Boolean(t?.transitionFixed),
        }))
        .filter((t: any) => Boolean(t.transitionName))
    : [];
  const currentTransitionName = String(
    (currentTransitionRes as any)?.transitionName ||
      (transitionListRes as any)?.currentSceneTransitionName ||
      ''
  );
  const currentTransitionDurationMs = Number.isFinite(Number((currentTransitionRes as any)?.transitionDuration))
    ? Number((currentTransitionRes as any).transitionDuration)
    : 300;
  const activeObsScene = String(sceneListRes?.currentProgramSceneName || '');

  const existingProfile = await ObsControllerProfile.findOne({ matchId }).select('primaryAudioInput').lean();
  let dState = directAudioStateByMatch.get(matchId);
  if (!dState) {
    dState = {
      specialInputs: {},
      muteMap: new Map(),
      peakHoldMap: new Map(),
      latestInputs: [],
      lastEmitAt: 0,
    };
    directAudioStateByMatch.set(matchId, dState);
  }
  dState.specialInputs =
    specialInputsRes && typeof specialInputsRes === 'object' ? (specialInputsRes as any) : {};

  const selection = selectPrimaryAudioInputServer({
    preferredInputName: (existingProfile as any)?.primaryAudioInput || '',
    specialInputs: dState.specialInputs,
    meterInputs: dState.latestInputs,
    obsInputs,
  });
  await Promise.all(
    selection.availableAudioInputs.slice(0, 12).map(async (inputName) => {
      try {
        const mRes = await obs.call('GetInputMute', { inputName });
        dState!.muteMap.set(inputName, Boolean((mRes as any)?.inputMuted));
      } catch {
        // Skip inputs without mute state
      }
    })
  );

  const audioMeter = buildDirectAudioMeterState(
    matchId,
    true,
    selection.primaryInputName,
    obsInputs,
    dState.latestInputs
  );
  latestAudioMeterByMatch.set(matchId, audioMeter);
  emitBroadcastStudioEvent(matchId, 'obs:audio_levels', {
    matchId,
    primaryAudioInput: audioMeter.primaryInputName,
    audioMeter,
  });

  const updated = await ObsControllerProfile.findOneAndUpdate(
    { matchId },
    {
      $set: {
        connectionStatus: 'CONNECTED',
        desiredConnected: true,
        manualDisconnect: false,
        manualDisconnectedAt: null,
        manualDisconnectedBy: '',
        lastError: '',
        obsVersion: String(versionRes?.obsVersion || ''),
        obsWebSocketVersion: String(versionRes?.obsWebSocketVersion || ''),
        obsScenes,
        obsInputs,
        activeObsScene,
        previewObsScene,
        studioModeEnabled,
        currentTransitionName,
        currentTransitionDurationMs,
        obsTransitions,
        primaryAudioInput: audioMeter.primaryInputName,
        obsStreamActive: Boolean((streamStatusRes as any)?.outputActive),
        obsStreamTimecode: String((streamStatusRes as any)?.outputTimecode || ''),
        obsStreamBytes:
          typeof (streamStatusRes as any)?.outputBytes === 'number'
            ? Number((streamStatusRes as any).outputBytes)
            : null,
        obsStreamDurationMs:
          typeof (streamStatusRes as any)?.outputDuration === 'number'
            ? Number((streamStatusRes as any).outputDuration)
            : null,
        obsRecordActive: Boolean((recordStatusRes as any)?.outputActive),
        obsRecordTimecode: String((recordStatusRes as any)?.outputTimecode || ''),
        obsStats: statsRes
          ? {
              cpuUsage: Number((statsRes as any).cpuUsage || 0),
              activeFps: Number((statsRes as any).activeFps || 0),
              outputSkippedFrames: Number((statsRes as any).outputSkippedFrames || 0),
              outputTotalFrames: Number((statsRes as any).outputTotalFrames || 0),
              averageFrameRenderTime: Number((statsRes as any).averageFrameRenderTime || 0),
              memoryUsageMb: Number((statsRes as any).memoryUsage || 0),
            }
          : null,
        lastSyncedAt: new Date(),
      },
    },
    { new: true }
  );

  await reconcileCameraActiveStates(matchId, activeObsScene);
  return { profile: updated, activeObsScene, obsScenes, obsInputs };
}

export async function disconnectObs(matchId: string, actor?: IUser | null) {
  const actorName = actor?.name || 'Admin';
  const session = directSessions.get(matchId);
  if (session) {
    clearReconnectTimer(session);
    clearKeepaliveTimer(session);
    session.manualDisconnect = true;
    try {
      await session.obs.disconnect();
    } catch {
      // Ignore close error
    }
    directSessions.delete(matchId);
  }

  const profile = await ObsControllerProfile.findOneAndUpdate(
    { matchId },
    {
      $set: {
        connectionStatus: 'DISCONNECTED',
        obsStreamActive: false,
        lastError: `Disconnected by ${actorName}`,
        desiredConnected: false,
        manualDisconnect: true,
        manualDisconnectedAt: new Date(),
        manualDisconnectedBy: actorName,
      },
    },
    { new: true }
  );

  // If using Windows Local OBS Bridge, instruct the bridge to pause OBS auto-reconnect until Admin reconnects
  if (profile?.connectionMode === 'local_agent') {
    const resolved = await resolveAgentSocketForMatch(matchId);
    if (resolved?.socket?.connected) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 2500);
        resolved.socket.emit(
          'server:obs_command',
          { command: 'disconnect_obs', payload: { reason: `Disconnected by ${actorName}` } },
          () => {
            clearTimeout(t);
            resolve();
          }
        );
      });
    }
  }

  await reconcileCameraActiveStates(matchId, '');
  await writeBroadcastAudit({
    matchId,
    actionType: 'OBS_DISCONNECT',
    actor: actor || null,
    obsStatus: 'SUCCESS',
  });
  emitBroadcastStudioEvent(matchId, 'OBS_DISCONNECTED', {
    matchId,
    connectionStatus: 'DISCONNECTED',
    manualDisconnect: true,
    reason: `Disconnected by ${actorName}`,
  });
  await emitFullStudioState(matchId);
  return formatSafeProfile(profile);
}

export async function connectLocalAgentObs(matchId: string, actor?: IUser | null) {
  await ObsControllerProfile.findOneAndUpdate(
    { matchId },
    {
      $set: {
        desiredConnected: true,
        manualDisconnect: false,
        manualDisconnectedAt: null,
        manualDisconnectedBy: '',
        lastError: '',
      },
    }
  );
  const resolved = await resolveAgentSocketForMatch(matchId);
  if (!resolved || !resolved.socket?.connected) {
    const err: any = new Error(
      'Windows Local OBS Bridge is reconnecting or offline. Keep the Bridge app running and retry once connected.'
    );
    err.statusCode = 503;
    throw err;
  }

  await new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timed out asking Windows OBS Bridge to reconnect OBS Studio.'));
    }, 10_000);
    resolved.socket.emit('server:obs_command', { command: 'reconnect_obs', payload: {} }, (ack: any) => {
      clearTimeout(timer);
      if (!ack || !ack.ok) {
        reject(new Error(ack?.error || 'Failed to reconnect OBS Studio from Bridge.'));
        return;
      }
      resolve(ack.data || {});
    });
  });

  const snapshot = await refreshObsState(matchId).catch(() => null);
  const updated = await ObsControllerProfile.findOne({ matchId }).lean();
  await writeBroadcastAudit({
    matchId,
    actionType: 'OBS_CONNECT',
    actor: actor || null,
    obsStatus: 'SUCCESS',
  });
  return { ok: true, profile: formatSafeProfile(updated), snapshot };
}

async function callObsRpc<T = any>(
  matchId: string,
  command: string,
  payload: Record<string, any> = {}
): Promise<T> {
  const profile = await ObsControllerProfile.findOne({ matchId }).lean();
  if (!profile) {
    throw new Error('OBS profile not initialized.');
  }

  if (profile.connectionMode === 'local_agent') {
    const resolved = await resolveAgentSocketForMatch(matchId);
    if (!resolved) {
      throw new Error(
        'Windows Local OBS Bridge is offline. Start your registered OBS Bridge on the OBS laptop and assign it to this match.'
      );
    }

    const emitOnce = () =>
      new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`OBS Local Bridge timed out executing "${command}".`));
        }, 10_000);

        resolved.socket.emit('server:obs_command', { command, payload }, (ack: any) => {
          clearTimeout(timer);
          if (!ack || !ack.ok) {
            reject(new Error(ack?.error || `OBS command "${command}" failed.`));
            return;
          }
          resolve(ack.data as T);
        });
      });

    try {
      return await emitOnce();
    } catch (err: any) {
      const msg = String(err?.message || '');
      const isTimeout = msg.toLowerCase().includes('timed out');
      if (isTimeout && resolved.socket.connected) {
        await new Promise((r) => setTimeout(r, 300));
        return await emitOnce();
      }
      throw err;
    }
  }

  // Direct WebSocket mode
  const session = directSessions.get(matchId);
  if (!session || !session.connected) {
    throw new Error('OBS Studio WebSocket is not connected. Click Connect OBS first.');
  }
  return await executeDirectObsCommand(matchId, session.obs, command, payload);
}

async function ensureSceneAndInputDirect(
  obs: OBSWebSocket,
  sceneName: string,
  inputName: string,
  inputKind: string,
  inputSettings: Record<string, any>
): Promise<number | null> {
  const sceneList = await obs.call('GetSceneList');
  const exists = Array.isArray(sceneList?.scenes)
    ? sceneList.scenes.some((s: any) => s.sceneName === sceneName)
    : false;
  if (!exists) {
    await obs.call('CreateScene', { sceneName });
  }

  if (!inputName) return null;

  const itemsRes = await obs.call('GetSceneItemList', { sceneName });
  const existingItem = Array.isArray(itemsRes?.sceneItems)
    ? itemsRes.sceneItems.find((item: any) => item.sourceName === inputName)
    : null;

  if (existingItem) {
    if (inputSettings && Object.keys(inputSettings).length > 0 && existingItem.inputKind) {
      await obs.call('SetInputSettings', { inputName, inputSettings, overlay: true }).catch(() => {});
    }
    return Number(existingItem.sceneItemId);
  }

  // Check if input already exists globally in OBS
  const inputsRes = await obs.call('GetInputList').catch(() => ({ inputs: [] }));
  const globalInput = Array.isArray((inputsRes as any)?.inputs)
    ? (inputsRes as any).inputs.find((inp: any) => inp.inputName === inputName)
    : null;

  if (globalInput) {
    if (inputSettings && Object.keys(inputSettings).length > 0) {
      await obs.call('SetInputSettings', { inputName, inputSettings, overlay: true }).catch(() => {});
    }
    const createdItem = await obs.call('CreateSceneItem', {
      sceneName,
      sourceName: inputName,
      sceneItemEnabled: true,
    });
    return Number(createdItem.sceneItemId);
  }

  const created = await obs.call('CreateInput', {
    sceneName,
    inputName,
    inputKind,
    inputSettings,
    sceneItemEnabled: true,
  });
  return Number(created.sceneItemId);
}

async function applyDirectSceneItemTransformSafe(
  obs: OBSWebSocket,
  sceneName: string,
  sceneItemId: number,
  box: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotation?: number;
    previewFit?: string;
  }
) {
  const transform = buildObsSceneItemTransform({
    x: Number(box.x ?? 0),
    y: Number(box.y ?? 0),
    width: Number(box.width ?? 1920),
    height: Number(box.height ?? 1080),
    rotationDeg: Number(box.rotation ?? 0),
    previewFit: box.previewFit,
  });
  try {
    await obs.call('SetSceneItemTransform', {
      sceneName,
      sceneItemId,
      sceneItemTransform: transform,
    });
    return transform;
  } catch {
    const { cropToBounds: _omit, ...fallbackTransform } = transform;
    await obs.call('SetSceneItemTransform', {
      sceneName,
      sceneItemId,
      sceneItemTransform: fallbackTransform,
    });
    return fallbackTransform;
  }
}

export async function executeDirectObsCommand(
  matchId: string,
  obs: OBSWebSocket,
  command: string,
  payload: Record<string, any>
): Promise<any> {
  if (command === 'get_snapshot') {
    return await pullDirectObsSnapshot(matchId, obs);
  }

  if (command === 'switch_scene') {
    const sceneName = String(payload.sceneName || '');
    if (!sceneName) throw new Error('Scene name is required.');

    if (payload.ensureInput) {
      const ensuredItemId = await ensureSceneAndInputDirect(
        obs,
        sceneName,
        payload.ensureInput.inputName,
        payload.ensureInput.inputKind || 'browser_source',
        payload.ensureInput.inputSettings || {}
      );
      if (ensuredItemId !== null && payload.ensureTransform) {
        await applyDirectSceneItemTransformSafe(
          obs,
          sceneName,
          ensuredItemId,
          payload.ensureTransform
        );
      }
    }

    if (payload.scoreboardOverlay) {
      const sbName = String(payload.scoreboardOverlay.sourceName || 'MaidanLive_Scoreboard_Overlay');
      if (payload.scoreboardOverlay.enabled && payload.scoreboardOverlay.url) {
        const sbItemId = await ensureSceneAndInputDirect(
          obs,
          sceneName,
          sbName,
          'browser_source',
          {
            url: payload.scoreboardOverlay.url,
            width: 1920,
            height: 1080,
            reroute_audio: false,
          }
        );
        if (sbItemId !== null) {
          await obs
            .call('SetSceneItemEnabled', {
              sceneName,
              sceneItemId: sbItemId,
              sceneItemEnabled: true,
            })
            .catch(() => {});
        }
        if (payload.scoreboardOverlay.refreshBrowserCache) {
          await obs
            .call('PressInputPropertiesButton', {
              inputName: sbName,
              propertyName: 'refreshnocache',
            })
            .catch(() => {});
        }
      } else if (payload.scoreboardOverlay.enabled === false) {
        const curList = await obs.call('GetSceneItemList', { sceneName }).catch(() => ({ sceneItems: [] }));
        const sbExisting = Array.isArray((curList as any)?.sceneItems)
          ? (curList as any).sceneItems.find((i: any) => i.sourceName === sbName)
          : null;
        if (sbExisting) {
          await obs
            .call('SetSceneItemEnabled', {
              sceneName,
              sceneItemId: Number(sbExisting.sceneItemId),
              sceneItemEnabled: false,
            })
            .catch(() => {});
        }
      }
    }

    if (Number.isFinite(Number(payload.transitionDurationMs))) {
      const dur = Math.max(0, Math.min(5000, Math.round(Number(payload.transitionDurationMs))));
      await obs.call('SetCurrentSceneTransitionDuration', { transitionDuration: dur }).catch(() => {});
    }

    await obs.call('SetCurrentProgramScene', { sceneName });
    const verified = await obs.call('GetCurrentProgramScene');
    if (verified.currentProgramSceneName !== sceneName) {
      throw new Error(
        `OBS scene verification mismatch: expected "${sceneName}", got "${verified.currentProgramSceneName}".`
      );
    }
    const snapshot = await pullDirectObsSnapshot(matchId, obs);
    return {
      verifiedScene: verified.currentProgramSceneName,
      obsScenes: snapshot.obsScenes,
      obsStreamActive: snapshot.profile?.obsStreamActive ?? false,
    };
  }

  if (command === 'trigger_transition') {
    const transitionName =
      typeof payload.transitionName === 'string' ? payload.transitionName.trim() : '';
    if (transitionName) {
      await obs.call('SetCurrentSceneTransition', { transitionName });
    }
    if (Number.isFinite(Number(payload.transitionDurationMs))) {
      const dur = Math.max(0, Math.min(5000, Math.round(Number(payload.transitionDurationMs))));
      await obs.call('SetCurrentSceneTransitionDuration', { transitionDuration: dur }).catch(() => {});
    }
    const studioRes = await obs.call('GetStudioModeEnabled').catch(() => ({ studioModeEnabled: false }));
    let studioModeEnabled = Boolean((studioRes as any)?.studioModeEnabled);
    if (!studioModeEnabled) {
      if (payload.ensureStudioMode === false) {
        throw new Error('OBS Studio Mode is disabled.');
      }
      await obs.call('SetStudioModeEnabled', { studioModeEnabled: true });
      studioModeEnabled = true;
    }
    const targetPreview = String(payload.previewSceneName || payload.sceneName || '').trim();
    if (targetPreview) {
      await obs.call('SetCurrentPreviewScene', { sceneName: targetPreview });
    }
    await obs.call('TriggerStudioModeTransition');
    const snapshot = await pullDirectObsSnapshot(matchId, obs);
    return {
      triggered: true,
      studioModeEnabled,
      activeObsScene: snapshot.activeObsScene,
      previewObsScene: snapshot.profile?.previewObsScene || '',
      currentTransitionName: snapshot.profile?.currentTransitionName || '',
      currentTransitionDurationMs: snapshot.profile?.currentTransitionDurationMs ?? 300,
    };
  }

  if (command === 'set_studio_mode') {
    const studioModeEnabled = Boolean(payload.studioModeEnabled);
    await obs.call('SetStudioModeEnabled', { studioModeEnabled });
    const snapshot = await pullDirectObsSnapshot(matchId, obs);
    return {
      studioModeEnabled: Boolean(snapshot.profile?.studioModeEnabled),
      activeObsScene: snapshot.activeObsScene,
      previewObsScene: snapshot.profile?.previewObsScene || '',
    };
  }

  if (command === 'set_preview_scene') {
    const sceneName = String(payload.sceneName || '').trim();
    if (!sceneName) throw new Error('sceneName is required.');
    const studioRes = await obs.call('GetStudioModeEnabled').catch(() => ({ studioModeEnabled: false }));
    if (!(studioRes as any)?.studioModeEnabled) {
      await obs.call('SetStudioModeEnabled', { studioModeEnabled: true });
    }
    await obs.call('SetCurrentPreviewScene', { sceneName });
    const snapshot = await pullDirectObsSnapshot(matchId, obs);
    return {
      studioModeEnabled: true,
      previewObsScene: snapshot.profile?.previewObsScene || sceneName,
      activeObsScene: snapshot.activeObsScene,
    };
  }

  if (command === 'set_primary_audio_input') {
    const inputName = String(payload.inputName || '').trim();
    await ObsControllerProfile.findOneAndUpdate(
      { matchId },
      { $set: { primaryAudioInput: inputName } }
    );
    const snapshot = await pullDirectObsSnapshot(matchId, obs);
    return {
      primaryAudioInput: snapshot.profile?.primaryAudioInput || inputName,
      audioMeter: latestAudioMeterByMatch.get(matchId) || null,
    };
  }

  if (command === 'apply_layout') {
    const sceneName = String(payload.sceneName || '');
    const boxes = Array.isArray(payload.boxes) ? payload.boxes : [];
    const allInputs = Array.isArray(payload.allCameraInputs) ? payload.allCameraInputs : [];
    if (!sceneName) throw new Error('Target layout scene name is required.');

    const sceneList = await obs.call('GetSceneList');
    const sceneExists = Array.isArray(sceneList?.scenes)
      ? sceneList.scenes.some((s: any) => s.sceneName === sceneName)
      : false;
    if (!sceneExists) {
      await obs.call('CreateScene', { sceneName });
    }

    // Hide any camera items in this scene not part of active layout boxes
    const selectedSet = new Set(boxes.map((b: any) => b.inputName));
    const currentItemsRes = await obs.call('GetSceneItemList', { sceneName });
    const currentItems = Array.isArray(currentItemsRes?.sceneItems) ? currentItemsRes.sceneItems : [];

    for (const item of currentItems) {
      if (allInputs.includes(item.sourceName) && !selectedSet.has(item.sourceName)) {
        await obs
          .call('SetSceneItemEnabled', {
            sceneName,
            sceneItemId: Number(item.sceneItemId),
            sceneItemEnabled: false,
          })
          .catch(() => {});
      }
    }

    // Position and enable each selected camera box on the 1920x1080 canvas
    const appliedBoxItems: Array<{ itemId: number; slotIndex: number }> = [];
    for (const box of boxes) {
      if (!box.inputName) continue;
      const itemId = await ensureSceneAndInputDirect(
        obs,
        sceneName,
        box.inputName,
        box.inputKind || 'browser_source',
        box.inputSettings || {}
      );
      if (itemId !== null) {
        await obs.call('SetSceneItemEnabled', {
          sceneName,
          sceneItemId: itemId,
          sceneItemEnabled: true,
        });
        await applyDirectSceneItemTransformSafe(obs, sceneName, itemId, box);
        appliedBoxItems.push({ itemId, slotIndex: Number(box.slotIndex) || 0 });
      }
    }

    appliedBoxItems.sort((a, b) => a.slotIndex - b.slotIndex);
    for (let idx = 0; idx < appliedBoxItems.length; idx += 1) {
      await obs
        .call('SetSceneItemIndex', {
          sceneName,
          sceneItemId: appliedBoxItems[idx].itemId,
          sceneItemIndex: idx,
        })
        .catch(() => {});
    }

    // Scoreboard Browser Source overlay on top of camera boxes
    if (payload.scoreboardOverlay?.sourceName) {
      const sbName = String(payload.scoreboardOverlay.sourceName);
      if (payload.scoreboardOverlay.enabled && payload.scoreboardOverlay.url) {
        const sbItemId = await ensureSceneAndInputDirect(obs, sceneName, sbName, 'browser_source', {
          url: payload.scoreboardOverlay.url,
          width: 1920,
          height: 1080,
          reroute_audio: false,
        });
        if (sbItemId !== null) {
          await obs.call('SetSceneItemEnabled', {
            sceneName,
            sceneItemId: sbItemId,
            sceneItemEnabled: true,
          });
          await obs
            .call('SetSceneItemTransform', {
              sceneName,
              sceneItemId: sbItemId,
              sceneItemTransform: {
                positionX: 0,
                positionY: 0,
                alignment: 5,
                boundsType: 'OBS_BOUNDS_SCALE_INNER',
                boundsAlignment: 0,
                boundsWidth: 1920,
                boundsHeight: 1080,
              },
            })
            .catch(() => {});
          // Keep scoreboard on top layer
          const updatedList = await obs.call('GetSceneItemList', { sceneName });
          const maxIndex = Math.max(0, (updatedList.sceneItems?.length || 1) - 1);
          await obs
            .call('SetSceneItemIndex', {
              sceneName,
              sceneItemId: sbItemId,
              sceneItemIndex: maxIndex,
            })
            .catch(() => {});
        }
      } else {
        const sbExisting = currentItems.find((i: any) => i.sourceName === sbName);
        if (sbExisting) {
          await obs
            .call('SetSceneItemEnabled', {
              sceneName,
              sceneItemId: Number(sbExisting.sceneItemId),
              sceneItemEnabled: false,
            })
            .catch(() => {});
        }
      }
    }

    if (Number.isFinite(Number(payload.transitionDurationMs))) {
      const dur = Math.max(0, Math.min(5000, Math.round(Number(payload.transitionDurationMs))));
      await obs.call('SetCurrentSceneTransitionDuration', { transitionDuration: dur }).catch(() => {});
    }

    await obs.call('SetCurrentProgramScene', { sceneName });
    const verified = await obs.call('GetCurrentProgramScene');
    if (verified.currentProgramSceneName !== sceneName) {
      throw new Error(
        `OBS layout confirmation failed: expected "${sceneName}", got "${verified.currentProgramSceneName}".`
      );
    }
    const snapshot = await pullDirectObsSnapshot(matchId, obs);
    return {
      verifiedScene: verified.currentProgramSceneName,
      obsScenes: snapshot.obsScenes,
      obsStreamActive: snapshot.profile?.obsStreamActive ?? false,
    };
  }

  if (command === 'screenshot') {
    const sourceName = String(payload.sourceName || '');
    if (!sourceName) throw new Error('Source name is required for preview screenshot.');
    const fallbacks = Array.isArray(payload.fallbackSourceNames)
      ? payload.fallbackSourceNames.map((n: unknown) => String(n || '').trim()).filter(Boolean)
      : [];
    const candidates = Array.from(new Set([sourceName, ...fallbacks]));
    let lastErr: any = null;
    for (const candidate of candidates) {
      try {
        const res = await obs.call('GetSourceScreenshot', {
          sourceName: candidate,
          imageFormat: 'jpeg',
          imageWidth: 640,
          imageHeight: 360,
          imageCompressionQuality: 70,
        });
        return { imageData: res.imageData };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error(`Unable to capture screenshot for "${sourceName}".`);
  }

  if (command === 'start_stream') {
    await obs.call('StartStream');
    await pullDirectObsSnapshot(matchId, obs);
    return { obsStreamActive: true };
  }

  if (command === 'stop_stream') {
    await obs.call('StopStream');
    await pullDirectObsSnapshot(matchId, obs);
    return { obsStreamActive: false };
  }

  if (command === 'start_record') {
    await obs.call('StartRecord');
    await pullDirectObsSnapshot(matchId, obs);
    return { obsRecordActive: true };
  }

  if (command === 'stop_record') {
    const res = await obs.call('StopRecord');
    await pullDirectObsSnapshot(matchId, obs);
    return { obsRecordActive: false, outputPath: (res as any)?.outputPath || '' };
  }

  if (command === 'set_input_mute') {
    const inputName = String(payload.inputName || '');
    const inputMuted = Boolean(payload.inputMuted);
    if (!inputName) throw new Error('inputName is required.');
    await obs.call('SetInputMute', { inputName, inputMuted });
    const verify = await obs.call('GetInputMute', { inputName }).catch(() => ({ inputMuted }));
    return { inputName, inputMuted: Boolean((verify as any).inputMuted) };
  }

  if (command === 'get_input_mute') {
    const inputName = String(payload.inputName || '');
    if (!inputName) throw new Error('inputName is required.');
    const res = await obs.call('GetInputMute', { inputName });
    return { inputName, inputMuted: Boolean((res as any).inputMuted) };
  }

  if (command === 'reconnect_input') {
    const sceneName = String(payload.sceneName || '');
    const inputName = String(payload.inputName || '');
    const inputKind = String(payload.inputKind || 'browser_source');
    if (sceneName && inputName && inputKind) {
      await ensureSceneAndInputDirect(
        obs,
        sceneName,
        inputName,
        inputKind,
        payload.inputSettings || {}
      ).catch(() => {});
    }
    if (inputName) {
      if (inputKind === 'ffmpeg_source') {
        await obs
          .call('TriggerMediaInputAction', {
            inputName,
            mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
          })
          .catch(() => {});
      } else {
        await obs
          .call('PressInputPropertiesButton', {
            inputName,
            propertyName: 'refreshnocache',
          })
          .catch(() => {});
      }
    }
    const snapshot = await pullDirectObsSnapshot(matchId, obs);
    return {
      reconnected: true,
      inputName,
      obsScenes: snapshot.obsScenes,
    };
  }

  if (command === 'remove_input') {
    const inputName = String(payload.inputName || '').trim();
    if (!inputName) throw new Error('inputName is required.');
    await obs.call('RemoveInput', { inputName }).catch(() => {});
    const snapshot = await pullDirectObsSnapshot(matchId, obs);
    return { removed: true, inputName, obsScenes: snapshot.obsScenes };
  }

  if (command === 'get_scene_items') {
    let targetScene = String(payload.sceneName || '');
    if (!targetScene) {
      const cur = await obs.call('GetCurrentProgramScene');
      targetScene = String((cur as any)?.currentProgramSceneName || '');
    }
    if (!targetScene) throw new Error('No active OBS scene selected.');
    const itemsRes = await obs.call('GetSceneItemList', { sceneName: targetScene });
    const items = Array.isArray(itemsRes?.sceneItems)
      ? itemsRes.sceneItems.map((it: any) => ({
          sceneItemId: Number(it.sceneItemId),
          sourceName: String(it.sourceName || ''),
          sourceType: String(it.sourceType || ''),
          inputKind: String(it.inputKind || ''),
          sceneItemEnabled: Boolean(it.sceneItemEnabled),
          sceneItemLocked: Boolean(it.sceneItemLocked),
        }))
      : [];
    return { sceneName: targetScene, items };
  }

  if (command === 'set_scene_item_enabled') {
    const sceneName = String(payload.sceneName || '');
    const sceneItemId = Number(payload.sceneItemId);
    const enabled = Boolean(payload.enabled);
    if (!sceneName || !Number.isFinite(sceneItemId)) {
      throw new Error('sceneName and valid sceneItemId are required.');
    }
    await obs.call('SetSceneItemEnabled', {
      sceneName,
      sceneItemId,
      sceneItemEnabled: enabled,
    });
    const verify = await obs
      .call('GetSceneItemEnabled', { sceneName, sceneItemId })
      .catch(() => ({ sceneItemEnabled: enabled }));
    await pullDirectObsSnapshot(matchId, obs);
    return {
      sceneName,
      sceneItemId,
      sceneItemEnabled: Boolean((verify as any).sceneItemEnabled),
    };
  }

  if (command === 'get_input_list') {
    const inputsRes = await obs.call('GetInputList').catch(() => ({ inputs: [] }));
    const inputs = Array.isArray((inputsRes as any)?.inputs)
      ? (inputsRes as any).inputs
          .map((inp: any) => ({
            inputName: String(inp.inputName || '').trim(),
            inputKind: String(inp.inputKind || '').trim(),
            unversionedInputKind: String(inp.unversionedInputKind || '').trim(),
          }))
          .filter((inp: any) => Boolean(inp.inputName))
      : [];
    return { inputs };
  }

  if (command === 'update_camera_transform') {
    const inputName = String(payload.inputName || '').trim();
    let sceneName = String(payload.sceneName || '').trim();
    if (!inputName) throw new Error('inputName is required.');
    if (!sceneName) {
      const cur = await obs.call('GetCurrentProgramScene');
      sceneName = String((cur as any)?.currentProgramSceneName || '');
    }
    if (!sceneName) throw new Error('No target OBS scene found.');

    const itemsRes = await obs.call('GetSceneItemList', { sceneName });
    const items = Array.isArray(itemsRes?.sceneItems) ? itemsRes.sceneItems : [];
    const found = items.find((it: any) => it.sourceName === inputName);
    let sceneItemId = found ? Number(found.sceneItemId) : null;
    if (sceneItemId === null && payload.ensureInput) {
      sceneItemId = await ensureSceneAndInputDirect(
        obs,
        sceneName,
        inputName,
        String(payload.ensureInput.inputKind || 'browser_source'),
        payload.ensureInput.inputSettings || {}
      );
    }
    if (sceneItemId === null) {
      throw new Error(`Source "${inputName}" is not inside OBS scene "${sceneName}".`);
    }

    const appliedTransform = await applyDirectSceneItemTransformSafe(obs, sceneName, sceneItemId, {
      x: Number(payload.x ?? 0),
      y: Number(payload.y ?? 0),
      width: Number(payload.width ?? 1920),
      height: Number(payload.height ?? 1080),
      rotation: Number(payload.rotation ?? 0),
      previewFit: String(payload.previewFit || 'contain'),
    });
    await pullDirectObsSnapshot(matchId, obs);
    return { sceneName, sceneItemId, inputName, transform: appliedTransform };
  }

  if (command === 'get_scene_transforms') {
    let targetScene = String(payload.sceneName || '').trim();
    if (!targetScene) {
      const cur = await obs.call('GetCurrentProgramScene');
      targetScene = String((cur as any)?.currentProgramSceneName || '');
    }
    if (!targetScene) throw new Error('No active OBS scene selected.');
    const itemsRes = await obs.call('GetSceneItemList', { sceneName: targetScene });
    const items = Array.isArray(itemsRes?.sceneItems) ? itemsRes.sceneItems : [];
    const transforms: ObsSceneTransformItem[] = [];
    for (const it of items) {
      try {
        const tRes = await obs.call('GetSceneItemTransform', {
          sceneName: targetScene,
          sceneItemId: Number(it.sceneItemId),
        });
        const t: any = (tRes as any)?.sceneItemTransform || {};
        transforms.push({
          sceneItemId: Number(it.sceneItemId),
          sourceName: String(it.sourceName || ''),
          sourceWidth: Number(t.sourceWidth || 0),
          sourceHeight: Number(t.sourceHeight || 0),
          width: Number(t.width || 0),
          height: Number(t.height || 0),
          rotation: Number(t.rotation || 0),
          boundsType: String(t.boundsType || ''),
          boundsWidth: Number(t.boundsWidth || 0),
          boundsHeight: Number(t.boundsHeight || 0),
          positionX: Number(t.positionX || 0),
          positionY: Number(t.positionY || 0),
        });
      } catch {
        // Skip non-transformable audio/filter items cleanly
      }
    }
    return { sceneName: targetScene, transforms };
  }

  throw new Error(`Unsupported OBS command: ${command}`);
}

export async function refreshObsState(matchId: string) {
  const data = await callObsRpc(matchId, 'get_snapshot', {});
  const obsScenes = Array.isArray(data?.obsScenes)
    ? data.obsScenes.filter((s: unknown): s is string => typeof s === 'string')
    : undefined;
  const activeObsScene =
    typeof data?.activeObsScene === 'string' ? data.activeObsScene : undefined;

  const updateFields: Record<string, any> = {
    connectionStatus: 'CONNECTED',
    desiredConnected: true,
    manualDisconnect: false,
    manualDisconnectedAt: null,
    manualDisconnectedBy: '',
    lastError: '',
    lastSyncedAt: new Date(),
  };
  if (obsScenes) updateFields.obsScenes = obsScenes;
  if (Array.isArray(data?.obsInputs)) {
    updateFields.obsInputs = data.obsInputs
      .filter((inp: any) => inp && typeof inp.inputName === 'string' && inp.inputName.trim())
      .slice(0, 100)
      .map((inp: any) => ({
        inputName: String(inp.inputName).trim().slice(0, 140),
        inputKind: String(inp.inputKind || '').trim().slice(0, 80),
        unversionedInputKind: String(inp.unversionedInputKind || '').trim().slice(0, 80),
      }));
  }
  if (activeObsScene !== undefined) updateFields.activeObsScene = activeObsScene;
  if (typeof data?.obsVersion === 'string') updateFields.obsVersion = data.obsVersion;
  if (typeof data?.obsWebSocketVersion === 'string') {
    updateFields.obsWebSocketVersion = data.obsWebSocketVersion;
  }
  if (typeof data?.obsStreamActive === 'boolean') {
    updateFields.obsStreamActive = data.obsStreamActive;
  }
  if (typeof data?.obsRecordActive === 'boolean') {
    updateFields.obsRecordActive = data.obsRecordActive;
  }

  await ObsControllerProfile.findOneAndUpdate({ matchId }, { $set: updateFields });
  if (obsScenes) {
    emitBroadcastStudioEvent(matchId, 'SCENE_LIST_UPDATED', {
      matchId,
      obsScenes,
      activeObsScene: activeObsScene || '',
    });
  }
  await emitFullStudioState(matchId);
  return data;
}

export async function testObsConnection(
  matchId: string,
  candidate?: { obsProtocol?: 'ws' | 'wss'; obsHost?: string; obsPort?: number; obsPassword?: string }
): Promise<{
  ok: boolean;
  mode: string;
  obsVersion?: string;
  obsWebSocketVersion?: string;
  sceneCount?: number;
  scenes?: string[];
  latencyMs: number;
  message: string;
}> {
  const started = Date.now();
  const profile = await ObsControllerProfile.findOne({ matchId }).select('+obsPasswordEnc');
  if (!profile) {
    return {
      ok: false,
      mode: 'unknown',
      latencyMs: Date.now() - started,
      message: 'OBS profile not initialized.',
    };
  }

  if (profile.connectionMode === 'local_agent' && !candidate?.obsHost) {
    try {
      const res = await callObsRpc(matchId, 'get_snapshot', {});
      return {
        ok: true,
        mode: 'local_agent',
        obsVersion: res?.obsVersion || profile.obsVersion,
        obsWebSocketVersion: res?.obsWebSocketVersion || profile.obsWebSocketVersion,
        sceneCount: Array.isArray(res?.obsScenes) ? res.obsScenes.length : profile.obsScenes.length,
        scenes: Array.isArray(res?.obsScenes) ? res.obsScenes : profile.obsScenes,
        latencyMs: Date.now() - started,
        message: 'Local OBS Controller Agent and OBS WebSocket responded cleanly.',
      };
    } catch (err: any) {
      return {
        ok: false,
        mode: 'local_agent',
        latencyMs: Date.now() - started,
        message: err?.message || 'Local OBS Agent is offline.',
      };
    }
  }

  const proto = candidate?.obsProtocol || profile.obsProtocol || 'ws';
  const host = candidate?.obsHost || profile.obsHost || '127.0.0.1';
  const port = Number(candidate?.obsPort || profile.obsPort || 4455);
  const pwd =
    candidate?.obsPassword !== undefined
      ? candidate.obsPassword
      : profile.obsPasswordEnc
        ? decryptObsSecret(profile.obsPasswordEnc)
        : '';

  const testObs = new OBSWebSocket();
  const url = `${proto}://${host}:${port}`;
  try {
    await Promise.race([
      testObs.connect(url, pwd || undefined, { rpcVersion: 1 }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Connection timed out (${url})`)), 5000)
      ),
    ]);
    const [ver, scenes] = await Promise.all([
      testObs.call('GetVersion'),
      testObs.call('GetSceneList'),
    ]);
    await testObs.disconnect();
    const sceneNames = Array.isArray(scenes?.scenes)
      ? scenes.scenes.map((s: any) => String(s.sceneName || '')).filter(Boolean)
      : [];
    return {
      ok: true,
      mode: 'direct_ws',
      obsVersion: ver.obsVersion,
      obsWebSocketVersion: ver.obsWebSocketVersion,
      sceneCount: sceneNames.length,
      scenes: sceneNames,
      latencyMs: Date.now() - started,
      message: `Connected to OBS ${ver.obsVersion} (${sceneNames.length} scenes found).`,
    };
  } catch (err: any) {
    try {
      await testObs.disconnect();
    } catch {
      // Ignore cleanup
    }
    return {
      ok: false,
      mode: 'direct_ws',
      latencyMs: Date.now() - started,
      message: err?.message || `Unable to reach OBS WebSocket at ${url}`,
    };
  }
}

function checkAdminOverrideGuard(profile: IObsControllerProfile, actor: IUser, overrideFlag?: boolean) {
  if (!profile.adminOverrideLocked) return;
  const isOwner =
    profile.adminOverrideByUserId &&
    profile.adminOverrideByUserId.toString() === actor._id.toString();
  const isSuperOrAdmin = actor.role === 'SUPER_ADMIN' || actor.role === 'ADMIN';
  if (isOwner && overrideFlag !== false) return;
  if (isSuperOrAdmin && overrideFlag) return;

  const reason = profile.adminOverrideReason ? ` (${profile.adminOverrideReason})` : '';
  const holder = profile.adminOverrideByName || 'Administrator';
  const err: any = new Error(
    `Broadcast control is locked by Admin Override (${holder}${reason}). Disable or confirm Admin Override to switch.`
  );
  err.statusCode = 423;
  throw err;
}

export async function switchCameraLive(
  matchId: string,
  cameraId: string,
  actor: IUser,
  options: { override?: boolean; baseAppUrl?: string; transitionDurationMs?: number } = {}
) {
  const profile = await ensureObsProfileForMatch(matchId, actor._id as any);
  const camera = await BroadcastCamera.findOne({ matchId, cameraId });
  if (!camera) {
    const err: any = new Error(`Camera "${cameraId}" not found for this match.`);
    err.statusCode = 404;
    throw err;
  }
  if (!camera.enabled) {
    const err: any = new Error(`Camera "${camera.name}" is disabled. Enable it before taking it live.`);
    err.statusCode = 400;
    throw err;
  }

  try {
    checkAdminOverrideGuard(profile, actor, options.override);
  } catch (err: any) {
    await writeBroadcastAudit({
      matchId,
      tournamentId: profile.tournamentId ? String(profile.tournamentId) : null,
      actionType: 'CAMERA_SWITCH',
      cameraId: camera.cameraId,
      cameraName: camera.name,
      previousScene: profile.activeObsScene,
      newScene: camera.obsSceneName || `CAM ${camera.cameraNumber} FULL`,
      previousCameraId: profile.activeCameraId,
      newCameraId: camera.cameraId,
      layoutSelected: 'SINGLE',
      actor,
      adminOverride: Boolean(options.override),
      obsStatus: 'REJECTED',
      errorDetails: err.message,
    });
    throw err;
  }

  const prevScene = profile.activeObsScene || '';
  const prevCameraId = profile.activeCameraId || '';
  const targetSceneName = camera.obsSceneName?.trim() || `CAM ${camera.cameraNumber} FULL`;
  const roomPassword = await getRoomPasswordForProfile(profile);
  const baseAppUrl = (options.baseAppUrl || '').replace(/\/+$/, '');

  const cameraWithSecret = await BroadcastCamera.findOne({ matchId, cameraId })
    .select('+mediamtxStreamKeyEnc')
    .lean();
  const ensureInput = buildObsEnsureInputForCamera(
    cameraWithSecret || camera,
    profile,
    roomPassword
  );

  const rotationDeg = parseOrientationDegrees(camera.orientationMode);
  const previewFit = normalizePreviewFit(camera.previewFit);
  const ensureTransform = ensureInput
    ? {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        rotation: rotationDeg,
        previewFit,
      }
    : undefined;

  const streamMeta = await LiveStream.findById(matchId).select('showScoreboardOnYoutube').lean();
  const allowYoutubeScoreboard = streamMeta ? streamMeta.showScoreboardOnYoutube !== false : true;

  acquireSceneSwitchGuard(matchId);
  emitBroadcastStudioEvent(matchId, 'SCENE_SWITCH_REQUESTED', {
    matchId,
    targetScene: targetSceneName,
    cameraId: camera.cameraId,
    requestedBy: actor.name,
  });
  try {
    const rpcRes = await callObsRpc(matchId, 'switch_scene', {
      sceneName: targetSceneName,
      ensureInput,
      ensureTransform,
      ...(typeof options.transitionDurationMs === 'number'
        ? { transitionDurationMs: options.transitionDurationMs }
        : {}),
      scoreboardOverlay:
        profile.autoSyncScoreboardSource && baseAppUrl
          ? {
              enabled: allowYoutubeScoreboard,
              sourceName: profile.scoreboardSourceName || 'MaidanLive_Scoreboard_Overlay',
              url: `${baseAppUrl}/broadcast/overlay/view/${matchId}?obs=1&controls=0`,
            }
          : undefined,
    });

    const verifiedScene = String(rpcRes?.verifiedScene || targetSceneName);
    profile.activeObsScene = verifiedScene;
    profile.activeCameraId = camera.cameraId;
    profile.activeCameraIds = [camera.cameraId];
    profile.activeLayoutType = 'SINGLE';
    profile.lastSyncedAt = new Date();
    profile.updatedBy = actor._id as mongoose.Types.ObjectId;
    profile.activeControllerUserId = actor._id as mongoose.Types.ObjectId;
    profile.activeControllerName = actor.name;
    profile.activeControllerRole = actor.role;
    profile.activeControllerSince = new Date();
    if (Array.isArray(rpcRes?.obsScenes)) {
      profile.obsScenes = rpcRes.obsScenes;
    }
    await profile.save();

    await reconcileCameraActiveStates(matchId, verifiedScene);

    await writeBroadcastAudit({
      matchId,
      tournamentId: profile.tournamentId ? String(profile.tournamentId) : null,
      actionType: 'CAMERA_SWITCH',
      cameraId: camera.cameraId,
      cameraName: camera.name,
      previousScene: prevScene,
      newScene: verifiedScene,
      previousCameraId: prevCameraId,
      newCameraId: camera.cameraId,
      layoutSelected: 'SINGLE',
      actor,
      adminOverride: Boolean(options.override),
      obsStatus: 'SUCCESS',
    });

    await recordActivity(
      actor,
      'OBS_CAMERA_SWITCH',
      'LiveStream',
      matchId,
      `Switched OBS camera to ${camera.name} (${verifiedScene})`,
      {
        previousValue: { activeCameraId: prevCameraId, activeObsScene: prevScene },
        newValue: { activeCameraId: camera.cameraId, activeObsScene: verifiedScene },
      }
    );

    emitBroadcastStudioEvent(matchId, 'obs:scene_changed', {
      matchId,
      previousScene: prevScene,
      activeObsScene: verifiedScene,
      activeCameraId: camera.cameraId,
      activeLayoutType: 'SINGLE',
    });
    emitRoomOnlyEvent(matchId, 'obs:layout_updated', {
      matchId,
      activeLayoutType: 'SINGLE',
      activeCameraId: camera.cameraId,
      activeCameraIds: [camera.cameraId],
      activePipPosition: profile.activePipPosition || 'bottom-right',
      activePipSize: profile.activePipSize || 'medium',
      activeObsScene: verifiedScene,
    });
    emitBroadcastStudioEvent(matchId, 'SCENE_SWITCH_SUCCESS', {
      matchId,
      previousScene: prevScene,
      activeObsScene: verifiedScene,
      cameraId: camera.cameraId,
    });
    emitBroadcastStudioEvent(matchId, 'CURRENT_SCENE_CHANGED', {
      matchId,
      previousScene: prevScene,
      activeObsScene: verifiedScene,
    });
    await emitFullStudioState(matchId);

    return { verifiedScene, cameraId: camera.cameraId };
  } catch (err: any) {
    const errMsg = err?.message || 'OBS failed to switch camera.';
    await writeBroadcastAudit({
      matchId,
      tournamentId: profile.tournamentId ? String(profile.tournamentId) : null,
      actionType: 'CAMERA_SWITCH',
      cameraId: camera.cameraId,
      cameraName: camera.name,
      previousScene: prevScene,
      newScene: targetSceneName,
      previousCameraId: prevCameraId,
      newCameraId: camera.cameraId,
      layoutSelected: 'SINGLE',
      actor,
      adminOverride: Boolean(options.override),
      obsStatus: 'FAILED',
      errorDetails: errMsg,
    });
    emitBroadcastStudioEvent(matchId, 'obs:error', {
      matchId,
      message: errMsg,
    });
    emitBroadcastStudioEvent(matchId, 'SCENE_SWITCH_FAILED', {
      matchId,
      targetScene: targetSceneName,
      cameraId: camera.cameraId,
      error: errMsg,
    });
    throw err;
  } finally {
    releaseSceneSwitchGuard(matchId);
  }
}

export async function applyDynamicLayoutToObs(
  matchId: string,
  params: {
    layoutType: ObsLayoutType;
    cameraIds: string[];
    mainCameraId?: string;
    pipPosition?: PipPosition;
    pipSize?: PipSize;
    sceneName?: string;
    includeScoreboardOverlay?: boolean;
    override?: boolean;
    baseAppUrl?: string;
    transitionDurationMs?: number;
  },
  actor: IUser
) {
  const profile = await ensureObsProfileForMatch(matchId, actor._id as any);

  try {
    checkAdminOverrideGuard(profile, actor, params.override);
  } catch (err: any) {
    await writeBroadcastAudit({
      matchId,
      actionType: 'LAYOUT_SWITCH',
      previousScene: profile.activeObsScene,
      newScene: params.sceneName || LAYOUT_METADATA[params.layoutType]?.defaultSceneName || '',
      layoutSelected: params.layoutType,
      actor,
      adminOverride: Boolean(params.override),
      obsStatus: 'REJECTED',
      errorDetails: err.message,
    });
    throw err;
  }

  const allCameras = await BroadcastCamera.find({ matchId })
    .select('+mediamtxStreamKeyEnc')
    .sort({ sortOrder: 1, cameraNumber: 1 });
  const cameraMap = new Map(allCameras.map((c) => [c.cameraId, c]));
  const selectedIds = Array.from(
    new Set(
      params.cameraIds.filter((id) => {
        const cam = cameraMap.get(id);
        return cam && cam.enabled;
      })
    )
  );

  if (selectedIds.length === 0) {
    const err: any = new Error('Select at least one enabled camera for this layout.');
    err.statusCode = 400;
    throw err;
  }

  if (selectedIds.length > MAX_CONTROL_ROOM_CAMERAS) {
    const err: any = new Error(
      `Control Room supports a maximum of ${MAX_CONTROL_ROOM_CAMERAS} cameras per layout.`
    );
    err.statusCode = 400;
    throw err;
  }

  const boxes = computeObsLayoutBoxes(
    params.layoutType,
    selectedIds,
    params.mainCameraId || selectedIds[0],
    1920,
    1080,
    {
      pipPosition: params.pipPosition,
      pipSize: params.pipSize,
    }
  );

  const meta = LAYOUT_METADATA[params.layoutType] || LAYOUT_METADATA.DYNAMIC_GRID;
  const targetSceneName =
    params.sceneName?.trim() ||
    (params.layoutType === 'DYNAMIC_GRID'
      ? `MULTI CAM ${boxes.length}X`
      : meta.defaultSceneName);

  const roomPassword = await getRoomPasswordForProfile(profile);
  const obsBoxes = boxes.map((box) => {
    const cam = cameraMap.get(box.cameraId)!;
    const inputName = cam.obsInputName || `ML_CAM_${cam.cameraNumber}`;
    const ensured = buildObsEnsureInputForCamera(cam, profile, roomPassword);

    return {
      ...box,
      rotation: parseOrientationDegrees(cam.orientationMode),
      previewFit: normalizePreviewFit(cam.previewFit),
      inputName: ensured?.inputName || inputName,
      inputKind: ensured?.inputKind || '',
      inputSettings: ensured?.inputSettings || {},
    };
  });

  const allCameraInputs = allCameras.map((c) => c.obsInputName || `ML_CAM_${c.cameraNumber}`);
  const baseAppUrl = (params.baseAppUrl || '').replace(/\/+$/, '');
  const streamMeta = await LiveStream.findById(matchId).select('showScoreboardOnYoutube').lean();
  const allowYoutubeScoreboard = streamMeta ? streamMeta.showScoreboardOnYoutube !== false : true;
  const includeScoreboard = allowYoutubeScoreboard && params.includeScoreboardOverlay !== false;
  const prevScene = profile.activeObsScene || '';
  const prevCameraId = profile.activeCameraId || '';

  acquireSceneSwitchGuard(matchId);
  emitBroadcastStudioEvent(matchId, 'SCENE_SWITCH_REQUESTED', {
    matchId,
    targetScene: targetSceneName,
    layoutType: params.layoutType,
    requestedBy: actor.name,
  });
  try {
    const rpcRes = await callObsRpc(matchId, 'apply_layout', {
      sceneName: targetSceneName,
      layoutType: params.layoutType,
      boxes: obsBoxes,
      allCameraInputs,
      ...(typeof params.transitionDurationMs === 'number'
        ? { transitionDurationMs: params.transitionDurationMs }
        : {}),
      scoreboardOverlay: {
        // Always enable browser source for multi-camera layouts (>1 box) so 2px split borders render in OBS Program output
        enabled: boxes.length > 1 ? Boolean(baseAppUrl) : includeScoreboard,
        sourceName: profile.scoreboardSourceName || 'MaidanLive_Scoreboard_Overlay',
        url: baseAppUrl
          ? `${baseAppUrl}/broadcast/overlay/view/${matchId}?obs=1&controls=0${includeScoreboard ? '' : '&sb=0'}`
          : '',
      },
    });

    const verifiedScene = String(rpcRes?.verifiedScene || targetSceneName);
    const leadCameraId = params.mainCameraId && selectedIds.includes(params.mainCameraId)
      ? params.mainCameraId
      : selectedIds[0];

    profile.activeObsScene = verifiedScene;
    profile.activeLayoutType = params.layoutType as MultiCameraLayoutType;
    profile.activeCameraId = boxes.length === 1 ? leadCameraId : '';
    profile.activeCameraIds = boxes.map((b) => b.cameraId);
    if (params.pipPosition) profile.activePipPosition = params.pipPosition;
    if (params.pipSize) profile.activePipSize = params.pipSize;
    profile.lastSyncedAt = new Date();
    profile.updatedBy = actor._id as mongoose.Types.ObjectId;
    profile.activeControllerUserId = actor._id as mongoose.Types.ObjectId;
    profile.activeControllerName = actor.name;
    profile.activeControllerRole = actor.role;
    profile.activeControllerSince = new Date();
    if (Array.isArray(rpcRes?.obsScenes)) {
      profile.obsScenes = rpcRes.obsScenes;
    }
    await profile.save();

    // Mark cameras included in the live layout as ACTIVE when OBS confirms
    const activeCamSet = new Set(boxes.map((b) => b.cameraId));
    for (const cam of allCameras) {
      if (!cam.enabled) continue;
      if (activeCamSet.has(cam.cameraId)) {
        cam.status = 'ACTIVE';
      } else {
        cam.status = computeEffectiveCameraStatus(cam, '', '', true);
      }
      await cam.save();
    }

    await writeBroadcastAudit({
      matchId,
      tournamentId: profile.tournamentId ? String(profile.tournamentId) : null,
      actionType: 'LAYOUT_SWITCH',
      previousScene: prevScene,
      newScene: verifiedScene,
      previousCameraId: prevCameraId,
      newCameraId: leadCameraId,
      layoutSelected: `${params.layoutType} (${selectedIds.length} cams)`,
      actor,
      adminOverride: Boolean(params.override),
      obsStatus: 'SUCCESS',
      metadata: { cameraIds: selectedIds, includeScoreboardOverlay: includeScoreboard },
    });

    emitBroadcastStudioEvent(matchId, 'obs:layout_changed', {
      matchId,
      layoutType: params.layoutType,
      activeObsScene: verifiedScene,
      cameraIds: selectedIds,
      boxes,
    });
    emitRoomOnlyEvent(matchId, 'obs:layout_updated', {
      matchId,
      activeLayoutType: params.layoutType,
      activeCameraId: boxes.length === 1 ? leadCameraId : '',
      activeCameraIds: selectedIds,
      activePipPosition: params.pipPosition || profile.activePipPosition || 'bottom-right',
      activePipSize: params.pipSize || profile.activePipSize || 'medium',
      activeObsScene: verifiedScene,
    });
    emitBroadcastStudioEvent(matchId, 'SCENE_SWITCH_SUCCESS', {
      matchId,
      previousScene: prevScene,
      activeObsScene: verifiedScene,
      layoutType: params.layoutType,
    });
    emitBroadcastStudioEvent(matchId, 'CURRENT_SCENE_CHANGED', {
      matchId,
      previousScene: prevScene,
      activeObsScene: verifiedScene,
    });
    await emitFullStudioState(matchId);

    return {
      verifiedScene,
      layoutType: params.layoutType,
      boxes,
    };
  } catch (err: any) {
    const errMsg = err?.message || 'OBS failed applying multi-camera layout.';
    await writeBroadcastAudit({
      matchId,
      actionType: 'LAYOUT_SWITCH',
      previousScene: prevScene,
      newScene: targetSceneName,
      layoutSelected: params.layoutType,
      actor,
      adminOverride: Boolean(params.override),
      obsStatus: 'FAILED',
      errorDetails: errMsg,
    });
    emitBroadcastStudioEvent(matchId, 'obs:error', {
      matchId,
      message: errMsg,
    });
    emitBroadcastStudioEvent(matchId, 'SCENE_SWITCH_FAILED', {
      matchId,
      targetScene: targetSceneName,
      error: errMsg,
    });
    throw err;
  } finally {
    releaseSceneSwitchGuard(matchId);
  }
}

export async function switchObsSceneByName(
  matchId: string,
  sceneName: string,
  actor: IUser,
  options: { override?: boolean; transitionDurationMs?: number } = {}
) {
  const profile = await ensureObsProfileForMatch(matchId, actor._id as any);
  try {
    checkAdminOverrideGuard(profile, actor, options.override);
  } catch (err: any) {
    await writeBroadcastAudit({
      matchId,
      actionType: 'SCENE_SWITCH',
      previousScene: profile.activeObsScene,
      newScene: sceneName,
      actor,
      adminOverride: Boolean(options.override),
      obsStatus: 'REJECTED',
      errorDetails: err.message,
    });
    throw err;
  }

  const prevScene = profile.activeObsScene || '';
  acquireSceneSwitchGuard(matchId);
  emitBroadcastStudioEvent(matchId, 'SCENE_SWITCH_REQUESTED', {
    matchId,
    targetScene: sceneName,
    requestedBy: actor.name,
  });
  try {
    const rpcRes = await callObsRpc(matchId, 'switch_scene', {
      sceneName,
      ...(typeof options.transitionDurationMs === 'number'
        ? { transitionDurationMs: options.transitionDurationMs }
        : {}),
    });
    const verifiedScene = String(rpcRes?.verifiedScene || sceneName);

    const mappedScene = await BroadcastScene.findOne({ matchId, obsSceneName: verifiedScene }).lean();
    const mappedCam = await BroadcastCamera.findOne({ matchId, obsSceneName: verifiedScene }).lean();

    profile.activeObsScene = verifiedScene;
    profile.activeSceneId = mappedScene?._id ? String(mappedScene._id) : '';
    profile.activeLayoutType = (mappedScene?.layoutType || 'SINGLE') as MultiCameraLayoutType;
    profile.activeCameraId = mappedCam?.cameraId || '';
    profile.activeCameraIds = mappedScene?.cameraIds?.length
      ? mappedScene.cameraIds
      : mappedCam?.cameraId
        ? [mappedCam.cameraId]
        : [];
    profile.lastSyncedAt = new Date();
    profile.updatedBy = actor._id as mongoose.Types.ObjectId;
    profile.activeControllerUserId = actor._id as mongoose.Types.ObjectId;
    profile.activeControllerName = actor.name;
    profile.activeControllerRole = actor.role;
    profile.activeControllerSince = new Date();
    if (Array.isArray(rpcRes?.obsScenes)) {
      profile.obsScenes = rpcRes.obsScenes;
    }
    await profile.save();

    await reconcileCameraActiveStates(matchId, verifiedScene);

    await writeBroadcastAudit({
      matchId,
      actionType: 'SCENE_SWITCH',
      previousScene: prevScene,
      newScene: verifiedScene,
      newCameraId: mappedCam?.cameraId || '',
      layoutSelected: profile.activeLayoutType,
      actor,
      adminOverride: Boolean(options.override),
      obsStatus: 'SUCCESS',
    });

    emitBroadcastStudioEvent(matchId, 'obs:scene_changed', {
      matchId,
      previousScene: prevScene,
      activeObsScene: verifiedScene,
      activeCameraId: profile.activeCameraId,
      activeLayoutType: profile.activeLayoutType,
    });
    emitRoomOnlyEvent(matchId, 'obs:layout_updated', {
      matchId,
      activeLayoutType: profile.activeLayoutType,
      activeCameraId: profile.activeCameraId,
      activeCameraIds: profile.activeCameraIds || [],
      activePipPosition: profile.activePipPosition || 'bottom-right',
      activePipSize: profile.activePipSize || 'medium',
      activeObsScene: verifiedScene,
    });
    emitBroadcastStudioEvent(matchId, 'SCENE_SWITCH_SUCCESS', {
      matchId,
      previousScene: prevScene,
      activeObsScene: verifiedScene,
    });
    emitBroadcastStudioEvent(matchId, 'CURRENT_SCENE_CHANGED', {
      matchId,
      previousScene: prevScene,
      activeObsScene: verifiedScene,
    });
    await emitFullStudioState(matchId);

    return { verifiedScene };
  } catch (err: any) {
    const errMsg = err?.message || 'OBS scene switch failed.';
    await writeBroadcastAudit({
      matchId,
      actionType: 'SCENE_SWITCH',
      previousScene: prevScene,
      newScene: sceneName,
      actor,
      obsStatus: 'FAILED',
      errorDetails: errMsg,
    });
    emitBroadcastStudioEvent(matchId, 'obs:error', {
      matchId,
      message: errMsg,
    });
    emitBroadcastStudioEvent(matchId, 'SCENE_SWITCH_FAILED', {
      matchId,
      targetScene: sceneName,
      error: errMsg,
    });
    throw err;
  } finally {
    releaseSceneSwitchGuard(matchId);
  }
}

export async function listObsInputs(matchId: string) {
  const res = await callObsRpc<{
    inputs: Array<{ inputName: string; inputKind: string; unversionedInputKind?: string }>;
  }>(matchId, 'get_input_list', {});
  const inputs = Array.isArray(res?.inputs) ? res.inputs : [];
  await ObsControllerProfile.findOneAndUpdate(
    { matchId },
    { $set: { obsInputs: inputs, lastSyncedAt: new Date() } }
  );
  await emitFullStudioState(matchId);
  return inputs;
}

export async function listObsSceneItems(matchId: string, sceneName = '') {
  const res = await callObsRpc<{
    sceneName: string;
    items: Array<{
      sceneItemId: number;
      sourceName: string;
      sourceType: string;
      inputKind: string;
      sceneItemEnabled: boolean;
      sceneItemLocked: boolean;
    }>;
  }>(matchId, 'get_scene_items', { sceneName });
  return res;
}

export async function toggleObsSceneItem(
  matchId: string,
  params: {
    sceneName: string;
    sceneItemId: number;
    sourceName?: string;
    enabled: boolean;
  },
  actor: IUser,
  override = false
) {
  const profile = await ensureObsProfileForMatch(matchId, actor._id as any);
  checkAdminOverrideGuard(profile, actor, override);

  const res = await callObsRpc<{
    sceneName: string;
    sceneItemId: number;
    sceneItemEnabled: boolean;
  }>(matchId, 'set_scene_item_enabled', {
    sceneName: params.sceneName,
    sceneItemId: params.sceneItemId,
    enabled: params.enabled,
  });

  await writeBroadcastAudit({
    matchId,
    tournamentId: profile.tournamentId ? String(profile.tournamentId) : null,
    actionType: 'CAMERA_UPDATED',
    cameraName: params.sourceName || `Source #${params.sceneItemId}`,
    newScene: res.sceneName,
    actor,
    adminOverride: Boolean(override),
    obsStatus: 'SUCCESS',
    metadata: {
      sceneItemId: res.sceneItemId,
      sourceName: params.sourceName || '',
      sceneItemEnabled: res.sceneItemEnabled,
    },
  });
  await emitFullStudioState(matchId);
  return res;
}

export async function getSceneTransforms(matchId: string, sceneName = '') {
  const res = await callObsRpc<{
    sceneName: string;
    transforms: ObsSceneTransformItem[];
  }>(matchId, 'get_scene_transforms', { sceneName });
  return res;
}

export async function updateCameraTransformInObs(
  matchId: string,
  cameraId: string,
  params: {
    orientationMode?: CameraOrientationMode | string;
    previewFit?: CameraPreviewFit | string;
    portraitBackdropFill?: boolean;
  },
  actor: IUser,
  override = false
) {
  const profile = await ensureObsProfileForMatch(matchId, actor._id as any);
  checkAdminOverrideGuard(profile, actor, override);

  const cam = await BroadcastCamera.findOne({ matchId, cameraId }).select('+mediamtxStreamKeyEnc');
  if (!cam) {
    const err: any = new Error('Camera not found.');
    err.statusCode = 404;
    throw err;
  }

  if (params.orientationMode !== undefined) {
    cam.orientationMode = normalizeOrientationMode(params.orientationMode);
  }
  if (params.previewFit !== undefined) {
    cam.previewFit = normalizePreviewFit(params.previewFit);
  }
  if (typeof params.portraitBackdropFill === 'boolean') {
    cam.portraitBackdropFill = params.portraitBackdropFill;
  }
  await cam.save();

  const rotationDeg = parseOrientationDegrees(cam.orientationMode);
  const previewFit = normalizePreviewFit(cam.previewFit);
  const targetInputName = cam.obsInputName?.trim() || `ML_CAM_${cam.cameraNumber}`;
  const soloSceneName = cam.obsSceneName?.trim() || `CAM ${cam.cameraNumber} FULL`;

  const isObsConnected =
    profile.connectionMode === 'local_agent'
      ? Boolean((await isMatchBridgeOnline(matchId)) && profile.connectionStatus === 'CONNECTED')
      : Boolean(directSessions.get(matchId)?.connected);

  let obsSynced = false;
  let obsNote = '';
  const updatedScenes: string[] = [];

  if (isObsConnected && targetInputName) {
    const roomPassword = await getRoomPasswordForProfile(profile);
    const ensureInput = buildObsEnsureInputForCamera(cam, profile, roomPassword);

    // 1. Update active multi-cam box transform if this camera is currently in an active multi-cam scene
    const activeScene = String(profile.activeObsScene || '').trim();
    const activeCamIds = Array.isArray(profile.activeCameraIds) ? profile.activeCameraIds : [];
    const activeLayout = (profile.activeLayoutType || 'SINGLE') as ObsLayoutType;

    if (activeScene && activeScene !== soloSceneName && activeCamIds.includes(cam.cameraId)) {
      try {
        const boxes = computeObsLayoutBoxes(
          activeLayout,
          activeCamIds,
          profile.activeCameraId || activeCamIds[0],
          1920,
          1080,
          {
            pipPosition: (profile.activePipPosition as PipPosition) || 'bottom-right',
            pipSize: (profile.activePipSize as PipSize) || 'medium',
          }
        );
        const matchBox = boxes.find((b) => b.cameraId === cam.cameraId);
        if (matchBox) {
          await callObsRpc(matchId, 'update_camera_transform', {
            sceneName: activeScene,
            inputName: targetInputName,
            x: matchBox.x,
            y: matchBox.y,
            width: matchBox.width,
            height: matchBox.height,
            rotation: rotationDeg,
            previewFit,
            ensureInput,
          });
          obsSynced = true;
          updatedScenes.push(activeScene);
        }
      } catch (err: any) {
        obsNote = err?.message || 'Unable to update transform in active scene.';
      }
    }

    // 2. Update solo camera scene transform (if active solo scene OR scene already exists in OBS)
    const shouldUpdateSolo =
      activeScene === soloSceneName ||
      (Array.isArray(profile.obsScenes) && profile.obsScenes.includes(soloSceneName)) ||
      Boolean(ensureInput);
    if (shouldUpdateSolo) {
      try {
        await callObsRpc(matchId, 'update_camera_transform', {
          sceneName: soloSceneName,
          inputName: targetInputName,
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          rotation: rotationDeg,
          previewFit,
          ensureInput,
        });
        obsSynced = true;
        updatedScenes.push(soloSceneName);
      } catch (err: any) {
        if (!obsSynced) {
          obsNote = err?.message || `Source "${targetInputName}" not found in "${soloSceneName}".`;
        }
      }
    }
  } else {
    obsNote = 'OBS is not currently connected; framing saved for next OBS sync.';
  }

  await writeBroadcastAudit({
    matchId,
    tournamentId: profile.tournamentId ? String(profile.tournamentId) : null,
    actionType: 'CAMERA_UPDATED',
    cameraId: cam.cameraId,
    cameraName: cam.name,
    newScene: updatedScenes[0] || soloSceneName,
    actor,
    adminOverride: Boolean(override),
    obsStatus: 'SUCCESS',
    metadata: {
      orientationMode: cam.orientationMode,
      previewFit: cam.previewFit,
      portraitBackdropFill: cam.portraitBackdropFill,
      rotationDeg,
      obsSynced,
      updatedScenes,
      obsNote,
    },
  });
  await emitFullStudioState(matchId);

  return {
    ok: true,
    obsSynced,
    obsNote,
    updatedScenes,
    camera: formatSafeCamera(cam.toObject(), profile, { includePrivateUrls: true }),
  };
}

export async function captureObsPreviewImage(
  matchId: string,
  sourceName: string,
  fallbackSourceNames: string[] = []
): Promise<string> {
  const res = await callObsRpc<{ imageData: string }>(matchId, 'screenshot', {
    sourceName,
    fallbackSourceNames,
  });
  return String(res?.imageData || '');
}

export async function controlObsOutput(
  matchId: string,
  action: 'start_stream' | 'stop_stream' | 'start_record' | 'stop_record',
  actor: IUser,
  override = false
) {
  const profile = await ensureObsProfileForMatch(matchId, actor._id as any);
  checkAdminOverrideGuard(profile, actor, override);

  const actionMap: Record<typeof action, BroadcastAuditAction> = {
    start_stream: 'OBS_STREAM_START',
    stop_stream: 'OBS_STREAM_STOP',
    start_record: 'OBS_RECORD_START',
    stop_record: 'OBS_RECORD_STOP',
  };

  try {
    const rpcRes = await callObsRpc(matchId, action, {});
    if (action === 'start_stream') profile.obsStreamActive = true;
    if (action === 'stop_stream') profile.obsStreamActive = false;
    if (action === 'start_record') profile.obsRecordActive = true;
    if (action === 'stop_record') profile.obsRecordActive = false;
    profile.lastSyncedAt = new Date();
    profile.updatedBy = actor._id as mongoose.Types.ObjectId;
    profile.activeControllerUserId = actor._id as mongoose.Types.ObjectId;
    profile.activeControllerName = actor.name;
    profile.activeControllerRole = actor.role;
    profile.activeControllerSince = new Date();
    await profile.save();

    await writeBroadcastAudit({
      matchId,
      tournamentId: profile.tournamentId ? String(profile.tournamentId) : null,
      actionType: actionMap[action],
      actor,
      adminOverride: Boolean(override),
      obsStatus: 'SUCCESS',
      metadata: rpcRes || null,
    });
    await emitFullStudioState(matchId);
    return { profile: formatSafeProfile(profile), result: rpcRes };
  } catch (err: any) {
    await writeBroadcastAudit({
      matchId,
      tournamentId: profile.tournamentId ? String(profile.tournamentId) : null,
      actionType: actionMap[action],
      actor,
      adminOverride: Boolean(override),
      obsStatus: 'FAILED',
      errorDetails: err?.message || `Failed executing OBS ${action}.`,
    });
    throw err;
  }
}

export async function setCameraObsAudioMute(
  matchId: string,
  cameraId: string,
  muted: boolean,
  actor: IUser,
  override = false
) {
  const profile = await ensureObsProfileForMatch(matchId, actor._id as any);
  checkAdminOverrideGuard(profile, actor, override);

  const cam = await BroadcastCamera.findOne({ matchId, cameraId });
  if (!cam) {
    const err: any = new Error('Camera not found.');
    err.statusCode = 404;
    throw err;
  }

  let obsSynced = false;
  let obsMutedResult: boolean | null = null;
  let obsNote = '';

  const targetInput = cam.obsInputName || `ML_CAM_${cam.cameraNumber}`;
  const isObsConnected =
    profile.connectionMode === 'local_agent'
      ? Boolean((await isMatchBridgeOnline(matchId)) && profile.connectionStatus === 'CONNECTED')
      : Boolean(directSessions.get(matchId)?.connected);

  if (isObsConnected && targetInput) {
    try {
      const res = await callObsRpc<{ inputName: string; inputMuted: boolean }>(
        matchId,
        'set_input_mute',
        { inputName: targetInput, inputMuted: muted }
      );
      obsSynced = true;
      obsMutedResult = Boolean(res.inputMuted);
    } catch (err: any) {
      obsNote = err?.message || 'OBS input does not expose an audio track or was not yet created.';
    }
  } else {
    obsNote = 'OBS is not currently connected; saved companion audio mute state only.';
  }

  cam.audioMuted = obsSynced ? Boolean(obsMutedResult) : muted;
  cam.obsInputMuted = obsSynced ? Boolean(obsMutedResult) : null;
  cam.telemetry = {
    ...(cam.telemetry || {}),
    audioMuted: cam.audioMuted,
  };
  await cam.save();

  await writeBroadcastAudit({
    matchId,
    tournamentId: profile.tournamentId ? String(profile.tournamentId) : null,
    actionType: 'CAMERA_AUDIO_TOGGLE',
    cameraId: cam.cameraId,
    cameraName: cam.name,
    actor,
    adminOverride: Boolean(override),
    obsStatus: obsSynced ? 'SUCCESS' : 'SUCCESS',
    metadata: { muted: cam.audioMuted, obsSynced, note: obsNote },
  });
  await emitFullStudioState(matchId);

  return {
    camera: formatSafeCamera(cam.toObject(), profile, { includePrivateUrls: true }),
    obsSynced,
    obsNote,
  };
}

export async function setCameraFacingMode(
  matchId: string,
  cameraId: string,
  facingMode: 'environment' | 'user',
  actor: IUser,
  override = false
) {
  const profile = await ensureObsProfileForMatch(matchId, actor._id as any);
  checkAdminOverrideGuard(profile, actor, override);

  const cam = await BroadcastCamera.findOne({ matchId, cameraId });
  if (!cam) {
    const err: any = new Error('Camera not found.');
    err.statusCode = 404;
    throw err;
  }

  const previousFacingMode = cam.facingMode || 'environment';
  cam.facingMode = facingMode;
  await cam.save();

  await writeBroadcastAudit({
    matchId,
    tournamentId: profile.tournamentId ? String(profile.tournamentId) : null,
    actionType: 'CAMERA_FACING_CHANGED',
    cameraId: cam.cameraId,
    cameraName: cam.name,
    actor,
    adminOverride: Boolean(override),
    obsStatus: 'SUCCESS',
    metadata: {
      previousFacingMode,
      facingMode: cam.facingMode,
      vdoStreamIdPreserved: cam.vdoStreamId || '',
    },
  });

  emitCameraCompanionEvent(String(cam._id), 'camera:facing_changed', {
    matchId,
    cameraId: cam.cameraId,
    cameraDocId: String(cam._id),
    facingMode: cam.facingMode,
    updatedBy: actor.name,
  });

  emitBroadcastStudioEvent(matchId, 'obs:camera_status', {
    matchId,
    cameraId: cam.cameraId,
    facingMode: cam.facingMode,
  });

  await emitFullStudioState(matchId);

  return {
    camera: formatSafeCamera(cam.toObject(), profile, { includePrivateUrls: true }),
  };
}

export async function disconnectCameraByOperator(
  matchId: string,
  cameraId: string,
  actor: IUser
) {
  const profile = await ensureObsProfileForMatch(matchId, actor._id as any);
  const cam = await BroadcastCamera.findOne({ matchId, cameraId });
  if (!cam) {
    const err: any = new Error('Camera not found.');
    err.statusCode = 404;
    throw err;
  }

  cam.status = 'DISCONNECTED';
  cam.lastHeartbeatAt = null;
  cam.lastError = `Disconnected by ${actor.name}`;
  await cam.save();

  await writeBroadcastAudit({
    matchId,
    tournamentId: profile.tournamentId ? String(profile.tournamentId) : null,
    actionType: 'CAMERA_DISCONNECTED',
    cameraId: cam.cameraId,
    cameraName: cam.name,
    actor,
    obsStatus: 'SUCCESS',
  });
  await emitFullStudioState(matchId);

  return formatSafeCamera(cam.toObject(), profile, { includePrivateUrls: true });
}

export async function disconnectAllCamerasByOperator(
  matchId: string,
  actor: IUser
) {
  const profile = await ensureObsProfileForMatch(matchId, actor._id as any);
  const cameras = await BroadcastCamera.find({ matchId, enabled: true });
  let disconnectedCount = 0;

  for (const cam of cameras) {
    cam.status = 'DISCONNECTED';
    cam.lastHeartbeatAt = null;
    cam.mediamtxPublisherConnected = false;
    cam.lastError = `Disconnected all cameras by ${actor.name}`;
    await cam.save();
    disconnectedCount += 1;
  }

  await writeBroadcastAudit({
    matchId,
    tournamentId: profile.tournamentId ? String(profile.tournamentId) : null,
    actionType: 'CAMERA_DISCONNECTED',
    cameraName: `All Cameras (${disconnectedCount})`,
    actor,
    obsStatus: 'SUCCESS',
    metadata: { disconnectedCount, disconnectAll: true },
  });
  await emitFullStudioState(matchId);

  return { ok: true, disconnectedCount };
}

export async function executeBroadcastTransition(
  matchId: string,
  params: {
    mode: 'cut' | 'fade';
    durationMs?: number;
    layoutType?: ObsLayoutType;
    cameraIds?: string[];
    mainCameraId?: string;
    pipPosition?: PipPosition;
    pipSize?: PipSize;
    sceneName?: string;
    includeScoreboardOverlay?: boolean;
    override?: boolean;
    baseAppUrl?: string;
  },
  actor: IUser
) {
  const transitionDurationMs =
    params.mode === 'cut'
      ? 0
      : Math.max(100, Math.min(3000, Math.round(Number(params.durationMs) || 500)));

  const cleanIds = Array.isArray(params.cameraIds)
    ? params.cameraIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    : [];

  if (cleanIds.length > 0 && params.layoutType) {
    if (params.layoutType === 'SINGLE' && cleanIds.length === 1 && !params.sceneName) {
      return await switchCameraLive(matchId, cleanIds[0], actor, {
        override: params.override,
        baseAppUrl: params.baseAppUrl,
        transitionDurationMs,
      });
    }
    return await applyDynamicLayoutToObs(
      matchId,
      {
        layoutType: params.layoutType,
        cameraIds: cleanIds,
        mainCameraId: params.mainCameraId,
        pipPosition: params.pipPosition,
        pipSize: params.pipSize,
        sceneName: params.sceneName,
        includeScoreboardOverlay: params.includeScoreboardOverlay,
        override: params.override,
        baseAppUrl: params.baseAppUrl,
        transitionDurationMs,
      },
      actor
    );
  }

  if (params.sceneName?.trim()) {
    return await switchObsSceneByName(matchId, params.sceneName.trim(), actor, {
      override: params.override,
      transitionDurationMs,
    });
  }

  const err: any = new Error('Select a camera, layout slot, or scene before executing a transition.');
  err.statusCode = 400;
  throw err;
}

export async function triggerObsSceneTransition(
  matchId: string,
  params: {
    previewSceneName?: string;
    sceneName?: string;
    transitionName?: string;
    transitionDurationMs?: number;
    ensureStudioMode?: boolean;
    override?: boolean;
  },
  actor: IUser
) {
  const profile = await ensureObsProfileForMatch(matchId, actor._id as any);
  checkAdminOverrideGuard(profile, actor, Boolean(params.override));

  acquireSceneSwitchGuard(matchId);
  try {
    const prevScene = profile.activeObsScene || '';
    const rpcRes = await callObsRpc<any>(matchId, 'trigger_transition', {
      ...(params.previewSceneName ? { previewSceneName: params.previewSceneName } : {}),
      ...(params.sceneName ? { sceneName: params.sceneName } : {}),
      ...(params.transitionName ? { transitionName: params.transitionName } : {}),
      ...(Number.isFinite(Number(params.transitionDurationMs))
        ? { transitionDurationMs: Math.max(0, Math.min(5000, Math.round(Number(params.transitionDurationMs)))) }
        : {}),
      ensureStudioMode: params.ensureStudioMode !== false,
    });

    const nextActiveScene =
      typeof rpcRes?.activeObsScene === 'string' && rpcRes.activeObsScene
        ? rpcRes.activeObsScene
        : profile.activeObsScene || '';
    const nextPreviewScene =
      typeof rpcRes?.previewObsScene === 'string' ? rpcRes.previewObsScene : '';

    await ObsControllerProfile.findOneAndUpdate(
      { matchId },
      {
        $set: {
          activeObsScene: nextActiveScene,
          previewObsScene: nextPreviewScene,
          studioModeEnabled:
            typeof rpcRes?.studioModeEnabled === 'boolean'
              ? rpcRes.studioModeEnabled
              : true,
          ...(typeof rpcRes?.currentTransitionName === 'string'
            ? { currentTransitionName: rpcRes.currentTransitionName }
            : {}),
          ...(Number.isFinite(Number(rpcRes?.currentTransitionDurationMs))
            ? { currentTransitionDurationMs: Number(rpcRes.currentTransitionDurationMs) }
            : {}),
          lastSyncedAt: new Date(),
        },
      }
    );

    if (nextActiveScene) {
      await reconcileCameraActiveStates(matchId, nextActiveScene);
    }

    await writeBroadcastAudit({
      matchId,
      actionType: 'OBS_SCENE_TRANSITION',
      previousScene: prevScene,
      newScene: nextActiveScene,
      actor,
      adminOverride: Boolean(params.override),
      obsStatus: 'SUCCESS',
      metadata: {
        previewObsScene: nextPreviewScene,
        transitionName: rpcRes?.currentTransitionName || params.transitionName || '',
        transitionDurationMs: rpcRes?.currentTransitionDurationMs ?? params.transitionDurationMs ?? null,
        studioModeEnabled: rpcRes?.studioModeEnabled !== false,
      },
    });

    emitBroadcastStudioEvent(matchId, 'obs:scene_changed', {
      matchId,
      previousScene: prevScene,
      activeObsScene: nextActiveScene,
    });
    await emitFullStudioState(matchId);

    return {
      ok: true,
      ...rpcRes,
      activeObsScene: nextActiveScene,
      previewObsScene: nextPreviewScene,
    };
  } catch (err: any) {
    await writeBroadcastAudit({
      matchId,
      actionType: 'OBS_SCENE_TRANSITION',
      actor,
      adminOverride: Boolean(params.override),
      obsStatus: 'FAILED',
      errorDetails: err?.message || 'Scene transition failed.',
    });
    throw err;
  } finally {
    releaseSceneSwitchGuard(matchId);
  }
}

export async function setObsStudioMode(
  matchId: string,
  studioModeEnabled: boolean,
  actor: IUser,
  override = false
) {
  const profile = await ensureObsProfileForMatch(matchId, actor._id as any);
  checkAdminOverrideGuard(profile, actor, override);
  const rpcRes = await callObsRpc<any>(matchId, 'set_studio_mode', {
    studioModeEnabled: Boolean(studioModeEnabled),
  });
  await ObsControllerProfile.findOneAndUpdate(
    { matchId },
    {
      $set: {
        studioModeEnabled: Boolean(rpcRes?.studioModeEnabled ?? studioModeEnabled),
        ...(typeof rpcRes?.previewObsScene === 'string' ? { previewObsScene: rpcRes.previewObsScene } : {}),
        lastSyncedAt: new Date(),
      },
    }
  );
  await emitFullStudioState(matchId);
  return { ok: true, ...rpcRes };
}

export async function setObsPreviewScene(
  matchId: string,
  sceneName: string,
  actor: IUser,
  override = false
) {
  const profile = await ensureObsProfileForMatch(matchId, actor._id as any);
  checkAdminOverrideGuard(profile, actor, override);
  const rpcRes = await callObsRpc<any>(matchId, 'set_preview_scene', { sceneName });
  await ObsControllerProfile.findOneAndUpdate(
    { matchId },
    {
      $set: {
        studioModeEnabled: true,
        previewObsScene: String(rpcRes?.previewObsScene || sceneName),
        lastSyncedAt: new Date(),
      },
    }
  );
  await emitFullStudioState(matchId);
  return { ok: true, ...rpcRes };
}

export async function setObsPrimaryAudioInput(
  matchId: string,
  inputName: string,
  actor: IUser,
  override = false
) {
  const profile = await ensureObsProfileForMatch(matchId, actor._id as any);
  checkAdminOverrideGuard(profile, actor, override);
  const rpcRes = await callObsRpc<any>(matchId, 'set_primary_audio_input', { inputName });
  await ObsControllerProfile.findOneAndUpdate(
    { matchId },
    {
      $set: {
        primaryAudioInput: String(rpcRes?.primaryAudioInput || inputName),
        lastSyncedAt: new Date(),
      },
    }
  );
  if (rpcRes?.audioMeter) {
    latestAudioMeterByMatch.set(matchId, rpcRes.audioMeter);
    emitBroadcastStudioEvent(matchId, 'obs:audio_levels', {
      matchId,
      primaryAudioInput: rpcRes?.primaryAudioInput || inputName,
      audioMeter: rpcRes.audioMeter,
    });
  }
  await emitFullStudioState(matchId);
  return { ok: true, ...rpcRes };
}

export async function setObsInputMute(
  matchId: string,
  inputName: string,
  muted: boolean,
  actor: IUser,
  override = false
) {
  const profile = await ensureObsProfileForMatch(matchId, actor._id as any);
  checkAdminOverrideGuard(profile, actor, override);
  const targetInput = String(inputName || profile.primaryAudioInput || '').trim();
  if (!targetInput) {
    const err: any = new Error('Primary OBS audio input name is required.');
    err.statusCode = 400;
    throw err;
  }
  const rpcRes = await callObsRpc<{ inputName: string; inputMuted: boolean }>(
    matchId,
    'set_input_mute',
    { inputName: targetInput, inputMuted: Boolean(muted) }
  );
  const nextMuted = Boolean(rpcRes?.inputMuted ?? muted);
  const prevMeter = latestAudioMeterByMatch.get(matchId);
  if (prevMeter && prevMeter.primaryInputName === targetInput) {
    const clipping = !nextMuted && Boolean(prevMeter.clipping);
    const readiness = evaluateAudioReadinessServer({
      obsConnected: Boolean(prevMeter.obsConnected),
      inputName: targetInput,
      muted: nextMuted,
      peakDb: Number(prevMeter.peakDb ?? DIRECT_AUDIO_MIN_DB),
      clipping,
    });
    const updatedMeter = {
      ...prevMeter,
      muted: nextMuted,
      clipping,
      ...readiness,
      updatedAtMs: Date.now(),
    };
    latestAudioMeterByMatch.set(matchId, updatedMeter);
    emitBroadcastStudioEvent(matchId, 'obs:audio_levels', {
      matchId,
      primaryAudioInput: targetInput,
      audioMeter: updatedMeter,
    });
  }
  return { ok: true, inputName: targetInput, inputMuted: nextMuted };
}

export async function reconnectCameraSource(
  matchId: string,
  cameraId: string,
  actor: IUser,
  override = false
) {
  const profile = await ensureObsProfileForMatch(matchId, actor._id as any);
  checkAdminOverrideGuard(profile, actor, override);

  const cam = await BroadcastCamera.findOne({ matchId, cameraId }).select('+mediamtxStreamKeyEnc');
  if (!cam) {
    const err: any = new Error('Camera not found.');
    err.statusCode = 404;
    throw err;
  }

  const targetSceneName = cam.obsSceneName?.trim() || `CAM ${cam.cameraNumber} FULL`;
  const targetInputName = cam.obsInputName?.trim() || `ML_CAM_${cam.cameraNumber}`;
  const roomPassword = await getRoomPasswordForProfile(profile);
  const ensured = buildObsEnsureInputForCamera(cam, profile, roomPassword);
  const inputKind = ensured?.inputKind || '';
  const inputSettings = ensured?.inputSettings || {};

  const isObsConnected =
    profile.connectionMode === 'local_agent'
      ? Boolean((await isMatchBridgeOnline(matchId)) && profile.connectionStatus === 'CONNECTED')
      : Boolean(directSessions.get(matchId)?.connected);

  let obsSynced = false;
  let obsNote = '';
  if (isObsConnected) {
    try {
      await callObsRpc(matchId, 'reconnect_input', {
        sceneName: targetSceneName,
        inputName: targetInputName,
        inputKind,
        inputSettings,
      });
      obsSynced = true;
      if (ensured) {
        cam.obsSourceConfigured = true;
      }
    } catch (err: any) {
      obsNote = err?.message || 'OBS input refresh returned an error.';
    }
  } else {
    obsNote = 'OBS Studio is disconnected.';
  }

  let signalOk = false;
  let signalDetail = '';
  if (cam.sourceType === 'mediamtx') {
    if (cam.mediamtxPublisherConnected) {
      signalOk = true;
      signalDetail = `Larix / MediaMTX publisher active on "${cam.mediamtxStreamPath}"${obsSynced ? ' and OBS Media Source restarted.' : '.'}`;
    } else if (cam.mediamtxStreamPath || cam.connectionUrl) {
      const mtx = await verifyMediaMTXStreamHealth({
        streamPath: cam.mediamtxStreamPath || cam.connectionUrl,
        hlsPlaybackUrl: cam.connectionUrl,
        webrtcPlaybackUrl: '',
      });
      signalOk = mtx.ok || obsSynced;
      signalDetail = mtx.ok
        ? mtx.message
        : obsSynced
          ? `Restarted OBS Media Source "${targetInputName}". Waiting for Larix publisher on "${cam.mediamtxStreamPath}".`
          : mtx.message;
    } else {
      signalDetail = obsNote || 'Larix MediaMTX stream path is not configured.';
    }
  } else if (
    cam.lastHeartbeatAt &&
    Date.now() - new Date(cam.lastHeartbeatAt).getTime() <= HEARTBEAT_STALE_MS
  ) {
    signalOk = cam.status !== 'ERROR';
    signalDetail = `Smartphone companion active (heartbeat ${Math.round(
      (Date.now() - new Date(cam.lastHeartbeatAt).getTime()) / 1000
    )}s ago).`;
  } else if (obsSynced) {
    signalOk = true;
    signalDetail = `Reloaded "${targetInputName}" in OBS Studio.`;
  } else {
    signalDetail =
      obsNote ||
      'No active smartphone companion heartbeat or OBS connection detected for this camera.';
  }

  const hasRecentHeartbeat = Boolean(
    cam.lastHeartbeatAt && Date.now() - new Date(cam.lastHeartbeatAt).getTime() <= HEARTBEAT_STALE_MS
  );
  if (cam.status === 'ERROR' && signalOk) {
    cam.status = hasRecentHeartbeat ? 'CONNECTED' : 'DISCONNECTED';
  }
  cam.lastError = signalOk ? '' : signalDetail.slice(0, 400);
  cam.status = computeEffectiveCameraStatus(
    cam,
    profile.activeCameraId || '',
    profile.activeObsScene || '',
    isObsConnected
  );
  await cam.save();

  emitBroadcastStudioEvent(matchId, 'obs:camera_reconnect_requested', {
    matchId,
    cameraId: cam.cameraId,
    obsSynced,
    status: cam.status,
  });

  await writeBroadcastAudit({
    matchId,
    tournamentId: profile.tournamentId ? String(profile.tournamentId) : null,
    actionType: 'CAMERA_RECONNECT',
    cameraId: cam.cameraId,
    cameraName: cam.name,
    actor,
    adminOverride: Boolean(override),
    obsStatus: signalOk || obsSynced ? 'SUCCESS' : 'FAILED',
    errorDetails: signalOk || obsSynced ? '' : signalDetail,
    metadata: { obsSynced, status: cam.status },
  });
  await emitFullStudioState(matchId);

  return {
    ok: signalOk || obsSynced,
    obsSynced,
    status: cam.status,
    detail: obsSynced && signalDetail ? signalDetail : signalDetail || obsNote,
    camera: formatSafeCamera(cam.toObject(), profile, { includePrivateUrls: true }),
  };
}

export async function manageBroadcastSession(
  matchId: string,
  mode: 'start' | 'end' | 'takeover',
  actor: IUser
) {
  const profile = await ensureObsProfileForMatch(matchId, actor._id as any);
  if (mode === 'start') {
    profile.broadcastSessionId = `mlsess_${generateScopedToken('s').raw.slice(2, 12)}`;
    profile.broadcastSessionStartedAt = new Date();
  }
  if (mode === 'end') {
    profile.broadcastSessionId = '';
    profile.broadcastSessionStartedAt = null;
    profile.activeControllerUserId = null;
    profile.activeControllerName = '';
    profile.activeControllerRole = '';
    profile.activeControllerSince = null;
  } else {
    profile.activeControllerUserId = actor._id as mongoose.Types.ObjectId;
    profile.activeControllerName = actor.name;
    profile.activeControllerRole = actor.role;
    profile.activeControllerSince = new Date();
  }
  profile.updatedBy = actor._id as mongoose.Types.ObjectId;
  await profile.save();

  await writeBroadcastAudit({
    matchId,
    tournamentId: profile.tournamentId ? String(profile.tournamentId) : null,
    actionType:
      mode === 'start'
        ? 'BROADCAST_SESSION_STARTED'
        : mode === 'end'
          ? 'BROADCAST_SESSION_ENDED'
          : 'CONTROLLER_TAKEOVER',
    actor,
    obsStatus: 'SUCCESS',
    metadata: { broadcastSessionId: profile.broadcastSessionId },
  });
  if (mode === 'start') {
    await clearLiveGraphics(matchId, actor, profile.broadcastSessionId).catch(() => {});
  } else if (mode === 'end') {
    await clearLiveGraphics(matchId, actor).catch(() => {});
    await handleMatchSessionEndedForSchedules(matchId).catch(() => {});
  }
  await emitFullStudioState(matchId);
  return formatSafeProfile(profile);
}

// =========================================================================
// REGISTERED WINDOWS OBS BRIDGE MANAGEMENT SERVICE
// =========================================================================

export function formatSafeBridge(bridge: any) {
  if (!bridge) return null;
  const sock = bridgeSockets.get(String(bridge.bridgeId || ''));
  const socketOnline = Boolean(sock && sock.connected);
  const tracker = bridgeHealthTracker.getEntry(`bridge:${bridge.bridgeId || ''}`);
  const isRevoked = bridge.status === 'REVOKED';
  const isManualDisconnect = Boolean(bridge.manualDisconnect);

  let explicitBridgeState: BridgeConnectionStateValue;
  if (isRevoked || isManualDisconnect) {
    explicitBridgeState = 'OFFLINE';
  } else if (socketOnline) {
    const candidate = tracker?.state || bridge.bridgeConnectionState || 'CONNECTED';
    explicitBridgeState = candidate === 'OFFLINE' ? 'CONNECTED' : candidate;
  } else if (tracker?.state) {
    explicitBridgeState = tracker.state === 'OFFLINE' ? 'CONNECTION_LOST' : tracker.state;
  } else if (bridge.lastConnectedAt) {
    explicitBridgeState =
      bridge.bridgeConnectionState === 'RECONNECTING' ? 'RECONNECTING' : 'CONNECTION_LOST';
  } else {
    explicitBridgeState = 'OFFLINE';
  }

  const mappedConnStatus =
    isRevoked || isManualDisconnect || explicitBridgeState === 'OFFLINE'
      ? 'OFFLINE'
      : explicitBridgeState === 'CONNECTION_LOST'
        ? 'CONNECTION_LOST'
        : explicitBridgeState === 'RECONNECTING'
          ? 'RECONNECTING'
          : 'ONLINE';

  const forceDisconnected = isRevoked || isManualDisconnect || mappedConnStatus === 'OFFLINE';

  return {
    id: String(bridge._id || bridge.id || ''),
    bridgeId: bridge.bridgeId,
    name: bridge.name,
    label: bridge.label || '',
    ownerUserId: bridge.ownerUserId ? String(bridge.ownerUserId) : null,
    ownerName: bridge.ownerName || '',
    ownerEmail: bridge.ownerEmail || '',
    tournamentId: bridge.tournamentId ? String(bridge.tournamentId) : null,
    assignedMatchIds: Array.isArray(bridge.assignedMatchIds)
      ? bridge.assignedMatchIds.map((id: any) => String(id))
      : [],
    activeMatchId: bridge.activeMatchId ? String(bridge.activeMatchId) : null,
    tokenPrefix: bridge.tokenPrefix || '',
    status: bridge.status || 'ACTIVE',
    connectionStatus: mappedConnStatus,
    bridgeConnectionState: explicitBridgeState,
    manualDisconnect: isManualDisconnect,
    manualDisconnectedAt: bridge.manualDisconnectedAt || null,
    manualDisconnectedBy: bridge.manualDisconnectedBy || '',
    obsStatus: !forceDisconnected
      ? bridge.obsStatus || 'DISCONNECTED'
      : 'DISCONNECTED',
    obsConnectionState: forceDisconnected
      ? 'OFFLINE'
      : bridge.obsConnectionState ||
        (bridge.obsStatus === 'CONNECTED'
          ? 'CONNECTED'
          : bridge.obsStatus === 'RECONNECTING'
            ? 'RECONNECTING'
            : bridge.obsStatus === 'CONNECTION_LOST'
              ? 'CONNECTION_LOST'
              : 'OFFLINE'),
    obsVersion: bridge.obsVersion || '',
    obsWebSocketVersion: bridge.obsWebSocketVersion || '',
    activeObsScene: !forceDisconnected ? bridge.activeObsScene || '' : '',
    previewObsScene: !forceDisconnected ? bridge.previewObsScene || '' : '',
    studioModeEnabled: Boolean(!forceDisconnected && bridge.studioModeEnabled),
    currentTransitionName: !forceDisconnected ? bridge.currentTransitionName || '' : '',
    currentTransitionDurationMs: Number(bridge.currentTransitionDurationMs ?? 300),
    obsTransitions: Array.isArray(bridge.obsTransitions) ? bridge.obsTransitions : [],
    primaryAudioInput: bridge.primaryAudioInput || '',
    audioMeter: !forceDisconnected ? latestAudioMeterByBridge.get(bridge.bridgeId) || null : null,
    obsScenes: Array.isArray(bridge.obsScenes) ? bridge.obsScenes : [],
    obsStreamActive: Boolean(!forceDisconnected && bridge.obsStreamActive),
    missedHeartbeats: Number(tracker?.missedHeartbeats ?? bridge.missedHeartbeats ?? 0),
    lastDisconnectReason: tracker?.lastDisconnectReason || bridge.lastDisconnectReason || '',
    reconnectAttempts: Number(bridge.reconnectAttempts || 0),
    lastReconnectAttemptAt: bridge.lastReconnectAttemptAt || null,
    diagnosticLogs: Array.isArray(bridge.diagnosticLogs) ? bridge.diagnosticLogs.slice(-15) : [],
    lastConnectedAt: bridge.lastConnectedAt || null,
    lastDisconnectedAt: bridge.lastDisconnectedAt || null,
    lastHeartbeatAt: bridge.lastHeartbeatAt || null,
    lastError: bridge.lastError || '',
    platform: bridge.platform || 'win32',
    bridgeVersion: bridge.bridgeVersion || '',
    capabilities: normalizeBridgeCapabilities(bridge.bridgeCapabilities),
    mediamtxControlSupported: hasMediaMTXControlCapability(bridge.bridgeCapabilities),
    mediamtxState: bridge.mediamtxState || null,
    revokedAt: bridge.revokedAt || null,
    revokeReason: bridge.revokeReason || '',
    createdAt: bridge.createdAt || null,
    updatedAt: bridge.updatedAt || null,
  };
}

function generateUniqueBridgeId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars[bytes[i] % chars.length];
  }
  return `ML-BRG-${code}`;
}

export function buildBridgeConfigPayload(params: {
  serverUrl: string;
  bridgeId: string;
  bridgeToken: string;
  label?: string;
}) {
  return {
    serverUrl: params.serverUrl,
    bridgeId: params.bridgeId,
    bridgeToken: params.bridgeToken,
    obsUrl: 'ws://127.0.0.1:4455',
    obsPassword: 'YOUR_OBS_WEBSOCKET_PASSWORD',
    label: params.label || 'Ground-Windows-OBS-Laptop',
  };
}

export async function canManageBridge(actor: IUser, bridge: IObsBridge): Promise<boolean> {
  if (actor.role === 'SUPER_ADMIN' || actor.role === 'ADMIN') return true;
  if (String(bridge.ownerUserId) === String(actor._id)) return true;
  for (const mid of bridge.assignedMatchIds || []) {
    if (await hasBroadcastAccess(actor, String(mid), 'broadcast:control')) {
      return true;
    }
  }
  return false;
}

export async function listBridgesForActor(actor: IUser, matchIdFilter?: string) {
  const allBridges = await ObsBridge.find().sort({ createdAt: -1 }).lean();
  const visible: any[] = [];
  for (const b of allBridges) {
    const allowed =
      actor.role === 'SUPER_ADMIN' ||
      actor.role === 'ADMIN' ||
      String(b.ownerUserId) === String(actor._id) ||
      (await canManageBridge(actor, b as any));
    if (!allowed) continue;
    if (
      matchIdFilter &&
      !(b.assignedMatchIds || []).some((id: any) => String(id) === matchIdFilter) &&
      String(b.activeMatchId || '') !== matchIdFilter
    ) {
      // Still include un-assigned bridges owned by actor so they can attach them from studio
      if ((b.assignedMatchIds || []).length > 0) continue;
    }
    visible.push(formatSafeBridge(b));
  }
  return visible;
}

async function syncBridgeLiveStateToMatches(bridge: any) {
  const sock = bridgeSockets.get(bridge.bridgeId);
  if (!sock || !sock.connected || bridge.status === 'REVOKED') return;
  for (const rawId of bridge.assignedMatchIds || []) {
    const mid = String(rawId);
    if (!mongoose.Types.ObjectId.isValid(mid)) continue;
    await ObsControllerProfile.findOneAndUpdate(
      { matchId: mid },
      {
        $set: {
          connectionMode: 'local_agent',
          agentOnline: true,
          agentLastSeenAt: new Date(),
          agentLabel: bridge.label || bridge.name,
          bridgeVersion: bridge.bridgeVersion || '',
          bridgeCapabilities: normalizeBridgeCapabilities(bridge.bridgeCapabilities),
          connectionStatus: bridge.obsStatus || 'DISCONNECTED',
          obsVersion: bridge.obsVersion || '',
          obsWebSocketVersion: bridge.obsWebSocketVersion || '',
          obsScenes: Array.isArray(bridge.obsScenes) ? bridge.obsScenes : [],
          activeObsScene: bridge.activeObsScene || '',
          previewObsScene: bridge.previewObsScene || '',
          studioModeEnabled: Boolean(bridge.studioModeEnabled),
          currentTransitionName: bridge.currentTransitionName || '',
          currentTransitionDurationMs: Number(bridge.currentTransitionDurationMs ?? 300),
          obsTransitions: Array.isArray(bridge.obsTransitions) ? bridge.obsTransitions : [],
          primaryAudioInput: bridge.primaryAudioInput || '',
          obsStreamActive: Boolean(bridge.obsStreamActive),
          ...(bridge.mediamtxState ? { mediamtxState: bridge.mediamtxState } : {}),
          lastSyncedAt: new Date(),
        },
      }
    );
    await emitFullStudioState(mid);
  }
}

export async function registerObsBridge(params: {
  name: string;
  label?: string;
  ownerUserId?: string;
  tournamentId?: string;
  assignedMatchIds?: string[];
  platform?: string;
  bridgeVersion?: string;
  capabilities?: string[];
  actor: IUser;
  baseAppUrl: string;
}) {
  let owner: IUser | null = params.actor;
  if (
    params.ownerUserId &&
    mongoose.Types.ObjectId.isValid(params.ownerUserId) &&
    (params.actor.role === 'SUPER_ADMIN' || params.actor.role === 'ADMIN' || params.actor.role === 'TOURNAMENT_ORGANIZER')
  ) {
    const candidate = await User.findById(params.ownerUserId);
    if (candidate && candidate.isActive) owner = candidate;
  }

  const cleanMatchIds = Array.from(
    new Set(
      (params.assignedMatchIds || [])
        .map((id) => String(id).trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    )
  ).map((id) => new mongoose.Types.ObjectId(id));

  let bridgeId = generateUniqueBridgeId();
  while (await ObsBridge.findOne({ bridgeId }).lean()) {
    bridgeId = generateUniqueBridgeId();
  }

  const tokenPair = generateScopedToken('mlbrg');
  const bridge = await ObsBridge.create({
    bridgeId,
    name: params.name.trim(),
    label: (params.label || params.name).trim(),
    ownerUserId: owner._id,
    ownerName: owner.name,
    ownerEmail: owner.email,
    tournamentId:
      params.tournamentId && mongoose.Types.ObjectId.isValid(params.tournamentId)
        ? new mongoose.Types.ObjectId(params.tournamentId)
        : null,
    assignedMatchIds: cleanMatchIds,
    activeMatchId: cleanMatchIds[0] || null,
    tokenHash: tokenPair.hash,
    tokenPrefix: tokenPair.displayPrefix,
    status: 'ACTIVE',
    connectionStatus: 'OFFLINE',
    obsStatus: 'DISCONNECTED',
    platform: params.platform ? String(params.platform).trim().slice(0, 40) : 'win32',
    bridgeVersion: params.bridgeVersion ? String(params.bridgeVersion).trim().slice(0, 40) : '',
    bridgeCapabilities: normalizeBridgeCapabilities(params.capabilities),
    createdBy: params.actor._id,
  });

  await writeBroadcastAudit({
    matchId: cleanMatchIds[0] ? String(cleanMatchIds[0]) : null,
    tournamentId: params.tournamentId || null,
    actionType: 'BRIDGE_REGISTERED',
    actor: params.actor,
    obsStatus: 'SUCCESS',
    metadata: {
      bridgeId: bridge.bridgeId,
      ownerName: owner.name,
      assignedMatchCount: cleanMatchIds.length,
    },
  });

  await recordActivity(
    params.actor,
    'OBS_BRIDGE_REGISTERED',
    'ObsBridge',
    String(bridge._id),
    `Registered Windows OBS Bridge ${bridge.bridgeId} (${bridge.name})`
  );

  const configJson = buildBridgeConfigPayload({
    serverUrl: params.baseAppUrl,
    bridgeId: bridge.bridgeId,
    bridgeToken: tokenPair.raw,
    label: bridge.label || bridge.name,
  });

  return {
    bridge: formatSafeBridge(bridge.toObject()),
    bridgeToken: tokenPair.raw,
    configJson,
    command: `node maidanlive-obs-agent.mjs --server ${params.baseAppUrl} --bridge ${bridge.bridgeId} --token ${tokenPair.raw}`,
  };
}

export async function updateObsBridge(
  bridgeId: string,
  updates: {
    name?: string;
    label?: string;
    ownerUserId?: string;
    tournamentId?: string | null;
    assignedMatchIds?: string[];
  },
  actor: IUser
) {
  const bridge = await ObsBridge.findOne({ bridgeId: bridgeId.toUpperCase() });
  if (!bridge) {
    const err: any = new Error('Registered OBS bridge not found.');
    err.statusCode = 404;
    throw err;
  }
  if (!(await canManageBridge(actor, bridge))) {
    const err: any = new Error('Forbidden: You do not have permission to update this OBS bridge.');
    err.statusCode = 403;
    throw err;
  }

  if (typeof updates.name === 'string' && updates.name.trim()) {
    bridge.name = updates.name.trim();
  }
  if (typeof updates.label === 'string') {
    bridge.label = updates.label.trim();
  }
  if (
    updates.ownerUserId &&
    mongoose.Types.ObjectId.isValid(updates.ownerUserId) &&
    (actor.role === 'SUPER_ADMIN' || actor.role === 'ADMIN')
  ) {
    const owner = await User.findById(updates.ownerUserId);
    if (owner && owner.isActive) {
      bridge.ownerUserId = owner._id as mongoose.Types.ObjectId;
      bridge.ownerName = owner.name;
      bridge.ownerEmail = owner.email;
    }
  }
  if (updates.tournamentId !== undefined) {
    bridge.tournamentId =
      updates.tournamentId && mongoose.Types.ObjectId.isValid(updates.tournamentId)
        ? new mongoose.Types.ObjectId(updates.tournamentId)
        : null;
  }
  if (Array.isArray(updates.assignedMatchIds)) {
    const cleanMatchIds = Array.from(
      new Set(
        updates.assignedMatchIds
          .map((id) => String(id).trim())
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
      )
    ).map((id) => new mongoose.Types.ObjectId(id));
    bridge.assignedMatchIds = cleanMatchIds;
    bridge.activeMatchId = cleanMatchIds[0] || null;
  }

  await bridge.save();
  await syncBridgeLiveStateToMatches(bridge);

  await writeBroadcastAudit({
    matchId: bridge.activeMatchId ? String(bridge.activeMatchId) : null,
    actionType: 'BRIDGE_UPDATED',
    actor,
    obsStatus: 'SUCCESS',
    metadata: { bridgeId: bridge.bridgeId, assignedMatchIds: bridge.assignedMatchIds.map(String) },
  });

  return formatSafeBridge(bridge.toObject());
}

export async function rotateObsBridgeToken(bridgeId: string, actor: IUser, baseAppUrl: string) {
  const bridge = await ObsBridge.findOne({ bridgeId: bridgeId.toUpperCase() });
  if (!bridge) {
    const err: any = new Error('Registered OBS bridge not found.');
    err.statusCode = 404;
    throw err;
  }
  if (!(await canManageBridge(actor, bridge))) {
    const err: any = new Error('Forbidden: You do not have permission to rotate this bridge token.');
    err.statusCode = 403;
    throw err;
  }

  const tokenPair = generateScopedToken('mlbrg');
  bridge.tokenHash = tokenPair.hash;
  bridge.tokenPrefix = tokenPair.displayPrefix;
  bridge.status = 'ACTIVE';
  bridge.revokedAt = null;
  bridge.revokedBy = null;
  bridge.revokeReason = '';
  await bridge.save();

  // Disconnect active bridge session so old token cannot linger
  disconnectBridgeSocket(bridge.bridgeId, 'Bridge token rotated — reconnect with new token.');

  await writeBroadcastAudit({
    matchId: bridge.activeMatchId ? String(bridge.activeMatchId) : null,
    actionType: 'BRIDGE_TOKEN_ROTATED',
    actor,
    obsStatus: 'SUCCESS',
    metadata: { bridgeId: bridge.bridgeId },
  });

  const configJson = buildBridgeConfigPayload({
    serverUrl: baseAppUrl,
    bridgeId: bridge.bridgeId,
    bridgeToken: tokenPair.raw,
    label: bridge.label || bridge.name,
  });

  return {
    bridge: formatSafeBridge(bridge.toObject()),
    bridgeToken: tokenPair.raw,
    configJson,
    command: `node maidanlive-obs-agent.mjs --server ${baseAppUrl} --bridge ${bridge.bridgeId} --token ${tokenPair.raw}`,
  };
}

export async function revokeObsBridge(bridgeId: string, reason: string, actor: IUser) {
  const bridge = await ObsBridge.findOne({ bridgeId: bridgeId.toUpperCase() });
  if (!bridge) {
    const err: any = new Error('Registered OBS bridge not found.');
    err.statusCode = 404;
    throw err;
  }
  if (!(await canManageBridge(actor, bridge))) {
    const err: any = new Error('Forbidden: You do not have permission to revoke this bridge.');
    err.statusCode = 403;
    throw err;
  }

  bridge.status = 'REVOKED';
  bridge.connectionStatus = 'OFFLINE';
  bridge.obsStatus = 'DISCONNECTED';
  bridge.obsStreamActive = false;
  bridge.revokedAt = new Date();
  bridge.revokedBy = actor._id as mongoose.Types.ObjectId;
  bridge.revokeReason = reason.trim() || 'Revoked by administrator';
  bridge.lastError = `Revoked: ${bridge.revokeReason}`;
  await bridge.save();

  disconnectBridgeSocket(bridge.bridgeId, bridge.revokeReason);

  for (const rawId of bridge.assignedMatchIds || []) {
    const mid = String(rawId);
    if (!(await isMatchBridgeOnline(mid))) {
      await ObsControllerProfile.findOneAndUpdate(
        { matchId: mid },
        {
          $set: {
            agentOnline: false,
            connectionStatus: 'DISCONNECTED',
            obsStreamActive: false,
            lastError: `Bridge ${bridge.bridgeId} revoked.`,
          },
        }
      );
      emitBroadcastStudioEvent(mid, 'BRIDGE_DISCONNECTED', {
        matchId: mid,
        bridgeId: bridge.bridgeId,
        reason: 'REVOKED',
      });
      emitBroadcastStudioEvent(mid, 'OBS_DISCONNECTED', {
        matchId: mid,
        reason: 'Bridge revoked',
      });
      await emitFullStudioState(mid);
    }
  }

  await writeBroadcastAudit({
    matchId: bridge.activeMatchId ? String(bridge.activeMatchId) : null,
    actionType: 'BRIDGE_REVOKED',
    actor,
    obsStatus: 'SUCCESS',
    metadata: { bridgeId: bridge.bridgeId, reason: bridge.revokeReason },
  });

  return formatSafeBridge(bridge.toObject());
}

export async function reactivateObsBridge(bridgeId: string, actor: IUser) {
  const bridge = await ObsBridge.findOne({ bridgeId: bridgeId.toUpperCase() });
  if (!bridge) {
    const err: any = new Error('Registered OBS bridge not found.');
    err.statusCode = 404;
    throw err;
  }
  if (!(await canManageBridge(actor, bridge))) {
    const err: any = new Error('Forbidden: You do not have permission to reactivate this bridge.');
    err.statusCode = 403;
    throw err;
  }

  bridge.status = 'ACTIVE';
  bridge.revokedAt = null;
  bridge.revokedBy = null;
  bridge.revokeReason = '';
  bridge.manualDisconnect = false;
  bridge.manualDisconnectedAt = null;
  bridge.manualDisconnectedBy = '';
  bridge.lastError = '';
  await bridge.save();

  await writeBroadcastAudit({
    matchId: bridge.activeMatchId ? String(bridge.activeMatchId) : null,
    actionType: 'BRIDGE_REACTIVATED',
    actor,
    obsStatus: 'SUCCESS',
    metadata: { bridgeId: bridge.bridgeId },
  });

  return formatSafeBridge(bridge.toObject());
}

// =========================================================================
// ONE-CLICK WINDOWS BRIDGE PAIRING, VERIFICATION & CONTROL
// =========================================================================

const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;
const PAIRING_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePairingCode(): string {
  const bytes = crypto.randomBytes(8);
  let raw = '';
  for (let i = 0; i < 8; i += 1) {
    raw += PAIRING_CHARS[bytes[i] % PAIRING_CHARS.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

function normalizePairingCode(raw: string): string {
  const alnum = String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (alnum.length !== 8) return '';
  return `${alnum.slice(0, 4)}-${alnum.slice(4, 8)}`;
}

async function resolveMatchSummary(matchId?: string | null) {
  if (!matchId || !mongoose.Types.ObjectId.isValid(matchId)) return null;
  const s: any = await LiveStream.findById(matchId)
    .select('matchTitle teamAName teamBName gameName tournamentName status')
    .lean();
  if (!s) return null;
  return {
    id: String(s._id),
    matchTitle:
      s.matchTitle || [s.teamAName, s.teamBName].filter(Boolean).join(' vs ') || 'Match Broadcast',
    gameName: s.gameName || '',
    tournamentName: s.tournamentName || '',
    status: s.status || 'UPCOMING',
  };
}

export async function createBridgePairingCode(params: {
  actor: IUser;
  matchId?: string;
  tournamentId?: string;
  bridgeId?: string;
  label?: string;
  requestedOrigin?: string;
  baseAppUrl: string;
}) {
  const pairingCode = generatePairingCode();
  const codeHash = hashScopedToken(pairingCode);
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);

  const cleanMatchId =
    params.matchId && mongoose.Types.ObjectId.isValid(params.matchId)
      ? new mongoose.Types.ObjectId(params.matchId)
      : null;

  let resolvedTournamentId =
    params.tournamentId && mongoose.Types.ObjectId.isValid(params.tournamentId)
      ? new mongoose.Types.ObjectId(params.tournamentId)
      : null;

  if (!resolvedTournamentId && cleanMatchId) {
    const stream: any = await LiveStream.findById(cleanMatchId).select('tournamentId').lean();
    if (stream?.tournamentId) {
      resolvedTournamentId = stream.tournamentId as mongoose.Types.ObjectId;
    }
  }

  let targetBridgeId = '';
  if (params.bridgeId) {
    const existing = await ObsBridge.findOne({ bridgeId: params.bridgeId.trim().toUpperCase() });
    if (existing && (await canManageBridge(params.actor, existing))) {
      targetBridgeId = existing.bridgeId;
    }
  }

  await ObsBridgePairing.create({
    codeHash,
    codePrefix: pairingCode.slice(0, 4),
    createdByUserId: params.actor._id,
    ownerName: params.actor.name,
    ownerEmail: params.actor.email,
    tournamentId: resolvedTournamentId,
    matchId: cleanMatchId,
    bridgeId: targetBridgeId,
    label: (params.label || 'Windows OBS Bridge').trim().slice(0, 140),
    requestedOrigin: (params.requestedOrigin || params.baseAppUrl || '').slice(0, 300),
    expiresAt,
    usedAt: null,
  });

  await writeBroadcastAudit({
    matchId: cleanMatchId ? String(cleanMatchId) : null,
    tournamentId: resolvedTournamentId ? String(resolvedTournamentId) : null,
    actionType: 'BRIDGE_PAIRING_CREATED',
    actor: params.actor,
    obsStatus: 'SUCCESS',
    metadata: {
      codePrefix: pairingCode.slice(0, 4),
      targetBridgeId: targetBridgeId || null,
      expiresAt: expiresAt.toISOString(),
    },
  });

  const qp = new URLSearchParams();
  qp.set('code', pairingCode);
  qp.set('server', params.baseAppUrl);
  if (cleanMatchId) qp.set('matchId', String(cleanMatchId));

  return {
    pairingCode,
    expiresAt: expiresAt.toISOString(),
    ttlSeconds: Math.floor(PAIRING_CODE_TTL_MS / 1000),
    protocolUrl: `maidanlive-bridge://pair?${qp.toString()}`,
    serverUrl: params.baseAppUrl,
    matchId: cleanMatchId ? String(cleanMatchId) : null,
  };
}

export async function exchangeBridgePairingCode(params: {
  code: string;
  deviceName?: string;
  deviceLabel?: string;
  platform?: string;
  bridgeVersion?: string;
  capabilities?: string[];
  baseAppUrl: string;
}) {
  const normalized = normalizePairingCode(params.code);
  if (!normalized) {
    const err: any = new Error('Enter a valid 8-character pairing code (e.g. ABCD-EFGH).');
    err.statusCode = 400;
    throw err;
  }

  const codeHash = hashScopedToken(normalized);
  // Single-use atomic claim (replay protection)
  const pairing = await ObsBridgePairing.findOneAndUpdate(
    {
      codeHash,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { usedAt: new Date() } },
    { new: true }
  );

  if (!pairing) {
    const err: any = new Error(
      'Pairing code is invalid, expired, or has already been used. Generate a fresh code in MaidanLive.'
    );
    err.statusCode = 401;
    throw err;
  }

  const owner: any = await User.findById(pairing.createdByUserId);
  if (!owner || !owner.isActive) {
    const err: any = new Error('The broadcaster account for this pairing code is inactive.');
    err.statusCode = 403;
    throw err;
  }

  if (
    pairing.matchId &&
    owner.role !== 'SUPER_ADMIN' &&
    owner.role !== 'ADMIN' &&
    !(await hasBroadcastAccess(owner, String(pairing.matchId), 'broadcast:control'))
  ) {
    const err: any = new Error('Broadcaster no longer holds permission for the target match.');
    err.statusCode = 403;
    throw err;
  }

  const cleanDeviceName = (params.deviceName || pairing.label || 'MaidanLive OBS Bridge')
    .trim()
    .slice(0, 120);
  const cleanLabel = (params.deviceLabel || cleanDeviceName).trim().slice(0, 140);
  const cleanPlatform = (params.platform || 'win32').trim().slice(0, 40);
  const cleanBridgeVersion = (params.bridgeVersion || '').trim().slice(0, 40);
  const cleanCapabilities = normalizeBridgeCapabilities(params.capabilities);

  let bridge: IObsBridge | null = null;
  const tokenPair = generateScopedToken('mlbrg');

  if (pairing.bridgeId) {
    bridge = await ObsBridge.findOne({ bridgeId: pairing.bridgeId });
  }

  if (bridge && bridge.status !== 'REVOKED') {
    bridge.tokenHash = tokenPair.hash;
    bridge.tokenPrefix = tokenPair.displayPrefix;
    bridge.label = cleanLabel || bridge.label;
    bridge.platform = cleanPlatform;
    bridge.bridgeVersion = cleanBridgeVersion;
    bridge.bridgeCapabilities = cleanCapabilities;
    bridge.manualDisconnect = false;
    bridge.manualDisconnectedAt = null;
    bridge.manualDisconnectedBy = '';
    if (pairing.matchId) {
      const midStr = String(pairing.matchId);
      const existingIds = (bridge.assignedMatchIds || []).map(String);
      if (!existingIds.includes(midStr)) {
        bridge.assignedMatchIds.push(pairing.matchId);
      }
      bridge.activeMatchId = pairing.matchId;
    }
    await bridge.save();
    disconnectBridgeSocket(bridge.bridgeId, 'Bridge re-paired on device.');
  } else {
    let bridgeId = generateUniqueBridgeId();
    while (await ObsBridge.findOne({ bridgeId }).lean()) {
      bridgeId = generateUniqueBridgeId();
    }
    const assigned = pairing.matchId ? [pairing.matchId] : [];
    bridge = await ObsBridge.create({
      bridgeId,
      name: cleanDeviceName,
      label: cleanLabel,
      ownerUserId: owner._id,
      ownerName: owner.name,
      ownerEmail: owner.email,
      tournamentId: pairing.tournamentId || null,
      assignedMatchIds: assigned,
      activeMatchId: pairing.matchId || null,
      tokenHash: tokenPair.hash,
      tokenPrefix: tokenPair.displayPrefix,
      status: 'ACTIVE',
      connectionStatus: 'OFFLINE',
      obsStatus: 'DISCONNECTED',
      platform: cleanPlatform,
      bridgeVersion: cleanBridgeVersion,
      bridgeCapabilities: cleanCapabilities,
      createdBy: owner._id,
    });
  }

  pairing.usedByBridgeId = bridge.bridgeId;
  await pairing.save();

  if (pairing.matchId) {
    await ObsControllerProfile.findOneAndUpdate(
      { matchId: pairing.matchId },
      { $set: { connectionMode: 'local_agent' } }
    );
  }

  await writeBroadcastAudit({
    matchId: pairing.matchId ? String(pairing.matchId) : null,
    tournamentId: pairing.tournamentId ? String(pairing.tournamentId) : null,
    actionType: 'BRIDGE_PAIRED',
    actor: owner,
    obsStatus: 'SUCCESS',
    metadata: {
      bridgeId: bridge.bridgeId,
      method: 'PAIRING_CODE',
      platform: cleanPlatform,
    },
  });

  await recordActivity(
    owner,
    'OBS_BRIDGE_PAIRED',
    'ObsBridge',
    String(bridge._id),
    `Paired Windows OBS Bridge ${bridge.bridgeId} via one-time pairing code`
  );

  const match = await resolveMatchSummary(
    bridge.activeMatchId ? String(bridge.activeMatchId) : pairing.matchId ? String(pairing.matchId) : null
  );

  return {
    bridgeId: bridge.bridgeId,
    bridgeToken: tokenPair.raw,
    serverUrl: params.baseAppUrl,
    bridge: formatSafeBridge(bridge.toObject()),
    match,
  };
}

export async function pairBridgeViaUserAccount(params: {
  actor: IUser;
  matchId?: string;
  deviceName?: string;
  deviceLabel?: string;
  platform?: string;
  bridgeVersion?: string;
  capabilities?: string[];
  baseAppUrl: string;
}) {
  if (
    params.matchId &&
    mongoose.Types.ObjectId.isValid(params.matchId) &&
    params.actor.role !== 'SUPER_ADMIN' &&
    params.actor.role !== 'ADMIN'
  ) {
    const allowed = await hasBroadcastAccess(params.actor, params.matchId, 'broadcast:control');
    if (!allowed) {
      const err: any = new Error('Forbidden: You are not assigned to broadcast this match.');
      err.statusCode = 403;
      throw err;
    }
  }

  const result = await registerObsBridge({
    name: params.deviceName || 'Windows OBS Bridge',
    label: params.deviceLabel || params.deviceName || 'Windows OBS Bridge',
    assignedMatchIds:
      params.matchId && mongoose.Types.ObjectId.isValid(params.matchId) ? [params.matchId] : [],
    platform: params.platform,
    bridgeVersion: params.bridgeVersion,
    capabilities: params.capabilities,
    actor: params.actor,
    baseAppUrl: params.baseAppUrl,
  });

  if (params.matchId && mongoose.Types.ObjectId.isValid(params.matchId)) {
    await ObsControllerProfile.findOneAndUpdate(
      { matchId: params.matchId },
      { $set: { connectionMode: 'local_agent' } }
    );
  }

  if (!result.bridge) {
    throw new Error('Failed to create bridge registration.');
  }

  const match = await resolveMatchSummary(params.matchId || null);
  return {
    bridgeId: result.bridge.bridgeId,
    bridgeToken: result.bridgeToken,
    serverUrl: params.baseAppUrl,
    bridge: result.bridge,
    match,
  };
}

export async function verifyBridgeCredentials(bridgeId: string, bridgeToken: string) {
  const cleanId = String(bridgeId || '').trim().toUpperCase();
  const cleanToken = String(bridgeToken || '').trim();
  if (!cleanId || !cleanToken) {
    const err: any = new Error('Bridge credentials missing.');
    err.statusCode = 401;
    throw err;
  }

  const bridge = await ObsBridge.findOne({ bridgeId: cleanId }).select('+tokenHash').lean();
  if (!bridge) {
    const err: any = new Error('Bridge registration not found.');
    err.statusCode = 404;
    throw err;
  }
  if (bridge.status === 'REVOKED') {
    const err: any = new Error(bridge.revokeReason || 'This Bridge has been revoked.');
    err.statusCode = 403;
    throw err;
  }
  if (!verifyScopedToken(cleanToken, bridge.tokenHash || '')) {
    const err: any = new Error('Invalid or rotated Bridge token.');
    err.statusCode = 401;
    throw err;
  }

  const matchId = bridge.activeMatchId
    ? String(bridge.activeMatchId)
    : bridge.assignedMatchIds?.[0]
      ? String(bridge.assignedMatchIds[0])
      : null;
  const match = await resolveMatchSummary(matchId);

  return {
    bridge: formatSafeBridge(bridge),
    match,
  };
}

export async function requestBridgeObsReconnect(bridgeId: string, actor: IUser) {
  const cleanId = String(bridgeId || '').trim().toUpperCase();
  const bridge = await ObsBridge.findOne({ bridgeId: cleanId });
  if (!bridge) {
    const err: any = new Error('Registered OBS bridge not found.');
    err.statusCode = 404;
    throw err;
  }
  if (!(await canManageBridge(actor, bridge))) {
    const err: any = new Error('Forbidden: Insufficient permissions for this bridge.');
    err.statusCode = 403;
    throw err;
  }
  const sock = bridgeSockets.get(bridge.bridgeId);
  if (!sock || !sock.connected) {
    const err: any = new Error('Bridge desktop app is currently offline. Open MaidanLive OBS Bridge on Windows.');
    err.statusCode = 503;
    throw err;
  }

  bridge.manualDisconnect = false;
  bridge.manualDisconnectedAt = null;
  bridge.manualDisconnectedBy = '';
  await bridge.save();
  for (const rawId of bridge.assignedMatchIds || []) {
    const mid = String(rawId);
    if (mongoose.Types.ObjectId.isValid(mid)) {
      await ObsControllerProfile.findOneAndUpdate(
        { matchId: mid },
        {
          $set: {
            desiredConnected: true,
            manualDisconnect: false,
            manualDisconnectedAt: null,
            manualDisconnectedBy: '',
          },
        }
      );
    }
  }

  const res = await new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Bridge reconnect command timed out.'));
    }, 10_000);
    sock.emit('server:obs_command', { command: 'reconnect_obs', payload: {} }, (ack: any) => {
      clearTimeout(timer);
      if (!ack || !ack.ok) {
        reject(new Error(ack?.error || 'OBS reconnect command failed on Windows Bridge.'));
        return;
      }
      resolve(ack.data || {});
    });
  });

  await writeBroadcastAudit({
    matchId: bridge.activeMatchId ? String(bridge.activeMatchId) : null,
    actionType: 'BRIDGE_RECONNECT_REQUESTED',
    actor,
    obsStatus: 'SUCCESS',
    metadata: { bridgeId: bridge.bridgeId },
  });

  return { ok: true, bridge: formatSafeBridge(bridge.toObject()), result: res };
}

export async function triggerBridgeSceneTransition(
  bridgeId: string,
  params: {
    previewSceneName?: string;
    sceneName?: string;
    transitionName?: string;
    transitionDurationMs?: number;
    ensureStudioMode?: boolean;
  },
  actor: IUser
) {
  const cleanId = String(bridgeId || '').trim().toUpperCase();
  const bridge = await ObsBridge.findOne({ bridgeId: cleanId });
  if (!bridge) {
    const err: any = new Error('Registered OBS bridge not found.');
    err.statusCode = 404;
    throw err;
  }
  if (!(await canManageBridge(actor, bridge))) {
    const err: any = new Error('Forbidden: Insufficient permissions for this bridge.');
    err.statusCode = 403;
    throw err;
  }
  const sock = bridgeSockets.get(bridge.bridgeId);
  if (!sock || !sock.connected) {
    const err: any = new Error('OBS Bridge is offline. Connect MaidanLive OBS Bridge before triggering transitions.');
    err.statusCode = 503;
    throw err;
  }

  const res = await new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('OBS Scene Transition command timed out on Bridge.'));
    }, 10_000);
    sock.emit(
      'server:obs_command',
      {
        command: 'trigger_transition',
        payload: {
          ...(params.previewSceneName ? { previewSceneName: params.previewSceneName } : {}),
          ...(params.sceneName ? { sceneName: params.sceneName } : {}),
          ...(params.transitionName ? { transitionName: params.transitionName } : {}),
          ...(Number.isFinite(Number(params.transitionDurationMs))
            ? { transitionDurationMs: Math.max(0, Math.min(5000, Math.round(Number(params.transitionDurationMs)))) }
            : {}),
          ensureStudioMode: params.ensureStudioMode !== false,
        },
      },
      (ack: any) => {
        clearTimeout(timer);
        if (!ack || !ack.ok) {
          reject(new Error(ack?.error || 'OBS Scene Transition failed on Bridge.'));
          return;
        }
        resolve(ack.data || {});
      }
    );
  });

  if (typeof res?.activeObsScene === 'string' && res.activeObsScene) {
    bridge.activeObsScene = res.activeObsScene;
  }
  if (typeof res?.previewObsScene === 'string') {
    bridge.previewObsScene = res.previewObsScene;
  }
  if (typeof res?.studioModeEnabled === 'boolean') {
    bridge.studioModeEnabled = res.studioModeEnabled;
  }
  if (typeof res?.currentTransitionName === 'string' && res.currentTransitionName) {
    bridge.currentTransitionName = res.currentTransitionName;
  }
  await bridge.save();
  await syncBridgeLiveStateToMatches(bridge);

  await writeBroadcastAudit({
    matchId: bridge.activeMatchId ? String(bridge.activeMatchId) : null,
    actionType: 'OBS_SCENE_TRANSITION',
    newScene: bridge.activeObsScene || '',
    actor,
    obsStatus: 'SUCCESS',
    metadata: {
      bridgeId: bridge.bridgeId,
      previewObsScene: bridge.previewObsScene || '',
      transitionName: bridge.currentTransitionName || '',
    },
  });

  return { ok: true, bridge: formatSafeBridge(bridge.toObject()), result: res };
}

export async function disconnectActiveBridgeByOperator(bridgeId: string, actor: IUser) {
  const cleanId = String(bridgeId || '').trim().toUpperCase();
  const bridge = await ObsBridge.findOne({ bridgeId: cleanId });
  if (!bridge) {
    const err: any = new Error('Registered OBS bridge not found.');
    err.statusCode = 404;
    throw err;
  }
  if (!(await canManageBridge(actor, bridge))) {
    const err: any = new Error('Forbidden: Insufficient permissions for this bridge.');
    err.statusCode = 403;
    throw err;
  }

  const trackingKey = `bridge:${bridge.bridgeId}`;
  clearBridgeDisconnectTimer(trackingKey);
  bridgeHealthTracker.remove(trackingKey);

  const actorName = actor.name || 'Admin';
  bridge.manualDisconnect = true;
  bridge.manualDisconnectedAt = new Date();
  bridge.manualDisconnectedBy = actorName;
  bridge.connectionStatus = 'OFFLINE';
  bridge.bridgeConnectionState = 'OFFLINE';
  bridge.obsStatus = 'DISCONNECTED';
  bridge.obsConnectionState = 'OFFLINE';
  bridge.obsStreamActive = false;
  bridge.lastDisconnectedAt = new Date();
  bridge.lastDisconnectReason = `Disconnected by ${actorName}`;
  bridge.lastError = `Disconnected by ${actorName}`;
  await bridge.save();

  const sock = bridgeSockets.get(bridge.bridgeId);
  if (sock) {
    try {
      sock.emit('server:disconnect_bridge', {
        bridgeId: bridge.bridgeId,
        adminDisconnected: true,
        reason: `Disconnected by ${actorName} from Control Room`,
      });
      sock.disconnect(true);
    } catch {
      // Ignore disconnect error
    }
    bridgeSockets.delete(bridge.bridgeId);
  }

  for (const rawId of bridge.assignedMatchIds || []) {
    const mid = String(rawId);
    if (!(await isMatchBridgeOnline(mid))) {
      await ObsControllerProfile.findOneAndUpdate(
        { matchId: mid },
        {
          $set: {
            agentOnline: false,
            bridgeConnectionState: 'OFFLINE',
            connectionStatus: 'DISCONNECTED',
            obsStreamActive: false,
            desiredConnected: false,
            manualDisconnect: true,
            manualDisconnectedAt: new Date(),
            manualDisconnectedBy: actorName,
            lastDisconnectReason: `Disconnected by ${actorName}`,
            lastError: `Disconnected by ${actorName}`,
          },
        }
      );
      emitBroadcastStudioEvent(mid, 'BRIDGE_DISCONNECTED', {
        matchId: mid,
        bridgeId: bridge.bridgeId,
        reason: 'OPERATOR_DISCONNECT',
        manualDisconnect: true,
        bridgeConnectionState: 'OFFLINE',
      });
      await emitFullStudioState(mid);
    }
  }

  await writeBroadcastAudit({
    matchId: bridge.activeMatchId ? String(bridge.activeMatchId) : null,
    actionType: 'BRIDGE_DISCONNECTED',
    actor,
    obsStatus: 'SUCCESS',
    metadata: { bridgeId: bridge.bridgeId },
  });

  return formatSafeBridge(bridge.toObject());
}

export async function assignCameraToObs(
  matchId: string,
  cameraId: string,
  actor: IUser,
  override = false
) {
  const profile = await ensureObsProfileForMatch(matchId, actor._id as any);
  checkAdminOverrideGuard(profile, actor, override);

  const cam = await BroadcastCamera.findOne({ matchId, cameraId }).select('+mediamtxStreamKeyEnc');
  if (!cam) {
    const err: any = new Error('Camera not found.');
    err.statusCode = 404;
    throw err;
  }

  const targetSceneName = cam.obsSceneName?.trim() || `CAM ${cam.cameraNumber} FULL`;
  const targetInputName = cam.obsInputName?.trim() || `ML_CAM_${cam.cameraNumber}`;
  const roomPassword = await getRoomPasswordForProfile(profile);
  const ensureInput = buildObsEnsureInputForCamera(cam, profile, roomPassword);
  if (!ensureInput) {
    const err: any = new Error(
      cam.sourceType === 'mediamtx' && cam.mediamtxRevoked
        ? 'Camera credentials are revoked. Rotate credentials before syncing to OBS.'
        : 'Camera source URL/configuration is missing or invalid.'
    );
    err.statusCode = 400;
    throw err;
  }

  const rotationDeg = parseOrientationDegrees(cam.orientationMode);
  const previewFit = normalizePreviewFit(cam.previewFit);
  const rpcRes = await callObsRpc(matchId, 'update_camera_transform', {
    sceneName: targetSceneName,
    inputName: targetInputName,
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    rotation: rotationDeg,
    previewFit,
    ensureInput,
  });

  cam.obsSceneName = targetSceneName;
  cam.obsInputName = targetInputName;
  cam.obsSourceConfigured = true;
  cam.obsSourceAvailable = true;
  await cam.save();

  await writeBroadcastAudit({
    matchId,
    tournamentId: profile.tournamentId ? String(profile.tournamentId) : null,
    actionType: 'CAMERA_OBS_SYNCED',
    cameraId: cam.cameraId,
    cameraName: cam.name,
    newScene: targetSceneName,
    actor,
    adminOverride: Boolean(override),
    obsStatus: 'SUCCESS',
    metadata: { inputName: targetInputName, inputKind: ensureInput.inputKind },
  });
  await emitFullStudioState(matchId);

  return {
    ok: true,
    sceneName: targetSceneName,
    inputName: targetInputName,
    inputKind: ensureInput.inputKind,
    rpcRes,
    camera: formatSafeCamera(cam.toObject(), profile, { includePrivateUrls: true }),
  };
}

export async function removeCameraObsSource(matchId: string, inputName: string): Promise<boolean> {
  if (!inputName || !inputName.trim()) return false;
  try {
    await callObsRpc(matchId, 'remove_input', { inputName: inputName.trim() });
    return true;
  } catch {
    return false;
  }
}

export async function controlBridgeMediaMTX(
  matchId: string,
  action: 'status' | 'start' | 'stop' | 'restart' | 'sync_config' | 'logs',
  payload: Record<string, any> = {},
  actor?: IUser | null
) {
  const cmdMap: Record<typeof action, string> = {
    status: 'mediamtx_status',
    start: 'mediamtx_start',
    stop: 'mediamtx_stop',
    restart: 'mediamtx_restart',
    sync_config: 'mediamtx_sync_config',
    logs: 'mediamtx_logs',
  };
  const resolved = await resolveAgentSocketForMatch(matchId);
  if (!resolved) {
    const err: any = new Error(
      'Windows Local OBS Bridge is not connected to this match right now. Open MaidanLive OBS Bridge on your broadcasting PC, or click "Download mediamtx.yml" below to run MediaMTX manually.'
    );
    err.statusCode = 503;
    err.code = 'BRIDGE_OFFLINE';
    throw err;
  }

  const data = await new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => {
      const timeoutErr: any = new Error(
        `Windows Local OBS Bridge timed out while executing MediaMTX "${action}". Retry or use "Download mediamtx.yml" below.`
      );
      timeoutErr.statusCode = 504;
      timeoutErr.code = 'BRIDGE_TIMEOUT';
      reject(timeoutErr);
    }, 12_000);
    resolved.socket.emit(
      'server:obs_command',
      { command: cmdMap[action], payload },
      (ack: any) => {
        clearTimeout(timer);
        if (!ack || !ack.ok) {
          const rawErr = String(ack?.error || `MediaMTX ${action} command failed on bridge.`);
          const isUnsupported =
            /rejected unauthorized bridge command|unsupported command/i.test(rawErr);
          const isMissingExe =
            /mediamtx executable|mediamtx\.exe.*not found|was not found/i.test(rawErr);
          const cmdErr: any = new Error(
            isUnsupported
              ? 'Your connected Windows OBS Bridge version does not support remote MediaMTX control yet. Install the updated Windows OBS Bridge installer (or use "Download mediamtx.yml" below and run MediaMTX directly on your PC).'
              : rawErr
          );
          cmdErr.statusCode = 422;
          cmdErr.code = isUnsupported
            ? 'BRIDGE_UPGRADE_REQUIRED'
            : isMissingExe
              ? 'MEDIAMTX_BINARY_MISSING'
              : 'MEDIAMTX_CONTROL_FAILED';
          reject(cmdErr);
          return;
        }
        resolve(ack.data || {});
      }
    );
  });

  const profilePatch: Record<string, any> = {};
  const bridgePatch: Record<string, any> = {};
  if (data?.mediamtx) {
    profilePatch.mediamtxState = data.mediamtx;
    bridgePatch.mediamtxState = data.mediamtx;
  }
  if (typeof data?.bridgeVersion === 'string' && data.bridgeVersion.trim()) {
    profilePatch.bridgeVersion = data.bridgeVersion.trim().slice(0, 40);
    bridgePatch.bridgeVersion = data.bridgeVersion.trim().slice(0, 40);
  }
  if (Array.isArray(data?.capabilities)) {
    const caps = normalizeBridgeCapabilities(data.capabilities);
    profilePatch.bridgeCapabilities = caps;
    bridgePatch.bridgeCapabilities = caps;
  }

  if (Object.keys(profilePatch).length > 0) {
    await ObsControllerProfile.findOneAndUpdate({ matchId }, { $set: profilePatch });
  }
  if (resolved.bridgeId && Object.keys(bridgePatch).length > 0) {
    await ObsBridge.findOneAndUpdate({ bridgeId: resolved.bridgeId }, { $set: bridgePatch });
  }

  if (actor) {
    await writeBroadcastAudit({
      matchId,
      actionType: 'MEDIAMTX_CONTROL',
      actor,
      obsStatus: 'SUCCESS',
      metadata: { action, running: data?.mediamtx?.running ?? null },
    });
  }
  await emitFullStudioState(matchId);
  return data;
}

export async function refreshMatchCameras(matchId: string, actor: IUser) {
  const profile = await ensureObsProfileForMatch(matchId, actor._id as any);
  const cameras = await BroadcastCamera.find({ matchId }).sort({ sortOrder: 1, cameraNumber: 1 });

  const isObsConnected =
    profile.connectionMode === 'local_agent'
      ? Boolean((await isMatchBridgeOnline(matchId)) && profile.connectionStatus === 'CONNECTED')
      : Boolean(directSessions.get(matchId)?.connected);

  if (isObsConnected) {
    try {
      await refreshObsState(matchId);
    } catch {
      // Non-fatal: continue refreshing camera heartbeats and MediaMTX stream state
    }
  }

  let onlineCount = 0;
  for (const cam of cameras) {
    if (!cam.enabled) continue;

    if (cam.sourceType === 'mediamtx' && (cam.mediamtxStreamPath || cam.connectionUrl)) {
      try {
        const mtx = await verifyMediaMTXStreamHealth({
          streamPath: cam.mediamtxStreamPath || cam.connectionUrl,
          hlsPlaybackUrl: cam.connectionUrl,
          webrtcPlaybackUrl: '',
        });
        cam.mediamtxPublisherConnected = mtx.ok;
        if (!mtx.ok && !cam.lastError) {
          cam.lastError = mtx.message.slice(0, 400);
        } else if (mtx.ok && cam.lastError) {
          cam.lastError = '';
        }
      } catch {
        // Keep existing state if MediaMTX API probe cannot be reached
      }
    }

    cam.status = computeEffectiveCameraStatus(
      cam,
      profile.activeCameraId || '',
      profile.activeObsScene || '',
      isObsConnected,
      profile.activeCameraIds || []
    );
    if (cam.status === 'ACTIVE' || cam.status === 'CONNECTED' || cam.mediamtxPublisherConnected) {
      onlineCount += 1;
    }
    await cam.save();
  }

  await emitFullStudioState(matchId);

  return {
    ok: true,
    refreshedCount: cameras.filter((c) => c.enabled).length,
    onlineCount,
  };
}

export async function resolveActiveOverlayMatchId(bridgeId?: string): Promise<{
  matchId: string | null;
  bridgeId: string | null;
  source: 'bridge_id' | 'online_bridge' | 'live_stream' | 'none';
}> {
  const cleanBridgeId = typeof bridgeId === 'string' ? bridgeId.trim().toUpperCase() : '';
  if (cleanBridgeId) {
    const specific = await ObsBridge.findOne({ bridgeId: cleanBridgeId, status: 'ACTIVE' }).lean();
    if (specific?.activeMatchId) {
      return {
        matchId: String(specific.activeMatchId),
        bridgeId: specific.bridgeId,
        source: 'bridge_id',
      };
    }
  }

  // Prefer currently online registered OBS Bridge
  const bridges = await ObsBridge.find({ status: 'ACTIVE', activeMatchId: { $ne: null } })
    .sort({ lastHeartbeatAt: -1, lastConnectedAt: -1, updatedAt: -1 })
    .lean();

  for (const br of bridges) {
    const sock = bridgeSockets.get(br.bridgeId);
    if (sock && sock.connected && br.activeMatchId) {
      return {
        matchId: String(br.activeMatchId),
        bridgeId: br.bridgeId,
        source: 'online_bridge',
      };
    }
  }

  if (bridges.length > 0 && bridges[0].activeMatchId) {
    return {
      matchId: String(bridges[0].activeMatchId),
      bridgeId: bridges[0].bridgeId,
      source: 'online_bridge',
    };
  }

  const activeLive = await LiveStream.findOne({
    status: 'LIVE',
    broadcastPublished: { $ne: false },
  })
    .sort({ activatedAt: -1, updatedAt: -1 })
    .select('_id')
    .lean();

  if (activeLive?._id) {
    return {
      matchId: String(activeLive._id),
      bridgeId: null,
      source: 'live_stream',
    };
  }

  return { matchId: null, bridgeId: null, source: 'none' };
}

export interface SwitchMatchBroadcastOptions {
  sourceMatchId?: string;
  targetSceneName?: string;
  keepCurrentObsScene?: boolean;
  syncScoreboardSource?: boolean;
  syncCameraLayout?: boolean;
  copyStyleFromSourceMatch?: boolean;
  scoreboardSourceName?: string;
  baseAppUrl?: string;
  override?: boolean;
  matchDetails?: {
    matchTitle?: string;
    teamAName?: string;
    teamBName?: string;
    gameName?: string;
    tournamentName?: string;
    status?: 'UPCOMING' | 'LIVE' | 'ENDED';
    broadcastPublished?: boolean;
    showScoreboardOnYoutube?: boolean;
    youtubeInput?: string;
    activeStreamingProvider?: 'youtube' | 'mediamtx';
    overlayPatch?: Record<string, unknown>;
  };
}

export async function switchMatchBroadcastInObs(
  targetMatchId: string,
  options: SwitchMatchBroadcastOptions,
  actor: IUser
) {
  if (!mongoose.Types.ObjectId.isValid(targetMatchId)) {
    const err: any = new Error('Invalid target match ID.');
    err.statusCode = 400;
    throw err;
  }

  const stream = await LiveStream.findById(targetMatchId);
  if (!stream) {
    const err: any = new Error('Target match broadcast not found.');
    err.statusCode = 404;
    throw err;
  }

  const targetProfile = await ensureObsProfileForMatch(targetMatchId, actor._id as any);
  checkAdminOverrideGuard(targetProfile, actor, options.override);

  const sourceMatchId =
    options.sourceMatchId &&
    mongoose.Types.ObjectId.isValid(options.sourceMatchId) &&
    options.sourceMatchId !== targetMatchId
      ? options.sourceMatchId
      : '';

  const [sourceProfile, sourceStream] = await Promise.all([
    sourceMatchId ? ObsControllerProfile.findOne({ matchId: sourceMatchId }).select('+obsPasswordEnc').lean() : null,
    sourceMatchId ? LiveStream.findById(sourceMatchId).lean() : null,
  ]);

  let matchDetailsUpdated = false;
  let scoreUpdated = false;
  let overlayUpdated = false;

  // Apply any inline match/broadcast/scoreboard detail edits alongside the OBS switch
  if (options.matchDetails && typeof options.matchDetails === 'object') {
    const d = options.matchDetails;
    if (typeof d.matchTitle === 'string' && d.matchTitle.trim()) {
      stream.matchTitle = sanitizeText(d.matchTitle, 160);
      matchDetailsUpdated = true;
    }
    if (typeof d.teamAName === 'string' && d.teamAName.trim()) {
      stream.teamAName = sanitizeText(d.teamAName, 100);
      matchDetailsUpdated = true;
    }
    if (typeof d.teamBName === 'string' && d.teamBName.trim()) {
      stream.teamBName = sanitizeText(d.teamBName, 100);
      matchDetailsUpdated = true;
    }
    if (typeof d.gameName === 'string' && d.gameName.trim()) {
      const cleanedGame = sanitizeText(d.gameName, 80);
      const matchedSport = (['Cricket', 'Kabaddi', 'Football', 'Volleyball', 'Other'] as const).find(
        (s) => s.toLowerCase() === cleanedGame.toLowerCase()
      );
      stream.gameName = matchedSport || 'Other';
      matchDetailsUpdated = true;
    }
    if (typeof d.tournamentName === 'string') {
      stream.tournamentName = sanitizeText(d.tournamentName, 160);
      matchDetailsUpdated = true;
    }
    if (d.status && ['UPCOMING', 'LIVE', 'ENDED'].includes(d.status)) {
      stream.status = d.status;
      if (d.status === 'LIVE' && !stream.startedAt) {
        stream.startedAt = new Date();
      }
      if (d.status === 'ENDED' && !stream.endedAt) {
        stream.endedAt = new Date();
      }
      matchDetailsUpdated = true;
    }
    if (typeof d.broadcastPublished === 'boolean') {
      stream.broadcastPublished = d.broadcastPublished;
      if (d.broadcastPublished) {
        stream.wasPublished = true;
        if (!stream.activatedAt) stream.activatedAt = new Date();
      }
      matchDetailsUpdated = true;
    }
    if (typeof d.showScoreboardOnYoutube === 'boolean') {
      stream.showScoreboardOnYoutube = d.showScoreboardOnYoutube;
      matchDetailsUpdated = true;
    }
    if (typeof d.youtubeInput === 'string' && d.youtubeInput.trim()) {
      const parsedYt = extractYouTubeVideoId(d.youtubeInput);
      if (!parsedYt.valid || !parsedYt.videoId) {
        const err: any = new Error(parsedYt.error || 'Invalid YouTube URL or 11-character Video ID.');
        err.statusCode = 400;
        throw err;
      }
      stream.youtubeVideoId = parsedYt.videoId;
      stream.youtubeInput = sanitizeText(parsedYt.watchUrl || d.youtubeInput.trim(), 300);
      if (stream.youtubeStreamStatus === 'UNKNOWN' || stream.youtubeStreamStatus === 'UNAVAILABLE') {
        stream.youtubeStreamStatus = 'READY';
      }
      matchDetailsUpdated = true;
    }
    if (d.activeStreamingProvider === 'youtube' || d.activeStreamingProvider === 'mediamtx') {
      stream.streamingProvider = d.activeStreamingProvider;
      stream.activeStreamingProvider = d.activeStreamingProvider;
      stream.lastProviderSwitchAt = new Date();
      stream.lastProviderSwitchBy = actor._id as mongoose.Types.ObjectId;
      stream.lastProviderSwitchByName = actor.name;
      matchDetailsUpdated = true;
    }
    if (d.overlayPatch && typeof d.overlayPatch === 'object') {
      const mergedOverlay = normalizeOverlayConfig({
        ...((stream as any).overlayConfig || {}),
        ...d.overlayPatch,
      });
      (stream as any).overlayConfig = mergedOverlay;
      if (typeof (stream as any).markModified === 'function') {
        (stream as any).markModified('overlayConfig');
      }
      overlayUpdated = true;
      matchDetailsUpdated = true;
    }
  }

  // Optional explicit copy of overlay visual style from the previous match
  if (options.copyStyleFromSourceMatch && sourceStream && (sourceStream as any).overlayConfig) {
    const srcCfg = normalizeOverlayConfig((sourceStream as any).overlayConfig);
    const curCfg = normalizeOverlayConfig((stream as any).overlayConfig);
    (stream as any).overlayConfig = normalizeOverlayConfig({
      ...curCfg,
      style: srcCfg.style,
      fullScoreboardStyle: srcCfg.fullScoreboardStyle,
      position: srcCfg.position,
      scale: srcCfg.scale,
      customScale: srcCfg.customScale,
      theme: srcCfg.theme,
      customScoreboardDesign: srcCfg.customScoreboardDesign,
      brandLogoPosition: srcCfg.brandLogoPosition,
      brandLogoSize: srcCfg.brandLogoSize,
      brandLogoOpacity: srcCfg.brandLogoOpacity,
      showBrandLogo: srcCfg.showBrandLogo,
      brandLogoUrl: srcCfg.brandLogoUrl,
    });
    if (typeof (stream as any).markModified === 'function') {
      (stream as any).markModified('overlayConfig');
    }
    overlayUpdated = true;
    matchDetailsUpdated = true;
  }

  if (matchDetailsUpdated) {
    stream.updatedBy = actor._id as mongoose.Types.ObjectId;
    await stream.save();

    // Sync LiveScore sport if edited
    const liveScore = await LiveScore.findOne({ liveStreamId: targetMatchId });
    if (liveScore) {
      let dirtyScore = false;
      const nextSport = stream.gameName || 'Other';
      if (options.matchDetails?.gameName && liveScore.sportType !== nextSport) {
        liveScore.sportType = nextSport;
        dirtyScore = true;
      }
      if (dirtyScore) {
        await liveScore.save();
        scoreUpdated = true;
      }
    }

    const updatedObj = stream.toObject ? stream.toObject() : (stream as any);
    const liveScoreObj = liveScore
      ? liveScore.toObject
        ? liveScore.toObject()
        : liveScore
      : undefined;
    emitStreamEvent(targetMatchId, 'live:updated', {
      ...updatedObj,
      id: String(stream._id),
      ...(liveScoreObj ? { score: liveScoreObj } : {}),
    });
    if (overlayUpdated) {
      const normalized = normalizeOverlayConfig((stream as any).overlayConfig);
      emitStreamEvent(targetMatchId, 'overlay:config_updated', {
        streamId: targetMatchId,
        overlayConfig: normalized,
        showScoreboardOnYoutube: stream.showScoreboardOnYoutube !== false,
      });
      emitBroadcastStudioEvent(targetMatchId, 'overlay:config_updated', {
        streamId: targetMatchId,
        overlayConfig: normalized,
        showScoreboardOnYoutube: stream.showScoreboardOnYoutube !== false,
      });
    }
    if (scoreUpdated && liveScore) {
      emitStreamEvent(targetMatchId, 'score:updated', {
        streamId: targetMatchId,
        score: liveScore.toObject ? liveScore.toObject() : liveScore,
      });
    }
  }

  if (typeof options.scoreboardSourceName === 'string' && options.scoreboardSourceName.trim()) {
    targetProfile.scoreboardSourceName = sanitizeText(options.scoreboardSourceName, 120);
  } else if (
    sourceProfile?.scoreboardSourceName &&
    (!targetProfile.scoreboardSourceName ||
      targetProfile.scoreboardSourceName === 'MaidanLive_Scoreboard_Overlay')
  ) {
    targetProfile.scoreboardSourceName = sourceProfile.scoreboardSourceName;
  }

  // Locate active OBS Bridge or Direct WebSocket session
  let activeBridgeDoc: any = null;
  const existingAgent = await resolveAgentSocketForMatch(targetMatchId);
  if (existingAgent?.bridgeId) {
    activeBridgeDoc = await ObsBridge.findOne({ bridgeId: existingAgent.bridgeId, status: 'ACTIVE' });
  }

  if (!activeBridgeDoc && sourceMatchId) {
    const fromSource = await ObsBridge.find({
      status: 'ACTIVE',
      $or: [{ assignedMatchIds: sourceMatchId }, { activeMatchId: sourceMatchId }],
    })
      .sort({ lastHeartbeatAt: -1, lastConnectedAt: -1 })
      .exec();
    for (const candidate of fromSource) {
      if (bridgeSockets.get(candidate.bridgeId)?.connected) {
        activeBridgeDoc = candidate;
        break;
      }
    }
    if (!activeBridgeDoc && fromSource.length > 0) {
      activeBridgeDoc = fromSource[0];
    }
  }

  if (!activeBridgeDoc) {
    const allBridges = await ObsBridge.find({ status: 'ACTIVE' })
      .sort({ lastHeartbeatAt: -1, lastConnectedAt: -1 })
      .exec();
    for (const candidate of allBridges) {
      const sock = bridgeSockets.get(candidate.bridgeId);
      if (sock?.connected && (await canManageBridge(actor, candidate as any))) {
        activeBridgeDoc = candidate;
        break;
      }
    }
  }

  let bridgeUpdated = false;
  if (activeBridgeDoc) {
    const targetObjId = new mongoose.Types.ObjectId(targetMatchId);
    const assigned = Array.isArray(activeBridgeDoc.assignedMatchIds)
      ? activeBridgeDoc.assignedMatchIds.map((id: any) => String(id))
      : [];
    if (!assigned.includes(targetMatchId)) {
      activeBridgeDoc.assignedMatchIds = [...(activeBridgeDoc.assignedMatchIds || []), targetObjId];
    }
    activeBridgeDoc.activeMatchId = targetObjId;
    await activeBridgeDoc.save();
    bridgeUpdated = true;

    // Immediately register targetMatchId inside the live Bridge socket context so RPC calls work instantaneously
    const bridgeSock = bridgeSockets.get(activeBridgeDoc.bridgeId);
    if (bridgeSock) {
      const prevCtx = ((bridgeSock.data as any)?.obsContext || {}) as ObsAgentContext;
      const nextMatchIds = Array.from(new Set([...(prevCtx.matchIds || []), ...assigned, targetMatchId]));
      (bridgeSock.data as any).obsContext = {
        ...prevCtx,
        bridgeId: activeBridgeDoc.bridgeId,
        matchId: targetMatchId,
        matchIds: nextMatchIds,
      };
    }

    targetProfile.connectionMode = 'local_agent';
    targetProfile.agentLabel = activeBridgeDoc.label || activeBridgeDoc.name || targetProfile.agentLabel;
    targetProfile.bridgeVersion = activeBridgeDoc.bridgeVersion || targetProfile.bridgeVersion;
    targetProfile.bridgeCapabilities = normalizeBridgeCapabilities(
      activeBridgeDoc.bridgeCapabilities || targetProfile.bridgeCapabilities
    );
    if (bridgeSock?.connected) {
      targetProfile.agentOnline = true;
      targetProfile.bridgeConnectionState = 'CONNECTED';
      targetProfile.agentLastSeenAt = new Date();
      targetProfile.connectionStatus = (activeBridgeDoc.obsStatus || targetProfile.connectionStatus) as any;
      targetProfile.obsVersion = activeBridgeDoc.obsVersion || targetProfile.obsVersion;
      targetProfile.obsWebSocketVersion =
        activeBridgeDoc.obsWebSocketVersion || targetProfile.obsWebSocketVersion;
      if (Array.isArray(activeBridgeDoc.obsScenes) && activeBridgeDoc.obsScenes.length > 0) {
        targetProfile.obsScenes = activeBridgeDoc.obsScenes;
      }
      targetProfile.obsStreamActive = Boolean(activeBridgeDoc.obsStreamActive);
      targetProfile.desiredConnected = true;
      targetProfile.manualDisconnect = false;
    }
  } else if (
    sourceMatchId &&
    !directSessions.get(targetMatchId)?.connected &&
    directSessions.get(sourceMatchId)?.connected
  ) {
    const srcSession = directSessions.get(sourceMatchId)!;
    directSessions.set(targetMatchId, {
      ...srcSession,
      matchId: targetMatchId,
    });
    targetProfile.connectionMode = 'direct_ws';
    if (sourceProfile) {
      targetProfile.obsProtocol = sourceProfile.obsProtocol;
      targetProfile.obsHost = sourceProfile.obsHost;
      targetProfile.obsPort = sourceProfile.obsPort;
      targetProfile.obsPasswordEnc = sourceProfile.obsPasswordEnc || '';
      targetProfile.hasPassword = Boolean(sourceProfile.hasPassword);
      targetProfile.obsScenes = sourceProfile.obsScenes || [];
      targetProfile.obsInputs = sourceProfile.obsInputs || [];
      targetProfile.obsVersion = sourceProfile.obsVersion || '';
      targetProfile.obsWebSocketVersion = sourceProfile.obsWebSocketVersion || '';
      targetProfile.obsStreamActive = Boolean(sourceProfile.obsStreamActive);
    }
    targetProfile.connectionStatus = 'CONNECTED';
    targetProfile.desiredConnected = true;
    targetProfile.manualDisconnect = false;
  }

  targetProfile.updatedBy = actor._id as mongoose.Types.ObjectId;
  await targetProfile.save();

  // Execute live OBS Studio updates when OBS is connected
  const isObsOnline =
    targetProfile.connectionMode === 'local_agent'
      ? Boolean((await isMatchBridgeOnline(targetMatchId)) && targetProfile.connectionStatus === 'CONNECTED')
      : Boolean(directSessions.get(targetMatchId)?.connected);

  const baseAppUrl = (options.baseAppUrl || '').replace(/\/+$/, '');
  const allowYoutubeScoreboard = stream.showScoreboardOnYoutube !== false;
  const syncScoreboard = options.syncScoreboardSource !== false && Boolean(baseAppUrl);
  const scoreboardOverlayUrl = baseAppUrl
    ? `${baseAppUrl}/broadcast/overlay/view/${targetMatchId}?obs=1&controls=0${allowYoutubeScoreboard ? '' : '&sb=0'}`
    : '';

  let obsSynced = false;
  let obsNote = '';
  let switchedScene = '';
  const updatedSources: string[] = [];

  if (isObsOnline) {
    try {
      // Discover latest OBS inputs when using Bridge/Direct so we update the exact scoreboard source name
      let discoveredInputs = Array.isArray(targetProfile.obsInputs) ? targetProfile.obsInputs : [];
      if (discoveredInputs.length === 0 && sourceProfile?.obsInputs?.length) {
        discoveredInputs = sourceProfile.obsInputs;
      }
      if (discoveredInputs.length === 0) {
        const inputListRes = await callObsRpc<{ inputs?: any[] }>(targetMatchId, 'get_input_list', {}).catch(
          () => null
        );
        if (Array.isArray(inputListRes?.inputs)) {
          discoveredInputs = inputListRes.inputs;
        }
      }

      const browserInputs = discoveredInputs
        .filter((inp) => String(inp.inputKind || '').includes('browser'))
        .map((inp) => String(inp.inputName || '').trim())
        .filter(Boolean);

      const candidateSet = new Set<string>();
      const addIfValid = (val?: string) => {
        const clean = String(val || '').trim();
        if (clean) candidateSet.add(clean);
      };
      addIfValid(options.scoreboardSourceName);
      addIfValid(targetProfile.scoreboardSourceName);
      addIfValid(sourceProfile?.scoreboardSourceName);
      for (const name of browserInputs) {
        if (/scoreboard|maidanlive/i.test(name) && !/^ML_CAM_/i.test(name)) {
          addIfValid(name);
        }
      }

      // Choose existing OBS scoreboard input first so we never create duplicates unnecessarily
      const existingMatchingInput = Array.from(candidateSet).find((cand) =>
        browserInputs.some((b) => b.toLowerCase() === cand.toLowerCase())
      );
      const primarySbSource =
        (options.scoreboardSourceName && options.scoreboardSourceName.trim()) ||
        existingMatchingInput ||
        targetProfile.scoreboardSourceName ||
        'MaidanLive Scoreboard';

      const availableScenes = Array.isArray(targetProfile.obsScenes) ? targetProfile.obsScenes : [];
      const explicitTargetScene =
        options.targetSceneName && options.targetSceneName !== '__KEEP_CURRENT__'
          ? options.targetSceneName.trim()
          : '';
      const resolvedScene =
        explicitTargetScene ||
        (options.keepCurrentObsScene === false &&
        targetProfile.activeObsScene &&
        availableScenes.includes(targetProfile.activeObsScene)
          ? targetProfile.activeObsScene
          : activeBridgeDoc?.activeObsScene ||
            sourceProfile?.activeObsScene ||
            targetProfile.activeObsScene ||
            availableScenes[0] ||
            '');

      if (
        options.syncCameraLayout &&
        targetProfile.activeLayoutType &&
        targetProfile.activeLayoutType !== 'SINGLE' &&
        Array.isArray(targetProfile.activeCameraIds) &&
        targetProfile.activeCameraIds.length > 0
      ) {
        await applyDynamicLayoutToObs(
          targetMatchId,
          {
            layoutType: targetProfile.activeLayoutType,
            cameraIds: targetProfile.activeCameraIds,
            mainCameraId: targetProfile.activeCameraId || targetProfile.activeCameraIds[0],
            pipPosition: targetProfile.activePipPosition,
            pipSize: targetProfile.activePipSize,
            sceneName: resolvedScene || undefined,
            includeScoreboardOverlay: allowYoutubeScoreboard,
            override: options.override,
            baseAppUrl,
          },
          actor
        );
        switchedScene = resolvedScene;
        updatedSources.push(primarySbSource);
        obsSynced = true;
      } else if (resolvedScene) {
        const rpcRes = await callObsRpc(targetMatchId, 'switch_scene', {
          sceneName: resolvedScene,
          scoreboardOverlay: syncScoreboard
            ? {
                enabled: true,
                sourceName: primarySbSource,
                url: scoreboardOverlayUrl,
                refreshBrowserCache: true,
              }
            : undefined,
        });
        switchedScene = String(rpcRes?.verifiedScene || resolvedScene);
        targetProfile.activeObsScene = switchedScene;
        if (Array.isArray(rpcRes?.obsScenes)) {
          targetProfile.obsScenes = rpcRes.obsScenes;
        }
        updatedSources.push(primarySbSource);
        obsSynced = true;
      }

      // Also update & no-cache refresh any additional existing scoreboard browser sources in OBS
      if (syncScoreboard && scoreboardOverlayUrl) {
        const extraTargets = Array.from(candidateSet).filter(
          (name) =>
            name !== primarySbSource &&
            browserInputs.some((b) => b.toLowerCase() === name.toLowerCase())
        );
        if (!resolvedScene && !extraTargets.includes(primarySbSource)) {
          extraTargets.unshift(primarySbSource);
        }
        for (const sourceName of extraTargets) {
          await callObsRpc(targetMatchId, 'reconnect_input', {
            sceneName: resolvedScene || '',
            inputName: sourceName,
            inputKind: 'browser_source',
            inputSettings: {
              url: scoreboardOverlayUrl,
              width: 1920,
              height: 1080,
              reroute_audio: false,
            },
          })
            .then(() => {
              if (!updatedSources.includes(sourceName)) updatedSources.push(sourceName);
              obsSynced = true;
            })
            .catch(() => {});
        }
      }

      targetProfile.scoreboardSourceName = primarySbSource;
      targetProfile.lastSyncedAt = new Date();
      await targetProfile.save();

      if (activeBridgeDoc && switchedScene) {
        activeBridgeDoc.activeObsScene = switchedScene;
        await activeBridgeDoc.save();
      }
      await reconcileCameraActiveStates(targetMatchId, targetProfile.activeObsScene || '');
    } catch (err: any) {
      obsNote = err?.message || 'Match switched, but OBS Studio rejected part of the sync.';
    }
  } else {
    obsNote =
      'OBS Bridge active match switched. Connect OBS Studio / Windows Bridge to update the live OBS scene and browser source.';
  }

  await writeBroadcastAudit({
    matchId: targetMatchId,
    tournamentId: stream.tournamentId ? String(stream.tournamentId) : null,
    actionType: 'MATCH_BROADCAST_SWITCH',
    previousScene: sourceProfile?.activeObsScene || '',
    newScene: switchedScene || targetProfile.activeObsScene || '',
    actor,
    adminOverride: Boolean(options.override),
    obsStatus: obsSynced ? 'SUCCESS' : isObsOnline ? 'FAILED' : 'SUCCESS',
    errorDetails: obsNote,
    metadata: {
      sourceMatchId: sourceMatchId || null,
      bridgeId: activeBridgeDoc?.bridgeId || null,
      scoreboardOverlayUrl,
      updatedSources,
      matchDetailsUpdated,
    },
  });

  await recordActivity(
    actor,
    'OBS_MATCH_BROADCAST_SWITCH',
    'LiveStream',
    targetMatchId,
    `Switched OBS broadcast to ${stream.matchTitle || `${stream.teamAName} vs ${stream.teamBName}`}`,
    {
      previousValue: { matchId: sourceMatchId || null },
      newValue: {
        matchId: targetMatchId,
        bridgeId: activeBridgeDoc?.bridgeId || null,
        switchedScene: switchedScene || targetProfile.activeObsScene || '',
      },
    }
  );

  // Notify any "?followActive=1" / "/broadcast/overlay/view/active" browser sources & studios
  const io = getSocketIO();
  if (io) {
    io.emit('obs:active_match_changed', {
      matchId: targetMatchId,
      previousMatchId: sourceMatchId || null,
      bridgeId: activeBridgeDoc?.bridgeId || null,
      switchedScene: switchedScene || targetProfile.activeObsScene || '',
      obsSynced,
      switchedAt: new Date().toISOString(),
    });
  }

  emitBroadcastStudioEvent(targetMatchId, 'obs:match_switched', {
    matchId: targetMatchId,
    previousMatchId: sourceMatchId || null,
    bridgeId: activeBridgeDoc?.bridgeId || null,
    switchedScene: switchedScene || targetProfile.activeObsScene || '',
    obsSynced,
  });
  await emitFullStudioState(targetMatchId);
  if (sourceMatchId) {
    await emitFullStudioState(sourceMatchId);
  }

  return {
    ok: true,
    matchId: targetMatchId,
    sourceMatchId: sourceMatchId || null,
    obsSynced,
    obsConnected: isObsOnline,
    obsNote,
    bridgeUpdated,
    bridge: activeBridgeDoc ? formatSafeBridge(activeBridgeDoc.toObject()) : null,
    switchedScene: switchedScene || targetProfile.activeObsScene || '',
    scoreboardOverlayUrl,
    updatedSources,
    matchDetailsUpdated,
  };
}
