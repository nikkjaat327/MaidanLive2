import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import mongoose from 'mongoose';
import {
  coerceDocFieldsForMongo,
  getSchemaMetaForCollection,
} from '../utils/mongoNormalize.ts';

let sqliteDb: DatabaseSync | null = null;
let resolvedDbPath = '/data/maidanlive.db';

const KNOWN_COLLECTIONS = [
  'users',
  'usersessions',
  'roleassignments',
  'securitypolicies',
  'livestreams',
  'livescores',
  'scorehistories',
  'tournaments',
  'tournamentregistrations',
  'teams',
  'players',
  'fixtures',
  'playermatchstats',
  'matchhighlights',
  'chatmessages',
  'polls',
  'notifications',
  'venues',
  'sponsors',
  'sponsoroverlays',
  'matchreports',
  'viewermetrics',
  'activitylogs',
  'subscriptionplans',
  'organizersubscriptions',
  'revenuerecords',
  'tournamenttemplates',
  'storedfiles',
  'obscontrollerprofiles',
  'broadcastcameras',
  'broadcastscenes',
  'broadcastauditlogs',
];

export function resolveSqliteDbPath(): string {
  const configured = process.env.SQLITE_DB_PATH?.trim();
  const candidates = configured
    ? [configured]
    : ['/data/maidanlive.db', path.resolve(process.cwd(), 'data', 'maidanlive.db')];

  for (const candidate of candidates) {
    try {
      const dir = path.dirname(candidate);
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return candidate;
    } catch {
      // Try next candidate
    }
  }
  return path.resolve(process.cwd(), '.data', 'maidanlive.db');
}

export function getSqliteDb(): DatabaseSync {
  if (!sqliteDb) {
    resolvedDbPath = resolveSqliteDbPath();
    fs.mkdirSync(path.dirname(resolvedDbPath), { recursive: true });
    sqliteDb = new DatabaseSync(resolvedDbPath);
    sqliteDb.exec('PRAGMA journal_mode = WAL;');
    sqliteDb.exec('PRAGMA busy_timeout = 5000;');

    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      );
      CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection);
      CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(collection, updated_at);

      CREATE TABLE IF NOT EXISTS db_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    const now = new Date().toISOString();
    sqliteDb
      .prepare('INSERT OR IGNORE INTO db_meta (key, value) VALUES (?, ?)')
      .run('initialized_at', now);
  }
  return sqliteDb;
}

export function getSqliteFilePath(): string {
  return resolvedDbPath;
}

export function closeSqliteDb(): void {
  if (sqliteDb) {
    try {
      sqliteDb.close();
    } catch {
      // Ignore close error
    }
    sqliteDb = null;
  }
}

export function generateIdString(): string {
  return new mongoose.Types.ObjectId().toString();
}

function getByPath(obj: any, dotPath: string): any {
  if (!obj || typeof obj !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, dotPath)) return obj[dotPath];
  const parts = dotPath.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

function setByPath(obj: any, dotPath: string, value: any): void {
  const parts = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!cur[key] || typeof cur[key] !== 'object' || Array.isArray(cur[key])) {
      cur[key] = {};
    }
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}

function deleteByPath(obj: any, dotPath: string): void {
  const parts = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!cur || typeof cur !== 'object') return;
    cur = cur[key];
  }
  if (cur && typeof cur === 'object') {
    delete cur[parts[parts.length - 1]];
  }
}

function normalizeComparable(val: any): any {
  if (val instanceof Date) return val.getTime();
  if (val && typeof val === 'object' && typeof val.toHexString === 'function') {
    return val.toHexString();
  }
  if (val && typeof val === 'object' && val._id && !Array.isArray(val)) {
    return String(val._id);
  }
  return val;
}

function isPlainConditionObject(v: any): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v) || v instanceof Date || v instanceof RegExp) {
    return false;
  }
  if (typeof v.toHexString === 'function') return false;
  return Object.keys(v).some((k) => k.startsWith('$'));
}

