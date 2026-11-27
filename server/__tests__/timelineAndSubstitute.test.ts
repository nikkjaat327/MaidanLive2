import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maidanlive-timeline-sub-'));
const tmpSqlitePath = path.join(tmpDir, 'test.db');
process.env.SQLITE_DB_PATH = tmpSqlitePath;
delete process.env.MONGODB_URI;
process.env.JWT_SECRET = 'test_jwt_secret_for_timeline_sub_tests_123456';
process.env.OBS_SECRET_KEY = 'test_obs_secret_key_for_timeline_sub_tests_123456';
process.env.MAIDANLIVE_SERVER_URL = 'http://localhost:3000';

const { connectDatabase, disconnectDatabase } = await import('../config/db.ts');
const { initSocketServer } = await import('../../backend/realtime/socket.ts');
const { User } = await import('../models/User.ts');
const { LiveStream } = await import('../models/LiveStream.ts');
const { LiveScore } = await import('../models/LiveScore.ts');
const { ScoreHistory } = await import('../models/ScoreHistory.ts');
const { signAuthToken } = await import('../middleware/auth.ts');
const scoreRoutes = (await import('../routes/scoreRoutes.ts')).default;
const {
  applyCricketAction,
  createInitialCricketDetails,
} = await import('../../src/utils/cricketScoring.ts');
const {
  extractMajorTimelineEvents,
} = await import('../../src/utils/matchTimeline.ts');

let server: http.Server;
let baseUrl = '';
let adminToken = '';
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

