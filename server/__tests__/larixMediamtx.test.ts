import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maidanlive-larix-test-'));
const tmpSqlitePath = path.join(tmpDir, 'test.db');
process.env.SQLITE_DB_PATH = tmpSqlitePath;
delete process.env.MONGODB_URI;
process.env.JWT_SECRET = 'test_jwt_secret_for_larix_mediamtx_suite_12345';
process.env.OBS_SECRET_KEY = 'test_obs_secret_key_for_larix_mediamtx_12345';
process.env.MEDIAMTX_WEBHOOK_SECRET = 'test_webhook_secret_12345';
process.env.MAIDANLIVE_SERVER_URL = 'http://localhost:3000';

const { connectDatabase, disconnectDatabase } = await import('../config/db.ts');
const { User } = await import('../models/User.ts');
const { LiveStream } = await import('../models/LiveStream.ts');
const { BroadcastCamera } = await import('../models/BroadcastCamera.ts');
const { signAuthToken } = await import('../middleware/auth.ts');
const {
  buildLarixCameraConfig,
  generateMediaMTXYamlConfig,
  getMediaMTXEnvConfig,
  isValidMediaSourceUrl,
} = await import('../services/mediamtxService.ts');
const {
  buildObsEnsureInputForCamera,
  formatSafeCamera,
} = await import('../services/obsControllerService.ts');
const v1Routes = (await import('../routes/v1Routes.ts')).default;
const obsBroadcastRoutes = (await import('../routes/obsBroadcastRoutes.ts')).default;

let server: http.Server;
let baseUrl = '';
let adminToken = '';
let matchAId = '';
let matchBId = '';
let endedMatchId = '';

