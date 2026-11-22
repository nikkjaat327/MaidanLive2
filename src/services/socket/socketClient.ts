import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

export function getSocketClient(): Socket {
  if (!socketInstance) {
    socketInstance = io({
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      autoConnect: true,
    });
  }
  return socketInstance;
}
