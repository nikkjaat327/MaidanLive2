import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

export interface ScoreDiagTraceServer {
  traceId?: string;
  serverReceivedAtMs?: number;
  dbMs?: number;
  totalServerMs?: number;
  socketEmittedAtMs?: number;
}

export interface DiagTraceEntry {
  traceId: string;
  action: string;
  clickAtMs: number;
  uiOptimisticMs: number | null;
  apiLatencyMs: number | null;
  serverDbMs: number | null;
  serverTotalMs: number | null;
  socketDeliveryMs: number | null;
  obsDeliveryMs: number | null;
  endToEndMs: number | null;
  transport: string;
  status: 'pending' | 'synced' | 'queued' | 'error';
  errorText?: string;
}

export interface RealtimeDiagSnapshot {
  deepTracingEnabled: boolean;
  socketConnected: boolean;
  transport: string;
  reconnectCount: number;
  lastPingRttMs: number | null;
  lastApiLatencyMs: number | null;
  lastServerDbMs: number | null;
  lastSocketDeliveryMs: number | null;
  lastObsDeliveryMs: number | null;
  lastEndToEndMs: number | null;
  traces: DiagTraceEntry[];
}

const DIAG_STORAGE_KEY = 'maidanlive_diag';
const MAX_TRACES = 25;

let deepTracingEnabled = false;
try {
  deepTracingEnabled =
    typeof window !== 'undefined' && window.localStorage.getItem(DIAG_STORAGE_KEY) === '1';
} catch {
  deepTracingEnabled = false;
}

const state: RealtimeDiagSnapshot = {
  deepTracingEnabled,
  socketConnected: false,
  transport: 'unknown',
  reconnectCount: 0,
  lastPingRttMs: null,
  lastApiLatencyMs: null,
  lastServerDbMs: null,
  lastSocketDeliveryMs: null,
  lastObsDeliveryMs: null,
  lastEndToEndMs: null,
  traces: [],
};

const listeners = new Set<(snap: RealtimeDiagSnapshot) => void>();

function notify() {
  const snap: RealtimeDiagSnapshot = {
    ...state,
    traces: [...state.traces],
  };
  listeners.forEach((fn) => fn(snap));
}

export function isDeepTracingEnabled(): boolean {
  return state.deepTracingEnabled;
}

