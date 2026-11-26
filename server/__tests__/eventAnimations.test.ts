import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStyleOptionToRule,
  BROADCAST_EVENT_KEYS,
  createDefaultEventRule,
  DEFAULT_EVENT_ANIMATIONS,
  EVENT_ANIMATION_BOUNDS,
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

test('normalizeEventAnimationsConfig clamps bounds, rejects invalid transitions/hex, and hydrates defaults', () => {
  const normalized = normalizeEventAnimationsConfig({
    SUPER_RAID: {
      enabled: false,
      styleId: 'nonexistent_style',
      durationSeconds: 99,
      positionPreset: 'custom',
      xPct: 1,
      yPct: 99,
      scale: 5,
      logoSizePx: 999,
      badgeTextSizePx: 2,
      teamTextSizePx: 99,
      headlineTextSizePx: 4,
      subtitleTextSizePx: 88,
      containerWidthPx: 2500,
      containerPaddingX: 1,
      containerPaddingY: 200,
      containerRadiusPx: -5,
      borderWidthPx: 40,
      bgOpacity: 0.1,
      primaryHex: 'not-a-color',
      accentHex: '#22D3EE',
      entryTransition: 'invalid_entry' as any,
      exitTransition: 'flip_out',
      idleAnimation: 'neon_glow',
      pattern: 'cyber_scan',
      showShockwaves: false,
      customHeadline: 'MEGA SUPER RAID',
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

  const sr = normalized.SUPER_RAID;
  assert.equal(sr.enabled, false);
  assert.equal(sr.styleId, DEFAULT_EVENT_ANIMATIONS.SUPER_RAID.styleId);
  assert.equal(sr.durationSeconds, 15);
  assert.equal(sr.xPct, 8);
  assert.equal(sr.yPct, 90);
  assert.equal(sr.scale, 1.8);
  assert.equal(sr.logoSizePx, EVENT_ANIMATION_BOUNDS.logoSizePx.max);
  assert.equal(sr.badgeTextSizePx, EVENT_ANIMATION_BOUNDS.badgeTextSizePx.min);
  assert.equal(sr.teamTextSizePx, EVENT_ANIMATION_BOUNDS.teamTextSizePx.max);
  assert.equal(sr.headlineTextSizePx, EVENT_ANIMATION_BOUNDS.headlineTextSizePx.min);
  assert.equal(sr.subtitleTextSizePx, EVENT_ANIMATION_BOUNDS.subtitleTextSizePx.max);
  assert.equal(sr.containerWidthPx, EVENT_ANIMATION_BOUNDS.containerWidthPx.max);
  assert.equal(sr.containerPaddingX, EVENT_ANIMATION_BOUNDS.containerPaddingX.min);
  assert.equal(sr.containerPaddingY, EVENT_ANIMATION_BOUNDS.containerPaddingY.max);
  assert.equal(sr.containerRadiusPx, EVENT_ANIMATION_BOUNDS.containerRadiusPx.min);
  assert.equal(sr.borderWidthPx, EVENT_ANIMATION_BOUNDS.borderWidthPx.max);
  assert.equal(sr.bgOpacity, EVENT_ANIMATION_BOUNDS.bgOpacity.min);
  assert.equal(sr.primaryHex, EVENT_ANIMATION_PRESETS.SUPER_RAID[0].primaryHex);
  assert.equal(sr.accentHex, '#22D3EE');
  assert.equal(sr.exitTransition, 'flip_out');
  assert.equal(sr.idleAnimation, 'neon_glow');
  assert.equal(sr.pattern, 'cyber_scan');
  assert.equal(sr.showShockwaves, false);
  assert.equal(sr.customHeadline, 'MEGA SUPER RAID');

  assert.equal(normalized.SIX.styleId, EVENT_ANIMATION_PRESETS.SIX[3].id);
  assert.equal(normalized.SIX.durationSeconds, 1.5);
  assert.equal(normalized.SIX.scale, 0.5);
  assert.equal(normalized.SIX.primaryHex, EVENT_ANIMATION_PRESETS.SIX[3].primaryHex);
  assert.equal(
    resolveEventStyleOption('SIX', normalized.SIX.styleId).id,
    EVENT_ANIMATION_PRESETS.SIX[3].id
  );
});

test('applyStyleOptionToRule updates colors & transitions while preserving custom sizes and duration', () => {
  const base = createDefaultEventRule('GOAL');
  const customized = {
    ...base,
    durationSeconds: 7.5,
    logoSizePx: 112,
    headlineTextSizePx: 54,
    customHeadline: 'WORLDIE GOAL!',
  };
  const thirdStyle = EVENT_ANIMATION_PRESETS.GOAL[2];
  const updated = applyStyleOptionToRule(customized, 'GOAL', thirdStyle.id);

  assert.equal(updated.styleId, thirdStyle.id);
  assert.equal(updated.primaryHex, thirdStyle.primaryHex);
  assert.equal(updated.accentHex, thirdStyle.accentHex);
  assert.equal(updated.pattern, thirdStyle.pattern);
  assert.equal(updated.durationSeconds, 7.5);
  assert.equal(updated.logoSizePx, 112);
  assert.equal(updated.headlineTextSizePx, 54);
  assert.equal(updated.customHeadline, 'WORLDIE GOAL!');
});

test('normalizeOverlayConfig retains and merges granular eventAnimations safely', () => {
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
        logoSizePx: 96,
        headlineTextSizePx: 50,
        containerWidthPx: 780,
      },
    },
  });

  assert.equal(cfg.eventAnimations.GOAL.durationSeconds, 6.5);
  assert.equal(cfg.eventAnimations.GOAL.styleId, EVENT_ANIMATION_PRESETS.GOAL[2].id);
  assert.equal(cfg.eventAnimations.GOAL.scale, 1.25);
  assert.equal(cfg.eventAnimations.GOAL.logoSizePx, 96);
  assert.equal(cfg.eventAnimations.GOAL.headlineTextSizePx, 50);
  assert.equal(cfg.eventAnimations.GOAL.containerWidthPx, 780);
  assert.equal(cfg.eventAnimations.SUPER_RAID.enabled, true);
});
