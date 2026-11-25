import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maidanlive-switch-obs-'));
const tmpSqlitePath = path.join(tmpDir, 'test.db');
process.env.SQLITE_DB_PATH = tmpSqlitePath;
delete process.env.MONGODB_URI;
process.env.JWT_SECRET = 'test_jwt_secret_for_switch_obs_match_12345';
process.env.OBS_SECRET_KEY = 'test_obs_secret_key_for_switch_obs_12345';
process.env.MAIDANLIVE_SERVER_URL = 'http://localhost:3000';

const { connectDatabase, disconnectDatabase } = await import('../config/db.ts');
const { User } = await import('../models/User.ts');
const { LiveStream } = await import('../models/LiveStream.ts');
const { LiveScore } = await import('../models/LiveScore.ts');
const { ObsBridge } = await import('../models/ObsBridge.ts');
const { ObsControllerProfile } = await import('../models/ObsControllerProfile.ts');
const { BroadcastAuditLog } = await import('../models/BroadcastAuditLog.ts');
const { signAuthToken } = await import('../middleware/auth.ts');
const obsBroadcastRoutes = (await import('../routes/obsBroadcastRoutes.ts')).default;

let server: http.Server;
let baseUrl = '';
let adminToken = '';
let broadcasterToken = '';
let matchAId = '';
let matchBId = '';
let bridgeDocId = '';

async function apiJson(method: string, route: string, token?: string, body?: unknown) {
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

describe('1-Click OBS Match Broadcast Switch & Active Overlay Resolution', () => {
  before(async () => {
    await connectDatabase();

    const admin = await User.create({
      name: 'Broadcast Admin',
      email: 'admin-switch@test.local',
      passwordHash: 'not_used',
      role: 'ADMIN',
      isActive: true,
    });
    adminToken = signAuthToken(admin, 'admin');

    const broadcaster = await User.create({
      name: 'Assigned Broadcaster',
      email: 'broadcaster-switch@test.local',
      passwordHash: 'not_used',
      role: 'BROADCASTER',
      isActive: true,
    });
    broadcasterToken = signAuthToken(broadcaster, 'admin');

    const streamA = await LiveStream.create({
      matchTitle: 'Qualifier 1: Hawks vs Eagles',
      teamAName: 'Hawks',
      teamBName: 'Eagles',
      gameName: 'Cricket',
      status: 'LIVE',
      broadcastPhase: 'BROADCAST_ACTIVE',
      broadcastPublished: true,
      showScoreboardOnYoutube: true,
      activeStreamingProvider: 'youtube',
    });
    matchAId = String(streamA._id);

    const streamB = await LiveStream.create({
      matchTitle: 'Final: Lions vs Royals',
      teamAName: 'Lions',
      teamBName: 'Royals',
      gameName: 'Kabaddi',
      status: 'UPCOMING',
      broadcastPhase: 'MATCH_PREPARED',
      broadcastPublished: false,
      showScoreboardOnYoutube: true,
      activeStreamingProvider: 'youtube',
    });
    matchBId = String(streamB._id);

    await LiveScore.create({
      liveStreamId: streamB._id,
      sportType: 'Cricket',
    });

    await ObsControllerProfile.create({
      matchId: streamA._id,
      connectionMode: 'local_agent',
      activeObsScene: 'Main Camera Scene',
      scoreboardSourceName: 'MaidanLive Scoreboard',
      agentOnline: false,
    });

    const bridge = await ObsBridge.create({
      bridgeId: 'BRG_TEST_SWITCH_1',
      name: 'Arena Laptop Bridge',
      label: 'Arena Laptop Bridge',
      tokenHash: 'hash_test_switch_1',
      tokenPrefix: 'BRG_TST1',
      status: 'ACTIVE',
      assignedMatchIds: [streamA._id],
      activeMatchId: streamA._id,
      ownerUserId: admin._id,
      createdBy: admin._id,
    });
    bridgeDocId = bridge.bridgeId;

    const app = express();
    app.use(express.json());
    app.use('/api/obs', obsBroadcastRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDatabase();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves initial active overlay target from the configured bridge', async () => {
    const res = await apiJson('GET', `/api/obs/overlay/active-target?bridgeId=${bridgeDocId}`);
    assert.equal(res.status, 200);
    assert.equal(res.json.matchId, matchAId);
    assert.equal(res.json.bridgeId, bridgeDocId);
    assert.equal(res.json.source, 'bridge_id');
  });

  it('switches OBS active bridge match, updates scoreboard overlay style & inline match details in 1 click', async () => {
    const res = await apiJson('POST', `/api/obs/matches/${matchBId}/switch-obs-broadcast`, adminToken, {
      sourceMatchId: matchAId,
      keepCurrentObsScene: true,
      syncScoreboardSource: true,
      scoreboardSourceName: 'MaidanLive Scoreboard',
      matchDetails: {
        matchTitle: 'Grand Final: Lions vs Titans',
        teamBName: 'Titans',
        gameName: 'Kabaddi',
        status: 'LIVE',
        broadcastPublished: true,
        showScoreboardOnYoutube: true,
        overlayPatch: {
          style: 'pro_kabaddi_raid',
          fullScoreboardStyle: 'kabaddi_pro_mat_fire',
        },
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.matchId, matchBId);
    assert.equal(res.json.matchDetailsUpdated, true);
    assert.ok(String(res.json.scoreboardOverlayUrl).includes(`/broadcast/overlay/view/${matchBId}`));

    // Bridge now points to Match B and has both matches assigned
    const updatedBridge = await ObsBridge.findOne({ bridgeId: bridgeDocId }).lean();
    assert.ok(updatedBridge);
    assert.equal(String(updatedBridge.activeMatchId), matchBId);
    assert.ok(updatedBridge.assignedMatchIds.map((id) => String(id)).includes(matchBId));

    // Active overlay target endpoint now resolves to Match B
    const activeTarget = await apiJson('GET', `/api/obs/overlay/active-target?bridgeId=${bridgeDocId}`);
    assert.equal(activeTarget.status, 200);
    assert.equal(activeTarget.json.matchId, matchBId);

    // Inline match & LiveScore updates persisted cleanly
    const updatedStream = await LiveStream.findById(matchBId).lean();
    assert.ok(updatedStream);
    assert.equal(updatedStream.matchTitle, 'Grand Final: Lions vs Titans');
    assert.equal(updatedStream.teamBName, 'Titans');
    assert.equal(updatedStream.status, 'LIVE');
    assert.equal(updatedStream.broadcastPublished, true);
    assert.equal((updatedStream as any).overlayConfig.style, 'pro_kabaddi_raid');
    assert.equal((updatedStream as any).overlayConfig.fullScoreboardStyle, 'kabaddi_pro_mat_fire');

    const updatedScore = await LiveScore.findOne({ liveStreamId: matchBId }).lean();
    assert.ok(updatedScore);
    assert.equal(updatedScore.sportType, 'Kabaddi');

    // Audit log recorded MATCH_BROADCAST_SWITCH
    const audit = await BroadcastAuditLog.findOne({
      matchId: matchBId,
      actionType: 'MATCH_BROADCAST_SWITCH',
    }).lean();
    assert.ok(audit);
  });

  it('rejects unassigned broadcaster trying to switch OBS match broadcast', async () => {
    const res = await apiJson(
      'POST',
      `/api/obs/matches/${matchBId}/switch-obs-broadcast`,
      broadcasterToken,
      { keepCurrentObsScene: true, syncScoreboardSource: true }
    );
    assert.equal(res.status, 403);
  });
});
