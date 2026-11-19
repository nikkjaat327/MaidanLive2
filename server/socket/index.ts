import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../middleware/auth.ts';
import type { JwtPayload } from '../middleware/auth.ts';

let io: SocketIOServer | null = null;

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    socket.on('stream:join', (streamId: string) => {
      if (typeof streamId !== 'string' || !streamId.trim()) return;
      const cleanId = streamId.trim();
      const room = `stream:${cleanId}`;
      socket.join(room);
      const count = io?.sockets.adapter.rooms.get(room)?.size || 1;
      io?.to(room).emit('stream:viewers', { streamId: cleanId, viewers: count });
    });

    socket.on('stream:leave', (streamId: string) => {
      if (typeof streamId !== 'string' || !streamId.trim()) return;
      const cleanId = streamId.trim();
      const room = `stream:${cleanId}`;
      socket.leave(room);
      const count = io?.sockets.adapter.rooms.get(room)?.size || 0;
      io?.to(room).emit('stream:viewers', { streamId: cleanId, viewers: count });
    });

    socket.on('user:join', (payload: string | { token?: string; userId?: string }) => {
      let verifiedUserId = '';
      if (typeof payload === 'object' && payload?.token) {
        try {
          const decoded = jwt.verify(payload.token, getJwtSecret()) as JwtPayload;
          if (decoded?.sub) verifiedUserId = decoded.sub;
        } catch {
          return;
        }
      } else if (typeof payload === 'string' && payload.trim()) {
        // Accept token string if valid JWT
        try {
          const decoded = jwt.verify(payload.trim(), getJwtSecret()) as JwtPayload;
          if (decoded?.sub) verifiedUserId = decoded.sub;
        } catch {
          return;
        }
      }
      if (verifiedUserId) {
        socket.join(`user:${verifiedUserId}`);
      }
    });

    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('stream:')) {
          const streamId = room.slice(7);
          const current = io?.sockets.adapter.rooms.get(room)?.size || 1;
          socket.to(room).emit('stream:viewers', {
            streamId,
            viewers: Math.max(0, current - 1),
          });
        }
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
  io.to(`stream:${streamId}`).emit(event, payload);
  io.emit(event, payload);
}

export function emitRoomOnlyEvent(streamId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`stream:${streamId}`).emit(event, payload);
}

export function emitUserNotification(userId: string, payload: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit('notification:new', payload);
}

export function getActiveRoomViewerCount(streamId: string): number {
  if (!io) return 0;
  return io.sockets.adapter.rooms.get(`stream:${streamId}`)?.size || 0;
}

export function getAllActiveViewerCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!io) return counts;
  for (const [roomName, members] of io.sockets.adapter.rooms.entries()) {
    if (roomName.startsWith('stream:')) {
      counts[roomName.slice(7)] = members.size;
    }
  }
  return counts;
}