function matchScalar(actual: any, expected: any): boolean {
  const normExpected = normalizeComparable(expected);

  if (expected instanceof RegExp) {
    if (Array.isArray(actual)) return actual.some((item) => expected.test(String(item)));
    return actual != null && expected.test(String(actual));
  }

  if (isPlainConditionObject(expected)) {
    for (const [op, opVal] of Object.entries(expected)) {
      if (op === '$ne') {
        const cmp = normalizeComparable(opVal);
        if (Array.isArray(actual)) {
          if (actual.some((a) => normalizeComparable(a) === cmp)) return false;
        } else if (normalizeComparable(actual) === cmp) {
          return false;
        }
      } else if (op === '$in') {
        const list = Array.isArray(opVal) ? opVal.map(normalizeComparable) : [];
        if (Array.isArray(actual)) {
          if (!actual.some((a) => list.includes(normalizeComparable(a)))) return false;
        } else if (!list.includes(normalizeComparable(actual))) {
          return false;
        }
      } else if (op === '$nin') {
        const list = Array.isArray(opVal) ? opVal.map(normalizeComparable) : [];
        if (Array.isArray(actual)) {
          if (actual.some((a) => list.includes(normalizeComparable(a)))) return false;
        } else if (list.includes(normalizeComparable(actual))) {
          return false;
        }
      } else if (op === '$exists') {
        const exists = actual !== undefined;
        if (Boolean(opVal) !== exists) return false;
      } else if (op === '$gt' || op === '$gte' || op === '$lt' || op === '$lte') {
        if (actual == null) return false;
        const aVal = actual instanceof Date ? actual.getTime() : typeof actual === 'string' && !Number.isNaN(Date.parse(actual)) && opVal instanceof Date ? Date.parse(actual) : actual;
        const bVal = normalizeComparable(opVal);
        if (op === '$gt' && !(aVal > bVal)) return false;
        if (op === '$gte' && !(aVal >= bVal)) return false;
        if (op === '$lt' && !(aVal < bVal)) return false;
        if (op === '$lte' && !(aVal <= bVal)) return false;
      } else if (op === '$regex') {
        const flags = typeof expected.$options === 'string' ? expected.$options : 'i';
        const rx = opVal instanceof RegExp ? opVal : new RegExp(String(opVal), flags);
        if (actual == null || !rx.test(String(actual))) return false;
      }
    }
    return true;
  }

  if (Array.isArray(actual)) {
    return actual.some((item) => normalizeComparable(item) === normExpected);
  }

  if (actual instanceof Date || (typeof actual === 'string' && expected instanceof Date)) {
    const aMs = actual instanceof Date ? actual.getTime() : Date.parse(actual);
    const eMs = expected instanceof Date ? expected.getTime() : Date.parse(String(expected));
    return aMs === eMs;
  }

  return normalizeComparable(actual) === normExpected;
}

export function matchesMongoQuery(doc: any, query: Record<string, any> = {}): boolean {
  if (!query || Object.keys(query).length === 0) return true;

  for (const [key, value] of Object.entries(query)) {
    if (key === '$or') {
      if (!Array.isArray(value) || value.length === 0) continue;
      const anyMatched = value.some((sub) => matchesMongoQuery(doc, sub));
      if (!anyMatched) return false;
      continue;
    }
    if (key === '$and') {
      if (!Array.isArray(value)) continue;
      const allMatched = value.every((sub) => matchesMongoQuery(doc, sub));
      if (!allMatched) return false;
      continue;
    }
    if (key === '$nor') {
      if (!Array.isArray(value)) continue;
      if (value.some((sub) => matchesMongoQuery(doc, sub))) return false;
      continue;
    }

    const actual = getByPath(doc, key);
    if (!matchScalar(actual, value)) return false;
  }

  return true;
}

export function applyMongoUpdate(doc: any, update: Record<string, any>, isInsert = false): any {
  const clone = JSON.parse(JSON.stringify(doc));
  const hasOperators = Object.keys(update).some((k) => k.startsWith('$'));

  if (!hasOperators) {
    for (const [k, v] of Object.entries(update)) {
      if (k !== '_id') setByPath(clone, k, serializePlainValue(v));
    }
    clone.updatedAt = new Date().toISOString();
    return clone;
  }

  if (isInsert && update.$setOnInsert && typeof update.$setOnInsert === 'object') {
    for (const [k, v] of Object.entries(update.$setOnInsert)) {
      setByPath(clone, k, serializePlainValue(v));
    }
  }

  if (update.$set && typeof update.$set === 'object') {
    for (const [k, v] of Object.entries(update.$set)) {
      setByPath(clone, k, serializePlainValue(v));
    }
  }

  if (update.$unset && typeof update.$unset === 'object') {
    for (const k of Object.keys(update.$unset)) {
      deleteByPath(clone, k);
    }
  }

  if (update.$inc && typeof update.$inc === 'object') {
    for (const [k, delta] of Object.entries(update.$inc)) {
      const current = Number(getByPath(clone, k) || 0);
      setByPath(clone, k, current + Number(delta || 0));
    }
  }

  if (update.$push && typeof update.$push === 'object') {
    for (const [k, val] of Object.entries(update.$push)) {
      const arr = Array.isArray(getByPath(clone, k)) ? [...getByPath(clone, k)] : [];
      if (val && typeof val === 'object' && Array.isArray((val as any).$each)) {
        arr.push(...(val as any).$each.map(serializePlainValue));
      } else {
        arr.push(serializePlainValue(val));
      }
      setByPath(clone, k, arr);
    }
  }

  if (update.$addToSet && typeof update.$addToSet === 'object') {
    for (const [k, val] of Object.entries(update.$addToSet)) {
      const arr = Array.isArray(getByPath(clone, k)) ? [...getByPath(clone, k)] : [];
      const items = val && typeof val === 'object' && Array.isArray((val as any).$each) ? (val as any).$each : [val];
      for (const item of items) {
        const serialized = serializePlainValue(item);
        if (!arr.some((x) => normalizeComparable(x) === normalizeComparable(serialized))) {
          arr.push(serialized);
        }
      }
      setByPath(clone, k, arr);
    }
  }

  if (update.$pull && typeof update.$pull === 'object') {
    for (const [k, val] of Object.entries(update.$pull)) {
      const arr = Array.isArray(getByPath(clone, k)) ? getByPath(clone, k) : [];
      const filtered = arr.filter((item: any) => !matchScalar(item, val));
      setByPath(clone, k, filtered);
    }
  }

  clone.updatedAt = new Date().toISOString();
  return clone;
}

