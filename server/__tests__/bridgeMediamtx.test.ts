import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { io as ioClient } from 'socket.io-client';

const require = createRequire(import.meta.url);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maidanlive-bridge-mtx-test-'));
const tmpSqlitePath = path.join(tmpDir, 'test.db');
process.env.SQLITE_DB_PATH = tmpSqlitePath;
delete process.env.MONGODB_URI;
process.env.JWT_SECRET = 'test_jwt_secret_for_bridge_mediamtx_suite_12345';
process.env.OBS_SECRET_KEY = 'test_obs_secret_key_for_bridge_mediamtx_12345';
process.env.MAIDANLIVE_SERVER_URL = 'http://127.0.0.1:3000';

const { connectDatabase, disconnectDatabase } = await import('../config/db.ts');
const { User } = await import('../models/User.ts');
const { LiveStream } = await import('../models/LiveStream.ts');
const { signAuthToken } = await import('../middleware/auth.ts');
const { initSocketServer, getSocketIO } = await import('../socket/index.ts');
const { initObsControllerBridge } = await import('../services/obsControllerService.ts');
const obsBroadcastRoutes = (await import('../routes/obsBroadcastRoutes.ts')).default;

const bridgePkg = require('../../desktop/obs-bridge/package.json');
const mediamtxManager = require('../../desktop/obs-bridge/mediamtxManager.cjs');
const bridgeEngineModule = require('../../desktop/obs-bridge/bridgeEngine.cjs');

let httpServer: http.Server;
let baseUrl = '';
let adminToken = '';
let matchId = '';

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

