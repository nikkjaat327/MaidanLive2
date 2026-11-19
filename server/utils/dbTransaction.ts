import mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';

/**
 * Runs an async operation inside a MongoDB transaction when connected to a replica set
 * or sharded cluster, and safely falls back to sequential execution on standalone mongod
 * (such as single-node MongoMemoryServer in development).
 */
export async function runWithOptionalTransaction<T>(
  work: (session: ClientSession | null) => Promise<T>
): Promise<T> {
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
