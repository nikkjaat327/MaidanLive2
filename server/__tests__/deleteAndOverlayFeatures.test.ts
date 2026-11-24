import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maidanlive-delete-overlay-'));
const tmpSqlitePath = path.join(tmpDir, 'test.db');
process.env.SQLITE_DB_PATH = tmpSqlitePath;
delete process.env.MONGODB_URI;
process.env.JWT_SECRET = 'test_jwt_secret_for_delete_and_overlay_suite_12345';
process.env.OBS_SECRET_KEY = 'test_obs_secret_key_for_delete_and_overlay_12345';
process.env.MAIDANLIVE_SERVER_URL = 'http://localhost:3000';

const { connectDatabase, disconnectDatabase } = await import('../config/db.ts');
const { User } = await import('../models/User.ts');
const { LiveStream } = await import('../models/LiveStream.ts');
const { LiveScore } = await import('../models/LiveScore.ts');
const { Fixture } = await import('../models/Fixture.ts');
const { BroadcastCamera } = await import('../models/BroadcastCamera.ts');
const { ObsControllerProfile } = await import('../models/ObsControllerProfile.ts');
const { ObsBridge } = await import('../models/ObsBridge.ts');
const { signAuthToken } = await import('../middleware/auth.ts');
const liveStreamRoutes = (await import('../routes/liveStreamRoutes.ts')).default;
const { applyOverlayQueryParams, normalizeOverlayConfig } = await import(
  '../../src/utils/overlayConfig.ts'
);
const { extractYouTubeVideoId } = await import('../../src/utils/youtube.ts');

let server: http.Server;
let baseUrl = '';
let superAdminToken = '';
let adminToken = '';
let broadcasterToken = '';
let scorerToken = '';

