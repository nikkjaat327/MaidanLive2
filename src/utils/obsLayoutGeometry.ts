export type ObsLayoutType =
  | 'SINGLE'
  | 'SPLIT_2_H'
  | 'SPLIT_2_V'
  | 'SPLIT_3'
  | 'GRID_4'
  | 'GRID_5'
  | 'GRID_6'
  | 'GRID_8'
  | 'PIP'
  | 'MAIN_PLUS_SECONDARY'
  | 'DYNAMIC_GRID'
  | 'SPORT_BROADCAST';

export const MAX_CONTROL_ROOM_CAMERAS = 8;

export type PipPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type PipSize = 'small' | 'medium' | 'large';

export interface ObsLayoutComputeOptions {
  pipPosition?: PipPosition;
  pipSize?: PipSize;
}

export interface ObsLayoutBox {
  cameraId: string;
  slotIndex: number;
  role: 'main' | 'secondary' | 'grid';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ObsSplitBorderSegment {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  orientation: 'vertical' | 'horizontal' | 'box';
}

export const LAYOUT_METADATA: Record<
  ObsLayoutType,
  {
    label: string;
    shortLabel: string;
    minCameras: number;
    recommendedCameras: string;
    description: string;
    defaultSceneName: string;
  }
> = {
  SINGLE: {
    label: 'Single Full Camera',
    shortLabel: 'Single',
    minCameras: 1,
    recommendedCameras: '1 camera',
    description: 'Full 1920×1080 program feed from a single active camera.',
    defaultSceneName: 'CAM FULL',
  },
  SPLIT_2_H: {
    label: 'Split (2 Cameras)',
    shortLabel: 'Split (2)',
    minCameras: 2,
    recommendedCameras: '2 cameras',
    description: 'Dual side-by-side 50/50 split view (e.g., Bowler End + Batsman End).',
    defaultSceneName: 'SPLIT 2 SIDE',
  },
  SPLIT_2_V: {
    label: '2-Camera Stacked Split',
    shortLabel: '2 Split (V)',
    minCameras: 2,
    recommendedCameras: '2 cameras',
    description: 'Top and bottom dual stacked widescreen feeds.',
    defaultSceneName: 'SPLIT 2 STACKED',
  },
  SPLIT_3: {
    label: 'Triple (3 Cameras)',
    shortLabel: 'Triple (3)',
    minCameras: 3,
    recommendedCameras: '3 cameras',
    description: 'Main left feed (2/3 width) with 2 stacked secondary feeds on the right.',
    defaultSceneName: 'SPLIT 3 VIEW',
  },
  GRID_4: {
    label: 'Quad (4 Cameras)',
    shortLabel: 'Quad (4)',
    minCameras: 4,
    recommendedCameras: '4 cameras',
    description: 'Symmetric 2×2 quad wall across the 1920×1080 broadcast frame.',
    defaultSceneName: 'GRID 4 QUAD',
  },
  GRID_5: {
    label: '5-Cam (5 Cameras)',
    shortLabel: '5-Cam',
    minCameras: 5,
    recommendedCameras: '5 cameras',
    description: 'Balanced 5-camera showcase: 2 primary feeds on top, 3 angles along bottom.',
    defaultSceneName: 'GRID 5 CAM',
  },
  GRID_6: {
    label: '6-Cam (6 Cameras)',
    shortLabel: '6-Cam',
    minCameras: 6,
    recommendedCameras: '6 cameras',
    description: 'Full 3×2 6-camera broadcast wall across the 1920×1080 frame.',
    defaultSceneName: 'GRID 6 CAM',
  },
  GRID_8: {
    label: '8-Cam (8 Cameras)',
    shortLabel: '8-Cam',
    minCameras: 8,
    recommendedCameras: '8 cameras',
    description: 'Compact 4×2 8-camera broadcast wall across the 1920×1080 frame.',
    defaultSceneName: 'GRID 8 CAM',
  },
  PIP: {
    label: 'Picture-in-Picture (PiP)',
    shortLabel: 'PiP',
    minCameras: 2,
    recommendedCameras: '2 cameras',
    description: 'Fullscreen primary camera with an adjustable corner inset camera.',
    defaultSceneName: 'PIP OVERLAY',
  },
  MAIN_PLUS_SECONDARY: {
    label: 'Main Camera + Secondary Strip',
    shortLabel: 'Main + N',
    minCameras: 2,
    recommendedCameras: '2–8 cameras',
    description: 'Large primary feed with all selected secondary cameras tiled along the right rail.',
    defaultSceneName: 'MAIN + SECONDARY',
  },
  DYNAMIC_GRID: {
    label: 'Dynamic Multi-Camera Grid',
    shortLabel: 'N-Cam Grid',
    minCameras: 1,
    recommendedCameras: 'Any N cameras',
    description: 'Automatically balances rows and columns for 2–8 cameras.',
    defaultSceneName: 'MULTI CAM GRID',
  },
  SPORT_BROADCAST: {
    label: 'Sport Broadcast + Scoreboard',
    shortLabel: 'Sport Broadcast',
    minCameras: 1,
    recommendedCameras: '1–8 cameras',
    description: 'Live sport production scene combining camera feed(s) with MaidanLive scoreboard.',
    defaultSceneName: 'SPORT BROADCAST',
  },
};

export function getLayoutSlotCount(layoutType: ObsLayoutType, availableCount = 1): number {
  switch (layoutType) {
    case 'SINGLE':
      return 1;
    case 'SPLIT_2_H':
    case 'SPLIT_2_V':
    case 'PIP':
      return 2;
    case 'SPLIT_3':
      return 3;
    case 'GRID_4':
      return 4;
    case 'GRID_5':
      return 5;
    case 'GRID_6':
      return 6;
    case 'GRID_8':
      return 8;
    case 'MAIN_PLUS_SECONDARY':
    case 'DYNAMIC_GRID':
    case 'SPORT_BROADCAST':
    default:
      return Math.max(1, Math.min(MAX_CONTROL_ROOM_CAMERAS, availableCount || 1));
  }
}

export function computeObsLayoutBoxes(
  layoutType: ObsLayoutType,
  cameraIds: string[],
  mainCameraId = '',
  canvasWidth = 1920,
  canvasHeight = 1080,
  options: ObsLayoutComputeOptions = {}
): ObsLayoutBox[] {
  const uniqueIds = Array.from(new Set(cameraIds.filter(Boolean))).slice(0, MAX_CONTROL_ROOM_CAMERAS);
  if (uniqueIds.length === 0) return [];

  if (layoutType === 'SINGLE') {
    const primary = mainCameraId && uniqueIds.includes(mainCameraId) ? mainCameraId : uniqueIds[0];
    return [
      {
        cameraId: primary,
        slotIndex: 0,
        role: 'main',
        x: 0,
        y: 0,
        width: canvasWidth,
        height: canvasHeight,
      },
    ];
  }

  if (layoutType === 'PIP') {
    const primary = mainCameraId && uniqueIds.includes(mainCameraId) ? mainCameraId : uniqueIds[0];
    const secondary = uniqueIds.find((id) => id !== primary);
    if (!secondary) {
      return [
        {
          cameraId: primary,
          slotIndex: 0,
          role: 'main',
          x: 0,
          y: 0,
          width: canvasWidth,
          height: canvasHeight,
        },
      ];
    }

    const sizeRatioMap: Record<PipSize, number> = {
      small: 0.22,
      medium: 0.28,
      large: 0.34,
    };
    const pipSize: PipSize = options.pipSize || 'medium';
    const pipPosition: PipPosition = options.pipPosition || 'bottom-right';
    const widthRatio = sizeRatioMap[pipSize] ?? 0.28;
    const insetW = Math.round(canvasWidth * widthRatio);
    const insetH = Math.round((insetW * 9) / 16);
    const marginX = Math.round(canvasWidth * 0.025); // ~48px on 1920
    const topMargin = Math.round(canvasHeight * 0.044); // ~48px on 1080
    const bottomMargin = Math.round(canvasHeight * 0.125); // ~135px clears bottom scoreboard bar

    const x = pipPosition.endsWith('right') ? canvasWidth - insetW - marginX : marginX;
    const y = pipPosition.startsWith('bottom') ? canvasHeight - insetH - bottomMargin : topMargin;

    return [
      {
        cameraId: primary,
        slotIndex: 0,
        role: 'main',
        x: 0,
        y: 0,
        width: canvasWidth,
        height: canvasHeight,
      },
      {
        cameraId: secondary,
        slotIndex: 1,
        role: 'secondary',
        x,
        y,
        width: insetW,
        height: insetH,
      },
    ];
  }

  if (layoutType === 'SPLIT_2_H' && uniqueIds.length >= 2) {
    const halfW = Math.floor(canvasWidth / 2);
    return uniqueIds.slice(0, 2).map((camId, idx) => ({
      cameraId: camId,
      slotIndex: idx,
      role: idx === 0 ? 'main' : 'secondary',
      x: idx * halfW,
      y: 0,
      width: idx === 1 ? canvasWidth - halfW : halfW,
      height: canvasHeight,
    }));
  }

  if (layoutType === 'SPLIT_2_V' && uniqueIds.length >= 2) {
    const halfH = Math.floor(canvasHeight / 2);
    return uniqueIds.slice(0, 2).map((camId, idx) => ({
      cameraId: camId,
      slotIndex: idx,
      role: idx === 0 ? 'main' : 'secondary',
      x: 0,
      y: idx * halfH,
      width: canvasWidth,
      height: idx === 1 ? canvasHeight - halfH : halfH,
    }));
  }

  if (layoutType === 'SPLIT_3' && uniqueIds.length >= 3) {
    const tripleIds = uniqueIds.slice(0, 3);
    const primary = mainCameraId && tripleIds.includes(mainCameraId) ? mainCameraId : tripleIds[0];
    const secondaries = tripleIds.filter((id) => id !== primary);
    const mainW = Math.round(canvasWidth * 0.6667);
    const sideW = canvasWidth - mainW;
    const sideH = Math.floor(canvasHeight / 2);

    return [
      {
        cameraId: primary,
        slotIndex: 0,
        role: 'main',
        x: 0,
        y: 0,
        width: mainW,
        height: canvasHeight,
      },
      {
        cameraId: secondaries[0],
        slotIndex: 1,
        role: 'secondary',
        x: mainW,
        y: 0,
        width: sideW,
        height: sideH,
      },
      {
        cameraId: secondaries[1],
        slotIndex: 2,
        role: 'secondary',
        x: mainW,
        y: sideH,
        width: sideW,
        height: canvasHeight - sideH,
      },
    ];
  }

  if (layoutType === 'GRID_4' && uniqueIds.length >= 4) {
    const w = Math.floor(canvasWidth / 2);
    const h = Math.floor(canvasHeight / 2);
    return uniqueIds.slice(0, 4).map((camId, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      return {
        cameraId: camId,
        slotIndex: idx,
        role: 'grid',
        x: col * w,
        y: row * h,
        width: col === 1 ? canvasWidth - w : w,
        height: row === 1 ? canvasHeight - h : h,
      };
    });
  }

  if (layoutType === 'GRID_5' && uniqueIds.length >= 5) {
    const five = uniqueIds.slice(0, 5);
    const topW = Math.floor(canvasWidth / 2);
    const topH = Math.floor(canvasHeight / 2);
    const botW = Math.floor(canvasWidth / 3);
    const botH = canvasHeight - topH;
    return [
      { cameraId: five[0], slotIndex: 0, role: 'main', x: 0, y: 0, width: topW, height: topH },
      { cameraId: five[1], slotIndex: 1, role: 'secondary', x: topW, y: 0, width: canvasWidth - topW, height: topH },
      { cameraId: five[2], slotIndex: 2, role: 'grid', x: 0, y: topH, width: botW, height: botH },
      { cameraId: five[3], slotIndex: 3, role: 'grid', x: botW, y: topH, width: botW, height: botH },
      { cameraId: five[4], slotIndex: 4, role: 'grid', x: botW * 2, y: topH, width: canvasWidth - botW * 2, height: botH },
    ];
  }

  if (layoutType === 'GRID_6' && uniqueIds.length >= 6) {
    const six = uniqueIds.slice(0, 6);
    const colW = Math.floor(canvasWidth / 3);
    const rowH = Math.floor(canvasHeight / 2);
    return six.map((camId, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      return {
        cameraId: camId,
        slotIndex: idx,
        role: 'grid',
        x: col * colW,
        y: row * rowH,
        width: col === 2 ? canvasWidth - colW * 2 : colW,
        height: row === 1 ? canvasHeight - rowH : rowH,
      };
    });
  }

  if (layoutType === 'GRID_8' && uniqueIds.length >= 8) {
    const eight = uniqueIds.slice(0, 8);
    const colW = Math.floor(canvasWidth / 4);
    const rowH = Math.floor(canvasHeight / 2);
    return eight.map((camId, idx) => {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      return {
        cameraId: camId,
        slotIndex: idx,
        role: 'grid',
        x: col * colW,
        y: row * rowH,
        width: col === 3 ? canvasWidth - colW * 3 : colW,
        height: row === 1 ? canvasHeight - rowH : rowH,
      };
    });
  }

  if (layoutType === 'MAIN_PLUS_SECONDARY' || (layoutType === 'SPORT_BROADCAST' && uniqueIds.length >= 2)) {
    const primary = mainCameraId && uniqueIds.includes(mainCameraId) ? mainCameraId : uniqueIds[0];
    const secondaries = uniqueIds.filter((id) => id !== primary);
    if (secondaries.length === 0) {
      return [
        {
          cameraId: primary,
          slotIndex: 0,
          role: 'main',
          x: 0,
          y: 0,
          width: canvasWidth,
          height: canvasHeight,
        },
      ];
    }

    const mainRatio = secondaries.length > 4 ? 0.62 : 0.72;
    const mainW = Math.round(canvasWidth * mainRatio);
    const sideAreaW = canvasWidth - mainW;
    const sideCols = secondaries.length > 4 ? 2 : 1;
    const sideRows = Math.ceil(secondaries.length / sideCols);
    const tileW = Math.floor(sideAreaW / sideCols);
    const tileH = Math.floor(canvasHeight / sideRows);

    const boxes: ObsLayoutBox[] = [
      {
        cameraId: primary,
        slotIndex: 0,
        role: 'main',
        x: 0,
        y: 0,
        width: mainW,
        height: canvasHeight,
      },
    ];

    secondaries.forEach((camId, idx) => {
      const col = idx % sideCols;
      const row = Math.floor(idx / sideCols);
      boxes.push({
        cameraId: camId,
        slotIndex: idx + 1,
        role: 'secondary',
        x: mainW + col * tileW,
        y: row * tileH,
        width: col === sideCols - 1 ? sideAreaW - col * tileW : tileW,
        height: row === sideRows - 1 ? canvasHeight - row * tileH : tileH,
      });
    });

    return boxes;
  }

  if (layoutType === 'SPORT_BROADCAST') {
    const primary = mainCameraId && uniqueIds.includes(mainCameraId) ? mainCameraId : uniqueIds[0];
    return [
      {
        cameraId: primary,
        slotIndex: 0,
        role: 'main',
        x: 0,
        y: 0,
        width: canvasWidth,
        height: canvasHeight,
      },
    ];
  }

  // DYNAMIC_GRID (or fallback when N cameras exceed fixed layout slots)
  const count = uniqueIds.length;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cellW = Math.floor(canvasWidth / cols);
  const cellH = Math.floor(canvasHeight / rows);

  return uniqueIds.map((camId, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    return {
      cameraId: camId,
      slotIndex: idx,
      role: 'grid',
      x: col * cellW,
      y: row * cellH,
      width: col === cols - 1 ? canvasWidth - col * cellW : cellW,
      height: row === rows - 1 ? canvasHeight - row * cellH : cellH,
    };
  });
}

function mergeAxisIntervals(
  entries: Array<{ coord: number; start: number; end: number }>
): Array<{ coord: number; start: number; end: number }> {
  const byCoord = new Map<number, Array<{ start: number; end: number }>>();
  for (const item of entries) {
    if (item.end <= item.start) continue;
    const snapped = Math.round(item.coord);
    // Group coordinates within 2px into a single axis
    let matchedKey: number | null = null;
    for (const key of byCoord.keys()) {
      if (Math.abs(key - snapped) <= 2) {
        matchedKey = key;
        break;
      }
    }
    const targetKey = matchedKey !== null ? matchedKey : snapped;
    const bucket = byCoord.get(targetKey) || [];
    bucket.push({ start: Math.round(item.start), end: Math.round(item.end) });
    byCoord.set(targetKey, bucket);
  }

  const merged: Array<{ coord: number; start: number; end: number }> = [];
  for (const [coord, intervals] of byCoord.entries()) {
    const sorted = [...intervals].sort((a, b) => a.start - b.start);
    let current = { ...sorted[0] };
    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      if (next.start <= current.end + 2) {
        current.end = Math.max(current.end, next.end);
      } else {
        merged.push({ coord, start: current.start, end: current.end });
        current = { ...next };
      }
    }
    merged.push({ coord, start: current.start, end: current.end });
  }
  return merged;
}

