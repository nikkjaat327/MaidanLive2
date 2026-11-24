export type CameraOrientationMode = 'auto' | '0' | '90' | '180' | '270';
export type CameraPreviewFit = 'contain' | 'cover' | 'fill';
export type DetectedOrientation = 'PORTRAIT' | 'LANDSCAPE' | 'SQUARE' | 'UNKNOWN';

export interface ObsSceneTransformItem {
  sceneItemId: number;
  sourceName: string;
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
  rotation: number;
  boundsType: string;
  boundsWidth: number;
  boundsHeight: number;
  positionX: number;
  positionY: number;
}

export interface DetectedFrameContentInfo {
  orientation: DetectedOrientation;
  activeWidth: number;
  activeHeight: number;
  frameWidth: number;
  frameHeight: number;
  aspectRatio: number;
}

export const VALID_ORIENTATION_MODES: readonly CameraOrientationMode[] = [
  'auto',
  '0',
  '90',
  '180',
  '270',
];

export const VALID_PREVIEW_FITS: readonly CameraPreviewFit[] = ['contain', 'cover', 'fill'];

export function normalizeOrientationMode(val: unknown): CameraOrientationMode {
  if (typeof val === 'string' && (VALID_ORIENTATION_MODES as readonly string[]).includes(val)) {
    return val as CameraOrientationMode;
  }
  return 'auto';
}

export function normalizePreviewFit(val: unknown): CameraPreviewFit {
  if (typeof val === 'string' && (VALID_PREVIEW_FITS as readonly string[]).includes(val)) {
    return val as CameraPreviewFit;
  }
  return 'contain';
}

export function parseOrientationDegrees(mode?: CameraOrientationMode | string | null): 0 | 90 | 180 | 270 {
  switch (mode) {
    case '90':
      return 90;
    case '180':
      return 180;
    case '270':
      return 270;
    case '0':
    case 'auto':
    default:
      return 0;
  }
}

export function obsBoundsTypeForFit(
  fit?: CameraPreviewFit | string | null
): 'OBS_BOUNDS_SCALE_INNER' | 'OBS_BOUNDS_SCALE_OUTER' | 'OBS_BOUNDS_STRETCH' {
  switch (fit) {
    case 'cover':
      return 'OBS_BOUNDS_SCALE_OUTER';
    case 'fill':
      return 'OBS_BOUNDS_STRETCH';
    case 'contain':
    default:
      return 'OBS_BOUNDS_SCALE_INNER';
  }
}

export interface ObsBoxTransformInput {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg?: number;
  previewFit?: CameraPreviewFit | string | null;
}

/**
 * Builds an OBS WebSocket v5 SetSceneItemTransform payload anchored at center (alignment = 0)
 * so 0/90/180/270 degree rotations stay centered cleanly inside the target box.
 * When rotated by 90 or 270 degrees, OBS boundsWidth/boundsHeight must be swapped
 * so the rotated source fits cleanly inside the slot bounds without squashing.
 */
export function buildObsSceneItemTransform(input: ObsBoxTransformInput) {
  const x = Number.isFinite(input.x) ? Number(input.x) : 0;
  const y = Number.isFinite(input.y) ? Number(input.y) : 0;
  const width = Math.max(64, Math.round(Number(input.width) || 1920));
  const height = Math.max(64, Math.round(Number(input.height) || 1080));
  const rawDeg = Number(input.rotationDeg) || 0;
  const normalizedDeg = (((Math.round(rawDeg / 90) * 90) % 360) + 360) % 360;
  const isQuarterTurn = normalizedDeg === 90 || normalizedDeg === 270;
  const fit = normalizePreviewFit(input.previewFit);

  return {
    positionX: Math.round(x + width / 2),
    positionY: Math.round(y + height / 2),
    alignment: 0,
    rotation: normalizedDeg,
    boundsType: obsBoundsTypeForFit(fit),
    boundsAlignment: 0,
    boundsWidth: isQuarterTurn ? height : width,
    boundsHeight: isQuarterTurn ? width : height,
    cropToBounds: fit === 'cover',
  };
}

export function classifyDimensionsOrientation(
  width?: number | null,
  height?: number | null
): DetectedOrientation {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w <= 0 || h <= 0) return 'UNKNOWN';
  const ratio = w / h;
  if (ratio < 0.92) return 'PORTRAIT';
  if (ratio > 1.08) return 'LANDSCAPE';
  return 'SQUARE';
}

/**
 * Inspects non-black active content bounding box inside an OBS screenshot <img> element.
 * Detects portrait video centered inside a 16:9 pillarboxed OBS frame without guessing.
 */
