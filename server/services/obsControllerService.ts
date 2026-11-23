import crypto from 'crypto';
import OBSWebSocket from 'obs-websocket-js';
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
import { User } from '../models/User.ts';
import type { IUser } from '../models/User.ts';
import { hasBroadcastAccess } from '../middleware/auth.ts';
import {
  buildVdoNinjaLinks,
  decryptObsSecret,
  encryptObsSecret,
  generateScopedToken,
  hashScopedToken,
  verifyScopedToken,
} from '../utils/obsCrypto.ts';
import { computeObsLayoutBoxes, LAYOUT_METADATA } from '../../src/utils/obsLayoutGeometry.ts';
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
import { emitBroadcastStudioEvent, registerObsAgentHandlers } from '../socket/index.ts';
import type { ObsAgentContext } from '../socket/index.ts';
import { recordActivity } from '../utils/audit.ts';
import { verifyMediaMTXStreamHealth } from './mediamtxService.ts';

interface DirectObsSession {
  matchId: string;
  obs: OBSWebSocket;
  connected: boolean;
  connecting: boolean;
  manualDisconnect: boolean;
  reconnectTimer: NodeJS.Timeout | null;
  reconnectAttempts: number;
}

const directSessions = new Map<string, DirectObsSession>();
const agentSockets = new Map<string, IoSocket>();
const bridgeSockets = new Map<string, IoSocket>();
const activeSceneSwitchLocks = new Map<string, { inFlight: boolean; lastSwitchAt: number }>();
const HEARTBEAT_STALE_MS = 45_000;
const SCENE_SWITCH_COOLDOWN_MS = 350;

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

  return null;
}

async function isMatchBridgeOnline(matchId: string): Promise<boolean> {
  const resolved = await resolveAgentSocketForMatch(matchId);
  return Boolean(resolved);
}

