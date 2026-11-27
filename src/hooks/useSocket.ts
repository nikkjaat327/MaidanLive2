import { useEffect, useRef, useState } from 'react';
import { getSocketClient } from '../services/socket/socketClient.ts';

export function useSocket(streamId?: string, onReconnect?: () => void) {
  const [connected, setConnected] = useState<boolean>(() => getSocketClient().connected);
  const onReconnectRef = useRef(onReconnect);

  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  useEffect(() => {
    const socket = getSocketClient();

    const handleConnect = () => {
      setConnected(true);
      if (streamId) {
        socket.emit('stream:join', streamId);
      }
      onReconnectRef.current?.();
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
  }, [streamId]);

  return { connected, socket: getSocketClient() };
}

