import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BRAND_LOGO_BOUNDS,
  DEFAULT_BRAND_LOGO_URL,
  DEFAULT_CUSTOM_SCOREBOARD_DESIGN,
  DEFAULT_OVERLAY_CONFIG,
  SCOREBOARD_STYLES,
  VALID_SCOREBOARD_STYLES,
  applyOverlayQueryParams,
  normalizeCustomScoreboardDesign,
  normalizeOverlayConfig,
  resolveBrandLogoUrl,
  resolveScoreboardTeamName,
} from '../../src/utils/overlayConfig.ts';
import {
  MAX_CONTROL_ROOM_CAMERAS,
  computeObsLayoutBorderSegments,
  computeObsLayoutBoxes,
  getLayoutSlotCount,
} from '../../src/utils/obsLayoutGeometry.ts';
import {
  buildObsSceneItemTransform,
  getPreviewMediaStyles,
} from '../../src/utils/obsTransformGeometry.ts';

describe('Scoreboard Default Position, 25 Styles, Brand Logo & Custom Designer', () => {
  it('defaults scoreboard position to bottom-center, style to broadcast_classic, and exposes 25 styles', () => {
    assert.equal(DEFAULT_OVERLAY_CONFIG.position, 'bottom-center');
    assert.equal(DEFAULT_OVERLAY_CONFIG.style, 'broadcast_classic');
    assert.equal(SCOREBOARD_STYLES.length, 25);
    assert.equal(VALID_SCOREBOARD_STYLES.length, 25);
    assert.ok(VALID_SCOREBOARD_STYLES.includes('custom_designer'));
    assert.ok(VALID_SCOREBOARD_STYLES.includes('ipl_neon_ribbon'));
  });

  it('preserves every one of the 25 scoreboard styles through normalizeOverlayConfig and query params', () => {
    for (const meta of SCOREBOARD_STYLES) {
      const normalized = normalizeOverlayConfig({
        style: meta.id,
        position: 'bottom-center',
      });
      assert.equal(normalized.style, meta.id);
      assert.equal(normalized.position, 'bottom-center');

      const parsed = applyOverlayQueryParams(
        DEFAULT_OVERLAY_CONFIG,
        `?style=${encodeURIComponent(meta.id)}&position=top-center`
      );
      assert.equal(parsed.style, meta.id);
      assert.equal(parsed.position, 'top-center');
    }
  });

  it('falls back safely when unknown scoreboard style or position is supplied', () => {
    const normalized = normalizeOverlayConfig({
      style: 'nonexistent_style' as any,
      position: 'invalid_pos' as any,
    });
    assert.equal(normalized.style, 'broadcast_classic');
    assert.equal(normalized.position, 'bottom-center');

    const parsed = applyOverlayQueryParams(
      DEFAULT_OVERLAY_CONFIG,
      '?style=unknown_xyz&position=nowhere'
    );
    assert.equal(parsed.style, 'broadcast_classic');
    assert.equal(parsed.position, 'bottom-center');
  });

  it('resolves brand logo URL (.env fallback -> server -> config override) and clamps logo sizing', () => {
    assert.ok(DEFAULT_BRAND_LOGO_URL.startsWith('https://'));
    assert.equal(resolveBrandLogoUrl({ brandLogoUrl: '' }, ''), DEFAULT_BRAND_LOGO_URL);
    assert.equal(
      resolveBrandLogoUrl({ brandLogoUrl: '' }, 'https://cdn.example.com/server-logo.png'),
      'https://cdn.example.com/server-logo.png'
    );
    assert.equal(
      resolveBrandLogoUrl(
        { brandLogoUrl: 'https://cdn.example.com/custom.png' },
        'https://cdn.example.com/server-logo.png'
      ),
      'https://cdn.example.com/custom.png'
    );

    const clamped = normalizeOverlayConfig({
      brandLogoPosition: 'bottom-right',
      brandLogoSize: 999,
      brandLogoOpacity: 0.01,
      brandLogoOffsetX: -20,
      brandLogoOffsetY: 500,
    });
    assert.equal(clamped.brandLogoPosition, 'bottom-right');
    assert.equal(clamped.brandLogoSize, BRAND_LOGO_BOUNDS.brandLogoSize.max);
    assert.equal(clamped.brandLogoOpacity, BRAND_LOGO_BOUNDS.brandLogoOpacity.min);
    assert.equal(clamped.brandLogoOffsetX, BRAND_LOGO_BOUNDS.brandLogoOffsetX.min);
    assert.equal(clamped.brandLogoOffsetY, BRAND_LOGO_BOUNDS.brandLogoOffsetY.max);
  });

  it('normalizes customScoreboardDesign safely and enforces full landscape vs short portrait team names', () => {
    const design = normalizeCustomScoreboardDesign({
      layoutVariant: 'angled_ribbon',
      primaryColor: '#12abef',
      borderWidth: 99,
      glowIntensity: -5,
      fontFamily: 'mono',
      showGradient: false,
    });
    assert.equal(design.layoutVariant, 'angled_ribbon');
    assert.equal(design.primaryColor, '#12ABEF');
    assert.equal(design.borderWidth, 6);
    assert.equal(design.glowIntensity, 0);
    assert.equal(design.fontFamily, 'mono');
    assert.equal(design.showGradient, false);
    assert.equal(design.accentColor, DEFAULT_CUSTOM_SCOREBOARD_DESIGN.accentColor);

    assert.equal(resolveScoreboardTeamName('Royal Challengers', 'RCB', false), 'Royal Challengers');
    assert.equal(resolveScoreboardTeamName('Royal Challengers', 'RCB', true), 'RCB');
    assert.equal(resolveScoreboardTeamName('', 'MI', false), 'MI');
  });
});

