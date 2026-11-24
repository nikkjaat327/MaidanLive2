import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import {
  BridgeHeartbeatTracker,
  calculateExponentialBackoffMs,
} from '../services/obsControllerService.ts';
import { resolveStickyOrPreferredMatch } from '../../src/utils/activeMatchSelection.ts';

const require = createRequire(import.meta.url);
const bridgeEngineModule = require('../../desktop/obs-bridge/bridgeEngine.cjs');

describe('OBS Bridge Resilience, Heartbeat Tolerance & Sticky Match Selection', () => {
  it('computes bounded exponential backoff with jitter on both Bridge and Server', () => {
    const serverAttempt0 = calculateExponentialBackoffMs(0, {
      baseMs: 1500,
      factor: 1.8,
      maxMs: 30000,
      jitterRatio: 0,
    });
    const serverAttempt4 = calculateExponentialBackoffMs(4, {
      baseMs: 1500,
      factor: 1.8,
      maxMs: 30000,
      jitterRatio: 0,
    });
    const serverAttempt20 = calculateExponentialBackoffMs(20, {
      baseMs: 1500,
      factor: 1.8,
      maxMs: 30000,
      jitterRatio: 0,
    });

    assert.equal(serverAttempt0, 1500);
    assert.ok(serverAttempt4 > serverAttempt0);
    assert.equal(serverAttempt20, 30000);

    const bridgeB0 = bridgeEngineModule.computeBackoffMs(0, 1500, 30000, 0);
    const bridgeB5 = bridgeEngineModule.computeBackoffMs(5, 1500, 30000, 0);
    const bridgeB25 = bridgeEngineModule.computeBackoffMs(25, 1500, 30000, 0);
    assert.equal(bridgeB0, 1500);
    assert.ok(bridgeB5 > bridgeB0 && bridgeB5 <= 30000);
    assert.equal(bridgeB25, 30000);
  });

  it('tolerates missed heartbeats and transitions CONNECTED -> RECONNECTING -> CONNECTION_LOST -> OFFLINE cleanly', () => {
    const tracker = new BridgeHeartbeatTracker({
      heartbeatIntervalMs: 5_000,
      connectionLostAfterMs: 20_000,
      offlineAfterMs: 45_000,
    });

    const t0 = 1_000_000;
    const init = tracker.recordConnected('bridge-1', ['match-a'], t0, 'bridge-1');
    assert.equal(init.state, 'CONNECTED');
    assert.equal(init.missedHeartbeats, 0);

    // After 11s (1 missed heartbeat while socket open) -> RECONNECTING, NOT OFFLINE
    tracker.evaluateAll(t0 + 11_000);
    const afterSingleMiss = tracker.getEntry('bridge-1');
    assert.ok(afterSingleMiss);
    assert.equal(afterSingleMiss.state, 'RECONNECTING');
    assert.equal(afterSingleMiss.missedHeartbeats, 1);

    // Transient socket disconnect starts RECONNECTING immediately without marking OFFLINE
    const disc = tracker.recordDisconnected('bridge-1', 'transport close', t0 + 12_000);
    assert.ok(disc);
    assert.equal(disc.state, 'RECONNECTING');

    // After 22s -> CONNECTION_LOST
    tracker.evaluateAll(t0 + 22_000);
    assert.equal(tracker.getEntry('bridge-1')?.state, 'CONNECTION_LOST');

    // After 46s -> OFFLINE
    tracker.evaluateAll(t0 + 46_000);
    assert.equal(tracker.getEntry('bridge-1')?.state, 'OFFLINE');

    // Recovery via heartbeat restores CONNECTED and resets counters
    const recovered = tracker.recordHeartbeat('bridge-1', t0 + 47_000);
    assert.ok(recovered);
    assert.equal(recovered.state, 'CONNECTED');
    assert.equal(recovered.missedHeartbeats, 0);
    assert.equal(recovered.socketConnected, true);
  });

  it('keeps user sticky match selection locked even when another match goes LIVE', () => {
    const candidates = [
      { id: 'match-live-other', status: 'LIVE' },
      { id: 'match-selected', status: 'UPCOMING' },
      { id: 'match-ended', status: 'ENDED' },
    ];

    // Simulated localStorage fallback when running in Node test runtime
    (globalThis as any).localStorage?.clear?.();

    const keptRouteMatch = resolveStickyOrPreferredMatch('match-selected', candidates);
    assert.equal(keptRouteMatch, 'match-selected');

    // When explicit selection does not exist in list anymore, picks LIVE fallback
    const fallbackWhenMissing = resolveStickyOrPreferredMatch('non-existent', candidates);
    assert.equal(fallbackWhenMissing, 'match-live-other');
  });
});
