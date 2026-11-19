import mongoose from 'mongoose';
import type { Model } from 'mongoose';
import { getActiveDbEngine } from '../db/engineState.ts';
import {
  applyMongoUpdate,
  generateIdString,
  serializePlainValue,
  sqliteDeleteById,
  sqliteDeleteMany,
  sqliteFind,
  sqliteFindById,
  sqliteUpsert,
} from '../db/sqliteStore.ts';

export interface QueryOptions {
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
}

export interface IDataRepository<T extends Record<string, any>> {
  findMany(filter?: Record<string, any>, options?: QueryOptions): Promise<T[]>;
  findOne(filter: Record<string, any>): Promise<T | null>;
  findById(id: string): Promise<T | null>;
  create(data: Partial<T>): Promise<T>;
  updateById(id: string, update: Record<string, any>): Promise<T | null>;
  deleteById(id: string): Promise<boolean>;
  deleteMany(filter: Record<string, any>): Promise<number>;
  count(filter?: Record<string, any>): Promise<number>;
}

export class MongoRepository<T extends Record<string, any>> implements IDataRepository<T> {
  private model: Model<any>;
  constructor(model: Model<any>) {
    this.model = model;
  }

  async findMany(filter: Record<string, any> = {}, options: QueryOptions = {}): Promise<T[]> {
    let q = this.model.find(filter);
    if (options.sort) q = q.sort(options.sort);
    if (options.skip) q = q.skip(options.skip);
    if (options.limit) q = q.limit(options.limit);
    const docs = await q.lean();
    return docs.map((d: any) => ({ ...d, id: String(d._id) }));
  }

  async findOne(filter: Record<string, any>): Promise<T | null> {
    const doc: any = await this.model.findOne(filter).lean();
    return doc ? { ...doc, id: String(doc._id) } : null;
  }

  async findById(id: string): Promise<T | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const doc: any = await this.model.findById(id).lean();
    return doc ? { ...doc, id: String(doc._id) } : null;
  }

  async create(data: Partial<T>): Promise<T> {
    const created: any = await this.model.create(data);
    const obj = created.toObject ? created.toObject() : created;
    return { ...obj, id: String(obj._id) };
  }

  async updateById(id: string, update: Record<string, any>): Promise<T | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const updated: any = await this.model.findByIdAndUpdate(id, update, { new: true }).lean();
    return updated ? { ...updated, id: String(updated._id) } : null;
  }

  async deleteById(id: string): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(id)) return false;
    const deleted = await this.model.findByIdAndDelete(id);
    return Boolean(deleted);
  }

  async deleteMany(filter: Record<string, any>): Promise<number> {
    const res = await this.model.deleteMany(filter);
    return res.deletedCount || 0;
  }

  async count(filter: Record<string, any> = {}): Promise<number> {
    return this.model.countDocuments(filter);
  }
}

export class SqliteRepository<T extends Record<string, any>> implements IDataRepository<T> {
  private collection: string;
  constructor(collection: string) {
    this.collection = collection;
  }

  async findMany(filter: Record<string, any> = {}, options: QueryOptions = {}): Promise<T[]> {
    let rows = sqliteFind(this.collection, filter);
    if (options.sort) {
      const entries = Object.entries(options.sort);
      rows = [...rows].sort((a, b) => {
        for (const [k, dir] of entries) {
          if (a[k] === b[k]) continue;
          if (a[k] == null) return 1 * dir;
          if (b[k] == null) return -1 * dir;
          return (a[k] < b[k] ? -1 : 1) * dir;
        }
        return 0;
      });
    }
    if (options.skip) rows = rows.slice(options.skip);
    if (options.limit) rows = rows.slice(0, options.limit);
    return rows.map((d) => ({ ...d, id: String(d._id) }));
  }

  async findOne(filter: Record<string, any>): Promise<T | null> {
    const found = sqliteFind(this.collection, filter)[0];
    return found ? { ...found, id: String(found._id) } : null;
  }

  async findById(id: string): Promise<T | null> {
    const found = sqliteFindById(this.collection, id);
    return found ? { ...found, id: String(found._id) } : null;
  }

  async create(data: Partial<T>): Promise<T> {
    const plain = serializePlainValue(data);
    if (!plain._id) plain._id = generateIdString();
    const saved = sqliteUpsert(this.collection, plain);
    return { ...saved, id: String(saved._id) };
  }

  async updateById(id: string, update: Record<string, any>): Promise<T | null> {
    const existing = sqliteFindById(this.collection, id);
    if (!existing) return null;
    const updated = applyMongoUpdate(existing, update, false);
    const saved = sqliteUpsert(this.collection, updated);
    return { ...saved, id: String(saved._id) };
  }

  async deleteById(id: string): Promise<boolean> {
    const deleted = sqliteDeleteById(this.collection, id);
    return Boolean(deleted);
  }

  async deleteMany(filter: Record<string, any>): Promise<number> {
    return sqliteDeleteMany(this.collection, filter);
  }

  async count(filter: Record<string, any> = {}): Promise<number> {
    return sqliteFind(this.collection, filter).length;
  }
}

export function getRepository<T extends Record<string, any>>(
  collectionName: string,
  mongooseModel: Model<any>
): IDataRepository<T> {
  if (getActiveDbEngine() === 'mongodb') {
    return new MongoRepository<T>(mongooseModel);
  }
  return new SqliteRepository<T>(collectionName);
}
