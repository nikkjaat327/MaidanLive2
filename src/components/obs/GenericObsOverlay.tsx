import { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../../types/index.ts';
import { deriveShortTeamName } from '../../utils/matchResultValidation.ts';
import { resolveMatchStatus } from '../../utils/matchStatus.ts';
import type { ObsThemeTokens } from './obsTheme.ts';
import { ObsBrandMark, ObsLiveStatusPill, ObsTeamBadge } from './ObsBrandMark.tsx';

interface GenericObsOverlayProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  config: BroadcastOverlayConfig;
  theme: ObsThemeTokens;
}

export function GenericObsOverlay({ stream, score, config, theme }: GenericObsOverlayProps) {
  const nameA = stream.teamAName || 'Team A';
  const nameB = stream.teamBName || 'Team B';
  const shortA = deriveShortTeamName(nameA, 'TMA');
  const shortB = deriveShortTeamName(nameB, 'TMB');

  const scoreA = score?.teamAScore ?? 0;
  const scoreB = score?.teamBScore ?? 0;

  const prevKey = useRef(`${scoreA}-${scoreB}`);
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    const next = `${scoreA}-${scoreB}`;
    if (prevKey.current !== next) {
      prevKey.current = next;
      setPulseKey((k) => k + 1);
    }
  }, [scoreA, scoreB]);

  const stdStatus = resolveMatchStatus(stream, score);
  const resultDeclared = Boolean(score?.resultStatus && score.resultStatus !== 'NOT_DECLARED');
  const sportLabel = score?.sportType || stream.gameName || 'MATCH';

  return (
    <div
      style={{ background: theme.barBg, borderColor: theme.barBorder, color: theme.primaryText }}
      className="inline-flex flex-col rounded-lg border shadow-[0_18px_46px_rgba(0,0,0,0.65)] overflow-hidden backdrop-blur-md max-w-[780px]"
    >
      <div className="flex items-stretch">
        {config.mode !== 'score_only' && (
          <ObsBrandMark theme={theme} compact={config.mode === 'compact'} />
        )}
        <div className="flex items-center gap-3 px-3.5 py-2">
          <div className="flex items-center gap-2">
            <ObsTeamBadge
              logoUrl={stream.teamALogo}
              shortName={shortA}
              accentColor={config.teamAColor}
              size="sm"
              showLogo={config.showTeamLogos}
            />
            <span className="font-display font-extrabold text-sm uppercase tracking-wide">
              {config.mode === 'full' ? nameA : shortA}
            </span>
          </div>

          <div
            key={pulseKey}
            style={{ background: theme.scorePillBg, color: theme.scorePillText }}
            className="obs-score-pop flex items-center gap-2 px-3 py-1 rounded-md font-mono tabular-nums font-extrabold text-xl leading-none"
          >
            <span>{scoreA}</span>
            <span className="opacity-50 text-sm">-</span>
            <span>{scoreB}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-display font-extrabold text-sm uppercase tracking-wide">
              {config.mode === 'full' ? nameB : shortB}
            </span>
            <ObsTeamBadge
              logoUrl={stream.teamBLogo}
              shortName={shortB}
              accentColor={config.teamBColor}
              size="sm"
              showLogo={config.showTeamLogos}
            />
          </div>

          {config.showLiveIndicator && (
            <ObsLiveStatusPill
              label={resultDeclared ? 'FINAL' : stdStatus === 'LIVE' ? 'LIVE' : stdStatus}
              isLive={stream.status === 'LIVE' && !resultDeclared}
              variant={resultDeclared ? 'final' : stdStatus === 'LIVE' ? 'live' : 'break'}
              compact={config.mode !== 'full'}
            />
          )}
        </div>
      </div>

      {config.mode === 'full' && (resultDeclared || (config.showTournamentName && stream.tournamentName) || (config.showMatchStatus && score?.matchStatus)) && (
        <div
          style={{
            background: theme.subStripBg,
            borderColor: theme.subStripBorder,
            color: theme.secondaryText,
          }}
          className="flex items-center justify-between gap-4 px-3.5 py-1.5 border-t text-[11px]"
        >
          <div className="flex items-center gap-3">
            {config.showTournamentName && stream.tournamentName && (
              <span style={{ color: theme.accentPrimary }} className="font-display font-bold uppercase tracking-wider">
                {stream.tournamentName}
              </span>
            )}
            <span style={{ color: theme.mutedText }} className="uppercase font-semibold">
              {sportLabel}
            </span>
          </div>
          {resultDeclared ? (
            <span className="inline-flex items-center gap-1 font-bold text-emerald-300 uppercase">
              <Trophy className="w-3 h-3" />
              {score?.resultDescription || score?.winnerTeamName}
            </span>
          ) : (
            config.showMatchStatus &&
            score?.matchStatus && (
              <span className="font-semibold uppercase">{score.matchStatus}</span>
            )
          )}
        </div>
      )}
    </div>
  );
}