async function apiJson(method: string, route: string, token: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
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

describe('Match Deletion RBAC, Sponsor Ad Overlay & YouTube Header Link Parsing', () => {
  before(async () => {
    await connectDatabase();

    const superAdmin = await User.create({
      name: 'Super Admin',
      email: 'superadmin-del@test.local',
      passwordHash: 'not_used',
      role: 'SUPER_ADMIN',
      isActive: true,
    });
    superAdminToken = signAuthToken(superAdmin, 'admin');

    const admin = await User.create({
      name: 'Org Admin',
      email: 'admin-del@test.local',
      passwordHash: 'not_used',
      role: 'ADMIN',
      isActive: true,
    });
    adminToken = signAuthToken(admin, 'admin');

    const broadcaster = await User.create({
      name: 'Broadcaster',
      email: 'broadcaster-del@test.local',
      passwordHash: 'not_used',
      role: 'BROADCASTER',
      isActive: true,
    });
    broadcasterToken = signAuthToken(broadcaster, 'admin');

    const scorer = await User.create({
      name: 'Scorer',
      email: 'scorer-del@test.local',
      passwordHash: 'not_used',
      role: 'SCORER',
      isActive: true,
    });
    scorerToken = signAuthToken(scorer, 'admin');

    const app = express();
    app.use(express.json());
    app.use('/api/live', liveStreamRoutes);

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

  it('allows SUPER_ADMIN and ADMIN to delete prepared drafts, live, and ended matches with full cascade cleanup', async () => {
    const mongoose = await import('mongoose');
    const orgUser = await User.findOne({ email: 'superadmin-del@test.local' });
    const fixture = await Fixture.create({
      tournamentId: new mongoose.Types.ObjectId(),
      roundNumber: 1,
      roundName: 'QF',
      matchNumber: 1,
      teamAName: 'Lions',
      teamBName: 'Tigers',
      status: 'LIVE',
      createdBy: orgUser!._id,
    });

    const draftStream = await LiveStream.create({
      matchTitle: 'Prepared Draft Match',
      teamAName: 'Falcons',
      teamBName: 'Titans',
      gameName: 'Cricket',
      status: 'UPCOMING',
      broadcastPhase: 'MATCH_PREPARED',
      broadcastPublished: false,
      activeStreamingProvider: 'youtube',
    });

    const liveStream = await LiveStream.create({
      matchTitle: 'Live Match To Delete',
      teamAName: 'Lions',
      teamBName: 'Tigers',
      gameName: 'Kabaddi',
      status: 'LIVE',
      broadcastPhase: 'BROADCAST_ACTIVE',
      broadcastPublished: true,
      fixtureId: fixture._id,
      activeStreamingProvider: 'youtube',
    });

    const endedStream = await LiveStream.create({
      matchTitle: 'Completed Match To Delete',
      teamAName: 'Knights',
      teamBName: 'Royals',
      gameName: 'Football',
      status: 'ENDED',
      broadcastPhase: 'BROADCAST_ENDED',
      broadcastPublished: true,
      activeStreamingProvider: 'youtube',
    });

    fixture.liveStreamId = liveStream._id as any;
    await fixture.save();

    await LiveScore.create({
      liveStreamId: liveStream._id,
      sportType: 'Kabaddi',
      teamAScore: 24,
      teamBScore: 18,
    });
    await BroadcastCamera.create({
      matchId: liveStream._id,
      cameraId: 'cam-del-1',
      name: 'Main Cam',
      label: 'Main Cam',
      sourceType: 'vdoninja',
    });
    await ObsControllerProfile.create({
      matchId: liveStream._id,
      connectionMode: 'local_agent',
    });
    const bridge = await ObsBridge.create({
      bridgeId: 'bridge-del-test',
      name: 'Test Bridge',
      label: 'Test Bridge',
      tokenHash: 'hash_del_test',
      tokenPrefix: 'mb_',
      assignedMatchIds: [liveStream._id],
      activeMatchId: liveStream._id,
    });

    // BROADCASTER and SCORER must be strictly rejected (403)
    const broadcasterRes = await apiJson(
      'DELETE',
      `/api/live/${draftStream._id.toString()}`,
      broadcasterToken
    );
    assert.equal(broadcasterRes.status, 403);

    const scorerRes = await apiJson(
      'DELETE',
      `/api/live/${endedStream._id.toString()}`,
      scorerToken
    );
    assert.equal(scorerRes.status, 403);

    // SUPER_ADMIN deletes MATCH_PREPARED draft and LIVE match
    const delDraftRes = await apiJson(
      'DELETE',
      `/api/live/${draftStream._id.toString()}`,
      superAdminToken
    );
    assert.equal(delDraftRes.status, 200);
    assert.equal(delDraftRes.json.deleted, true);
    assert.equal(await LiveStream.findById(draftStream._id), null);

    const delLiveRes = await apiJson(
      'DELETE',
      `/api/live/${liveStream._id.toString()}`,
      superAdminToken
    );
    assert.equal(delLiveRes.status, 200);
    assert.equal(delLiveRes.json.deleted, true);
    assert.equal(await LiveStream.findById(liveStream._id), null);
    assert.equal(await LiveScore.findOne({ liveStreamId: liveStream._id }), null);
    assert.equal(await BroadcastCamera.findOne({ matchId: liveStream._id }), null);
    assert.equal(await ObsControllerProfile.findOne({ matchId: liveStream._id }), null);

    const updatedFixture = await Fixture.findById(fixture._id);
    assert.equal(updatedFixture?.liveStreamId ?? null, null);
    assert.equal(updatedFixture?.status, 'SCHEDULED');

    const updatedBridge = await ObsBridge.findById(bridge._id);
    assert.equal(updatedBridge?.activeMatchId ?? null, null);
    assert.equal(updatedBridge?.assignedMatchIds?.length, 0);

    // ADMIN deletes ENDED match
    const delEndedRes = await apiJson(
      'DELETE',
      `/api/live/${endedStream._id.toString()}`,
      adminToken
    );
    assert.equal(delEndedRes.status, 200);
    assert.equal(delEndedRes.json.deleted, true);
    assert.equal(await LiveStream.findById(endedStream._id), null);

    // Invalid ID & Missing ID validation
    const invalidRes = await apiJson('DELETE', '/api/live/not-an-id', superAdminToken);
    assert.equal(invalidRes.status, 400);

    const missingRes = await apiJson(
      'DELETE',
      `/api/live/${liveStream._id.toString()}`,
      superAdminToken
    );
    assert.equal(missingRes.status, 404);
  });

  it('persists and normalizes 1-button Sponsor Ad overlay settings on server and query params', async () => {
    const match = await LiveStream.create({
      matchTitle: 'Sponsor Ad Sync Match',
      teamAName: 'Alpha',
      teamBName: 'Beta',
      gameName: 'Cricket',
      status: 'LIVE',
      activeStreamingProvider: 'youtube',
    });

    const patchRes = await apiJson(
      'PATCH',
      `/api/live/${match._id.toString()}/overlay`,
      adminToken,
      {
        sponsorAdVisible: true,
        sponsorAdId: 'sp_123',
        sponsorAdName: 'Apex Energy Drink',
        sponsorAdTagline: 'Fueling Champions',
        sponsorAdLogoUrl: 'https://cdn.example.com/apex.png',
        sponsorAdCta: 'OFFICIAL PARTNER',
        sponsorAdPosition: 'bottom-right',
      }
    );
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.json.overlayConfig.sponsorAdVisible, true);
    assert.equal(patchRes.json.overlayConfig.sponsorAdName, 'Apex Energy Drink');
    assert.equal(patchRes.json.overlayConfig.sponsorAdPosition, 'bottom-right');

    const normalized = normalizeOverlayConfig({
      sponsorAdVisible: 'true' as any,
      sponsorAdPosition: 'invalid-pos' as any,
      sponsorAdName: 'Test Brand',
    });
    assert.equal(normalized.sponsorAdVisible, false);
    assert.equal(normalized.sponsorAdPosition, 'top-right');
    assert.equal(normalized.sponsorAdName, 'Test Brand');

    const withQuery = applyOverlayQueryParams(
      normalized,
      '?sponsorAdVisible=1&sponsorAdPosition=top-left'
    );
    assert.equal(withQuery.sponsorAdVisible, true);
    assert.equal(withQuery.sponsorAdName, 'Test Brand');
    assert.equal(withQuery.sponsorAdPosition, 'top-left');
  });

  it('parses YouTube URLs cleanly for the always-visible header live preview input', () => {
    assert.equal(
      extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ').videoId,
      'dQw4w9WgXcQ'
    );
    assert.equal(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=12').videoId, 'dQw4w9WgXcQ');
    assert.equal(
      extractYouTubeVideoId('https://www.youtube.com/live/dQw4w9WgXcQ').videoId,
      'dQw4w9WgXcQ'
    );
    assert.equal(
      extractYouTubeVideoId('https://youtube.com/shorts/dQw4w9WgXcQ').videoId,
      'dQw4w9WgXcQ'
    );
    assert.equal(extractYouTubeVideoId('dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
    assert.equal(extractYouTubeVideoId('https://example.com/not-youtube').valid, false);
  });
});
