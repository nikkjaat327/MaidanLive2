export type OfflineQueueStatus = 'PENDING' | 'SYNCING' | 'CONFLICT';

export interface OfflineScoreQueueItem {
  id: string;
  streamId: string;
  deviceSessionId: string;
  sequence: number;
  timestamp: string;
  kind: 'patch' | 'event';
  actionLabel: string;
  payload: Record<string, unknown>;
  expectedUpdatedAt?: string | null;
  status: OfflineQueueStatus;
  errorMessage?: string;
  retryCount?: number;
  lastAttemptAt?: string;
}

const DB_NAME = 'MaidanLiveOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'scoreEvents';
const DEVICE_SESSION_KEY = 'maidanlive_scorer_session_id';

export function getScorerDeviceSessionId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_SESSION_KEY);
    if (existing) return existing;
    const created = `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(DEVICE_SESSION_KEY, created);
    return created;
  } catch {
    return `sc_${Date.now()}`;
  }
}

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('streamId', 'streamId', { unique: false });
        store.createIndex('sequence', 'sequence', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

export const offlineScoreQueue = {
  async listAll(): Promise<OfflineScoreQueueItem[]> {
    try {
      const db = await openOfflineDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const items = (req.result || []) as OfflineScoreQueueItem[];
          items.sort((a, b) => a.sequence - b.sequence);
          resolve(items);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  },

  async listByStream(streamId: string): Promise<OfflineScoreQueueItem[]> {
    try {
      const db = await openOfflineDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('streamId');
        const req = index.getAll(streamId);
        req.onsuccess = () => {
          const items = (req.result || []) as OfflineScoreQueueItem[];
          items.sort((a, b) => a.sequence - b.sequence);
          resolve(items);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  },

  async enqueue(
    item: Omit<
      OfflineScoreQueueItem,
      'id' | 'deviceSessionId' | 'sequence' | 'timestamp' | 'status'
    > & { id?: string }
  ): Promise<OfflineScoreQueueItem> {
    const existing = await this.listByStream(item.streamId);
    const maxSeq = existing.reduce((m, cur) => Math.max(m, cur.sequence), 0);
    const record: OfflineScoreQueueItem = {
      ...item,
      id: item.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      deviceSessionId: getScorerDeviceSessionId(),
      sequence: maxSeq + 1,
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      retryCount: item.retryCount ?? 0,
    };
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return record;
  },

  async updateItem(
    id: string,
    updates: Partial<
      Pick<OfflineScoreQueueItem, 'status' | 'errorMessage' | 'retryCount' | 'lastAttemptAt'>
    >
  ): Promise<void> {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const cur = getReq.result as OfflineScoreQueueItem | undefined;
        if (cur) {
          store.put({ ...cur, ...updates });
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async remove(id: string): Promise<void> {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async clearStream(streamId: string): Promise<void> {
    const items = await this.listByStream(streamId);
    if (items.length === 0) return;
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const item of items) {
        store.delete(item.id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
