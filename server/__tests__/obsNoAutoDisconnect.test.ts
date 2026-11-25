import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { BridgeHeartbeatTracker } from '../services/obsControllerService.ts';

const require = createRequire(import.meta.url);
const bridgeEngineModule = require('../../desktop/obs-bridge/bridgeEngine.cjs');
const storeModule = require('../../desktop/obs-bridge/store.cjs');

const configFilePath = path.join(storeModule.getUserDataDir(), 'bridge-config.json');

describe('OBS Studio & OBS Bridge Persistent Connection (No Auto-Disconnect)', () => {
  let priorConfigRaw: string | null = null;
  let activeEngines: any[] = [];

  beforeEach(() => {
    priorConfigRaw = fs.existsSync(configFilePath) ? fs.readFileSync(configFilePath, 'utf8') : null;
  });

  afterEach(async () => {
    for (const eng of activeEngines) {
      await eng.shutdown().catch(() => {});
    }
    activeEngines = [];
    if (priorConfigRaw !== null) {
      fs.mkdirSync(path.dirname(configFilePath), { recursive: true });
      fs.writeFileSync(configFilePath, priorConfigRaw, 'utf8');
    } else if (fs.existsSync(configFilePath)) {
      fs.unlinkSync(configFilePath);
    }
  });

  it('keeps BridgeHeartbeatTracker in CONNECTION_LOST indefinitely when persistUntilAdminDisconnect=true until explicit markOffline', () => {
    const tracker = new BridgeHeartbeatTracker({
      heartbeatIntervalMs: 5_000,
      connectionLostAfterMs: 20_000,
      offlineAfterMs: 45_000,
      persistUntilAdminDisconnect: true,
    });

    const t0 = 2_000_000;
    tracker.recordConnected('ML-BRG-TEST1', ['match-1'], t0, 'OBS Host');

    // Transient disconnect -> RECONNECTING
    const disc = tracker.recordDisconnected('ML-BRG-TEST1', 'transport close', t0 + 10_000);
    assert.equal(disc?.state, 'RECONNECTING');

    // After 25s -> CONNECTION_LOST
    tracker.evaluateAll(t0 + 25_000);
    assert.equal(tracker.getEntry('ML-BRG-TEST1')?.state, 'CONNECTION_LOST');

    // Even after 30 minutes without heartbeats -> MUST remain CONNECTION_LOST (never OFFLINE)
    tracker.evaluateAll(t0 + 1_800_000);
    const entryAfter30Min = tracker.getEntry('ML-BRG-TEST1');
    assert.ok(entryAfter30Min);
    assert.equal(entryAfter30Min.state, 'CONNECTION_LOST');

    // Bridge heartbeat restores CONNECTED cleanly
    const resumed = tracker.recordHeartbeat('ML-BRG-TEST1', t0 + 1_805_000);
    assert.equal(resumed?.state, 'CONNECTED');
    assert.equal(resumed?.missedHeartbeats, 0);

    // Explicit Admin disconnect removes active tracker entry immediately
    tracker.remove('ML-BRG-TEST1');
    assert.equal(tracker.getEntry('ML-BRG-TEST1'), null);
  });

  it('never transitions Desktop BridgeEngine OBS status to DISCONNECTED/OFFLINE on ConnectionClosed or failed connects unless disconnect_obs runs', async () => {
    storeModule.saveConfig({
      serverUrl: 'http://127.0.0.1:4000',
      bridgeId: 'ML-BRG-TEST2',
      bridgeToken: 'mlbrg_test_token',
      adminDisconnected: false,
      obsManuallyDisconnected: false,
    });

    const engine = new bridgeEngineModule.BridgeEngine();
    activeEngines.push(engine);
    engine.refreshMediaMTXStatus = async () => engine.state.mediamtx;

    const emittedEvents: Array<{ event: string; payload: any }> = [];
    engine.socket = {
      connected: true,
      active: true,
      emit(event: string, payload: any) {
        emittedEvents.push({ event, payload });
      },
      removeAllListeners() {},
      disconnect() {},
    };
    engine._syncConfigToState(storeModule.loadConfig());
    engine._setState({
      obsConnected: true,
      obsStatus: 'CONNECTED',
      obsConnectionState: 'CONNECTED',
      obsStreamActive: true,
    });

    // Simulate OBS WebSocket unexpected drop while streaming
    engine.obs.emit('ConnectionClosed', { message: 'socket hang up' });
    const afterDrop = engine.getState();
    assert.equal(afterDrop.obsConnected, false);
    assert.equal(afterDrop.obsStatus, 'RECONNECTING');
    assert.equal(afterDrop.obsConnectionState, 'RECONNECTING');
    assert.equal(afterDrop.obsStreamActive, true);
    assert.ok(engine.obsReconnectTimer, 'Auto-reconnect timer must be scheduled');

    // Allow ConnectionClosed's async emitObsSnapshot to finish before testing next retry
    await new Promise((r) => setTimeout(r, 15));

    // Simulate failed connect attempt after >20s -> CONNECTION_LOST, still not OFFLINE/DISCONNECTED
    if (engine.obsReconnectTimer) {
      clearTimeout(engine.obsReconnectTimer);
      engine.obsReconnectTimer = null;
    }
    engine.obsDisconnectedAt = Date.now() - 25_000;
    engine.obs.connect = async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:4455');
    };
    await engine.connectObsLoop();

    const afterRetryFail = engine.getState();
    assert.equal(afterRetryFail.obsStatus, 'CONNECTION_LOST');
    assert.equal(afterRetryFail.obsConnectionState, 'CONNECTION_LOST');
    assert.equal(afterRetryFail.obsStreamActive, true);
    assert.ok(engine.obsReconnectTimer, 'Auto-reconnect timer must keep retrying indefinitely');

    const obsStatePayloads = emittedEvents.filter((e) => e.event === 'agent:obs_state').map((e) => e.payload);
    assert.ok(obsStatePayloads.length > 0);
    assert.equal(obsStatePayloads[obsStatePayloads.length - 1].manualDisconnect, false);
    assert.notEqual(obsStatePayloads[obsStatePayloads.length - 1].connectionStatus, 'DISCONNECTED');

    // Explicit Admin disconnect_obs command MUST pause reconnect and transition to DISCONNECTED/OFFLINE
    engine.obs.disconnect = async () => {};
    const discRes = await engine.handleCommand('disconnect_obs', { reason: 'Disconnected by Admin User' });
    assert.equal(discRes.disconnected, true);
    assert.equal(discRes.manualDisconnect, true);

    const afterManual = engine.getState();
    assert.equal(afterManual.obsManuallyDisconnected, true);
    assert.equal(afterManual.obsStatus, 'DISCONNECTED');
    assert.equal(afterManual.obsConnectionState, 'OFFLINE');
    assert.equal(afterManual.obsStreamActive, false);
    assert.equal(engine.obsReconnectTimer, null);

    // Calling connectObsLoop while obsManuallyDisconnected=true must remain paused
    let connectCalled = false;
    engine.obs.connect = async () => {
      connectCalled = true;
    };
    await engine.connectObsLoop();
    assert.equal(connectCalled, false);

    // Explicit reconnectObsNow clears obsManuallyDisconnected and connects
    await engine.reconnectObsNow();
    assert.equal(connectCalled, true);
    assert.equal(engine.getState().obsManuallyDisconnected, false);
    assert.equal(engine.getState().obsConnected, true);
  });

  it('auto-schedules server reconnect on transient drop and only pauses when adminDisconnected is set', () => {
    storeModule.saveConfig({
      serverUrl: 'http://127.0.0.1:4000',
      bridgeId: 'ML-BRG-TEST3',
      bridgeToken: 'mlbrg_test_token',
      adminDisconnected: false,
      obsManuallyDisconnected: false,
    });

    const engine = new bridgeEngineModule.BridgeEngine();
    activeEngines.push(engine);
    engine._syncConfigToState(storeModule.loadConfig());

    // Without adminDisconnected -> _scheduleServerReconnect sets timer
    engine._scheduleServerReconnect(60_000);
    assert.ok(engine.serverReconnectTimer);
    clearTimeout(engine.serverReconnectTimer);
    engine.serverReconnectTimer = null;

    // With adminDisconnected -> _scheduleServerReconnect stays paused
    storeModule.saveConfig({ adminDisconnected: true });
    engine._setState({ adminDisconnected: true });
    engine._scheduleServerReconnect(60_000);
    assert.equal(engine.serverReconnectTimer, null);
  });
});