async function apiJson(
  method: string,
  route: string,
  body?: unknown,
  headers: Record<string, string> = {}
) {
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
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

describe('Larix Broadcaster + MediaMTX + VDO.Ninja Dual Workflow', () => {
  before(async () => {
    await connectDatabase();

    const adminUser = await User.create({
      name: 'Test Super Admin',
      email: 'larix-admin@test.local',
      passwordHash: 'not_used_in_token_test',
      role: 'SUPER_ADMIN',
      isActive: true,
    });
    adminToken = signAuthToken(adminUser, 'admin');

    const matchA = await LiveStream.create({
      matchTitle: 'Match A — Lions vs Tigers',
      teamAName: 'Lions',
      teamBName: 'Tigers',
      gameName: 'Cricket',
      tournamentName: 'District Cup',
      status: 'LIVE',
      activeStreamingProvider: 'youtube',
    });
    matchAId = matchA._id.toString();

    const matchB = await LiveStream.create({
      matchTitle: 'Match B — Eagles vs Hawks',
      teamAName: 'Eagles',
      teamBName: 'Hawks',
      gameName: 'Kabaddi',
      tournamentName: 'District Cup',
      status: 'LIVE',
      activeStreamingProvider: 'youtube',
    });
    matchBId = matchB._id.toString();

    const endedMatch = await LiveStream.create({
      matchTitle: 'Ended Match',
      teamAName: 'Alpha',
      teamBName: 'Beta',
      gameName: 'Cricket',
      tournamentName: 'District Cup',
      status: 'ENDED',
      activeStreamingProvider: 'youtube',
    });
    endedMatchId = endedMatch._id.toString();

    const app = express();
    app.use(express.json());
    app.use('/api/v1', v1Routes);
    app.use('/api/obs', obsBroadcastRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
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

  it('centralizes all MediaMTX and server URLs via .env without code changes', () => {
    const orig = {
      MEDIAMTX_RTMP_URL: process.env.MEDIAMTX_RTMP_URL,
      MEDIAMTX_SRT_URL: process.env.MEDIAMTX_SRT_URL,
      MEDIAMTX_HLS_URL: process.env.MEDIAMTX_HLS_URL,
      MEDIAMTX_WEBRTC_URL: process.env.MEDIAMTX_WEBRTC_URL,
      MEDIAMTX_OBS_RTMP_URL: process.env.MEDIAMTX_OBS_RTMP_URL,
      MEDIAMTX_OBS_SRT_URL: process.env.MEDIAMTX_OBS_SRT_URL,
      MEDIAMTX_API_URL: process.env.MEDIAMTX_API_URL,
    };

    try {
      process.env.MEDIAMTX_RTMP_URL = 'rtmp://stream.example.com:1935';
      process.env.MEDIAMTX_SRT_URL = 'srt://stream.example.com:8890';
      process.env.MEDIAMTX_HLS_URL = 'https://cdn.example.com/hls';
      process.env.MEDIAMTX_WEBRTC_URL = 'https://cdn.example.com/rtc';
      process.env.MEDIAMTX_API_URL = 'http://127.0.0.1:9997';
      delete process.env.MEDIAMTX_OBS_RTMP_URL;
      delete process.env.MEDIAMTX_OBS_SRT_URL;

      const env = getMediaMTXEnvConfig();
      assert.equal(env.rtmpBase, 'rtmp://stream.example.com:1935');
      assert.equal(env.srtBase, 'srt://stream.example.com:8890');
      assert.equal(env.hlsBase, 'https://cdn.example.com/hls');
      assert.equal(env.webrtcBase, 'https://cdn.example.com/rtc');
      assert.equal(env.obsRtmpBase, 'rtmp://stream.example.com:1935');
      assert.equal(env.obsSrtBase, 'srt://stream.example.com:8890');

      const cfg = buildLarixCameraConfig({
        matchId: 'match123',
        cameraId: 'cam1',
        cameraName: 'Boundary Cam',
        protocol: 'rtmp',
        streamPath: 'cam_match123_cam1',
        streamKey: 'mllrx_abc123',
      });
      assert.equal(cfg.rtmpFullUrl, 'rtmp://stream.example.com:1935/cam_match123_cam1?key=mllrx_abc123');
      assert.equal(cfg.usesLocalhostIngest, false);
      assert.ok(cfg.larixDeepLinkUrl.startsWith('larix://set/v1?'));

      const yaml = generateMediaMTXYamlConfig('https://live.example.com');
      assert.ok(yaml.includes('authHTTPAddress: https://live.example.com/api/v1/mediamtx/auth'));
      assert.ok(!yaml.includes('- action: read'));
    } finally {
      Object.entries(orig).forEach(([k, v]) => {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      });
    }
  });

  it('validates media source URLs strictly and rejects injection/invalid schemes', () => {
    assert.equal(isValidMediaSourceUrl('rtmp://127.0.0.1:1935/cam_a?key=abc'), true);
    assert.equal(isValidMediaSourceUrl('srt://192.168.1.20:8890?streamid=publish:cam:larix:k'), true);
    assert.equal(isValidMediaSourceUrl('https://vdo.ninja/?view=cam1'), true);
    assert.equal(isValidMediaSourceUrl('javascript:alert(1)'), false);
    assert.equal(isValidMediaSourceUrl('file:///etc/passwd'), false);
    assert.equal(isValidMediaSourceUrl('rtmp://127.0.0.1:1935/cam\nmalicious'), false);
    assert.equal(isValidMediaSourceUrl('rtmp://127.0.0.1:1935/cam"quote'), false);
  });

  it('preserves VDO.Ninja camera creation & OBS browser_source completely when MediaMTX is unused', async () => {
    const res = await apiJson(
      'POST',
      `/api/obs/matches/${matchAId}/cameras`,
      {
        name: 'VDO Cam 1',
        label: 'Main Bowler End',
        cameraType: 'smartphone_vdo',
        sourceType: 'vdoninja',
      },
      { Authorization: `Bearer ${adminToken}` }
    );

    assert.equal(res.status, 201);
    assert.equal(res.json.camera.sourceType, 'vdoninja');
    assert.equal(res.json.camera.streamProtocol, 'vdoninja');
    assert.ok(res.json.mobileConnectUrl);
    assert.ok(res.json.camera.vdoPushUrl.includes('vdo.ninja'));
    assert.ok(res.json.camera.obsBrowserSourceUrl.includes('vdo.ninja'));
    assert.equal(res.json.camera.larixConfig, null);

    const obsInput = buildObsEnsureInputForCamera(res.json.camera, { matchId: matchAId });
    assert.ok(obsInput);
    assert.equal(obsInput!.inputKind, 'browser_source');
    assert.ok(obsInput!.inputSettings.url.includes('vdo.ninja'));
  });

  it('provisions Larix RTMP & SRT cameras with scoped credentials, strips private URLs when unprivileged, rotates & revokes cleanly', async () => {
    // 1. Create Larix RTMP camera in Match A
    const createRes = await apiJson(
      'POST',
      `/api/obs/matches/${matchAId}/cameras`,
      {
        name: 'Larix RTMP Cam',
        label: 'Fine Leg Larix',
        cameraType: 'rtmp_mediamtx',
        sourceType: 'mediamtx',
        streamProtocol: 'rtmp',
      },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert.equal(createRes.status, 201);
    const cam = createRes.json.camera;
    assert.equal(cam.sourceType, 'mediamtx');
    assert.equal(cam.streamProtocol, 'rtmp');
    assert.ok(cam.mediamtxStreamPath.startsWith('cam_'));
    assert.ok(cam.larixConfig?.streamKey.startsWith('mllrx_'));
    assert.ok(cam.larixConfig?.obsPullUrl.startsWith('rtmp://127.0.0.1:1935/'));

    // Private fields stripped when includePrivateUrls = false (Socket.IO broadcast safety)
    const rawDoc = await BroadcastCamera.findOne({ matchId: matchAId, cameraId: cam.cameraId })
      .select('+mediamtxStreamKeyEnc +mediamtxStreamKeyHash')
      .lean();
    const publicFormatted = formatSafeCamera(rawDoc, { matchId: matchAId }, { includePrivateUrls: false });
    assert.equal(publicFormatted.larixConfig, null);
    assert.equal((publicFormatted as any).mediamtxStreamKeyEnc, undefined);
    assert.equal((publicFormatted as any).mediamtxStreamKeyHash, undefined);

    // OBS ensure input uses ffmpeg_source with reconnect
    const obsInputRtmp = buildObsEnsureInputForCamera(rawDoc, { matchId: matchAId });
    assert.ok(obsInputRtmp);
    assert.equal(obsInputRtmp!.inputKind, 'ffmpeg_source');
    assert.equal(obsInputRtmp!.inputSettings.restart_on_activate, true);
    assert.ok(String(obsInputRtmp!.inputSettings.input).includes(cam.larixConfig.streamKey));

    // 2. Create Larix SRT camera in Match B
    const createBRes = await apiJson(
      'POST',
      `/api/obs/matches/${matchBId}/cameras`,
      {
        name: 'Larix SRT Cam',
        label: 'Mat Side SRT',
        sourceType: 'mediamtx',
        streamProtocol: 'srt',
      },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert.equal(createBRes.status, 201);
    const camB = createBRes.json.camera;
    assert.equal(camB.streamProtocol, 'srt');
    assert.ok(camB.larixConfig?.srtFullUrl.startsWith('srt://'));
    assert.ok(camB.larixConfig?.obsPullUrl.startsWith('srt://127.0.0.1:8890'));

    // 3. Test MediaMTX Auth: valid Match A publish succeeds
    const oldKey = cam.larixConfig.streamKey;
    const validAuth = await apiJson('POST', '/api/v1/mediamtx/auth', {
      action: 'publish',
      path: cam.mediamtxStreamPath,
      query: `key=${encodeURIComponent(oldKey)}`,
      ip: '192.168.1.55',
    });
    assert.equal(validAuth.status, 200);
    assert.equal(validAuth.json.ok, true);

    // Wrong key rejected
    const badKeyAuth = await apiJson('POST', '/api/v1/mediamtx/auth', {
      action: 'publish',
      path: cam.mediamtxStreamPath,
      query: 'key=mllrx_wrong_key',
      ip: '192.168.1.55',
    });
    assert.equal(badKeyAuth.status, 403);

    // Cross-match isolation: Match A's key cannot publish to Match B's path
    const crossMatchAuth = await apiJson('POST', '/api/v1/mediamtx/auth', {
      action: 'publish',
      path: camB.mediamtxStreamPath,
      password: oldKey,
      ip: '192.168.1.55',
    });
    assert.equal(crossMatchAuth.status, 403);

    // Unauthorized external read blocked; loopback OBS read allowed
    const extReadDenied = await apiJson('POST', '/api/v1/mediamtx/auth', {
      action: 'read',
      path: cam.mediamtxStreamPath,
      ip: '203.0.113.10',
    });
    assert.equal(extReadDenied.status, 403);

    const localReadAllowed = await apiJson('POST', '/api/v1/mediamtx/auth', {
      action: 'read',
      path: cam.mediamtxStreamPath,
      ip: '127.0.0.1',
    });
    assert.equal(localReadAllowed.status, 200);

    // 4. Webhook publish & unpublish updates camera connection state
    const webhookOff = await apiJson(
      'POST',
      '/api/v1/mediamtx/webhook',
      {
        event: 'unpublish',
        path: cam.mediamtxStreamPath,
      },
      { 'x-mediamtx-secret': 'test_webhook_secret_12345' }
    );
    assert.equal(webhookOff.status, 200);
    assert.equal(webhookOff.json.mediamtxPublisherConnected, false);

    // 5. Rotate Larix key -> old key rejected, new key accepted
    const rotateRes = await apiJson(
      'POST',
      `/api/obs/matches/${matchAId}/cameras/${cam.cameraId}/larix/rotate`,
      { syncObs: false },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert.equal(rotateRes.status, 200);
    const newKey = rotateRes.json.camera.larixConfig.streamKey;
    assert.notEqual(newKey, oldKey);

    const oldAfterRotate = await apiJson('POST', '/api/v1/mediamtx/auth', {
      action: 'publish',
      path: cam.mediamtxStreamPath,
      query: `key=${encodeURIComponent(oldKey)}`,
      ip: '192.168.1.55',
    });
    assert.equal(oldAfterRotate.status, 403);

    const newAfterRotate = await apiJson('POST', '/api/v1/mediamtx/auth', {
      action: 'publish',
      path: cam.mediamtxStreamPath,
      query: `key=${encodeURIComponent(newKey)}`,
      ip: '192.168.1.55',
    });
    assert.equal(newAfterRotate.status, 200);

    // 6. Revoke Larix key -> auth returns 403, OBS builder returns undefined, larixConfig omitted
    const revokeRes = await apiJson(
      'POST',
      `/api/obs/matches/${matchAId}/cameras/${cam.cameraId}/larix/revoke`,
      {},
      { Authorization: `Bearer ${adminToken}` }
    );
    assert.equal(revokeRes.status, 200);
    assert.equal(revokeRes.json.camera.mediamtxRevoked, true);
    assert.equal(revokeRes.json.camera.larixConfig, null);

    const afterRevokeAuth = await apiJson('POST', '/api/v1/mediamtx/auth', {
      action: 'publish',
      path: cam.mediamtxStreamPath,
      query: `key=${encodeURIComponent(newKey)}`,
      ip: '192.168.1.55',
    });
    assert.equal(afterRevokeAuth.status, 403);

    const revokedDoc = await BroadcastCamera.findOne({ matchId: matchAId, cameraId: cam.cameraId })
      .select('+mediamtxStreamKeyEnc')
      .lean();
    assert.equal(buildObsEnsureInputForCamera(revokedDoc, { matchId: matchAId }), undefined);
  });

  it('blocks MediaMTX publish auth on ENDED matches', async () => {
    const endedCamRes = await apiJson(
      'POST',
      `/api/obs/matches/${endedMatchId}/cameras`,
      {
        name: 'Ended Match Larix',
        label: 'Archive Cam',
        sourceType: 'mediamtx',
      },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert.equal(endedCamRes.status, 201);
    const endedCam = endedCamRes.json.camera;

    const authEnded = await apiJson('POST', '/api/v1/mediamtx/auth', {
      action: 'publish',
      path: endedCam.mediamtxStreamPath,
      query: `key=${encodeURIComponent(endedCam.larixConfig.streamKey)}`,
      ip: '192.168.1.99',
    });
    assert.equal(authEnded.status, 403);
  });

  it('serves centralized MediaMTX config & YAML via GET /api/obs/matches/:matchId/mediamtx/config', async () => {
    const cfgRes = await apiJson(
      'GET',
      `/api/obs/matches/${matchBId}/mediamtx/config`,
      undefined,
      { Authorization: `Bearer ${adminToken}` }
    );
    assert.equal(cfgRes.status, 200);
    assert.equal(cfgRes.json.ok, true);
    assert.ok(cfgRes.json.envConfig.rtmpBase);
    assert.ok(cfgRes.json.envConfig.srtBase);
    assert.ok(cfgRes.json.yamlConfig.includes('/api/v1/mediamtx/auth'));
    assert.equal(cfgRes.json.cameras.length, 1);
    assert.equal(cfgRes.json.cameras[0].protocol, 'srt');
  });
});
