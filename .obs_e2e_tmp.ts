import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import express from 'express';
import { Server as IoServer } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { WebSocketServer } from 'ws';
import { encode as msgpackEncode, decode as msgpackDecode } from '@msgpack/msgpack';

process.env.SQLITE_DB_PATH = '/tmp/obs_e2e_test.db';

import { setActiveDbEngine } from './server/db/engineState.ts';
import { connectDatabase } from './server/config/db.ts';
import { User } from './server/models/User.ts';
import { UserSession } from './server/models/UserSession.ts';
import { LiveStream } from './server/models/LiveStream.ts';
import { ObsControllerProfile } from './server/models/ObsControllerProfile.ts';
import { BroadcastAuditLog } from './server/models/BroadcastAuditLog.ts';
import { signAuthToken } from './server/middleware/auth.ts';
import { initSocketServer } from './backend/realtime/socket.ts';
import { initObsControllerBridge } from './server/services/obsControllerService.ts';
import obsBroadcastRoutes from './server/routes/obsBroadcastRoutes.ts';

function sha256Base64(str: string): string {
  return crypto.createHash('sha256').update(str).digest('base64');
}

function createObsV5MockServer(password = 'obsSecret123') {
  const state = {
    currentScene: 'CAM 1 FULL',
    scenes: new Set<string>(['CAM 1 FULL', 'CAM 2 FULL', 'Intro']),
    inputs: new Map<string, { kind: string; settings: Record<string, any> }>([
      ['ML_CAM_1', { kind: 'browser_source', settings: { url: 'https://vdo.ninja/?view=cam1' } }],
    ]),
    sceneItems: new Map<string, Array<{ sceneItemId: number; sourceName: string; inputKind: string; sceneItemEnabled: boolean; transform?: any }>>([
      ['CAM 1 FULL', [{ sceneItemId: 1, sourceName: 'ML_CAM_1', inputKind: 'browser_source', sceneItemEnabled: true }]],
      ['CAM 2 FULL', []],
      ['Intro', []],
    ]),
    nextItemId: 10,
    lastTransformBySource: new Map<string, any>(),
    streamActive: true,
    streamTimecode: '00:12:45.100',
  };

  const wss = new WebSocketServer({
    port: 0,
    handleProtocols: (protocols) => {
      if (protocols.has('obswebsocket.msgpack')) return 'obswebsocket.msgpack';
      if (protocols.has('obswebsocket.json')) return 'obswebsocket.json';
      return false;
    },
  });

  wss.on('connection', (ws) => {
    const useMsgpack = ws.protocol === 'obswebsocket.msgpack';
    const sendMsg = (obj: any) => {
      if (useMsgpack) {
        ws.send(Buffer.from(msgpackEncode(obj)));
      } else {
        ws.send(JSON.stringify(obj));
      }
    };

    const challenge = 'e2eChallengeSalt1';
    const salt = 'e2eSaltString1';
    const expectedAuth = sha256Base64(sha256Base64(password + salt) + challenge);

    setTimeout(() => {
      sendMsg({
        op: 0,
        d: {
          obsStudioVersion: '30.2.3',
          obsWebSocketVersion: '5.5.2',
          rpcVersion: 1,
          authentication: { challenge, salt },
        },
      });
    }, 10);

    ws.on('message', (raw) => {
      const msg: any = useMsgpack
        ? msgpackDecode(raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer))
        : JSON.parse(String(raw));

      if (msg.op === 1) {
        if (password && msg.d?.authentication !== expectedAuth) {
          ws.close(4009, 'Authentication failed');
          return;
        }
        sendMsg({ op: 2, d: { negotiatedRpcVersion: 1 } });
        return;
      }

      if (msg.op === 6) {
        const { requestType, requestId, requestData = {} } = msg.d;
        let responseData: any = {};
        let result = true;
        let code = 100;
        let comment = '';

        try {
          if (requestType === 'GetVersion') {
            responseData = { obsVersion: '30.2.3', obsWebSocketVersion: '5.5.2', rpcVersion: 1 };
          } else if (requestType === 'GetSceneList') {
            responseData = {
              currentProgramSceneName: state.currentScene,
              scenes: Array.from(state.scenes).map((sceneName, idx) => ({ sceneName, sceneIndex: idx })),
            };
          } else if (requestType === 'GetCurrentProgramScene') {
            responseData = { currentProgramSceneName: state.currentScene };
          } else if (requestType === 'SetCurrentProgramScene') {
            if (!state.scenes.has(requestData.sceneName)) {
              throw new Error(`Scene not found: ${requestData.sceneName}`);
            }
            state.currentScene = requestData.sceneName;
          } else if (requestType === 'CreateScene') {
            state.scenes.add(requestData.sceneName);
            if (!state.sceneItems.has(requestData.sceneName)) {
              state.sceneItems.set(requestData.sceneName, []);
            }
          } else if (requestType === 'GetSceneItemList') {
            responseData = { sceneItems: state.sceneItems.get(requestData.sceneName) || [] };
          } else if (requestType === 'GetInputList') {
            responseData = {
              inputs: Array.from(state.inputs.entries()).map(([inputName, info]) => ({
                inputName,
                inputKind: info.kind,
              })),
            };
          } else if (requestType === 'SetInputSettings') {
            const existing = state.inputs.get(requestData.inputName);
            if (existing) {
              existing.settings = { ...existing.settings, ...(requestData.inputSettings || {}) };
            }
          } else if (requestType === 'CreateSceneItem') {
            const list = state.sceneItems.get(requestData.sceneName) || [];
            const id = ++state.nextItemId;
            list.push({
              sceneItemId: id,
              sourceName: requestData.sourceName,
              inputKind: state.inputs.get(requestData.sourceName)?.kind || 'browser_source',
              sceneItemEnabled: requestData.sceneItemEnabled !== false,
            });
            state.sceneItems.set(requestData.sceneName, list);
            responseData = { sceneItemId: id };
          } else if (requestType === 'CreateInput') {
            state.inputs.set(requestData.inputName, {
              kind: requestData.inputKind || 'browser_source',
              settings: requestData.inputSettings || {},
            });
            const list = state.sceneItems.get(requestData.sceneName) || [];
            const id = ++state.nextItemId;
            list.push({
              sceneItemId: id,
              sourceName: requestData.inputName,
              inputKind: requestData.inputKind || 'browser_source',
              sceneItemEnabled: requestData.sceneItemEnabled !== false,
            });
            state.sceneItems.set(requestData.sceneName, list);
            responseData = { sceneItemId: id };
          } else if (requestType === 'SetSceneItemEnabled') {
            const list = state.sceneItems.get(requestData.sceneName) || [];
            const found = list.find((i) => i.sceneItemId === requestData.sceneItemId);
            if (found) found.sceneItemEnabled = Boolean(requestData.sceneItemEnabled);
          } else if (requestType === 'SetSceneItemTransform') {
            const list = state.sceneItems.get(requestData.sceneName) || [];
            const found = list.find((i) => i.sceneItemId === requestData.sceneItemId);
            if (found) {
              found.transform = requestData.sceneItemTransform;
              state.lastTransformBySource.set(found.sourceName, requestData.sceneItemTransform);
            }
          } else if (requestType === 'SetSceneItemIndex') {
            responseData = {};
          } else if (requestType === 'GetStreamStatus') {
            responseData = { outputActive: state.streamActive, outputTimecode: state.streamTimecode };
          } else if (requestType === 'GetStats') {
            responseData = {
              cpuUsage: 14.2,
              activeFps: 30,
              outputSkippedFrames: 0,
              outputTotalFrames: 4200,
              averageFrameRenderTime: 2.1,
              memoryUsage: 512,
            };
          } else if (requestType === 'GetSourceScreenshot') {
            responseData = {
              imageData: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP///w==',
            };
          }
        } catch (err: any) {
          result = false;
          code = 600;
          comment = err?.message || 'Error';
        }

        sendMsg({
          op: 7,
          d: {
            requestType,
            requestId,
            requestStatus: { result, code, ...(comment ? { comment } : {}) },
            responseData,
          },
        });
      }
    });
  });

  const addr = wss.address() as { port: number };
  return {
    port: addr.port,
    state,
    close: () => new Promise<void>((resolve) => wss.close(() => resolve())),
  };
}

