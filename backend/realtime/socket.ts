import crypto from 'crypto';
import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { canManageStream, getJwtSecret, hasGranularPermission } from '../../server/middleware/auth.ts';
import type { JwtPayload } from '../../server/middleware/auth.ts';
import { ADMIN_PORTAL_ROLES, User } from '../../server/models/User.ts';
import { LiveStream } from '../../server/models/LiveStream.ts';

let io: SocketIOServer | null = null;
let eventSequence = 0;
let cleanupTimer: NodeJS.Timeout | null = null;

export interface ObsAgentRegistrationHandlers {
  onAgentConnected: (socket: any, matchId: string, label: string) => Promise<void>;
  onAgentDisconnected: (socket: any, matchId: string, reason: string) => Promise<void>;
  onAgentStateUpdate: (matchId: string, payload: Record<string, any>) => Promise<void>;
  onAgentError: (matchId: string, errorMessage: string) => Promise<void>;
  verifyAgentToken: (matchId: string, token: string) => Promise<boolean>;
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
            (await canManageStream(user, cleanMatchId, 'stream')) ||
            (await hasGranularPermission(user, 'broadcast:control', {
              scopeType: 'match',
              scopeId: cleanMatchId,
            }));
          if (!allowed) return;

          socket.join(`broadcast-studio:${cleanMatchId}`);
          socket.emit('broadcast-studio:joined', attachMeta({ matchId: cleanMatchId }));
        } catch {
          // Ignore invalid broadcast studio socket tokens
        }
      }
    );

    socket.on('broadcast-studio:leave', (matchId: string) => {
      if (typeof matchId !== 'string' || !matchId.trim()) return;
      socket.leave(`broadcast-studio:${matchId.trim()}`);
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

  // Dedicated authenticated namespace for Local OBS Controller Agents
  const obsAgentNs = io.of('/obs-agent');
  obsAgentNs.use(async (socket, next) => {
    try {
      const auth = (socket.handshake.auth || {}) as Record<string, unknown>;
      const matchId = typeof auth.matchId === 'string' ? auth.matchId.trim() : '';
      const agentToken = typeof auth.agentToken === 'string' ? auth.agentToken.trim() : '';
      if (!matchId || !agentToken || !obsAgentHandlers) {
        next(new Error('Unauthorized OBS agent handshake.'));
        return;
      }
      const ok = await obsAgentHandlers.verifyAgentToken(matchId, agentToken);
      if (!ok) {
        next(new Error('Invalid OBS agent token for this match.'));
        return;
      }
      (socket.data as any).matchId = matchId;
      (socket.data as any).agentLabel =
        typeof auth.label === 'string' ? auth.label.trim().slice(0, 120) : 'Local OBS Agent';
      next();
    } catch {
      next(new Error('OBS agent authentication error.'));
    }
  });

  obsAgentNs.on('connection', (socket) => {
    const matchId = String((socket.data as any).matchId || '');
    const label = String((socket.data as any).agentLabel || 'Local OBS Agent');
    if (obsAgentHandlers && matchId) {
      obsAgentHandlers.onAgentConnected(socket, matchId, label).catch(() => {});
    }

    socket.on('agent:obs_state', (payload: Record<string, any>) => {
      if (obsAgentHandlers && matchId && payload && typeof payload === 'object') {
        obsAgentHandlers.onAgentStateUpdate(matchId, payload).catch(() => {});
      }
    });

    socket.on('agent:obs_error', (payload: { message?: string }) => {
      if (obsAgentHandlers && matchId) {
        obsAgentHandlers
          .onAgentError(matchId, String(payload?.message || 'OBS reported an error.'))
          .catch(() => {});
      }
    });

    socket.on('disconnect', (reason) => {
      if (obsAgentHandlers && matchId) {
        obsAgentHandlers.onAgentDisconnected(socket, matchId, String(reason || 'disconnected')).catch(() => {});
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