describe('Match Timeline Widget & Substitute Player', () => {
  before(async () => {
    await connectDatabase();

    const admin: any = await User.create({
      name: 'Timeline Admin',
      email: 'timeline-admin@test.local',
      passwordHash: 'not_used',
      role: 'SUPER_ADMIN',
      isActive: true,
    });
    adminToken = signAuthToken(admin, 'admin');

    const stream: any = await LiveStream.create({
      matchTitle: 'Chandena vs Talheri',
      sportType: 'Cricket',
      teamAName: 'Chandena',
      teamBName: 'Talheri',
      teamAPlayers: [
        { name: 'Ankit', position: 'Opening Batsman' },
        { name: 'Hunny', position: 'All-Rounder' },
        { name: 'Vikas', position: 'Middle Order' },
      ],
      teamBPlayers: [
        { name: 'Mohan', position: 'Fast Bowler' },
        { name: 'Sandeep', position: 'Spin Bowler' },
      ],
      status: 'LIVE',
      isPublic: true,
      createdBy: admin._id,
    } as any);
    streamId = String(stream._id);

    const initialDetails = createInitialCricketDetails();
    initialDetails.battingTeam = 'A';
    initialDetails.teamARuns = 42;
    initialDetails.teamAWickets = 1;
    initialDetails.teamABalls = 18;
    initialDetails.batsman1 = 'Ankit';
    initialDetails.batsman2 = 'Hunny';
    initialDetails.bowler = 'Mohan';

    await LiveScore.create({
      liveStreamId: stream._id,
      sportType: 'Cricket',
      teamAScore: 42,
      teamBScore: 0,
      matchStatus: 'LIVE',
      sportSpecificDetails: initialDetails as unknown as Record<string, unknown>,
      lastUpdatedBy: admin._id,
    });

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

  it('applyCricketAction SUBSTITUTE_PLAYER swaps striker/bowler without changing score and records substitution history', () => {
    const start = createInitialCricketDetails();
    start.battingTeam = 'A';
    start.teamARuns = 55;
    start.teamAWickets = 2;
    start.teamABalls = 24;
    start.batsman1 = 'Ankit';
    start.batsman2 = 'Hunny';
    start.bowler = 'Mohan';

    const subStriker = applyCricketAction(start, {
      type: 'SUBSTITUTE_PLAYER',
      team: 'A',
      role: 'STRIKER',
      playerOut: 'Ankit',
      playerIn: 'Vikas',
      reason: 'Impact Sub',
    });

    assert.equal(subStriker.teamAScore, 55);
    assert.equal(subStriker.details.batsman1, 'Vikas');
    assert.equal(subStriker.details.batsman2, 'Hunny');
    assert.equal(subStriker.eventCategory, 'SUBSTITUTION');
    assert.equal(subStriker.eventType, 'SUBSTITUTION');
    assert.equal(subStriker.details.substitutions?.length, 1);
    assert.equal(subStriker.details.substitutions?.[0].playerOut, 'Ankit');
    assert.equal(subStriker.details.substitutions?.[0].playerIn, 'Vikas');

    const subBowler = applyCricketAction(subStriker.details, {
      type: 'SUBSTITUTE_PLAYER',
      team: 'B',
      role: 'BOWLER',
      playerOut: 'Mohan',
      playerIn: 'Sandeep',
      reason: 'Injury',
    });

    assert.equal(subBowler.details.bowler, 'Sandeep');
    assert.equal(subBowler.details.substitutions?.length, 2);
    assert.equal(subBowler.details.substitutions?.[0].team, 'B');
  });

  it('extractMajorTimelineEvents returns last 5 wickets, boundaries, and substitutions newest-first', () => {
    const baseTime = Date.UTC(2026, 10, 27, 10, 0, 0);
    const makeItem = (
      id: string,
      offsetSec: number,
      overrides: Record<string, unknown>
    ) => ({
      _id: id,
      liveStreamId: streamId,
      entryType: 'SCORE_UPDATE' as const,
      sportType: 'Cricket' as const,
      teamSide: 'A' as const,
      action: 'Action',
      createdAt: new Date(baseTime + offsetSec * 1000).toISOString(),
      ...overrides,
    });

    const history: any[] = [
      makeItem('single-1', 5, { eventType: 'LEGAL_DELIVERY', pointsAwarded: 1, details: { type: 'RUNS', runs: 1 } }),
      makeItem('four-1', 10, { eventType: 'FOUR', pointsAwarded: 4, details: { type: 'RUNS', runs: 4, striker: 'Ankit' } }),
      makeItem('wicket-1', 20, { eventType: 'WICKET', details: { type: 'WICKET', dismissedPlayer: 'Ankit', wicketType: 'BOWLED', bowler: 'Mohan' } }),
      makeItem('comment-1', 25, { entryType: 'COMMENTARY', action: 'Great crowd today' }),
      makeItem('sub-1', 30, { eventCategory: 'SUBSTITUTION', eventType: 'SUBSTITUTION', teamSide: 'A', details: { type: 'SUBSTITUTE_PLAYER', playerOut: 'Ankit', playerIn: 'Vikas', reason: 'Impact Sub' } }),
      makeItem('six-1', 40, { eventType: 'SIX', pointsAwarded: 6, details: { type: 'RUNS', runs: 6, striker: 'Vikas' } }),
      makeItem('four-reverted', 45, { reverted: true, eventType: 'FOUR', pointsAwarded: 4, details: { type: 'RUNS', runs: 4, striker: 'Vikas' } }),
      makeItem('four-2', 50, { eventType: 'FOUR', pointsAwarded: 4, details: { type: 'RUNS', runs: 4, striker: 'Hunny' } }),
      makeItem('wicket-2', 60, { eventType: 'WICKET', details: { type: 'WICKET', dismissedPlayer: 'Hunny', wicketType: 'CAUGHT', bowler: 'Sandeep' } }),
    ];

    const events = extractMajorTimelineEvents(history, 'Chandena', 'Talheri', 5);
    assert.equal(events.length, 5);
    assert.deepEqual(
      events.map((e: any) => e.id),
      ['wicket-2', 'four-2', 'six-1', 'sub-1', 'wicket-1']
    );
    assert.equal(events[0].kind, 'WICKET');
    assert.equal(events[3].kind, 'SUBSTITUTION');
    assert.ok(events[0].formattedTime.length > 0);
  });

  it('POST /score/event SUBSTITUTE_PLAYER updates Active Players state & writes SUBSTITUTION history', async () => {
    const res = await apiJson(
      'POST',
      `/api/live/${streamId}/score/event`,
      adminToken,
      {
        action: {
          type: 'SUBSTITUTE_PLAYER',
          team: 'A',
          role: 'STRIKER',
          playerOut: 'Ankit',
          playerIn: 'Vikas',
          reason: 'Impact Sub',
        },
      }
    );

    assert.equal(res.status, 201);
    assert.equal(res.json.score.teamAScore, 42);
    assert.equal(res.json.score.sportSpecificDetails.batsman1, 'Vikas');
    assert.equal(res.json.score.sportSpecificDetails.batsman2, 'Hunny');
    assert.equal(res.json.score.sportSpecificDetails.substitutions?.[0]?.playerIn, 'Vikas');

    const latestHistory: any = await ScoreHistory.findOne({ liveStreamId: streamId })
      .sort({ createdAt: -1 })
      .lean();
    assert.equal(latestHistory.eventCategory, 'SUBSTITUTION');
    assert.equal(latestHistory.eventType, 'SUBSTITUTION');
    assert.equal(latestHistory.playerName, 'Vikas');
    assert.equal(latestHistory.assistPlayerName, 'Ankit');
  });
});
