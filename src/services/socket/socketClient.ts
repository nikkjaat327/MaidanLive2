import { io, Socket } from 'socket.io-client';
import { API_ORIGIN } from '../api/httpClient.ts';
import { updateSocketDiagState } from '../../utils/realtimeDiagnostics.ts';

let socketInstance: Socket | null = null;
let lifecycleListenersAttached = false;

export function getSocketTransportName(socket: Socket | null = socketInstance): string {
  try {
    const engine = (socket as unknown as { io?: { engine?: { transport?: { name?: string } } } })
      ?.io?.engine;
    return engine?.transport?.name || (socket?.connected ? 'connected' : 'disconnected');
  } catch {
    return socket?.connected ? 'connected' : 'disconnected';
  }
}

export function getSocketClient(): Socket {
  if (!socketInstance) {
    const socketOrigin =
      (import.meta.env.VITE_SOCKET_URL as string | undefined)?.trim().replace(/\/+$/, '') ||
      API_ORIGIN;
    const opts = {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 300,
      reconnectionDelayMax: 3000,
      timeout: 15000,
      autoConnect: true,
    };
    socketInstance = socketOrigin ? io(socketOrigin, opts) : io(opts);

    if (!lifecycleListenersAttached) {
      lifecycleListenersAttached = true;
      const sock = socketInstance;

      const syncTransport = () => {
        updateSocketDiagState({
          socketConnected: sock.connected,
          transport: getSocketTransportName(sock),
        });
      };

      sock.on('connect', () => {
        syncTransport();
        try {
          const engine = (sock as unknown as {
            io?: { engine?: { on?: (ev: string, cb: () => void) => void } };
          })?.io?.engine;
          engine?.on?.('upgrade', () => {
            syncTransport();
          });
        } catch {
          // Ignore engine listener errors
        }
      });

      sock.on('disconnect', () => {
        updateSocketDiagState({
          socketConnected: false,
          transport: 'disconnected',
        });
      });

      try {
        sock.io?.on?.('reconnect', () => {
          updateSocketDiagState({
            socketConnected: sock.connected,
            transport: getSocketTransportName(sock),
            incrementReconnect: true,
          });
        });
      } catch {
        // Ignore manager listener errors
      }

      if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
          if (!sock.connected) {
            sock.connect();
          }
        });
      }

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (
            document.visibilityState === 'visible' &&
            (typeof navigator === 'undefined' || navigator.onLine) &&
            !sock.connected
          ) {
            sock.connect();
          }
        });
      }
    }
  }
  return socketInstance;
}

