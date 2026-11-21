import OBSWebSocket from 'obs-websocket-js';
import type { Socket as IoSocket } from 'socket.io';
import mongoose from 'mongoose';
import { ObsControllerProfile } from '../models/ObsControllerProfile.ts';
import type { IObsControllerProfile, MultiCameraLayoutType } from '../models/ObsControllerProfile.ts';
import { BroadcastCamera } from '../models/BroadcastCamera.ts';
import type { CameraConnectionStatus, IBroadcastCamera } from '../models/BroadcastCamera.ts';
import { BroadcastScene } from '../models/BroadcastScene.ts';
import { BroadcastAuditLog } from '../models/BroadcastAuditLog.ts';
import type { BroadcastAuditAction } from '../models/BroadcastAuditLog.ts';
import { LiveStream } from '../models/LiveStream.ts';
import type { IUser } from '../models/User.ts';
import {
  buildVdoNinjaLinks,
  decryptObsSecret,
  encryptObsSecret,
  generateScopedToken,
  verifyScopedToken,
} from '../utils/obsCrypto.ts';
import { computeObsLayoutBoxes, LAYOUT_METADATA } from '../../src/utils/obsLayoutGeometry.ts';
import type { ObsLayoutType } from '../../src/utils/obsLayoutGeometry.ts';
import { emitBroadcastStudioEvent, registerObsAgentHandlers } from '../socket/index.ts';
import { recordActivity } from '../utils/audit.ts';

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
const HEARTBEAT_STALE_MS = 45_000;

export function initObsControllerBridge(): void {
  registerObsAgentHandlers({
    verifyAgentToken: async (matchId: string, token: string): Promise<boolean> => {
      if (!mongoose.Types.ObjectId.isValid(matchId)) return false;
      const profile = await ObsControllerProfile.findOne({ matchId }).select('+agentTokenHash').lean();
      if (!profile || !profile.agentTokenHash) return false;
      return verifyScopedToken(token, profile.agentTokenHash);
    },
    onAgentConnected: async (socket: IoSocket, matchId: string, label: string) => {
      agentSockets.set(matchId, socket);
      await ObsControllerProfile.findOneAndUpdate(
        { matchId },
        {
          $set: {
            connectionMode: 'local_agent',
            agentOnline: true,
            agentLastSeenAt: new Date(),
            agentLabel: label || 'Local OBS Agent',
            lastError: '',
          },
        },
        { new: true }
      );
      await writeBroadcastAudit({
        matchId,
        actionType: 'AGENT_CONNECTED',
        userName: label || 'Local OBS Agent',
        userRole: 'AGENT',
        obsStatus: 'SUCCESS',
      });
      await emitFullStudioState(matchId);
    },
    onAgentDisconnected: async (socket: IoSocket, matchId: string, reason: string) => {
      const current = agentSockets.get(matchId);
      if (current && current.id !== socket.id) return;
      agentSockets.delete(matchId);

      const profile = await ObsControllerProfile.findOne({ matchId });
      if (profile && profile.connectionMode === 'local_agent') {
        profile.agentOnline = false;
        profile.connectionStatus = 'DISCONNECTED';
        profile.lastError = `Local OBS Agent disconnected (${reason}).`;
        await profile.save();
        await reconcileCameraActiveStates(matchId, '');
      }
      await writeBroadcastAudit({
        matchId,
        actionType: 'AGENT_DISCONNECTED',
        userName: profile?.agentLabel || 'Local OBS Agent',
        userRole: 'AGENT',
        obsStatus: 'FAILED',
        errorDetails: `Agent disconnected: ${reason}`,
      });
      await emitFullStudioState(matchId);
    },
    onAgentStateUpdate: async (matchId: string, payload: Record<string, any>) => {
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

      const updateFields: Record<string, any> = {
        agentOnline: true,
        agentLastSeenAt: new Date(),
        connectionStatus: status,
        lastError: typeof payload.lastError === 'string' ? payload.lastError : '',
        lastSyncedAt: new Date(),
      };
      if (typeof payload.obsVersion === 'string') updateFields.obsVersion = payload.obsVersion;
      if (typeof payload.obsWebSocketVersion === 'string') {
        updateFields.obsWebSocketVersion = payload.obsWebSocketVersion;
      }
      if (activeObsScene) updateFields.activeObsScene = activeObsScene;
      if (obsScenes) updateFields.obsScenes = obsScenes;
      if (typeof payload.obsStreamActive === 'boolean') {
        updateFields.obsStreamActive = payload.obsStreamActive;
      }
      if (typeof payload.obsStreamTimecode === 'string') {
        updateFields.obsStreamTimecode = payload.obsStreamTimecode;
      }
      if (payload.obsStats && typeof payload.obsStats === 'object') {
        updateFields.obsStats = payload.obsStats;
      }

      await ObsControllerProfile.findOneAndUpdate({ matchId }, { $set: updateFields }, { new: true });

      if (activeObsScene && status === 'CONNECTED') {
        await reconcileCameraActiveStates(matchId, activeObsScene);
      } else if (status !== 'CONNECTED') {
        await reconcileCameraActiveStates(matchId, '');
      }
      await emitFullStudioState(matchId);
    },
    onAgentError: async (matchId: string, errorMessage: string) => {
      await ObsControllerProfile.findOneAndUpdate(
        { matchId },
        {
          $set: {
            connectionStatus: 'ERROR',
            lastError: errorMessage.slice(0, 500),
            agentLastSeenAt: new Date(),
          },
        }
      );
      await writeBroadcastAudit({
        matchId,
        actionType: 'OBS_ERROR',
        userName: 'Local OBS Agent',
        userRole: 'AGENT',
        obsStatus: 'FAILED',
        errorDetails: errorMessage,
      });
      emitBroadcastStudioEvent(matchId, 'obs:error', { matchId, message: errorMessage });
      await emitFullStudioState(matchId);
    },
  });
}

