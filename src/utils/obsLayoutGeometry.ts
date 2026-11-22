export type ObsLayoutType =
  | 'SINGLE'
  | 'SPLIT_2_H'
  | 'SPLIT_2_V'
  | 'SPLIT_3'
  | 'GRID_4'
  | 'PIP'
  | 'MAIN_PLUS_SECONDARY'
  | 'DYNAMIC_GRID'
  | 'SPORT_BROADCAST';

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
    label: '2-Camera Side Split',
    shortLabel: '2 Split (H)',
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
    label: '3-Camera Broadcast Split',
    shortLabel: '3 Split',
    minCameras: 3,
    recommendedCameras: '3 cameras',
    description: 'Main left feed (2/3 width) with 2 stacked secondary feeds on the right.',
    defaultSceneName: 'SPLIT 3 VIEW',
  },
  GRID_4: {
    label: '4-Camera Quad Grid (2×2)',
    shortLabel: '4 Quad Grid',
    minCameras: 4,
    recommendedCameras: '4 cameras',
    description: 'Symmetric 2×2 quad wall across the 1920×1080 broadcast frame.',
    defaultSceneName: 'GRID 4 QUAD',
  },
  PIP: {
    label: 'Picture-in-Picture (PIP)',
    shortLabel: 'PIP Inset',
    minCameras: 2,
    recommendedCameras: '2 cameras',
    description: 'Fullscreen primary camera with an adjustable corner inset camera.',
    defaultSceneName: 'PIP OVERLAY',
  },
  MAIN_PLUS_SECONDARY: {
    label: 'Main Camera + Secondary Strip',
    shortLabel: 'Main + N',
    minCameras: 2,
    recommendedCameras: '2–8+ cameras',
    description: 'Large primary feed with all selected secondary cameras tiled along the right rail.',
    defaultSceneName: 'MAIN + SECONDARY',
  },
  DYNAMIC_GRID: {
    label: 'Dynamic Multi-Camera Grid',
    shortLabel: 'N-Cam Grid',
    minCameras: 1,
    recommendedCameras: 'Any N cameras',
    description: 'Automatically balances rows and columns for 2, 3, 4, 5, 6, 8+ cameras.',
    defaultSceneName: 'MULTI CAM GRID',
  },
  SPORT_BROADCAST: {
    label: 'Sport Broadcast + Scoreboard',
    shortLabel: 'Sport Broadcast',
    minCameras: 1,
    recommendedCameras: '1+ cameras',
    description: 'Live sport production scene combining camera feed(s) with MaidanLive scoreboard.',
    defaultSceneName: 'SPORT BROADCAST',
  },
};

export function computeObsLayoutBoxes(
  layoutType: ObsLayoutType,
  cameraIds: string[],
  mainCameraId = '',
  canvasWidth = 1920,
  canvasHeight = 1080,
  options: ObsLayoutComputeOptions = {}
): ObsLayoutBox[] {
  const uniqueIds = Array.from(new Set(cameraIds.filter(Boolean)));
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
      width: halfW,
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
      height: halfH,
    }));
  }

  if (layoutType === 'SPLIT_3' && uniqueIds.length === 3) {
    const primary = mainCameraId && uniqueIds.includes(mainCameraId) ? mainCameraId : uniqueIds[0];
    const secondaries = uniqueIds.filter((id) => id !== primary);
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

  if (layoutType === 'GRID_4' && uniqueIds.length === 4) {
    const w = Math.floor(canvasWidth / 2);
    const h = Math.floor(canvasHeight / 2);
    return uniqueIds.map((camId, idx) => ({
      cameraId: camId,
      slotIndex: idx,
      role: 'grid',
      x: (idx % 2) * w,
      y: Math.floor(idx / 2) * h,
      width: w,
      height: h,
    }));
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
        width: tileW,
        height: tileH,
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
      width: cellW,
      height: cellH,
    };
  });
}
