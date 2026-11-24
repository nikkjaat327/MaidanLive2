import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maidanlive-broadcaster-rbac-'));
const tmpSqlitePath = path.join(tmpDir, 'test.db');
process.env.SQLITE_DB_PATH = tmpSqlitePath;
delete process.env.MONGODB_URI;
process.env.JWT_SECRET = 'test_jwt_secret_for_broadcaster_isolation_suite_12345';
process.env.OBS_SECRET_KEY = 'test_obs_secret_key_for_broadcaster_isolation_12345';
process.env.MAIDANLIVE_SERVER_URL = 'http://localhost:3000';

const { connectDatabase, disconnectDatabase } = await import('../config/db.ts');
const { User } = await import('../models/User.ts');
const { LiveStream } = await import('../models/LiveStream.ts');
const { BroadcastAssignment } = await import('../models/BroadcastAssignment.ts');
const { BroadcastAuditLog } = await import('../models/BroadcastAuditLog.ts');
const { signAuthToken, hasBroadcastAccess } = await import('../middleware/auth.ts');
const obsBroadcastRoutes = (await import('../routes/obsBroadcastRoutes.ts')).default;

let server: http.Server;
let baseUrl = '';
let superAdminToken = '';
let broadcasterToken = '';
let broadcasterUser: any;
let matchAId = '';
let matchBId = '';
let cam1Id = '';