export async function writeBroadcastAudit(params: {
  matchId: string;
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
      matchId: params.matchId,
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
    emitBroadcastStudioEvent(params.matchId, 'obs:audit_event', {
      matchId: params.matchId,
      log: formatAuditLog(doc.toObject ? doc.toObject() : doc),
    });
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
  if (profile) return profile;

  const stream = await LiveStream.findById(matchId).lean();
  const roomSuffix = matchId.slice(-8);
  const vdoPwd = generateScopedToken('vdo').raw.slice(0, 14);

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
  obsConnected: boolean
): CameraConnectionStatus {
  const isSelectedLive =
    obsConnected &&
    ((activeCameraId && camera.cameraId === activeCameraId) ||
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
  const liveAgentSocket = agentSockets.get(matchId);
  const direct = directSessions.get(matchId);

  const realAgentOnline = Boolean(liveAgentSocket && liveAgentSocket.connected);
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
    activeLayoutType: profile.activeLayoutType || 'SINGLE',
    activeSceneId: profile.activeSceneId || '',
    obsScenes: Array.isArray(profile.obsScenes) ? profile.obsScenes : [],
    obsStreamActive: Boolean(profile.obsStreamActive),
    obsStreamTimecode: profile.obsStreamTimecode || '',
    obsStats: profile.obsStats || null,
    vdoRoomName: profile.vdoRoomName || '',
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
    obsConnected
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
    resolution: camera.resolution || '1280x720',
    fps: Number(camera.fps) || 30,
    bitrateKbps: Number(camera.bitrateKbps) || 2000,
    lowBandwidthMode: Boolean(camera.lowBandwidthMode),
    facingMode: camera.facingMode || 'environment',
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
      ? Boolean(agentSockets.get(matchId)?.connected && profile?.connectionStatus === 'CONNECTED')
      : Boolean(directSessions.get(matchId)?.connected);

  for (const cam of cameras) {
    const nextStatus = computeEffectiveCameraStatus(
      cam,
      profile?.activeCameraId || '',
      activeObsScene,
      obsConnected
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
  const [versionRes, sceneListRes, streamStatusRes, statsRes] = await Promise.all([
    obs.call('GetVersion'),
    obs.call('GetSceneList'),
    obs.call('GetStreamStatus').catch(() => ({ outputActive: false, outputTimecode: '' })),
    obs.call('GetStats').catch(() => null),
  ]);

  const obsScenes = Array.isArray(sceneListRes?.scenes)
    ? sceneListRes.scenes.map((s: any) => String(s.sceneName || '')).filter(Boolean)
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
        activeObsScene,
        obsStreamActive: Boolean((streamStatusRes as any)?.outputActive),
        obsStreamTimecode: String((streamStatusRes as any)?.outputTimecode || ''),
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
  return { profile: updated, activeObsScene, obsScenes };
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
    const agent = agentSockets.get(matchId);
    if (!agent || !agent.connected) {
      throw new Error(
        'Local OBS Controller Agent is offline. Start the MaidanLive OBS Agent on the OBS computer and try again.'
      );
    }

    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`OBS Local Agent timed out executing "${command}".`));
      }, 10_000);

      agent.emit('server:obs_command', { command, payload }, (ack: any) => {
        clearTimeout(timer);
        if (!ack || !ack.ok) {
          reject(new Error(ack?.error || `OBS command "${command}" failed.`));
          return;
        }
        resolve(ack.data as T);
      });
    });
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
      await ensureSceneAndInputDirect(
        obs,
        sceneName,
        payload.ensureInput.inputName,
        payload.ensureInput.inputKind || 'browser_source',
        payload.ensureInput.inputSettings || {}
      );
    }

    if (payload.scoreboardOverlay?.enabled && payload.scoreboardOverlay?.url) {
      const sbItemId = await ensureSceneAndInputDirect(
        obs,
        sceneName,
        payload.scoreboardOverlay.sourceName || 'MaidanLive_Scoreboard_Overlay',
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
        await obs.call('SetSceneItemTransform', {
          sceneName,
          sceneItemId: itemId,
          sceneItemTransform: {
            positionX: Number(box.x) || 0,
            positionY: Number(box.y) || 0,
            alignment: 5,
            boundsType: 'OBS_BOUNDS_SCALE_INNER',
            boundsAlignment: 0,
            boundsWidth: Math.max(64, Number(box.width) || 640),
            boundsHeight: Math.max(64, Number(box.height) || 360),
          },
        });
      }
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
    const res = await obs.call('GetSourceScreenshot', {
      sourceName,
      imageFormat: 'jpeg',
      imageWidth: 640,
      imageHeight: 360,
      imageCompressionQuality: 70,
    });
    return { imageData: res.imageData };
  }

  throw new Error(`Unsupported OBS command: ${command}`);
}

