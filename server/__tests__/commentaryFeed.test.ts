import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maidanlive-commentary-feed-'));
const tmpSqlitePath = path.join(tmpDir, 'test.db');
process.env.SQLITE_DB_PATH = tmpSqlitePath;
delete process.env.MONGODB_URI;
process.env.JWT_SECRET = 'test_jwt_secret_for_commentary_feed_tests_123456';
process.env.OBS_SECRET_KEY = 'test_obs_secret_key_for_commentary_feed_tests_123456';
process.env.MAIDANLIVE_SERVER_URL = 'http://localhost:3000';

const { connectDatabase, disconnectDatabase } = await import('../config/db.ts');
const { initSocketServer } = await import('../../backend/realtime/socket.ts');
const { User } = await import('../models/User.ts');
const { LiveStream } = await import('../models/LiveStream.ts');
const { LiveScore } = await import('../models/LiveScore.ts');
const { signAuthToken } = await import('../middleware/auth.ts');
const scoreRoutes = (await import('../routes/scoreRoutes.ts')).default;
const {
  createInitialCricketDetails,
} = await import('../../src/utils/cricketScoring.ts');
const {
  extractCommentaryFeedEntries,
  formatCommentaryScoreSnapshot,
  normalizeCommentaryCategory,
} = await import('../../src/utils/commentaryFeed.ts');

let server: http.Server;
let baseUrl = '';
let adminToken = '';
let spectatorToken = '';
let streamId = '';

