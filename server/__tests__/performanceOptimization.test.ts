import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import compression from 'compression';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maidanlive-perf-opt-'));
const tmpSqlitePath = path.join(tmpDir, 'test.db');
process.env.SQLITE_DB_PATH = tmpSqlitePath;
delete process.env.MONGODB_URI;
process.env.JWT_SECRET = 'test_jwt_secret_for_performance_optimization_12345';
process.env.OBS_SECRET_KEY = 'test_obs_secret_key_for_performance_optimization_12345';
process.env.MAIDANLIVE_SERVER_URL = 'http://localhost:3000';

const { connectDatabase, disconnectDatabase } = await import('../config/db.ts');
const { initSocketServer } = await import('../../backend/realtime/socket.ts');
const { User } = await import('../models/User.ts');
const { UserSession } = await import('../models/UserSession.ts');
const { Team } = await import('../models/Team.ts');
const { Player } = await import('../models/Player.ts');
const { LiveStream } = await import('../models/LiveStream.ts');
const { LiveScore } = await import('../models/LiveScore.ts');
const { MatchHighlight } = await import('../models/MatchHighlight.ts');
const {
  authenticate,
  signAuthToken,
  invalidateAuthUserCache,
  invalidateAuthSessionCache,
} = await import('../middleware/auth.ts');
const scoreRoutes = (await import('../routes/scoreRoutes.ts')).default;
const liveStreamRoutes = (await import('../routes/liveStreamRoutes.ts')).default;
const { createInitialCricketDetails } = await import('../../src/utils/cricketScoring.ts');
const { createInitialKabaddiDetails } = await import('../../src/utils/kabaddiScoring.ts');
const { enqueueScoreMutation, getPendingScoreCount } = await import(
  '../../src/utils/scoreMutationQueue.ts'
);
const { pickFresherScore } = await import('../../src/utils/viewerCache.ts');

let server: http.Server;
let baseUrl = '';
let adminToken = '';
let customerToken = '';
let revokableUserId = '';
let revokableSessionId = '';
let revokableToken = '';
let cricketMatchId = '';
let kabaddiMatchId = '';

