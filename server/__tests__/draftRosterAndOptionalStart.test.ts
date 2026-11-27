import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maidanlive-draft-roster-'));
const tmpSqlitePath = path.join(tmpDir, 'test.db');
process.env.SQLITE_DB_PATH = tmpSqlitePath;
delete process.env.MONGODB_URI;
process.env.JWT_SECRET = 'test_jwt_secret_for_draft_roster_tests_123456';
process.env.OBS_SECRET_KEY = 'test_obs_secret_key_for_draft_roster_tests_123456';
process.env.MAIDANLIVE_SERVER_URL = 'http://localhost:3000';

const { connectDatabase, disconnectDatabase } = await import('../config/db.ts');
const { initSocketServer } = await import('../../backend/realtime/socket.ts');
const { User } = await import('../models/User.ts');
const { LiveScore } = await import('../models/LiveScore.ts');
const { signAuthToken } = await import('../middleware/auth.ts');
const scoreRoutes = (await import('../routes/scoreRoutes.ts')).default;
const liveStreamRoutes = (await import('../routes/liveStreamRoutes.ts')).default;

let server: http.Server;
let baseUrl = '';
let adminToken = '';

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

describe('Draft Roster Positions, Live Lineup Merging & Zero-Required Match Start', () => {
  before(async () => {
    await connectDatabase();

    const admin: any = await User.create({
      name: 'Roster Admin',
      email: 'roster-admin@test.local',
      passwordHash: 'not_used',
      role: 'SUPER_ADMIN',
      isActive: true,
    });
    adminToken = signAuthToken(admin, 'admin');

    const app = express();
    app.use(express.json());
    app.use('/api/live', scoreRoutes);
    app.use('/api/live', liveStreamRoutes);

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

  it('allows creating, scoring, and starting a match with completely empty payload (zero required fields)', async () => {
    const createRes = await apiJson('POST', '/api/live/initialize', adminToken, {});
    assert.equal(createRes.status, 201, JSON.stringify(createRes.json));
    const matchId = createRes.json.stream?.id || createRes.json.stream?._id;
    assert.ok(matchId, 'Should create match with empty payload');

    // Immediately score on the zero-detail match without setting team names, players, or YouTube URL
    const ballRes = await apiJson('POST', `/api/live/${matchId}/score/event`, adminToken, {
      clientEventId: `empty_crk_${Date.now()}`,
      sportType: 'Cricket',
      action: { type: 'RUNS', runs: 1 },
    });
    assert.equal(ballRes.status, 201, JSON.stringify(ballRes.json));
    assert.equal(ballRes.json.score?.teamAScore, 1);

    // Allow Cricket 2nd innings start with completely blank opener & bowler names
    const secondInnRes = await apiJson(
      'POST',
      `/api/live/${matchId}/cricket/start-second-innings`,
      adminToken,
      {
        battingTeam: 'B',
        batsman1: '',
        batsman2: '',
        bowler: '',
      }
    );
    assert.equal(secondInnRes.status, 200, JSON.stringify(secondInnRes.json));
    assert.equal(secondInnRes.json.score?.sportSpecificDetails?.innings, 2);

    // Allow starting/activating match broadcast without entering teams/players/YouTube URL (via MediaMTX provider)
    const goLiveRes = await apiJson('POST', `/api/live/${matchId}/activate`, adminToken, {
      activeStreamingProvider: 'mediamtx',
    });
    assert.equal(goLiveRes.status, 200, JSON.stringify(goLiveRes.json));
    assert.equal(goLiveRes.json.stream?.status, 'LIVE');
  });

  it('persists, sanitizes, and exposes drafted team players with sport positions across Cricket, Kabaddi, Football & Volleyball', async () => {
    // 1. Cricket draft with more than 30 entries + empty rows to verify filtering & capping
    const oversizedTeamA = [
      { name: '   ', position: 'Batsman' },
      ...Array.from({ length: 34 }, (_, idx) => ({
        name: `Batter ${idx + 1}`,
        position: idx === 0 ? 'Opener' : idx === 10 ? 'Wicket-Keeper' : 'All-Rounder',
        jerseyNumber: idx + 1,
      })),
    ];

    const cricketInit = await apiJson('POST', '/api/live/initialize', adminToken, {
      gameName: 'Cricket',
      teamAName: 'Chandena XI',
      teamBName: 'Talheri Royals',
      status: 'UPCOMING',
      teamAPlayers: oversizedTeamA,
      teamBPlayers: [
        { name: 'Rohit Pacer', position: 'Fast Bowler', jerseyNumber: 93 },
        { name: 'Aman Spin', position: 'Spinner', jerseyNumber: 19 },
      ],
    });
    assert.equal(cricketInit.status, 201, JSON.stringify(cricketInit.json));
    const cricketId = cricketInit.json.stream.id;

    assert.equal(cricketInit.json.stream.teamAPlayers.length, 30, 'Should cap team players at 30');
    assert.equal(cricketInit.json.stream.teamAPlayers[0].name, 'Batter 1');
    assert.equal(cricketInit.json.stream.teamAPlayers[0].position, 'Opener');
    assert.equal(cricketInit.json.stream.teamBPlayers.length, 2);

    // Admin detail endpoint merges drafted players into lineupPlayers even while UPCOMING
    const detailRes = await apiJson('GET', `/api/live/${cricketId}/detail`, adminToken);
    assert.equal(detailRes.status, 200, JSON.stringify(detailRes.json));
    assert.equal(detailRes.json.lineupPlayers.teamA.length, 30);
    assert.equal(detailRes.json.lineupPlayers.teamB[0].name, 'Rohit Pacer');
    assert.equal(detailRes.json.lineupPlayers.teamB[0].role, 'Fast Bowler');

    // Update players in edit mode via PATCH
    const patchRes = await apiJson('PATCH', `/api/live/${cricketId}`, adminToken, {
      teamBPlayers: [
        { name: 'Rohit Pacer', position: 'Fast Bowler', jerseyNumber: 93 },
        { name: 'Kapil Mid', position: 'All-Rounder', jerseyNumber: 83 },
      ],
    });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.json.stream.teamBPlayers[1].name, 'Kapil Mid');

    // Cricket structured delivery referencing drafted player names (no DB ObjectId) works cleanly
    const ballRes = await apiJson('POST', `/api/live/${cricketId}/score/event`, adminToken, {
      clientEventId: `crk_draft_${Date.now()}`,
      sportType: 'Cricket',
      action: {
        type: 'RUNS',
        runs: 4,
        striker: 'Batter 1',
        nonStriker: 'Batter 2',
        bowler: 'Rohit Pacer',
      },
      playerName: 'Batter 1',
    });
    assert.equal(ballRes.status, 201, JSON.stringify(ballRes.json));
    assert.equal(ballRes.json.score.teamAScore, 4);
    assert.equal(ballRes.json.score.sportSpecificDetails.batsman1, 'Batter 1');
    assert.equal(ballRes.json.score.sportSpecificDetails.batsman2, 'Batter 2');
    assert.equal(ballRes.json.score.sportSpecificDetails.bowler, 'Rohit Pacer');

    // Wicket with next batsman selected from drafted list updates striker cleanly
    const wicketRes = await apiJson('POST', `/api/live/${cricketId}/score/event`, adminToken, {
      clientEventId: `crk_wkt_${Date.now()}`,
      sportType: 'Cricket',
      action: {
        type: 'WICKET',
        wicketType: 'Caught',
        dismissedPlayer: 'Batter 1',
        newBatsman: 'Batter 3',
        fielder: 'Kapil Mid',
        striker: 'Batter 1',
        nonStriker: 'Batter 2',
        bowler: 'Rohit Pacer',
      },
      playerName: 'Batter 1',
    });
    assert.equal(wicketRes.status, 201, JSON.stringify(wicketRes.json));
    assert.equal(wicketRes.json.score.sportSpecificDetails.teamAWickets, 1);
    assert.equal(wicketRes.json.score.sportSpecificDetails.batsman1, 'Batter 3');

    // 2. Kabaddi draft pre-seeds court players from drafted teamAPlayers / teamBPlayers
    const kabaddiInit = await apiJson('POST', '/api/live/initialize', adminToken, {
      gameName: 'Kabaddi',
      teamAName: 'Haryana Warriors',
      teamBName: 'UP Yoddhas',
      teamAPlayers: [
        { name: 'Pardeep Narwal', position: 'Raider', jerseyNumber: 9 },
        { name: 'Fazel Atrachali', position: 'Left Corner', jerseyNumber: 1 },
      ],
      teamBPlayers: [
        { name: 'Naveen Kumar', position: 'Raider', jerseyNumber: 10 },
      ],
    });
    assert.equal(kabaddiInit.status, 201, JSON.stringify(kabaddiInit.json));
    const kabaddiId = kabaddiInit.json.stream.id;
    const kabaddiScore = await LiveScore.findOne({ liveStreamId: kabaddiId }).lean();
    assert.ok(kabaddiScore);
    const courtA = (kabaddiScore as any).sportSpecificDetails?.courtPlayersA || [];
    assert.equal(courtA[0]?.name, 'Pardeep Narwal');
    assert.equal(courtA[0]?.role, 'Raider');
    assert.equal(courtA[1]?.name, 'Fazel Atrachali');

    // 3. Football draft + live goal attribution without DB player ObjectId
    const footballInit = await apiJson('POST', '/api/live/initialize', adminToken, {
      gameName: 'Football',
      teamAName: 'Bengaluru FC',
      teamBName: 'Mohun Bagan',
      teamAPlayers: [{ name: 'Sunil Chhetri', position: 'Striker (ST)', jerseyNumber: 11 }],
    });
    assert.equal(footballInit.status, 201);
    const footballId = footballInit.json.stream.id;
    const goalRes = await apiJson('POST', `/api/live/${footballId}/score/event`, adminToken, {
      clientEventId: `fb_draft_${Date.now()}`,
      sportType: 'Football',
      action: {
        type: 'STRUCTURED_EVENT',
        team: 'A',
        eventType: 'GOAL',
        minute: 12,
        playerName: 'Sunil Chhetri',
      },
      playerName: 'Sunil Chhetri',
    });
    assert.equal(goalRes.status, 201, JSON.stringify(goalRes.json));
    assert.equal(goalRes.json.score.teamAScore, 1);

    // 4. Volleyball draft
    const vbInit = await apiJson('POST', '/api/live/initialize', adminToken, {
      gameName: 'Volleyball',
      teamAPlayers: [{ name: 'Ashwal Rai', position: 'Middle Blocker', jerseyNumber: 14 }],
    });
    assert.equal(vbInit.status, 201);
    assert.equal(vbInit.json.stream.teamAPlayers[0].position, 'Middle Blocker');
  });

  it('exposes current Cricket batters, bowler, deliveryHistory, and full drafted players to public normal-user endpoints', async () => {
    const createRes = await apiJson('POST', '/api/live', adminToken, {
      gameName: 'Cricket',
      teamAName: 'Chandena',
      teamBName: 'Talheri',
      streamingProvider: 'mediamtx',
      status: 'LIVE',
      broadcastPublished: true,
      teamAPlayers: [
        { name: 'Ankit', position: 'Opening Batsman', jerseyNumber: 18 },
        { name: 'Hunny', position: 'Opening Batsman', jerseyNumber: 45 },
        { name: 'Vikas', position: 'All-Rounder', jerseyNumber: 7 },
      ],
      teamBPlayers: [
        { name: 'Mohan', position: 'Bowler', jerseyNumber: 99 },
        { name: 'Sandeep', position: 'All-Rounder', jerseyNumber: 12 },
      ],
    });
    assert.equal(createRes.status, 201, JSON.stringify(createRes.json));
    const matchId = createRes.json.stream.id;

    // Score 4 balls for Hunny while Ankit is non-striker and Mohan bowls
    const ballRes = await apiJson('POST', `/api/live/${matchId}/score/event`, adminToken, {
      clientEventId: `pub_crk_${Date.now()}`,
      sportType: 'Cricket',
      action: {
        type: 'RUNS',
        runs: 4,
        striker: 'Hunny',
        nonStriker: 'Ankit',
        bowler: 'Mohan',
      },
      playerName: 'Hunny',
    });
    assert.equal(ballRes.status, 201, JSON.stringify(ballRes.json));

    // Normal unauthenticated user calls public /api/live/:id/detail
    const pubDetail = await apiJson('GET', `/api/live/${matchId}/detail`);
    assert.equal(pubDetail.status, 200, JSON.stringify(pubDetail.json));
    assert.equal(pubDetail.json.score.sportSpecificDetails.batsman1, 'Hunny');
    assert.equal(pubDetail.json.score.sportSpecificDetails.batsman2, 'Ankit');
    assert.equal(pubDetail.json.score.sportSpecificDetails.bowler, 'Mohan');
    assert.ok(
      Array.isArray(pubDetail.json.score.sportSpecificDetails.deliveryHistory) &&
        pubDetail.json.score.sportSpecificDetails.deliveryHistory.length === 1,
      'Public detail should include deliveryHistory so normal user scorecard matches admin panel'
    );
    assert.equal(pubDetail.json.lineupPlayers.teamA.length, 3);
    assert.equal(pubDetail.json.lineupPlayers.teamB.length, 2);
    assert.equal(pubDetail.json.lineupPlayers.teamA[2].name, 'Vikas');

    // Normal unauthenticated user calls public /api/live feed for match cards
    const pubFeed = await apiJson('GET', '/api/live');
    assert.equal(pubFeed.status, 200);
    const matchCard = (pubFeed.json.streams || []).find((s: any) => s.id === matchId);
    assert.ok(matchCard, 'Public /api/live feed should include published live match');
    assert.equal(matchCard.score.sportSpecificDetails.batsman1, 'Hunny');
    assert.equal(matchCard.score.sportSpecificDetails.batsman2, 'Ankit');
    assert.equal(matchCard.score.sportSpecificDetails.bowler, 'Mohan');
    assert.equal(matchCard.teamAPlayers.length, 3);
    assert.equal(matchCard.teamBPlayers.length, 2);
  });
});