export function detectFrameActiveContentOrientation(
  imgEl: HTMLImageElement | null
): DetectedFrameContentInfo | null {
  if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) return null;
  if (typeof document === 'undefined') return null;

  try {
    const sampleW = 160;
    const sampleH = Math.max(45, Math.round((sampleW * imgEl.naturalHeight) / imgEl.naturalWidth));
    const canvas = document.createElement('canvas');
    canvas.width = sampleW;
    canvas.height = sampleH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(imgEl, 0, 0, sampleW, sampleH);
    const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

    const threshold = 24;
    let minCol = sampleW;
    let maxCol = -1;
    let minRow = sampleH;
    let maxRow = -1;

    // A column/row counts as non-black if at least 12% of its pixels exceed dark threshold
    const minColPixels = Math.max(2, Math.floor(sampleH * 0.12));
    for (let x = 0; x < sampleW; x += 1) {
      let lit = 0;
      for (let y = 0; y < sampleH; y += 1) {
        const idx = (y * sampleW + x) * 4;
        if (data[idx] + data[idx + 1] + data[idx + 2] > threshold) {
          lit += 1;
        }
      }
      if (lit >= minColPixels) {
        if (x < minCol) minCol = x;
        if (x > maxCol) maxCol = x;
      }
    }

    const minRowPixels = Math.max(2, Math.floor(sampleW * 0.08));
    for (let y = 0; y < sampleH; y += 1) {
      let lit = 0;
      for (let x = 0; x < sampleW; x += 1) {
        const idx = (y * sampleW + x) * 4;
        if (data[idx] + data[idx + 1] + data[idx + 2] > threshold) {
          lit += 1;
        }
      }
      if (lit >= minRowPixels) {
        if (y < minRow) minRow = y;
        if (y > maxRow) maxRow = y;
      }
    }

    if (maxCol <= minCol || maxRow <= minRow) {
      return null;
    }

    const activeSampleW = maxCol - minCol + 1;
    const activeSampleH = maxRow - minRow + 1;
    const activeWidth = Math.round((activeSampleW / sampleW) * imgEl.naturalWidth);
    const activeHeight = Math.round((activeSampleH / sampleH) * imgEl.naturalHeight);
    const aspectRatio = activeWidth / Math.max(1, activeHeight);

    return {
      orientation: classifyDimensionsOrientation(activeWidth, activeHeight),
      activeWidth,
      activeHeight,
      frameWidth: imgEl.naturalWidth,
      frameHeight: imgEl.naturalHeight,
      aspectRatio,
    };
  } catch {
    return null;
  }
}

export interface CameraOrientationResolution {
  orientation: DetectedOrientation;
  dimensionText: string;
  sourceLabel: string;
  isPortraitFeed: boolean;
}

export function resolveCameraOrientationSummary(input: {
  telemetry?: {
    videoWidth?: number | null;
    videoHeight?: number | null;
    deviceOrientation?: string;
    viewportWidth?: number | null;
    viewportHeight?: number | null;
    resolutionActual?: string;
  } | null;
  obsTransform?: ObsSceneTransformItem | null;
  frameContent?: DetectedFrameContentInfo | null;
}): CameraOrientationResolution {
  const { telemetry, obsTransform, frameContent } = input;

  // 1. Live OBS source natural dimensions (authoritative when connected)
  if (obsTransform && obsTransform.sourceWidth > 0 && obsTransform.sourceHeight > 0) {
    const rot = Math.abs(Math.round(obsTransform.rotation || 0)) % 180;
    const effW = rot === 90 ? obsTransform.sourceHeight : obsTransform.sourceWidth;
    const effH = rot === 90 ? obsTransform.sourceWidth : obsTransform.sourceHeight;
    // If OBS browser source itself is 1920x1080 but inner active pixels are portrait, surface frame content orientation!
    if (frameContent && frameContent.orientation === 'PORTRAIT' && effW > effH) {
      return {
        orientation: 'PORTRAIT',
        dimensionText: `${frameContent.activeWidth}×${frameContent.activeHeight} in ${effW}×${effH}`,
        sourceLabel: 'OBS Frame Content',
        isPortraitFeed: true,
      };
    }
    const ori = classifyDimensionsOrientation(effW, effH);
    return {
      orientation: ori,
      dimensionText: `${effW}×${effH}`,
      sourceLabel: 'OBS Source',
      isPortraitFeed: ori === 'PORTRAIT',
    };
  }

  // 2. Actual video track dimensions reported by camera companion / WebRTC
  if (telemetry?.videoWidth && telemetry?.videoHeight) {
    const ori = classifyDimensionsOrientation(telemetry.videoWidth, telemetry.videoHeight);
    return {
      orientation: ori,
      dimensionText: `${telemetry.videoWidth}×${telemetry.videoHeight}`,
      sourceLabel: 'Video Track',
      isPortraitFeed: ori === 'PORTRAIT',
    };
  }

  // 3. Pixel-scanned active aspect inside OBS screenshot frame
  if (frameContent && frameContent.orientation !== 'UNKNOWN') {
    return {
      orientation: frameContent.orientation,
      dimensionText: `${frameContent.activeWidth}×${frameContent.activeHeight}`,
      sourceLabel: 'Frame Scan',
      isPortraitFeed: frameContent.orientation === 'PORTRAIT',
    };
  }

  // 4. Mobile companion screen orientation / viewport telemetry
  if (telemetry?.deviceOrientation) {
    const upper = telemetry.deviceOrientation.toUpperCase();
    const ori: DetectedOrientation = upper.includes('PORTRAIT')
      ? 'PORTRAIT'
      : upper.includes('LANDSCAPE')
        ? 'LANDSCAPE'
        : classifyDimensionsOrientation(telemetry.viewportWidth, telemetry.viewportHeight);
    const dims =
      telemetry.viewportWidth && telemetry.viewportHeight
        ? `${telemetry.viewportWidth}×${telemetry.viewportHeight}`
        : telemetry.resolutionActual || '';
    return {
      orientation: ori,
      dimensionText: dims,
      sourceLabel: 'Device Sensor',
      isPortraitFeed: ori === 'PORTRAIT',
    };
  }

  if (telemetry?.resolutionActual) {
    const parts = telemetry.resolutionActual.split('x').map(Number);
    const ori =
      parts.length === 2 ? classifyDimensionsOrientation(parts[0], parts[1]) : 'UNKNOWN';
    return {
      orientation: ori,
      dimensionText: telemetry.resolutionActual,
      sourceLabel: 'Profile',
      isPortraitFeed: ori === 'PORTRAIT',
    };
  }

  return {
    orientation: 'UNKNOWN',
    dimensionText: '',
    sourceLabel: '',
    isPortraitFeed: false,
  };
}

