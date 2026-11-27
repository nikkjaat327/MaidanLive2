import axios from 'axios';
import { LiveScoreData, ScoreHistoryItem } from '../../types/index.ts';
import { extractApiError } from '../api/httpClient.ts';
import { getSocketClient } from '../socket/socketClient.ts';
import { scoreboardService } from './scoreboardService.ts';
import {
  OfflineScoreQueueItem,
  offlineScoreQueue,
} from '../../utils/offlineScoreQueue.ts';
import type { ScoreDiagTraceServer } from '../../utils/realtimeDiagnostics.ts';

export interface OfflineScoreSnapshot {
  streamId: string;
  items: OfflineScoreQueueItem[];
  pendingCount: number;
  conflictCount: number;
  syncing: boolean;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

export interface ScoreSubmitResult {
  synced: boolean;
  queued: boolean;
  duplicatePrevented?: boolean;
  score: LiveScoreData | null;
  historyItem?: ScoreHistoryItem;
  queueItem?: OfflineScoreQueueItem;
  diag?: ScoreDiagTraceServer;
}

export interface ScorePatchInput {
  clientEventId?: string;
  traceId?: string;
  teamAScore?: number;
  teamBScore?: number;
  sportSpecificDetails?: Record<string, unknown>;
  matchStatus?: string;
  sportType?: string;
  tossWinner?: 'A' | 'B' | '';
  tossDecision?: string;
  action: string;
  allowLockedOverride?: boolean;
}

export interface StructuredScoreEventInput {
  clientEventId: string;
  traceId?: string;
  sportType: string;
  action: Record<string, unknown>;
  playerId?: string;
  playerName?: string;
  assistPlayerId?: string;
  assistPlayerName?: string;
  eventPhase?: string;
  matchStatus?: string;
}

export type OfflineScoreListener = (snapshot: OfflineScoreSnapshot) => void;

const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export function isUnstableNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return true;
  }
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      return true;
    }
    if (
      err.code === 'ERR_NETWORK' ||
      err.code === 'ECONNABORTED' ||
      err.code === 'ETIMEDOUT'
    ) {
      return true;
    }
    if (TRANSIENT_HTTP_STATUSES.has(err.response.status)) {
      return true;
    }
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes('network error') ||
      msg.includes('failed to fetch') ||
      msg.includes('timeout') ||
      msg.includes('err_internet_disconnected')
    ) {
      return true;
    }
  }
  return false;
}

export class OfflineScoreService {
  private listeners = new Map<string, Set<OfflineScoreListener>>();
  private syncingStreams = new Set<string>();
  private lastSyncedByStream = new Map<string, string>();
  private lastErrorByStream = new Map<string, string | null>();
  private scoreUpdateCallbacks = new Map<string, Set<(score: LiveScoreData) => void>>();
  private retryTimer: number | null = null;
  private retryDelayMs = 5000;
  private lifecycleAttached = false;

  ensureLifecycleListeners(): void {
    if (this.lifecycleAttached || typeof window === 'undefined') return;
    this.lifecycleAttached = true;

    window.addEventListener('online', () => {
      this.retryDelayMs = 5000;
      void this.syncAll();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void this.syncAll();
      }
    });