export async function refreshObsState(matchId: string) {
  const data = await callObsRpc(matchId, 'get_snapshot', {});
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

  try {
    const rpcRes = await callObsRpc(matchId, 'switch_scene', {
      sceneName: targetSceneName,
      ensureInput,
      scoreboardOverlay:
        profile.autoSyncScoreboardSource && baseAppUrl
          ? {
              enabled: true,
              sourceName: profile.scoreboardSourceName || 'MaidanLive_Scoreboard_Overlay',
              url: `${baseAppUrl}/broadcast/overlay/view/${matchId}?obs=1&controls=0`,
            }
          : undefined,
    });

    const verifiedScene = String(rpcRes?.verifiedScene || targetSceneName);
    profile.activeObsScene = verifiedScene;
    profile.activeCameraId = camera.cameraId;
    profile.activeLayoutType = 'SINGLE';
    profile.lastSyncedAt = new Date();
    profile.updatedBy = actor._id as mongoose.Types.ObjectId;
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
    await emitFullStudioState(matchId);

    return { verifiedScene, cameraId: camera.cameraId };
  } catch (err: any) {
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
      errorDetails: err?.message || 'OBS failed to switch camera.',
    });
    emitBroadcastStudioEvent(matchId, 'obs:error', {
      matchId,
      message: err?.message || 'OBS failed to switch camera.',
    });
    throw err;
  }
}

export async function applyDynamicLayoutToObs(
  matchId: string,
  params: {
    layoutType: ObsLayoutType;
    cameraIds: string[];
    mainCameraId?: string;
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
    1080
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
      inputName,
      inputKind,
      inputSettings,
    };
  });

  const allCameraInputs = allCameras.map((c) => c.obsInputName || `ML_CAM_${c.cameraNumber}`);
  const baseAppUrl = (params.baseAppUrl || '').replace(/\/+$/, '');
  const includeScoreboard = params.includeScoreboardOverlay !== false;
  const prevScene = profile.activeObsScene || '';
  const prevCameraId = profile.activeCameraId || '';

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
    profile.lastSyncedAt = new Date();
    profile.updatedBy = actor._id as mongoose.Types.ObjectId;
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
    await emitFullStudioState(matchId);

    return {
      verifiedScene,
      layoutType: params.layoutType,
      boxes,
    };
  } catch (err: any) {
    await writeBroadcastAudit({
      matchId,
      actionType: 'LAYOUT_SWITCH',
      previousScene: prevScene,
      newScene: targetSceneName,
      layoutSelected: params.layoutType,
      actor,
      adminOverride: Boolean(params.override),
      obsStatus: 'FAILED',
      errorDetails: err?.message || 'OBS failed applying multi-camera layout.',
    });
    emitBroadcastStudioEvent(matchId, 'obs:error', {
      matchId,
      message: err?.message || 'OBS failed applying multi-camera layout.',
    });
    throw err;
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
  try {
    const rpcRes = await callObsRpc(matchId, 'switch_scene', { sceneName });
    const verifiedScene = String(rpcRes?.verifiedScene || sceneName);

    const mappedScene = await BroadcastScene.findOne({ matchId, obsSceneName: verifiedScene }).lean();
    const mappedCam = await BroadcastCamera.findOne({ matchId, obsSceneName: verifiedScene }).lean();

    profile.activeObsScene = verifiedScene;
    profile.activeSceneId = mappedScene?._id ? String(mappedScene._id) : '';
    profile.activeLayoutType = (mappedScene?.layoutType || 'SINGLE') as MultiCameraLayoutType;
    profile.activeCameraId = mappedCam?.cameraId || '';
    profile.lastSyncedAt = new Date();
    profile.updatedBy = actor._id as mongoose.Types.ObjectId;
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
    await emitFullStudioState(matchId);

    return { verifiedScene };
  } catch (err: any) {
    await writeBroadcastAudit({
      matchId,
      actionType: 'SCENE_SWITCH',
      previousScene: prevScene,
      newScene: sceneName,
      actor,
      obsStatus: 'FAILED',
      errorDetails: err?.message || 'OBS scene switch failed.',
    });
    throw err;
  }
}

export async function captureObsPreviewImage(matchId: string, sourceName: string): Promise<string> {
  const res = await callObsRpc<{ imageData: string }>(matchId, 'screenshot', { sourceName });
  return String(res?.imageData || '');
}