/**
 * Computes crisp internal split borders / separators for multi-camera OBS compositions.
 * Always returns [] when fullscreen SINGLE camera is active.
 */
export function computeObsLayoutBorderSegments(
  layoutType: ObsLayoutType,
  boxes: ObsLayoutBox[],
  canvasWidth = 1920,
  canvasHeight = 1080
): ObsSplitBorderSegment[] {
  if (layoutType === 'SINGLE' || boxes.length <= 1) {
    return [];
  }

  if (layoutType === 'PIP') {
    const secondary = boxes.find((b) => b.role === 'secondary') || boxes[1];
    if (!secondary) return [];
    return [
      {
        id: 'pip-frame',
        x: secondary.x,
        y: secondary.y,
        width: secondary.width,
        height: secondary.height,
        orientation: 'box',
      },
    ];
  }

  const rawVertical: Array<{ coord: number; start: number; end: number }> = [];
  const rawHorizontal: Array<{ coord: number; start: number; end: number }> = [];

  for (const box of boxes) {
    const left = box.x;
    const right = box.x + box.width;
    const top = box.y;
    const bottom = box.y + box.height;

    if (left > 2 && left < canvasWidth - 2) {
      rawVertical.push({ coord: left, start: top, end: bottom });
    }
    if (right > 2 && right < canvasWidth - 2) {
      rawVertical.push({ coord: right, start: top, end: bottom });
    }
    if (top > 2 && top < canvasHeight - 2) {
      rawHorizontal.push({ coord: top, start: left, end: right });
    }
    if (bottom > 2 && bottom < canvasHeight - 2) {
      rawHorizontal.push({ coord: bottom, start: left, end: right });
    }
  }

  const mergedVertical = mergeAxisIntervals(rawVertical);
  const mergedHorizontal = mergeAxisIntervals(rawHorizontal);

  const segments: ObsSplitBorderSegment[] = [];

  mergedVertical.forEach((seg, idx) => {
    segments.push({
      id: `v-${idx}-${seg.coord}`,
      x: seg.coord,
      y: seg.start,
      width: 2,
      height: seg.end - seg.start,
      orientation: 'vertical',
    });
  });

  mergedHorizontal.forEach((seg, idx) => {
    segments.push({
      id: `h-${idx}-${seg.coord}`,
      x: seg.start,
      y: seg.coord,
      width: seg.end - seg.start,
      height: 2,
      orientation: 'horizontal',
    });
  });

  return segments;
}
