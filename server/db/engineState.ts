export type DatabaseEngine = 'mongodb' | 'sqlite';

interface EngineState {
  engine: DatabaseEngine;
  mongoConfigured: boolean;
  mongoConnected: boolean;
  lastMongoError: string | null;
  lastRetryAt: string | null;
  lastSyncSummary: {
    syncedCollections: number;
    syncedRecords: number;
    syncedAt: string;
  } | null;
}

const state: EngineState = {
  engine: 'sqlite',
  mongoConfigured: false,
  mongoConnected: false,
  lastMongoError: null,
  lastRetryAt: null,
  lastSyncSummary: null,
};

export function getActiveDbEngine(): DatabaseEngine {
  return state.engine;
}

export function setActiveDbEngine(engine: DatabaseEngine): void {
  state.engine = engine;
}

export function updateEngineDiagnostics(partial: Partial<EngineState>): void {
  Object.assign(state, partial);
}

export function getEngineDiagnostics(): EngineState {
  return { ...state };
}
