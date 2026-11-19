import fs from 'fs';
import os from 'os';
import path from 'path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let memoryServer: MongoMemoryServer | null = null;
let isConnected = false;

function resolveEmbeddedDbDir(): string {
  const preferred = path.resolve(process.cwd(), '.data', 'mongodb');
  try {
    fs.mkdirSync(preferred, { recursive: true });
    return preferred;
  } catch {
    const fallback = path.join(os.tmpdir(), 'maidanlive-mongodb');
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

export async function connectDatabase(): Promise<{
  uri: string;
  mode: 'external' | 'embedded' | 'offline';
}> {
  if (isConnected && mongoose.connection.readyState === 1) {
    return {
      uri: process.env.MONGODB_URI || 'embedded-mongodb',
      mode: process.env.MONGODB_URI ? 'external' : 'embedded',
    };
  }

  const externalUri = process.env.MONGODB_URI?.trim();

  if (externalUri) {
    try {
      await mongoose.connect(externalUri, {
        serverSelectionTimeoutMS: 5000,
      });
      isConnected = true;
      console.log('[DB] Connected to external MongoDB');
      return { uri: externalUri, mode: 'external' };
    } catch (err) {
      console.warn(
        '[DB] External MongoDB unreachable — falling back to embedded MongoDB:',
        err instanceof Error ? err.message : err
      );
    }
  }

  const dbDir = resolveEmbeddedDbDir();

  try {
    memoryServer = await MongoMemoryServer.create({
      binary: {
        version: '7.0.14',
      },
      instance: {
        dbPath: dbDir,
        storageEngine: 'wiredTiger',
        dbName: 'maidanlive',
      },
    });

    const uri = memoryServer.getUri('maidanlive');
    await mongoose.connect(uri);
    isConnected = true;
    console.log(`[DB] Connected to persistent local MongoDB at ${dbDir}`);

    return { uri, mode: 'embedded' };
  } catch (err) {
    console.warn(
      '[DB] Persistent embedded MongoDB failed — retrying ephemeral instance:',
      err instanceof Error ? err.message : err
    );
  }

  try {
    memoryServer = await MongoMemoryServer.create({
      binary: {
        version: '7.0.14',
      },
      instance: {
        dbName: 'maidanlive',
      },
    });
    const uri = memoryServer.getUri('maidanlive');
    await mongoose.connect(uri);
    isConnected = true;
    console.log('[DB] Connected to ephemeral in-memory MongoDB');
    return { uri, mode: 'embedded' };
  } catch (err) {
    console.warn(
      '[DB] MongoDB unavailable — starting in offline fallback mode:',
      err instanceof Error ? err.message : err
    );
    mongoose.set('bufferCommands', false);
    return { uri: 'mock://offline', mode: 'offline' };
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
  isConnected = false;
}