export function serializePlainValue(val: any): any {
  if (val === undefined) return undefined;
  if (val === null) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object' && typeof val.toHexString === 'function') {
    return val.toHexString();
  }
  if (Array.isArray(val)) return val.map(serializePlainValue);
  if (typeof val === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (typeof v !== 'function' && v !== undefined) {
        out[k] = serializePlainValue(v);
      }
    }
    return out;
  }
  return val;
}

export function sqliteListAll(collection: string): any[] {
  const db = getSqliteDb();
  const rows = db
    .prepare('SELECT data FROM documents WHERE collection = ?')
    .all(collection) as Array<{ data: string }>;
  return rows.map((r) => JSON.parse(r.data));
}

export function sqliteFind(collection: string, query: Record<string, any> = {}): any[] {
  const all = sqliteListAll(collection);
  return all.filter((doc) => matchesMongoQuery(doc, query));
}

export function sqliteFindById(collection: string, id: string): any | null {
  if (!id) return null;
  const db = getSqliteDb();
  const row = db
    .prepare('SELECT data FROM documents WHERE collection = ? AND id = ?')
    .get(collection, String(id)) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : null;
}

export function sqliteUpsert(collection: string, doc: any): any {
  const db = getSqliteDb();
  const now = new Date().toISOString();
  const plain = serializePlainValue(doc);
  const id = String(plain._id || plain.id || generateIdString());
  plain._id = id;
  if (!plain.createdAt) plain.createdAt = now;
  plain.updatedAt = now;

  db.prepare(
    `INSERT INTO documents (collection, id, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  ).run(collection, id, JSON.stringify(plain), String(plain.createdAt), now);

  return plain;
}

export function sqliteDeleteById(collection: string, id: string): any | null {
  const existing = sqliteFindById(collection, id);
  if (!existing) return null;
  const db = getSqliteDb();
  db.prepare('DELETE FROM documents WHERE collection = ? AND id = ?').run(collection, String(id));
  return existing;
}

export function sqliteDeleteMany(collection: string, query: Record<string, any> = {}): number {
  const matches = sqliteFind(collection, query);
  if (matches.length === 0) return 0;
  const db = getSqliteDb();
  const stmt = db.prepare('DELETE FROM documents WHERE collection = ? AND id = ?');
  for (const m of matches) {
    stmt.run(collection, String(m._id));
  }
  return matches.length;
}

export function getSqliteCollectionStats(): Record<string, number> {
  const db = getSqliteDb();
  const rows = db
    .prepare('SELECT collection, COUNT(*) as cnt FROM documents GROUP BY collection')
    .all() as Array<{ collection: string; cnt: number }>;
  const counts: Record<string, number> = {};
  for (const col of KNOWN_COLLECTIONS) counts[col] = 0;
  for (const r of rows) {
    counts[r.collection] = Number(r.cnt || 0);
  }
  return counts;
}

export async function syncSqliteToMongo(): Promise<{ syncedCollections: number; syncedRecords: number }> {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return { syncedCollections: 0, syncedRecords: 0 };
  }
  const db = getSqliteDb();
  const rows = db
    .prepare('SELECT collection, id, data FROM documents')
    .all() as Array<{ collection: string; id: string; data: string }>;

  if (rows.length === 0) return { syncedCollections: 0, syncedRecords: 0 };

  const byCollection = new Map<string, Array<{ id: string; doc: any }>>();
  for (const row of rows) {
    const list = byCollection.get(row.collection) || [];
    list.push({ id: row.id, doc: JSON.parse(row.data) });
    byCollection.set(row.collection, list);
  }

  let syncedRecords = 0;
  for (const [colName, items] of byCollection.entries()) {
    const mongoCol = mongoose.connection.db.collection(colName);
    const meta = getSchemaMetaForCollection(colName);
    for (const { id, doc } of items) {
      const { _id: _omit, id: _omitId, ...rest } = doc;
      const isValidOid = mongoose.Types.ObjectId.isValid(id);
      const oid = isValidOid ? new mongoose.Types.ObjectId(id) : id;
      const cleanDoc = coerceDocFieldsForMongo(rest, meta);
      if (typeof cleanDoc.createdAt === 'string') cleanDoc.createdAt = new Date(cleanDoc.createdAt);
      if (typeof cleanDoc.updatedAt === 'string') cleanDoc.updatedAt = new Date(cleanDoc.updatedAt);

      if (isValidOid) {
        await mongoCol.deleteOne({ _id: id as any });
      }
      await mongoCol.updateOne(
        { _id: oid as any },
        { $setOnInsert: { _id: oid as any }, $set: cleanDoc },
        { upsert: true }
      );
      syncedRecords += 1;
    }
  }

  return { syncedCollections: byCollection.size, syncedRecords };
}
