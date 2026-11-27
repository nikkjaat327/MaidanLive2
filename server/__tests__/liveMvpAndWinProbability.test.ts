import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maidanlive-mvp-winprob-'));
const tmpSqlitePath = path.join(tmpDir, 'test.db');
process.env.SQLITE_DB_PATH = tmpSqlitePath;
delete process.env.MONGODB_URI;
process.env.JWT_SECRET = 'test_jwt_secret_for_mvp_winprob_tests_123456';
process.env.OBS_SECRET_KEY = 'test_obs_secret_key_for_mvp_winprob_tests_123456';
process.env.MAIDANLIVE_SERVER_URL = 'http://localhost:3000';

const { connectDatabase, disconnectDatabase } = await import('../config/db.ts');
const { initSocketServer } = await import('../../backend/realtime/socket.ts');
const { User } = await import('../models/User.ts');
const { LiveStream } = await import('../models/LiveStream.ts');
const { signAuthToken } = await import('../middleware/auth.ts');
const liveStreamRoutes = (await import('../routes/liveStreamRoutes.ts')).default;
const {
  applyCricketAction,
  createInitialCricketDetails,
} = await import('../../src/utils/cricketScoring.ts');
const {
  computeLiveMvpCandidates,
} = await import('../../src/utils/liveMvp.ts');
const {
  computeLiveWinProbability,
} = await import('../../src/utils/winProbability.ts');

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

describe('Live MVP Tracker & Win Probability', () => {
  before(async () => {
    await connectDatabase();

    const admin: any = await User.create({
      name: 'MVP Admin',
      email: 'mvp-admin@test.local',
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
      status: 'LIVE',
      isPublic: true,
      createdBy: admin._id,
    } as any);
    streamId = String(stream._id);

    const app = express();
    app.use(express.json());
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

  it('computeLiveMvpCandidates auto-suggests top performer from runs and wickets', () => {
    let details = createInitialCricketDetails(10, 11);
    details.battingTeam = 'A';
    details.batsman1 = 'Ankit';
    details.batsman2 = 'Hunny';
    details.bowler = 'Mohan';

    // Ankit hits 3 sixes and 2 fours (26 runs in 5 balls)
    details = applyCricketAction(details, { type: 'RUNS', runs: 6 }).details;
    details = applyCricketAction(details, { type: 'RUNS', runs: 6 }).details;
    details = applyCricketAction(details, { type: 'RUNS', runs: 6 }).details;
    details = applyCricketAction(details, { type: 'RUNS', runs: 4 }).details;
    details = applyCricketAction(details, { type: 'RUNS', runs: 4 }).details;

    // Mohan takes 2 wickets (Ankit out, Hunny out)
    details = applyCricketAction(details, {
      type: 'WICKET',
      wicketType: 'BOWLED',
      dismissedPlayer: 'Ankit',
      newBatsman: 'Vikas',
    }).details;
    details = applyCricketAction(details, {
      type: 'WICKET',
      wicketType: 'CAUGHT',
      dismissedPlayer: 'Hunny',
      newBatsman: 'Rohit',
    }).details;

    const ranking = computeLiveMvpCandidates({
      sportType: 'Cricket',
      teamAName: 'Chandena',
      teamBName: 'Talheri',
      score: {
        _id: 'sc-mvp',
        liveStreamId: streamId,
        sportType: 'Cricket',
        teamAScore: details.teamARuns,
        teamBScore: details.teamBRuns,
        matchStatus: 'LIVE',
        lastUpdatedAt: new Date().toISOString(),
        sportSpecificDetails: details as unknown as Record<string, unknown>,
      },
    });

    assert.ok(ranking.suggestedMvp);
    assert.ok(ranking.candidates.length >= 2);
    // Mohan took 2 wickets => 52+ points; Ankit scored 26 (2*4, 3*6) => ~39 points
    assert.equal(ranking.suggestedMvp?.name, 'Mohan');
    assert.equal(ranking.suggestedMvp?.wickets, 2);
    assert.ok(ranking.candidates.some((c) => c.name === 'Ankit' && c.runs === 26));
  });

  it('computeLiveWinProbability returns valid team percentages summing to 100 and responds to chase pressure', () => {
    const chaseComfortable = createInitialCricketDetails(10, 11);
    chaseComfortable.innings = 2;
    chaseComfortable.battingTeam = 'B';
    chaseComfortable.teamARuns = 60;
    chaseComfortable.target = 61;
    chaseComfortable.teamBRuns = 50;
    chaseComfortable.teamBBalls = 30; // 11 needed off 30 balls, 9 wkts left
    chaseComfortable.teamBWickets = 1;

    const probEasy = computeLiveWinProbability({
      sportType: 'Cricket',
      teamAName: 'Chandena',
      teamBName: 'Talheri',
      score: {
        _id: 'sc1',
        liveStreamId: streamId,
        sportType: 'Cricket',
        teamAScore: 60,
        teamBScore: 50,
        matchStatus: 'LIVE',
        lastUpdatedAt: new Date().toISOString(),
        sportSpecificDetails: chaseComfortable as unknown as Record<string, unknown>,
      },
    });

    assert.equal(probEasy.teamAPercent + probEasy.teamBPercent, 100);
    assert.ok(probEasy.teamBPercent > probEasy.teamAPercent, 'Chasing team needing 11 off 30b should be favored');

    const chaseHard = { ...chaseComfortable, teamBRuns: 20, teamBBalls: 54, teamBWickets: 8 }; // 41 needed off 6 balls, 2 wkts left
    const probHard = computeLiveWinProbability({
      sportType: 'Cricket',
      teamAName: 'Chandena',
      teamBName: 'Talheri',
      score: {
        _id: 'sc2',
        liveStreamId: streamId,
        sportType: 'Cricket',
        teamAScore: 60,
        teamBScore: 20,
        matchStatus: 'LIVE',
        lastUpdatedAt: new Date().toISOString(),
        sportSpecificDetails: chaseHard as unknown as Record<string, unknown>,
      },
    });

    assert.equal(probHard.teamAPercent + probHard.teamBPercent, 100);
    assert.ok(probHard.teamAPercent > probHard.teamBPercent, 'Defending team should be strongly favored when 41 needed off 6b');
  });

  it('PATCH /api/live/:id/overlay persists and broadcasts Live MVP broadcast overlay config', async () => {
    const patchRes = await apiJson(
      'PATCH',
      `/api/live/${streamId}/overlay`,
      adminToken,
      {
        overlayConfig: {
          liveMvpVisible: true,
          liveMvpPlayerName: 'Mohan',
          liveMvpTeamName: 'Talheri',
          liveMvpStatsLine: '2/26 (1.1 ov)',
          liveMvpLabel: 'LIVE MVP',
          liveMvpPosition: 'top-right',
        },
      }
    );

    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.json.overlayConfig.liveMvpVisible, true);
    assert.equal(patchRes.json.overlayConfig.liveMvpPlayerName, 'Mohan');
    assert.equal(patchRes.json.overlayConfig.liveMvpTeamName, 'Talheri');
    assert.equal(patchRes.json.overlayConfig.liveMvpStatsLine, '2/26 (1.1 ov)');
    assert.equal(patchRes.json.overlayConfig.liveMvpPosition, 'top-right');

    const hideRes = await apiJson(
      'PATCH',
      `/api/live/${streamId}/overlay`,
      adminToken,
      {
        overlayConfig: {
          liveMvpVisible: false,
        },
      }
    );
    assert.equal(hideRes.status, 200);
    assert.equal(hideRes.json.overlayConfig.liveMvpVisible, false);
  });
});
