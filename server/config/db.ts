import mongoose from 'mongoose';
import {
  getActiveDbEngine,
  getEngineDiagnostics,
  setActiveDbEngine,
  updateEngineDiagnostics,
} from '../db/engineState.ts';
import {
  closeSqliteDb,
  getSqliteCollectionStats,
  getSqliteDb,
  getSqliteFilePath,
  syncSqliteToMongo,
} from '../db/sqliteStore.ts';
import { normalizeAndDeduplicateMongoCollections } from '../utils/mongoNormalize.ts';

mongoose.set('bufferCommands', false);

export async function connectDatabase(): Promise<{
  uri: string;
  mode: 'mongodb' | 'sqlite';
  sqlitePath: string;
}> {
  const externalUri = process.env.MONGODB_URI?.trim() || '';
  updateEngineDiagnostics({
    mongoConfigured: Boolean(externalUri),
    lastRetryAt: new Date().toISOString(),
  });

  // Always initialize SQLite store so fallback & diagnostics are immediately available
  getSqliteDb();
  const sqlitePath = getSqliteFilePath();

  if (externalUri) {
    try {
      await mongoose.connect(externalUri, {
        serverSelectionTimeoutMS: 6000,
        connectTimeoutMS: 8000,
        socketTimeoutMS: 20000,
        maxPoolSize: 20,
        minPoolSize: 4,
        maxIdleTimeMS: 60000,
        retryWrites: true,
        w: 'majority',
      });
      setActiveDbEngine('mongodb');
      updateEngineDiagnostics({
        engine: 'mongodb',
        mongoConnected: true,
        lastMongoError: null,
      });
      const syncResult = await syncSqliteToMongo();
      await normalizeAndDeduplicateMongoCollections();
      if (syncResult.syncedRecords > 0) {
        updateEngineDiagnostics({
          lastSyncSummary: {
            ...syncResult,
            syncedAt: new Date().toISOString(),
          },
        });
      }
      console.log('[DB] Connected to primary MongoDB');
      return { uri: externalUri, mode: 'mongodb', sqlitePath };
    } catch (err: any) {
      const message = err?.message || 'Unable to connect to MongoDB.';
      console.warn(`[DB] MongoDB unavailable (${message}); falling back to SQLite at ${sqlitePath}`);
      setActiveDbEngine('sqlite');
      updateEngineDiagnostics({
        engine: 'sqlite',
        mongoConnected: false,
        lastMongoError: message,
      });
      return { uri: sqlitePath, mode: 'sqlite', sqlitePath };
    }
  }

  setActiveDbEngine('sqlite');
  updateEngineDiagnostics({
    engine: 'sqlite',
    mongoConnected: false,
    lastMongoError: 'MONGODB_URI is not configured.',
  });
  console.log(`[DB] MONGODB_URI not set — running on SQLite fallback at ${sqlitePath}`);
  return { uri: sqlitePath, mode: 'sqlite', sqlitePath };
}

export async function retryMongoConnection(): Promise<{
  ok: boolean;
  engine: 'mongodb' | 'sqlite';
  message: string;
  syncedRecords: number;
  syncedCollections: number;
}> {
  const externalUri = process.env.MONGODB_URI?.trim() || '';
  updateEngineDiagnostics({
    mongoConfigured: Boolean(externalUri),
    lastRetryAt: new Date().toISOString(),
  });

  if (!externalUri) {
    return {
      ok: false,
      engine: getActiveDbEngine(),
      message: 'MONGODB_URI is not configured in environment variables.',
      syncedRecords: 0,
      syncedCollections: 0,
    };
  }

  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(externalUri, {
        serverSelectionTimeoutMS: 6000,
        connectTimeoutMS: 8000,
        socketTimeoutMS: 20000,
        maxPoolSize: 20,
        minPoolSize: 4,
        maxIdleTimeMS: 60000,
        retryWrites: true,
        w: 'majority',
      });
    }
    const syncResult = await syncSqliteToMongo();
    await normalizeAndDeduplicateMongoCollections();
    setActiveDbEngine('mongodb');
    updateEngineDiagnostics({
      engine: 'mongodb',
      mongoConnected: true,
      lastMongoError: null,
      lastSyncSummary: {
        ...syncResult,
        syncedAt: new Date().toISOString(),
      },
    });
    return {
      ok: true,
      engine: 'mongodb',
      message:
        syncResult.syncedRecords > 0
          ? `Connected to MongoDB and synced ${syncResult.syncedRecords} fallback records.`
          : 'Connected to MongoDB.',
      syncedRecords: syncResult.syncedRecords,
      syncedCollections: syncResult.syncedCollections,
    };
  } catch (err: any) {
    const message = err?.message || 'MongoDB connection failed.';
    setActiveDbEngine('sqlite');
    updateEngineDiagnostics({
      engine: 'sqlite',
      mongoConnected: false,
      lastMongoError: message,
    });
    return {
      ok: false,
      engine: 'sqlite',
      message: `MongoDB retry failed (${message}). Continuing on SQLite without data loss.`,
      syncedRecords: 0,
      syncedCollections: 0,
    };
  }
}

export function getDatabaseDiagnostics() {
  const diag = getEngineDiagnostics();
  const sqliteCounts = getSqliteCollectionStats();
  const totalSqliteRecords = Object.values(sqliteCounts).reduce((a, b) => a + b, 0);
  return {
    ...diag,
    mongoReadyState: mongoose.connection.readyState,
    sqlitePath: getSqliteFilePath(),
    sqliteCounts,
    totalSqliteRecords,
  };
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  closeSqliteDb();
  updateEngineDiagnostics({ mongoConnected: false });
}
