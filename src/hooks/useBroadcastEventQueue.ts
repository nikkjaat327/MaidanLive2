import { useCallback, useEffect, useRef, useState } from 'react';
import { BroadcastOverlayConfig } from '../types/index.ts';
import {
  BROADCAST_EVENT_KEYS,
  BroadcastEventKey,
  BroadcastEventTriggerPayload,
  normalizeEventAnimationsConfig,
} from '../utils/eventAnimations.ts';
import { getSocketClient } from '../services/socket/socketClient.ts';

export interface ActiveBroadcastEventItem {
  payload: BroadcastEventTriggerPayload;
  durationMs: number;
  instanceKey: string;
  sticky?: boolean;
}

const VALID_EVENT_KEY_SET = new Set<string>(BROADCAST_EVENT_KEYS);
const EXIT_TRANSITION_MS = 440;

export function useBroadcastEventQueue({
  matchId,
  overlayConfig,
  allowLiveSocket = true,
}: {
  matchId?: string;
  overlayConfig: BroadcastOverlayConfig;
  allowLiveSocket?: boolean;
}) {
  const [queue, setQueue] = useState<BroadcastEventTriggerPayload[]>([]);
  const [activeItem, setActiveItem] = useState<ActiveBroadcastEventItem | null>(null);
  const [isExiting, setIsExiting] = useState<boolean>(false);

  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const eventAnimationsRef = useRef(normalizeEventAnimationsConfig(overlayConfig?.eventAnimations));

  useEffect(() => {
    eventAnimationsRef.current = normalizeEventAnimationsConfig(overlayConfig?.eventAnimations);
  }, [overlayConfig?.eventAnimations]);

  // Clear queue if match changes
  useEffect(() => {
    seenEventIdsRef.current.clear();
    setQueue([]);
    setActiveItem(null);
    setIsExiting(false);
  }, [matchId]);

  const enqueuePayload = useCallback(
    (payload: BroadcastEventTriggerPayload, options?: { bypassEnabledCheck?: boolean; bypassDedup?: boolean }) => {
      if (!payload || !VALID_EVENT_KEY_SET.has(payload.eventKey)) return;
      const rules = eventAnimationsRef.current;
      const rule = rules[payload.eventKey as BroadcastEventKey];
      if (!options?.bypassEnabledCheck && rule && rule.enabled === false) {
        return;
      }

      if (!options?.bypassDedup && payload.eventId) {
        if (seenEventIdsRef.current.has(payload.eventId)) return;
        seenEventIdsRef.current.add(payload.eventId);
        if (seenEventIdsRef.current.size > 300) {
          const oldest = seenEventIdsRef.current.values().next().value;
          if (oldest) seenEventIdsRef.current.delete(oldest);
        }
      }

      setQueue((prev) => [...prev.slice(-14), payload]);
    },
    []
  );

  // Subscribe to Socket.IO live broadcast event triggers
  useEffect(() => {
    if (!allowLiveSocket || !matchId) return;
    const socket = getSocketClient();

    const handleConnect = () => {
      socket.emit('match:join', matchId);
    };

    if (socket.connected) {
      socket.emit('match:join', matchId);
    }

    const handleEventAnimation = (payload: BroadcastEventTriggerPayload) => {
      if (!payload) return;
      if (payload.streamId && payload.streamId !== matchId) return;
      enqueuePayload(payload);
    };

    socket.on('connect', handleConnect);
    socket.on('broadcast:event_animation', handleEventAnimation);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('broadcast:event_animation', handleEventAnimation);
    };
  }, [allowLiveSocket, matchId, enqueuePayload]);

  // Pop next item when idle
  useEffect(() => {
    if (activeItem || queue.length === 0) return;
    const [next, ...rest] = queue;
    const rule = eventAnimationsRef.current[next.eventKey];
    const durationSec = rule?.durationSeconds ?? 4;
    const durationMs = Math.max(1500, Math.min(15000, Math.round(durationSec * 1000)));
    setQueue(rest);
    setIsExiting(false);
    setActiveItem({
      payload: next,
      durationMs,
      instanceKey: `${next.eventId || next.eventKey}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sticky: false,
    });
  }, [activeItem, queue]);

  // Run hold -> exit -> advance lifecycle strictly for Admin-configured duration (unless pinned/sticky in studio)
  useEffect(() => {
    if (!activeItem || activeItem.sticky) return;
    const exitDelayMs = Math.max(500, activeItem.durationMs - EXIT_TRANSITION_MS);

    const exitTimer = window.setTimeout(() => {
      setIsExiting(true);
    }, exitDelayMs);

    const doneTimer = window.setTimeout(() => {
      setActiveItem(null);
      setIsExiting(false);
    }, activeItem.durationMs);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
    };
  }, [activeItem]);

  const triggerLocalPreview = useCallback(
    (
      payload: BroadcastEventTriggerPayload,
      replaceCurrent = true,
      options?: { sticky?: boolean; replayEntry?: boolean; durationMsOverride?: number }
    ) => {
      if (replaceCurrent) {
        setQueue([]);
        setIsExiting(false);
        const sticky = Boolean(options?.sticky);
        const replayEntry = options?.replayEntry !== false;
        const rule = eventAnimationsRef.current[payload.eventKey];
        const durationSec = rule?.durationSeconds ?? 4;
        const durationMs =
          typeof options?.durationMsOverride === 'number'
            ? Math.max(1100, Math.min(15000, Math.round(options.durationMsOverride)))
            : Math.max(1500, Math.min(15000, Math.round(durationSec * 1000)));

        setActiveItem((prev) => {
          const keepInstance =
            !replayEntry &&
            prev &&
            prev.payload.eventKey === payload.eventKey &&
            sticky;
          return {
            payload,
            durationMs,
            sticky,
            instanceKey: keepInstance
              ? prev.instanceKey
              : `preview-${payload.eventKey}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          };
        });
        return;
      }
      enqueuePayload(payload, { bypassEnabledCheck: true, bypassDedup: true });
    },
    [enqueuePayload]
  );

  const clearQueue = useCallback(() => {
    setQueue([]);
    setActiveItem(null);
    setIsExiting(false);
  }, []);

  return {
    activeItem,
    isExiting,
    queueLength: queue.length,
    triggerLocalPreview,
    clearQueue,
  };
}