describe('Windows OBS Bridge v1.1.0 & Remote MediaMTX Management', () => {
  before(async () => {
    await connectDatabase();

    const admin = await User.create({
      name: 'Bridge Test Admin',
      email: 'bridge-mtx-admin@test.local',
      passwordHash: 'not_used',
      role: 'SUPER_ADMIN',
      isActive: true,
    });
    adminToken = signAuthToken(admin, 'admin');

    const stream = await LiveStream.create({
      matchTitle: 'Bridge MediaMTX Integration Match',
      teamAName: 'Falcons',
      teamBName: 'Strikers',
      gameName: 'Cricket',
      tournamentName: 'Tech Cup',
      status: 'LIVE',
      activeStreamingProvider: 'youtube',
    });
    matchId = stream._id.toString();

    const app = express();
    app.use(express.json());
    app.use('/api/obs', obsBroadcastRoutes);

    httpServer = http.createServer(app);
    initSocketServer(httpServer);
    initObsControllerBridge();

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await mediamtxManager.stopMediaMTX({ onlyManaged: true }).catch(() => {});
    getSocketIO()?.close();
    httpServer.closeAllConnections?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await disconnectDatabase();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads accurate Bridge version and MediaMTX/OBS capabilities from source package.json', () => {
    assert.equal(bridgeEngineModule.BRIDGE_VERSION, bridgePkg.version);
    assert.equal(bridgePkg.version, '1.1.0');
    const caps: string[] = bridgeEngineModule.BRIDGE_CAPABILITIES;
    for (const expected of [
      'obs_control',
      'obs_scene_switching',
      'obs_layout_control',
      'mediamtx_control',
      'mediamtx_detect',
      'mediamtx_start',
      'mediamtx_stop',
      'mediamtx_restart',
      'mediamtx_sync_config',
      'mediamtx_logs',
    ]) {
      assert.ok(caps.includes(expected), `Missing capability ${expected}`);
    }
    assert.ok(bridgeEngineModule.APPROVED_COMMANDS.has('switch_scene'));
    assert.ok(bridgeEngineModule.APPROVED_COMMANDS.has('apply_layout'));
    assert.ok(bridgeEngineModule.APPROVED_COMMANDS.has('mediamtx_restart'));
    assert.ok(bridgeEngineModule.APPROVED_COMMANDS.has('mediamtx_logs'));
  });

  it('detects, inspects, starts, restarts, logs (redacting secrets), syncs config, and stops MediaMTX safely', async () => {
    const fakeMtxDir = path.join(tmpDir, 'MediaMTX');
    const userDataDir = path.join(tmpDir, 'bridge-userdata');
    fs.mkdirSync(fakeMtxDir, { recursive: true });
    fs.mkdirSync(userDataDir, { recursive: true });

    const fakeBinPath = path.join(fakeMtxDir, 'mediamtx');
    const fakeYamlPath = path.join(fakeMtxDir, 'mediamtx.yml');

    // Mock MediaMTX executable that responds to --version, binds a dummy HTTP API & RTMP port, and logs a secret to verify redaction
    const mockScript = `#!/usr/bin/env node
const http = require('node:http');
const net = require('node:net');
if (process.argv.includes('--version')) {
  console.log('v1.21.4');
  process.exit(0);
}
console.log('INF MediaMTX v1.21.4 mock starting with url rtmp://127.0.0.1:1935/cam_1?key=mllrx_SUPERSECRETKEY123');
const apiServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ items: [{ name: 'cam_test_1', ready: true, source: { type: 'rtmpConn' } }] }));
});
apiServer.listen(0, '127.0.0.1', () => {});
process.on('SIGTERM', () => { apiServer.close(() => process.exit(0)); });
setInterval(() => {}, 5000);
`;
    fs.writeFileSync(fakeBinPath, mockScript, { mode: 0o755 });

    // Stock MediaMTX default YAML (api: no)
    fs.writeFileSync(
      fakeYamlPath,
      'logLevel: info\napi: no\napiAddress: 127.0.0.1:9997\nrtmp: yes\nrtmpAddress: :1935\nsrt: yes\nsrtAddress: :8890\n',
      'utf8'
    );

    assert.equal(mediamtxManager.isValidMediaMTXBinary(fakeBinPath), true);
    assert.equal(mediamtxManager.isValidMediaMTXBinary(`${fakeBinPath};rm -rf /`), false);

    const yamlMeta = mediamtxManager.inspectMediaMTXYaml(fakeYamlPath);
    assert.equal(yamlMeta.apiEnabled, false);
    assert.equal(yamlMeta.rtmpPort, 1935);
    assert.equal(yamlMeta.srtPort, 8890);

    // Start MediaMTX using existing colocated mediamtx.yml without overwriting it
    const started = await mediamtxManager.startMediaMTX({
      serverUrl: baseUrl,
      configuredPath: fakeBinPath,
      userDataDir,
    });
    assert.equal(started.installed, true);
    assert.equal(started.executablePath, fakeBinPath);
    assert.equal(started.version, 'v1.21.4');
    assert.equal(started.running, true);
    assert.equal(started.configPath, fakeYamlPath);
    assert.equal(started.configSource, 'colocated');
    assert.ok(started.managedPid && started.managedPid > 0);
    const pid1 = started.managedPid;

    // Wait briefly for stdout secret log line and verify redaction
    await new Promise((r) => setTimeout(r, 150));
    const logs = mediamtxManager.getMediaMTXLogs(50);
    const joined = logs.map((l: any) => l.message).join('\n');
    assert.ok(joined.includes('MediaMTX v1.21.4 mock starting'));
    assert.equal(joined.includes('SUPERSECRETKEY123'), false, 'Stream key secret must be redacted');

    // Restart MediaMTX -> gets new PID
    const restarted = await mediamtxManager.restartMediaMTX({
      serverUrl: baseUrl,
      configuredPath: fakeBinPath,
      userDataDir,
    });
    assert.equal(restarted.running, true);
    assert.ok(restarted.managedPid && restarted.managedPid !== pid1);

    // Sync config -> preserves .maidanlive.bak and writes MaidanLive HTTP auth + API enabled config
    const written = mediamtxManager.writeManagedConfig(baseUrl, userDataDir, {
      configuredPath: fakeBinPath,
    });
    assert.equal(written.configPath, fakeYamlPath);
    assert.equal(fs.existsSync(`${fakeYamlPath}.maidanlive.bak`), true);
    const updatedYamlMeta = mediamtxManager.inspectMediaMTXYaml(fakeYamlPath);
    assert.equal(updatedYamlMeta.apiEnabled, true);
    assert.equal(updatedYamlMeta.authConfigured, true);

    // Stop MediaMTX -> running: false
    const stopped = await mediamtxManager.stopMediaMTX({
      configuredPath: fakeBinPath,
      userDataDir,
    });
    assert.equal(stopped.running, false);
  });

  it('honestly marks legacy bridges unsupported and executes remote MediaMTX + OBS controls on v1.1.0 Bridge', async () => {
    // 1. Register a Bridge
    const regRes = await apiJson(
      'POST',
      '/api/obs/bridges',
      {
        name: 'Ground Streaming PC',
        label: 'Windows OBS Laptop',
        assignedMatchIds: [matchId],
      },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert.equal(regRes.status, 201);
    const { bridge, bridgeToken } = regRes.json;
    assert.ok(bridge.bridgeId);
    assert.ok(bridgeToken.startsWith('mlbrg_'));

    // 2. Connect a LEGACY bridge client (no version, no capabilities, rejects mediamtx_status)
    const legacySocket = ioClient(`${baseUrl}/obs-agent`, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: {
        bridgeId: bridge.bridgeId,
        bridgeToken,
        label: 'Legacy Windows Bridge',
        platform: 'win32',
      },
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
      legacySocket.on('connect', () => resolve());
      legacySocket.on('connect_error', (e) => reject(e));
    });

    legacySocket.on('server:obs_command', (req: any, ack: any) => {
      if (String(req?.command || '').startsWith('mediamtx_')) {
        ack({ ok: false, error: `Unsupported command: ${req?.command}` });
      } else {
        ack({ ok: true, data: {} });
      }
    });

    await new Promise((r) => setTimeout(r, 80));

    // Studio & Bridge endpoints must honestly report mediamtxControlSupported: false
    const legacyStudio = await apiJson(
      'GET',
      `/api/obs/matches/${matchId}/studio`,
      undefined,
      { Authorization: `Bearer ${adminToken}` }
    );
    assert.equal(legacyStudio.status, 200);
    assert.equal(legacyStudio.json.profile.agentOnline, true);
    assert.equal(legacyStudio.json.profile.mediamtxControlSupported, false);
    assert.equal(legacyStudio.json.profile.bridgeVersion, '');

    // Control endpoint must surface BRIDGE_UPGRADE_REQUIRED
    const legacyCtrl = await apiJson(
      'POST',
      `/api/obs/matches/${matchId}/mediamtx/control`,
      { action: 'status' },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert.equal(legacyCtrl.status, 422);
    assert.equal(legacyCtrl.json.code, 'BRIDGE_UPGRADE_REQUIRED');

    legacySocket.disconnect();
    await new Promise((r) => setTimeout(r, 80));

    // 3. Connect an UPDATED v1.1.0 bridge client reporting version & capabilities
    const modernSocket = ioClient(`${baseUrl}/obs-agent`, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: {
        bridgeId: bridge.bridgeId,
        bridgeToken,
        label: 'Updated Windows OBS Bridge',
        platform: 'win32',
        bridgeVersion: bridgeEngineModule.BRIDGE_VERSION,
        capabilities: bridgeEngineModule.BRIDGE_CAPABILITIES,
      },
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
      modernSocket.on('connect', () => resolve());
      modernSocket.on('connect_error', (e) => reject(e));
    });

    const receivedCommands: string[] = [];
    let mockMtxRunning = false;

    modernSocket.on('server:obs_command', (req: any, ack: any) => {
      const cmd = String(req?.command || '');
      receivedCommands.push(cmd);
      if (cmd === 'mediamtx_start' || cmd === 'mediamtx_restart') mockMtxRunning = true;
      if (cmd === 'mediamtx_stop') mockMtxRunning = false;
      if (cmd.startsWith('mediamtx_')) {
        ack({
          ok: true,
          data: {
            bridgeVersion: bridgeEngineModule.BRIDGE_VERSION,
            capabilities: bridgeEngineModule.BRIDGE_CAPABILITIES,
            mediamtx: {
              installed: true,
              executablePath: 'C:\\MediaMTX\\mediamtx.exe',
              version: 'v1.21.4',
              running: mockMtxRunning,
              configPath: 'C:\\MediaMTX\\mediamtx.yml',
              configSource: 'colocated',
              rtmpPort: 1935,
              srtPort: 8890,
              apiPort: 9997,
              rtmpPortOpen: mockMtxRunning,
              srtPortOpen: mockMtxRunning,
              apiReachable: mockMtxRunning,
              activePathCount: 0,
              activePaths: [],
            },
            logs: [
              {
                id: '1',
                timestamp: new Date().toISOString(),
                level: 'info',
                message: 'MediaMTX v1.21.4 ready on :1935/:8890',
              },
            ],
          },
        });
        return;
      }
      if (cmd === 'switch_scene') {
        ack({
          ok: true,
          data: { verifiedScene: req?.payload?.sceneName || 'CAM 1', obsScenes: ['CAM 1', 'CAM 2'] },
        });
        return;
      }
      ack({ ok: true, data: {} });
    });

    modernSocket.emit('agent:obs_state', {
      bridgeVersion: bridgeEngineModule.BRIDGE_VERSION,
      capabilities: bridgeEngineModule.BRIDGE_CAPABILITIES,
      connectionStatus: 'CONNECTED',
      obsVersion: '33.0.1',
      obsWebSocketVersion: '5.7.6',
      activeObsScene: 'CAM 1',
      obsScenes: ['CAM 1', 'CAM 2'],
      mediamtx: {
        installed: true,
        executablePath: 'C:\\MediaMTX\\mediamtx.exe',
        version: 'v1.21.4',
        running: false,
        configPath: 'C:\\MediaMTX\\mediamtx.yml',
        configSource: 'colocated',
      },
    });

    await new Promise((r) => setTimeout(r, 100));

    // Verify Studio & Bridges list report v1.1.0 + mediamtxControlSupported: true + OBS v33.0.1
    const modernStudio = await apiJson(
      'GET',
      `/api/obs/matches/${matchId}/studio`,
      undefined,
      { Authorization: `Bearer ${adminToken}` }
    );
    assert.equal(modernStudio.status, 200);
    assert.equal(modernStudio.json.profile.bridgeVersion, '1.1.0');
    assert.equal(modernStudio.json.profile.mediamtxControlSupported, true);
    assert.equal(modernStudio.json.profile.obsVersion, '33.0.1');
    assert.equal(modernStudio.json.profile.mediamtxState.executablePath, 'C:\\MediaMTX\\mediamtx.exe');

    // Execute remote MediaMTX status -> start -> restart -> logs -> stop
    for (const action of ['status', 'sync_config', 'start', 'restart', 'logs', 'stop']) {
      const ctrlRes = await apiJson(
        'POST',
        `/api/obs/matches/${matchId}/mediamtx/control`,
        { action },
        { Authorization: `Bearer ${adminToken}` }
      );
      assert.equal(ctrlRes.status, 200, `Failed MediaMTX action ${action}`);
      assert.equal(ctrlRes.json.ok, true);
      if (action === 'start' || action === 'restart') {
        assert.equal(ctrlRes.json.profile.mediamtxState.running, true);
      }
      if (action === 'stop') {
        assert.equal(ctrlRes.json.profile.mediamtxState.running, false);
      }
      if (action === 'logs') {
        assert.ok(Array.isArray(ctrlRes.json.result.logs));
        assert.equal(ctrlRes.json.result.logs.length, 1);
      }
    }

    // Verify existing OBS scene switching still works cleanly
    const sceneRes = await apiJson(
      'POST',
      `/api/obs/matches/${matchId}/scenes/switch`,
      { sceneName: 'CAM 2' },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert.equal(sceneRes.status, 200);

    assert.deepEqual(receivedCommands, [
      'mediamtx_status',
      'mediamtx_sync_config',
      'mediamtx_start',
      'mediamtx_restart',
      'mediamtx_logs',
      'mediamtx_stop',
      'switch_scene',
    ]);

    // Verify installer status reads version 1.1.0 from desktop/obs-bridge/package.json
    const instRes = await apiJson(
      'GET',
      '/api/obs/bridge/installer/status',
      undefined,
      { Authorization: `Bearer ${adminToken}` }
    );
    assert.equal(instRes.status, 200);
    assert.equal(instRes.json.version, '1.1.0');

    modernSocket.disconnect();
  });
});