async function reqJson(baseUrl: string, path: string, options: RequestInit = {}) {
  const res = await fetch(`${baseUrl}${path}`, options);
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function main() {
  let appServer: http.Server | null = null;
  let io: IoServer | null = null;
  let mockObs: ReturnType<typeof createObsV5MockServer> | null = null;
  let agentClient: ReturnType<typeof ioClient> | null = null;

  try {
    console.log('--- 1. Checking live dev server on port 3000 ---');
    const health = await reqJson('http://127.0.0.1:3000', '/api/health');
    assert.strictEqual(health.status, 200, 'Dev server /api/health must return 200');
    const unauthStudio = await reqJson('http://127.0.0.1:3000', '/api/obs/matches/650000000000000000000001/studio');
    assert.strictEqual(unauthStudio.status, 401, 'Unauthenticated OBS studio route must return 401');
    const invalidCam = await reqJson('http://127.0.0.1:3000', '/api/obs/camera-connect/650000000000000000000001?token=bad');
    assert.strictEqual(invalidCam.status, 403, 'Invalid camera token must return 403');
    const spaPage = await fetch('http://127.0.0.1:3000/admin/broadcast-studio');
    assert.strictEqual(spaPage.status, 200, 'SPA route /admin/broadcast-studio must serve HTTP 200');
    console.log('PASS: Live dev server HTTP & SPA checks');

    setActiveDbEngine('sqlite');
    await connectDatabase();

    const app = express();
    app.use(express.json());
    app.use('/api/obs', obsBroadcastRoutes);

    appServer = http.createServer(app);
    io = initSocketServer(appServer);
    initObsControllerBridge();

    await new Promise<void>((resolve) => appServer!.listen(0, '127.0.0.1', () => resolve()));
    const baseUrl = `http://127.0.0.1:${(appServer.address() as any).port}`;

    const createAuthedUser = async (role: string, name: string, email: string) => {
      const user = await User.create({
        name,
        email,
        passwordHash: 'hash_ignored',
        role,
        isActive: true,
        portalAccess: ['admin', 'customer'],
        permissions:
          role === 'ADMIN' || role === 'SUPER_ADMIN'
            ? {
                manageTournaments: true,
                manageTeams: true,
                managePlayers: true,
                manageStreams: true,
                manageScores: true,
                manageSponsors: true,
                moderateChat: true,
              }
            : {
                manageStreams: false,
                manageScores: role === 'SCORER',
              },
        granularPermissions:
          role === 'MODERATOR' ? ['broadcast:control', 'broadcast:manage_cameras'] : [],
      });
      const portal = role === 'SPECTATOR' ? 'customer' : 'admin';
      const session = await UserSession.create({
        userId: user._id,
        portal,
        refreshTokenHash: crypto.createHash('sha256').update(`rt_${email}`).digest('hex'),
        isActive: true,
        expiresAt: new Date(Date.now() + 86400_000),
      });
      const token = signAuthToken(user as any, portal, String(session._id));
      return { user, token };
    };

    const admin = await createAuthedUser('ADMIN', 'Admin Producer', 'admin_obs@test.local');
    const mod = await createAuthedUser('MODERATOR', 'Camera Director', 'mod_obs@test.local');
    const spectator = await createAuthedUser('SPECTATOR', 'Viewer', 'viewer_obs@test.local');
    const scorer = await createAuthedUser('SCORER', 'Match Scorer', 'scorer_obs@test.local');

    const match = await LiveStream.create({
      matchTitle: 'Village Premier Final',
      teamAName: 'Haryana Hawks',
      teamBName: 'Jaipur Royals',
      gameName: 'Cricket',
      tournamentName: 'Rural Cup 2026',
      status: 'LIVE',
      createdBy: admin.user._id,
    });
    const matchId = String(match._id);

    console.log('--- 2. Testing RBAC & Secret Masking ---');
    const specRes = await reqJson(baseUrl, `/api/obs/matches/${matchId}/studio`, {
      headers: { Authorization: `Bearer ${spectator.token}` },
    });
    assert.strictEqual(specRes.status, 403, 'Spectator must get 403');

    const scorerRes = await reqJson(baseUrl, `/api/obs/matches/${matchId}/studio`, {
      headers: { Authorization: `Bearer ${scorer.token}` },
    });
    assert.strictEqual(scorerRes.status, 403, 'Unassigned Scorer must get 403');

    const adminStudio = await reqJson(baseUrl, `/api/obs/matches/${matchId}/studio`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    assert.strictEqual(adminStudio.status, 200, 'Admin must get 200');
    assert.strictEqual(adminStudio.data.profile.obsPasswordEnc, undefined, 'obsPasswordEnc must not leak');
    assert.strictEqual(adminStudio.data.profile.agentTokenHash, undefined, 'agentTokenHash must not leak');
    assert.strictEqual(adminStudio.data.profile.vdoRoomPasswordEnc, undefined, 'vdoRoomPasswordEnc must not leak');
    console.log('PASS: RBAC & zero secret leakage');

    console.log('--- 3. Testing Unreachable OBS Failure Honesty (Zero Fake Status) ---');
    await reqJson(baseUrl, `/api/obs/matches/${matchId}/profile`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectionMode: 'direct_ws',
        obsProtocol: 'ws',
        obsHost: '127.0.0.1',
        obsPort: 44999,
        obsPassword: 'obsSecret123',
      }),
    });
    const badConnect = await reqJson(baseUrl, `/api/obs/matches/${matchId}/connect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'direct_ws' }),
    });
    assert.strictEqual(badConnect.status, 502, 'Unreachable OBS must return 502');
    assert.strictEqual(badConnect.data.ok, false);
    assert.strictEqual(badConnect.data.profile.connectionStatus, 'ERROR');
    console.log('PASS: Unreachable OBS reports real ERROR without fake status');

    console.log('--- 4. Testing Real OBS WebSocket v5 Handshake & Dynamic 6-Camera CRUD ---');
    mockObs = createObsV5MockServer('obsSecret123');
    await reqJson(baseUrl, `/api/obs/matches/${matchId}/profile`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectionMode: 'direct_ws',
        obsProtocol: 'ws',
        obsHost: '127.0.0.1',
        obsPort: mockObs.port,
        obsPassword: 'obsSecret123',
      }),
    });

    const goodConnect = await reqJson(baseUrl, `/api/obs/matches/${matchId}/connect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'direct_ws' }),
    });
    assert.strictEqual(goodConnect.status, 200, `Connect to OBS WS v5 failed: ${JSON.stringify(goodConnect.data)}`);
    assert.strictEqual(goodConnect.data.ok, true);
    assert.strictEqual(goodConnect.data.profile.connectionStatus, 'CONNECTED');
    assert.strictEqual(goodConnect.data.profile.obsVersion, '30.2.3');
    assert.strictEqual(goodConnect.data.profile.activeObsScene, 'CAM 1 FULL');

    const scaffoldRes = await reqJson(baseUrl, `/api/obs/matches/${matchId}/cameras/scaffold`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 6 }),
    });
    assert.strictEqual(scaffoldRes.status, 201);
    assert.strictEqual(scaffoldRes.data.created.length, 6, 'Must create 6 cameras dynamically');
    const cams = scaffoldRes.data.created;

    const switchCam2 = await reqJson(baseUrl, `/api/obs/matches/${matchId}/cameras/${cams[1].cameraId}/switch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mod.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(switchCam2.status, 200, `Switch cam2 failed: ${JSON.stringify(switchCam2.data)}`);
    assert.strictEqual(switchCam2.data.verifiedScene, 'CAM 2 FULL');
    assert.strictEqual(mockObs.state.currentScene, 'CAM 2 FULL');
    assert.strictEqual(switchCam2.data.cameras[1].status, 'ACTIVE');

    const fiveCamIds = cams.slice(0, 5).map((c: any) => c.cameraId);
    const layoutRes = await reqJson(baseUrl, `/api/obs/matches/${matchId}/layouts/apply`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mod.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        layoutType: 'DYNAMIC_GRID',
        cameraIds: fiveCamIds,
        mainCameraId: fiveCamIds[0],
        includeScoreboardOverlay: true,
      }),
    });
    assert.strictEqual(layoutRes.status, 200, `Apply 5-cam layout failed: ${JSON.stringify(layoutRes.data)}`);
    assert.strictEqual(layoutRes.data.verifiedScene, 'MULTI CAM 5X');
    assert.strictEqual(layoutRes.data.boxes.length, 5);
    assert.strictEqual(mockObs.state.currentScene, 'MULTI CAM 5X');
    assert.ok(mockObs.state.lastTransformBySource.has('ML_CAM_5'), '5th camera transform must be applied in OBS');

    const previewRes = await reqJson(baseUrl, `/api/obs/matches/${matchId}/preview?sourceName=CAM%202%20FULL`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    assert.strictEqual(previewRes.status, 200);
    assert.ok(previewRes.data.imageData.startsWith('data:image/jpeg;base64,'));
    console.log('PASS: OBS WS v5 connect, 6-cam CRUD, live switch, 5-cam DYNAMIC_GRID layout, and preview');

    console.log('--- 5. Testing Admin Override Lock & Audit Logging ---');
    const lockRes = await reqJson(baseUrl, `/api/obs/matches/${matchId}/override`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked: true, reason: 'Trophy Presentation Lock' }),
    });
    assert.strictEqual(lockRes.status, 200);
    assert.strictEqual(lockRes.data.profile.adminOverrideLocked, true);

    const blockedModSwitch = await reqJson(baseUrl, `/api/obs/matches/${matchId}/cameras/${cams[2].cameraId}/switch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mod.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(blockedModSwitch.status, 423, 'Non-admin must be blocked with 423 when Admin Override locked');

    const adminOverrideSwitch = await reqJson(baseUrl, `/api/obs/matches/${matchId}/cameras/${cams[2].cameraId}/switch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ override: true }),
    });
    assert.strictEqual(adminOverrideSwitch.status, 200);
    assert.strictEqual(adminOverrideSwitch.data.verifiedScene, 'CAM 3 FULL');

    const rejectedAudit = await BroadcastAuditLog.findOne({ matchId, obsStatus: 'REJECTED' }).lean();
    assert.ok(rejectedAudit, 'Rejected switch under lock must be recorded in BroadcastAuditLog');
    console.log('PASS: Admin Override Lock & Audit logs verified');

    console.log('--- 6. Testing Smartphone Companion Token & Heartbeat ---');
    const cam4Url = new URL(cams[3].mobileConnectUrl);
    const cam4DocId = cam4Url.pathname.split('/').pop()!;
    const cam4Token = cam4Url.searchParams.get('token')!;

    const companionInfo = await reqJson(baseUrl, `/api/obs/camera-connect/${cam4DocId}?token=${cam4Token}`);
    assert.strictEqual(companionInfo.status, 200);
    assert.ok(companionInfo.data.camera.vdoPushUrl.includes('vdo.ninja'));

    const hbRes = await reqJson(baseUrl, `/api/obs/camera-connect/${cam4DocId}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: cam4Token,
        status: 'CONNECTED',
        telemetry: { networkType: '4g', batteryLevel: 88, batteryCharging: false, fpsActual: 30 },
      }),
    });
    assert.strictEqual(hbRes.status, 200);
    assert.strictEqual(hbRes.data.status, 'CONNECTED');
    console.log('PASS: Smartphone Companion token & heartbeat verified');

    console.log('--- 7. Testing Local OBS Agent Namespace & Live State Sync ---');
    const tokenRes = await reqJson(baseUrl, `/api/obs/matches/${matchId}/agent-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    assert.strictEqual(tokenRes.status, 200);
    const agentToken = tokenRes.data.agentToken;
    assert.ok(agentToken.startsWith('mlobs_'));

    agentClient = ioClient(`${baseUrl}/obs-agent`, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { matchId, agentToken, label: 'E2E-Test-Agent' },
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Agent connect timeout')), 4000);
      agentClient!.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      agentClient!.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    agentClient.emit('agent:obs_state', {
      connectionStatus: 'CONNECTED',
      obsVersion: '30.2.3-Agent',
      obsScenes: ['CAM 1 FULL', 'CAM 2 FULL', 'CAM 3 FULL', 'CAM 4 FULL'],
      activeObsScene: 'CAM 4 FULL',
      obsStreamActive: true,
    });

    await new Promise((r) => setTimeout(r, 250));
    const profAfterAgent = await ObsControllerProfile.findOne({ matchId }).lean();
    assert.strictEqual(profAfterAgent?.agentOnline, true);
    assert.strictEqual(profAfterAgent?.connectionStatus, 'CONNECTED');
    assert.strictEqual(profAfterAgent?.activeObsScene, 'CAM 4 FULL');
    console.log('PASS: Local OBS Agent Socket.IO auth & live state sync verified');

    console.log('\nALL MULTI-CAMERA OBS SYSTEM E2E CHECKS PASSED!');
  } finally {
    if (agentClient) agentClient.disconnect();
    if (mockObs) await mockObs.close().catch(() => {});
    if (io) io.close();
    if (appServer) appServer.close();
    try {
      fs.unlinkSync('/app/applet/.obs_e2e_tmp.ts');
    } catch {
      // ignore
    }
    for (const f of ['/tmp/obs_e2e_test.db', '/tmp/obs_e2e_test.db-wal', '/tmp/obs_e2e_test.db-shm']) {
      try {
        fs.unlinkSync(f);
      } catch {
        // ignore
      }
    }
  }
}

main().catch((err) => {
  console.error('E2E FAILURE:', err);
  process.exit(1);
});
