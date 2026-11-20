import { AnimatePresence, motion } from 'motion/react';
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../../types/index.ts';
import type { OverlayPosition, OverlayScale } from '../../utils/overlayConfig.ts';
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

const TRANSFORM_ORIGINS: Record<OverlayPosition, string> = {
  'top-left': 'top left',
  'top-center': 'top center',
  'top-right': 'top right',
  'bottom-left': 'bottom left',
  'bottom-center': 'bottom center',
  'bottom-right': 'bottom right',
};

const SCALE_FACTORS: Record<OverlayScale, number> = {
  small: 0.85,
  medium: 1.05,
  large: 1.24,
};

export function HotstarBroadcastOverlay({
  stream,
  score,
  config,
  className = '',
}: HotstarBroadcastOverlayProps) {
  const isVisible = Boolean(config.visible) && config.mode !== 'hidden';
  const position = config.position || 'bottom-left';
  const scaleFactor = SCALE_FACTORS[config.scale] || 1.05;
  const theme = resolveObsTheme(config);
  const sport = score?.sportType || stream.gameName || 'Other';

  const renderSportGraphic = () => {
    switch (sport) {
      case 'Cricket':
        return <CricketObsOverlay stream={stream} score={score} config={config} theme={theme} />;
      case 'Football':
        return <FootballObsOverlay stream={stream} score={score} config={config} theme={theme} />;
      case 'Kabaddi':
        return <KabaddiObsOverlay stream={stream} score={score} config={config} theme={theme} />;
      case 'Volleyball':
        return <VolleyballObsOverlay stream={stream} score={score} config={config} theme={theme} />;
      default:
        return <GenericObsOverlay stream={stream} score={score} config={config} theme={theme} />;
    }
  };

  const slideOffsetY = position.startsWith('top') ? -14 : 14;

  return (
    <div
      className={`w-full h-full flex p-9 pointer-events-none select-none ${POSITION_CLASSES[position]} ${className}`}
    >
      <AnimatePresence mode="wait">
        {isVisible && (
          <motion.div
            key={`${sport}-${config.mode}-${position}`}
            initial={{ opacity: 0, y: slideOffsetY, scale: scaleFactor * 0.96 }}
            animate={{ opacity: 1, y: 0, scale: scaleFactor }}
            exit={{ opacity: 0, y: slideOffsetY, scale: scaleFactor * 0.96 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: TRANSFORM_ORIGINS[position] }}
            className="pointer-events-auto"
          >
            {renderSportGraphic()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
