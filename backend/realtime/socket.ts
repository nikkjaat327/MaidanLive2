import crypto from 'crypto';
import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { canManageStream, getJwtSecret, hasBroadcastAccess, hasGranularPermission } from '../../server/middleware/auth.ts';
import type { JwtPayload } from '../../server/middleware/auth.ts';
import { ADMIN_PORTAL_ROLES, User } from '../../server/models/User.ts';
import { LiveStream } from '../../server/models/LiveStream.ts';
import { BroadcastCamera } from '../../server/models/BroadcastCamera.ts';
import { verifyScopedToken } from '../../server/utils/obsCrypto.ts';

let io: SocketIOServer | null = null;
const SERVER_BOOT_ID = crypto.randomUUID();
let eventSequence = Date.now() * 100;
let cleanupTimer: NodeJS.Timeout | null = null;

export interface ObsAgentContext {
  bridgeId?: string;
  matchId?: string;
  matchIds?: string[];
  label: string;
  platform?: string;
  bridgeVersion?: string;
  capabilities?: string[];
}

export interface ObsAgentRegistrationHandlers {
  verifyAgentHandshake: (auth: {
    bridgeId?: string;
    bridgeToken?: string;
    matchId?: string;
    agentToken?: string;
    label?: string;
    platform?: string;
    bridgeVersion?: string;
    capabilities?: string[];
    manualResume?: boolean;
  }) => Promise<{ ok: boolean; reason?: string; context?: ObsAgentContext }>;
  onAgentConnected: (socket: any, context: ObsAgentContext) => Promise<void>;
  onAgentDisconnected: (socket: any, context: ObsAgentContext, reason: string) => Promise<void>;
  onAgentStateUpdate: (context: ObsAgentContext, payload: Record<string, any>) => Promise<void>;
  onAgentHeartbeat?: (context: ObsAgentContext, payload: Record<string, any>) => Promise<void>;
  onAgentDiagnostic?: (context: ObsAgentContext, payload: Record<string, any>) => Promise<void>;
  onAgentError: (context: ObsAgentContext, errorMessage: string) => Promise<void>;
}

let obsAgentHandlers: ObsAgentRegistrationHandlers | null = null;

export function registerObsAgentHandlers(handlers: ObsAgentRegistrationHandlers): void {
  obsAgentHandlers = handlers;
}

interface TrackedViewerSession {
  sessionId: string;
  socketId: string;
  targetType: 'match' | 'stream';
  targetId: string;
  lastHeartbeatAt: number;
}

// Key: `${targetType}:${targetId}` -> Map<sessionId, TrackedViewerSession>
const activeViewerSessions = new Map<string, Map<string, TrackedViewerSession>>();
const visibilityCache = new Map<string, { value: 'public' | 'admin_only' | 'hidden'; cachedAt: number }>();

function nextMetadata() {
  eventSequence += 1;
  return {
    eventId: crypto.randomUUID(),
    emittedAt: new Date().toISOString(),
    sequence: eventSequence,
    serverBootId: SERVER_BOOT_ID,
  };
}

function attachMeta(payload: unknown): Record<string, unknown> {
  const meta = nextMetadata();
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return { ...(payload as Record<string, unknown>), ...meta };
  }
  return { data: payload, ...meta };
}

async function getViewerVisibility(streamId: string): Promise<'public' | 'admin_only' | 'hidden'> {
  const cached = visibilityCache.get(streamId);
  if (cached && Date.now() - cached.cachedAt < 10_000) {
    return cached.value;
  }
  try {
    const stream: any = await LiveStream.findById(streamId).select('viewerCountVisibility').lean();
    const vis = (stream?.viewerCountVisibility || 'public') as 'public' | 'admin_only' | 'hidden';
    visibilityCache.set(streamId, { value: vis, cachedAt: Date.now() });
    return vis;
  } catch {
    return 'public';
  }
}

export function invalidateViewerVisibilityCache(streamId: string) {
  visibilityCache.delete(streamId);
}

function getSessionBucketKey(targetType: 'match' | 'stream', targetId: string): string {
  return `${targetType}:${targetId}`;
}

