const streamQueues = new Map<string, Promise<unknown>>();
const streamPendingCounts = new Map<string, number>();
const listeners = new Map<string, Set<(count: number) => void>>();

function notify(streamId: string) {
  const count = streamPendingCounts.get(streamId) || 0;
  const set = listeners.get(streamId);
  if (!set) return;
  for (const cb of set) {
    try {
      cb(count);
    } catch {
      // Ignore listener errors
    }
  }
}

export function getPendingScoreCount(streamId?: string): number {
  if (!streamId) return 0;
  return streamPendingCounts.get(streamId) || 0;
}

export function subscribePendingScoreCount(
  streamId: string,
  cb: (count: number) => void
): () => void {
  let set = listeners.get(streamId);
  if (!set) {
    set = new Set();
    listeners.set(streamId, set);
  }
  set.add(cb);
  cb(streamPendingCounts.get(streamId) || 0);
  return () => {
    set?.delete(cb);
    if (set && set.size === 0) listeners.delete(streamId);
  };
}

/**
 * Executes score mutations sequentially per stream in strict FIFO order
 * so rapid multi-tap scoring (1, 4, 6, points) never races or drops events,
 * without blocking UI buttons while network requests complete.
 */
export function enqueueScoreMutation<T>(
  streamId: string,
  task: () => Promise<T>
): Promise<T> {
  const key = streamId || '__default__';
  const prev = streamQueues.get(key) || Promise.resolve();
  streamPendingCounts.set(key, (streamPendingCounts.get(key) || 0) + 1);
  notify(key);

  const nextPromise = prev.catch(() => undefined).then(() => task());

  const cleanup = nextPromise.finally(() => {
    const remaining = Math.max(0, (streamPendingCounts.get(key) || 1) - 1);
    if (remaining === 0) {
      streamPendingCounts.delete(key);
    } else {
      streamPendingCounts.set(key, remaining);
    }
    if (streamQueues.get(key) === cleanup) {
      streamQueues.delete(key);
    }
    notify(key);
  });

  streamQueues.set(key, cleanup);
  return nextPromise;
}
