import { motion } from 'motion/react';
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../../types/index.ts';
import {
  DEFAULT_OBS_BOX,
  clampScoreboardGeometryBox,
  computeOverlayMetrics,
  type OverlayPosition,
} from '../../utils/overlayConfig.ts';
import { resolveObsTheme } from './obsTheme.ts';
import { ScoreboardStyleRenderer } from './ScoreboardStyleRenderer.tsx';

interface HotstarBroadcastOverlayProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  config: BroadcastOverlayConfig;
  isPortrait?: boolean;
  serverClockOffsetMs?: number;
  className?: string;
}

const POSITION_CLASSES: Record<OverlayPosition, string> = {
  'top-left': 'items-start justify-start',
  'top-center': 'items-start justify-center',
  'top-right': 'items-start justify-end',
  'bottom-left': 'items-end justify-start',
  'bottom-center': 'items-end justify-center',
  'bottom-right': 'items-end justify-end',
};

export function HotstarBroadcastOverlay({
  stream,
  score,
  config,
  isPortrait = false,
  serverClockOffsetMs = 0,
  className = '',
}: HotstarBroadcastOverlayProps) {
  const isVisible = Boolean(config.visible) && config.mode !== 'hidden';
  const position = config.position || 'bottom-center';
  const theme = resolveObsTheme(config);
  const styleId = config.style || 'broadcast_classic';
  const isFullWidthBar =
    (config.mode === 'full' || config.mode === 'compact') &&
    styleId !== 'minimal_corner_bug';

  const metrics = computeOverlayMetrics(config, isPortrait);
  const obsBox = config.obsBox?.enabled
    ? clampScoreboardGeometryBox(config.obsBox, DEFAULT_OBS_BOX)
    : null;
  const slideOffsetY = position.startsWith('top') ? -14 : 14;
  const isPortraitEdgeToEdge = isPortrait && isFullWidthBar && metrics.barWidthPct >= 98;
  const containerPaddingClass = isPortraitEdgeToEdge
    ? 'px-0 py-3'
    : isPortrait
      ? 'p-3'
      : 'px-4 py-7';

  const wrapperWidthClass = obsBox
    ? 'w-full'
    : isFullWidthBar
      ? 'w-full'
      : 'w-auto max-w-[95%]';

  const wrapperStyle: React.CSSProperties | undefined = obsBox
    ? {
        position: 'absolute',
        left: `${obsBox.xPct}%`,
        top: `${obsBox.yPct}%`,
        width: `${obsBox.widthPct}%`,
        maxWidth: `${obsBox.widthPct}%`,
        ...(obsBox.heightPx > 0 ? { height: `${obsBox.heightPx}px`, overflow: 'hidden' } : {}),
        ...(obsBox.scale !== 1
          ? { transform: `scale(${obsBox.scale})`, transformOrigin: 'top left' }
          : {}),
      }
    : isFullWidthBar
      ? { width: `${metrics.barWidthPct}%`, maxWidth: `${metrics.barWidthPct}%` }
      : undefined;

  return (
    <div
      className={`relative w-full h-full pointer-events-none select-none ${
        obsBox ? '' : `flex ${containerPaddingClass} ${POSITION_CLASSES[position]}`
      } ${className}`}
    >
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: slideOffsetY }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          style={wrapperStyle}
          className={`pointer-events-auto min-w-0 transition-[width,max-width] duration-200 ease-out ${wrapperWidthClass}`}
        >
          <ScoreboardStyleRenderer
            stream={stream}
            score={score}
            config={config}
            theme={theme}
            isPortrait={isPortrait}
            serverClockOffsetMs={serverClockOffsetMs}
          />
        </motion.div>
      )}
    </div>
  );
}