function getDistinctViewerCount(targetType: 'match' | 'stream', targetId: string): number {
  const bucket = activeViewerSessions.get(getSessionBucketKey(targetType, targetId));
  if (!bucket) return 0;
  return bucket.size;
}

async function broadcastViewerCounts(targetType: 'match' | 'stream', targetId: string) {
  if (!io) return;
  const count = getDistinctViewerCount(targetType, targetId);
  const visibility = await getViewerVisibility(targetId);
  const meta = nextMetadata();

  // Admin-only rooms always receive real viewer counts
  io.to(`viewer-admin:${targetType}:${targetId}`).emit('viewer:count_updated', {
    targetType,
    targetId,
    streamId: targetId,
    viewers: count,
    visibility,
    ...meta,
  });
  io.to('viewer-admin:all').emit('viewer:count_updated', {
    targetType,
    targetId,
    streamId: targetId,
    viewers: count,
    visibility,
    ...meta,
  });

  // Public rooms receive viewer counts ONLY when visibility === 'public'
  if (visibility === 'public') {
    const publicPayload = {
      targetType,
      targetId,
      streamId: targetId,
      viewers: count,
      visibility,
      ...meta,
    };
    io.to(`stream:${targetId}`).emit('stream:viewers', publicPayload);
    io.to(`match:${targetId}`).emit('viewer:count_updated', publicPayload);
  } else {
    // Emit redacted state so public clients clear any stale count
    const redactedPayload = {
      targetType,
      targetId,
      streamId: targetId,
      viewers: null,
      visibility,
      ...meta,
    };
    io.to(`stream:${targetId}`).emit('stream:viewers', redactedPayload);
    io.to(`match:${targetId}`).emit('viewer:count_updated', redactedPayload);
  }
}

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    },
    transports: ['websocket', 'polling'],
    pingInterval: 15_000,
    pingTimeout: 60_000,
    connectTimeout: 45_000,
    perMessageDeflate: false,
  });

  if (cleanupTimer) clearInterval(cleanupTimer);
  // 20-second stale session cleanup (removes sessions missing 25s heartbeats > 50s)
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    const staleThresholdMs = 50_000;
    const touchedTargets: Array<{ targetType: 'match' | 'stream'; targetId: string }> = [];

    for (const [bucketKey, sessions] of activeViewerSessions.entries()) {
      let changed = false;
      for (const [sid, session] of sessions.entries()) {
        if (now - session.lastHeartbeatAt > staleThresholdMs) {
          sessions.delete(sid);
          changed = true;
        }
      }
      if (changed) {
        const [tType, tId] = bucketKey.split(':') as ['match' | 'stream', string];
        touchedTargets.push({ targetType: tType, targetId: tId });
        if (sessions.size === 0) activeViewerSessions.delete(bucketKey);
      }
    }

    for (const t of touchedTargets) {
      broadcastViewerCounts(t.targetType, t.targetId).catch(() => {});
    }
  }, 20_000);
  cleanupTimer.unref?.();

  io.on('connection', (socket) => {
    socket.on('feed:join', () => {
      socket.join('feed');
    });

    socket.on('feed:leave', () => {
      socket.leave('feed');
    });

    socket.on('tournament:join', (tournamentId: string) => {
      if (typeof tournamentId !== 'string' || !tournamentId.trim()) return;
      socket.join(`tournament:${tournamentId.trim()}`);
    });

    socket.on('tournament:leave', (tournamentId: string) => {
      if (typeof tournamentId !== 'string' || !tournamentId.trim()) return;
      socket.leave(`tournament:${tournamentId.trim()}`);
    });

    socket.on('match:join', (matchId: string) => {
      if (typeof matchId !== 'string' || !matchId.trim()) return;
      const cleanId = matchId.trim();
      socket.join(`match:${cleanId}`);
      socket.join(`stream:${cleanId}`);
    });

    socket.on('match:leave', (matchId: string) => {
      if (typeof matchId !== 'string' || !matchId.trim()) return;
      const cleanId = matchId.trim();
      socket.leave(`match:${cleanId}`);
      socket.leave(`stream:${cleanId}`);
    });

    socket.on('stream:join', (streamId: string) => {
      if (typeof streamId !== 'string' || !streamId.trim()) return;
      const cleanId = streamId.trim();
      socket.join(`stream:${cleanId}`);
      socket.join(`match:${cleanId}`);
      const sessionId = `sock_${socket.id}`;
      const bucketKey = getSessionBucketKey('stream', cleanId);
      const bucket = activeViewerSessions.get(bucketKey) || new Map();
      bucket.set(sessionId, {
        sessionId,
        socketId: socket.id,
        targetType: 'stream',
        targetId: cleanId,
        lastHeartbeatAt: Date.now(),
      });
      activeViewerSessions.set(bucketKey, bucket);
      broadcastViewerCounts('stream', cleanId).catch(() => {});
    });

    socket.on('stream:leave', (streamId: string) => {
      if (typeof streamId !== 'string' || !streamId.trim()) return;
      const cleanId = streamId.trim();
      socket.leave(`stream:${cleanId}`);
      socket.leave(`match:${cleanId}`);
      const bucketKey = getSessionBucketKey('stream', cleanId);
      const bucket = activeViewerSessions.get(bucketKey);
      if (bucket) {
        bucket.delete(`sock_${socket.id}`);
        if (bucket.size === 0) activeViewerSessions.delete(bucketKey);
      }
      broadcastViewerCounts('stream', cleanId).catch(() => {});
    });

    socket.on(
      'viewer:join',
      (payload: { targetType?: 'match' | 'stream'; targetId?: string; sessionKey?: string }) => {
        const targetId = typeof payload?.targetId === 'string' ? payload.targetId.trim() : '';
        const targetType = payload?.targetType === 'match' ? 'match' : 'stream';
        if (!targetId) return;
        const sessionId =
          typeof payload?.sessionKey === 'string' && payload.sessionKey.trim()
            ? payload.sessionKey.trim()
            : `sock_${socket.id}`;

        socket.join(`stream:${targetId}`);
        socket.join(`match:${targetId}`);

        const bucketKey = getSessionBucketKey(targetType, targetId);
        const bucket = activeViewerSessions.get(bucketKey) || new Map();
        bucket.set(sessionId, {
          sessionId,
          socketId: socket.id,
          targetType,
          targetId,
          lastHeartbeatAt: Date.now(),
        });
        activeViewerSessions.set(bucketKey, bucket);
        broadcastViewerCounts(targetType, targetId).catch(() => {});
      }
    );

    socket.on(
      'viewer:heartbeat',
      (payload: { targetType?: 'match' | 'stream'; targetId?: string; sessionKey?: string }) => {
        const targetId = typeof payload?.targetId === 'string' ? payload.targetId.trim() : '';
        const targetType = payload?.targetType === 'match' ? 'match' : 'stream';
        if (!targetId) return;
        const sessionId =
          typeof payload?.sessionKey === 'string' && payload.sessionKey.trim()
            ? payload.sessionKey.trim()
            : `sock_${socket.id}`;
        const bucketKey = getSessionBucketKey(targetType, targetId);
        const bucket = activeViewerSessions.get(bucketKey) || new Map();
        bucket.set(sessionId, {
          sessionId,
          socketId: socket.id,
          targetType,
          targetId,
          lastHeartbeatAt: Date.now(),
        });
        activeViewerSessions.set(bucketKey, bucket);
      }
    );

    socket.on(
      'viewer:leave',
      (payload: { targetType?: 'match' | 'stream'; targetId?: string; sessionKey?: string }) => {
        const targetId = typeof payload?.targetId === 'string' ? payload.targetId.trim() : '';
        const targetType = payload?.targetType === 'match' ? 'match' : 'stream';
        if (!targetId) return;
        const sessionId =
          typeof payload?.sessionKey === 'string' && payload.sessionKey.trim()
            ? payload.sessionKey.trim()
            : `sock_${socket.id}`;
        const bucketKey = getSessionBucketKey(targetType, targetId);
        const bucket = activeViewerSessions.get(bucketKey);
        if (bucket) {
          bucket.delete(sessionId);
          if (bucket.size === 0) activeViewerSessions.delete(bucketKey);
        }
        broadcastViewerCounts(targetType, targetId).catch(() => {});
      }
    );

    socket.on(
      'viewer-admin:join',
      async (payload: { token?: string; targetType?: 'match' | 'stream'; targetId?: string }) => {
        if (!payload?.token) return;
        try {
          const decoded = jwt.verify(payload.token, getJwtSecret()) as JwtPayload;
          if (decoded.portal !== 'admin') return;
          const user = await User.findById(decoded.sub).lean();
          if (!user || !user.isActive || !ADMIN_PORTAL_ROLES.includes(user.role)) return;

          if (payload.targetId) {
            const tType = payload.targetType === 'match' ? 'match' : 'stream';
            socket.join(`viewer-admin:${tType}:${payload.targetId.trim()}`);
            broadcastViewerCounts(tType, payload.targetId.trim()).catch(() => {});
          } else {
            socket.join('viewer-admin:all');
          }
        } catch {
          // Ignore invalid admin socket tokens
        }
      }
    );

    // Authenticated Broadcast Studio room (for OBS camera/scene/layout real-time sync)
    socket.on(
      'broadcast-studio:join',
      async (payload: { token?: string; matchId?: string }) => {
        if (!payload?.token || !payload?.matchId) return;
        const cleanMatchId = String(payload.matchId).trim();
        if (!cleanMatchId) return;
        try {
          const decoded = jwt.verify(payload.token, getJwtSecret()) as JwtPayload;
          if (decoded.portal !== 'admin') return;
          const user: any = await User.findById(decoded.sub);
          if (!user || !user.isActive || !ADMIN_PORTAL_ROLES.includes(user.role)) return;

          const allowed =
            (await hasBroadcastAccess(user, cleanMatchId, 'broadcast:control')) ||
            (await canManageStream(user, cleanMatchId, 'stream')) ||
            (await hasGranularPermission(user, 'broadcast:control', {
              scopeType: 'match',
              scopeId: cleanMatchId,
            }));
          if (!allowed) return;

          socket.join(`broadcast-studio:${cleanMatchId}`);
          socket.emit('broadcast-studio:joined', attachMeta({ matchId: cleanMatchId }));
          emitBroadcastStudioEvent(cleanMatchId, 'obs:controller_presence', {
            matchId: cleanMatchId,
            userId: String(user._id),
            userName: user.name,
            userRole: user.role,
            action: 'joined',
          });
        } catch {
          // Ignore invalid broadcast studio socket tokens
        }
      }
    );

    socket.on('broadcast-studio:leave', (matchId: string) => {
      if (typeof matchId !== 'string' || !matchId.trim()) return;
      socket.leave(`broadcast-studio:${matchId.trim()}`);
    });

    // Scoped Smartphone Camera Companion room (remote Admin Rear <-> Front lens sync)
    socket.on(
      'camera-companion:join',
      async (payload: { cameraDocId?: string; token?: string }) => {
        const cleanDocId = typeof payload?.cameraDocId === 'string' ? payload.cameraDocId.trim() : '';
        const cleanToken = typeof payload?.token === 'string' ? payload.token.trim() : '';
        if (!cleanDocId || !cleanToken) return;
        try {
          const cam: any = await BroadcastCamera.findById(cleanDocId)
            .select('+pushTokenHash matchId cameraId facingMode pushTokenExpiresAt status')
            .lean();
          if (!cam || !verifyScopedToken(cleanToken, cam.pushTokenHash || '')) return;
          if (cam.pushTokenExpiresAt && new Date(cam.pushTokenExpiresAt).getTime() <= Date.now()) {
            return;
          }
          socket.join(`camera-companion:${cleanDocId}`);
          socket.emit(
            'camera-companion:joined',
            attachMeta({
              cameraDocId: cleanDocId,
              matchId: String(cam.matchId),
              cameraId: cam.cameraId,
              facingMode: cam.facingMode === 'user' ? 'user' : 'environment',
              status: cam.status,
            })
          );
        } catch {
          // Ignore invalid companion join attempts
        }
      }
    );

    socket.on('camera-companion:leave', (payload: string | { cameraDocId?: string }) => {
      const cleanDocId =
        typeof payload === 'string'
          ? payload.trim()
          : typeof payload?.cameraDocId === 'string'
            ? payload.cameraDocId.trim()
            : '';
      if (!cleanDocId) return;
      socket.leave(`camera-companion:${cleanDocId}`);
    });

    socket.on('user:join', (payload: string | { token?: string; userId?: string }) => {
      let verifiedUserId = '';
      const tokenStr =
        typeof payload === 'object' && payload?.token
          ? payload.token
          : typeof payload === 'string'
            ? payload.trim()
            : '';
      if (!tokenStr) return;
      try {
        const decoded = jwt.verify(tokenStr, getJwtSecret()) as JwtPayload;
        if (decoded?.sub) verifiedUserId = decoded.sub;
      } catch {
        return;
      }
      if (verifiedUserId) {
        socket.join(`user:${verifiedUserId}`);
      }
    });

    socket.on('disconnecting', () => {
      const touchedTargets: Array<{ targetType: 'match' | 'stream'; targetId: string }> = [];
      for (const [bucketKey, sessions] of activeViewerSessions.entries()) {
        let changed = false;
        for (const [sid, session] of sessions.entries()) {
          if (session.socketId === socket.id) {
            sessions.delete(sid);
            changed = true;
          }
        }
        if (changed) {
          const [tType, tId] = bucketKey.split(':') as ['match' | 'stream', string];
          touchedTargets.push({ targetType: tType, targetId: tId });
          if (sessions.size === 0) activeViewerSessions.delete(bucketKey);
        }
      }
      for (const t of touchedTargets) {
        broadcastViewerCounts(t.targetType, t.targetId).catch(() => {});
      }
    });
  });

  // Dedicated authenticated namespace for Local OBS Controller Bridges / Agents
  const obsAgentNs = io.of('/obs-agent');
  obsAgentNs.use(async (socket, next) => {
    try {
      const auth = (socket.handshake.auth || {}) as Record<string, unknown>;
      const bridgeId = typeof auth.bridgeId === 'string' ? auth.bridgeId.trim().toUpperCase() : '';
      const bridgeToken =
        typeof auth.bridgeToken === 'string'
          ? auth.bridgeToken.trim()
          : typeof auth.token === 'string'
            ? auth.token.trim()
            : '';
      const matchId = typeof auth.matchId === 'string' ? auth.matchId.trim() : '';
      const agentToken = typeof auth.agentToken === 'string' ? auth.agentToken.trim() : '';
      const label = typeof auth.label === 'string' ? auth.label.trim().slice(0, 120) : '';
      const platform = typeof auth.platform === 'string' ? auth.platform.trim().slice(0, 40) : '';
      const bridgeVersion =
        typeof auth.bridgeVersion === 'string' ? auth.bridgeVersion.trim().slice(0, 40) : '';
      const capabilities = Array.isArray(auth.capabilities)
        ? auth.capabilities
            .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            .map((item) => item.trim().slice(0, 64))
            .slice(0, 32)
        : [];
      const manualResume = Boolean(auth.manualResume);

      if (!obsAgentHandlers) {
        next(new Error('OBS bridge handler unavailable.'));
        return;
      }

      const result = await obsAgentHandlers.verifyAgentHandshake({
        bridgeId,
        bridgeToken: bridgeToken || agentToken,
        matchId,
        agentToken: agentToken || bridgeToken,
        label,
        platform,
        bridgeVersion,
        capabilities,
        manualResume,
      });

      if (!result.ok || !result.context) {
        next(new Error(result.reason || 'Unauthorized OBS bridge handshake.'));
        return;
      }

      (socket.data as any).obsContext = result.context;
      next();
    } catch {
      next(new Error('OBS bridge authentication error.'));
    }
  });

  obsAgentNs.on('connection', (socket) => {
    const context = ((socket.data as any).obsContext || {}) as ObsAgentContext;
    if (obsAgentHandlers && (context.bridgeId || context.matchId)) {
      obsAgentHandlers.onAgentConnected(socket, context).catch(() => {});
    }

    socket.on('agent:obs_state', (payload: Record<string, any>) => {
      if (obsAgentHandlers && payload && typeof payload === 'object') {
        obsAgentHandlers.onAgentStateUpdate(context, payload).catch(() => {});
      }
    });

    socket.on('agent:heartbeat', (payload: Record<string, any>, ack?: (res: any) => void) => {
      if (typeof ack === 'function') {
        ack({ ok: true, serverNowMs: Date.now() });
      }
      if (obsAgentHandlers?.onAgentHeartbeat) {
        obsAgentHandlers
          .onAgentHeartbeat(context, payload && typeof payload === 'object' ? payload : {})
          .catch(() => {});
      }
    });

    socket.on('agent:diagnostic', (payload: Record<string, any>) => {
      if (obsAgentHandlers?.onAgentDiagnostic && payload && typeof payload === 'object') {
        obsAgentHandlers.onAgentDiagnostic(context, payload).catch(() => {});
      }
    });

    socket.on('agent:obs_error', (payload: { message?: string }) => {
      if (obsAgentHandlers) {
        obsAgentHandlers
          .onAgentError(context, String(payload?.message || 'OBS reported an error.'))
          .catch(() => {});
      }
    });

    socket.on('disconnect', (reason) => {
      if (obsAgentHandlers) {
        obsAgentHandlers
          .onAgentDisconnected(socket, context, String(reason || 'disconnected'))
          .catch(() => {});
      }
    });
  });

  return io;
}