async function apiJson(
  method: string,
  route: string,
  token?: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {}
) {
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  return { status: res.status, headers: res.headers, json };
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

describe('Performance, Compression, Unified Detail, Feed Slimming & Mutation Queue Verification', () => {
  before(async () => {
    await connectDatabase();

    const admin: any = await User.create({
      name: 'Perf Super Admin',
      email: 'perf-admin@test.local',
      passwordHash: 'not_used',
      role: 'SUPER_ADMIN',
      isActive: true,
    });
    adminToken = signAuthToken(admin, 'admin');

    const viewer: any = await User.create({
      name: 'Perf Viewer',
      email: 'perf-viewer@test.local',
      passwordHash: 'not_used',
      role: 'SPECTATOR',
      isActive: true,
    });
    revokableUserId = String(viewer._id);
    const sessionDoc: any = await UserSession.create({
      userId: viewer._id,
      portal: 'customer',
      refreshTokenHash: 'perf_test_refresh_hash',
      userAgent: 'Perf Test Suite',
      ipAddress: '127.0.0.1',
      expiresAt: new Date(Date.now() + 3600_000),
      isRevoked: false,
    });
    revokableSessionId = String(sessionDoc._id);
    customerToken = signAuthToken(viewer, 'customer', revokableSessionId);
    revokableToken = customerToken;

    const teamA: any = await Team.create({
      name: 'Alpha Strikers',
      shortName: 'ALS',
      sportType: 'Cricket',
    });
    const teamB: any = await Team.create({
      name: 'Beta Titans',
      shortName: 'BTT',
      sportType: 'Cricket',
    });

    await Player.create({
      name: 'Aarav Sharma',
      teamId: teamA._id,
      role: 'Captain',
      jerseyNumber: 7,
      dateOfBirth: '2000-01-01',
      isMinor: false,
      createdBy: admin._id,
    });
    await Player.create({
      name: 'Vikram Singh',
      teamId: teamB._id,
      role: 'Bowler',
      jerseyNumber: 18,
      dateOfBirth: '2001-05-05',
      isMinor: false,
      createdBy: admin._id,
    });

    const mCricket: any = await LiveStream.create({
      matchTitle: 'Alpha vs Beta — Final',
      gameName: 'Cricket',
      teamAId: teamA._id,
      teamBId: teamB._id,
      teamAName: 'Alpha Strikers',
      teamBName: 'Beta Titans',
      status: 'LIVE',
      streamingProvider: 'youtube',
      youtubeVideoId: 'dQw4w9WgXcQ',
      broadcastPublished: true,
      createdBy: admin._id,
    });
    cricketMatchId = String(mCricket._id);

    await LiveScore.create({
      liveStreamId: cricketMatchId,
      sportType: 'Cricket',
      teamAScore: 0,
      teamBScore: 0,
      matchStatus: 'LIVE',
      sportSpecificDetails: createInitialCricketDetails() as any,
    });

    await MatchHighlight.create({
      liveStreamId: cricketMatchId,
      eventType: 'SIX',
      videoTimestampSeconds: 42,
      description: 'Opening Six',
      createdBy: admin._id,
    });

    const mKabaddi: any = await LiveStream.create({
      matchTitle: 'Mat 1 Kabaddi Final',
      gameName: 'Kabaddi',
      teamAName: 'Jaipur Pink',
      teamBName: 'Patna Pirates',
      status: 'LIVE',
      streamingProvider: 'youtube',
      youtubeVideoId: '9bZkp7q19f0',
      broadcastPublished: true,
      createdBy: admin._id,
    });
    kabaddiMatchId = String(mKabaddi._id);

    await LiveScore.create({
      liveStreamId: kabaddiMatchId,
      sportType: 'Kabaddi',
      teamAScore: 0,
      teamBScore: 0,
      matchStatus: 'LIVE',
      sportSpecificDetails: createInitialKabaddiDetails() as any,
    });

    const app = express();
    app.use(
      compression({
        threshold: 1024,
        filter: (req, res) => {
          if (req.headers['x-no-compression']) return false;
          const accept = String(req.headers.accept || '');
          if (accept.includes('text/event-stream')) return false;
          return compression.filter(req, res);
        },
      })
    );
    app.use(express.json());
    app.use('/api/live', (req, res, next) => {
      if (
        req.method === 'GET' &&
        /\/(?:score(?:\/history|\/result)?|detail|overlay)(?:$|\?)/.test(req.path)
      ) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
      next();
    });
    app.use('/api/live', scoreRoutes);
    app.use('/api/live', liveStreamRoutes);
    app.get('/api/test/me', authenticate, (req: any, res) => {
      res.json({ ok: true, id: String(req.user?._id), isActive: req.user?.isActive });
    });

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

  it('sets no-store cache headers and serves unified /api/live/:id/detail with PII & playback redaction rules', async () => {
    // Public (unauthenticated) request
    const anonRes = await apiJson('GET', `/api/live/${cricketMatchId}/detail`);
    assert.equal(anonRes.status, 200);
    assert.match(anonRes.headers.get('cache-control') || '', /no-store/i);
    assert.ok(anonRes.json.stream, 'Should include stream');
    assert.ok(anonRes.json.score, 'Should include score');
    assert.ok(Array.isArray(anonRes.json.history), 'Should include history array');
    assert.equal(anonRes.json.highlights.length, 0, 'Unauthenticated viewers must not receive highlights');
    assert.equal(anonRes.json.stream.playbackLocked, true, 'Unauthenticated stream playback must be redacted');
    assert.equal(anonRes.json.stream.youtubeVideoId, '');
    assert.equal(anonRes.json.lineupPlayers.teamA.length, 1);
    assert.equal(anonRes.json.lineupPlayers.teamA[0].name, 'Aarav Sharma');
    assert.equal(anonRes.json.lineupPlayers.teamA[0].dateOfBirth, undefined, 'Public lineup must strip dateOfBirth');
    assert.equal(anonRes.json.lineupPlayers.teamA[0].isMinor, undefined, 'Public lineup must strip isMinor');
    assert.equal(typeof anonRes.json.serverNowIso, 'string');

    // Authenticated customer request
    const authRes = await apiJson('GET', `/api/live/${cricketMatchId}/detail`, customerToken);
    assert.equal(authRes.status, 200);
    assert.equal(authRes.json.stream.youtubeVideoId, 'dQw4w9WgXcQ');
    assert.equal(authRes.json.highlights.length, 1);
    assert.equal(authRes.json.lineupPlayers.teamA[0].dateOfBirth, undefined, 'Customer must still not receive sensitive player metadata');

    // Score endpoint also gets no-store + gzip when compressed
    const scoreRawRes = await fetch(`${baseUrl}/api/live/${cricketMatchId}/score`, {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.equal(scoreRawRes.status, 200);
    assert.match(scoreRawRes.headers.get('cache-control') || '', /no-store/i);
    // Detail JSON > 1KB triggers gzip compression
    const detailRawRes = await fetch(`${baseUrl}/api/live/${cricketMatchId}/detail`, {
      headers: {
        Authorization: `Bearer ${customerToken}`,
        'Accept-Encoding': 'gzip',
      },
    });
    assert.equal(detailRawRes.status, 200);
    assert.equal(detailRawRes.headers.get('content-encoding'), 'gzip');
  });

  it('slims feed payloads while preserving full match-room payloads and shared logicalEventId', async () => {
    const matchSock = await connectClient();
    const feedSock = await connectClient();
    try {
      matchSock.emit('match:join', cricketMatchId);
      feedSock.emit('feed:join');
      await delay(80);

      const matchEvents: { ev: string; data: any }[] = [];
      const feedScoreEvents: any[] = [];
      matchSock.on('score:event:created', (data) => matchEvents.push({ ev: 'score:event:created', data }));
      matchSock.on('score:updated', (data) => matchEvents.push({ ev: 'score:updated', data }));
      feedSock.on('score:updated', (data) => feedScoreEvents.push(data));

      const res = await apiJson('POST', `/api/live/${cricketMatchId}/score/event`, adminToken, {
        clientEventId: 'perf_evt_six_1',
        sportType: 'Cricket',
        action: { type: 'RUNS', runs: 6 },
      });
      assert.equal(res.status, 201);
      assert.equal(res.json.score.teamAScore, 6);
      await delay(120);

      const created = matchEvents.find((e) => e.ev === 'score:event:created');
      const updated = matchEvents.find((e) => e.ev === 'score:updated');
      assert.ok(created && updated, 'Match room should receive both score:event:created and score:updated');
      assert.ok(created.data.logicalEventId, 'Should attach logicalEventId');
      assert.equal(
        created.data.logicalEventId,
        updated.data.logicalEventId,
        'Paired events must share the exact same logicalEventId for client deduplication'
      );
      assert.ok(updated.data.historyItem, 'Match room score:updated should include historyItem');
      assert.ok(
        Array.isArray(updated.data.score?.sportSpecificDetails?.deliveryHistory),
        'Match room should retain deliveryHistory'
      );
      assert.ok(
        Array.isArray(updated.data.score?.sportSpecificDetails?.recentBalls),
        'Match room should retain recentBalls'
      );

      assert.equal(feedScoreEvents.length, 1, 'Feed room should receive 1 slimmed score:updated');
      const feedPayload = feedScoreEvents[0];
      assert.equal(feedPayload.score.teamAScore, 6);
      assert.equal(feedPayload.historyItem, undefined, 'Feed must omit historyItem');
      assert.equal(
        feedPayload.score?.sportSpecificDetails?.deliveryHistory,
        undefined,
        'Feed must strip heavy deliveryHistory array'
      );
      assert.equal(
        feedPayload.score?.sportSpecificDetails?.recentBalls,
        undefined,
        'Feed must strip recentBalls array'
      );
    } finally {
      matchSock.disconnect();
      feedSock.disconnect();
    }
  });

  it('emits shared logicalEventId on Kabaddi events and returns local undo/reset history payloads', async () => {
    const kabaddiSock = await connectClient();
    const feedSock = await connectClient();
    try {
      kabaddiSock.emit('match:join', kabaddiMatchId);
      feedSock.emit('feed:join');
      await delay(80);

      const kbdMatchEvents: { ev: string; data: any }[] = [];
      const kbdFeedEvents: any[] = [];
      kabaddiSock.on('score:updated', (data) => kbdMatchEvents.push({ ev: 'score:updated', data }));
      kabaddiSock.on('kabaddi:state', (data) => kbdMatchEvents.push({ ev: 'kabaddi:state', data }));
      feedSock.on('score:updated', (data) => kbdFeedEvents.push(data));

      const k1 = await apiJson('POST', `/api/live/${kabaddiMatchId}/kabaddi/event`, adminToken, {
        clientEventId: 'perf_kbd_1',
        action: { type: 'TOUCH_POINT', team: 'A' },
      });
      assert.equal(k1.status, 200);
      assert.equal(k1.json.score.teamAScore, 1);
      await delay(120);

      const sUpd = kbdMatchEvents.find((e) => e.ev === 'score:updated');
      const kSt = kbdMatchEvents.find((e) => e.ev === 'kabaddi:state');
      assert.ok(sUpd && kSt, 'Kabaddi room should receive score:updated and kabaddi:state');
      assert.ok(sUpd.data.logicalEventId);
      assert.equal(sUpd.data.logicalEventId, kSt.data.logicalEventId);

      assert.equal(kbdFeedEvents.length, 1);
      assert.equal(kbdFeedEvents[0].score?.sportSpecificDetails?.raidTimeline, undefined);
      assert.equal(kbdFeedEvents[0].score?.sportSpecificDetails?.courtPlayersA, undefined);

      // Kabaddi Undo creates an UNDO entry and returns revertedHistoryId & undoHistoryItem
      const kUndo = await apiJson('POST', `/api/live/${kabaddiMatchId}/score/undo`, adminToken, {
        clientEventId: 'perf_kbd_undo_1',
      });
      assert.equal(kUndo.status, 200);
      assert.equal(kUndo.json.score.teamAScore, 0);
      assert.ok(kUndo.json.revertedHistoryId, 'Kabaddi undo should return revertedHistoryId');
      assert.ok(kUndo.json.undoHistoryItem, 'Kabaddi undo should return undoHistoryItem');

      // Cricket Undo deletes the latest ball history record and returns deletedHistoryId
      const cUndo = await apiJson('POST', `/api/live/${cricketMatchId}/score/undo`, adminToken, {
        clientEventId: 'perf_cricket_undo_1',
      });
      assert.equal(cUndo.status, 200);
      assert.equal(cUndo.json.score.teamAScore, 0);
      assert.ok(cUndo.json.deletedHistoryId, 'Cricket undo should return deletedHistoryId');
      assert.equal(cUndo.json.revertedHistoryId, cUndo.json.deletedHistoryId);

      // Reset returns resetHistoryItem
      const cReset = await apiJson('POST', `/api/live/${cricketMatchId}/score/reset`, adminToken, {});
      assert.equal(cReset.status, 200);
      assert.ok(cReset.json.resetHistoryItem, 'Reset should return resetHistoryItem');
      assert.equal(cReset.json.score.teamAScore, 0);
    } finally {
      kabaddiSock.disconnect();
      feedSock.disconnect();
    }
  });

  it('respects invalidateAuthSessionCache and invalidateAuthUserCache immediately', async () => {
    const okBefore = await apiJson('GET', '/api/test/me', revokableToken);
    assert.equal(okBefore.status, 200);

    // Revoke session in DB and invalidate cache
    await UserSession.findByIdAndUpdate(revokableSessionId, { isRevoked: true });
    invalidateAuthSessionCache(revokableSessionId);

    const revokedAfter = await apiJson('GET', '/api/test/me', revokableToken);
    assert.equal(revokedAfter.status, 401, 'Revoked session must fail immediately after cache invalidation');

    // Also verify user cache invalidation when user becomes inactive
    await UserSession.findByIdAndUpdate(revokableSessionId, { isRevoked: false });
    invalidateAuthSessionCache(revokableSessionId);
    const activeAgain = await apiJson('GET', '/api/test/me', revokableToken);
    assert.equal(activeAgain.status, 200);

    await User.findByIdAndUpdate(revokableUserId, { isActive: false });
    invalidateAuthUserCache(revokableUserId);
    const blockedUser = await apiJson('GET', '/api/test/me', revokableToken);
    assert.equal(blockedUser.status, 401, 'Deactivated user must fail immediately after cache invalidation');
  });

  it('executes enqueueScoreMutation in strict FIFO order and enforces monotonic pickFresherScore', async () => {
    const order: number[] = [];
    const seenPendingDuringLast: number[] = [];

    const p1 = enqueueScoreMutation('stream-fifo-test', async () => {
      await delay(35);
      order.push(1);
      seenPendingDuringLast.push(getPendingScoreCount('stream-fifo-test'));
    });
    const p2 = enqueueScoreMutation('stream-fifo-test', async () => {
      await delay(5);
      order.push(2);
      seenPendingDuringLast.push(getPendingScoreCount('stream-fifo-test'));
    });
    const p3 = enqueueScoreMutation('stream-fifo-test', async () => {
      await delay(10);
      order.push(3);
      seenPendingDuringLast.push(getPendingScoreCount('stream-fifo-test'));
    });

    assert.equal(getPendingScoreCount('stream-fifo-test'), 3);
    await Promise.all([p1, p2, p3]);
    assert.deepEqual(order, [1, 2, 3], 'Queued mutations must run strictly in FIFO order');
    assert.deepEqual(seenPendingDuringLast, [3, 2, 1], 'Last queued mutation sees count <= 1');
    assert.equal(getPendingScoreCount('stream-fifo-test'), 0);

    const newer: any = { teamAScore: 12, lastUpdatedAt: '2026-11-26T20:00:10.000Z' };
    const stale: any = { teamAScore: 6, lastUpdatedAt: '2026-11-26T20:00:05.000Z' };
    const freshest: any = { teamAScore: 18, lastUpdatedAt: '2026-11-26T20:00:12.000Z' };

    assert.equal(pickFresherScore(newer, stale)?.teamAScore, 12, 'Stale cached snapshot must not overwrite newer live score');
    assert.equal(pickFresherScore(newer, freshest)?.teamAScore, 18, 'Fresher live score must update current score');
    assert.equal(
      pickFresherScore(newer, stale, { allowOlder: true })?.teamAScore,
      6,
      'allowOlder permits intentional undo/reset rollback'
    );
  });
});
