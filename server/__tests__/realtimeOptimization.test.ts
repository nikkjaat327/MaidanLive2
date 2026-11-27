import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maidanlive-realtime-opt-'));
const tmpSqlitePath = path.join(tmpDir, 'test.db');
process.env.SQLITE_DB_PATH = tmpSqlitePath;
delete process.env.MONGODB_URI;
process.env.JWT_SECRET = 'test_jwt_secret_for_realtime_optimization_12345';
process.env.OBS_SECRET_KEY = 'test_obs_secret_key_for_realtime_optimization_12345';
process.env.MAIDANLIVE_SERVER_URL = 'http://localhost:3000';

const { connectDatabase, disconnectDatabase } = await import('../config/db.ts');
const { initSocketServer, emitStreamEvent } = await import('../../backend/realtime/socket.ts');
const { User } = await import('../models/User.ts');
const { Team } = await import('../models/Team.ts');
const { LiveStream } = await import('../models/LiveStream.ts');
const { LiveScore } = await import('../models/LiveScore.ts');
const { signAuthToken } = await import('../middleware/auth.ts');
const scoreRoutes = (await import('../routes/scoreRoutes.ts')).default;
const liveStreamRoutes = (await import('../routes/liveStreamRoutes.ts')).default;
const entityRoutes = (await import('../routes/entityRoutes.ts')).default;
const {
  applyOptimisticPatch,
  applyOptimisticStructuredEvent,
  applyOptimisticKabaddiEngineEvent,
} = await import('../../src/utils/optimisticScore.ts');
const { createInitialCricketDetails } = await import('../../src/utils/cricketScoring.ts');
const { createInitialKabaddiDetails } = await import('../../src/utils/kabaddiScoring.ts');

let server: http.Server;
let baseUrl = '';
let adminToken = '';
let matchAId = '';
let matchBId = '';
let teamAId = '';
let teamBId = '';

