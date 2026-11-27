import type { Request } from 'express';

export interface ScoreDiagTrace {
  traceId: string;
  serverReceivedAtMs: number;
  dbMs: number;
  totalServerMs: number;
  socketEmittedAtMs: number;
}

export function buildInMemoryPopulatedHistory(
  historyDoc: any,
  user: { _id?: any; id?: any; name?: string; email?: string; role?: string } | null | undefined
): Record<string, any> | null {
  if (!historyDoc) return null;
  const plain =
    typeof historyDoc.toObject === 'function' ? historyDoc.toObject() : { ...historyDoc };
  const uid = user?._id || user?.id || plain.updatedBy;
  return {
    ...plain,
    updatedBy: uid
      ? {
          _id: uid,
          name: user?.name || user?.email || 'Admin',
          role: user?.role || 'ADMIN',
        }
      : plain.updatedBy || null,
  };
}

export function getRequestTraceId(req: Request): string {
  const headerTrace = req.headers['x-maidan-trace-id'];
  if (typeof headerTrace === 'string' && headerTrace.trim()) {
    return headerTrace.trim().slice(0, 100);
  }
  const bodyTrace = (req.body as any)?.traceId;
  if (typeof bodyTrace === 'string' && bodyTrace.trim()) {
    return bodyTrace.trim().slice(0, 100);
  }
  const clientEventId = (req.body as any)?.clientEventId;
  if (
    req.headers['x-maidan-diag'] === '1' &&
    typeof clientEventId === 'string' &&
    clientEventId.trim()
  ) {
    return clientEventId.trim().slice(0, 100);
  }
  return '';
}

export function buildDiagPayload(
  req: Request,
  serverReceivedAtMs: number,
  dbDoneAtMs: number
): ScoreDiagTrace | undefined {
  const traceId = getRequestTraceId(req);
  const diagEnabled = req.headers['x-maidan-diag'] === '1' || Boolean(traceId);
  if (!diagEnabled) return undefined;
  const now = Date.now();
  return {
    traceId: traceId || `srv_${now.toString(36)}`,
    serverReceivedAtMs,
    dbMs: Math.max(0, dbDoneAtMs - serverReceivedAtMs),
    totalServerMs: Math.max(0, now - serverReceivedAtMs),
    socketEmittedAtMs: now,
  };
}

export function runBackgroundTask(label: string, task: Promise<unknown>): void {
  task.catch((err) => {
    console.warn(`[BackgroundTask:${label}] Non-blocking warning:`, err?.message || err);
  });
}
