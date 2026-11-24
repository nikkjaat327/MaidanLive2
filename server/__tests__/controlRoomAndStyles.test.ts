import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_OVERLAY_CONFIG,
  SCOREBOARD_STYLES,
  VALID_SCOREBOARD_STYLES,
  applyOverlayQueryParams,
  normalizeOverlayConfig,
} from '../../src/utils/overlayConfig.ts';
import {
  MAX_CONTROL_ROOM_CAMERAS,
  computeObsLayoutBoxes,
  getLayoutSlotCount,
} from '../../src/utils/obsLayoutGeometry.ts';
import {
  buildObsSceneItemTransform,
  getPreviewMediaStyles,
} from '../../src/utils/obsTransformGeometry.ts';

describe('Scoreboard Default Position & 10 Styles', () => {
  it('defaults scoreboard position to bottom-center and style to broadcast_classic', () => {
    assert.equal(DEFAULT_OVERLAY_CONFIG.position, 'bottom-center');
    assert.equal(DEFAULT_OVERLAY_CONFIG.style, 'broadcast_classic');
    assert.equal(SCOREBOARD_STYLES.length, 10);
    assert.equal(VALID_SCOREBOARD_STYLES.length, 10);
  });

  it('preserves every one of the 10 scoreboard styles through normalizeOverlayConfig and query params', () => {
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
});

describe('Control Room Multi-Camera Layouts (Max 6) & Auto Fit Geometry', () => {
  it('enforces MAX_CONTROL_ROOM_CAMERAS === 6 and caps oversized camera arrays', () => {
    assert.equal(MAX_CONTROL_ROOM_CAMERAS, 6);
    assert.equal(getLayoutSlotCount('GRID_5', 6), 5);
    assert.equal(getLayoutSlotCount('GRID_6', 6), 6);
    assert.equal(getLayoutSlotCount('DYNAMIC_GRID', 10), 6);

    const tenIds = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'];
    const dynamicBoxes = computeObsLayoutBoxes('DYNAMIC_GRID', tenIds);
    assert.equal(dynamicBoxes.length, 6);
    assert.deepEqual(
      dynamicBoxes.map((b) => b.cameraId),
      ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']
    );
  });

  it('computes balanced 5-camera (2 top + 3 bottom) and 6-camera (3x2) boxes on 1920x1080', () => {
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