async function apiJson(
  method: string,
  route: string,
  token: string,
  body?: unknown
) {
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

describe('Broadcaster Role Isolation & Super Admin Preservation', () => {
  before(async () => {
    await connectDatabase();

    const superAdmin = await User.create({
      name: 'Root Super Admin',
      email: 'super-rbac@test.local',
      passwordHash: 'not_used',
      role: 'SUPER_ADMIN',
      isActive: true,
    });
    superAdminToken = signAuthToken(superAdmin, 'admin');

    broadcasterUser = await User.create({
      name: 'Field Broadcaster',
      email: 'broadcaster-rbac@test.local',
      passwordHash: 'not_used',
      role: 'BROADCASTER',
      isActive: true,
    });
    broadcasterToken = signAuthToken(broadcasterUser, 'admin');

    const matchA = await LiveStream.create({
      matchTitle: 'Assigned Match A',
      teamAName: 'Eagles',
      teamBName: 'Hawks',
      gameName: 'Cricket',
      status: 'LIVE',
      activeStreamingProvider: 'youtube',
    });
    matchAId = matchA._id.toString();

    const matchB = await LiveStream.create({
      matchTitle: 'Unassigned Match B',
      teamAName: 'Panthers',
      teamBName: 'Wolves',
      gameName: 'Cricket',
      status: 'LIVE',
      activeStreamingProvider: 'youtube',
    });
    matchBId = matchB._id.toString();

    // Even if a legacy assignment contains manage_cameras/manage_overlays, BROADCASTER must never gain admin perms
    await BroadcastAssignment.create({
      userId: broadcasterUser._id,
      role: 'BROADCASTER',
      scopeType: 'match',
      matchId: matchA._id,
      status: 'ACTIVE',
      permissions: ['broadcast:control', 'broadcast:manage_cameras', 'broadcast:manage_overlays'],
      assignedBy: superAdmin._id,
      assignedByName: superAdmin.name,
    });

    await BroadcastAuditLog.create({
      matchId: matchA._id,
      actionType: 'CAMERA_CREATED',
      userId: superAdmin._id,
      userName: superAdmin.name,
      userRole: 'SUPER_ADMIN',
      obsStatus: 'SUCCESS',
    });

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

    // Super Admin creates a Larix camera on Match A
    const createCamRes = await apiJson(
      'POST',
      `/api/obs/matches/${matchAId}/cameras`,
      superAdminToken,
      {
        name: 'Pitch Cam 1',
        label: 'Pitch Cam 1',
        sourceType: 'mediamtx',
        streamProtocol: 'rtmp',
      }
    );
    assert.equal(createCamRes.status, 201);
    cam1Id = createCamRes.json.camera.cameraId;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDatabase();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('enforces hasBroadcastAccess RBAC boundaries for BROADCASTER', async () => {
    assert.equal(await hasBroadcastAccess(broadcasterUser, matchAId, 'broadcast:control'), true);
    assert.equal(await hasBroadcastAccess(broadcasterUser, matchAId, 'broadcast:manage_cameras'), false);
    assert.equal(await hasBroadcastAccess(broadcasterUser, matchAId, 'broadcast:manage_overlays'), false);
    assert.equal(await hasBroadcastAccess(broadcasterUser, matchAId, 'broadcast:override'), false);
    assert.equal(await hasBroadcastAccess(broadcasterUser, matchAId, 'broadcast:stream_control'), false);
    assert.equal(await hasBroadcastAccess(broadcasterUser, matchBId, 'broadcast:control'), false);
  });

  it('allows SUPER_ADMIN full studio details, camera config, audit logs, and MediaMTX config', async () => {
    const studioRes = await apiJson('GET', `/api/obs/matches/${matchAId}/studio`, superAdminToken);
    assert.equal(studioRes.status, 200);
    assert.equal(studioRes.json.permissions.canManageCameras, true);
    assert.equal(studioRes.json.permissions.canManageOverlays, true);
    assert.ok(studioRes.json.auditLogs.length >= 1);
    assert.ok(studioRes.json.operators.length >= 1);
    assert.ok(studioRes.json.scoreboardOverlayUrl.includes('/broadcast/overlay/view/'));
    assert.ok(studioRes.json.cameras[0].larixConfig?.streamKey);

    const auditRes = await apiJson('GET', `/api/obs/matches/${matchAId}/audit-logs`, superAdminToken);
    assert.equal(auditRes.status, 200);

    const mtxRes = await apiJson('GET', `/api/obs/matches/${matchAId}/mediamtx/config`, superAdminToken);
    assert.equal(mtxRes.status, 200);
  });

  it('sanitizes studio payload and scopes dashboard strictly to assigned matches for BROADCASTER', async () => {
    const dashRes = await apiJson('GET', '/api/obs/broadcaster/dashboard', broadcasterToken);
    assert.equal(dashRes.status, 200);
    assert.equal(dashRes.json.matches.length, 1);
    assert.equal(dashRes.json.matches[0].id, matchAId);

    const studioRes = await apiJson('GET', `/api/obs/matches/${matchAId}/studio`, broadcasterToken);
    assert.equal(studioRes.status, 200);
    assert.equal(studioRes.json.permissions.canManageCameras, false);
    assert.equal(studioRes.json.permissions.canManageOverlays, false);
    assert.equal(studioRes.json.permissions.canOverride, false);
    assert.deepEqual(studioRes.json.auditLogs, []);
    assert.deepEqual(studioRes.json.operators, []);
    assert.equal(studioRes.json.scoreboardOverlayUrl, '');
    assert.equal(studioRes.json.cameras[0].larixConfig, null);

    // Unassigned Match B is forbidden
    const unauthStudio = await apiJson('GET', `/api/obs/matches/${matchBId}/studio`, broadcasterToken);
    assert.equal(unauthStudio.status, 403);
  });

  it('blocks BROADCASTER with 403 on all Super Admin camera, OBS, bridge, MediaMTX, and audit routes', async () => {
    const forbiddenCalls: Array<[string, string, unknown?]> = [
      ['POST', `/api/obs/matches/${matchAId}/cameras`, { name: 'Rogue Cam', sourceType: 'vdoninja' }],
      ['PATCH', `/api/obs/matches/${matchAId}/cameras/${cam1Id}`, { name: 'Renamed' }],
      ['DELETE', `/api/obs/matches/${matchAId}/cameras/${cam1Id}`],
      ['POST', `/api/obs/matches/${matchAId}/cameras/${cam1Id}/transform`, { previewFit: 'cover' }],
      ['POST', `/api/obs/matches/${matchAId}/cameras/map-sources`, { mappings: [] }],
      ['PATCH', `/api/obs/matches/${matchAId}/profile`, { obsHost: '1.2.3.4' }],
      ['POST', `/api/obs/matches/${matchAId}/agent-token`],
      ['POST', `/api/obs/matches/${matchAId}/test-connection`, {}],
      ['POST', `/api/obs/matches/${matchAId}/connect`, {}],
      ['POST', `/api/obs/matches/${matchAId}/disconnect`],
      ['POST', `/api/obs/matches/${matchAId}/scenes/refresh`],
      ['GET', '/api/obs/bridges'],
      ['POST', '/api/obs/bridges', { name: 'Rogue Bridge' }],
      ['POST', '/api/obs/bridges/pairing-code', { matchId: matchAId }],
      ['GET', `/api/obs/matches/${matchAId}/mediamtx/config`],
      ['GET', `/api/obs/matches/${matchAId}/mediamtx/yaml`],
      ['POST', `/api/obs/matches/${matchAId}/mediamtx/control`, { action: 'status' }],
      ['GET', `/api/obs/matches/${matchAId}/audit-logs`],
      ['PATCH', `/api/obs/matches/${matchAId}/youtube`, { youtubeInput: 'dQw4w9WgXcQ' }],
      ['POST', `/api/obs/matches/${matchAId}/scenes`, { name: 'Rogue', obsSceneName: 'Rogue' }],
      ['POST', `/api/obs/matches/${matchAId}/scenes/switch`, { sceneName: 'Scene 1' }],
      ['POST', `/api/obs/matches/${matchAId}/override`, { locked: true }],
    ];

    for (const [method, route, body] of forbiddenCalls) {
      const res = await apiJson(method, route, broadcasterToken, body);
      assert.equal(res.status, 403, `Expected 403 for ${method} ${route}, got ${res.status}`);
    }
  });

  it('permits BROADCASTER camera switch and layout apply authorization on assigned match', async () => {
    const switchRes = await apiJson(
      'POST',
      `/api/obs/matches/${matchAId}/cameras/${cam1Id}/switch`,
      broadcasterToken,
      {}
    );
    // Passes authz (not 403); fails with 503 only because OBS Studio is not connected in test harness
    assert.notEqual(switchRes.status, 403);
    assert.notEqual(switchRes.status, 401);

    const layoutRes = await apiJson(
      'POST',
      `/api/obs/matches/${matchAId}/layouts/apply`,
      broadcasterToken,
      { layoutType: 'SPLIT_2_H', cameraIds: [cam1Id], includeScoreboardOverlay: true }
    );
    assert.notEqual(layoutRes.status, 403);
    assert.notEqual(layoutRes.status, 401);
  });
});
