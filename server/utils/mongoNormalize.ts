import mongoose from 'mongoose';
import type { Model } from 'mongoose';
import { getActiveDbEngine } from '../db/engineState.ts';

interface SchemaPathMeta {
  objectIdFields: string[];
  objectIdArrayFields: string[];
  dateFields: string[];
}

function extractSchemaPathMeta(schema: mongoose.Schema): SchemaPathMeta {
  const objectIdFields: string[] = [];
  const objectIdArrayFields: string[] = [];
  const dateFields: string[] = [];

  for (const [pathName, schemaType] of Object.entries(schema.paths)) {
    if (pathName === '_id' || pathName === '__v' || pathName.includes('.')) continue;
    const st = schemaType as any;
    if (st.instance === 'ObjectId') {
      objectIdFields.push(pathName);
    } else if (st.instance === 'Array' && st.caster?.instance === 'ObjectId') {
      objectIdArrayFields.push(pathName);
    } else if (st.instance === 'Date') {
      dateFields.push(pathName);
    }
  }

  return { objectIdFields, objectIdArrayFields, dateFields };
}

export function coerceDocFieldsForMongo(
  doc: Record<string, any>,
  meta: SchemaPathMeta
): Record<string, any> {
  const out: Record<string, any> = { ...doc };

  for (const field of meta.objectIdFields) {
    const val = out[field];
    if (typeof val === 'string' && mongoose.Types.ObjectId.isValid(val)) {
      out[field] = new mongoose.Types.ObjectId(val);
    }
  }

  for (const field of meta.objectIdArrayFields) {
    const val = out[field];
    if (Array.isArray(val)) {
      out[field] = val.map((item) =>
        typeof item === 'string' && mongoose.Types.ObjectId.isValid(item)
          ? new mongoose.Types.ObjectId(item)
          : item
      );
    }
  }

  for (const field of meta.dateFields) {
    const val = out[field];
    if (typeof val === 'string' && val.trim()) {
      const parsed = new Date(val);
      if (!Number.isNaN(parsed.getTime())) {
        out[field] = parsed;
      }
    }
  }

  return out;
}

export function getSchemaMetaForCollection(collectionName: string): SchemaPathMeta {
  for (const model of Object.values(mongoose.models)) {
    if (model.collection?.collectionName === collectionName) {
      return extractSchemaPathMeta(model.schema);
    }
  }
  return { objectIdFields: [], objectIdArrayFields: [], dateFields: [] };
}

