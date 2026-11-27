import { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import { LiveScoreData, LiveStreamData } from '../../../types/index.ts';
import { CricketBroadcastBar } from './CricketBroadcastBar.tsx';
import { KabaddiBroadcastBar } from './KabaddiBroadcastBar.tsx';
import { VolleyballBroadcastBar } from './VolleyballBroadcastBar.tsx';
import { FootballBroadcastBar } from './FootballBroadcastBar.tsx';
import { GenericBroadcastBar } from './GenericBroadcastBar.tsx';
import { BroadcastScoreboard } from '../../broadcast/BroadcastScoreboard.tsx';
import { normalizeBroadcast } from '../../../utils/normalizeBroadcast.ts';
import { normalizeOverlayConfig } from '../../../utils/overlayConfig.ts';

interface BroadcastScoreboardOverlayProps {
  stream: LiveStreamData;
  score: LiveScoreData;
  compact?: boolean;
  layoutMode?: 'portrait' | 'landscape';
}

export function BroadcastScoreboardOverlay({
  stream,
  score,
  compact = false,
  layoutMode = 'landscape',
}: BroadcastScoreboardOverlayProps) {
  const resultDeclared = Boolean(score.resultStatus && score.resultStatus !== 'NOT_DECLARED');
  const overlayCfg = useMemo(
    () => normalizeOverlayConfig(stream.overlayConfig),
    [stream.overlayConfig]
  );
  const portraitNormalized = useMemo(
    () => (layoutMode === 'portrait' ? normalizeBroadcast(stream, score) : null),
    [layoutMode, stream, score]
  );

  const renderSportBar = () => {
    if (layoutMode === 'portrait' && portraitNormalized) {
      return (
        <BroadcastScoreboard
          broadcast={portraitNormalized}
          compact
          layoutMode="portrait"
          className="w-full max-w-[360px]"
        />
      );
    }

    switch (score.sportType) {
      case 'Cricket':
        return <CricketBroadcastBar stream={stream} score={score} compact={compact} />;
      case 'Kabaddi':
        return (
          <KabaddiBroadcastBar
            stream={stream}
            score={score}
            compact={compact}
            isPortrait={false}
          />
        );
      case 'Volleyball':
        return <VolleyballBroadcastBar stream={stream} score={score} compact={compact} />;
      case 'Football':
        return <FootballBroadcastBar stream={stream} score={score} />;
      default:
        return <GenericBroadcastBar stream={stream} score={score} />;
    }
  };

  return (
    <div
      data-overlay-mode={layoutMode}
      className="flex flex-col items-start gap-1 max-w-full"
    >
      {renderSportBar()}
      {resultDeclared && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] sm:text-[11px] font-bold tracking-wide shadow-md max-w-full">
          <Trophy className="w-3 h-3 shrink-0" />
          <span className="uppercase shrink-0">
            {score.resultStatus === 'DECLARED'
              ? 'WINNER'
              : score.resultStatus === 'DRAW'
                ? 'DRAW'
                : score.resultStatus === 'TIE'
                  ? 'TIE'
                  : 'NO RESULT'}
          </span>
          <span className="truncate font-semibold">
            {score.resultDescription || score.winnerTeamName}
          </span>
        </div>
      )}
      {overlayCfg.liveMvpVisible && overlayCfg.liveMvpPlayerName && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-slate-950/90 border border-amber-400/50 text-white text-[10px] sm:text-[11px] font-semibold shadow-md max-w-full">
          <AwardIcon />
          <span className="uppercase text-amber-300 font-bold shrink-0">
            {overlayCfg.liveMvpLabel || 'LIVE MVP'}
          </span>
          <span className="truncate font-bold">{overlayCfg.liveMvpPlayerName}</span>
          {overlayCfg.liveMvpStatsLine && (
            <span className="truncate font-mono text-slate-300">
              · {overlayCfg.liveMvpStatsLine}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function AwardIcon() {
  return <Trophy className="w-3 h-3 text-amber-400 shrink-0" />;
}
