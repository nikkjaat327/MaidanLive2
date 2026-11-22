import { AnimatePresence, motion } from 'motion/react';
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../../types/index.ts';
import type { OverlayPosition } from '../../utils/overlayConfig.ts';
import { resolveObsTheme } from './obsTheme.ts';
import { CricketObsOverlay } from './CricketObsOverlay.tsx';
import { FootballObsOverlay } from './FootballObsOverlay.tsx';
import { KabaddiObsOverlay } from './KabaddiObsOverlay.tsx';
import { VolleyballObsOverlay } from './VolleyballObsOverlay.tsx';
import { GenericObsOverlay } from './GenericObsOverlay.tsx';

interface HotstarBroadcastOverlayProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  config: BroadcastOverlayConfig;
  isPortrait?: boolean;
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
  className = '',
}: HotstarBroadcastOverlayProps) {
  const isVisible = Boolean(config.visible) && config.mode !== 'hidden';
  const position = config.position || 'bottom-left';
  const theme = resolveObsTheme(config);
  const sport = score?.sportType || stream.gameName || 'Other';
  const isFullWidthBar = config.mode === 'full' || config.mode === 'compact';

  const renderSportGraphic = () => {
    switch (sport) {
      case 'Cricket':
        return (
          <CricketObsOverlay
            stream={stream}
            score={score}
            config={config}
            theme={theme}
            isPortrait={isPortrait}
          />
        );
      case 'Football':
        return (
          <FootballObsOverlay
            stream={stream}
            score={score}
            config={config}
            theme={theme}
            isPortrait={isPortrait}
          />
        );
      case 'Kabaddi':
        return (
          <KabaddiObsOverlay
            stream={stream}
            score={score}
            config={config}
            theme={theme}
            isPortrait={isPortrait}
          />
        );
      case 'Volleyball':
        return (
          <VolleyballObsOverlay
            stream={stream}
            score={score}
            config={config}
            theme={theme}
            isPortrait={isPortrait}
          />
        );
      default:
        return (
          <GenericObsOverlay
            stream={stream}
            score={score}
            config={config}
            theme={theme}
            isPortrait={isPortrait}
          />
        );
    }
  };

  const slideOffsetY = position.startsWith('top') ? -14 : 14;
  const containerPaddingClass = isPortrait
    ? isFullWidthBar
      ? 'px-0 py-3'
      : 'p-3'
    : 'px-4 py-7';

  const wrapperWidthClass = isFullWidthBar
    ? isPortrait
      ? 'w-full max-w-full'
      : 'w-[90%] max-w-[90%]'
    : 'w-auto max-w-[92%]';

  return (
    <div
      className={`w-full h-full flex ${containerPaddingClass} pointer-events-none select-none ${POSITION_CLASSES[position]} ${className}`}
    >
      <AnimatePresence mode="wait">
        {isVisible && (
          <motion.div
            key={`${sport}-${config.mode}-${position}-${isPortrait ? 'portrait' : 'landscape'}`}
            initial={{ opacity: 0, y: slideOffsetY }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: slideOffsetY }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className={`pointer-events-auto min-w-0 ${wrapperWidthClass}`}
          >
            {renderSportGraphic()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