async function apiJson(
  method: string,
  route: string,
  token: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {}
) {
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function connectClient(): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const sock = ioClient(baseUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    const timer = setTimeout(() => {
      sock.disconnect();
      reject(new Error('Socket connect timed out'));
    }, 5000);
    sock.on('connect', () => {
      clearTimeout(timer);
      resolve(sock);
    });
    sock.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe('Real-Time Scoring Latency Optimization, Room Isolation & Idempotency', () => {
  before(async () => {
    await connectDatabase();

    const admin: any = await User.create({
      name: 'Scorer Admin',
      email: 'realtime-admin@test.local',
      passwordHash: 'not_used',
      role: 'SUPER_ADMIN',
      isActive: true,
    });
    adminToken = signAuthToken(admin, 'admin');

    const tA: any = await Team.create({
      name: 'Chandena',
      shortName: 'CHN',
      sportType: 'Cricket',
      logoUrl: 'https://cdn.example.com/chandena.png',
    });
    const tB: any = await Team.create({
      name: 'Talheri',
      shortName: 'TLH',
      sportType: 'Cricket',
      logoUrl: 'https://cdn.example.com/talheri.png',
    });
    teamAId = String(tA._id);
    teamBId = String(tB._id);

    const mA: any = await LiveStream.create({
      matchTitle: 'Semi Final - Chandena vs Talheri',
      gameName: 'Cricket',
      teamAId,
      teamBId,
      teamAName: 'Chandena',
      teamBName: 'Talheri',
      teamALogo: tA.logoUrl,
      teamBLogo: tB.logoUrl,
      status: 'LIVE',
      streamingProvider: 'youtube',
      youtubeVideoId: 'dQw4w9WgXcQ',
      broadcastPublished: true,
      createdBy: admin._id,
    });
    matchAId = String(mA._id);

    await LiveScore.create({
      liveStreamId: matchAId,
      sportType: 'Cricket',
      teamAScore: 0,
      teamBScore: 0,
      matchStatus: 'LIVE',
      sportSpecificDetails: createInitialCricketDetails() as any,
    });

    const mB: any = await LiveStream.create({
      matchTitle: 'Mat 2 Kabaddi',
      gameName: 'Kabaddi',
      teamAName: 'Jaipur',
      teamBName: 'Patna',
      status: 'LIVE',
      streamingProvider: 'youtube',
      youtubeVideoId: '9bZkp7q19f0',
      broadcastPublished: true,
      createdBy: admin._id,
    });
    matchBId = String(mB._id);

    await LiveScore.create({
      liveStreamId: matchBId,
      sportType: 'Kabaddi',
      teamAScore: 0,
      teamBScore: 0,
      matchStatus: 'LIVE',
      sportSpecificDetails: createInitialKabaddiDetails() as any,
    });

    const app = express();
    app.use(express.json());
    app.use('/api/live', scoreRoutes);
    app.use('/api/live', liveStreamRoutes);
    app.use('/api', entityRoutes);

    server = http.createServer(app);
    initSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDatabase();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('isolates stream/match rooms, emits once per subscriber, and answers diag:ping ack', async () => {
    const clientMatchA = await connectClient();
    const clientMatchB = await connectClient();
    const clientFeed = await connectClient();

    try {
      clientMatchA.emit('match:join', matchAId);
      clientMatchB.emit('match:join', matchBId);
      clientFeed.emit('feed:join');
      await delay(80);

      let countA = 0;
      let countB = 0;
      let countFeed = 0;
      clientMatchA.on('score:updated', () => {
        countA += 1;
      });
      clientMatchB.on('score:updated', () => {
        countB += 1;
      });
      clientFeed.on('score:updated', () => {
        countFeed += 1;
      });

      emitStreamEvent(matchAId, 'score:updated', {
        streamId: matchAId,
        score: { teamAScore: 6, teamBScore: 0 },
      });
      await delay(100);

      assert.equal(countA, 1, 'match:A subscriber should receive exactly 1 event');
      assert.equal(countFeed, 1, 'feed subscriber should receive exactly 1 event');
      assert.equal(countB, 0, 'match:B subscriber must NOT receive match:A updates');

      const pingAck = await new Promise<any>((resolve) => {
        clientMatchA.emit('diag:ping', { clientSentAtMs: 12345 }, resolve);
      });
      assert.equal(pingAck.ok, true);
      assert.equal(pingAck.clientSentAtMs, 12345);
      assert.equal(pingAck.transport, 'websocket');
      assert.equal(typeof pingAck.serverNowMs, 'number');
    } finally {
      clientMatchA.disconnect();
      clientMatchB.disconnect();
      clientFeed.disconnect();
    }
  });

  it('enforces clientEventId idempotency across score events, patches, undos, and Kabaddi events, and attaches diag only when requested', async () => {
    const evtId = 'evt_idemp_1';
    const first = await apiJson(
      'POST',
      `/api/live/${matchAId}/score/event`,
      adminToken,
      {
        clientEventId: evtId,
        sportType: 'Cricket',
        action: { type: 'RUNS', runs: 4 },
      },
      { 'x-maidan-diag': '1', 'x-maidan-trace-id': evtId }
    );
    assert.equal(first.status, 201);
    assert.equal(first.json.score.teamAScore, 4);
    assert.equal(first.json.historyItem?.updatedBy?.name, 'Scorer Admin');
    assert.equal(first.json.diag?.traceId, evtId);
    assert.equal(typeof first.json.diag?.dbMs, 'number');

    // Duplicate retry must not double count
    const dup = await apiJson('POST', `/api/live/${matchAId}/score/event`, adminToken, {
      clientEventId: evtId,
      sportType: 'Cricket',
      action: { type: 'RUNS', runs: 4 },
    });
    assert.equal(dup.status, 200);
    assert.equal(dup.json.duplicatePrevented, true);
    assert.equal(dup.json.score.teamAScore, 4);
    assert.equal(dup.json.diag, undefined);

    // Patch idempotency check
    const patchId = 'patch_idemp_1';
    const p1 = await apiJson('PATCH', `/api/live/${matchAId}/score`, adminToken, {
      clientEventId: patchId,
      teamAScore: 10,
      action: 'Manual adjust +6',
    });
    assert.equal(p1.status, 200);
    assert.equal(p1.json.score.teamAScore, 10);

    const p2 = await apiJson('PATCH', `/api/live/${matchAId}/score`, adminToken, {
      clientEventId: patchId,
      teamAScore: 99,
      action: 'Manual adjust +6',
    });
    assert.equal(p2.status, 200);
    assert.equal(p2.json.duplicatePrevented, true);
    assert.equal(p2.json.score.teamAScore, 10);

    // Undo idempotency check
    const undoId = 'undo_idemp_1';
    const u1 = await apiJson('POST', `/api/live/${matchAId}/score/undo`, adminToken, {
      clientEventId: undoId,
    });
    assert.equal(u1.status, 200);
    assert.equal(u1.json.score.teamAScore, 4);

    const u2 = await apiJson('POST', `/api/live/${matchAId}/score/undo`, adminToken, {
      clientEventId: undoId,
    });
    assert.equal(u2.status, 200);
    assert.equal(u2.json.duplicatePrevented, true);
    assert.equal(u2.json.score.teamAScore, 4);

    // Kabaddi event + in-memory updatedBy + diag trace
    const kbdRes = await apiJson(
      'POST',
      `/api/live/${matchBId}/kabaddi/event`,
      adminToken,
      {
        clientEventId: 'kbd_opt_1',
        action: { type: 'TOUCH_POINT', team: 'A' },
      },
      { 'x-maidan-diag': '1' }
    );
    assert.equal(kbdRes.status, 200);
    assert.equal(kbdRes.json.score.teamAScore, 1);
    assert.equal(kbdRes.json.historyItem?.updatedBy?.name, 'Scorer Admin');
    assert.equal(typeof kbdRes.json.diag?.dbMs, 'number');
  });

  it('propagates match detail updates and linked team edits in real time via live:updated', async () => {
    const clientMatchA = await connectClient();
    const clientFeed = await connectClient();

    try {
      clientMatchA.emit('match:join', matchAId);
      clientFeed.emit('feed:join');
      await delay(80);

      const receivedOnMatch: any[] = [];
      const receivedOnFeed: any[] = [];
      clientMatchA.on('live:updated', (p) => receivedOnMatch.push(p));
      clientFeed.on('live:updated', (p) => receivedOnFeed.push(p));

      const upd = await apiJson('PATCH', `/api/live/${matchAId}`, adminToken, {
        matchTitle: 'Grand Final - Chandena vs Talheri',
        location: 'Rohtak Stadium',
      });
      assert.equal(upd.status, 200);
      await delay(100);

      assert.ok(receivedOnMatch.some((p) => p.matchTitle === 'Grand Final - Chandena vs Talheri'));
      assert.ok(receivedOnFeed.some((p) => p.location === 'Rohtak Stadium'));

      // Team rename propagates in background to linked active LiveStream & emits live:updated
      const teamUpd = await apiJson('PATCH', `/api/teams/${teamAId}`, adminToken, {
        name: 'Chandena Warriors',
      });
      assert.equal(teamUpd.status, 200);
      await delay(150);

      assert.ok(
        receivedOnMatch.some((p) => p.teamAName === 'Chandena Warriors'),
        'Linked team update should emit live:updated to match room'
      );
    } finally {
      clientMatchA.disconnect();
      clientFeed.disconnect();
    }
  });

  it('computes synchronous optimistic score deltas cleanly for Cricket, Kabaddi, and patches', () => {
    const baseCricket: any = {
      id: 's1',
      liveStreamId: matchAId,
      sportType: 'Cricket',
      teamAScore: 12,
      teamBScore: 0,
      matchStatus: 'LIVE',
      sportSpecificDetails: {
        ...createInitialCricketDetails(),
        teamARuns: 12,
        teamABalls: 5,
      },
    };
    const nextCricket = applyOptimisticStructuredEvent(baseCricket, 'Cricket', {
      type: 'RUNS',
      runs: 6,
    });
    assert.equal(nextCricket?.teamAScore, 18);

    const patched = applyOptimisticPatch(baseCricket, { teamBScore: 5, matchStatus: 'LIVE' });
    assert.equal(patched?.teamBScore, 5);

    const baseKbd: any = {
      id: 's2',
      liveStreamId: matchBId,
      sportType: 'Kabaddi',
      teamAScore: 10,
      teamBScore: 8,
      matchStatus: 'LIVE',
      sportSpecificDetails: createInitialKabaddiDetails(),
    };
    const nextKbd = applyOptimisticKabaddiEngineEvent(baseKbd, {
      type: 'TOUCH_POINT',
      team: 'A',
    });
    assert.equal(nextKbd?.teamAScore, 11);
  });
});
