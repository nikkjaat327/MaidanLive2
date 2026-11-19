import mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';
import { getActiveDbEngine } from '../db/engineState.ts';
import { getSqliteDb } from '../db/sqliteStore.ts';

/**
 * Runs an async operation inside a MongoDB transaction when connected to a replica set,
 * or inside a SQLite BEGIN IMMEDIATE / COMMIT transaction when running on the SQLite fallback.
 */
export async function runWithOptionalTransaction<T>(
  work: (session: ClientSession | null) => Promise<T>
): Promise<T> {
  if (getActiveDbEngine() === 'sqlite') {
    const db = getSqliteDb();
    db.exec('BEGIN IMMEDIATE;');
    try {
      const result = await work(null);
      db.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // Ignore rollback error if transaction already closed
      }
      throw err;
    }
  }

  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (err: any) {
    const msg = typeof err?.message === 'string' ? err.message : '';
    const code = err?.code;
    const isUnsupportedStandalone =
      code === 20 ||
      msg.includes('Transaction numbers are only allowed on a replica set member or mongos') ||
      msg.includes('Transactions are not supported') ||
      msg.includes('does not support retryable writes');

    if (isUnsupportedStandalone) {
      return await work(null);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