    try {
      const socket = getSocketClient();
      socket.on('connect', () => {
        this.retryDelayMs = 5000;
        void this.syncAll();
      });
    } catch {
      // Non-blocking if socket fails in headless environment
    }
  }

  async getSnapshot(streamId: string): Promise<OfflineScoreSnapshot> {
    const items = await offlineScoreQueue.listByStream(streamId);
    const conflictCount = items.filter((item) => item.status === 'CONFLICT').length;
    const pendingCount = items.filter((item) => item.status !== 'CONFLICT').length;
    return {
      streamId,
      items,
      pendingCount,
      conflictCount,
      syncing: this.syncingStreams.has(streamId),
      lastSyncedAt: this.lastSyncedByStream.get(streamId) || null,
      lastSyncError: this.lastErrorByStream.get(streamId) || null,
    };
  }

  private async notifyStream(streamId: string): Promise<void> {
    const subs = this.listeners.get(streamId);
    if (!subs || subs.size === 0) return;
    const snapshot = await this.getSnapshot(streamId);
    subs.forEach((fn) => fn(snapshot));
  }

  subscribe(
    streamId: string,
    listener: OfflineScoreListener,
    options?: { onScoreSynced?: (score: LiveScoreData) => void }
  ): () => void {
    this.ensureLifecycleListeners();
    if (!this.listeners.has(streamId)) {
      this.listeners.set(streamId, new Set());
    }
    this.listeners.get(streamId)!.add(listener);

    if (options?.onScoreSynced) {
      if (!this.scoreUpdateCallbacks.has(streamId)) {
        this.scoreUpdateCallbacks.set(streamId, new Set());
      }
      this.scoreUpdateCallbacks.get(streamId)!.add(options.onScoreSynced);
    }

    void this.getSnapshot(streamId).then((snapshot) => {
      listener(snapshot);
      if (snapshot.pendingCount > 0 && (typeof navigator === 'undefined' || navigator.onLine)) {
        void this.syncStream(streamId);
      }
    });

    return () => {
      this.listeners.get(streamId)?.delete(listener);
      if (options?.onScoreSynced) {
        this.scoreUpdateCallbacks.get(streamId)?.delete(options.onScoreSynced);
      }
    };
  }

  private scheduleRetry(): void {
    if (typeof window === 'undefined' || this.retryTimer !== null) return;
    const delay = this.retryDelayMs;
    this.retryDelayMs = Math.min(30000, this.retryDelayMs * 2);
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      if (typeof navigator === 'undefined' || navigator.onLine) {
        void this.syncAll();
      }
    }, delay);
  }

  private clearRetryTimer(): void {
    if (typeof window !== 'undefined' && this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryDelayMs = 5000;
  }

  async listByStream(streamId: string): Promise<OfflineScoreQueueItem[]> {
    return offlineScoreQueue.listByStream(streamId);
  }

  async listAll(): Promise<OfflineScoreQueueItem[]> {
    return offlineScoreQueue.listAll();
  }

  async removeItem(streamId: string, itemId: string): Promise<void> {
    await offlineScoreQueue.remove(itemId);
    await this.notifyStream(streamId);
  }

  async discardConflicts(streamId: string): Promise<void> {
    const items = await offlineScoreQueue.listByStream(streamId);
    for (const item of items) {
      if (item.status === 'CONFLICT') {
        await offlineScoreQueue.remove(item.id);
      }
    }
    this.lastErrorByStream.set(streamId, null);
    await this.notifyStream(streamId);
  }

  async clearStream(streamId: string): Promise<void> {
    await offlineScoreQueue.clearStream(streamId);
    this.lastErrorByStream.set(streamId, null);
    await this.notifyStream(streamId);
  }

  async submitScorePatch(
    streamId: string,
    payload: ScorePatchInput,
    currentScore: LiveScoreData | null
  ): Promise<ScoreSubmitResult> {
    this.ensureLifecycleListeners();

    const optimisticScore: LiveScoreData | null = currentScore
      ? {
          ...currentScore,
          teamAScore: payload.teamAScore ?? currentScore.teamAScore,
          teamBScore: payload.teamBScore ?? currentScore.teamBScore,
          sportSpecificDetails:
            payload.sportSpecificDetails ?? currentScore.sportSpecificDetails,
          matchStatus: payload.matchStatus ?? currentScore.matchStatus,
          sportType: (payload.sportType ?? currentScore.sportType) as LiveScoreData['sportType'],
        }
      : null;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const queueItem = await offlineScoreQueue.enqueue({
        streamId,
        kind: 'patch',
        actionLabel: payload.action,
        payload: payload as unknown as Record<string, unknown>,
        expectedUpdatedAt: currentScore?.lastUpdatedAt || null,
      });
      this.scheduleRetry();
      await this.notifyStream(streamId);
      return { synced: false, queued: true, score: optimisticScore, queueItem };
    }

    try {
      const res = await scoreboardService.updateScore(streamId, payload);
      this.lastSyncedByStream.set(streamId, new Date().toLocaleTimeString());
      this.lastErrorByStream.set(streamId, null);
      await this.notifyStream(streamId);
      return {
        synced: true,
        queued: false,
        duplicatePrevented: res.duplicatePrevented,
        score: res.score,
        historyItem: res.historyItem,
        diag: res.diag,
      };
    } catch (err) {
      if (!isUnstableNetworkError(err)) {
        throw err;
      }
      const queueItem = await offlineScoreQueue.enqueue({
        streamId,
        kind: 'patch',
        actionLabel: payload.action,
        payload: payload as unknown as Record<string, unknown>,
        expectedUpdatedAt: currentScore?.lastUpdatedAt || null,
      });
      this.lastErrorByStream.set(
        streamId,
        'Unstable network detected — cached locally for automatic sync.'
      );
      this.scheduleRetry();
      await this.notifyStream(streamId);
      return { synced: false, queued: true, score: optimisticScore, queueItem };
    }
  }

  async submitScoreEvent(
    streamId: string,
    payload: StructuredScoreEventInput,
    currentScore: LiveScoreData | null
  ): Promise<ScoreSubmitResult> {
    this.ensureLifecycleListeners();
    const actionLabel = String(payload.action?.type || 'Structured Event');

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const queueItem = await offlineScoreQueue.enqueue({
        id: payload.clientEventId,
        streamId,
        kind: 'event',
        actionLabel,
        payload: payload as unknown as Record<string, unknown>,
        expectedUpdatedAt: currentScore?.lastUpdatedAt || null,
      });
      this.scheduleRetry();
      await this.notifyStream(streamId);
      return { synced: false, queued: true, score: currentScore, queueItem };
    }

    try {
      const res = await scoreboardService.recordScoreEvent(streamId, payload);
      this.lastSyncedByStream.set(streamId, new Date().toLocaleTimeString());
      this.lastErrorByStream.set(streamId, null);
      await this.notifyStream(streamId);
      return {
        synced: true,
        queued: false,
        duplicatePrevented: res.duplicatePrevented,
        score: res.score,
        historyItem: res.historyItem,
        diag: res.diag,
      };
    } catch (err) {
      if (!isUnstableNetworkError(err)) {
        throw err;
      }
      const queueItem = await offlineScoreQueue.enqueue({
        id: payload.clientEventId,
        streamId,
        kind: 'event',
        actionLabel,
        payload: payload as unknown as Record<string, unknown>,
        expectedUpdatedAt: currentScore?.lastUpdatedAt || null,
      });
      this.lastErrorByStream.set(
        streamId,
        'Unstable network detected — scoring event cached locally for sync.'
      );
      this.scheduleRetry();
      await this.notifyStream(streamId);
      return { synced: false, queued: true, score: currentScore, queueItem };
    }
  }

  async syncStream(
    streamId: string,
    options?: {
      forceOverride?: boolean;
      onScoreSynced?: (score: LiveScoreData) => void;
    }
  ): Promise<{ syncedCount: number; remainingCount: number; latestScore: LiveScoreData | null }> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const items = await offlineScoreQueue.listByStream(streamId);
      return { syncedCount: 0, remainingCount: items.length, latestScore: null };
    }
    if (this.syncingStreams.has(streamId)) {
      const items = await offlineScoreQueue.listByStream(streamId);
      return { syncedCount: 0, remainingCount: items.length, latestScore: null };
    }

    const items = await offlineScoreQueue.listByStream(streamId);
    if (items.length === 0) {
      return { syncedCount: 0, remainingCount: 0, latestScore: null };
    }

    this.syncingStreams.add(streamId);
    await this.notifyStream(streamId);

    let syncedCount = 0;
    let latestScore: LiveScoreData | null = null;
    let hadTransientFailure = false;

    try {
      let serverScore: LiveScoreData | null = null;
      try {
        serverScore = await scoreboardService.getScore(streamId);
      } catch (err) {
        if (isUnstableNetworkError(err)) {
          this.scheduleRetry();
          return { syncedCount: 0, remainingCount: items.length, latestScore: null };
        }
        serverScore = null;
      }

      for (const item of items) {
        if (item.status === 'CONFLICT' && !options?.forceOverride) {
          continue;
        }

        if (
          !options?.forceOverride &&
          serverScore?.lastUpdatedAt &&
          item.expectedUpdatedAt &&
          new Date(serverScore.lastUpdatedAt).getTime() >
            new Date(item.expectedUpdatedAt).getTime() + 1000
        ) {
          await offlineScoreQueue.updateItem(item.id, {
            status: 'CONFLICT',
            errorMessage:
              'Server scoreboard was updated by another session while offline. Choose Apply Anyway or Discard.',
          });
          continue;
        }

        try {
          await offlineScoreQueue.updateItem(item.id, {
            status: 'SYNCING',
            lastAttemptAt: new Date().toISOString(),
          });
          await this.notifyStream(streamId);

          if (item.kind === 'event') {
            const payload = item.payload as unknown as StructuredScoreEventInput;
            const res = await scoreboardService.recordScoreEvent(streamId, {
              ...payload,
              clientEventId: payload.clientEventId || item.id,
            });
            serverScore = res.score;
            latestScore = res.score;
          } else {
            const res = await scoreboardService.updateScore(
              streamId,
              item.payload as unknown as ScorePatchInput
            );
            serverScore = res.score;
            latestScore = res.score;
          }

          await offlineScoreQueue.remove(item.id);
          syncedCount += 1;
          this.lastSyncedByStream.set(streamId, new Date().toLocaleTimeString());
          this.lastErrorByStream.set(streamId, null);

          if (latestScore) {
            options?.onScoreSynced?.(latestScore);
            this.scoreUpdateCallbacks.get(streamId)?.forEach((cb) => cb(latestScore!));
          }
        } catch (err) {
          if (isUnstableNetworkError(err)) {
            hadTransientFailure = true;
            await offlineScoreQueue.updateItem(item.id, {
              status: 'PENDING',
              retryCount: (item.retryCount || 0) + 1,
              lastAttemptAt: new Date().toISOString(),
              errorMessage: 'Connection unstable — waiting to retry sync automatically.',
            });
            this.lastErrorByStream.set(
              streamId,
              'Network unstable during sync — will retry automatically.'
            );
            this.scheduleRetry();
            break;
          }

          const msg = extractApiError(err, 'Server rejected queued update');
          await offlineScoreQueue.updateItem(item.id, {
            status: 'CONFLICT',
            lastAttemptAt: new Date().toISOString(),
            errorMessage: msg,
          });
        }
      }
    } finally {
      this.syncingStreams.delete(streamId);
      const remaining = await offlineScoreQueue.listByStream(streamId);
      const hasPending = remaining.some((r) => r.status === 'PENDING');
      if (!hasPending && !hadTransientFailure) {
        this.clearRetryTimer();
      }
      await this.notifyStream(streamId);
    }

    const finalRemaining = await offlineScoreQueue.listByStream(streamId);
    return {
      syncedCount,
      remainingCount: finalRemaining.length,
      latestScore,
    };
  }

  async syncAll(options?: { forceOverride?: boolean }): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const allItems = await offlineScoreQueue.listAll();
    const pendingStreamIds = Array.from(
      new Set(
        allItems
          .filter((item) => options?.forceOverride || item.status !== 'CONFLICT')
          .map((item) => item.streamId)
      )
    );
    if (pendingStreamIds.length === 0) {
      this.clearRetryTimer();
      return;
    }
    for (const sid of pendingStreamIds) {
      await this.syncStream(sid, options);
    }
  }
}

export const offlineScoreService = new OfflineScoreService();