async function apiJson(
  method: string,
  route: string,
  token?: string,
  body?: unknown
) {
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

describe('Commentary Feed Widget & Admin Broadcaster', () => {
  before(async () => {
    await connectDatabase();

    const admin: any = await User.create({
      name: 'Commentary Broadcaster',
      email: 'comm-admin@test.local',
      passwordHash: 'not_used',
      role: 'SUPER_ADMIN',
      isActive: true,
    });
    adminToken = signAuthToken(admin, 'admin');

    const spectator: any = await User.create({
      name: 'Public Viewer',
      email: 'viewer@test.local',
      passwordHash: 'not_used',
      role: 'SPECTATOR',
      isActive: true,
    });
    spectatorToken = signAuthToken(spectator, 'customer');

    const stream: any = await LiveStream.create({
      matchTitle: 'Chandena vs Talheri',
      sportType: 'Cricket',
      teamAName: 'Chandena',
      teamBName: 'Talheri',
      status: 'LIVE',
      isPublic: true,
      createdBy: admin._id,
    } as any);
    streamId = String(stream._id);

    const details = createInitialCricketDetails(10, 11);
    details.battingTeam = 'A';
    details.teamARuns = 72;
    details.teamAWickets = 2;
    details.teamABalls = 52;

    await LiveScore.create({
      liveStreamId: stream._id,
      sportType: 'Cricket',
      teamAScore: 72,
      teamBScore: 0,
      sportSpecificDetails: details as unknown as Record<string, unknown>,
      matchStatus: 'Live',
    } as any);

    const app = express();
    app.use(express.json());
    app.use('/api/live', scoreRoutes);

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

  it('normalizes categories, formats score snapshots, and filters commentary entries', () => {
    assert.equal(normalizeCommentaryCategory('highlight'), 'HIGHLIGHT');
    assert.equal(normalizeCommentaryCategory('match_update'), 'UPDATE');
    assert.equal(normalizeCommentaryCategory('unknown'), 'COMMENTARY');

    const cricketSnapshot = formatCommentaryScoreSnapshot({
      sportType: 'Cricket',
      teamAScore: 72,
      teamBScore: 0,
      sportSpecificDetails: {
        battingTeam: 'A',
        teamARuns: 72,
        teamAWickets: 2,
        teamABalls: 52,
      },
    });
    assert.equal(cricketSnapshot, '72/2 (8.4 ov)');

    const entries = extractCommentaryFeedEntries([
      {
        _id: 's1',
        liveStreamId: 'm1',
        entryType: 'SCORE_UPDATE',
        action: '4 runs',
        previousScore: {},
        updatedScore: { teamAScore: 4, teamBScore: 0 },
        createdAt: '2026-11-27T01:00:00.000Z',
      },
      {
        _id: 'c1',
        liveStreamId: 'm1',
        entryType: 'COMMENTARY',
        eventType: 'UPDATE',
        action: 'Drizzle delayed play briefly, covers coming off now.',
        previousScore: {},
        updatedScore: { teamAScore: 40, teamBScore: 0 },
        updatedBy: { _id: 'u1', name: 'Raj', role: 'ADMIN' },
        createdAt: '2026-11-27T01:05:00.000Z',
      },
      {
        _id: 'c2',
        liveStreamId: 'm1',
        entryType: 'COMMENTARY',
        eventType: 'HIGHLIGHT',
        action: 'Massive six over deep mid-wicket by Ankit!',
        previousScore: {},
        updatedScore: { teamAScore: 72, teamBScore: 0 },
        details: { commentaryCategory: 'HIGHLIGHT', scoreSnapshotText: '72/2 (8.4 ov)' },
        createdAt: '2026-11-27T01:10:00.000Z',
      },
    ]);

    assert.equal(entries.length, 2);
    assert.equal(entries[0].id, 'c2');
    assert.equal(entries[0].category, 'HIGHLIGHT');
    assert.equal(entries[0].categoryLabel, 'Highlight');
    assert.equal(entries[0].scoreSnapshot, '72/2 (8.4 ov)');
    assert.equal(entries[1].id, 'c1');
    assert.equal(entries[1].authorName, 'Raj');

    const onlyHighlights = extractCommentaryFeedEntries(
      [
        {
          _id: 'c1',
          liveStreamId: 'm1',
          entryType: 'COMMENTARY',
          eventType: 'UPDATE',
          action: 'Covers off.',
          previousScore: {},
          updatedScore: {},
          createdAt: '2026-11-27T01:05:00.000Z',
        },
        {
          _id: 'c2',
          liveStreamId: 'm1',
          entryType: 'COMMENTARY',
          eventType: 'HIGHLIGHT',
          action: 'Direct hit run out!',
          previousScore: {},
          updatedScore: {},
          createdAt: '2026-11-27T01:10:00.000Z',
        },
      ],
      'HIGHLIGHT'
    );
    assert.equal(onlyHighlights.length, 1);
    assert.equal(onlyHighlights[0].text, 'Direct hit run out!');
  });

  it('allows admin to broadcast and delete commentary while public users see updates in history', async () => {
    // Spectator cannot broadcast commentary
    const unauthRes = await apiJson('POST', `/api/live/${streamId}/commentary`, spectatorToken, {
      snippet: 'Unauthorized commentary',
      category: 'HIGHLIGHT',
    });
    assert.ok(unauthRes.status === 401 || unauthRes.status === 403);

    // Empty commentary is rejected
    const emptyRes = await apiJson('POST', `/api/live/${streamId}/commentary`, adminToken, {
      snippet: '   ',
      category: 'UPDATE',
    });
    assert.equal(emptyRes.status, 400);

    // Admin broadcasts a highlight
    const createHighlight = await apiJson(
      'POST',
      `/api/live/${streamId}/commentary`,
      adminToken,
      {
        snippet: 'What a yorker! Middle stump rattled on 8.4 overs.',
        category: 'HIGHLIGHT',
      }
    );
    assert.equal(createHighlight.status, 201);
    assert.equal(createHighlight.json.commentary.entryType, 'COMMENTARY');
    assert.equal(createHighlight.json.commentary.eventType, 'HIGHLIGHT');
    assert.equal(
      createHighlight.json.commentary.details.scoreSnapshotText,
      '72/2 (8.4 ov)'
    );
    assert.equal(createHighlight.json.commentary.updatedBy.name, 'Commentary Broadcaster');

    // Admin broadcasts a match update
    const createUpdate = await apiJson('POST', `/api/live/${streamId}/commentary`, adminToken, {
      snippet: 'Drinks break called — two overs left in powerplay.',
      category: 'UPDATE',
    });
    assert.equal(createUpdate.status, 201);

    // Public viewer fetches history cleanly without auth token
    const publicHistory = await apiJson('GET', `/api/live/${streamId}/score/history`);
    assert.equal(publicHistory.status, 200);
    const extracted = extractCommentaryFeedEntries(publicHistory.json.history);
    assert.equal(extracted.length, 2);
    assert.equal(extracted[0].category, 'UPDATE');
    assert.equal(extracted[1].category, 'HIGHLIGHT');

    // Admin deletes the second entry
    const deleteRes = await apiJson(
      'DELETE',
      `/api/live/${streamId}/commentary/${createUpdate.json.commentary._id}`,
      adminToken
    );
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.json.deleted, true);

    const afterDeleteHistory = await apiJson('GET', `/api/live/${streamId}/score/history`);
    assert.equal(afterDeleteHistory.status, 200);
    const remaining = extractCommentaryFeedEntries(afterDeleteHistory.json.history);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, createHighlight.json.commentary._id);
  });
});
