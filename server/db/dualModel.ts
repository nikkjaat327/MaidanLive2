import mongoose from 'mongoose';
import type { Model } from 'mongoose';
import { getActiveDbEngine } from './engineState.ts';
import {
  applyMongoUpdate,
  generateIdString,
  serializePlainValue,
  sqliteDeleteById,
  sqliteDeleteMany,
  sqliteFind,
  sqliteFindById,
  sqliteUpsert,
} from './sqliteStore.ts';

function refNameToCollection(refName: string): string {
  const map: Record<string, string> = {
    User: 'users',
    UserSession: 'usersessions',
    RoleAssignment: 'roleassignments',
    SecurityPolicy: 'securitypolicies',
    LiveStream: 'livestreams',
    LiveScore: 'livescores',
    ScoreHistory: 'scorehistories',
    Tournament: 'tournaments',
    TournamentRegistration: 'tournamentregistrations',
    Team: 'teams',
    Player: 'players',
    Fixture: 'fixtures',
    PlayerMatchStat: 'playermatchstats',
    MatchHighlight: 'matchhighlights',
    ChatMessage: 'chatmessages',
    Poll: 'polls',
    Notification: 'notifications',
    Venue: 'venues',
    Sponsor: 'sponsors',
    SponsorOverlay: 'sponsoroverlays',
    MatchReport: 'matchreports',
    ViewerMetric: 'viewermetrics',
    ActivityLog: 'activitylogs',
    SubscriptionPlan: 'subscriptionplans',
    OrganizerSubscription: 'organizersubscriptions',
    RevenueRecord: 'revenuerecords',
    TournamentTemplate: 'tournamenttemplates',
    StoredFile: 'storedfiles',
    ObsControllerProfile: 'obscontrollerprofiles',
    BroadcastCamera: 'broadcastcameras',
    BroadcastScene: 'broadcastscenes',
    BroadcastAuditLog: 'broadcastauditlogs',
    BroadcastAssignment: 'broadcastassignments',
  };
  return map[refName] || `${refName.toLowerCase()}s`;
}

function getSchemaDefaults(schema: mongoose.Schema): Record<string, any> {
  const defaults: Record<string, any> = {};
  for (const [pathName, schemaType] of Object.entries(schema.paths)) {
    if (pathName === '_id' || pathName === '__v') continue;
    const opts = (schemaType as any)?.options || {};
    if (opts.default !== undefined) {
      const val = typeof opts.default === 'function' ? opts.default() : opts.default;
      setNestedDefault(defaults, pathName, serializePlainValue(val));
    }
  }
  return defaults;
}

function setNestedDefault(target: Record<string, any>, dotPath: string, val: any) {
  const parts = dotPath.split('.');
  let cur = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  if (cur[parts[parts.length - 1]] === undefined) {
    cur[parts[parts.length - 1]] = val;
  }
}

function getHiddenSelectFields(schema: mongoose.Schema): string[] {
  const hidden: string[] = [];
  for (const [pathName, schemaType] of Object.entries(schema.paths)) {
    if ((schemaType as any)?.options?.select === false) {
      hidden.push(pathName);
    }
  }
  return hidden;
}

function applySelectProjection(doc: any, selectSpec: string | undefined, hiddenFields: string[]): any {
  const out = JSON.parse(JSON.stringify(doc));
  const tokens = (selectSpec || '')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const explicitlyIncluded = new Set<string>();
  const explicitlyExcluded = new Set<string>();
  const positiveFields = new Set<string>();

  for (const tok of tokens) {
    if (tok.startsWith('+')) explicitlyIncluded.add(tok.slice(1));
    else if (tok.startsWith('-')) explicitlyExcluded.add(tok.slice(1));
    else positiveFields.add(tok);
  }

  for (const hf of hiddenFields) {
    if (!explicitlyIncluded.has(hf) && !positiveFields.has(hf)) {
      delete out[hf];
    }
  }

  for (const ex of explicitlyExcluded) {
    delete out[ex];
  }

  if (positiveFields.size > 0) {
    const projected: Record<string, any> = { _id: out._id };
    for (const f of positiveFields) {
      if (out[f] !== undefined) projected[f] = out[f];
    }
    return projected;
  }

  return out;
}

