import { useMemo } from 'react';
import {
  computeObsLayoutBorderSegments,
  type ObsLayoutBox,
  type ObsLayoutType,
} from '../../utils/obsLayoutGeometry.ts';

interface MultiCamSplitBordersProps {
  layoutType: ObsLayoutType;
  boxes: ObsLayoutBox[];
  canvasWidth?: number;
  canvasHeight?: number;
  lineThicknessPx?: number;
  zIndex?: number;
}

const NEON_SEPARATOR_GLOW =
  '0 0 6px rgba(236, 72, 153, 0.52), 0 0 12px rgba(139, 92, 246, 0.42), 0 0 18px rgba(59, 130, 246, 0.25)';

/**
 * Renders crisp 2px #FFFFFF broadcast separators with restrained MaidanLive neon accent glow
 * across every multi-camera layout (2, 3, 4, 5, 6, 8, PiP, Dynamic Grid), and renders nothing
 * in fullscreen single-camera mode.
 */
export function MultiCamSplitBorders({
  layoutType,
  boxes,
  canvasWidth = 1920,
  canvasHeight = 1080,
  lineThicknessPx = 2,
  zIndex = 12,
}: MultiCamSplitBordersProps) {
  const segments = useMemo(
    () => computeObsLayoutBorderSegments(layoutType, boxes, canvasWidth, canvasHeight),
    [layoutType, boxes, canvasWidth, canvasHeight]
  );

  if (segments.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="multicam-split-borders"
      style={{ zIndex }}
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {segments.map((seg) => {
        if (seg.orientation === 'box') {
          return (
            <div
              key={seg.id}
              style={{
                left: `${(seg.x / canvasWidth) * 100}%`,
                top: `${(seg.y / canvasHeight) * 100}%`,
                width: `${(seg.width / canvasWidth) * 100}%`,
                height: `${(seg.height / canvasHeight) * 100}%`,
                borderWidth: lineThicknessPx,
                borderStyle: 'solid',
                borderColor: '#FFFFFF',
                boxShadow: `${NEON_SEPARATOR_GLOW}, inset 0 0 6px rgba(236, 72, 153, 0.28)`,
              }}
              className="absolute box-border rounded-[2px]"
            />
          );
        }

        if (seg.orientation === 'vertical') {
          return (
            <div
              key={seg.id}
              style={{
                left: `${(seg.x / canvasWidth) * 100}%`,
                top: `${(seg.y / canvasHeight) * 100}%`,
                width: lineThicknessPx,
                height: `${(seg.height / canvasHeight) * 100}%`,
                transform: 'translateX(-50%)',
                backgroundColor: '#FFFFFF',
                boxShadow: NEON_SEPARATOR_GLOW,
              }}
              className="absolute"
            />
          );
        }

        return (
          <div
            key={seg.id}
            style={{
              left: `${(seg.x / canvasWidth) * 100}%`,
              top: `${(seg.y / canvasHeight) * 100}%`,
              width: `${(seg.width / canvasWidth) * 100}%`,
              height: lineThicknessPx,
              transform: 'translateY(-50%)',
              backgroundColor: '#FFFFFF',
              boxShadow: NEON_SEPARATOR_GLOW,
            }}
            className="absolute"
          />
        );
      })}
    </div>
  );
}
