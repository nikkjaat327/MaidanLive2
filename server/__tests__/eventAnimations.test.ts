import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BROADCAST_EVENT_KEYS,
  DEFAULT_EVENT_ANIMATIONS,
  EVENT_ANIMATION_PRESETS,
  normalizeEventAnimationsConfig,
  resolveEventStyleOption,
} from '../../src/utils/eventAnimations.ts';
import { normalizeOverlayConfig } from '../../src/utils/overlayConfig.ts';

test('Every required sport event has 10 distinct broadcast animation presets', () => {
  assert.equal(BROADCAST_EVENT_KEYS.length, 11);
  for (const key of BROADCAST_EVENT_KEYS) {
    const presets = EVENT_ANIMATION_PRESETS[key];
    assert.ok(Array.isArray(presets), `Expected presets array for ${key}`);
    assert.equal(presets.length, 10, `Expected 10 options for ${key}`);
    const ids = new Set(presets.map((p) => p.id));
    assert.equal(ids.size, 10, `Expected 10 unique preset IDs for ${key}`);
  }
});

test('normalizeEventAnimationsConfig clamps bounds and rejects unknown style IDs', () => {
  const normalized = normalizeEventAnimationsConfig({
    SUPER_RAID: {
      enabled: false,
      styleId: 'nonexistent_style',
      durationSeconds: 99,
      positionPreset: 'custom',
      xPct: 1,
      yPct: 99,
      scale: 5,
    },
    SIX: {
      enabled: true,
      styleId: EVENT_ANIMATION_PRESETS.SIX[3].id,
      durationSeconds: 0.2,
      positionPreset: 'top-right',
      xPct: 78,
      yPct: 18,
      scale: 0.2,
    },
  });

  assert.equal(normalized.SUPER_RAID.enabled, false);
  assert.equal(normalized.SUPER_RAID.styleId, DEFAULT_EVENT_ANIMATIONS.SUPER_RAID.styleId);
  assert.equal(normalized.SUPER_RAID.durationSeconds, 15);
  assert.equal(normalized.SUPER_RAID.xPct, 8);
  assert.equal(normalized.SUPER_RAID.yPct, 90);
  assert.equal(normalized.SUPER_RAID.scale, 1.8);

  assert.equal(normalized.SIX.styleId, EVENT_ANIMATION_PRESETS.SIX[3].id);
  assert.equal(normalized.SIX.durationSeconds, 1.5);
  assert.equal(normalized.SIX.scale, 0.5);
  assert.equal(resolveEventStyleOption('SIX', normalized.SIX.styleId).id, EVENT_ANIMATION_PRESETS.SIX[3].id);
});

test('normalizeOverlayConfig retains and merges eventAnimations safely', () => {
  const cfg = normalizeOverlayConfig({
    eventAnimations: {
      GOAL: {
        enabled: true,
        styleId: EVENT_ANIMATION_PRESETS.GOAL[2].id,
        durationSeconds: 6.5,
        positionPreset: 'bottom-center',
        xPct: 50,
        yPct: 76,
        scale: 1.25,
      },
    },
  });

  assert.equal(cfg.eventAnimations.GOAL.durationSeconds, 6.5);
  assert.equal(cfg.eventAnimations.GOAL.styleId, EVENT_ANIMATION_PRESETS.GOAL[2].id);
  assert.equal(cfg.eventAnimations.GOAL.scale, 1.25);
  assert.equal(cfg.eventAnimations.SUPER_RAID.enabled, true);
});
