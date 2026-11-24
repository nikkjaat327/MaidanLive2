import { AnimatePresence, motion } from 'motion/react';
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../../types/index.ts';
import { computeOverlayMetrics, type OverlayPosition } from '../../utils/overlayConfig.ts';
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
  const sport = score?.sportType || stream.gameName || 'Other';
  const styleId = config.style || 'broadcast_classic';
  const isFullWidthBar =
    (config.mode === 'full' || config.mode === 'compact') &&
    styleId !== 'minimal_corner_bug';

  const metrics = computeOverlayMetrics(config, isPortrait);
  const slideOffsetY = position.startsWith('top') ? -14 : 14;
  const isPortraitEdgeToEdge = isPortrait && isFullWidthBar && metrics.barWidthPct >= 98;
  const containerPaddingClass = isPortraitEdgeToEdge
    ? 'px-0 py-3'
    : isPortrait
      ? 'p-3'
      : 'px-4 py-7';

  const wrapperWidthClass = isFullWidthBar ? 'w-full' : 'w-auto max-w-[95%]';
  const wrapperStyle = isFullWidthBar
    ? { width: `${metrics.barWidthPct}%`, maxWidth: `${metrics.barWidthPct}%` }
    : undefined;

  return (
    <div
      className={`w-full h-full flex ${containerPaddingClass} pointer-events-none select-none ${POSITION_CLASSES[position]} ${className}`}
    >
      <AnimatePresence mode="wait">
        {isVisible && (
          <motion.div
            key={`${sport}-${styleId}-${config.mode}-${position}-${isPortrait ? 'portrait' : 'landscape'}`}
            initial={{ opacity: 0, y: slideOffsetY }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: slideOffsetY }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
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
      </AnimatePresence>
    </div>
  );
}