/**
 * Computes safe CSS object-fit + rotation transform for preview cards/program views.
 * Note: For 90°/270° turns inside a 16:9 slot, swaps width/height around center or
 * applies aspect-matched scale so video never distorts or overflows container bounds.
 */
export function getPreviewMediaStyles(options: {
  rotationDeg: 0 | 90 | 180 | 270;
  previewFit: CameraPreviewFit;
  isPortraitContent?: boolean;
  contentAspectRatio?: number;
  skipRotation?: boolean;
}): {
  objectClass: string;
  transform: string;
  needsRotatedContainerSwap: boolean;
} {
  const deg = options.skipRotation ? 0 : options.rotationDeg;
  const isQuarter = deg === 90 || deg === 270;

  let objectClass = 'object-contain';
  if (options.previewFit === 'cover') objectClass = 'object-cover';
  else if (options.previewFit === 'fill') objectClass = 'object-fill';

  if (deg === 0) {
    return {
      objectClass,
      transform: 'none',
      needsRotatedContainerSwap: false,
    };
  }

  if (deg === 180) {
    return {
      objectClass,
      transform: 'rotate(180deg)',
      needsRotatedContainerSwap: false,
    };
  }

  const canvasRatio = 16 / 9;
  const sourceRatio =
    options.contentAspectRatio && options.contentAspectRatio > 0
      ? options.contentAspectRatio
      : options.isPortraitContent
        ? 9 / 16
        : 16 / 9;

  const rawScale =
    options.previewFit === 'cover'
      ? Math.max(canvasRatio, 1 / sourceRatio)
      : Math.min(canvasRatio, 1 / sourceRatio);
  const scaleFactor = Number(Math.max(0.4, Math.min(2.4, rawScale)).toFixed(4));

  return {
    objectClass,
    transform: `rotate(${deg}deg) scale(${scaleFactor})`,
    needsRotatedContainerSwap: isQuarter,
  };
}

export function resolveCameraLiveWebUrl(cam?: {
  sourceType?: string;
  obsBrowserSourceUrl?: string;
  connectionUrl?: string;
} | null): string {
  if (!cam) return '';
  const candidates = [cam.obsBrowserSourceUrl, cam.connectionUrl]
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter(Boolean);

  for (const rawUrl of candidates) {
    // Skip raw media protocols that browsers cannot iframe directly
    if (/^(rtsp|rtmp|srt|udp|tcp):\/\//i.test(rawUrl)) continue;
    try {
      const parsed = new URL(rawUrl, typeof window !== 'undefined' ? window.location.origin : 'https://maidanlive.local');
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      if (parsed.hostname.includes('vdo.ninja') || parsed.searchParams.has('view')) {
        // Skip push-only camera links; only embed viewer/browser-source links
        if (parsed.searchParams.has('push') && !parsed.searchParams.has('view')) {
          continue;
        }
        parsed.searchParams.delete('scene');
        if (!parsed.searchParams.has('solo')) {
          parsed.searchParams.set('solo', '1');
        }
        parsed.searchParams.set('muted', '1');
        parsed.searchParams.set('autoplay', '1');
        parsed.searchParams.set('noaudio', '1');
      }
      return parsed.toString();
    } catch {
      continue;
    }
  }
  return '';
}