export function setDeepTracingEnabled(enabled: boolean): void {
  state.deepTracingEnabled = enabled;
  try {
    if (typeof window !== 'undefined') {
      if (enabled) window.localStorage.setItem(DIAG_STORAGE_KEY, '1');
      else window.localStorage.removeItem(DIAG_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
  notify();
}

export function getDiagRequestHeaders(traceId?: string): Record<string, string> {
  if (!state.deepTracingEnabled && !traceId) return {};
  return {
    ...(state.deepTracingEnabled ? { 'x-maidan-diag': '1' } : {}),
    ...(traceId ? { 'x-maidan-trace-id': traceId } : {}),
  };
}

export function updateSocketDiagState(partial: {
  socketConnected?: boolean;
  transport?: string;
  incrementReconnect?: boolean;
}) {
  if (typeof partial.socketConnected === 'boolean') {
    state.socketConnected = partial.socketConnected;
  }
  if (partial.transport) {
    state.transport = partial.transport;
  }
  if (partial.incrementReconnect) {
    state.reconnectCount += 1;
  }
  notify();
}

export function startScoreTrace(traceId: string, action: string, clickAtMs = Date.now()): void {
  const existing = state.traces.find((t) => t.traceId === traceId);
  if (existing) return;
  const entry: DiagTraceEntry = {
    traceId,
    action,
    clickAtMs,
    uiOptimisticMs: Math.max(0, Date.now() - clickAtMs),
    apiLatencyMs: null,
    serverDbMs: null,
    serverTotalMs: null,
    socketDeliveryMs: null,
    obsDeliveryMs: null,
    endToEndMs: null,
    transport: state.transport,
    status: 'pending',
  };
  state.traces = [entry, ...state.traces].slice(0, MAX_TRACES);
  notify();
}

export function completeScoreTraceApi(
  traceId: string,
  params: {
    status: 'synced' | 'queued' | 'error';
    apiStartAtMs: number;
    diag?: ScoreDiagTraceServer;
    errorText?: string;
  }
): void {
  const now = Date.now();
  const apiLatencyMs = Math.max(0, now - params.apiStartAtMs);
  state.lastApiLatencyMs = apiLatencyMs;
  if (typeof params.diag?.dbMs === 'number') {
    state.lastServerDbMs = params.diag.dbMs;
  }

  const idx = state.traces.findIndex((t) => t.traceId === traceId);
  if (idx >= 0) {
    const cur = state.traces[idx];
    const updated: DiagTraceEntry = {
      ...cur,
      status: params.status,
      apiLatencyMs,
      serverDbMs: params.diag?.dbMs ?? cur.serverDbMs,
      serverTotalMs: params.diag?.totalServerMs ?? cur.serverTotalMs,
      endToEndMs: Math.max(0, now - cur.clickAtMs),
      errorText: params.errorText,
    };
    state.lastEndToEndMs = updated.endToEndMs;
    state.traces = [...state.traces.slice(0, idx), updated, ...state.traces.slice(idx + 1)];
  }
  notify();
}

export function recordSocketDiagEvent(
  payload: { diag?: ScoreDiagTraceServer; emittedAt?: string } | undefined,
  role: 'client' | 'obs' = 'client'
): void {
  if (!payload) return;
  const now = Date.now();
  const emittedAtMs =
    typeof payload.diag?.socketEmittedAtMs === 'number'
      ? payload.diag.socketEmittedAtMs
      : payload.emittedAt
        ? Date.parse(payload.emittedAt)
        : NaN;
  const deliveryMs = Number.isFinite(emittedAtMs) ? Math.max(0, now - emittedAtMs) : null;

  if (deliveryMs !== null) {
    if (role === 'obs') {
      state.lastObsDeliveryMs = deliveryMs;
    } else {
      state.lastSocketDeliveryMs = deliveryMs;
    }
  }
  if (typeof payload.diag?.dbMs === 'number') {
    state.lastServerDbMs = payload.diag.dbMs;
  }

  const traceId = payload.diag?.traceId;
  if (traceId) {
    const idx = state.traces.findIndex((t) => t.traceId === traceId);
    if (idx >= 0) {
      const cur = state.traces[idx];
      const next: DiagTraceEntry = {
        ...cur,
        serverDbMs: payload.diag?.dbMs ?? cur.serverDbMs,
        serverTotalMs: payload.diag?.totalServerMs ?? cur.serverTotalMs,
        socketDeliveryMs: role === 'client' && deliveryMs !== null ? deliveryMs : cur.socketDeliveryMs,
        obsDeliveryMs: role === 'obs' && deliveryMs !== null ? deliveryMs : cur.obsDeliveryMs,
        endToEndMs: Math.max(0, now - cur.clickAtMs),
      };
      state.lastEndToEndMs = next.endToEndMs;
      state.traces = [...state.traces.slice(0, idx), next, ...state.traces.slice(idx + 1)];
    }
  }
  notify();
}

export function measureSocketRtt(socket: Socket): Promise<{ rttMs: number; transport: string }> {
  return new Promise((resolve, reject) => {
    if (!socket.connected) {
      reject(new Error('Socket disconnected'));
      return;
    }
    const sentAt = Date.now();
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Ping timed out'));
      }
    }, 4000);

    socket.emit(
      'diag:ping',
      { clientSentAtMs: sentAt },
      (ack?: { ok?: boolean; transport?: string }) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        const rttMs = Math.max(0, Date.now() - sentAt);
        const transport = ack?.transport || state.transport || 'unknown';
        state.lastPingRttMs = rttMs;
        if (transport && transport !== 'unknown') {
          state.transport = transport;
        }
        notify();
        resolve({ rttMs, transport });
      }
    );
  });
}

export function clearDiagTraces(): void {
  state.traces = [];
  notify();
}

export function useRealtimeDiagnostics(): RealtimeDiagSnapshot {
  const [snap, setSnap] = useState<RealtimeDiagSnapshot>(() => ({
    ...state,
    traces: [...state.traces],
  }));

  useEffect(() => {
    const listener = (next: RealtimeDiagSnapshot) => setSnap(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return snap;
}
