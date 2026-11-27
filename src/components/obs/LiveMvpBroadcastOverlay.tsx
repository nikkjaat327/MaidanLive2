import { useMemo } from 'react';
import { Award } from 'lucide-react';
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../../types/index.ts';
import { computeLiveMvpCandidates } from '../../utils/liveMvp.ts';
import type { OverlayPosition } from '../../utils/overlayConfig.ts';

interface LiveMvpBroadcastOverlayProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  config: BroadcastOverlayConfig;
  variant?: 'canvas' | 'responsive';
  zIndex?: number;
  suppress?: boolean;
}

function getPositionClass(pos: OverlayPosition, isCanvas: boolean): string {
  const pad = isCanvas ? 'm-7' : 'm-2.5 sm:m-3.5';
  switch (pos) {
    case 'top-left':
      return `top-0 left-0 ${pad}`;
    case 'top-center':
      return `top-0 left-1/2 -translate-x-1/2 ${isCanvas ? 'mt-7' : 'mt-2.5 sm:mt-3.5'}`;
    case 'bottom-left':
      return `bottom-0 left-0 ${isCanvas ? 'mb-24 ml-7' : 'mb-14 ml-2.5 sm:ml-3.5'}`;
    case 'bottom-center':
      return `bottom-0 left-1/2 -translate-x-1/2 ${isCanvas ? 'mb-24' : 'mb-14'}`;
    case 'bottom-right':
      return `bottom-0 right-0 ${isCanvas ? 'mb-24 mr-7' : 'mb-14 mr-2.5 sm:mr-3.5'}`;
    case 'top-right':
    default:
      return `top-0 right-0 ${pad}`;
  }
}

export function LiveMvpBroadcastOverlay({
  stream,
  score,
  config,
  variant = 'canvas',
  zIndex = 27,
  suppress = false,
}: LiveMvpBroadcastOverlayProps) {
  const isCanvas = variant === 'canvas';

  const liveMatchStat = useMemo(() => {
    if (!config.liveMvpVisible || !config.liveMvpPlayerName) return null;
    const ranked = computeLiveMvpCandidates({
      sportType: score?.sportType || stream.gameName,
      teamAName: stream.teamAName,
      teamBName: stream.teamBName,
      score,
    });
    const clean = config.liveMvpPlayerName.trim().toLowerCase();
    return ranked.candidates.find((c) => c.name.trim().toLowerCase() === clean) || null;
  }, [
    config.liveMvpVisible,
    config.liveMvpPlayerName,
    score,
    stream.gameName,
    stream.teamAName,
    stream.teamBName,
  ]);

  if (suppress || !config.liveMvpVisible || !config.liveMvpPlayerName) {
    return null;
  }

  const statLine = liveMatchStat?.statLine || config.liveMvpStatsLine;
  const teamLabel = liveMatchStat?.teamName || config.liveMvpTeamName;
  const badgeText = config.liveMvpLabel || 'LIVE MVP';
  const posClass = getPositionClass(config.liveMvpPosition || 'top-right', isCanvas);

  return (
    <div
      data-live-mvp-overlay="true"
      style={{ zIndex }}
      className={`pointer-events-none absolute ${posClass} ${
        isCanvas ? 'max-w-[460px]' : 'max-w-[78%] sm:max-w-[340px]'
      }`}
    >
      <div
        className={`flex items-center gap-2.5 rounded-xl border border-amber-400/50 bg-slate-950/92 text-white shadow-xl backdrop-blur-md ${
          isCanvas ? 'px-4 py-2.5' : 'px-2.5 py-1.5 sm:px-3 sm:py-2'
        }`}
      >
        <div
          className={`rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0 ${
            isCanvas ? 'w-10 h-10' : 'w-7 h-7 sm:w-8 sm:h-8'
          }`}
        >
          <Award className={`${isCanvas ? 'w-5 h-5' : 'w-4 h-4'} text-amber-300`} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
            <span>{badgeText}</span>
            {teamLabel && (
              <>
                <span aria-hidden="true" className="text-slate-500">
                  ·
                </span>
                <span className="text-slate-300 truncate">{teamLabel}</span>
              </>
            )}
          </div>
          <p
            className={`font-display font-extrabold text-white truncate ${
              isCanvas ? 'text-lg leading-tight' : 'text-xs sm:text-sm leading-tight'
            }`}
          >
            {config.liveMvpPlayerName}
          </p>
          {statLine && (
            <p
              className={`font-mono tabular-nums text-slate-300 truncate ${
                isCanvas ? 'text-xs mt-0.5' : 'text-[10px] sm:text-[11px]'
              }`}
            >
              {statLine}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