export async function normalizeAndDeduplicateMongoCollections(): Promise<{
  normalizedStringIds: number;
  deduplicatedDocs: number;
  normalizedRefs: number;
}> {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return { normalizedStringIds: 0, deduplicatedDocs: 0, normalizedRefs: 0 };
  }

  let normalizedStringIds = 0;
  let deduplicatedDocs = 0;
  let normalizedRefs = 0;

  const processedCollections = new Set<string>();

  for (const model of Object.values(mongoose.models)) {
    const colName = model.collection?.collectionName;
    if (!colName || processedCollections.has(colName)) continue;
    processedCollections.add(colName);

    const col = mongoose.connection.db.collection(colName);
    const meta = extractSchemaPathMeta(model.schema);

    try {
      // 1. Convert or deduplicate any documents whose _id was stored as a string
      const stringIdDocs = await col.find({ _id: { $type: 'string' } as any }).toArray();
      for (const rawDoc of stringIdDocs) {
        const strId = rawDoc._id;
        if (typeof strId !== 'string' || !mongoose.Types.ObjectId.isValid(strId)) continue;
        const oid = new mongoose.Types.ObjectId(strId);
        const existingOid = await col.findOne({ _id: oid });

        if (existingOid) {
          await col.deleteOne({ _id: strId } as any);
          deduplicatedDocs += 1;
        } else {
          const { _id: _omit, ...rest } = rawDoc;
          const coerced = coerceDocFieldsForMongo(rest, meta);
          await col.replaceOne({ _id: oid }, { _id: oid, ...coerced }, { upsert: true });
          await col.deleteOne({ _id: strId } as any);
          normalizedStringIds += 1;
        }
      }

      // 2. Coerce string-encoded ObjectId references & Date strings on existing ObjectId docs
      if (meta.objectIdFields.length > 0 || meta.objectIdArrayFields.length > 0) {
        const allDocs = await col.find({}).toArray();
        for (const doc of allDocs) {
          const updates: Record<string, any> = {};
          for (const field of meta.objectIdFields) {
            const val = doc[field];
            if (typeof val === 'string' && mongoose.Types.ObjectId.isValid(val)) {
              updates[field] = new mongoose.Types.ObjectId(val);
            }
          }
          for (const field of meta.objectIdArrayFields) {
            const val = doc[field];
            if (
              Array.isArray(val) &&
              val.some((item) => typeof item === 'string' && mongoose.Types.ObjectId.isValid(item))
            ) {
              updates[field] = val.map((item) =>
                typeof item === 'string' && mongoose.Types.ObjectId.isValid(item)
                  ? new mongoose.Types.ObjectId(item)
                  : item
              );
            }
          }
          for (const field of meta.dateFields) {
            const val = doc[field];
            if (typeof val === 'string' && val.trim()) {
              const parsed = new Date(val);
              if (!Number.isNaN(parsed.getTime())) {
                updates[field] = parsed;
              }
            }
          }
          if (Object.keys(updates).length > 0) {
            await col.updateOne({ _id: doc._id }, { $set: updates });
            normalizedRefs += 1;
          }
        }
      }
    } catch (err) {
      console.warn(`[DB Normalize] Warning on collection "${colName}":`, err);
    }
  }

  if (normalizedStringIds > 0 || deduplicatedDocs > 0 || normalizedRefs > 0) {
    console.log(
      `[DB Normalize] Normalized ${normalizedStringIds} string _ids, deduplicated ${deduplicatedDocs} duplicate docs, fixed ${normalizedRefs} ref docs.`
    );
  }

  return { normalizedStringIds, deduplicatedDocs, normalizedRefs };
}

export async function findDocByAnyId<T extends mongoose.Document>(
  model: Model<T>,
  id: string,
  options?: {
    select?: string;
    populate?: Array<{ path: string; select?: string }>;
    lean?: boolean;
  }
): Promise<any> {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;

  const runMongooseQuery = async () => {
    let q: any = model.findById(id);
    if (options?.select) q = q.select(options.select);
    if (options?.populate) {
      for (const pop of options.populate) {
        q = pop.select ? q.populate(pop.path, pop.select) : q.populate(pop.path);
      }
    }
    if (options?.lean) q = q.lean();
    return q;
  };

  const primary = await runMongooseQuery();
  if (primary) return primary;

  if (getActiveDbEngine() !== 'mongodb' || !mongoose.connection.db) {
    return null;
  }

  // Self-heal if a raw string-_id document still exists in MongoDB
  const rawDoc = await model.collection.findOne({ _id: id as any });
  if (!rawDoc) return null;

  const oid = new mongoose.Types.ObjectId(id);
  const meta = extractSchemaPathMeta(model.schema);
  const { _id: _omit, ...rest } = rawDoc as Record<string, any>;
  const coerced = coerceDocFieldsForMongo(rest, meta);
  const existingOid = await model.collection.findOne({ _id: oid });
  if (!existingOid) {
    await model.collection.replaceOne({ _id: oid }, { _id: oid, ...coerced }, { upsert: true });
  }
  await model.collection.deleteOne({ _id: id as any });

  return runMongooseQuery();
}

export async function deleteDocByAnyId<T extends mongoose.Document>(
  model: Model<T>,
  id: string
): Promise<any | null> {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;

  if (getActiveDbEngine() === 'sqlite') {
    return model.findByIdAndDelete(id);
  }

  const oid = new mongoose.Types.ObjectId(id);
  const existing = await model.collection.findOne({
    _id: { $in: [oid, id] } as any,
  });
  if (!existing) return null;

  await model.collection.deleteMany({
    _id: { $in: [oid, id] } as any,
  });

  return existing;
}

export function buildIdMatchFilter(id: string): any {
  if (getActiveDbEngine() === 'sqlite' || !mongoose.Types.ObjectId.isValid(id)) {
    return id;
  }
  return { $in: [new mongoose.Types.ObjectId(id), id] };
}