function applySort(docs: any[], sortSpec: Record<string, 1 | -1> | string | undefined): any[] {
  if (!sortSpec) return docs;
  const entries: Array<[string, number]> =
    typeof sortSpec === 'string'
      ? sortSpec
          .split(/\s+/)
          .filter(Boolean)
          .map((t) => (t.startsWith('-') ? [t.slice(1), -1] : [t, 1]))
      : Object.entries(sortSpec);

  if (entries.length === 0) return docs;

  return [...docs].sort((a, b) => {
    for (const [field, dir] of entries) {
      const av = getNestedValue(a, field);
      const bv = getNestedValue(b, field);
      if (av === bv) continue;
      if (av == null) return 1 * dir;
      if (bv == null) return -1 * dir;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
    }
    return 0;
  });
}

function getNestedValue(obj: any, dotPath: string): any {
  const parts = dotPath.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

function wrapSqliteDoc(collectionName: string, rawDoc: any, schema: mongoose.Schema, isLean: boolean): any {
  if (!rawDoc) return null;
  const plain = JSON.parse(JSON.stringify(rawDoc));
  if (isLean) return plain;

  const instance: any = {
    ...plain,
    id: String(plain._id),
    toObject() {
      const copy: Record<string, any> = {};
      for (const [k, v] of Object.entries(this)) {
        if (typeof v !== 'function' && k !== 'id') {
          copy[k] = serializePlainValue(v);
        }
      }
      return copy;
    },
    toJSON() {
      return this.toObject();
    },
    markModified(_path: string) {
      // No-op in SQLite wrapper since full JSON document is persisted on save()
    },
    async save() {
      const toSave = this.toObject();
      // Preserve hidden fields like passwordHash if not loaded in select
      const existing = sqliteFindById(collectionName, String(toSave._id));
      if (existing) {
        for (const hf of getHiddenSelectFields(schema)) {
          if (toSave[hf] === undefined && existing[hf] !== undefined) {
            toSave[hf] = existing[hf];
          }
        }
      }
      const saved = sqliteUpsert(collectionName, toSave);
      Object.assign(this, saved);
      this.id = String(saved._id);
      return this;
    },
    async deleteOne() {
      sqliteDeleteById(collectionName, String(this._id));
      return { deletedCount: 1 };
    },
  };
  return instance;
}

function populateDocFields(
  doc: any,
  populates: Array<{ path: string; select?: string }>,
  schema: mongoose.Schema
): any {
  if (!doc || populates.length === 0) return doc;
  const out = { ...doc };
  for (const pop of populates) {
    const val = out[pop.path];
    if (!val) continue;
    const schemaPath = schema.paths[pop.path] as any;
    const refModel =
      schemaPath?.options?.ref ||
      schemaPath?.caster?.options?.ref ||
      (pop.path.endsWith('Id') ? pop.path.slice(0, -2).replace(/^[a-z]/, (c) => c.toUpperCase()) : '');
    if (!refModel) continue;
    const targetCol = refNameToCollection(refModel);

    const resolveId = (idVal: any) => {
      const idStr = typeof idVal === 'object' && idVal?._id ? String(idVal._id) : String(idVal);
      const found = sqliteFindById(targetCol, idStr);
      if (!found) return idVal;
      if (pop.select) {
        return applySelectProjection(found, pop.select, ['passwordHash']);
      }
      const cleaned = { ...found };
      delete cleaned.passwordHash;
      return cleaned;
    };

    if (Array.isArray(val)) {
      out[pop.path] = val.map(resolveId);
    } else {
      out[pop.path] = resolveId(val);
    }
  }
  return out;
}

class SqliteQuery {
  private collectionName: string;
  private schema: mongoose.Schema;
  private mode: 'find' | 'findOne' | 'findById' | 'countDocuments';
  private queryFilter: Record<string, any>;
  private targetId: string | null;
  private sortSpec: any = null;
  private limitNum: number | null = null;
  private skipNum = 0;
  private selectSpec = '';
  private isLean = false;
  private populates: Array<{ path: string; select?: string }> = [];

  constructor(
    collectionName: string,
    schema: mongoose.Schema,
    mode: 'find' | 'findOne' | 'findById' | 'countDocuments',
    queryFilter: Record<string, any> = {},
    targetId: string | null = null
  ) {
    this.collectionName = collectionName;
    this.schema = schema;
    this.mode = mode;
    this.queryFilter = queryFilter;
    this.targetId = targetId;
  }

  sort(spec: any) {
    this.sortSpec = spec;
    return this;
  }
  limit(n: number) {
    this.limitNum = n;
    return this;
  }
  skip(n: number) {
    this.skipNum = n;
    return this;
  }
  select(spec: string) {
    this.selectSpec = spec;
    return this;
  }
  lean(val = true) {
    this.isLean = val;
    return this;
  }
  session(_sess: any) {
    return this;
  }
  populate(pathOrObj: string | { path: string; select?: string }, select?: string) {
    if (typeof pathOrObj === 'string') {
      this.populates.push({ path: pathOrObj, select });
    } else if (pathOrObj && typeof pathOrObj === 'object') {
      this.populates.push({ path: pathOrObj.path, select: pathOrObj.select });
    }
    return this;
  }

  async exec(): Promise<any> {
    const hiddenFields = getHiddenSelectFields(this.schema);
    if (this.mode === 'countDocuments') {
      return sqliteFind(this.collectionName, this.queryFilter).length;
    }
    if (this.mode === 'findById') {
      const found = this.targetId ? sqliteFindById(this.collectionName, this.targetId) : null;
      if (!found) return null;
      const populated = populateDocFields(found, this.populates, this.schema);
      const projected = applySelectProjection(populated, this.selectSpec, hiddenFields);
      return wrapSqliteDoc(this.collectionName, projected, this.schema, this.isLean);
    }
    let list = sqliteFind(this.collectionName, this.queryFilter);
    list = applySort(list, this.sortSpec);
    if (this.mode === 'findOne') {
      const first = list[0];
      if (!first) return null;
      const populated = populateDocFields(first, this.populates, this.schema);
      const projected = applySelectProjection(populated, this.selectSpec, hiddenFields);
      return wrapSqliteDoc(this.collectionName, projected, this.schema, this.isLean);
    }
    if (this.skipNum > 0) list = list.slice(this.skipNum);
    if (this.limitNum !== null && this.limitNum >= 0) list = list.slice(0, this.limitNum);

    return list.map((item) => {
      const populated = populateDocFields(item, this.populates, this.schema);
      const projected = applySelectProjection(populated, this.selectSpec, hiddenFields);
      return wrapSqliteDoc(this.collectionName, projected, this.schema, this.isLean);
    });
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }
}

export function createDualModel<T extends mongoose.Document>(
  collectionName: string,
  mongooseModel: Model<T>
): Model<T> {
  const schema = mongooseModel.schema;

  const buildNewDocData = (input: Record<string, any>) => {
    const defaults = getSchemaDefaults(schema);
    const merged = {
      ...defaults,
      ...serializePlainValue(input),
    };
    if (!merged._id) merged._id = generateIdString();
    return merged;
  };

  const sqliteStatics: Record<string, any> = {
    find(query: Record<string, any> = {}) {
      return new SqliteQuery(collectionName, schema, 'find', query);
    },
    findOne(query: Record<string, any> = {}) {
      return new SqliteQuery(collectionName, schema, 'findOne', query);
    },
    findById(id: any) {
      return new SqliteQuery(collectionName, schema, 'findById', {}, id ? String(id) : null);
    },
    countDocuments(query: Record<string, any> = {}) {
      return new SqliteQuery(collectionName, schema, 'countDocuments', query);
    },
    async create(docsOrDoc: any, _options?: any) {
      if (Array.isArray(docsOrDoc)) {
        return docsOrDoc.map((d) => {
          const saved = sqliteUpsert(collectionName, buildNewDocData(d));
          return wrapSqliteDoc(collectionName, saved, schema, false);
        });
      }
      const saved = sqliteUpsert(collectionName, buildNewDocData(docsOrDoc));
      return wrapSqliteDoc(collectionName, saved, schema, false);
    },
    async insertMany(docs: any[]) {
      return docs.map((d) => {
        const saved = sqliteUpsert(collectionName, buildNewDocData(d));
        return wrapSqliteDoc(collectionName, saved, schema, false);
      });
    },
    findByIdAndUpdate(id: any, update: Record<string, any>, options: Record<string, any> = {}) {
      const existing = id ? sqliteFindById(collectionName, String(id)) : null;
      const populates: Array<{ path: string; select?: string }> = [];
      let leanFlag = Boolean(options.lean);

      const execUpdate = async () => {
        if (!existing && !options.upsert) return null;
        const base = existing || buildNewDocData({ _id: String(id) });
        const updated = applyMongoUpdate(base, update, !existing);
        const saved = sqliteUpsert(collectionName, updated);
        const populated = populateDocFields(saved, populates, schema);
        return wrapSqliteDoc(collectionName, populated, schema, leanFlag);
      };

      const chain: any = {
        populate(pathOrObj: any, select?: string) {
          if (typeof pathOrObj === 'string') populates.push({ path: pathOrObj, select });
          else if (pathOrObj?.path) populates.push({ path: pathOrObj.path, select: pathOrObj.select });
          return chain;
        },
        session: () => chain,
        lean: () => {
          leanFlag = true;
          return execUpdate();
        },
        then: (res: any, rej: any) => execUpdate().then(res, rej),
      };
      return chain;
    },
    findOneAndUpdate(
      query: Record<string, any>,
      update: Record<string, any>,
      options: Record<string, any> = {}
    ) {
      const populates: Array<{ path: string; select?: string }> = [];
      let leanFlag = Boolean(options.lean);

      const execUpdate = async () => {
        const matches = sqliteFind(collectionName, query);
        const existing = matches[0] || null;
        if (!existing && !options.upsert) return null;
        const base = existing || buildNewDocData(query);
        const updated = applyMongoUpdate(base, update, !existing);
        const saved = sqliteUpsert(collectionName, updated);
        const populated = populateDocFields(saved, populates, schema);
        return wrapSqliteDoc(collectionName, populated, schema, leanFlag);
      };

      const chain: any = {
        populate(pathOrObj: any, select?: string) {
          if (typeof pathOrObj === 'string') populates.push({ path: pathOrObj, select });
          else if (pathOrObj?.path) populates.push({ path: pathOrObj.path, select: pathOrObj.select });
          return chain;
        },
        session: () => chain,
        lean: () => {
          leanFlag = true;
          return execUpdate();
        },
        then: (res: any, rej: any) => execUpdate().then(res, rej),
      };
      return chain;
    },
    async updateOne(query: Record<string, any>, update: Record<string, any>, options: any = {}) {
      const matches = sqliteFind(collectionName, query);
      if (matches.length === 0) {
        if (options?.upsert) {
          const base = buildNewDocData(query);
          const updated = applyMongoUpdate(base, update, true);
          sqliteUpsert(collectionName, updated);
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
        }
        return { matchedCount: 0, modifiedCount: 0 };
      }
      const updated = applyMongoUpdate(matches[0], update, false);
      sqliteUpsert(collectionName, updated);
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async updateMany(query: Record<string, any>, update: Record<string, any>) {
      const matches = sqliteFind(collectionName, query);
      for (const m of matches) {
        const updated = applyMongoUpdate(m, update, false);
        sqliteUpsert(collectionName, updated);
      }
      return { matchedCount: matches.length, modifiedCount: matches.length };
    },
    findByIdAndDelete(id: any) {
      const deleted = id ? sqliteDeleteById(collectionName, String(id)) : null;
      return {
        session: () => Promise.resolve(deleted),
        then: (res: any, rej: any) => Promise.resolve(deleted).then(res, rej),
      };
    },
    async deleteOne(query: Record<string, any>) {
      const matches = sqliteFind(collectionName, query);
      if (matches.length === 0) return { deletedCount: 0 };
      sqliteDeleteById(collectionName, String(matches[0]._id));
      return { deletedCount: 1 };
    },
    async deleteMany(query: Record<string, any> = {}) {
      const count = sqliteDeleteMany(collectionName, query);
      return { deletedCount: count };
    },
  };

  const proxy = new Proxy(mongooseModel, {
    construct(target, args, newTarget) {
      if (getActiveDbEngine() === 'sqlite') {
        const data = buildNewDocData(args[0] || {});
        return wrapSqliteDoc(collectionName, data, schema, false);
      }
      return Reflect.construct(target, args, newTarget);
    },
    get(target, prop, receiver) {
      if (getActiveDbEngine() === 'sqlite' && typeof prop === 'string' && prop in sqliteStatics) {
        return sqliteStatics[prop];
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  return proxy;
}