function isMatchBridgeOnlineSync(matchId: string): boolean {
  const directMatchAgent = agentSockets.get(matchId);
  if (directMatchAgent && directMatchAgent.connected) return true;
  for (const sock of bridgeSockets.values()) {
    if (!sock.connected) continue;
    const ctx = (sock.data as any)?.obsContext as ObsAgentContext | undefined;
    if (ctx?.matchIds?.includes(matchId) || ctx?.matchId === matchId) {
      return true;
    }
  }
  return false;
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
  } else if (prevStatus === 'CONNECTED' && nextStatus !== 'CONNECTED') {
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
          },
        };
      }

      return { ok: false, reason: 'Provide bridgeId + bridgeToken or matchId + agentToken.' };
    },
    onAgentConnected: async (socket: IoSocket, context: ObsAgentContext) => {
      if (context.bridgeId) {
        bridgeSockets.set(context.bridgeId, socket);
        await ObsBridge.findOneAndUpdate(
          { bridgeId: context.bridgeId },
          {
            $set: {
              connectionStatus: 'ONLINE',
              lastConnectedAt: new Date(),
              lastHeartbeatAt: new Date(),
              lastError: '',
              platform: context.platform || 'win32',
              ...(context.label ? { label: context.label } : {}),
            },
          }
        );
      } else if (context.matchId) {
        agentSockets.set(context.matchId, socket);
      }

      const matchIds = await resolveMatchIdsForContext(context);
      (socket.data as any).obsContext = { ...context, matchIds };

      for (const mid of matchIds) {
        await ObsControllerProfile.findOneAndUpdate(
          { matchId: mid },
          {
            $set: {
              connectionMode: 'local_agent',
              agentOnline: true,
              agentLastSeenAt: new Date(),
              agentLabel: context.label || 'Local OBS Bridge',
              lastError: '',
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
        });
        await emitFullStudioState(mid);
      }
    },
    onAgentDisconnected: async (socket: IoSocket, context: ObsAgentContext, reason: string) => {
      if (context.bridgeId) {
        const current = bridgeSockets.get(context.bridgeId);
        if (current && current.id !== socket.id) return;
        bridgeSockets.delete(context.bridgeId);
        await ObsBridge.findOneAndUpdate(
          { bridgeId: context.bridgeId },
          {
            $set: {
              connectionStatus: 'OFFLINE',
              obsStatus: 'DISCONNECTED',
              obsStreamActive: false,
              lastDisconnectedAt: new Date(),
              lastError: `Bridge disconnected (${reason}).`,
            },
          }
        );
      } else if (context.matchId) {
        const current = agentSockets.get(context.matchId);
        if (current && current.id !== socket.id) return;
        agentSockets.delete(context.matchId);
      }

      const matchIds =
        Array.isArray(context.matchIds) && context.matchIds.length > 0
          ? context.matchIds
          : context.matchId
            ? [context.matchId]
            : [];

      for (const mid of matchIds) {
        const stillHasOnlineBridge = await isMatchBridgeOnline(mid);
        if (stillHasOnlineBridge) continue;

        const profile = await ObsControllerProfile.findOne({ matchId: mid });
        const wasObsConnected = profile?.connectionStatus === 'CONNECTED';
        if (profile && profile.connectionMode === 'local_agent') {
          profile.agentOnline = false;
          profile.connectionStatus = 'DISCONNECTED';
          profile.obsStreamActive = false;
          profile.lastError = `Local OBS Bridge disconnected (${reason}).`;
          await profile.save();
          await reconcileCameraActiveStates(mid, '');
        }
        await writeBroadcastAudit({
          matchId: mid,
          actionType: 'AGENT_DISCONNECTED',
          userName: profile?.agentLabel || context.label || 'Local OBS Bridge',
          userRole: 'AGENT',
          obsStatus: 'FAILED',
          errorDetails: `Bridge disconnected: ${reason}`,
        });
        emitBroadcastStudioEvent(mid, 'BRIDGE_DISCONNECTED', {
          matchId: mid,
          bridgeId: context.bridgeId || null,
          reason,
        });
        if (wasObsConnected) {
          emitBroadcastStudioEvent(mid, 'OBS_DISCONNECTED', {
            matchId: mid,
            reason: `Bridge disconnected (${reason})`,
          });
        }
        await emitFullStudioState(mid);
      }
    },
    onAgentStateUpdate: async (context: ObsAgentContext, payload: Record<string, any>) => {
      const status =
        payload.connectionStatus === 'CONNECTED'
          ? 'CONNECTED'
          : payload.connectionStatus === 'CONNECTING'
            ? 'CONNECTING'
            : payload.connectionStatus === 'ERROR'
              ? 'ERROR'
              : 'DISCONNECTED';

      const activeObsScene = typeof payload.activeObsScene === 'string' ? payload.activeObsScene : '';
      const obsScenes = Array.isArray(payload.obsScenes)
        ? payload.obsScenes.filter((s: unknown): s is string => typeof s === 'string')
        : undefined;

      if (context.bridgeId) {
        const br = await ObsBridge.findOne({ bridgeId: context.bridgeId }).lean();
        if (!br || br.status === 'REVOKED') {
          disconnectBridgeSocket(context.bridgeId, 'Bridge revoked');
          return;
        }
        const bridgeUpdate: Record<string, any> = {
          connectionStatus: 'ONLINE',
          obsStatus: status,
          lastHeartbeatAt: new Date(),
          lastError: typeof payload.lastError === 'string' ? payload.lastError.slice(0, 500) : '',
        };
        if (typeof payload.obsVersion === 'string') bridgeUpdate.obsVersion = payload.obsVersion;
        if (typeof payload.obsWebSocketVersion === 'string') {
          bridgeUpdate.obsWebSocketVersion = payload.obsWebSocketVersion;
        }
        if (activeObsScene) bridgeUpdate.activeObsScene = activeObsScene;
        if (obsScenes) bridgeUpdate.obsScenes = obsScenes;
        if (typeof payload.obsStreamActive === 'boolean') {
          bridgeUpdate.obsStreamActive = payload.obsStreamActive;
        }
        await ObsBridge.findOneAndUpdate({ bridgeId: context.bridgeId }, { $set: bridgeUpdate });
      }

      const matchIds = await resolveMatchIdsForContext(context);
      for (const mid of matchIds) {
        const prev = await ObsControllerProfile.findOne({ matchId: mid }).lean();
        const prevStatus = prev?.connectionStatus || 'DISCONNECTED';
        const prevScenes = Array.isArray(prev?.obsScenes) ? prev.obsScenes : [];
        const prevActiveScene = prev?.activeObsScene || '';

        const updateFields: Record<string, any> = {
          connectionMode: 'local_agent',
          agentOnline: true,
          agentLastSeenAt: new Date(),
          connectionStatus: status,
          lastError: typeof payload.lastError === 'string' ? payload.lastError : '',
          lastSyncedAt: new Date(),
        };
        if (context.label) updateFields.agentLabel = context.label;
        if (typeof payload.obsVersion === 'string') updateFields.obsVersion = payload.obsVersion;
        if (typeof payload.obsWebSocketVersion === 'string') {
          updateFields.obsWebSocketVersion = payload.obsWebSocketVersion;
        }
        if (activeObsScene || status !== 'CONNECTED') {
          updateFields.activeObsScene = status === 'CONNECTED' ? activeObsScene : '';
        }
        if (obsScenes) updateFields.obsScenes = obsScenes;
        if (Array.isArray(payload.obsInputs)) {
          updateFields.obsInputs = payload.obsInputs
            .filter((inp: any) => inp && typeof inp.inputName === 'string' && inp.inputName.trim())
            .slice(0, 100)
            .map((inp: any) => ({
              inputName: String(inp.inputName).trim().slice(0, 140),
              inputKind: String(inp.inputKind || '').trim().slice(0, 80),
              unversionedInputKind: String(inp.unversionedInputKind || '').trim().slice(0, 80),
            }));
        }
        if (typeof payload.obsStreamActive === 'boolean') {
          updateFields.obsStreamActive = payload.obsStreamActive;
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

        await ObsControllerProfile.findOneAndUpdate({ matchId: mid }, { $set: updateFields }, { new: true });

        if (activeObsScene && status === 'CONNECTED') {
          await reconcileCameraActiveStates(mid, activeObsScene);
        } else if (status !== 'CONNECTED') {
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
              obsStatus: 'ERROR',
              lastError: errorMessage.slice(0, 500),
              lastHeartbeatAt: new Date(),
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
              connectionStatus: 'ERROR',
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
        emitBroadcastStudioEvent(mid, 'OBS_DISCONNECTED', { matchId: mid, error: errorMessage });
        await emitFullStudioState(mid);
      }
    },
  });
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
  let effectiveStatus = profile.connectionStatus || 'DISCONNECTED';
  if (profile.connectionMode === 'local_agent' && !realAgentOnline) {
    effectiveStatus = 'DISCONNECTED';
  } else if (profile.connectionMode === 'direct_ws') {
    if (direct?.connected) effectiveStatus = 'CONNECTED';
    else if (direct?.connecting) effectiveStatus = 'CONNECTING';
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
    connectionStatus: effectiveStatus,
    lastError: profile.lastError || '',
    obsVersion: profile.obsVersion || '',
    obsWebSocketVersion: profile.obsWebSocketVersion || '',
    activeObsScene: profile.activeObsScene || '',
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
    });
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
    connectionUrl: options.includePrivateUrls ? camera.connectionUrl || '' : '',
    vdoRoomName: camera.vdoRoomName || '',
    vdoStreamId: camera.vdoStreamId || '',
    vdoPushUrl: vdoLinks?.pushUrl || '',
    obsBrowserSourceUrl:
      vdoLinks?.obsViewUrl || (options.includePrivateUrls ? camera.connectionUrl || '' : ''),
    pushTokenPrefix: camera.pushTokenPrefix || '',
    pushTokenExpiresAt: camera.pushTokenExpiresAt || null,
    broadcastSessionId: camera.broadcastSessionId || '',
    audioMuted: Boolean(camera.audioMuted ?? camera.telemetry?.audioMuted),
    obsInputMuted: typeof camera.obsInputMuted === 'boolean' ? camera.obsInputMuted : null,
    resolution: camera.resolution || '1280x720',
    fps: Number(camera.fps) || 30,
    bitrateKbps: Number(camera.bitrateKbps) || 2000,
    lowBandwidthMode: Boolean(camera.lowBandwidthMode),
    facingMode: camera.facingMode || 'environment',
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
    overlayPosition: scene.overlayPosition || 'bottom-left',
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
  const [cameras, scenes, auditLogs] = await Promise.all([
    BroadcastCamera.find({ matchId }).sort({ sortOrder: 1, cameraNumber: 1 }).lean(),
    BroadcastScene.find({ matchId }).sort({ sortOrder: 1, createdAt: 1 }).lean(),
    BroadcastAuditLog.find({ matchId }).sort({ timestamp: -1 }).limit(60).lean(),
  ]);

  const roomPassword = includePrivateUrls ? await getRoomPasswordForProfile(profile) : '';

  return {
    profile: formatSafeProfile(profile),
    cameras: cameras.map((cam) =>
      formatSafeCamera(cam, profile, { includePrivateUrls, roomPassword })
    ),
    scenes: scenes.map(formatSafeScene),
    auditLogs: auditLogs.map(formatAuditLog),
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

async function scheduleDirectReconnect(matchId: string) {
  const session = directSessions.get(matchId);
  if (!session || session.manualDisconnect) return;
  if (session.reconnectAttempts >= 5) return;

  const profile = await ObsControllerProfile.findOne({ matchId }).lean();
  if (!profile || profile.connectionMode !== 'direct_ws') return;

  clearReconnectTimer(session);
  const delayMs = Math.min(30_000, 2000 * Math.pow(2, session.reconnectAttempts));
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
  };
  directSessions.set(matchId, session);

  profile.connectionMode = 'direct_ws';
  profile.connectionStatus = 'CONNECTING';
  profile.lastError = '';
  await profile.save();
  await emitFullStudioState(matchId);

  const wsUrl = `${profile.obsProtocol === 'wss' ? 'wss' : 'ws'}://${profile.obsHost}:${profile.obsPort}`;
  const password = profile.obsPasswordEnc ? decryptObsSecret(profile.obsPasswordEnc) : undefined;

  obs.on('ConnectionClosed', async (err: any) => {
    const cur = directSessions.get(matchId);
    if (!cur || cur.obs !== obs) return;
    cur.connected = false;
    cur.connecting = false;

    const reasonMsg =
      err?.message || (cur.manualDisconnect ? 'Disconnected by operator' : 'OBS WebSocket closed');
    await ObsControllerProfile.findOneAndUpdate(
      { matchId },
      {
        $set: {
          connectionStatus: cur.manualDisconnect ? 'DISCONNECTED' : 'ERROR',
          lastError: cur.manualDisconnect ? '' : reasonMsg,
          obsStreamActive: false,
        },
      }
    );
    await reconcileCameraActiveStates(matchId, '');
    await writeBroadcastAudit({
      matchId,
      actionType: 'OBS_DISCONNECT',
      userName: cur.manualDisconnect ? actor?.name || 'Operator' : 'OBS WebSocket',
      obsStatus: cur.manualDisconnect ? 'SUCCESS' : 'FAILED',
      errorDetails: cur.manualDisconnect ? '' : reasonMsg,
    });
    emitBroadcastStudioEvent(matchId, 'OBS_DISCONNECTED', {
      matchId,
      reason: reasonMsg,
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
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out connecting to OBS at ${wsUrl}`)), 6000)
    );
    await Promise.race([connectPromise, timeoutPromise]);

    session.connected = true;
    session.connecting = false;
    session.reconnectAttempts = 0;

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
    session.connected = false;
    session.connecting = false;
    directSessions.delete(matchId);

    const errMsg = err?.message || `Failed to connect to OBS WebSocket at ${wsUrl}`;
    profile.connectionStatus = 'ERROR';
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
    return { ok: false, profile: formatSafeProfile(profile), error: errMsg };
  }
}

async function pullDirectObsSnapshot(matchId: string, obs: OBSWebSocket) {
  const [versionRes, sceneListRes, inputListRes, streamStatusRes, recordStatusRes, statsRes] =
    await Promise.all([
      obs.call('GetVersion'),
      obs.call('GetSceneList'),
      obs.call('GetInputList').catch(() => ({ inputs: [] })),
      obs
        .call('GetStreamStatus')
        .catch(() => ({ outputActive: false, outputTimecode: '', outputBytes: null, outputDuration: null })),
      obs.call('GetRecordStatus').catch(() => ({ outputActive: false, outputTimecode: '' })),
      obs.call('GetStats').catch(() => null),
    ]);

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
  const activeObsScene = String(sceneListRes?.currentProgramSceneName || '');

  const updated = await ObsControllerProfile.findOneAndUpdate(
    { matchId },
    {
      $set: {
        connectionStatus: 'CONNECTED',
        lastError: '',
        obsVersion: String(versionRes?.obsVersion || ''),
        obsWebSocketVersion: String(versionRes?.obsWebSocketVersion || ''),
        obsScenes,
        obsInputs,
        activeObsScene,
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
  const session = directSessions.get(matchId);
  if (session) {
    clearReconnectTimer(session);
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
        lastError: '',
      },
    },
    { new: true }
  );

  await reconcileCameraActiveStates(matchId, '');
  await writeBroadcastAudit({
    matchId,
    actionType: 'OBS_DISCONNECT',
    actor: actor || null,
    obsStatus: 'SUCCESS',
  });
  emitBroadcastStudioEvent(matchId, 'OBS_DISCONNECTED', {
    matchId,
    reason: 'Disconnected by operator',
  });
  await emitFullStudioState(matchId);
  return formatSafeProfile(profile);
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
    if (sceneName && inputName) {
      await ensureSceneAndInputDirect(
        obs,
        sceneName,
        inputName,
        payload.inputKind || 'browser_source',
        payload.inputSettings || {}
      ).catch(() => {});
    }
    if (inputName) {
      await obs
        .call('PressInputPropertiesButton', {
          inputName,
          propertyName: 'refreshnocache',
        })
        .catch(() => {});
    }
    const snapshot = await pullDirectObsSnapshot(matchId, obs);
    return {
      reconnected: true,
      inputName,
      obsScenes: snapshot.obsScenes,
    };
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
  options: { override?: boolean; baseAppUrl?: string } = {}
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

  let ensureInput: Record<string, any> | undefined;
  if (camera.sourceType === 'vdoninja' && camera.vdoStreamId) {
    const links = buildVdoNinjaLinks({
      roomName: camera.vdoRoomName || profile.vdoRoomName,
      streamId: camera.vdoStreamId,
      password: roomPassword,
      label: camera.label || camera.name,
      resolution: camera.resolution,
      fps: camera.fps,
      bitrateKbps: camera.bitrateKbps,
      lowBandwidthMode: camera.lowBandwidthMode,
      facingMode: camera.facingMode,
    });
    ensureInput = {
      inputName: camera.obsInputName || `ML_CAM_${camera.cameraNumber}`,
      inputKind: 'browser_source',
      inputSettings: {
        url: links.obsViewUrl,
        width: 1920,
        height: 1080,
      },
    };
  } else if (camera.sourceType === 'browser_source' && camera.connectionUrl) {
    ensureInput = {
      inputName: camera.obsInputName || `ML_CAM_${camera.cameraNumber}`,
      inputKind: 'browser_source',
      inputSettings: {
        url: camera.connectionUrl,
        width: 1920,
        height: 1080,
      },
    };
  }

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

  const allCameras = await BroadcastCamera.find({ matchId }).sort({ sortOrder: 1, cameraNumber: 1 });
  const cameraMap = new Map(allCameras.map((c) => [c.cameraId, c]));
  const selectedIds = params.cameraIds.filter((id) => {
    const cam = cameraMap.get(id);
    return cam && cam.enabled;
  });

  if (selectedIds.length === 0) {
    const err: any = new Error('Select at least one enabled camera for this layout.');
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
    let inputKind = 'browser_source';
    let inputSettings: Record<string, any> = {};

    if (cam.sourceType === 'vdoninja' && cam.vdoStreamId) {
      const links = buildVdoNinjaLinks({
        roomName: cam.vdoRoomName || profile.vdoRoomName,
        streamId: cam.vdoStreamId,
        password: roomPassword,
        label: cam.label || cam.name,
        resolution: cam.resolution,
        fps: cam.fps,
        bitrateKbps: cam.bitrateKbps,
        lowBandwidthMode: cam.lowBandwidthMode,
        facingMode: cam.facingMode,
      });
      inputSettings = { url: links.obsViewUrl, width: 1920, height: 1080 };
    } else if (cam.sourceType === 'browser_source' && cam.connectionUrl) {
      inputSettings = { url: cam.connectionUrl, width: 1920, height: 1080 };
    } else {
      inputKind = '';
    }

    return {
      ...box,
      rotation: parseOrientationDegrees(cam.orientationMode),
      previewFit: normalizePreviewFit(cam.previewFit),
      inputName,
      inputKind,
      inputSettings,
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
      scoreboardOverlay: {
        enabled: includeScoreboard,
        sourceName: profile.scoreboardSourceName || 'MaidanLive_Scoreboard_Overlay',
        url: baseAppUrl ? `${baseAppUrl}/broadcast/overlay/view/${matchId}?obs=1&controls=0` : '',
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
  options: { override?: boolean } = {}
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
    const rpcRes = await callObsRpc(matchId, 'switch_scene', { sceneName });
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

  const cam = await BroadcastCamera.findOne({ matchId, cameraId });
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
    let ensureInput: Record<string, any> | undefined;
    if (cam.sourceType === 'vdoninja' && cam.vdoStreamId) {
      const links = buildVdoNinjaLinks({
        roomName: cam.vdoRoomName || profile.vdoRoomName,
        streamId: cam.vdoStreamId,
        password: roomPassword,
        label: cam.label || cam.name,
        resolution: cam.resolution,
        fps: cam.fps,
        bitrateKbps: cam.bitrateKbps,
        lowBandwidthMode: cam.lowBandwidthMode,
        facingMode: cam.facingMode,
      });
      ensureInput = {
        inputName: targetInputName,
        inputKind: 'browser_source',
        inputSettings: { url: links.obsViewUrl, width: 1920, height: 1080 },
      };
    } else if (cam.sourceType === 'browser_source' && cam.connectionUrl) {
      ensureInput = {
        inputName: targetInputName,
        inputKind: 'browser_source',
        inputSettings: { url: cam.connectionUrl, width: 1920, height: 1080 },
      };
    }

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

export async function reconnectCameraSource(
  matchId: string,
  cameraId: string,
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

  const targetSceneName = cam.obsSceneName?.trim() || `CAM ${cam.cameraNumber} FULL`;
  const targetInputName = cam.obsInputName?.trim() || `ML_CAM_${cam.cameraNumber}`;
  const roomPassword = await getRoomPasswordForProfile(profile);

  let inputKind = 'browser_source';
  let inputSettings: Record<string, any> = {};
  if (cam.sourceType === 'vdoninja' && cam.vdoStreamId) {
    const links = buildVdoNinjaLinks({
      roomName: cam.vdoRoomName || profile.vdoRoomName,
      streamId: cam.vdoStreamId,
      password: roomPassword,
      label: cam.label || cam.name,
      resolution: cam.resolution,
      fps: cam.fps,
      bitrateKbps: cam.bitrateKbps,
      lowBandwidthMode: cam.lowBandwidthMode,
      facingMode: cam.facingMode,
    });
    inputSettings = { url: links.obsViewUrl, width: 1920, height: 1080 };
  } else if (cam.sourceType === 'browser_source' && cam.connectionUrl) {
    inputSettings = { url: cam.connectionUrl, width: 1920, height: 1080 };
  } else {
    inputKind = '';
  }

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
    } catch (err: any) {
      obsNote = err?.message || 'OBS input refresh returned an error.';
    }
  } else {
    obsNote = 'OBS Studio is disconnected.';
  }

  let signalOk = false;
  let signalDetail = '';
  if (cam.sourceType === 'mediamtx' && cam.connectionUrl) {
    const mtx = await verifyMediaMTXStreamHealth({
      streamPath: cam.connectionUrl,
      hlsPlaybackUrl: cam.connectionUrl,
      webrtcPlaybackUrl: '',
    });
    signalOk = mtx.ok;
    signalDetail = mtx.message;
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
    connectionStatus:
      bridge.status === 'REVOKED' ? 'OFFLINE' : socketOnline ? 'ONLINE' : 'OFFLINE',
    obsStatus: socketOnline ? bridge.obsStatus || 'DISCONNECTED' : 'DISCONNECTED',
    obsVersion: bridge.obsVersion || '',
    obsWebSocketVersion: bridge.obsWebSocketVersion || '',
    activeObsScene: socketOnline ? bridge.activeObsScene || '' : '',
    obsScenes: Array.isArray(bridge.obsScenes) ? bridge.obsScenes : [],
    obsStreamActive: Boolean(socketOnline && bridge.obsStreamActive),
    lastConnectedAt: bridge.lastConnectedAt || null,
    lastDisconnectedAt: bridge.lastDisconnectedAt || null,
    lastHeartbeatAt: bridge.lastHeartbeatAt || null,
    lastError: bridge.lastError || '',
    platform: bridge.platform || 'win32',
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
          connectionStatus: bridge.obsStatus || 'DISCONNECTED',
          obsVersion: bridge.obsVersion || '',
          obsWebSocketVersion: bridge.obsWebSocketVersion || '',
          obsScenes: Array.isArray(bridge.obsScenes) ? bridge.obsScenes : [],
          activeObsScene: bridge.activeObsScene || '',
          obsStreamActive: Boolean(bridge.obsStreamActive),
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

  let bridge: IObsBridge | null = null;
  let tokenPair = generateScopedToken('mlbrg');

  if (pairing.bridgeId) {
    bridge = await ObsBridge.findOne({ bridgeId: pairing.bridgeId });
  }

  if (bridge && bridge.status !== 'REVOKED') {
    bridge.tokenHash = tokenPair.hash;
    bridge.tokenPrefix = tokenPair.displayPrefix;
    bridge.label = cleanLabel || bridge.label;
    bridge.platform = cleanPlatform;
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

  const sock = bridgeSockets.get(bridge.bridgeId);
  if (sock) {
    try {
      sock.emit('server:disconnect_bridge', {
        bridgeId: bridge.bridgeId,
        reason: `Disconnected by ${actor.name} from Control Room`,
      });
      sock.disconnect(true);
    } catch {
      // Ignore disconnect error
    }
    bridgeSockets.delete(bridge.bridgeId);
  }

  bridge.connectionStatus = 'OFFLINE';
  bridge.obsStatus = 'DISCONNECTED';
  bridge.obsStreamActive = false;
  bridge.lastDisconnectedAt = new Date();
  bridge.lastError = `Disconnected by ${actor.name}`;
  await bridge.save();

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
            lastError: `Disconnected by ${actor.name}`,
          },
        }
      );
      emitBroadcastStudioEvent(mid, 'BRIDGE_DISCONNECTED', {
        matchId: mid,
        bridgeId: bridge.bridgeId,
        reason: 'OPERATOR_DISCONNECT',
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