describe('Control Room Multi-Camera Layouts (Max 8) & Split Borders Geometry', () => {
  it('enforces MAX_CONTROL_ROOM_CAMERAS === 8 and caps oversized camera arrays', () => {
    assert.equal(MAX_CONTROL_ROOM_CAMERAS, 8);
    assert.equal(getLayoutSlotCount('GRID_5', 8), 5);
    assert.equal(getLayoutSlotCount('GRID_6', 8), 6);
    assert.equal(getLayoutSlotCount('GRID_8', 8), 8);
    assert.equal(getLayoutSlotCount('DYNAMIC_GRID', 10), 8);

    const tenIds = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'];
    const dynamicBoxes = computeObsLayoutBoxes('DYNAMIC_GRID', tenIds);
    assert.equal(dynamicBoxes.length, 8);
    assert.deepEqual(
      dynamicBoxes.map((b) => b.cameraId),
      ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']
    );
  });

  it('computes balanced 5-camera (2+3), 6-camera (3x2), and 8-camera (4x2) boxes on 1920x1080', () => {
    const fiveIds = ['cam1', 'cam2', 'cam3', 'cam4', 'cam5'];
    const boxes5 = computeObsLayoutBoxes('GRID_5', fiveIds, 'cam1', 1920, 1080);
    assert.equal(boxes5.length, 5);
    assert.equal(boxes5[0].width + boxes5[1].width, 1920);
    assert.equal(boxes5[2].width + boxes5[3].width + boxes5[4].width, 1920);
    assert.equal(boxes5[0].height + boxes5[2].height, 1080);

    const sixIds = ['cam1', 'cam2', 'cam3', 'cam4', 'cam5', 'cam6'];
    const boxes6 = computeObsLayoutBoxes('GRID_6', sixIds, 'cam1', 1920, 1080);
    assert.equal(boxes6.length, 6);
    assert.equal(boxes6[0].width + boxes6[1].width + boxes6[2].width, 1920);
    assert.equal(boxes6[3].width + boxes6[4].width + boxes6[5].width, 1920);
    assert.equal(boxes6[0].height + boxes6[3].height, 1080);

    const eightIds = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];
    const boxes8 = computeObsLayoutBoxes('GRID_8', eightIds, 'c1', 1920, 1080);
    assert.equal(boxes8.length, 8);
    assert.equal(
      boxes8[0].width + boxes8[1].width + boxes8[2].width + boxes8[3].width,
      1920
    );
    assert.equal(boxes8[0].height + boxes8[4].height, 1080);
  });

  it('computes 2px multi-cam split borders for 2, 3, 4, and 8 cameras while omitting SINGLE fullscreen', () => {
    const ids = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];

    const singleBorders = computeObsLayoutBorderSegments(
      'SINGLE',
      computeObsLayoutBoxes('SINGLE', ['c1']),
      1920,
      1080
    );
    assert.equal(singleBorders.length, 0);

    const split2H = computeObsLayoutBorderSegments(
      'SPLIT_2_H',
      computeObsLayoutBoxes('SPLIT_2_H', ids.slice(0, 2)),
      1920,
      1080
    );
    assert.equal(split2H.length, 1);
    assert.equal(split2H[0].orientation, 'vertical');
    assert.equal(split2H[0].width, 2);
    assert.equal(split2H[0].x, 960);

    const split2V = computeObsLayoutBorderSegments(
      'SPLIT_2_V',
      computeObsLayoutBoxes('SPLIT_2_V', ids.slice(0, 2)),
      1920,
      1080
    );
    assert.equal(split2V.length, 1);
    assert.equal(split2V[0].orientation, 'horizontal');
    assert.equal(split2V[0].height, 2);
    assert.equal(split2V[0].y, 540);

    const split3 = computeObsLayoutBorderSegments(
      'SPLIT_3',
      computeObsLayoutBoxes('SPLIT_3', ids.slice(0, 3)),
      1920,
      1080
    );
    assert.ok(split3.some((s) => s.orientation === 'vertical'));
    assert.ok(split3.some((s) => s.orientation === 'horizontal'));

    const grid4 = computeObsLayoutBorderSegments(
      'GRID_4',
      computeObsLayoutBoxes('GRID_4', ids.slice(0, 4)),
      1920,
      1080
    );
    assert.equal(grid4.filter((s) => s.orientation === 'vertical').length, 1);
    assert.equal(grid4.filter((s) => s.orientation === 'horizontal').length, 1);

    const grid8 = computeObsLayoutBorderSegments(
      'GRID_8',
      computeObsLayoutBoxes('GRID_8', ids),
      1920,
      1080
    );
    assert.equal(grid8.filter((s) => s.orientation === 'vertical').length, 3);
    assert.equal(grid8.filter((s) => s.orientation === 'horizontal').length, 1);

    const pip = computeObsLayoutBorderSegments(
      'PIP',
      computeObsLayoutBoxes('PIP', ids.slice(0, 2)),
      1920,
      1080
    );
    assert.equal(pip.length, 1);
    assert.equal(pip[0].orientation, 'box');
  });

  it('handles Auto Fit (contain vs cover) and 90/270 degree rotation transforms cleanly', () => {
    const autoFitOn = getPreviewMediaStyles({
      rotationDeg: 0,
      previewFit: 'contain',
      isPortraitContent: true,
    });
    assert.equal(autoFitOn.objectClass, 'object-contain');
    assert.equal(autoFitOn.transform, 'none');

    const autoFitOff = getPreviewMediaStyles({
      rotationDeg: 0,
      previewFit: 'cover',
      isPortraitContent: true,
    });
    assert.equal(autoFitOff.objectClass, 'object-cover');
    assert.equal(autoFitOff.transform, 'none');

    const rotated = getPreviewMediaStyles({
      rotationDeg: 90,
      previewFit: 'contain',
      isPortraitContent: true,
    });
    assert.equal(rotated.needsRotatedContainerSwap, true);
    assert.match(rotated.transform, /^rotate\(90deg\) scale\(/);

    const obsTransform = buildObsSceneItemTransform({
      x: 0,
      y: 0,
      width: 960,
      height: 540,
      rotationDeg: 90,
      previewFit: 'contain',
    });
    assert.equal(obsTransform.boundsWidth, 540);
    assert.equal(obsTransform.boundsHeight, 960);
    assert.equal(obsTransform.boundsType, 'OBS_BOUNDS_SCALE_INNER');
    assert.equal(obsTransform.rotation, 90);
  });
});