export function getSocketIO(): SocketIOServer | null {
  return io;
}

export function emitStreamEvent(streamId: string, event: string, payload: unknown): void {
  if (!io) return;
  const enriched = attachMeta(payload);
  io.to(`stream:${streamId}`).emit(event, enriched);
  io.to(`match:${streamId}`).emit(event, enriched);
  io.to('feed').emit(event, enriched);
  // Keep root broadcast for existing listeners not yet joined to feed room
  io.emit(event, enriched);
}

export function emitRoomOnlyEvent(streamId: string, event: string, payload: unknown): void {
  if (!io) return;
  const enriched = attachMeta(payload);
  io.to(`stream:${streamId}`).emit(event, enriched);
  io.to(`match:${streamId}`).emit(event, enriched);
}

export function emitBroadcastStudioEvent(matchId: string, event: string, payload: unknown): void {
  if (!io) return;
  const enriched = attachMeta(payload);
  io.to(`broadcast-studio:${matchId}`).emit(event, enriched);
}

export function emitCameraCompanionEvent(cameraDocId: string, event: string, payload: unknown): void {
  if (!io || !cameraDocId) return;
  const enriched = attachMeta(payload);
  io.to(`camera-companion:${cameraDocId}`).emit(event, enriched);
}

export function emitTournamentEvent(tournamentId: string, event: string, payload: unknown): void {
  if (!io) return;
  const enriched = attachMeta(payload);
  io.to(`tournament:${tournamentId}`).emit(event, enriched);
  io.to('feed').emit(event, enriched);
  io.emit(event, enriched);
}

export function emitUserNotification(userId: string, payload: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit('notification:new', attachMeta(payload));
}

export function getActiveRoomViewerCount(streamId: string): number {
  const fromStream = getDistinctViewerCount('stream', streamId);
  const fromMatch = getDistinctViewerCount('match', streamId);
  if (fromStream > 0 || fromMatch > 0) return Math.max(fromStream, fromMatch);
  if (!io) return 0;
  return io.sockets.adapter.rooms.get(`stream:${streamId}`)?.size || 0;
}

export function getAllActiveViewerCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [bucketKey, sessions] of activeViewerSessions.entries()) {
    const [, id] = bucketKey.split(':');
    counts[id] = Math.max(counts[id] || 0, sessions.size);
  }
  if (io) {
    for (const [roomName, members] of io.sockets.adapter.rooms.entries()) {
      if (roomName.startsWith('stream:')) {
        const id = roomName.slice(7);
        counts[id] = Math.max(counts[id] || 0, members.size);
      }
    }
  }
  return counts;
}
