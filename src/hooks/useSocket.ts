import { useEffect, useState } from 'react';
import { getSocketClient } from '../services/socket/socketClient.ts';

export function useSocket(streamId?: string, onReconnect?: () => void) {
  const [connected, setConnected] = useState<boolean>(() => getSocketClient().connected);

  useEffect(() => {
    const socket = getSocketClient();

    const handleConnect = () => {
      setConnected(true);
      if (streamId) {
        socket.emit('stream:join', streamId);
      }
      if (onReconnect) {
        onReconnect();
      }
    };

    const handleDisconnect = () => {
      setConnected(false);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    if (socket.connected) {
      setConnected(true);
      if (streamId) {
        socket.emit('stream:join', streamId);
      }
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      if (streamId) {
        socket.emit('stream:leave', streamId);
      }
    };
  }, [streamId, onReconnect]);

  return { connected, socket: getSocketClient() };
}
