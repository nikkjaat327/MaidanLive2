import { io, Socket } from 'socket.io-client';
import { API_ORIGIN } from '../api/httpClient.ts';

let socketInstance: Socket | null = null;

export function getSocketClient(): Socket {
  if (!socketInstance) {
    const socketOrigin =
      (import.meta.env.VITE_SOCKET_URL as string | undefined)?.trim().replace(/\/+$/, '') ||
      API_ORIGIN;
    const opts = {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      autoConnect: true,
    };
    socketInstance = socketOrigin ? io(socketOrigin, opts) : io(opts);
  }
  return socketInstance;
}
